import {
  CloseFullscreenRounded,
  ContentPasteRounded,
  FormatPaintRounded,
  OpenInFullRounded,
  RestartAltRounded,
} from '@mui/icons-material'
import {
  Button,
  ButtonGroup,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
} from '@mui/material'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { useLockFn } from 'ahooks'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseLoadingOverlay, CodeMirrorEditor } from '@/components/base'
import { showNotice } from '@/services/notice-service'
import { useThemeMode } from '@/services/states'
import type { CodeEditorHandle, EditorMarker } from '@/types/editor'
import debounce from '@/utils/debounce'

const appWindow = getCurrentWebviewWindow()

type EditorLanguage = 'yaml' | 'javascript' | 'css'

export interface EditorViewerProps {
  open: boolean
  title?: string | ReactNode
  value: string
  language: EditorLanguage
  path: string
  readOnly?: boolean
  loading?: boolean
  dirty?: boolean
  saveDisabled?: boolean
  onChange?: (value: string) => void
  onSave?: () => void | Promise<void>
  onResetToDefault?: () => void
  onClose: () => void
  onValidate?: (markers: EditorMarker[]) => void
}

export const EditorViewer = ({
  open,
  title,
  value,
  language,
  path,
  readOnly = false,
  loading = false,
  dirty,
  saveDisabled = false,
  onChange,
  onSave,
  onResetToDefault,
  onClose,
  onValidate,
}: EditorViewerProps) => {
  const { t } = useTranslation()
  const themeMode = useThemeMode()
  const [isMaximized, setIsMaximized] = useState(false)
  const editorRef = useRef<CodeEditorHandle | null>(null)

  const resolvedTitle = title ?? t('profiles.components.menu.editFile')
  const disableSave = loading || saveDisabled || dirty === false

  const syncEditorValue = useCallback(() => {
    const editor = editorRef.current
    if (editor && editor.getValue() !== value) {
      editor.setValue(value)
    }
  }, [value])

  const syncMaximizedState = useCallback(async () => {
    try {
      setIsMaximized(await appWindow.isMaximized())
    } catch {
      setIsMaximized(false)
    }
  }, [])

  const handleSave = useLockFn(async () => {
    try {
      if (!readOnly) {
        await onSave?.()
      }
      onClose()
    } catch (error) {
      showNotice.error(error)
    }
  })

  const handleClose = () => {
    try {
      onClose()
    } catch (error) {
      showNotice.error(error)
    }
  }

  const handlePaste = useLockFn(async () => {
    try {
      if (readOnly || loading || !editorRef.current) return

      const text = await navigator.clipboard.readText()
      if (!text) return

      editorRef.current.pasteAtSelections(text)
    } catch (error) {
      showNotice.error(error)
    }
  })

  const handleFormat = useLockFn(async () => {
    try {
      if (loading) return
      await editorRef.current?.formatDocument()
    } catch (error) {
      showNotice.error(error)
    }
  })

  const handleToggleMaximize = useLockFn(async () => {
    try {
      await appWindow.toggleMaximize()
      await syncMaximizedState()
      editorRef.current?.layout()
    } catch (error) {
      showNotice.error(error)
    }
  })

  useEffect(() => {
    if (!open) return
    void syncMaximizedState()
  }, [open, syncMaximizedState])

  useEffect(() => {
    if (!open || loading) return
    syncEditorValue()
  }, [loading, open, syncEditorValue])

  useEffect(() => {
    if (!open) return

    const onResized = debounce(() => {
      void syncMaximizedState()
      try {
        editorRef.current?.layout()
      } catch {
        // Ignore transient layout errors during window transitions.
      }
    }, 100)

    const unlistenResized = appWindow.onResized(onResized)

    return () => {
      unlistenResized.then((unlisten) => unlisten())
    }
  }, [open, syncMaximizedState])

  useEffect(() => {
    return () => {
      editorRef.current?.dispose()
      editorRef.current = null
    }
  }, [])

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="xl"
      fullWidth
      disableEnforceFocus
    >
      <DialogTitle>{resolvedTitle}</DialogTitle>

      <DialogContent
        sx={{
          width: 'auto',
          height: 'calc(100vh - 185px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 0 }}>
          <BaseLoadingOverlay isLoading={loading} />
          {!loading && (
            <CodeMirrorEditor
              height="100%"
              path={path}
              value={value}
              language={language}
              theme={themeMode === 'light' ? 'light' : 'dark'}
              onMount={(editorInstance) => {
                editorRef.current = editorInstance
                syncEditorValue()
              }}
              onChange={onChange}
              onValidate={onValidate}
            />
          )}
        </div>

        <ButtonGroup
          variant="contained"
          sx={{ position: 'absolute', left: '14px', bottom: '8px' }}
        >
          <IconButton
            size="medium"
            color="inherit"
            sx={{ display: readOnly ? 'none' : '' }}
            title={t('profiles.page.importForm.actions.paste')}
            disabled={loading}
            onClick={() => {
              void handlePaste()
            }}
          >
            <ContentPasteRounded fontSize="inherit" />
          </IconButton>
          <IconButton
            size="medium"
            color="inherit"
            sx={{ display: readOnly ? 'none' : '' }}
            title={t('profiles.modals.editor.actions.format')}
            disabled={loading}
            onClick={() => {
              void handleFormat()
            }}
          >
            <FormatPaintRounded fontSize="inherit" />
          </IconButton>
          <IconButton
            size="medium"
            color="inherit"
            title={t(
              isMaximized ? 'shared.window.minimize' : 'shared.window.maximize',
            )}
            onClick={() => {
              void handleToggleMaximize()
            }}
          >
            {isMaximized ? <CloseFullscreenRounded /> : <OpenInFullRounded />}
          </IconButton>
        </ButtonGroup>
      </DialogContent>

      <DialogActions>
        {!readOnly && onResetToDefault && (
          <Button
            onClick={onResetToDefault}
            variant="outlined"
            color="warning"
            startIcon={<RestartAltRounded />}
            disabled={loading}
          >
            {t('shared.actions.resetToDefault')}
          </Button>
        )}
        <Button onClick={handleClose} variant="outlined">
          {t(readOnly ? 'shared.actions.close' : 'shared.actions.cancel')}
        </Button>
        {!readOnly && (
          <Button
            onClick={() => {
              void handleSave()
            }}
            variant="contained"
            disabled={disableSave}
          >
            {t('shared.actions.save')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}

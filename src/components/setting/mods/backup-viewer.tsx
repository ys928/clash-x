import {
  Button,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { useLockFn } from 'ahooks'
import type { Ref } from 'react'
import { useImperativeHandle, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseDialog, DialogRef } from '@/components/base'
import { createLocalBackup, importLocalBackup } from '@/services/cmds'
import { errorDetail, showNotice } from '@/services/notice-service'

import { BackupHistoryViewer } from './backup-history-viewer'

export function BackupViewer({ ref }: { ref?: Ref<DialogRef> }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [busyAction, setBusyAction] = useState(false)
  const [localImporting, setLocalImporting] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyPage, setHistoryPage] = useState(0)

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
    close: () => setOpen(false),
  }))

  const openHistory = () => {
    setHistoryPage(0)
    setHistoryOpen(true)
  }

  const handleBackup = useLockFn(async () => {
    try {
      setBusyAction(true)
      await createLocalBackup()
      showNotice.success('settings.modals.backup.messages.localBackupCreated')
    } catch (error) {
      console.error(error)
      showNotice.error('settings.modals.backup.messages.localBackupFailed')
    } finally {
      setBusyAction(false)
    }
  })

  const handleImport = useLockFn(async () => {
    const selected = await openDialog({
      multiple: false,
      filters: [{ name: 'Backup File', extensions: ['zip'] }],
    })
    if (!selected || Array.isArray(selected)) return
    try {
      setLocalImporting(true)
      await importLocalBackup(selected)
      showNotice.success('settings.modals.backup.messages.localBackupImported')
      openHistory()
    } catch (error) {
      console.error(error)
      showNotice.error(
        'settings.modals.backup.messages.localBackupImportFailed',
        { error: errorDetail(error) },
      )
    } finally {
      setLocalImporting(false)
    }
  })

  const isLocalBusy = busyAction || localImporting

  return (
    <BaseDialog
      open={open}
      title={t('settings.modals.backup.title')}
      contentSx={{ width: { xs: 360, sm: 520 } }}
      disableOk
      cancelBtn={t('shared.actions.close')}
      onCancel={() => setOpen(false)}
      onClose={() => setOpen(false)}
    >
      <Stack spacing={2}>
        <Stack
          spacing={1}
          sx={{
            border: (theme) => `1px solid ${theme.palette.divider}`,
            borderRadius: 2,
            p: 2,
          }}
        >
          <Typography variant="subtitle1">
            {t('settings.modals.backup.manual.title')}
          </Typography>
          <List disablePadding sx={{ '.MuiListItem-root': { px: 0 } }}>
            <ListItem disableGutters>
              <Stack spacing={1} sx={{ width: '100%' }}>
                <ListItemText
                  primary={t('settings.modals.backup.tabs.local')}
                  slotProps={{ secondary: { component: 'span' } }}
                  secondary={t('settings.modals.backup.manual.local')}
                />
                <Stack
                  direction="row"
                  spacing={1}
                  useFlexGap
                  sx={{ flexWrap: 'wrap', alignItems: 'center' }}
                >
                  <Button
                    variant="contained"
                    size="small"
                    loading={busyAction}
                    disabled={localImporting}
                    onClick={() => handleBackup()}
                  >
                    {t('settings.modals.backup.actions.backup')}
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={isLocalBusy}
                    onClick={() => openHistory()}
                  >
                    {t('settings.modals.backup.actions.viewHistory')}
                  </Button>
                  <Button
                    variant="text"
                    size="small"
                    loading={localImporting}
                    disabled={busyAction}
                    onClick={() => handleImport()}
                  >
                    {t('settings.modals.backup.actions.importBackup')}
                  </Button>
                </Stack>
              </Stack>
            </ListItem>
          </List>
        </Stack>
      </Stack>

      <BackupHistoryViewer
        open={historyOpen}
        page={historyPage}
        onPageChange={setHistoryPage}
        onClose={() => setHistoryOpen(false)}
      />
    </BaseDialog>
  )
}

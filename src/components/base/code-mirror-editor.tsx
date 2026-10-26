import { defaultKeymap, indentWithTab } from '@codemirror/commands'
import { css } from '@codemirror/lang-css'
import { javascript } from '@codemirror/lang-javascript'
import { yaml } from '@codemirror/lang-yaml'
import { lintGutter, setDiagnostics } from '@codemirror/lint'
import { EditorState } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView, keymap } from '@codemirror/view'
import CodeMirror from '@uiw/react-codemirror'
import { dump, load } from 'js-yaml'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react'

import type { CodeEditorHandle, EditorMarker } from '@/types/editor'

type EditorLanguage = 'yaml' | 'javascript' | 'css'

export interface CodeMirrorEditorProps {
  value: string
  language: EditorLanguage
  theme: 'light' | 'dark'
  height?: string
  readOnly?: boolean
  onChange?: (value: string) => void
  onValidate?: (markers: EditorMarker[]) => void
  onMount?: (editor: CodeEditorHandle) => void
  path?: string
}

const getLanguageExtension = (language: EditorLanguage) => {
  if (language === 'yaml') return yaml()
  if (language === 'javascript') return javascript({ jsx: true })
  return css()
}

const getYamlMarkers = (view: EditorView): EditorMarker[] => {
  try {
    load(view.state.doc.toString())
    return []
  } catch (error) {
    const mark = error as {
      mark?: { line?: number; column?: number }
      message?: string
    }
    const line = (mark.mark?.line ?? 0) + 1
    const column = (mark.mark?.column ?? 0) + 1
    return [
      {
        message: mark.message ?? 'Invalid YAML',
        severity: 'error',
        startLineNumber: line,
        startColumn: column,
        endLineNumber: line,
        endColumn: column + 1,
      },
    ]
  }
}

export const CodeMirrorEditor = forwardRef<
  CodeEditorHandle,
  CodeMirrorEditorProps
>(function CodeMirrorEditor(
  {
    value,
    language,
    theme,
    height = '100%',
    readOnly = false,
    onChange,
    onValidate,
    onMount,
  },
  ref,
) {
  const viewRef = useRef<EditorView | null>(null)
  const languageRef = useRef(language)
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  const onValidateRef = useRef(onValidate)
  languageRef.current = language
  valueRef.current = value
  onChangeRef.current = onChange
  onValidateRef.current = onValidate

  const handle = useMemo<CodeEditorHandle>(
    () => ({
      getValue: () => viewRef.current?.state.doc.toString() ?? valueRef.current,
      setValue: (nextValue) => {
        const view = viewRef.current
        if (view && view.state.doc.toString() !== nextValue) {
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: nextValue },
          })
        }
      },
      focus: () => viewRef.current?.focus(),
      layout: () => viewRef.current?.requestMeasure(),
      dispose: () => viewRef.current?.destroy(),
      pasteAtSelections: (text) => {
        const view = viewRef.current
        if (!view) return
        view.dispatch({
          changes: view.state.selection.ranges.map((range) => ({
            from: range.from,
            to: range.to,
            insert: text,
          })),
          userEvent: 'input.paste',
        })
        view.focus()
      },
      formatDocument: () => {
        const view = viewRef.current
        if (!view || languageRef.current !== 'yaml') return
        const formatted = dump(load(view.state.doc.toString()), {
          indent: 2,
          noRefs: true,
          lineWidth: -1,
        })
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: formatted },
          userEvent: 'input.format',
        })
      },
    }),
    [],
  )

  useImperativeHandle(ref, () => handle, [handle])

  const extensions = useMemo(
    () => [
      getLanguageExtension(language),
      keymap.of([...defaultKeymap, indentWithTab]),
      EditorState.tabSize.of(2),
      EditorView.lineWrapping,
      lintGutter(),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const nextValue = update.state.doc.toString()
          onChangeRef.current?.(nextValue)
          if (language === 'yaml') {
            const markers = getYamlMarkers(update.view)
            update.view.dispatch(
              setDiagnostics(
                update.state,
                markers.map((marker) => ({
                  from: update.state.doc.line(marker.startLineNumber).from,
                  to: update.state.doc.line(marker.endLineNumber).to,
                  severity: marker.severity,
                  message: marker.message,
                })),
              ),
            )
            onValidateRef.current?.(markers)
          }
        }
      }),
      ...(theme === 'dark' ? [oneDark] : []),
      EditorView.theme({
        '&': { height: '100%', fontSize: '14px' },
        '.cm-scroller': { overflow: 'auto' },
        '.cm-content': {
          padding: '33px 12px 12px',
          fontFamily:
            'Fira Code, JetBrains Mono, Roboto Mono, "Source Code Pro", Consolas, Menlo, Monaco, monospace, "Courier New", "Apple Color Emoji"',
          fontLigatures: 'none',
        },
      }),
    ],
    [language, theme],
  )

  useEffect(() => () => handle.dispose(), [handle])

  return (
    <CodeMirror
      value={value}
      height={height}
      theme={theme}
      extensions={extensions}
      readOnly={readOnly}
      basicSetup={{ lineNumbers: true, foldGutter: true }}
      onCreateEditor={(view) => {
        viewRef.current = view
        onMount?.(handle)
        if (languageRef.current === 'yaml') {
          const markers = getYamlMarkers(view)
          view.dispatch(
            setDiagnostics(
              view.state,
              markers.map((marker) => ({
                from: view.state.doc.line(marker.startLineNumber).from,
                to: view.state.doc.line(marker.endLineNumber).to,
                severity: marker.severity,
                message: marker.message,
              })),
            ),
          )
          onValidateRef.current?.(markers)
        }
      }}
    />
  )
})

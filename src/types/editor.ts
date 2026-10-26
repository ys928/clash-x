export type EditorMarker = {
  message: string
  severity: 'error' | 'warning' | 'info' | 'hint'
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
}

export type CodeEditorHandle = {
  getValue: () => string
  setValue: (value: string) => void
  focus: () => void
  layout: () => void
  dispose: () => void
  pasteAtSelections: (text: string) => void
  formatDocument: () => Promise<void> | void
}

/**
 * Base barrel — non-visual utilities live here permanently.
 * Visual primitives re-export from `@/components/ui` for backward compatibility;
 * prefer importing App* from `@/components/ui` in new / migrated code.
 */
export { BaseDialog, type DialogRef } from './base-dialog'
export { BaseEmpty } from './base-empty'
export { BaseErrorBoundary } from './base-error-boundary'
export { BaseFieldset } from './base-fieldset'
export { BaseLoading } from './base-loading'
export { BaseLoadingOverlay } from './base-loading-overlay'
export { BaseSplitChipEditor } from './base-split-chip-editor'
export { MonacoEditor } from './monaco-editor'
export { Switch } from './base-switch'
export { BaseTooltip } from './base-tooltip'
export { TooltipIcon } from './base-tooltip-icon'
export { VirtualList, type VirtualListHandle } from './virtual-list'

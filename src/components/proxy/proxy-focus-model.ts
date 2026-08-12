import type { ProxyGroupView } from '@/types/proxy-view'

/** Shared with the home current-proxy card so both surfaces stay in sync. */
export const STORAGE_KEY_GROUP = 'clash-verge-selected-proxy-group'
const STORAGE_KEY_VIEW_MODE = 'proxy-page-view-mode'

export type ProxyPageViewMode = 'focus' | 'all'

/** Names that usually mean "the group you pick nodes from every day". */
const PRIMARY_GROUP_KEYWORDS = [
  '节点选择',
  '自動選擇',
  '自动选择',
  'proxy',
  'select',
  'auto',
] as const

const isProxyPageViewMode = (value: unknown): value is ProxyPageViewMode =>
  value === 'focus' || value === 'all'

export const readProxyPageViewMode = (): ProxyPageViewMode => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_VIEW_MODE)
    return isProxyPageViewMode(saved) ? saved : 'focus'
  } catch {
    return 'focus'
  }
}

export const writeProxyPageViewMode = (mode: ProxyPageViewMode) => {
  try {
    localStorage.setItem(STORAGE_KEY_VIEW_MODE, mode)
  } catch {
    // ignore quota / private mode
  }
}

export const listVisibleGroups = (
  groups: readonly ProxyGroupView[] | undefined,
): ProxyGroupView[] => (groups ?? []).filter((group) => !group.hidden)

/**
 * Prefer the subscription's main selector (关键词 / 首个可选组), then fall back
 * to the first visible group. Used as the default "focus" target.
 */
export const pickPrimaryGroup = (
  groups: readonly ProxyGroupView[],
): ProxyGroupView | undefined => {
  const visible = listVisibleGroups(groups)
  if (visible.length === 0) return undefined

  const selectable = visible.filter(
    (group) =>
      group.type === 'Selector' ||
      group.type === 'URLTest' ||
      group.type === 'Fallback',
  )
  const pool = selectable.length > 0 ? selectable : visible

  return (
    pool.find((group) =>
      PRIMARY_GROUP_KEYWORDS.some((keyword) =>
        group.name.toLowerCase().includes(keyword.toLowerCase()),
      ),
    ) ?? pool[0]
  )
}

/**
 * Resolve which group to focus: keep a still-valid current selection, else a
 * saved preference, else the primary group heuristic.
 */
export const resolveFocusedGroupName = (
  groups: readonly ProxyGroupView[],
  options: {
    currentName?: string | null
    savedName?: string | null
  } = {},
): string | null => {
  const visible = listVisibleGroups(groups)
  if (visible.length === 0) return null

  const { currentName, savedName } = options
  if (currentName && visible.some(({ name }) => name === currentName)) {
    return currentName
  }
  if (savedName && visible.some(({ name }) => name === savedName)) {
    return savedName
  }
  return pickPrimaryGroup(visible)?.name ?? null
}

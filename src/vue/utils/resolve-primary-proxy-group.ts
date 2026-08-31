import type { ProxyGroupView, ProxyViewV1 } from '@/types/proxy-view'

const PRIMARY_EXACT = '节点选择'
const PRIMARY_KEYWORDS = [
  '节点选择',
  'select',
  'proxy',
  'auto',
  '自动选择',
] as const

const SELECTABLE_TYPES = new Set(['Selector', 'URLTest', 'Fallback'])

/**
 * Picks the single proxy group this page shows.
 * Rule mode prefers「节点选择」(and similar primary selectors);
 * global mode uses GLOBAL; direct has no group.
 */
export function resolvePrimaryProxyGroup(
  view: ProxyViewV1 | null | undefined,
  mode: string,
): ProxyGroupView | null {
  if (!view || mode === 'direct') return null
  if (mode === 'global') return view.global

  const selectable = view.groups.filter(
    (group) => !group.hidden && SELECTABLE_TYPES.has(group.type),
  )

  const exact = selectable.find((group) => group.name === PRIMARY_EXACT)
  if (exact) return exact

  const byKeyword = selectable.find((group) => {
    const lower = group.name.toLowerCase()
    return PRIMARY_KEYWORDS.some((keyword) =>
      lower.includes(keyword.toLowerCase()),
    )
  })
  if (byKeyword) return byKeyword

  return selectable[0] ?? null
}

import { useMemo, useRef } from 'react'

import { useGroupsDelays } from '@/hooks/use-group-delays'
import { useVerge } from '@/hooks/use-verge'
import { useAppRefreshers, useProxiesData } from '@/providers/app-data-context'
import { type DelaySnapshot } from '@/services/delay'
import {
  resolveMember,
  type ProxyGroupView,
  type ProxyViewV1,
  type ResolvedProxyMember,
} from '@/types/proxy-view'

import { filterSort } from './use-filter-sort'
import {
  DEFAULT_STATE,
  useHeadStateNew,
  type HeadState,
} from './use-head-state'
import { useWindowWidth } from './use-window-width'

export interface ResolvedMemberOccurrence {
  memberIndex: number
  member: ResolvedProxyMember
}

type ProxyGroup = ProxyGroupView

export interface IRenderItem {
  type: 0 | 1 | 2 | 3 | 4
  key: string
  group: ProxyGroup
  member?: ResolvedMemberOccurrence
  memberCol?: ResolvedMemberOccurrence[]
  col?: number
  headState?: HeadState
  icon?: string
  testUrl?: string
}

/**
 * Whether the list about to be drawn contains anything a user would call content.
 *
 * A group header alone counts only when the group is visible; every other row is content by
 * definition, including the members of a group that is hidden but expanded.
 */
export const hasRenderableItems = (
  renderList: readonly IRenderItem[],
): boolean => renderList.some((item) => item.type !== 0 || !item.group.hidden)

type GroupCache = {
  now: string | undefined
  members: ProxyGroupView['members']
  headState: HeadState
  col: number
  latencyTimeout: number | undefined
  /// Focus vs accordion vs global change which rows are emitted for the same group.
  layout: 'accordion' | 'global'
  /// This group's own delays. Compared by identity so that a test settling in one group
  /// does not throw away every other group's sorted order.
  delays: DelaySnapshot | undefined
  items: IRenderItem[]
}

const resolveOccurrences = (view: ProxyViewV1, group: ProxyGroupView) =>
  group.members.map((member, memberIndex) => ({
    memberIndex,
    member: resolveMember(view, member),
  }))

const memberKey = (
  group: ProxyGroupView,
  occurrence: ResolvedMemberOccurrence,
) => {
  const { memberIndex, member } = occurrence
  const identity =
    member.kind === 'node' ? member.node.recordId : member.ref.name
  return `${group.name}:${memberIndex}:${identity}`
}

const calculateColumns = (width: number, configCol: number): number => {
  if (configCol > 0 && configCol < 6) return configCol
  if (width > 1920) return 5
  if (width > 1450) return 4
  if (width > 1024) return 3
  if (width >= 600) return 2
  return 1
}

const groupOccurrences = <T>(list: T[], size: number): T[][] =>
  list.reduce<T[][]>((acc, item) => {
    const lastGroup = acc[acc.length - 1]
    if (!lastGroup || lastGroup.length >= size) acc.push([item])
    else lastGroup.push(item)
    return acc
  }, [])

export const useRenderList = (mode: string) => {
  const { proxyView } = useProxiesData()
  const { refreshProxy } = useAppRefreshers()
  const { verge } = useVerge()
  const { width } = useWindowWidth()
  const [headStates, setHeadState] = useHeadStateNew()
  const latencyTimeout = verge?.default_latency_timeout

  const col = useMemo(
    () => calculateColumns(width, verge?.proxy_layout_column || 6),
    [width, verge?.proxy_layout_column],
  )

  // Every group this list draws, so a test settling in any of them re-sorts that group.
  const renderedGroupNames = useMemo(() => {
    if (!proxyView) return []
    const useRule = mode === 'rule' || mode === 'script'
    return useRule
      ? proxyView.groups.map(({ name }) => name)
      : proxyView.global
        ? [proxyView.global.name]
        : []
  }, [mode, proxyView])
  const groupDelays = useGroupsDelays(renderedGroupNames)

  const groupCacheRef = useRef<Map<string, GroupCache>>(new Map())
  const prevListRef = useRef<IRenderItem[]>([])

  const renderList = useMemo<IRenderItem[]>(() => {
    if (!proxyView) return []

    const useRule = mode === 'rule' || mode === 'script'
    const layout = useRule ? 'accordion' : 'global'
    const renderGroups = useRule
      ? proxyView.groups
      : proxyView.global === null
        ? []
        : [proxyView.global]
    const cache = groupCacheRef.current
    let anyChanged = false

    const retList = renderGroups.flatMap((group) => {
      const headState = headStates[group.name] || DEFAULT_STATE
      const cached = cache.get(group.name)
      if (
        cached &&
        cached.now === group.now &&
        cached.members === group.members &&
        cached.headState === headState &&
        cached.col === col &&
        cached.latencyTimeout === latencyTimeout &&
        cached.layout === layout &&
        cached.delays === groupDelays.get(group.name)
      ) {
        return cached.items
      }

      anyChanged = true
      const ret: IRenderItem[] = [
        {
          type: 0,
          key: group.name,
          group,
          headState,
          icon: group.icon,
          testUrl: group.testUrl,
        },
      ]

      if (headState.open || !useRule) {
        const occurrences = filterSort(
          resolveOccurrences(proxyView, group),
          group.name,
          headState.filterText,
          headState.sortType,
          latencyTimeout,
          {
            matchCase: headState.filterMatchCase,
            matchWholeWord: headState.filterMatchWholeWord,
            useRegularExpression: headState.filterUseRegularExpression,
          },
        )
        // Global mode keeps an in-list toolbar. Focus mode moves tools into page chrome.
        if (!useRule) {
          ret.push({ type: 1, key: `head-${group.name}`, group, headState })
        }
        if (occurrences.length === 0) {
          ret.push({ type: 3, key: `empty-${group.name}`, group, headState })
        } else if (col > 1) {
          ret.push(
            ...groupOccurrences(occurrences, col).map((memberCol) => ({
              type: 4 as const,
              key: `col:${memberKey(group, memberCol[0])}`,
              group,
              headState,
              col,
              memberCol,
            })),
          )
        } else {
          ret.push(
            ...occurrences.map((member) => ({
              type: 2 as const,
              key: memberKey(group, member),
              group,
              member,
              headState,
            })),
          )
        }
      }

      cache.set(group.name, {
        now: group.now,
        members: group.members,
        headState,
        col,
        latencyTimeout,
        layout,
        delays: groupDelays.get(group.name),
        items: ret,
      })
      return ret
    })

    const filtered = useRule
      ? retList.filter((item) => !item.group.hidden)
      : retList.slice(1)
    if (!anyChanged && prevListRef.current.length === filtered.length) {
      return prevListRef.current
    }
    prevListRef.current = filtered
    return filtered
  }, [col, groupDelays, headStates, latencyTimeout, mode, proxyView])

  return {
    renderList,
    headStates,
    onProxies: refreshProxy,
    onHeadState: setHeadState,
    currentColumns: col,
  }
}

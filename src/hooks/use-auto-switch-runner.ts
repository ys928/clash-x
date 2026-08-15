import { useEffect, useRef } from 'react'

import {
  decideAutoSwitch,
  type AutoSwitchGroup,
} from '@/components/proxy/auto-switch-model'
import {
  getAutoSwitchGroups,
  subscribeAutoSwitchGroups,
} from '@/components/proxy/auto-switch-store'
import { useProxySelection } from '@/hooks/use-proxy-selection'
import { useVerge } from '@/hooks/use-verge'
import {
  useAppRefreshers,
  useClashConfigData,
  useProxiesData,
} from '@/providers/app-data-context'
import delayManager from '@/services/delay'
import { showNotice } from '@/services/notice-service'
import {
  isInteractableMember,
  rebindNode,
  resolveMember,
  type InteractableProxyMember,
  type ProxyGroupView,
  type ProxyViewV1,
} from '@/types/proxy-view'
import { debugLog } from '@/utils/debug'

const INITIAL_DELAY_MS = 2500
const DELAY_NAMESPACE = (groupId: string) => `__auto_switch__:${groupId}`

const selectableTypes = new Set(['Selector', 'URLTest', 'Fallback'])

function lookupGroup(view: ProxyViewV1, name: string): ProxyGroupView | null {
  if (view.global?.name === name) return view.global
  return view.groups.find((group) => group.name === name) ?? null
}

function resolveTargetGroup(
  view: ProxyViewV1,
  targetGroupName: string,
  mode: string,
): ProxyGroupView | null {
  if (mode === 'global') {
    return view.global
  }
  if (mode === 'direct') return null

  const group = lookupGroup(view, targetGroupName)
  if (!group) return null
  if (!selectableTypes.has(group.type)) return null
  return group
}

function resolveGroupMembers(
  view: ProxyViewV1,
  group: ProxyGroupView,
): InteractableProxyMember[] {
  return group.members
    .map((memberRef) => resolveMember(view, memberRef))
    .filter(isInteractableMember)
    .filter((member) => member.kind === 'node')
}

function resolveCuratedMembers(
  view: ProxyViewV1,
  group: ProxyGroupView,
  curated: AutoSwitchGroup,
): InteractableProxyMember[] {
  const candidates = resolveGroupMembers(view, group)
    .filter((member) => member.kind === 'node')
    .map((member) => member.node)

  const members: InteractableProxyMember[] = []
  for (const binding of curated.nodes) {
    const node = rebindNode(candidates, binding)
    if (!node) continue
    members.push({
      kind: 'node',
      ref: { kind: 'node', name: node.name, recordId: node.recordId },
      node,
    })
  }
  return members
}

/**
 * Background scheduler: periodically latency-tests each enabled curated group and
 * switches the target Clash group when a better node clears the configured threshold.
 *
 * Mount once under AppDataProvider (layout) so it keeps running off the proxies page.
 */
export function useAutoSwitchRunner() {
  const { proxyView } = useProxiesData()
  const { clashConfig } = useClashConfigData()
  const { refreshProxy } = useAppRefreshers()
  const { verge } = useVerge()
  const { changeProxy } = useProxySelection({
    onSuccess: () => {
      refreshProxy()
    },
  })

  const proxyViewRef = useRef(proxyView)
  const modeRef = useRef((clashConfig?.mode ?? 'rule').toLowerCase())
  const timeoutRef = useRef(verge?.default_latency_timeout || 10000)
  const changeProxyRef = useRef(changeProxy)
  const runningRef = useRef(new Set<string>())
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  proxyViewRef.current = proxyView
  modeRef.current = (clashConfig?.mode ?? 'rule').toLowerCase()
  timeoutRef.current = verge?.default_latency_timeout || 10000
  changeProxyRef.current = changeProxy

  useEffect(() => {
    let disposed = false
    const running = runningRef.current
    const timers = timersRef.current

    const clearTimer = (id: string) => {
      const timer = timers.get(id)
      if (timer) {
        clearTimeout(timer)
        timers.delete(id)
      }
    }

    const clearAllTimers = () => {
      for (const id of timers.keys()) clearTimer(id)
    }

    const runGroup = async (group: AutoSwitchGroup) => {
      if (disposed || !group.enabled) return
      if (running.has(group.id)) return

      const view = proxyViewRef.current
      if (!view) return

      const mode = modeRef.current
      const target = resolveTargetGroup(view, group.targetGroupName, mode)
      if (!target) {
        debugLog(
          `[AutoSwitch] skip ${group.name}: target group unavailable (${group.targetGroupName})`,
        )
        return
      }

      const members = resolveCuratedMembers(view, target, group)
      if (members.length === 0) {
        debugLog(`[AutoSwitch] skip ${group.name}: no resolvable nodes`)
        return
      }

      running.add(group.id)
      const delayGroup = DELAY_NAMESPACE(group.id)
      const timeout = timeoutRef.current

      try {
        debugLog(
          `[AutoSwitch] testing ${group.name}: ${members.length} nodes in ${target.name}`,
        )
        await delayManager.checkListDelay(members, delayGroup, timeout)

        if (disposed) return

        // Re-read latest view after the async test — the selected node may have changed.
        const latestView = proxyViewRef.current
        if (!latestView) return
        const latestTarget = resolveTargetGroup(
          latestView,
          group.targetGroupName,
          modeRef.current,
        )
        if (!latestTarget) return

        const results = members.map((member) => ({
          name: member.ref.name,
          delay: delayManager.getDelay(member.ref.name, delayGroup),
        }))

        const decision = decideAutoSwitch({
          currentName: latestTarget.now,
          results,
          thresholdMs: group.thresholdMs,
          timeout,
        })

        if (decision.action === 'keep') {
          debugLog(`[AutoSwitch] keep current for ${group.name}`)
          return
        }

        if (decision.name === latestTarget.now) return

        debugLog(
          `[AutoSwitch] switch ${group.name}: ${latestTarget.now} -> ${decision.name}`,
        )
        changeProxyRef.current(
          latestTarget.name,
          decision.name,
          latestTarget.now,
        )
        showNotice.info('proxies.page.autoSwitch.switched', {
          group: group.name,
          from: latestTarget.now ?? '—',
          to: decision.name,
          delay: decision.bestDelay,
        })
      } catch (error) {
        console.error(`[AutoSwitch] failed for ${group.name}`, error)
      } finally {
        running.delete(group.id)
      }
    }

    const scheduleGroup = (group: AutoSwitchGroup, delayMs: number) => {
      clearTimer(group.id)
      if (!group.enabled) return

      const timer = setTimeout(async () => {
        timers.delete(group.id)
        // Re-read config in case the group was edited while waiting.
        const latest = getAutoSwitchGroups().find(
          (item) => item.id === group.id,
        )
        if (!latest?.enabled || disposed) return
        await runGroup(latest)
        if (disposed) return
        const still = getAutoSwitchGroups().find((item) => item.id === group.id)
        if (still?.enabled) {
          scheduleGroup(still, still.intervalSeconds * 1000)
        }
      }, delayMs)

      timers.set(group.id, timer)
    }

    const syncSchedules = () => {
      const latest = getAutoSwitchGroups()
      const enabledIds = new Set(
        latest.filter((group) => group.enabled).map((group) => group.id),
      )

      for (const id of [...timers.keys()]) {
        if (!enabledIds.has(id)) clearTimer(id)
      }

      for (const group of latest) {
        if (!group.enabled) continue
        if (timers.has(group.id)) continue
        scheduleGroup(group, INITIAL_DELAY_MS)
      }
    }

    syncSchedules()
    const unsubscribe = subscribeAutoSwitchGroups(syncSchedules)

    return () => {
      disposed = true
      unsubscribe()
      clearAllTimers()
      running.clear()
    }
  }, [])
}

/** Exported for the panel "test now" action. */
export async function runAutoSwitchOnce(
  group: AutoSwitchGroup,
  options: {
    proxyView: ProxyViewV1
    mode: string
    timeout: number
    changeProxy: (
      groupName: string,
      proxyName: string,
      previousProxy?: string,
    ) => void
  },
) {
  const target = resolveTargetGroup(
    options.proxyView,
    group.targetGroupName,
    options.mode,
  )
  if (!target) {
    throw new Error('target-unavailable')
  }

  const members = resolveCuratedMembers(options.proxyView, target, group)
  if (members.length === 0) {
    throw new Error('no-nodes')
  }

  const delayGroup = DELAY_NAMESPACE(group.id)
  await delayManager.checkListDelay(members, delayGroup, options.timeout)

  const results = members.map((member) => ({
    name: member.ref.name,
    delay: delayManager.getDelay(member.ref.name, delayGroup),
  }))

  const decision = decideAutoSwitch({
    currentName: target.now,
    results,
    thresholdMs: group.thresholdMs,
    timeout: options.timeout,
  })

  if (decision.action === 'switch' && decision.name !== target.now) {
    options.changeProxy(target.name, decision.name, target.now)
    showNotice.info('proxies.page.autoSwitch.switched', {
      group: group.name,
      from: target.now ?? '—',
      to: decision.name,
      delay: decision.bestDelay,
    })
  }

  return { decision, results }
}

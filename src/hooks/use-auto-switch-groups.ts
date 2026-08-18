import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'

import {
  createEmptyAutoSwitchGroup,
  type AutoSwitchGroup,
} from '@/components/proxy/auto-switch-model'
import {
  getAutoSwitchGroups,
  hydrateAutoSwitchGroups,
  removeAutoSwitchGroup,
  setAutoSwitchGroups,
  subscribeAutoSwitchGroups,
  updateAutoSwitchGroup,
  upsertAutoSwitchGroup,
} from '@/components/proxy/auto-switch-store'

export function useAutoSwitchGroups() {
  useEffect(() => {
    void hydrateAutoSwitchGroups().catch((error) => {
      console.error('[AutoSwitch] failed to load groups from backend', error)
    })
  }, [])

  const groups = useSyncExternalStore(
    subscribeAutoSwitchGroups,
    getAutoSwitchGroups,
    getAutoSwitchGroups,
  )

  const enabledCount = useMemo(
    () => groups.filter((group) => group.enabled).length,
    [groups],
  )

  /** Proxy group names that currently have at least one enabled smart-switch set. */
  const enabledTargetGroups = useMemo(() => {
    const names = new Set<string>()
    for (const group of groups) {
      if (group.enabled && group.targetGroupName) {
        names.add(group.targetGroupName)
      }
    }
    return names
  }, [groups])

  const createGroup = useCallback((partial?: Partial<AutoSwitchGroup>) => {
    const group = createEmptyAutoSwitchGroup(partial)
    void upsertAutoSwitchGroup(group)
    return group
  }, [])

  const saveGroup = useCallback((group: AutoSwitchGroup) => {
    return upsertAutoSwitchGroup(group)
  }, [])

  const patchGroup = useCallback(
    (id: string, patch: Partial<AutoSwitchGroup>) => {
      return updateAutoSwitchGroup(id, patch)
    },
    [],
  )

  const deleteGroup = useCallback((id: string) => {
    return removeAutoSwitchGroup(id)
  }, [])

  const replaceGroups = useCallback((next: AutoSwitchGroup[]) => {
    return setAutoSwitchGroups(next)
  }, [])

  return {
    groups,
    enabledCount,
    enabledTargetGroups,
    createGroup,
    saveGroup,
    patchGroup,
    deleteGroup,
    replaceGroups,
  }
}

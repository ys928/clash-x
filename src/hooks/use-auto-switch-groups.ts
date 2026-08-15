import { useCallback, useMemo, useSyncExternalStore } from 'react'

import {
  createEmptyAutoSwitchGroup,
  type AutoSwitchGroup,
} from '@/components/proxy/auto-switch-model'
import {
  getAutoSwitchGroups,
  removeAutoSwitchGroup,
  setAutoSwitchGroups,
  subscribeAutoSwitchGroups,
  updateAutoSwitchGroup,
  upsertAutoSwitchGroup,
} from '@/components/proxy/auto-switch-store'

export function useAutoSwitchGroups() {
  const groups = useSyncExternalStore(
    subscribeAutoSwitchGroups,
    getAutoSwitchGroups,
    getAutoSwitchGroups,
  )

  const enabledCount = useMemo(
    () => groups.filter((group) => group.enabled).length,
    [groups],
  )

  const createGroup = useCallback((partial?: Partial<AutoSwitchGroup>) => {
    const group = createEmptyAutoSwitchGroup(partial)
    upsertAutoSwitchGroup(group)
    return group
  }, [])

  const saveGroup = useCallback((group: AutoSwitchGroup) => {
    upsertAutoSwitchGroup(group)
  }, [])

  const patchGroup = useCallback(
    (id: string, patch: Partial<AutoSwitchGroup>) => {
      updateAutoSwitchGroup(id, patch)
    },
    [],
  )

  const deleteGroup = useCallback((id: string) => {
    removeAutoSwitchGroup(id)
  }, [])

  const replaceGroups = useCallback((next: AutoSwitchGroup[]) => {
    setAutoSwitchGroups(next)
  }, [])

  return {
    groups,
    enabledCount,
    createGroup,
    saveGroup,
    patchGroup,
    deleteGroup,
    replaceGroups,
  }
}

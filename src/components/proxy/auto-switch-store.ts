import {
  getAutoSwitchGroups as getAutoSwitchGroupsCmd,
  replaceAutoSwitchGroups as replaceAutoSwitchGroupsCmd,
} from '@/services/cmds'

import {
  clearAutoSwitchGroupsStorage,
  loadAutoSwitchGroups,
  type AutoSwitchGroup,
} from './auto-switch-model'

type Listener = () => void

let groups: AutoSwitchGroup[] = []
let hydratePromise: Promise<void> | null = null
const listeners = new Set<Listener>()

const emit = () => {
  for (const listener of listeners) listener()
}

const setGroups = (next: AutoSwitchGroup[]) => {
  groups = next
  emit()
}

export const getAutoSwitchGroups = () => groups

export const subscribeAutoSwitchGroups = (listener: Listener) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Load groups from the backend, migrating any leftover localStorage copy once. */
export function hydrateAutoSwitchGroups() {
  hydratePromise ??= (async () => {
    try {
      let next = await getAutoSwitchGroupsCmd()
      if (next.length === 0) {
        const legacy = loadAutoSwitchGroups()
        if (legacy.length > 0) {
          next = await replaceAutoSwitchGroupsCmd(legacy)
        }
      }
      clearAutoSwitchGroupsStorage()
      setGroups(next)
    } catch (error) {
      hydratePromise = null
      throw error
    }
  })()
  return hydratePromise
}

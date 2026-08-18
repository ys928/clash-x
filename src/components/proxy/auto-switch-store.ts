import {
  deleteAutoSwitchGroup as deleteAutoSwitchGroupCmd,
  getAutoSwitchGroups as getAutoSwitchGroupsCmd,
  patchAutoSwitchGroup as patchAutoSwitchGroupCmd,
  replaceAutoSwitchGroups as replaceAutoSwitchGroupsCmd,
  upsertAutoSwitchGroup as upsertAutoSwitchGroupCmd,
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

const afterHydrate = async <T>(run: () => Promise<T>) => {
  await hydrateAutoSwitchGroups()
  return run()
}

export const setAutoSwitchGroups = async (next: AutoSwitchGroup[]) => {
  const saved = await afterHydrate(() => replaceAutoSwitchGroupsCmd(next))
  setGroups(saved)
}

export const updateAutoSwitchGroup = async (
  id: string,
  patch: Partial<AutoSwitchGroup>,
) => {
  const saved = await afterHydrate(() => patchAutoSwitchGroupCmd(id, patch))
  setGroups(saved)
}

export const upsertAutoSwitchGroup = async (group: AutoSwitchGroup) => {
  const saved = await afterHydrate(() => upsertAutoSwitchGroupCmd(group))
  setGroups(saved)
}

export const removeAutoSwitchGroup = async (id: string) => {
  const saved = await afterHydrate(() => deleteAutoSwitchGroupCmd(id))
  setGroups(saved)
}

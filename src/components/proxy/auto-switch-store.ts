import {
  loadAutoSwitchGroups,
  saveAutoSwitchGroups,
  type AutoSwitchGroup,
} from './auto-switch-model'

type Listener = () => void

let groups: AutoSwitchGroup[] = loadAutoSwitchGroups()
const listeners = new Set<Listener>()

const emit = () => {
  for (const listener of listeners) listener()
}

export const getAutoSwitchGroups = () => groups

export const setAutoSwitchGroups = (next: AutoSwitchGroup[]) => {
  groups = next
  saveAutoSwitchGroups(next)
  emit()
}

export const updateAutoSwitchGroup = (
  id: string,
  patch: Partial<AutoSwitchGroup>,
) => {
  setAutoSwitchGroups(
    groups.map((group) => (group.id === id ? { ...group, ...patch } : group)),
  )
}

export const upsertAutoSwitchGroup = (group: AutoSwitchGroup) => {
  const index = groups.findIndex((item) => item.id === group.id)
  if (index < 0) {
    setAutoSwitchGroups([...groups, group])
    return
  }
  const next = groups.slice()
  next[index] = group
  setAutoSwitchGroups(next)
}

export const removeAutoSwitchGroup = (id: string) => {
  setAutoSwitchGroups(groups.filter((group) => group.id !== id))
}

export const subscribeAutoSwitchGroups = (listener: Listener) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

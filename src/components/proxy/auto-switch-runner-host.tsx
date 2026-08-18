import { useEffect } from 'react'

import { hydrateAutoSwitchGroups } from '@/components/proxy/auto-switch-store'

/** Loads backend auto-switch groups as soon as the app shell mounts, so localStorage can migrate. */
export function AutoSwitchRunnerHost() {
  useEffect(() => {
    void hydrateAutoSwitchGroups().catch((error) => {
      console.error('[AutoSwitch] failed to load groups from backend', error)
    })
  }, [])
  return null
}

import { useCallback, useSyncExternalStore } from 'react'

import delayManager, { type DelaySnapshot } from '@/services/delay'

const NO_DELAYS: DelaySnapshot = { of: () => -1 }

/** Exposes the external delay store to React, updating sort order only after a test settles. */
export const useGroupDelays = (group: string | null): DelaySnapshot => {
  const subscribe = useCallback(
    (onSettle: () => void) =>
      group ? delayManager.addGroupListener(group, onSettle) : () => {},
    [group],
  )
  const read = useCallback(
    () => (group ? delayManager.groupDelays(group) : NO_DELAYS),
    [group],
  )

  return useSyncExternalStore(subscribe, read, read)
}

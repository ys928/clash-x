import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect } from 'react'

import { runStateQueryKey } from '@/hooks/use-system-state'
import type { RunState } from '@/services/cmds'
import { subscribeVergeEvents } from '@/services/events'
import { revalidateQueries, setCacheDataAsync } from '@/services/query-client'

import { forgetShownStartupError } from '../utils/notification-handlers'

export const useLayoutEvents = (
  handleNotice: (payload: [string, string]) => void,
) => {
  useEffect(() => {
    const revalidateKeys = (keys: readonly string[]) => {
      void revalidateQueries(keys.map((key) => [key]))
    }

    const unsubscribe = subscribeVergeEvents(
      {
        'verge://refresh-clash-config': () => {
          revalidateKeys([
            'getProxyView',
            'getVersion',
            'getClashConfig',
            'getClashInfo',
            'getClashMode',
            'getRuntimeConfig',
            'getRules',
            'getRuleProviders',
          ])
        },
        'verge://refresh-verge-config': () => {
          revalidateKeys([
            'getVergeConfig',
            'getSystemProxy',
            'getAutotemProxy',
          ])
        },
        // Transitions carry the full run-state snapshot, so write it directly to cache.
        'verge://run-state-changed': (payload) => {
          void setCacheDataAsync<RunState>(runStateQueryKey, payload)
          if (payload.mode !== 'NotRunning') forgetShownStartupError()
        },
        'verge://notice-message': handleNotice,
      },
      // Re-read event-only state after subscribing to close the initial race window.
      () => revalidateKeys(['getRuntimeState']),
    )
    const unlistenFocus = getCurrentWindow().onFocusChanged(({ payload }) => {
      if (payload) handleNotice(['core_start::error', ''])
    })
    return () => {
      unsubscribe()
      void unlistenFocus.then((unlisten) => unlisten())
    }
  }, [handleNotice])
}

import { useEffect } from 'react'

import { getUpdateStatus, type UpdateStatus } from '@/services/cmds'
import { subscribeVergeEvents } from '@/services/events'
import { setCacheData, useQuery } from '@/services/query-client'

import { updateLastCheckTime } from './use-update'

const updateStatusQueryKey = ['updateStatus'] as const

const EMPTY_STATUS: UpdateStatus = {
  available: false,
  version: null,
  downloaded: false,
}

/**
 * Silent-updater badge state: backend checks daily (+ once shortly after launch),
 * downloads in the background, and pushes status here for the titlebar button.
 */
export const useSilentUpdateStatus = () => {
  const { data: status = EMPTY_STATUS } = useQuery({
    queryKey: updateStatusQueryKey,
    queryFn: getUpdateStatus,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
  })

  useEffect(() => {
    return subscribeVergeEvents(
      {
        'verge://update-status': (payload) => {
          void setCacheData(updateStatusQueryKey, payload)
          updateLastCheckTime()
        },
      },
      () => {
        void getUpdateStatus()
          .then((next) => setCacheData(updateStatusQueryKey, next))
          .catch((error) =>
            console.warn(
              '[useSilentUpdateStatus] failed to read status',
              error,
            ),
          )
      },
    )
  }, [])

  return status
}

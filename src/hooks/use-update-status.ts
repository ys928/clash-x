import { useEffect } from 'react'

import { getUpdateStatus, type UpdateStatus } from '@/services/cmds'
import { subscribeVergeEvents } from '@/services/events'
import { setCacheData, useQuery } from '@/services/query-client'

const updateStatusQueryKey = ['updateStatus'] as const

const EMPTY_STATUS: UpdateStatus = {
  available: false,
  version: null,
  body: null,
}

/**
 * Backend update-detection state for the titlebar badge and dialog metadata.
 * Detection runs in Rust (survives lightweight-mode window destroy).
 */
export const useUpdateStatus = () => {
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
        },
      },
      () => {
        void getUpdateStatus()
          .then((next) => setCacheData(updateStatusQueryKey, next))
          .catch((error) =>
            console.warn('[useUpdateStatus] failed to read status', error),
          )
      },
    )
  }, [])

  return status
}

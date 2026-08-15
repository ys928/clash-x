import type { Update } from '@tauri-apps/plugin-updater'
import { useState } from 'react'

import { fetchCacheData, useQuery } from '@/services/query-client'
import { checkUpdateSafe } from '@/services/update'

/**
 * On-demand Update object for download/install in the dialog.
 * Background detection is handled by the Rust UpdateChecker.
 */
export const useUpdate = () => {
  const [packageInfo, setPackageInfo] = useState<Update | null>(null)

  const fetchUpdate = async () => {
    const result = await checkUpdateSafe()
    setPackageInfo(result)
    return result
  }

  const { isFetching: isValidating } = useQuery({
    queryKey: ['checkUpdate'],
    queryFn: fetchUpdate,
    enabled: false,
    retry: 2,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const checkUpdate = async () => {
    const data = await fetchCacheData(['checkUpdate'], fetchUpdate)
    return { data }
  }

  return {
    updateInfo: packageInfo,
    checkUpdate,
    loading: isValidating,
  }
}

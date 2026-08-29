import { invoke } from '@tauri-apps/api/core'

export type DomainTrafficRange = 'day' | 'week' | 'month' | 'year'

export interface DomainTrafficItem {
  domain: string
  proxyUpload: number
  proxyDownload: number
  directUpload: number
  directDownload: number
  proxyTotal: number
  directTotal: number
  total: number
}

export interface DomainTrafficTotals {
  proxyUpload: number
  proxyDownload: number
  directUpload: number
  directDownload: number
  proxyTotal: number
  directTotal: number
  total: number
}

export interface DomainTrafficStats {
  range: DomainTrafficRange
  fromDay: string
  toDay: string
  totals: DomainTrafficTotals
  items: DomainTrafficItem[]
}

export interface ClearDomainTrafficResult {
  removedDays: number
}

export async function getDomainTrafficStats(range: DomainTrafficRange) {
  return invoke<DomainTrafficStats>('get_domain_traffic_stats', { range })
}

/** Delete day buckets strictly before `beforeDay` (`YYYY-MM-DD`). */
export async function clearDomainTrafficBefore(beforeDay: string) {
  return invoke<ClearDomainTrafficResult>('clear_domain_traffic_before', {
    beforeDay,
  })
}

export async function clearDomainTrafficStats() {
  return invoke<ClearDomainTrafficResult>('clear_domain_traffic_stats')
}

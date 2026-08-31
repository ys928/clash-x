import { describe, expect, it } from 'vitest'

import type { ProxyGroupView, ProxyViewV1 } from '@/types/proxy-view'
import { resolvePrimaryProxyGroup } from '@/vue/utils/resolve-primary-proxy-group'

const group = (
  name: string,
  type = 'Selector',
  hidden = false,
): ProxyGroupView => ({
  name,
  type,
  alive: true,
  history: [],
  members: [],
  udp: false,
  xudp: false,
  tfo: false,
  mptcp: false,
  smux: false,
  hidden,
})

const view = (
  groups: ProxyGroupView[],
  global: ProxyGroupView | null = null,
): ProxyViewV1 => ({
  schemaVersion: 1,
  orderSource: 'runtime',
  providerState: 'ready',
  global,
  direct: 'DIRECT',
  groups,
  records: {},
  standalone: [],
  providers: [],
})

describe('resolvePrimaryProxyGroup', () => {
  it('returns null in direct mode', () => {
    expect(
      resolvePrimaryProxyGroup(view([group('节点选择')]), 'direct'),
    ).toBeNull()
  })

  it('returns GLOBAL in global mode', () => {
    const global = group('GLOBAL')
    expect(resolvePrimaryProxyGroup(view([], global), 'global')).toBe(global)
  })

  it('prefers exact 节点选择 in rule mode', () => {
    const primary = group('节点选择')
    const other = group('自动选择', 'URLTest')
    expect(resolvePrimaryProxyGroup(view([other, primary]), 'rule')).toBe(
      primary,
    )
  })

  it('falls back to keyword match then first selectable', () => {
    const proxy = group('My Proxy')
    expect(resolvePrimaryProxyGroup(view([proxy]), 'rule')).toBe(proxy)
  })

  it('skips hidden and non-selectable groups', () => {
    const hidden = group('节点选择', 'Selector', true)
    const loadBalance = group('LB', 'LoadBalance')
    const selectable = group('Select')
    expect(
      resolvePrimaryProxyGroup(view([hidden, loadBalance, selectable]), 'rule'),
    ).toBe(selectable)
  })
})

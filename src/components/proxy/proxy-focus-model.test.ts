import { describe, expect, test } from 'vitest'

import type { ProxyGroupView } from '@/types/proxy-view'

import { pickPrimaryGroup, resolveFocusedGroupName } from './proxy-focus-model'

const group = (
  name: string,
  type = 'Selector',
  hidden = false,
): ProxyGroupView =>
  ({
    name,
    type,
    hidden,
    alive: true,
    members: [],
    history: [],
    udp: false,
    xudp: false,
    tfo: false,
    mptcp: false,
    smux: false,
  }) as ProxyGroupView

describe('pickPrimaryGroup', () => {
  test('prefers a keyword match over earlier groups', () => {
    const groups = [
      group('Netflix', 'Selector'),
      group('🚀 节点选择', 'Selector'),
      group('Telegram', 'Selector'),
    ]
    expect(pickPrimaryGroup(groups)?.name).toBe('🚀 节点选择')
  })

  test('falls back to the first selectable group', () => {
    const groups = [group('Netflix', 'Selector'), group('Telegram', 'URLTest')]
    expect(pickPrimaryGroup(groups)?.name).toBe('Netflix')
  })

  test('skips hidden groups', () => {
    const groups = [
      group('Hidden Main', 'Selector', true),
      group('Visible', 'Selector'),
    ]
    expect(pickPrimaryGroup(groups)?.name).toBe('Visible')
  })
})

describe('resolveFocusedGroupName', () => {
  const groups = [group('节点选择'), group('Netflix'), group('Telegram')]

  test('keeps the current selection when still valid', () => {
    expect(
      resolveFocusedGroupName(groups, {
        currentName: 'Netflix',
        savedName: '节点选择',
      }),
    ).toBe('Netflix')
  })

  test('uses the saved preference when current is stale', () => {
    expect(
      resolveFocusedGroupName(groups, {
        currentName: 'Gone',
        savedName: 'Telegram',
      }),
    ).toBe('Telegram')
  })

  test('falls back to the primary group', () => {
    expect(resolveFocusedGroupName(groups, {})).toBe('节点选择')
  })
})

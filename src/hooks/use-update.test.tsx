// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

import { useUpdate } from './use-update'

const check = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/plugin-updater', () => ({ check }))

beforeEach(() => {
  check.mockReset()
})

test('manual update check returns available update package', async () => {
  const availableUpdate = {
    version: '9.9.9',
    body: 'notes',
    close: vi.fn(),
  }
  check.mockResolvedValueOnce(availableUpdate)
  const { result } = renderHook(() => useUpdate())

  let checked
  await act(async () => {
    checked = await result.current.checkUpdate()
  })

  expect(check).toHaveBeenCalledOnce()
  expect(checked).toEqual({ data: availableUpdate })
  expect(result.current.updateInfo).toEqual(availableUpdate)
})

test('manual update check returns null when already up to date', async () => {
  check.mockResolvedValueOnce(null)
  const { result } = renderHook(() => useUpdate())

  let checked
  await act(async () => {
    checked = await result.current.checkUpdate()
  })

  expect(checked).toEqual({ data: null })
  expect(result.current.updateInfo).toBeNull()
})

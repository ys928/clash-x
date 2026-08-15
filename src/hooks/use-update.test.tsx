// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

import { useUpdate } from './use-update'

const check = vi.hoisted(() => vi.fn())
const getUpdaterClashProxy = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/plugin-updater', () => ({ check }))
vi.mock('@/services/cmds', () => ({ getUpdaterClashProxy }))

beforeEach(() => {
  check.mockReset()
  getUpdaterClashProxy.mockReset()
  getUpdaterClashProxy.mockResolvedValue(null)
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

test('manual update check retries via Clash proxy then direct', async () => {
  getUpdaterClashProxy.mockResolvedValueOnce('http://127.0.0.1:7897')
  check.mockRejectedValueOnce(new Error('proxy failed')).mockResolvedValueOnce({
    version: '9.9.9',
    body: 'notes',
    close: vi.fn(),
  })

  const { result } = renderHook(() => useUpdate())

  let checked:
    | Awaited<ReturnType<typeof result.current.checkUpdate>>
    | undefined
  await act(async () => {
    checked = await result.current.checkUpdate()
  })

  expect(check).toHaveBeenCalledTimes(2)
  expect(check).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      proxy: 'http://127.0.0.1:7897',
      allowDowngrades: false,
    }),
  )
  expect(check).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      proxy: undefined,
      allowDowngrades: false,
    }),
  )
  expect(checked?.data?.version).toBe('9.9.9')
})

// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { getSnapshotNotices, hideNotice } from '@/services/notice-service'
import {
  clearServiceRequest,
  getServiceRequest,
} from '@/services/service-request'

import ProxyControlSwitches from './proxy-control-switches'

const patchVerge = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const mutateVerge = vi.hoisted(() => vi.fn())
const isTunModeAvailable = vi.hoisted(() => ({ current: false }))
const tunEnabled = vi.hoisted(() => ({ current: false }))
const systemProxyOn = vi.hoisted(() => ({ current: false }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/hooks/use-verge', () => ({
  useVerge: () => ({
    verge: { enable_tun_mode: tunEnabled.current },
    mutateVerge,
    patchVerge,
  }),
}))
vi.mock('@/hooks/use-system-state', () => ({
  useSystemState: () => ({
    runState: { serviceUsable: false },
    isTunModeAvailable: isTunModeAvailable.current,
  }),
}))
vi.mock('@/hooks/use-system-proxy-state', () => ({
  useSystemProxyState: () => ({
    indicator: systemProxyOn.current,
    toggleSystemProxy: vi.fn(),
  }),
}))
vi.mock('@/hooks/use-service-uninstaller', () => ({
  useServiceUninstaller: () => ({ uninstallServiceAndStartSidecar: vi.fn() }),
}))
vi.mock('@/components/setting/mods/sysproxy-viewer', () => ({
  SysproxyViewer: () => null,
}))
vi.mock('@/components/setting/mods/tun-viewer', () => ({
  TunViewer: () => null,
}))

afterEach(() => {
  patchVerge.mockClear()
  mutateVerge.mockClear()
  isTunModeAvailable.current = false
  tunEnabled.current = false
  systemProxyOn.current = false
  clearServiceRequest()
  getSnapshotNotices().forEach((notice) => hideNotice(notice.id))
  cleanup()
})

const renderTun = () =>
  render(
    <ProxyControlSwitches label="settings.sections.system.toggles.tunMode" />,
  )

const theSwitch = () => screen.getByRole('switch') as HTMLInputElement
const flip = () => fireEvent.click(theSwitch())

it('asks for the service when TUN cannot work, saying what it was for', async () => {
  renderTun()

  flip()

  await waitFor(() =>
    expect(getServiceRequest()).toEqual({
      reason: 'tunNeedsService',
      restore: { enable_tun_mode: true },
    }),
  )
  expect(patchVerge).not.toHaveBeenCalled()
})

it('leaves the switch where it was until something can carry the request', async () => {
  renderTun()

  flip()

  await waitFor(() => expect(theSwitch().checked).toBe(false))
})

it('patches directly when the service can already carry it', async () => {
  isTunModeAvailable.current = true
  renderTun()

  flip()

  await waitFor(() =>
    expect(patchVerge).toHaveBeenCalledWith({ enable_tun_mode: true }),
  )
  expect(getServiceRequest()).toBeNull()
})

it('no longer offers a separate install button', () => {
  renderTun()

  expect(
    screen.queryByLabelText(
      'settings.sections.proxyControl.actions.installService',
    ),
  ).toBeNull()
})

it('does not ask for a service in order to turn TUN off', async () => {
  tunEnabled.current = true
  renderTun()

  flip()

  await waitFor(() =>
    expect(patchVerge).toHaveBeenCalledWith({ enable_tun_mode: false }),
  )
  expect(getServiceRequest()).toBeNull()
})

it('says nothing beside the dialog it just opened', async () => {
  const onError = vi.fn()
  render(
    <ProxyControlSwitches
      label="settings.sections.system.toggles.tunMode"
      onError={onError}
    />,
  )

  flip()

  await waitFor(() => expect(getServiceRequest()).not.toBeNull())
  await waitFor(() => expect(theSwitch().checked).toBe(false))
  expect(onError).not.toHaveBeenCalled()
  expect(getSnapshotNotices()).toEqual([])
})

it('guides users with a status line and keeps enhanced mode collapsed', () => {
  render(<ProxyControlSwitches />)

  expect(
    screen.getByText('home.components.proxyTun.status.inactive'),
  ).toBeTruthy()
  expect(
    screen.getByText('home.components.proxyTun.badges.recommended'),
  ).toBeTruthy()
  expect(
    screen.getByText('home.components.proxyTun.actions.showAdvanced'),
  ).toBeTruthy()
  expect(screen.getAllByRole('switch')).toHaveLength(1)
})

it('warns clearly when neither path is active, and softens when both are', () => {
  systemProxyOn.current = true
  tunEnabled.current = true
  render(<ProxyControlSwitches />)

  expect(screen.getByText('home.components.proxyTun.status.both')).toBeTruthy()
})

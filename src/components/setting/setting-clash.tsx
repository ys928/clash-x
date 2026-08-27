import { LanRounded } from '@mui/icons-material'
import { MenuItem, Select, TextField, Typography } from '@mui/material'
import { useLockFn } from 'ahooks'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { updateGeo } from 'tauri-plugin-mihomo-api'

import { DialogRef, Switch, TooltipIcon } from '@/components/base'
import { useClash } from '@/hooks/use-clash'
import { useDisplayedMixedPort } from '@/hooks/use-displayed-mixed-port'
import { invoke_uwp_tool, restartCore } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import getSystem from '@/utils/get-system'

import { ClashPortViewer } from './mods/clash-port-viewer'
import { GuardState } from './mods/guard-state'
import { NetworkInterfaceViewer } from './mods/network-interface-viewer'
import { SettingItem, SettingList } from './mods/setting-comp'
import { TunnelsViewer } from './mods/tunnels-viewer'

const isWIN = getSystem() === 'windows'

interface Props {
  onError: (err: Error) => void
}

const SettingClash = ({ onError }: Props) => {
  const { t } = useTranslation()

  const { clash, version, mutateClash, patchClash } = useClash()
  const displayedMixedPort = useDisplayedMixedPort()

  const {
    ipv6,
    'allow-lan': allowLan,
    'log-level': logLevel,
    'unified-delay': unifiedDelay,
  } = clash ?? {}

  const portRef = useRef<DialogRef>(null)
  const networkRef = useRef<DialogRef>(null)
  const tunnelRef = useRef<DialogRef>(null)

  const onSwitchFormat = (_e: any, value: boolean) => value
  const onChangeData = (patch: Partial<IConfigData>) => {
    mutateClash((old) => ({ ...old!, ...patch }), false)
  }
  const onUpdateGeo = async () => {
    try {
      await updateGeo()
      showNotice.success('settings.feedback.notifications.clash.geoDataUpdated')
    } catch (err: any) {
      showNotice.error(err)
    }
  }

  const onRestartCore = useLockFn(async () => {
    try {
      await restartCore()
      showNotice.success(
        t('settings.feedback.notifications.clash.restartSuccess'),
      )
    } catch (err: any) {
      showNotice.error(err)
    }
  })

  return (
    <SettingList title={t('settings.sections.clash.title')}>
      <ClashPortViewer ref={portRef} />
      <NetworkInterfaceViewer ref={networkRef} />
      <TunnelsViewer ref={tunnelRef} />
      <SettingItem
        label={t('settings.sections.clash.form.fields.allowLan')}
        extra={
          <TooltipIcon
            title={t('settings.sections.clash.form.tooltips.networkInterface')}
            color={'inherit'}
            icon={LanRounded}
            onClick={() => {
              networkRef.current?.open()
            }}
          />
        }
      >
        <GuardState
          value={allowLan ?? false}
          valueProps="checked"
          onCatch={onError}
          onFormat={onSwitchFormat}
          onChange={(e) => onChangeData({ 'allow-lan': e })}
          onGuard={(e) => patchClash({ 'allow-lan': e })}
        >
          <Switch edge="end" />
        </GuardState>
      </SettingItem>

      <SettingItem label={t('settings.sections.clash.form.fields.ipv6')}>
        <GuardState
          value={ipv6 ?? false}
          valueProps="checked"
          onCatch={onError}
          onFormat={onSwitchFormat}
          onChange={(e) => onChangeData({ ipv6: e })}
          onGuard={(e) => patchClash({ ipv6: e })}
        >
          <Switch edge="end" />
        </GuardState>
      </SettingItem>

      <SettingItem
        label={t('settings.sections.clash.form.fields.unifiedDelay')}
        extra={
          <TooltipIcon
            title={t('settings.sections.clash.form.tooltips.unifiedDelay')}
            sx={{ opacity: '0.7' }}
          />
        }
      >
        <GuardState
          value={unifiedDelay ?? false}
          valueProps="checked"
          onCatch={onError}
          onFormat={onSwitchFormat}
          onChange={(e) => onChangeData({ 'unified-delay': e })}
          onGuard={(e) => patchClash({ 'unified-delay': e })}
        >
          <Switch edge="end" />
        </GuardState>
      </SettingItem>

      <SettingItem
        label={t('settings.sections.clash.form.fields.logLevel')}
        extra={
          <TooltipIcon
            title={t('settings.sections.clash.form.tooltips.logLevel')}
            sx={{ opacity: '0.7' }}
          />
        }
      >
        <GuardState
          value={logLevel === 'warn' ? 'warning' : (logLevel ?? 'info')}
          onCatch={onError}
          onFormat={(e: any) => e.target.value}
          onChange={(e) => onChangeData({ 'log-level': e })}
          onGuard={(e) => patchClash({ 'log-level': e })}
        >
          <Select size="small" sx={{ width: 100, '> div': { py: '7.5px' } }}>
            <MenuItem value="debug">
              {t('settings.sections.clash.form.options.logLevel.debug')}
            </MenuItem>
            <MenuItem value="info">
              {t('settings.sections.clash.form.options.logLevel.info')}
            </MenuItem>
            <MenuItem value="warning">
              {t('settings.sections.clash.form.options.logLevel.warning')}
            </MenuItem>
            <MenuItem value="error">
              {t('settings.sections.clash.form.options.logLevel.error')}
            </MenuItem>
            <MenuItem value="silent">
              {t('settings.sections.clash.form.options.logLevel.silent')}
            </MenuItem>
          </Select>
        </GuardState>
      </SettingItem>

      <SettingItem label={t('settings.sections.clash.form.fields.portConfig')}>
        <TextField
          autoComplete="new-password"
          disabled={false}
          size="small"
          value={displayedMixedPort}
          sx={{ width: 100, input: { py: '7.5px', cursor: 'pointer' } }}
          onClick={(e) => {
            portRef.current?.open()
            ;(e.target as HTMLElement).blur()
          }}
        />
      </SettingItem>

      <SettingItem label={t('settings.sections.clash.form.fields.clashCore')}>
        <Typography sx={{ py: '7px', pr: 1 }}>{version}</Typography>
      </SettingItem>

      <SettingItem
        onClick={onRestartCore}
        label={t('proxies.page.empty.actions.restartCore')}
      />

      {isWIN && (
        <SettingItem
          onClick={invoke_uwp_tool}
          label={t('settings.sections.clash.form.fields.openUwpTool')}
          extra={
            <TooltipIcon
              title={t('settings.sections.clash.form.tooltips.openUwpTool')}
              sx={{ opacity: '0.7' }}
            />
          }
        />
      )}

      <SettingItem
        onClick={onUpdateGeo}
        label={t('settings.sections.clash.form.fields.updateGeoData')}
      />

      <SettingItem
        label={t('settings.sections.clash.form.fields.tunnels.title')}
        onClick={() => tunnelRef.current?.open()}
      />
    </SettingList>
  )
}

export default SettingClash

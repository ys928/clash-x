import { MoreVert, SyncAltRounded } from '@mui/icons-material'
import { Box, Divider, IconButton, Menu, MenuItem } from '@mui/material'
import { useLockFn } from 'ahooks'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { closeAllConnections } from 'tauri-plugin-mihomo-api'

import { AutoSwitchPanel } from '@/components/proxy/auto-switch-panel'
import { ProviderButton } from '@/components/proxy/provider-button'
import { ProxyGroups } from '@/components/proxy/proxy-groups'
import { AppPage, AppTooltip } from '@/components/ui'
import { useAutoSwitchGroups } from '@/hooks/use-auto-switch-groups'
import { useVerge } from '@/hooks/use-verge'
import {
  useAppRefreshers,
  useClashConfigData,
} from '@/providers/app-data-context'
import { patchClashMode } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'

const MODES = ['rule', 'global', 'direct'] as const
type Mode = (typeof MODES)[number]
const MODE_SET = new Set<string>(MODES)
const isMode = (value: unknown): value is Mode =>
  typeof value === 'string' && MODE_SET.has(value)

const ProxyPage = () => {
  const { t } = useTranslation()

  const [overflowAnchor, setOverflowAnchor] = useState<null | HTMLElement>(null)
  const [autoSwitchOpen, setAutoSwitchOpen] = useState(false)
  const { enabledCount: autoSwitchEnabledCount } = useAutoSwitchGroups()

  const { clashConfig } = useClashConfigData()
  const { refreshClashConfig } = useAppRefreshers()
  const { verge } = useVerge()

  const normalizedMode = clashConfig?.mode?.toLowerCase()
  const curMode = isMode(normalizedMode) ? normalizedMode : undefined

  const onChangeMode = useLockFn(async (mode: Mode) => {
    if (mode !== curMode && verge?.auto_close_connection) {
      closeAllConnections()
    }
    try {
      await patchClashMode(mode)
      refreshClashConfig()
    } catch (error) {
      showNotice.error(error)
    }
  })

  useEffect(() => {
    if (normalizedMode && !isMode(normalizedMode)) {
      onChangeMode('rule')
    }
  }, [normalizedMode, onChangeMode])

  return (
    <AppPage
      full
      contentStyle={{ height: '100%' }}
      title={t('proxies.page.title.default')}
      header={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <AppTooltip
            title={
              autoSwitchEnabledCount > 0
                ? t('proxies.page.autoSwitch.activeTooltip', {
                    count: autoSwitchEnabledCount,
                  })
                : t('proxies.page.autoSwitch.title')
            }
          >
            <IconButton
              size="small"
              color={autoSwitchEnabledCount > 0 ? 'primary' : 'inherit'}
              onClick={() => setAutoSwitchOpen(true)}
              aria-label={t('proxies.page.autoSwitch.title')}
            >
              <SyncAltRounded fontSize="small" />
            </IconButton>
          </AppTooltip>
          <IconButton
            size="small"
            color="inherit"
            onClick={(event) => setOverflowAnchor(event.currentTarget)}
            aria-label={t('proxies.page.actions.more')}
          >
            <MoreVert fontSize="small" />
          </IconButton>
          <Menu
            anchorEl={overflowAnchor}
            open={Boolean(overflowAnchor)}
            onClose={() => setOverflowAnchor(null)}
            slotProps={{ paper: { sx: { minWidth: 220 } } }}
          >
            <Box sx={{ px: 1.5, py: 1 }}>
              <ProviderButton />
            </Box>
            <Divider />
            {MODES.map((mode) => (
              <MenuItem
                key={mode}
                selected={mode === curMode}
                onClick={() => {
                  setOverflowAnchor(null)
                  void onChangeMode(mode)
                }}
                sx={{ textTransform: 'capitalize' }}
              >
                {t(`proxies.page.modes.${mode}`)}
              </MenuItem>
            ))}
            <Divider />
            <MenuItem
              onClick={() => {
                setOverflowAnchor(null)
                setAutoSwitchOpen(true)
              }}
            >
              <SyncAltRounded fontSize="small" sx={{ mr: 1 }} />
              {t('proxies.page.autoSwitch.title')}
            </MenuItem>
          </Menu>
        </Box>
      }
    >
      <ProxyGroups mode={curMode ?? 'rule'} />
      <AutoSwitchPanel
        open={autoSwitchOpen}
        onClose={() => setAutoSwitchOpen(false)}
      />
    </AppPage>
  )
}

export default ProxyPage

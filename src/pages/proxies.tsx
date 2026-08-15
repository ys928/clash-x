import {
  LanOutlined,
  LanRounded,
  MoreVert,
  SyncAltRounded,
  WarningRounded,
} from '@mui/icons-material'
import { Badge, Box, Divider, IconButton, Menu, MenuItem } from '@mui/material'
import { useLockFn } from 'ahooks'
import { useCallback, useEffect, useReducer, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { closeAllConnections } from 'tauri-plugin-mihomo-api'

import { BasePage, BaseTooltip, TooltipIcon } from '@/components/base'
import { AutoSwitchPanel } from '@/components/proxy/auto-switch-panel'
import { ProviderButton } from '@/components/proxy/provider-button'
import { ProxyGroups } from '@/components/proxy/proxy-groups'
import { useAutoSwitchGroups } from '@/hooks/use-auto-switch-groups'
import { useVerge } from '@/hooks/use-verge'
import {
  useAppRefreshers,
  useClashConfigData,
} from '@/providers/app-data-context'
import {
  getRuntimeProxyChainConfig,
  patchClashMode,
  updateProxyChainConfigInRuntime,
} from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import { debugLog } from '@/utils/debug'

const MODES = ['rule', 'global', 'direct'] as const
type Mode = (typeof MODES)[number]
const MODE_SET = new Set<string>(MODES)
const isMode = (value: unknown): value is Mode =>
  typeof value === 'string' && MODE_SET.has(value)

const ProxyPage = () => {
  const { t } = useTranslation()

  const [isChainMode, setIsChainMode] = useState(() => {
    try {
      const saved = localStorage.getItem('proxy-chain-mode-enabled')
      return saved === 'true'
    } catch {
      return false
    }
  })

  const [chainConfigData, dispatchChainConfigData] = useReducer(
    (_: string | null, action: string | null) => action,
    null as string | null,
  )
  const [overflowAnchor, setOverflowAnchor] = useState<null | HTMLElement>(null)
  const [autoSwitchOpen, setAutoSwitchOpen] = useState(false)
  const { enabledCount: autoSwitchEnabledCount } = useAutoSwitchGroups()

  const { clashConfig } = useClashConfigData()
  const { refreshClashConfig } = useAppRefreshers()

  const updateChainConfigData = useCallback((value: string | null) => {
    dispatchChainConfigData(value)
  }, [])
  const { verge } = useVerge()

  const normalizedMode = clashConfig?.mode?.toLowerCase()
  const curMode = isMode(normalizedMode) ? normalizedMode : undefined
  const chainWarning = t('proxies.page.chain.warning')

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

  const onToggleChainMode = useLockFn(async () => {
    const newChainMode = !isChainMode

    setIsChainMode(newChainMode)
    localStorage.setItem('proxy-chain-mode-enabled', newChainMode.toString())

    if (!newChainMode) {
      try {
        debugLog('Exiting chain mode, clearing chain configuration')
        await updateProxyChainConfigInRuntime(null)
        debugLog('Chain configuration cleared successfully')
      } catch (error) {
        console.error('Failed to clear chain configuration:', error)
      }
    }
  })

  useEffect(() => {
    if (!isChainMode) {
      updateChainConfigData(null)
      return
    }

    let cancelled = false

    const fetchChainConfig = async () => {
      try {
        const exitNode = localStorage.getItem('proxy-chain-exit-node')

        if (!exitNode) {
          console.error('No proxy chain exit node found in localStorage')
          if (!cancelled) {
            updateChainConfigData('')
          }
          return
        }

        const configData = await getRuntimeProxyChainConfig(exitNode)
        if (!cancelled) {
          updateChainConfigData(configData || '')
        }
      } catch (error) {
        console.error('Failed to get runtime proxy chain config:', error)
        if (!cancelled) {
          updateChainConfigData('')
        }
      }
    }

    fetchChainConfig()

    return () => {
      cancelled = true
    }
  }, [isChainMode, updateChainConfigData])

  useEffect(() => {
    if (normalizedMode && !isMode(normalizedMode)) {
      onChangeMode('rule')
    }
  }, [normalizedMode, onChangeMode])

  return (
    <BasePage
      full
      contentStyle={{ height: '100%' }}
      title={
        isChainMode ? (
          <Box
            component="span"
            data-tauri-drag-region="true"
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}
          >
            {t('proxies.page.title.chainMode')}
            <TooltipIcon
              title={chainWarning}
              icon={WarningRounded}
              color="warning"
              sx={{ p: 0.25 }}
            />
          </Box>
        ) : (
          t('proxies.page.title.default')
        )
      }
      header={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <BaseTooltip title={t('proxies.page.autoSwitch.title')}>
            <IconButton
              size="small"
              color={autoSwitchEnabledCount > 0 ? 'primary' : 'inherit'}
              onClick={() => setAutoSwitchOpen(true)}
              aria-label={t('proxies.page.autoSwitch.title')}
            >
              <Badge
                color="primary"
                badgeContent={autoSwitchEnabledCount || undefined}
                overlap="circular"
              >
                <SyncAltRounded fontSize="small" />
              </Badge>
            </IconButton>
          </BaseTooltip>
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
            <MenuItem
              selected={isChainMode}
              onClick={() => {
                setOverflowAnchor(null)
                void onToggleChainMode()
              }}
            >
              {isChainMode ? (
                <LanRounded fontSize="small" sx={{ mr: 1 }} />
              ) : (
                <LanOutlined fontSize="small" sx={{ mr: 1 }} />
              )}
              {t('proxies.page.actions.toggleChain')}
            </MenuItem>
          </Menu>
        </Box>
      }
    >
      <ProxyGroups
        mode={curMode ?? 'rule'}
        isChainMode={isChainMode}
        chainConfigData={chainConfigData}
      />
      <AutoSwitchPanel
        open={autoSwitchOpen}
        onClose={() => setAutoSwitchOpen(false)}
      />
    </BasePage>
  )
}

export default ProxyPage

import { RefreshRounded, StorageOutlined } from '@mui/icons-material'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Typography,
  alpha,
} from '@mui/material'
import { useLockFn } from 'ahooks'
import dayjs from 'dayjs'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { updateRuleProvider } from 'tauri-plugin-mihomo-api'

import { useAppRefreshers, useRulesData } from '@/providers/app-data-context'
import { showNotice } from '@/services/notice-service'

export const ProviderButton = () => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { ruleProviders } = useRulesData()
  const { refreshRules, refreshRuleProviders } = useAppRefreshers()
  const [updating, setUpdating] = useState<Record<string, boolean>>({})

  const providers = useMemo(
    () =>
      Object.entries(ruleProviders || {}).sort(([a], [b]) =>
        a.localeCompare(b),
      ),
    [ruleProviders],
  )

  const hasProviders = providers.length > 0
  const isUpdatingAny = Object.values(updating).some(Boolean)

  const updateProvider = useLockFn(async (name: string) => {
    try {
      setUpdating((prev) => ({ ...prev, [name]: true }))
      await updateRuleProvider(name)
      await refreshRules()
      await refreshRuleProviders()
      showNotice.success(
        'rules.feedback.notifications.provider.updateSuccess',
        { name },
      )
    } catch (err) {
      showNotice.error('rules.feedback.notifications.provider.updateFailed', {
        name,
        message: String(err),
      })
    } finally {
      setUpdating((prev) => ({ ...prev, [name]: false }))
    }
  })

  const updateAllProviders = useLockFn(async () => {
    try {
      const allProviders = providers.map(([name]) => name)
      if (allProviders.length === 0) {
        showNotice.info('rules.feedback.notifications.provider.none')
        return
      }

      setUpdating(
        allProviders.reduce<Record<string, boolean>>((acc, key) => {
          acc[key] = true
          return acc
        }, {}),
      )

      for (const name of allProviders) {
        try {
          await updateRuleProvider(name)
          setUpdating((prev) => ({ ...prev, [name]: false }))
        } catch (err) {
          console.error(`更新 ${name} 失败`, err)
        }
      }

      await refreshRules()
      await refreshRuleProviders()
      showNotice.success('rules.feedback.notifications.provider.allUpdated')
    } catch (err) {
      showNotice.error('rules.feedback.notifications.provider.genericError', {
        message: String(err),
      })
    } finally {
      setUpdating({})
    }
  })

  if (!hasProviders) return null

  return (
    <>
      <Button
        variant="outlined"
        size="small"
        startIcon={<StorageOutlined />}
        onClick={() => setOpen(true)}
      >
        {t('rules.page.provider.trigger')}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
            }}
          >
            <Box>
              <Typography variant="h6" component="div">
                {t('rules.page.provider.dialogTitle')}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t('rules.page.stats.providers', { count: providers.length })}
              </Typography>
            </Box>
            <Button
              variant="contained"
              size="small"
              disabled={isUpdatingAny}
              onClick={updateAllProviders}
            >
              {t('rules.page.provider.actions.updateAll')}
            </Button>
          </Box>
        </DialogTitle>

        {isUpdatingAny && <LinearProgress sx={{ mx: 3 }} />}

        <DialogContent sx={{ pt: 1.5 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {providers.map(([key, provider]) => {
              const time = dayjs(provider.updatedAt)
              const isUpdating = updating[key]
              const vehicle =
                typeof provider.vehicleType === 'string'
                  ? provider.vehicleType
                  : provider.vehicleType.Unknown
              const behavior =
                typeof provider.behavior === 'string'
                  ? provider.behavior
                  : provider.behavior.Unknown

              return (
                <Box
                  key={key}
                  sx={(theme) => ({
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    px: 1.5,
                    py: 1.25,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: alpha(theme.palette.divider, 0.9),
                    bgcolor: theme.palette.background.paper,
                    transition:
                      'background-color 0.15s ease, border-color 0.15s ease',
                    '&:hover': {
                      bgcolor: alpha(
                        theme.palette.primary.main,
                        theme.palette.mode === 'light' ? 0.04 : 0.1,
                      ),
                      borderColor: alpha(theme.palette.primary.main, 0.35),
                    },
                  })}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1,
                      }}
                    >
                      <Typography
                        variant="subtitle2"
                        noWrap
                        title={key}
                        sx={{ fontWeight: 700 }}
                      >
                        {key}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        noWrap
                        sx={{ flexShrink: 0 }}
                      >
                        {time.fromNow()}
                      </Typography>
                    </Box>

                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 0.75,
                        mt: 0.75,
                      }}
                    >
                      <MetaChip label={`${provider.ruleCount}`} />
                      <MetaChip label={vehicle} />
                      <MetaChip label={behavior} />
                    </Box>
                  </Box>

                  <IconButton
                    size="small"
                    color="primary"
                    onClick={() => updateProvider(key)}
                    disabled={isUpdating}
                    aria-label={t('rules.page.provider.actions.update')}
                    title={t('rules.page.provider.actions.update')}
                    sx={{
                      flexShrink: 0,
                      animation: isUpdating
                        ? 'spin 1s linear infinite'
                        : 'none',
                      '@keyframes spin': {
                        '0%': { transform: 'rotate(0deg)' },
                        '100%': { transform: 'rotate(360deg)' },
                      },
                    }}
                  >
                    <RefreshRounded />
                  </IconButton>
                </Box>
              )
            })}
          </Box>
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setOpen(false)} variant="outlined">
            {t('shared.actions.close')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

const MetaChip = ({ label }: { label: string }) => (
  <Box
    component="span"
    sx={(theme) => ({
      display: 'inline-flex',
      alignItems: 'center',
      px: 0.75,
      py: 0.125,
      borderRadius: 1,
      fontSize: 11,
      fontWeight: 600,
      lineHeight: 1.4,
      border: '1px solid',
      borderColor: alpha(theme.palette.secondary.main, 0.4),
      color: alpha(theme.palette.secondary.main, 0.95),
      bgcolor: alpha(
        theme.palette.secondary.main,
        theme.palette.mode === 'light' ? 0.06 : 0.12,
      ),
    })}
  >
    {label}
  </Box>
)

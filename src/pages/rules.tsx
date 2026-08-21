import { EditRounded, RefreshRounded } from '@mui/icons-material'
import {
  Box,
  Button,
  Chip,
  Fade,
  IconButton,
  MenuItem,
  Select,
  Typography,
  alpha,
} from '@mui/material'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { VirtualList, type VirtualListHandle } from '@/components/base'
import { ScrollTopButton } from '@/components/layout/scroll-top-button'
import { RulesEditorViewer } from '@/components/profile/rules-editor-viewer'
import { ProviderButton } from '@/components/rule/provider-button'
import RuleItem from '@/components/rule/rule-item'
import { AppEmpty, AppPage, AppSearchField } from '@/components/ui'
import { useProfiles } from '@/hooks/use-profiles'
import { useVisibility } from '@/hooks/use-visibility'
import { useAppRefreshers, useRulesData } from '@/providers/app-data-context'

const ALL = '__all__'

const resolveType = (type: unknown) =>
  typeof type === 'string'
    ? type
    : String((type as { Unknown?: string })?.Unknown ?? type)

const controlSx = {
  height: 34,
  borderRadius: 1.5,
  bgcolor: 'background.paper',
  outline: 'none',
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: 'divider',
  },
  '&:hover .MuiOutlinedInput-notchedOutline': {
    borderColor: 'divider',
  },
  '&.Mui-focused': {
    outline: 'none',
  },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
    borderWidth: 1,
    borderColor: 'divider',
  },
  '&.Mui-focused:hover .MuiOutlinedInput-notchedOutline': {
    borderColor: 'divider',
  },
  '& .MuiInputBase-input': {
    outline: 'none',
  },
  '& .MuiInputBase-input:focus': {
    outline: 'none',
  },
} as const

const menuItemSx = {
  mx: 0.5,
  px: 1.25,
  py: 0.75,
  minHeight: 34,
  borderRadius: 1.25,
  fontSize: 13,
} as const

const RulesPage = () => {
  const { t } = useTranslation()
  const { rules = [], ruleProviders } = useRulesData()
  const { refreshRules, refreshRuleProviders } = useAppRefreshers()
  const { current } = useProfiles()
  const [match, setMatch] = useState(() => (_: string) => true)
  const [typeFilter, setTypeFilter] = useState(ALL)
  const [policyFilter, setPolicyFilter] = useState(ALL)
  const [refreshing, setRefreshing] = useState(false)
  const [globalEditorOpen, setGlobalEditorOpen] = useState(false)
  const virtuosoRef = useRef<VirtualListHandle>(null)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const pageVisible = useVisibility()

  useEffect(() => {
    refreshRules()
    refreshRuleProviders()

    if (pageVisible) {
      refreshRules()
      refreshRuleProviders()
    }
  }, [refreshRules, refreshRuleProviders, pageVisible])

  const providerCount = useMemo(
    () => Object.keys(ruleProviders || {}).length,
    [ruleProviders],
  )

  const typeOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const rule of rules) {
      const type = resolveType(rule.type)
      counts.set(type, (counts.get(type) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([type, count]) => ({ type, count }))
  }, [rules])

  const policyOptions = useMemo(() => {
    const set = new Set<string>()
    for (const rule of rules) {
      if (rule.proxy) set.add(rule.proxy)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [rules])

  const filteredRules = useMemo(() => {
    const rulesWithLineNo = rules.map((item, index) => ({
      ...item,
      lineNo: index + 1,
    }))

    return rulesWithLineNo.filter((item) => {
      const type = resolveType(item.type)
      if (typeFilter !== ALL && type !== typeFilter) return false
      if (policyFilter !== ALL && item.proxy !== policyFilter) return false

      const haystack = `${item.payload ?? ''} ${type} ${item.proxy ?? ''}`
      return match(haystack)
    })
  }, [rules, match, typeFilter, policyFilter])

  const hasActiveFilter =
    typeFilter !== ALL ||
    policyFilter !== ALL ||
    filteredRules.length !== rules.length

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await Promise.all([refreshRules(), refreshRuleProviders()])
    } finally {
      setRefreshing(false)
    }
  }, [refreshRules, refreshRuleProviders])

  const handleGlobalRulesSaved = useCallback(async () => {
    await Promise.all([refreshRules(), refreshRuleProviders()])
  }, [refreshRules, refreshRuleProviders])

  const handleScroll = useCallback((e: Event) => {
    setShowScrollTop((e.target as HTMLElement).scrollTop > 100)
  }, [])

  const scrollToTop = () => {
    virtuosoRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <AppPage
      full
      title={t('rules.page.title')}
      contentStyle={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
      }}
      header={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 600, mr: 0.5 }}
          >
            {t('rules.page.stats.showing', {
              filtered: filteredRules.length,
              total: rules.length,
            })}
          </Typography>
          {providerCount > 0 && (
            <Chip
              size="small"
              variant="outlined"
              label={t('rules.page.stats.providers', { count: providerCount })}
              sx={{
                height: 24,
                fontSize: 12,
                fontWeight: 500,
                borderColor: 'divider',
                bgcolor: 'transparent',
              }}
            />
          )}
          <Button
            size="small"
            variant="outlined"
            startIcon={<EditRounded fontSize="small" />}
            onClick={() => setGlobalEditorOpen(true)}
            sx={{
              height: 30,
              borderRadius: 1.5,
              textTransform: 'none',
              fontWeight: 600,
              px: 1.25,
            }}
          >
            {t('rules.page.actions.editGlobal')}
          </Button>
          <ProviderButton />
          <IconButton
            size="small"
            color="inherit"
            onClick={handleRefresh}
            disabled={refreshing}
            title={t('shared.actions.refresh')}
            aria-label={t('shared.actions.refresh')}
            sx={{
              animation: refreshing ? 'spin 1s linear infinite' : 'none',
              '@keyframes spin': {
                '0%': { transform: 'rotate(0deg)' },
                '100%': { transform: 'rotate(360deg)' },
              },
            }}
          >
            <RefreshRounded fontSize="small" />
          </IconButton>
        </Box>
      }
    >
      {globalEditorOpen && (
        <RulesEditorViewer
          open
          global
          property="Rules"
          profileUid={current?.uid ?? ''}
          groupsUid={current?.option?.groups ?? ''}
          mergeUid={current?.option?.merge ?? ''}
          onSave={handleGlobalRulesSaved}
          onClose={() => setGlobalEditorOpen(false)}
        />
      )}
      <Box
        sx={{
          px: 1.5,
          pt: 1.25,
          pb: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'minmax(0, 1fr) 168px',
            },
            gap: 1,
            alignItems: 'center',
          }}
        >
          <Box
            sx={{
              minWidth: 0,
              '& .MuiInputBase-root': {
                height: 34,
                borderRadius: 1.5,
                fontSize: 13,
                pr: 0.5,
              },
              '& .MuiInputBase-input': {
                py: '7px',
                fontSize: 13,
              },
            }}
          >
            <AppSearchField onSearch={(next) => setMatch(() => next)} />
          </Box>

          <Select
            size="small"
            value={policyFilter}
            onChange={(e) => setPolicyFilter(String(e.target.value))}
            displayEmpty
            MenuProps={{
              slots: { transition: Fade },
              transitionDuration: { enter: 140, exit: 90 },
              anchorOrigin: { vertical: 'bottom', horizontal: 'right' },
              transformOrigin: { vertical: 'top', horizontal: 'right' },
              marginThreshold: 8,
              slotProps: {
                paper: {
                  sx: (theme) => ({
                    mt: 0.75,
                    minWidth: 168,
                    maxHeight: 320,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                    backgroundImage: 'none',
                    overflow: 'hidden',
                    boxShadow:
                      theme.palette.mode === 'light'
                        ? '0 4px 16px rgba(15, 23, 42, 0.08)'
                        : '0 8px 24px rgba(0, 0, 0, 0.45)',
                    '& .MuiList-root': {
                      py: 0.5,
                      maxHeight: 312,
                      overflowY: 'auto',
                      scrollbarWidth: 'thin',
                      scrollbarColor: 'transparent transparent',
                      '&:hover': {
                        scrollbarColor: 'var(--scroller-color) transparent',
                      },
                      '&::-webkit-scrollbar': {
                        width: 4,
                      },
                      '&::-webkit-scrollbar-track': {
                        background: 'transparent',
                      },
                      '&::-webkit-scrollbar-thumb': {
                        borderRadius: 4,
                        backgroundColor: 'transparent',
                      },
                      '&:hover::-webkit-scrollbar-thumb': {
                        backgroundColor: 'var(--scroller-color)',
                      },
                    },
                    '& .MuiMenuItem-root.Mui-selected': {
                      bgcolor: alpha(
                        theme.palette.primary.main,
                        theme.palette.mode === 'light' ? 0.08 : 0.16,
                      ),
                    },
                    '& .MuiMenuItem-root.Mui-selected:hover': {
                      bgcolor: alpha(
                        theme.palette.primary.main,
                        theme.palette.mode === 'light' ? 0.12 : 0.22,
                      ),
                    },
                  }),
                },
              },
            }}
            sx={{
              ...controlSx,
              width: '100%',
              fontSize: 13,
              outline: 'none',
              boxShadow: 'none',
              '& .MuiSelect-select': {
                py: '7px',
                display: 'flex',
                alignItems: 'center',
                outline: 'none',
              },
              '&.Mui-focused': {
                outline: 'none',
                boxShadow: 'none',
              },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderWidth: '1px !important',
                borderColor: 'divider !important',
              },
            }}
          >
            <MenuItem value={ALL} sx={menuItemSx}>
              {t('rules.page.filters.allPolicies')}
            </MenuItem>
            {policyOptions.map((policy) => (
              <MenuItem key={policy} value={policy} sx={menuItemSx}>
                {policy}
              </MenuItem>
            ))}
          </Select>
        </Box>

        {typeOptions.length > 0 && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              overflowX: 'auto',
              mx: -0.25,
              px: 0.25,
              scrollbarWidth: 'thin',
              '&::-webkit-scrollbar': { height: 3 },
            }}
          >
            <Chip
              size="small"
              clickable
              label={t('rules.page.filters.allTypes')}
              onClick={() => setTypeFilter(ALL)}
              variant={typeFilter === ALL ? 'filled' : 'outlined'}
              color={typeFilter === ALL ? 'primary' : 'default'}
              sx={{
                flexShrink: 0,
                height: 26,
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 1.25,
                ...(typeFilter !== ALL && {
                  borderColor: 'divider',
                  bgcolor: 'background.paper',
                }),
              }}
            />
            {typeOptions.map(({ type, count }) => {
              const selected = typeFilter === type
              return (
                <Chip
                  key={type}
                  size="small"
                  clickable
                  label={`${type} ${count}`}
                  onClick={() =>
                    setTypeFilter((prev) => (prev === type ? ALL : type))
                  }
                  variant={selected ? 'filled' : 'outlined'}
                  color={selected ? 'primary' : 'default'}
                  sx={{
                    flexShrink: 0,
                    height: 26,
                    fontSize: 12,
                    fontWeight: 500,
                    borderRadius: 1.25,
                    ...(!selected && {
                      borderColor: 'divider',
                      bgcolor: 'background.paper',
                      color: 'text.secondary',
                    }),
                  }}
                />
              )
            })}
          </Box>
        )}
      </Box>

      {filteredRules.length > 0 ? (
        <>
          <VirtualList
            ref={virtuosoRef}
            count={filteredRules.length}
            estimateSize={40}
            renderItem={(i) => <RuleItem value={filteredRules[i]} />}
            style={{ flex: 1 }}
            onScroll={handleScroll}
          />
          <ScrollTopButton onClick={scrollToTop} show={showScrollTop} />
        </>
      ) : (
        <AppEmpty
          text={hasActiveFilter ? t('rules.page.empty.filtered') : undefined}
        />
      )}
    </AppPage>
  )
}

export default RulesPage

import {
  AddRounded,
  CloseRounded,
  DeleteOutlineRounded,
  NetworkCheckRounded,
  SaveRounded,
  SearchRounded,
  SyncAltRounded,
} from '@mui/icons-material'
import {
  alpha,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from '@mui/material'
import { useLockFn } from 'ahooks'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseTooltip, Switch } from '@/components/base'
import {
  bindingKey,
  createEmptyAutoSwitchGroup,
  DEFAULT_INTERVAL_SECONDS,
  DEFAULT_THRESHOLD_MS,
  MAX_INTERVAL_SECONDS,
  MAX_THRESHOLD_MS,
  MIN_INTERVAL_SECONDS,
  MIN_THRESHOLD_MS,
  toNodeBinding,
  type AutoSwitchGroup,
} from '@/components/proxy/auto-switch-model'
import { useAutoSwitchGroups } from '@/hooks/use-auto-switch-groups'
import { runAutoSwitchOnce } from '@/hooks/use-auto-switch-runner'
import { useProxySelection } from '@/hooks/use-proxy-selection'
import { useVerge } from '@/hooks/use-verge'
import {
  useAppRefreshers,
  useClashConfigData,
  useProxiesData,
} from '@/providers/app-data-context'
import { showNotice } from '@/services/notice-service'
import {
  isInteractableMember,
  resolveMember,
  type ProxyGroupView,
  type ProxyNodeView,
} from '@/types/proxy-view'

const INTERVAL_PRESETS = [30, 60, 120, 300] as const
const THRESHOLD_PRESETS = [0, 30, 50, 100, 200] as const
const SELECTABLE = new Set(['Selector', 'URLTest', 'Fallback'])

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 1.75,
    bgcolor: 'background.paper',
    transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
    '&:hover .MuiOutlinedInput-notchedOutline': {
      borderColor: 'primary.light',
    },
    '&.Mui-focused': {
      boxShadow: (theme: { palette: { primary: { main: string } } }) =>
        `0 0 0 3px ${alpha(theme.palette.primary.main, 0.12)}`,
    },
  },
  '& .MuiInputLabel-root': {
    fontSize: 13,
  },
} as const

const presetGroupSx = {
  width: '100%',
  bgcolor: (theme: { palette: { mode: string; action: { hover: string } } }) =>
    theme.palette.mode === 'light' ? alpha('#000', 0.03) : alpha('#fff', 0.04),
  borderRadius: 2,
  p: 0.4,
  gap: 0.4,
  '& .MuiToggleButton-root': {
    flex: 1,
    border: 0,
    borderRadius: '10px !important',
    textTransform: 'none',
    fontSize: 12.5,
    fontWeight: 500,
    py: 0.7,
    px: 1,
    color: 'text.secondary',
    transition: 'all 0.15s ease',
    '&.Mui-selected': {
      bgcolor: 'background.paper',
      color: 'primary.main',
      fontWeight: 650,
      boxShadow: (theme: { palette: { mode: string } }) =>
        theme.palette.mode === 'light'
          ? '0 1px 3px rgba(0,0,0,0.08)'
          : '0 1px 3px rgba(0,0,0,0.35)',
      '&:hover': {
        bgcolor: 'background.paper',
      },
    },
    '&:hover': {
      bgcolor: (theme: { palette: { action: { hover: string } } }) =>
        theme.palette.action.hover,
    },
  },
} as const

interface AutoSwitchPanelProps {
  open: boolean
  onClose: () => void
}

type EditorState = AutoSwitchGroup

function formatIntervalLabel(
  seconds: number,
  t: (
    key:
      | 'proxies.page.autoSwitch.intervalSeconds'
      | 'proxies.page.autoSwitch.intervalMinutes',
    opts?: { count: number },
  ) => string,
) {
  if (seconds < 60) {
    return t('proxies.page.autoSwitch.intervalSeconds', { count: seconds })
  }
  const minutes = Math.round(seconds / 60)
  return t('proxies.page.autoSwitch.intervalMinutes', { count: minutes })
}

function groupNodeCandidates(
  group: ProxyGroupView | null,
  proxyView: ReturnType<typeof useProxiesData>['proxyView'],
): ProxyNodeView[] {
  if (!group || !proxyView) return []
  const nodes: ProxyNodeView[] = []
  const seen = new Set<string>()
  for (const memberRef of group.members) {
    const member = resolveMember(proxyView, memberRef)
    if (!isInteractableMember(member) || member.kind !== 'node') continue
    if (seen.has(member.node.recordId)) continue
    seen.add(member.node.recordId)
    nodes.push(member.node)
  }
  return nodes
}

function SectionCard({
  title,
  hint,
  action,
  children,
}: {
  title: string
  hint?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <Box
      sx={{
        borderRadius: 2.25,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          px: 1.75,
          pt: 1.5,
          pb: hint ? 0.5 : 1.25,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 650, letterSpacing: 0.01, lineHeight: 1.3 }}
          >
            {title}
          </Typography>
          {hint && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: 'block',
                mt: 0.35,
                lineHeight: 1.45,
                opacity: 0.9,
              }}
            >
              {hint}
            </Typography>
          )}
        </Box>
        {action}
      </Box>
      <Box sx={{ px: 1.75, pb: 1.75, pt: 0.75 }}>{children}</Box>
    </Box>
  )
}

export function AutoSwitchPanel({ open, onClose }: AutoSwitchPanelProps) {
  const { t } = useTranslation()
  const theme = useTheme()
  const { groups, saveGroup, deleteGroup, patchGroup } = useAutoSwitchGroups()
  const { proxyView } = useProxiesData()
  const { clashConfig } = useClashConfigData()
  const { refreshProxy } = useAppRefreshers()
  const { verge } = useVerge()
  const { changeProxy } = useProxySelection({
    onSuccess: () => refreshProxy(),
  })

  const [editing, setEditing] = useState<EditorState | null>(null)
  const [nodeFilter, setNodeFilter] = useState('')
  const [testingId, setTestingId] = useState<string | null>(null)

  const mode = (clashConfig?.mode ?? 'rule').toLowerCase()
  const isExisting = editing
    ? groups.some((group) => group.id === editing.id)
    : false

  const selectableGroups = useMemo(() => {
    if (!proxyView) return [] as ProxyGroupView[]
    const fromGroups = proxyView.groups.filter(
      (group) => !group.hidden && SELECTABLE.has(group.type),
    )
    if (mode === 'global' && proxyView.global) {
      return [
        proxyView.global,
        ...fromGroups.filter((g) => g.name !== proxyView.global?.name),
      ]
    }
    return fromGroups
  }, [mode, proxyView])

  const handleClose = () => {
    setEditing(null)
    setNodeFilter('')
    setTestingId(null)
    onClose()
  }

  const targetGroup = useMemo(() => {
    if (!editing?.targetGroupName) return null
    return (
      selectableGroups.find(
        (group) => group.name === editing.targetGroupName,
      ) ?? null
    )
  }, [editing?.targetGroupName, selectableGroups])

  const candidates = useMemo(
    () => groupNodeCandidates(targetGroup, proxyView),
    [proxyView, targetGroup],
  )

  const selectedKeys = useMemo(() => {
    if (!editing) return new Set<string>()
    return new Set(editing.nodes.map(bindingKey))
  }, [editing])

  const filteredCandidates = useMemo(() => {
    const query = nodeFilter.trim().toLowerCase()
    if (!query) return candidates
    return candidates.filter(
      (node) =>
        node.name.toLowerCase().includes(query) ||
        node.type.toLowerCase().includes(query),
    )
  }, [candidates, nodeFilter])

  const startCreate = () => {
    const defaultTarget =
      mode === 'global'
        ? (proxyView?.global?.name ?? '')
        : (selectableGroups[0]?.name ?? '')
    setEditing(
      createEmptyAutoSwitchGroup({
        name: t('proxies.page.autoSwitch.defaultName'),
        targetGroupName: defaultTarget,
        enabled: true,
      }),
    )
    setNodeFilter('')
  }

  const startEdit = (group: AutoSwitchGroup) => {
    setEditing({ ...group, nodes: group.nodes.map((node) => ({ ...node })) })
    setNodeFilter('')
  }

  const toggleNode = (node: ProxyNodeView) => {
    if (!editing) return
    const key = bindingKey(toNodeBinding(node))
    const exists = editing.nodes.some((item) => bindingKey(item) === key)
    setEditing({
      ...editing,
      nodes: exists
        ? editing.nodes.filter((item) => bindingKey(item) !== key)
        : [...editing.nodes, toNodeBinding(node)],
    })
  }

  const removeSelectedNode = (key: string) => {
    if (!editing) return
    setEditing({
      ...editing,
      nodes: editing.nodes.filter((item) => bindingKey(item) !== key),
    })
  }

  const handleSave = () => {
    if (!editing) return
    const name = editing.name.trim()
    if (!name) {
      showNotice.error('proxies.page.autoSwitch.errors.nameRequired')
      return
    }
    if (!editing.targetGroupName) {
      showNotice.error('proxies.page.autoSwitch.errors.targetRequired')
      return
    }
    if (editing.nodes.length < 2) {
      showNotice.error('proxies.page.autoSwitch.errors.minNodes')
      return
    }

    const intervalSeconds = Math.min(
      MAX_INTERVAL_SECONDS,
      Math.max(
        MIN_INTERVAL_SECONDS,
        Math.round(editing.intervalSeconds || DEFAULT_INTERVAL_SECONDS),
      ),
    )
    const thresholdMs = Math.min(
      MAX_THRESHOLD_MS,
      Math.max(
        MIN_THRESHOLD_MS,
        Math.round(
          Number.isFinite(editing.thresholdMs)
            ? editing.thresholdMs
            : DEFAULT_THRESHOLD_MS,
        ),
      ),
    )

    saveGroup({
      ...editing,
      name,
      intervalSeconds,
      thresholdMs,
    })
    setEditing(null)
    showNotice.success('proxies.page.autoSwitch.saved')
  }

  const handleTestNow = useLockFn(async (group: AutoSwitchGroup) => {
    if (!proxyView) return
    setTestingId(group.id)
    try {
      const { decision } = await runAutoSwitchOnce(group, {
        proxyView,
        mode,
        timeout: verge?.default_latency_timeout || 10000,
        changeProxy,
      })
      if (decision.action === 'keep') {
        showNotice.info('proxies.page.autoSwitch.testedKeep', {
          group: group.name,
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown'
      if (message === 'target-unavailable') {
        showNotice.error('proxies.page.autoSwitch.errors.targetUnavailable')
      } else if (message === 'no-nodes') {
        showNotice.error('proxies.page.autoSwitch.errors.noResolvableNodes')
      } else {
        showNotice.error('proxies.page.autoSwitch.errors.testFailed')
      }
    } finally {
      setTestingId(null)
    }
  })

  const handleDelete = useCallback(
    (id: string) => {
      deleteGroup(id)
      if (editing?.id === id) setEditing(null)
    },
    [deleteGroup, editing?.id],
  )

  const intervalIsPreset = INTERVAL_PRESETS.includes(
    editing?.intervalSeconds as (typeof INTERVAL_PRESETS)[number],
  )
  const thresholdIsPreset = THRESHOLD_PRESETS.includes(
    editing?.thresholdMs as (typeof THRESHOLD_PRESETS)[number],
  )

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="md"
      slotProps={{
        paper: {
          sx: {
            height: { xs: '100%', sm: 'min(740px, 92vh)' },
            maxHeight: '92vh',
            m: { xs: 0, sm: 2 },
            borderRadius: { xs: 0, sm: 3 },
            overflow: 'hidden',
            border: '1px solid',
            borderColor: alpha(theme.palette.divider, 0.7),
            boxShadow:
              theme.palette.mode === 'light'
                ? '0 24px 64px rgba(15, 23, 42, 0.14)'
                : '0 24px 64px rgba(0, 0, 0, 0.55)',
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          px: 2.25,
          py: 1.75,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}
        >
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2,
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              color: 'primary.main',
            }}
          >
            <SyncAltRounded fontSize="small" />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="h6"
              sx={{ fontWeight: 700, lineHeight: 1.2, fontSize: 17 }}
            >
              {t('proxies.page.autoSwitch.title')}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 0.2, lineHeight: 1.4 }}
            >
              {t('proxies.page.autoSwitch.subtitle')}
            </Typography>
          </Box>
        </Box>
        <BaseTooltip title={t('shared.actions.close')}>
          <IconButton
            onClick={handleClose}
            size="small"
            aria-label={t('shared.actions.close')}
            sx={{
              color: 'text.secondary',
              bgcolor: alpha(theme.palette.text.primary, 0.04),
              '&:hover': {
                bgcolor: alpha(theme.palette.text.primary, 0.08),
              },
            }}
          >
            <CloseRounded fontSize="small" />
          </IconButton>
        </BaseTooltip>
      </DialogTitle>

      <DialogContent
        sx={{
          p: 0,
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          minHeight: 0,
          flex: 1,
        }}
      >
        {/* Left: group list */}
        <Box
          sx={{
            width: { xs: '100%', sm: 268 },
            flexShrink: 0,
            // Include color in the shorthand — responsive `1px solid` alone
            // resets to currentColor inside the media query and looks white in dark mode.
            borderRight: {
              sm: `1px solid ${theme.palette.divider}`,
            },
            borderBottom: {
              xs: `1px solid ${theme.palette.divider}`,
              sm: 'none',
            },
            display: 'flex',
            flexDirection: 'column',
            maxHeight: { xs: 220, sm: 'none' },
            bgcolor:
              theme.palette.mode === 'light'
                ? alpha(theme.palette.grey[50], 0.8)
                : alpha(theme.palette.common.white, 0.02),
          }}
        >
          <Box sx={{ p: 1.5, pb: 1 }}>
            <Button
              fullWidth
              variant="contained"
              disableElevation
              startIcon={<AddRounded />}
              onClick={startCreate}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                py: 0.9,
                boxShadow: 'none',
              }}
            >
              {t('proxies.page.autoSwitch.create')}
            </Button>
          </Box>

          <List dense sx={{ flex: 1, overflow: 'auto', py: 0.5, px: 1 }}>
            {groups.length === 0 && (
              <Box sx={{ px: 1.5, py: 4, textAlign: 'center' }}>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ lineHeight: 1.5, opacity: 0.85 }}
                >
                  {t('proxies.page.autoSwitch.empty')}
                </Typography>
              </Box>
            )}
            {groups.map((group) => {
              const selected = editing?.id === group.id
              return (
                <ListItem
                  key={group.id}
                  disablePadding
                  secondaryAction={
                    <Switch
                      checked={group.enabled}
                      onChange={(_, checked) =>
                        patchGroup(group.id, { enabled: checked })
                      }
                      onClick={(event) => event.stopPropagation()}
                      sx={{
                        transform: 'scale(0.78)',
                        transformOrigin: 'center right',
                      }}
                    />
                  }
                  sx={{ mb: 0.5 }}
                >
                  <ListItemButton
                    selected={selected}
                    onClick={() => startEdit(group)}
                    sx={{
                      borderRadius: 2,
                      py: 1,
                      pr: 7,
                      border: '1px solid',
                      borderColor: selected
                        ? alpha(theme.palette.primary.main, 0.35)
                        : 'transparent',
                      '&.Mui-selected': {
                        bgcolor: alpha(theme.palette.primary.main, 0.08),
                      },
                      '&.Mui-selected:hover': {
                        bgcolor: alpha(theme.palette.primary.main, 0.12),
                      },
                      '&:hover': {
                        bgcolor: alpha(theme.palette.action.hover, 0.6),
                      },
                    }}
                  >
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        mr: 1.25,
                        flexShrink: 0,
                        bgcolor: group.enabled
                          ? 'success.main'
                          : alpha(theme.palette.text.disabled, 0.5),
                        boxShadow: group.enabled
                          ? `0 0 0 3px ${alpha(theme.palette.success.main, 0.18)}`
                          : 'none',
                      }}
                    />
                    <ListItemText
                      primary={group.name}
                      secondary={t('proxies.page.autoSwitch.listMeta', {
                        count: group.nodes.length,
                        target: group.targetGroupName || '—',
                      })}
                      slotProps={{
                        primary: {
                          sx: {
                            fontWeight: selected ? 650 : 560,
                            fontSize: 13.5,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          },
                        },
                        secondary: {
                          sx: {
                            fontSize: 11,
                            mt: 0.15,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            opacity: 0.85,
                          },
                        },
                      }}
                    />
                  </ListItemButton>
                </ListItem>
              )
            })}
          </List>
        </Box>

        {/* Right: editor / placeholder */}
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            overflow: 'auto',
            p: { xs: 1.75, sm: 2.25 },
            bgcolor:
              theme.palette.mode === 'light'
                ? alpha(theme.palette.grey[100], 0.45)
                : alpha(theme.palette.common.black, 0.2),
          }}
        >
          {!editing ? (
            <Box
              sx={{
                height: '100%',
                minHeight: 280,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1.25,
                color: 'text.secondary',
                textAlign: 'center',
                px: 3,
              }}
            >
              <Box
                sx={{
                  width: 64,
                  height: 64,
                  borderRadius: 3,
                  display: 'grid',
                  placeItems: 'center',
                  mb: 0.5,
                  bgcolor: alpha(theme.palette.primary.main, 0.08),
                  color: 'primary.main',
                }}
              >
                <SyncAltRounded sx={{ fontSize: 28, opacity: 0.85 }} />
              </Box>
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: 650, color: 'text.primary' }}
              >
                {t('proxies.page.autoSwitch.hintTitle')}
              </Typography>
              <Typography
                variant="body2"
                sx={{ maxWidth: 360, opacity: 0.8, lineHeight: 1.6 }}
              >
                {t('proxies.page.autoSwitch.hintBody')}
              </Typography>
            </Box>
          ) : (
            <Stack spacing={1.75}>
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: 'center', justifyContent: 'space-between' }}
              >
                <Typography
                  variant="subtitle1"
                  sx={{ fontWeight: 700, fontSize: 15.5 }}
                >
                  {isExisting
                    ? t('proxies.page.autoSwitch.editTitle')
                    : t('proxies.page.autoSwitch.createTitle')}
                </Typography>
                <Stack direction="row" spacing={0.5}>
                  <BaseTooltip title={t('proxies.page.autoSwitch.testNow')}>
                    <span>
                      <IconButton
                        size="small"
                        color="primary"
                        disabled={
                          testingId === editing.id ||
                          editing.nodes.length < 2 ||
                          !editing.targetGroupName
                        }
                        onClick={() => void handleTestNow(editing)}
                        sx={{
                          bgcolor: alpha(theme.palette.primary.main, 0.08),
                          '&:hover': {
                            bgcolor: alpha(theme.palette.primary.main, 0.14),
                          },
                          '&.Mui-disabled': {
                            bgcolor: alpha(theme.palette.action.disabled, 0.04),
                          },
                        }}
                      >
                        {testingId === editing.id ? (
                          <CircularProgress size={16} thickness={5} />
                        ) : (
                          <NetworkCheckRounded fontSize="small" />
                        )}
                      </IconButton>
                    </span>
                  </BaseTooltip>
                  {isExisting && (
                    <BaseTooltip title={t('shared.actions.delete')}>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDelete(editing.id)}
                        sx={{
                          bgcolor: alpha(theme.palette.error.main, 0.06),
                          '&:hover': {
                            bgcolor: alpha(theme.palette.error.main, 0.12),
                          },
                        }}
                      >
                        <DeleteOutlineRounded fontSize="small" />
                      </IconButton>
                    </BaseTooltip>
                  )}
                </Stack>
              </Stack>

              <SectionCard title={t('proxies.page.autoSwitch.fields.name')}>
                <Stack spacing={1.5}>
                  <TextField
                    size="small"
                    fullWidth
                    hiddenLabel
                    placeholder={t('proxies.page.autoSwitch.fields.name')}
                    value={editing.name}
                    onChange={(event) =>
                      setEditing({ ...editing, name: event.target.value })
                    }
                    sx={fieldSx}
                  />

                  <FormControl size="small" fullWidth sx={fieldSx}>
                    <InputLabel id="auto-switch-target-label">
                      {t('proxies.page.autoSwitch.fields.targetGroup')}
                    </InputLabel>
                    <Select
                      labelId="auto-switch-target-label"
                      label={t('proxies.page.autoSwitch.fields.targetGroup')}
                      value={editing.targetGroupName}
                      MenuProps={{
                        slotProps: {
                          paper: {
                            sx: { borderRadius: 2, mt: 0.5 },
                          },
                        },
                      }}
                      onChange={(event) => {
                        const nextTarget = event.target.value
                        setEditing({
                          ...editing,
                          targetGroupName: nextTarget,
                          nodes: [],
                        })
                        setNodeFilter('')
                      }}
                    >
                      {selectableGroups.map((group) => (
                        <MenuItem
                          key={group.name}
                          value={group.name}
                          sx={{
                            borderRadius: 1.25,
                            mx: 0.75,
                            my: 0.25,
                            py: 0.85,
                          }}
                        >
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'baseline',
                              gap: 1,
                              minWidth: 0,
                              width: '100%',
                            }}
                          >
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: 560,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {group.name}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ flexShrink: 0, opacity: 0.75 }}
                            >
                              {group.type}
                            </Typography>
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 2,
                      px: 1.25,
                      py: 1,
                      borderRadius: 2,
                      bgcolor:
                        theme.palette.mode === 'light'
                          ? alpha('#000', 0.025)
                          : alpha('#fff', 0.04),
                    }}
                  >
                    <Box>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, lineHeight: 1.3 }}
                      >
                        {t('proxies.page.autoSwitch.fields.enabled')}
                      </Typography>
                    </Box>
                    <Switch
                      checked={editing.enabled}
                      onChange={(_, checked) =>
                        setEditing({ ...editing, enabled: checked })
                      }
                      sx={{
                        transform: 'scale(0.88)',
                        transformOrigin: 'center right',
                      }}
                    />
                  </Box>
                </Stack>
              </SectionCard>

              <SectionCard
                title={t('proxies.page.autoSwitch.fields.interval')}
                hint={t('proxies.page.autoSwitch.fields.intervalHint')}
              >
                <ToggleButtonGroup
                  exclusive
                  fullWidth
                  size="small"
                  value={intervalIsPreset ? editing.intervalSeconds : null}
                  onChange={(_, value: number | null) => {
                    if (value == null) return
                    setEditing({ ...editing, intervalSeconds: value })
                  }}
                  sx={presetGroupSx}
                >
                  {INTERVAL_PRESETS.map((seconds) => (
                    <ToggleButton key={seconds} value={seconds}>
                      {formatIntervalLabel(seconds, t)}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
                <TextField
                  size="small"
                  type="number"
                  fullWidth
                  sx={{ ...fieldSx, mt: 1.25 }}
                  placeholder={t(
                    'proxies.page.autoSwitch.fields.intervalCustom',
                  )}
                  value={editing.intervalSeconds}
                  slotProps={{
                    htmlInput: {
                      min: MIN_INTERVAL_SECONDS,
                      max: MAX_INTERVAL_SECONDS,
                    },
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ fontWeight: 560 }}
                          >
                            s
                          </Typography>
                        </InputAdornment>
                      ),
                    },
                  }}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      intervalSeconds: Number(event.target.value),
                    })
                  }
                />
              </SectionCard>

              <SectionCard
                title={t('proxies.page.autoSwitch.fields.threshold')}
                hint={t('proxies.page.autoSwitch.fields.thresholdHint')}
              >
                <ToggleButtonGroup
                  exclusive
                  fullWidth
                  size="small"
                  value={thresholdIsPreset ? editing.thresholdMs : null}
                  onChange={(_, value: number | null) => {
                    if (value == null) return
                    setEditing({ ...editing, thresholdMs: value })
                  }}
                  sx={presetGroupSx}
                >
                  {THRESHOLD_PRESETS.map((ms) => (
                    <ToggleButton key={ms} value={ms}>
                      {ms === 0
                        ? t('proxies.page.autoSwitch.thresholdAlways')
                        : t('proxies.page.autoSwitch.thresholdMs', {
                            count: ms,
                          })}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
                <TextField
                  size="small"
                  type="number"
                  fullWidth
                  sx={{ ...fieldSx, mt: 1.25 }}
                  placeholder={t(
                    'proxies.page.autoSwitch.fields.thresholdCustom',
                  )}
                  value={editing.thresholdMs}
                  slotProps={{
                    htmlInput: {
                      min: MIN_THRESHOLD_MS,
                      max: MAX_THRESHOLD_MS,
                    },
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ fontWeight: 560 }}
                          >
                            ms
                          </Typography>
                        </InputAdornment>
                      ),
                    },
                  }}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      thresholdMs: Number(event.target.value),
                    })
                  }
                />
              </SectionCard>

              <SectionCard
                title={t('proxies.page.autoSwitch.fields.nodes', {
                  count: editing.nodes.length,
                })}
                action={
                  editing.nodes.length > 0 ? (
                    <Button
                      size="small"
                      color="inherit"
                      onClick={() => setEditing({ ...editing, nodes: [] })}
                      sx={{
                        textTransform: 'none',
                        fontSize: 12,
                        color: 'text.secondary',
                        minWidth: 0,
                        px: 1,
                      }}
                    >
                      {t('proxies.page.autoSwitch.clearNodes')}
                    </Button>
                  ) : undefined
                }
              >
                {editing.nodes.length > 0 && (
                  <Stack
                    direction="row"
                    spacing={0.75}
                    useFlexGap
                    sx={{ mb: 1.25, flexWrap: 'wrap' }}
                  >
                    {editing.nodes.map((binding) => {
                      const key = bindingKey(binding)
                      return (
                        <Chip
                          key={key}
                          size="small"
                          label={binding.name}
                          onDelete={() => removeSelectedNode(key)}
                          sx={{
                            maxWidth: 200,
                            height: 26,
                            borderRadius: 1.5,
                            bgcolor: alpha(theme.palette.primary.main, 0.08),
                            color: 'text.primary',
                            fontWeight: 500,
                            '& .MuiChip-label': { px: 1 },
                            '& .MuiChip-deleteIcon': {
                              fontSize: 16,
                              color: 'text.secondary',
                              '&:hover': { color: 'error.main' },
                            },
                          }}
                        />
                      )
                    })}
                  </Stack>
                )}

                <TextField
                  size="small"
                  fullWidth
                  hiddenLabel
                  placeholder={t('proxies.page.autoSwitch.searchNodes')}
                  value={nodeFilter}
                  onChange={(event) => setNodeFilter(event.target.value)}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchRounded
                            fontSize="small"
                            sx={{ color: 'text.disabled' }}
                          />
                        </InputAdornment>
                      ),
                    },
                  }}
                  sx={{ ...fieldSx, mb: 1.25 }}
                />

                <Box
                  sx={{
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 2,
                    maxHeight: 240,
                    overflow: 'auto',
                    bgcolor:
                      theme.palette.mode === 'light'
                        ? alpha('#000', 0.015)
                        : alpha('#fff', 0.02),
                  }}
                >
                  {!editing.targetGroupName ? (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ p: 2.5, textAlign: 'center', opacity: 0.8 }}
                    >
                      {t('proxies.page.autoSwitch.pickTargetFirst')}
                    </Typography>
                  ) : filteredCandidates.length === 0 ? (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ p: 2.5, textAlign: 'center', opacity: 0.8 }}
                    >
                      {t('proxies.page.autoSwitch.noMatchingNodes')}
                    </Typography>
                  ) : (
                    <List dense disablePadding>
                      {filteredCandidates.map((node, index) => {
                        const key = bindingKey(toNodeBinding(node))
                        const checked = selectedKeys.has(key)
                        return (
                          <ListItemButton
                            key={node.recordId}
                            dense
                            onClick={() => toggleNode(node)}
                            sx={{
                              py: 0.65,
                              px: 1.25,
                              borderBottom:
                                index < filteredCandidates.length - 1
                                  ? '1px solid'
                                  : 'none',
                              borderColor: alpha(theme.palette.divider, 0.6),
                              bgcolor: checked
                                ? alpha(theme.palette.primary.main, 0.06)
                                : 'transparent',
                              '&:hover': {
                                bgcolor: checked
                                  ? alpha(theme.palette.primary.main, 0.1)
                                  : alpha(theme.palette.action.hover, 0.5),
                              },
                            }}
                          >
                            <ListItemIcon sx={{ minWidth: 34 }}>
                              <Checkbox
                                edge="start"
                                size="small"
                                checked={checked}
                                tabIndex={-1}
                                disableRipple
                                sx={{
                                  p: 0.5,
                                  color: 'text.disabled',
                                  '&.Mui-checked': {
                                    color: 'primary.main',
                                  },
                                }}
                              />
                            </ListItemIcon>
                            <ListItemText
                              primary={node.name}
                              secondary={node.type}
                              slotProps={{
                                primary: {
                                  sx: {
                                    fontSize: 13,
                                    fontWeight: checked ? 620 : 450,
                                    lineHeight: 1.35,
                                  },
                                },
                                secondary: {
                                  sx: {
                                    fontSize: 11,
                                    opacity: 0.75,
                                    mt: 0.1,
                                  },
                                },
                              }}
                            />
                          </ListItemButton>
                        )
                      })}
                    </List>
                  )}
                </Box>
              </SectionCard>
            </Stack>
          )}
        </Box>
      </DialogContent>

      <DialogActions
        sx={{
          px: 2.25,
          py: 1.5,
          gap: 1,
          borderTop: '1px solid',
          borderColor: 'divider',
          bgcolor:
            theme.palette.mode === 'light'
              ? alpha(theme.palette.grey[50], 0.7)
              : alpha(theme.palette.common.white, 0.02),
        }}
      >
        <Button
          onClick={handleClose}
          color="inherit"
          sx={{
            textTransform: 'none',
            color: 'text.secondary',
            borderRadius: 1.75,
            px: 1.75,
          }}
        >
          {t('shared.actions.close')}
        </Button>
        {editing && (
          <Box sx={{ display: 'flex', gap: 1, ml: 'auto' }}>
            <Button
              color="inherit"
              onClick={() => setEditing(null)}
              sx={{
                textTransform: 'none',
                color: 'text.secondary',
                borderRadius: 1.75,
                px: 1.75,
              }}
            >
              {t('shared.actions.cancel')}
            </Button>
            <Button
              variant="contained"
              disableElevation
              startIcon={<SaveRounded />}
              onClick={handleSave}
              sx={{
                textTransform: 'none',
                fontWeight: 650,
                borderRadius: 1.75,
                px: 2,
              }}
            >
              {t('shared.actions.save')}
            </Button>
          </Box>
        )}
      </DialogActions>
    </Dialog>
  )
}

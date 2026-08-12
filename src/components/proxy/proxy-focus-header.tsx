import { ExpandMoreRounded, InfoOutlined } from '@mui/icons-material'
import {
  Box,
  Button,
  Chip,
  Menu,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { useMemo, useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseTooltip } from '@/components/base'
import type { ProxyGroupView } from '@/types/proxy-view'

import { pickPrimaryGroup, type ProxyPageViewMode } from './proxy-focus-model'
import { ProxyGroupTools } from './proxy-group-tools'
import type { HeadState } from './use-head-state'

interface ProxyFocusHeaderProps {
  groups: ProxyGroupView[]
  selectedGroupName: string | null
  viewMode: ProxyPageViewMode
  onSelectGroup: (groupName: string) => void
  onViewModeChange: (mode: ProxyPageViewMode) => void
  /** Focus-mode tools; omitted in "all groups" view. */
  headState?: HeadState
  onLocation?: () => void
  onCheckDelay?: () => void
  onHeadState?: (val: Partial<HeadState>) => void
}

export function ProxyFocusHeader({
  groups,
  selectedGroupName,
  viewMode,
  onSelectGroup,
  onViewModeChange,
  headState,
  onLocation,
  onCheckDelay,
  onHeadState,
}: ProxyFocusHeaderProps) {
  const { t } = useTranslation()
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)

  const currentGroup = useMemo(
    () => groups.find((group) => group.name === selectedGroupName) ?? null,
    [groups, selectedGroupName],
  )
  const primaryGroupName = useMemo(
    () => pickPrimaryGroup(groups)?.name ?? null,
    [groups],
  )

  const showGroupHint = viewMode === 'focus' && groups.length > 1
  const toolsExpanded =
    headState?.textState === 'filter' || headState?.textState === 'url'
  const showTools =
    viewMode === 'focus' &&
    !!currentGroup &&
    !!headState &&
    !!onLocation &&
    !!onCheckDelay &&
    !!onHeadState

  const handleMenuOpen = (event: MouseEvent<HTMLElement>) => {
    setMenuAnchor(event.currentTarget)
  }

  const handleMenuClose = () => {
    setMenuAnchor(null)
  }

  const handleSelect = (groupName: string) => {
    onSelectGroup(groupName)
    handleMenuClose()
  }

  return (
    <Box
      sx={{
        px: 1.5,
        py: 0.75,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        minHeight: 44,
      }}
    >
      {viewMode === 'focus' ? (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            minWidth: 0,
            flexShrink: toolsExpanded ? 0 : 1,
          }}
        >
          <Button
            size="small"
            variant="text"
            endIcon={<ExpandMoreRounded />}
            onClick={handleMenuOpen}
            disabled={groups.length === 0}
            aria-label={t('proxies.page.focus.title')}
            sx={{
              textTransform: 'none',
              color: 'text.primary',
              fontWeight: 700,
              fontSize: 14,
              px: 0.75,
              minWidth: 0,
              maxWidth: toolsExpanded ? 140 : 260,
            }}
          >
            <Box
              component="span"
              sx={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {currentGroup?.name ?? t('proxies.page.empty.noAvailableGroups')}
            </Box>
          </Button>

          {showGroupHint && (
            <BaseTooltip title={t('proxies.page.focus.hint')}>
              <InfoOutlined
                sx={{ fontSize: 15, color: 'text.secondary', flexShrink: 0 }}
              />
            </BaseTooltip>
          )}

          {!toolsExpanded && currentGroup?.now && (
            <Typography
              variant="caption"
              color="text.secondary"
              noWrap
              title={currentGroup.now}
              sx={{ maxWidth: 180, display: { xs: 'none', sm: 'block' } }}
            >
              {currentGroup.now}
            </Typography>
          )}
        </Box>
      ) : (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}
        >
          {t('proxies.page.focus.allTitle')}
        </Typography>
      )}

      {showTools && (
        <ProxyGroupTools
          url={currentGroup!.testUrl}
          groupName={currentGroup!.name}
          headState={headState!}
          onLocation={onLocation!}
          onCheckDelay={onCheckDelay!}
          onHeadState={onHeadState!}
          sx={{
            ml: 0.5,
            flex: '1 1 auto',
            minWidth: 0,
            height: 32,
            justifyContent: 'flex-end',
          }}
        />
      )}

      <ToggleButtonGroup
        size="small"
        exclusive
        value={viewMode}
        onChange={(_, next: ProxyPageViewMode | null) => {
          if (next) onViewModeChange(next)
        }}
        aria-label={t('proxies.page.focus.viewMode')}
        sx={{
          flexShrink: 0,
          ml: showTools ? 0 : 'auto',
          '& .MuiToggleButton-root': {
            px: 1.25,
            py: 0.25,
            textTransform: 'none',
            fontSize: 12,
            lineHeight: 1.6,
          },
        }}
      >
        <ToggleButton value="focus">
          {t('proxies.page.focus.modes.focus')}
        </ToggleButton>
        <ToggleButton value="all">
          {t('proxies.page.focus.modes.all')}
        </ToggleButton>
      </ToggleButtonGroup>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        slotProps={{
          paper: {
            sx: {
              maxHeight: 360,
              minWidth: 260,
            },
          },
        }}
      >
        {groups.map((group) => {
          const isPrimary = group.name === primaryGroupName
          return (
            <MenuItem
              key={group.name}
              selected={group.name === selectedGroupName}
              onClick={() => handleSelect(group.name)}
              sx={{ py: 1, alignItems: 'flex-start' }}
            >
              <Box
                sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {group.name}
                  </Typography>
                  {isPrimary && (
                    <Chip
                      size="small"
                      label={t('proxies.page.focus.primary')}
                      color="primary"
                      variant="outlined"
                      sx={{ height: 18, fontSize: 10 }}
                    />
                  )}
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {group.type}
                  {group.now ? ` · ${group.now}` : ''}
                  {` · ${t('proxies.page.labels.nodeCount', {
                    count: group.members.length,
                  })}`}
                </Typography>
              </Box>
            </MenuItem>
          )
        })}
      </Menu>
    </Box>
  )
}

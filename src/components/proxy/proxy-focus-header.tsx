import { ExpandMoreRounded, InfoOutlined } from '@mui/icons-material'
import {
  Box,
  Button,
  Chip,
  Menu,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'
import { useMemo, useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'

import type { ProxyGroupView } from '@/types/proxy-view'

import { pickPrimaryGroup, type ProxyPageViewMode } from './proxy-focus-model'

interface ProxyFocusHeaderProps {
  groups: ProxyGroupView[]
  selectedGroupName: string | null
  viewMode: ProxyPageViewMode
  onSelectGroup: (groupName: string) => void
  onViewModeChange: (mode: ProxyPageViewMode) => void
}

export function ProxyFocusHeader({
  groups,
  selectedGroupName,
  viewMode,
  onSelectGroup,
  onViewModeChange,
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
        pt: 1.25,
        pb: 1,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          mb: viewMode === 'focus' ? 1 : 0,
        }}
      >
        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}
        >
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}
          >
            {viewMode === 'focus'
              ? t('proxies.page.focus.title')
              : t('proxies.page.focus.allTitle')}
          </Typography>
          {showGroupHint && (
            <Tooltip title={t('proxies.page.focus.hint')} arrow>
              <InfoOutlined
                sx={{ fontSize: 16, color: 'text.secondary', flexShrink: 0 }}
              />
            </Tooltip>
          )}
        </Box>

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
      </Box>

      {viewMode === 'focus' && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            flexWrap: 'wrap',
          }}
        >
          <Button
            size="small"
            variant="outlined"
            endIcon={<ExpandMoreRounded />}
            onClick={handleMenuOpen}
            disabled={groups.length === 0}
            sx={{
              textTransform: 'none',
              maxWidth: '100%',
              borderColor: 'divider',
              color: 'text.primary',
              fontWeight: 600,
            }}
          >
            <Box
              component="span"
              sx={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 220,
              }}
            >
              {currentGroup?.name ?? t('proxies.page.empty.noAvailableGroups')}
            </Box>
          </Button>

          {currentGroup?.type && (
            <Chip
              size="small"
              label={currentGroup.type}
              variant="outlined"
              sx={{ height: 24, fontSize: 11 }}
            />
          )}

          {currentGroup?.now && (
            <Chip
              size="small"
              color="primary"
              variant="outlined"
              label={`${t('proxies.page.focus.current')}: ${currentGroup.now}`}
              sx={{
                height: 24,
                fontSize: 11,
                maxWidth: '100%',
                '& .MuiChip-label': {
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                },
              }}
            />
          )}

          {groups.length > 1 && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ ml: { sm: 'auto' } }}
            >
              {t('proxies.page.focus.groupCount', { count: groups.length })}
            </Typography>
          )}
        </Box>
      )}

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

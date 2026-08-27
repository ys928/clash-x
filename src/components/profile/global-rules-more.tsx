import { Box, Chip, Menu, MenuItem, Typography } from '@mui/material'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { viewProfile } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'

import { ProfileBox } from './profile-box'

export const GlobalRulesMore = () => {
  const { t } = useTranslation()
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const [position, setPosition] = useState({ left: 0, top: 0 })

  const onOpenFile = async () => {
    setAnchorEl(null)
    try {
      await viewProfile('Rules')
    } catch (err) {
      showNotice.error(err)
    }
  }

  return (
    <>
      <ProfileBox
        onDoubleClick={() => {
          void onOpenFile()
        }}
        onContextMenu={(event) => {
          const { clientX, clientY } = event
          setPosition({ top: clientY, left: clientX })
          setAnchorEl(event.currentTarget as HTMLElement)
          event.preventDefault()
        }}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 0.5,
          }}
        >
          <Typography
            variant="h6"
            component="h2"
            noWrap
            title={t('profiles.components.more.global.rules')}
            sx={{ width: 'calc(100% - 52px)' }}
          >
            {t('profiles.components.more.global.rules')}
          </Typography>

          <Chip
            label={t('profiles.components.more.chips.rules')}
            color="primary"
            size="small"
            variant="outlined"
            sx={{ height: 20, textTransform: 'capitalize' }}
          />
        </Box>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            lineHeight: 1.35,
            minHeight: 26,
          }}
        >
          {t('profiles.components.more.global.rulesHint')}
        </Typography>
      </ProfileBox>

      <Menu
        open={!!anchorEl}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorPosition={position}
        anchorReference="anchorPosition"
        transitionDuration={225}
        slotProps={{ list: { sx: { py: 0.5 } } }}
        onContextMenu={(e) => {
          setAnchorEl(null)
          e.preventDefault()
        }}
      >
        <MenuItem
          onClick={() => {
            void onOpenFile()
          }}
          dense
          sx={{ minWidth: 120 }}
        >
          {t('profiles.components.menu.openFile')}
        </MenuItem>
      </Menu>
    </>
  )
}

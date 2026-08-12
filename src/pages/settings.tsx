import { GitHub, HelpOutlineRounded, Telegram } from '@mui/icons-material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  ButtonGroup,
  IconButton,
  Typography,
} from '@mui/material'
import { useLockFn } from 'ahooks'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BasePage } from '@/components/base'
import SettingClash from '@/components/setting/setting-clash'
import SettingSystem from '@/components/setting/setting-system'
import SettingVergeAdvanced from '@/components/setting/setting-verge-advanced'
import SettingVergeBasic from '@/components/setting/setting-verge-basic'
import { openWebUrl } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'

const settingPanelSx = {
  borderRadius: 2,
  backgroundColor: 'background.paper',
} as const

const ADVANCED_OPEN_KEY = 'settings-advanced-open'

const SettingPage = () => {
  const { t } = useTranslation()
  const [advancedOpen, setAdvancedOpen] = useState(() => {
    try {
      return localStorage.getItem(ADVANCED_OPEN_KEY) === 'true'
    } catch {
      return false
    }
  })

  const onError = (err: any) => {
    showNotice.error(err)
  }

  const toGithubRepo = useLockFn(() => {
    return openWebUrl('https://github.com/clash-verge-rev/clash-verge-rev')
  })

  const toGithubDoc = useLockFn(() => {
    return openWebUrl('https://clash-verge-rev.github.io/index.html')
  })

  const toTelegramChannel = useLockFn(() => {
    return openWebUrl('https://t.me/clash_verge_re')
  })

  const handleAdvancedChange = (_: unknown, expanded: boolean) => {
    setAdvancedOpen(expanded)
    try {
      localStorage.setItem(ADVANCED_OPEN_KEY, String(expanded))
    } catch {
      /* ignore */
    }
  }

  return (
    <BasePage
      title={t('settings.page.title')}
      header={
        <ButtonGroup
          variant="contained"
          aria-label={t('settings.page.actionsGroupLabel')}
        >
          <IconButton
            size="medium"
            color="inherit"
            title={t('settings.page.actions.manual')}
            onClick={toGithubDoc}
          >
            <HelpOutlineRounded fontSize="inherit" />
          </IconButton>
          <IconButton
            size="medium"
            color="inherit"
            title={t('settings.page.actions.telegram')}
            onClick={toTelegramChannel}
          >
            <Telegram fontSize="inherit" />
          </IconButton>

          <IconButton
            size="medium"
            color="inherit"
            title={t('settings.page.actions.github')}
            onClick={toGithubRepo}
          >
            <GitHub fontSize="inherit" />
          </IconButton>
        </ButtonGroup>
      }
    >
      <Box
        sx={{
          maxWidth: 920,
          mx: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
        }}
      >
        <Box sx={settingPanelSx}>
          <SettingSystem onError={onError} />
        </Box>

        <Box sx={settingPanelSx}>
          <SettingVergeBasic onError={onError} mode="essentials" />
        </Box>

        <Accordion
          disableGutters
          elevation={0}
          expanded={advancedOpen}
          onChange={handleAdvancedChange}
          sx={{
            ...settingPanelSx,
            '&:before': { display: 'none' },
            overflow: 'hidden',
          }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{ px: 2, minHeight: 48 }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {t('settings.page.sections.advanced')}
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ px: 0, pb: 1.5, pt: 0 }}>
            <Box sx={{ px: 0, mb: 1.5 }}>
              <SettingClash onError={onError} />
            </Box>
            <Box sx={{ px: 0, mb: 1.5 }}>
              <SettingVergeBasic onError={onError} mode="advanced" />
            </Box>
            <Box sx={{ px: 0 }}>
              <SettingVergeAdvanced onError={onError} />
            </Box>
          </AccordionDetails>
        </Accordion>
      </Box>
    </BasePage>
  )
}

export default SettingPage

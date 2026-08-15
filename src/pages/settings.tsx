import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Typography,
} from '@mui/material'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import SettingClash from '@/components/setting/setting-clash'
import SettingSystem from '@/components/setting/setting-system'
import SettingVergeAdvanced from '@/components/setting/setting-verge-advanced'
import SettingVergeBasic from '@/components/setting/setting-verge-basic'
import { AppPage } from '@/components/ui'
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

  const handleAdvancedChange = (_: unknown, expanded: boolean) => {
    setAdvancedOpen(expanded)
    try {
      localStorage.setItem(ADVANCED_OPEN_KEY, String(expanded))
    } catch {
      /* ignore */
    }
  }

  return (
    <AppPage title={t('settings.page.title')}>
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
    </AppPage>
  )
}

export default SettingPage

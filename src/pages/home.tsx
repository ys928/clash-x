import {
  HelpOutlineRounded,
  HistoryEduOutlined,
  MoreVert,
  SettingsOutlined,
  SpeedOutlined,
} from '@mui/icons-material'
import {
  Box,
  Button,
  Checkbox,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  Grid,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Skeleton,
  Typography,
} from '@mui/material'
import { useLockFn } from 'ahooks'
import { Suspense, lazy, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BasePage } from '@/components/base'
import { ClashModeCard } from '@/components/home/clash-mode-card'
import { CurrentProxyCard } from '@/components/home/current-proxy-card'
import { EnhancedCard } from '@/components/home/enhanced-card'
import { EnhancedTrafficStats } from '@/components/home/enhanced-traffic-stats'
import { HomeProfileCard } from '@/components/home/home-profile-card'
import ProxyControlSwitches from '@/components/shared/proxy-control-switches'
import { useProfiles } from '@/hooks/use-profiles'
import { useVerge } from '@/hooks/use-verge'
import { entry_lightweight_mode, openWebUrl } from '@/services/cmds'

const preloadTestCard = () =>
  import('@/components/home/test-card').then((module) => ({
    default: module.TestCard,
  }))
const preloadIpInfoCard = () =>
  import('@/components/home/ip-info-card').then((module) => ({
    default: module.IpInfoCard,
  }))
const preloadClashInfoCard = () =>
  import('@/components/home/clash-info-card').then((module) => ({
    default: module.ClashInfoCard,
  }))
const preloadSystemInfoCard = () =>
  import('@/components/home/system-info-card').then((module) => ({
    default: module.SystemInfoCard,
  }))

const LazyTestCard = lazy(preloadTestCard)
const LazyIpInfoCard = lazy(preloadIpInfoCard)
const LazyClashInfoCard = lazy(preloadClashInfoCard)
const LazySystemInfoCard = lazy(preloadSystemInfoCard)

// Used by bootstrap to initiate optional card imports without blocking render.
// eslint-disable-next-line react-refresh/only-export-components
export const preloadHomePageCards = () =>
  Promise.all([
    preloadTestCard().catch(() => {}),
    preloadIpInfoCard().catch(() => {}),
    preloadClashInfoCard().catch(() => {}),
    preloadSystemInfoCard().catch(() => {}),
  ])

interface HomeCardsSettings {
  profile: boolean
  proxy: boolean
  network: boolean
  mode: boolean
  traffic: boolean
  info: boolean
  clashinfo: boolean
  systeminfo: boolean
  test: boolean
  ip: boolean
  [key: string]: boolean
}

const DEFAULT_HOME_CARDS: HomeCardsSettings = {
  info: false,
  profile: true,
  proxy: true,
  network: true,
  mode: true,
  traffic: false,
  clashinfo: false,
  systeminfo: false,
  test: false,
  ip: false,
}

const serializeCardFlags = (cards: HomeCardsSettings) =>
  Object.keys(cards)
    .sort()
    .map((key) => `${key}:${cards[key] ? 1 : 0}`)
    .join('|')

interface HomeSettingsDialogProps {
  onClose: () => void
  homeCards: HomeCardsSettings
}

const HomeSettingsDialog = ({
  onClose,
  homeCards,
}: HomeSettingsDialogProps) => {
  const { t } = useTranslation()
  const [cards, setCards] = useState<HomeCardsSettings>(homeCards)
  const { patchVerge } = useVerge()

  const handleToggle = (key: string) => {
    setCards((prev: HomeCardsSettings) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const handleSave = async () => {
    await patchVerge({ home_cards: cards })
    onClose()
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('home.page.settings.title')}</DialogTitle>
      <DialogContent>
        <FormGroup>
          <FormControlLabel
            control={
              <Checkbox
                checked={cards.profile || false}
                onChange={() => handleToggle('profile')}
              />
            }
            label={t('home.page.settings.cards.profile')}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={cards.proxy || false}
                onChange={() => handleToggle('proxy')}
              />
            }
            label={t('home.page.settings.cards.currentProxy')}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={cards.network || false}
                onChange={() => handleToggle('network')}
              />
            }
            label={t('home.page.settings.cards.network')}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={cards.mode || false}
                onChange={() => handleToggle('mode')}
              />
            }
            label={t('home.page.settings.cards.proxyMode')}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={cards.traffic || false}
                onChange={() => handleToggle('traffic')}
              />
            }
            label={t('home.page.settings.cards.traffic')}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={cards.test || false}
                onChange={() => handleToggle('test')}
              />
            }
            label={t('home.page.settings.cards.tests')}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={cards.ip || false}
                onChange={() => handleToggle('ip')}
              />
            }
            label={t('home.page.settings.cards.ip')}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={cards.clashinfo || false}
                onChange={() => handleToggle('clashinfo')}
              />
            }
            label={t('home.page.settings.cards.clashInfo')}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={cards.systeminfo || false}
                onChange={() => handleToggle('systeminfo')}
              />
            }
            label={t('home.page.settings.cards.systemInfo')}
          />
        </FormGroup>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('shared.actions.cancel')}</Button>
        <Button onClick={handleSave} color="primary">
          {t('shared.actions.save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

const sectionSx = {
  p: 2,
  borderRadius: 2,
  bgcolor: 'background.paper',
  border: '1px solid',
  borderColor: 'divider',
} as const

const HomePage = () => {
  const { t } = useTranslation()
  const { verge } = useVerge()
  const { current, mutateProfiles } = useProfiles()

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [moreInfoOpen, setMoreInfoOpen] = useState(false)
  const [overflowAnchor, setOverflowAnchor] = useState<null | HTMLElement>(null)

  const homeCards =
    (verge?.home_cards as HomeCardsSettings | undefined) ?? DEFAULT_HOME_CARDS

  const toGithubDoc = useLockFn(() => {
    return openWebUrl('https://clash-verge-rev.github.io/index.html')
  })

  const openSettings = useCallback(() => {
    setOverflowAnchor(null)
    setSettingsOpen(true)
  }, [])

  const hasExtraCards = useMemo(
    () =>
      Boolean(
        homeCards.traffic ||
          homeCards.test ||
          homeCards.ip ||
          homeCards.clashinfo ||
          homeCards.systeminfo,
      ),
    [homeCards],
  )

  const renderExtraCard = useCallback(
    (cardKey: string, component: React.ReactNode, size: number = 6) => {
      if (!homeCards[cardKey]) return null

      return (
        <Grid size={size} key={cardKey}>
          {component}
        </Grid>
      )
    },
    [homeCards],
  )

  return (
    <BasePage
      title={t('home.page.title')}
      contentStyle={{ padding: 2 }}
      header={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Button
            size="small"
            color="inherit"
            onClick={() => setMoreInfoOpen((open) => !open)}
            sx={{ textTransform: 'none' }}
          >
            {t('home.page.actions.moreInfo')}
          </Button>
          <IconButton
            size="small"
            color="inherit"
            onClick={(event) => setOverflowAnchor(event.currentTarget)}
            aria-label={t('home.page.actions.more')}
          >
            <MoreVert fontSize="small" />
          </IconButton>
          <Menu
            anchorEl={overflowAnchor}
            open={Boolean(overflowAnchor)}
            onClose={() => setOverflowAnchor(null)}
          >
            <MenuItem
              onClick={async () => {
                setOverflowAnchor(null)
                await entry_lightweight_mode()
              }}
            >
              <HistoryEduOutlined fontSize="small" sx={{ mr: 1 }} />
              {t('home.page.tooltips.lightweightMode')}
            </MenuItem>
            <MenuItem
              onClick={() => {
                setOverflowAnchor(null)
                void toGithubDoc()
              }}
            >
              <HelpOutlineRounded fontSize="small" sx={{ mr: 1 }} />
              {t('home.page.tooltips.manual')}
            </MenuItem>
            <MenuItem onClick={openSettings}>
              <SettingsOutlined fontSize="small" sx={{ mr: 1 }} />
              {t('home.page.tooltips.settings')}
            </MenuItem>
          </Menu>
        </Box>
      }
    >
      <Box
        sx={{
          maxWidth: 880,
          mx: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {homeCards.network !== false && (
          <Paper elevation={0} sx={sectionSx}>
            <Typography
              variant="subtitle2"
              color="text.secondary"
              sx={{ mb: 1.5, fontWeight: 600 }}
            >
              {t('home.page.cards.networkSettings')}
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 1,
              }}
            >
              <ProxyControlSwitches
                label={t('settings.sections.system.toggles.systemProxy')}
                noRightPadding
              />
              <ProxyControlSwitches
                label={t('settings.sections.system.toggles.tunMode')}
                noRightPadding
              />
            </Box>
          </Paper>
        )}

        {homeCards.mode !== false && (
          <Paper elevation={0} sx={sectionSx}>
            <Typography
              variant="subtitle2"
              color="text.secondary"
              sx={{ mb: 1.5, fontWeight: 600 }}
            >
              {t('home.page.cards.proxyMode')}
            </Typography>
            <ClashModeCard compact />
          </Paper>
        )}

        {(homeCards.profile !== false || homeCards.proxy !== false) && (
          <Grid container spacing={1.5} columns={{ xs: 6, sm: 6, md: 12 }}>
            {homeCards.profile !== false && (
              <Grid size={6}>
                <HomeProfileCard
                  current={current}
                  onProfileUpdated={mutateProfiles}
                />
              </Grid>
            )}
            {homeCards.proxy !== false && (
              <Grid size={6}>
                <CurrentProxyCard />
              </Grid>
            )}
          </Grid>
        )}

        <Collapse in={moreInfoOpen || hasExtraCards}>
          <Grid container spacing={1.5} columns={{ xs: 6, sm: 6, md: 12 }}>
            {renderExtraCard(
              'traffic',
              <EnhancedCard
                title={t('home.page.cards.trafficStats')}
                icon={<SpeedOutlined />}
                iconColor="secondary"
              >
                <EnhancedTrafficStats />
              </EnhancedCard>,
              12,
            )}
            {renderExtraCard(
              'test',
              <Suspense
                fallback={<Skeleton variant="rectangular" height={200} />}
              >
                <LazyTestCard />
              </Suspense>,
            )}
            {renderExtraCard(
              'ip',
              <Suspense
                fallback={<Skeleton variant="rectangular" height={200} />}
              >
                <LazyIpInfoCard />
              </Suspense>,
            )}
            {renderExtraCard(
              'clashinfo',
              <Suspense
                fallback={<Skeleton variant="rectangular" height={200} />}
              >
                <LazyClashInfoCard />
              </Suspense>,
            )}
            {renderExtraCard(
              'systeminfo',
              <Suspense
                fallback={<Skeleton variant="rectangular" height={200} />}
              >
                <LazySystemInfoCard />
              </Suspense>,
            )}
            {!hasExtraCards && moreInfoOpen && (
              <Grid size={12}>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ py: 2, textAlign: 'center' }}
                >
                  {t('home.page.empty.enableCardsHint')}
                  <Button size="small" onClick={openSettings} sx={{ ml: 1 }}>
                    {t('home.page.tooltips.settings')}
                  </Button>
                </Typography>
              </Grid>
            )}
          </Grid>
        </Collapse>
      </Box>

      {settingsOpen && (
        <HomeSettingsDialog
          key={serializeCardFlags(homeCards)}
          onClose={() => setSettingsOpen(false)}
          homeCards={homeCards}
        />
      )}
    </BasePage>
  )
}

export default HomePage

import DnsOutlinedIcon from '@mui/icons-material/DnsOutlined'
import ForkRightOutlinedIcon from '@mui/icons-material/ForkRightOutlined'
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined'
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined'
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import SubjectOutlinedIcon from '@mui/icons-material/SubjectOutlined'
import WifiOutlinedIcon from '@mui/icons-material/WifiOutlined'
import { type ComponentType, type ReactNode } from 'react'

import ConnectionsSvg from '@/assets/image/itemicon/connections.svg?react'
import HomeSvg from '@/assets/image/itemicon/home.svg?react'
import LogsSvg from '@/assets/image/itemicon/logs.svg?react'
import ProfilesSvg from '@/assets/image/itemicon/profiles.svg?react'
import ProxiesSvg from '@/assets/image/itemicon/proxies.svg?react'
import RulesSvg from '@/assets/image/itemicon/rules.svg?react'
import SettingsSvg from '@/assets/image/itemicon/settings.svg?react'
import UnlockSvg from '@/assets/image/itemicon/unlock.svg?react'

import {
  moreNavKeys,
  navigationItems,
  primaryNavKeys,
} from './_navigation-meta'
import ConnectionsPage from './connections'
import HomePage from './home'
import LogsPage from './logs'
import ProfilePage from './profiles'
import ProxyPage from './proxies'
import RulesPage from './rules'
import SettingPage from './settings'
import UnlockPage from './unlock'

type NavigationItem = {
  label: (typeof navigationItems)[keyof typeof navigationItems]['label']
  path: string
  icon: ReactNode[]
  Component: ComponentType
}

const pageByKey = {
  home: {
    ...navigationItems.home,
    icon: [<HomeOutlinedIcon key="mui" />, <HomeSvg key="svg" />],
    Component: HomePage,
  },
  proxies: {
    ...navigationItems.proxies,
    icon: [<WifiOutlinedIcon key="mui" />, <ProxiesSvg key="svg" />],
    Component: ProxyPage,
  },
  profiles: {
    ...navigationItems.profiles,
    icon: [<DnsOutlinedIcon key="mui" />, <ProfilesSvg key="svg" />],
    Component: ProfilePage,
  },
  connections: {
    ...navigationItems.connections,
    icon: [<LanguageOutlinedIcon key="mui" />, <ConnectionsSvg key="svg" />],
    Component: ConnectionsPage,
  },
  rules: {
    ...navigationItems.rules,
    icon: [<ForkRightOutlinedIcon key="mui" />, <RulesSvg key="svg" />],
    Component: RulesPage,
  },
  logs: {
    ...navigationItems.logs,
    icon: [<SubjectOutlinedIcon key="mui" />, <LogsSvg key="svg" />],
    Component: LogsPage,
  },
  unlock: {
    ...navigationItems.unlock,
    icon: [<LockOpenOutlinedIcon key="mui" />, <UnlockSvg key="svg" />],
    Component: UnlockPage,
  },
  settings: {
    ...navigationItems.settings,
    icon: [<SettingsOutlinedIcon key="mui" />, <SettingsSvg key="svg" />],
    Component: SettingPage,
  },
} as const satisfies Record<keyof typeof navigationItems, NavigationItem>

/** All routable pages (order used by the router). */
export const navItems: NavigationItem[] = [
  pageByKey.home,
  pageByKey.proxies,
  pageByKey.profiles,
  pageByKey.connections,
  pageByKey.rules,
  pageByKey.logs,
  pageByKey.unlock,
  pageByKey.settings,
]

export const primaryNavItems: NavigationItem[] = primaryNavKeys.map(
  (key) => pageByKey[key],
)

export const moreNavItems: NavigationItem[] = moreNavKeys.map(
  (key) => pageByKey[key],
)

export const settingsNavItem: NavigationItem = pageByKey.settings

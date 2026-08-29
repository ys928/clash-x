export const navigationItems = {
  home: { label: 'layout.components.navigation.tabs.home', path: '/' },
  proxies: {
    label: 'layout.components.navigation.tabs.proxies',
    path: '/proxies',
  },
  profiles: {
    label: 'layout.components.navigation.tabs.profiles',
    path: '/profile',
  },
  rules: { label: 'layout.components.navigation.tabs.rules', path: '/rules' },
  traffic: {
    label: 'layout.components.navigation.tabs.traffic',
    path: '/traffic',
  },
  settings: {
    label: 'layout.components.navigation.tabs.settings',
    path: '/settings',
  },
} as const

/** Primary sidebar entries (settings is rendered separately). */
export const primaryNavKeys = [
  'home',
  'proxies',
  'profiles',
  'rules',
  'traffic',
] as const

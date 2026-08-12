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
  connections: {
    label: 'layout.components.navigation.tabs.connections',
    path: '/connections',
  },
  rules: { label: 'layout.components.navigation.tabs.rules', path: '/rules' },
  logs: { label: 'layout.components.navigation.tabs.logs', path: '/logs' },
  unlock: {
    label: 'layout.components.navigation.tabs.unlock',
    path: '/unlock',
  },
  settings: {
    label: 'layout.components.navigation.tabs.settings',
    path: '/settings',
  },
} as const

/** Primary sidebar entries above “More”. */
export const primaryNavKeys = ['home', 'proxies', 'profiles'] as const

/** Nested under the “More” group. */
export const moreNavKeys = ['connections', 'rules', 'logs', 'unlock'] as const

export const moreNavPathSet = new Set<string>(
  moreNavKeys.map((key) => navigationItems[key].path),
)

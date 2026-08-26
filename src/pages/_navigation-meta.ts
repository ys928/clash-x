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
  settings: {
    label: 'layout.components.navigation.tabs.settings',
    path: '/settings',
  },
} as const

/** Primary sidebar entries above “More”. */
export const primaryNavKeys = ['home', 'proxies', 'profiles'] as const

/** Nested under the “More” group. */
export const moreNavKeys = ['connections', 'rules'] as const

export const moreNavPathSet = new Set<string>(
  moreNavKeys.map((key) => navigationItems[key].path),
)

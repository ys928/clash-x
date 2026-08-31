export const APP_NAVIGATE_EVENT = 'clash-x:navigate'

export function navigateApp(path: string) {
  window.dispatchEvent(
    new CustomEvent(APP_NAVIGATE_EVENT, { detail: { path } }),
  )
}

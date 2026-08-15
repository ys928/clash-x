import { darkPalette, lightPalette, type ThemeColorDefaults } from '@/theme'
import getSystem from '@/utils/get-system'

const OS = getSystem()

const fontFamily = `-apple-system, BlinkMacSystemFont,"Microsoft YaHei UI", "Microsoft YaHei", Roboto, "Helvetica Neue", Arial, sans-serif, "Apple Color Emoji"${
  OS === 'windows' ? ', twemoji mozilla' : ''
}`

const toThemeDefaults = (palette: typeof lightPalette): ThemeColorDefaults => ({
  primary_color: palette.primary_color,
  secondary_color: palette.secondary_color,
  primary_text: palette.primary_text,
  secondary_text: palette.secondary_text,
  info_color: palette.info_color,
  error_color: palette.error_color,
  warning_color: palette.warning_color,
  success_color: palette.success_color,
  background_color: palette.background_color,
  background_default: palette.background_default,
  background_elevated: palette.background_elevated,
  font_family: fontFamily,
})

/** Default light theme setting (config-compatible shape) */
export const defaultTheme = toThemeDefaults(lightPalette)

/** Default dark theme setting (config-compatible shape) */
export const defaultDarkTheme = toThemeDefaults(darkPalette)

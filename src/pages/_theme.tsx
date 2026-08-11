import getSystem from '@/utils/get-system'
const OS = getSystem()

const fontFamily = `-apple-system, BlinkMacSystemFont,"Microsoft YaHei UI", "Microsoft YaHei", Roboto, "Helvetica Neue", Arial, sans-serif, "Apple Color Emoji"${
  OS === 'windows' ? ', twemoji mozilla' : ''
}`

// default theme setting
export const defaultTheme = {
  primary_color: '#3D6FD9',
  secondary_color: '#6B7280',
  primary_text: '#1C1D21',
  secondary_text: '#6B6E76',
  info_color: '#3D6FD9',
  error_color: '#D94A42',
  warning_color: '#D4870A',
  success_color: '#2D9A52',
  background_color: '#FFFFFF',
  background_default: '#F2F3F5',
  background_elevated: '#FFFFFF',
  font_family: fontFamily,
}

// dark mode
export const defaultDarkTheme = {
  ...defaultTheme,
  primary_color: '#5B8DEF',
  secondary_color: '#8B919A',
  primary_text: '#E8E8EA',
  secondary_text: '#8B8D93',
  info_color: '#5B8DEF',
  error_color: '#E05252',
  warning_color: '#E0942E',
  success_color: '#4CB870',
  background_color: '#222326',
  background_default: '#1A1B1E',
  background_elevated: '#2A2B2F',
}

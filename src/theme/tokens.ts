/**
 * Design tokens — single source of truth for visual values.
 * Theme bridge and App UI components must read from here (or MUI theme derived from here).
 */

export const radius = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
} as const

export const controlHeight = {
  sm: 28,
  md: 32,
  lg: 36,
} as const

export const typographyScale = {
  fontSizeXs: 12,
  fontSizeSm: 13,
  fontSizeMd: 14,
  fontSizeLg: 16,
  fontSizeXl: 18,
  fontWeightRegular: 400,
  fontWeightMedium: 500,
  fontWeightSemibold: 600,
  fontWeightBold: 700,
  lineHeightTight: 1.25,
  lineHeightNormal: 1.4,
} as const

export const layoutTokens = {
  pageHeaderHeight: 52,
  titlebarHeight: 40,
  pageContentGutter: 10,
  pageHeaderPaddingInline: 20,
} as const

/** Mild elevations — desktop tool depth without Material fluff */
export const elevation = {
  none: 'none',
  low: '0 1px 2px rgba(0, 0, 0, 0.06)',
  mid: '0 2px 8px rgba(0, 0, 0, 0.08)',
  high: '0 8px 24px rgba(0, 0, 0, 0.12)',
} as const

export const elevationDark = {
  none: 'none',
  low: '0 1px 2px rgba(0, 0, 0, 0.35)',
  mid: '0 2px 8px rgba(0, 0, 0, 0.4)',
  high: '0 8px 24px rgba(0, 0, 0, 0.5)',
} as const

export type SemanticPalette = {
  primary_color: string
  secondary_color: string
  primary_text: string
  secondary_text: string
  info_color: string
  error_color: string
  warning_color: string
  success_color: string
  background_color: string
  background_default: string
  background_elevated: string
  /** Selection / muted surface */
  selection_color: string
  scroller_color: string
  scrollbar_bg: string
  scrollbar_thumb: string
  scrollbar_thumb_hover: string
  divider: string
  window_border: string
}

export const lightPalette: SemanticPalette = {
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
  selection_color: '#F2F3F5',
  scroller_color: '#A8ABB2',
  scrollbar_bg: '#E8EAED',
  scrollbar_thumb: '#B8BBC2',
  scrollbar_thumb_hover: '#9CA0A8',
  divider: 'rgba(0, 0, 0, 0.06)',
  window_border: 'rgba(0, 0, 0, 0.08)',
}

export const darkPalette: SemanticPalette = {
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
  selection_color: '#2A2B2F',
  scroller_color: '#4A4B50',
  scrollbar_bg: '#1A1B1E',
  scrollbar_thumb: '#3D3E42',
  scrollbar_thumb_hover: '#505156',
  divider: 'rgba(255, 255, 255, 0.06)',
  window_border: 'rgba(255, 255, 255, 0.06)',
}

export const breakpoints = {
  xs: 0,
  sm: 650,
  md: 900,
  lg: 1200,
  xl: 1536,
} as const

import { alpha, type Theme as MuiTheme } from '@mui/material'

import { resolvePalette, type ThemeColorDefaults } from './create-app-theme'
import {
  controlHeight,
  darkPalette,
  layoutTokens,
  lightPalette,
  radius,
  typographyScale,
} from './tokens'

export type SyncCssVarsOptions = {
  mode: 'light' | 'dark'
  dt: ThemeColorDefaults
  theme: MuiTheme
}

/**
 * Sync legacy CSS vars (compat) + design-system `--cx-*` vars onto `:root`.
 */
export const syncCssVars = ({ mode, dt, theme }: SyncCssVarsOptions) => {
  const rootEle = document.documentElement
  if (!rootEle) return

  rootEle.classList.toggle('dark', mode === 'dark')
  rootEle.style.setProperty('color-scheme', mode)

  const palette = resolvePalette(mode, dt)

  // Bridge app theme into Element Plus CSS variables.
  rootEle.style.setProperty('--el-color-primary', theme.palette.primary.main)
  rootEle.style.setProperty('--el-color-danger', theme.palette.error.main)
  rootEle.style.setProperty('--el-color-success', theme.palette.success.main)
  rootEle.style.setProperty('--el-color-warning', theme.palette.warning.main)
  rootEle.style.setProperty('--el-color-info', theme.palette.info.main)
  rootEle.style.setProperty('--el-bg-color', palette.background_color)
  rootEle.style.setProperty(
    '--el-bg-color-overlay',
    palette.background_elevated,
  )
  rootEle.style.setProperty('--el-bg-color-page', palette.background_default)
  rootEle.style.setProperty(
    '--el-text-color-primary',
    theme.palette.text.primary,
  )
  rootEle.style.setProperty(
    '--el-text-color-regular',
    theme.palette.text.primary,
  )
  rootEle.style.setProperty(
    '--el-text-color-secondary',
    theme.palette.text.secondary,
  )
  rootEle.style.setProperty('--el-border-color', palette.divider)
  rootEle.style.setProperty('--el-border-color-light', palette.divider)
  rootEle.style.setProperty('--el-border-color-lighter', palette.divider)
  rootEle.style.setProperty('--el-fill-color-blank', palette.background_color)
  rootEle.style.setProperty(
    '--el-fill-color-light',
    palette.background_elevated,
  )
  rootEle.style.setProperty('--el-mask-color', alpha('#000000', 0.45))
  rootEle.style.setProperty(
    '--el-mask-color-extra-light',
    alpha('#000000', 0.3),
  )
  rootEle.style.setProperty('--el-box-shadow', theme.shadows[2] || 'none')
  rootEle.style.setProperty('--el-box-shadow-light', theme.shadows[1] || 'none')
  rootEle.style.setProperty('--el-border-radius-base', `${radius.md}px`)
  rootEle.style.setProperty('--el-border-radius-small', `${radius.sm}px`)
  if (theme.typography.fontFamily) {
    rootEle.style.setProperty('--el-font-family', theme.typography.fontFamily)
  }

  rootEle.style.setProperty('--divider-color', palette.divider)
  rootEle.style.setProperty('--background-color', palette.background_default)
  rootEle.style.setProperty('--background-paper', palette.background_color)
  rootEle.style.setProperty(
    '--background-elevated',
    palette.background_elevated,
  )
  rootEle.style.setProperty('--selection-color', palette.selection_color)
  rootEle.style.setProperty('--scroller-color', palette.scroller_color)
  rootEle.style.setProperty('--primary-main', theme.palette.primary.main)
  rootEle.style.setProperty('--text-primary', theme.palette.text.primary)
  rootEle.style.setProperty('--text-secondary', theme.palette.text.secondary)
  rootEle.style.setProperty(
    '--background-color-alpha',
    alpha(theme.palette.primary.main, 0.1),
  )
  rootEle.style.setProperty('--window-border-color', palette.window_border)
  rootEle.style.setProperty('--scrollbar-bg', palette.scrollbar_bg)
  rootEle.style.setProperty('--scrollbar-thumb', palette.scrollbar_thumb)
  rootEle.style.setProperty('--border-radius', `${radius.md}px`)

  rootEle.style.setProperty('--cx-radius-xs', `${radius.xs}px`)
  rootEle.style.setProperty('--cx-radius-sm', `${radius.sm}px`)
  rootEle.style.setProperty('--cx-radius-md', `${radius.md}px`)
  rootEle.style.setProperty('--cx-radius-lg', `${radius.lg}px`)
  rootEle.style.setProperty('--cx-control-sm', `${controlHeight.sm}px`)
  rootEle.style.setProperty('--cx-control-md', `${controlHeight.md}px`)
  rootEle.style.setProperty('--cx-control-lg', `${controlHeight.lg}px`)
  rootEle.style.setProperty(
    '--cx-page-header-height',
    `${layoutTokens.pageHeaderHeight}px`,
  )
  rootEle.style.setProperty(
    '--cx-titlebar-height',
    `${layoutTokens.titlebarHeight}px`,
  )
  rootEle.style.setProperty(
    '--cx-page-gutter',
    `${layoutTokens.pageContentGutter}px`,
  )
  rootEle.style.setProperty(
    '--cx-page-header-padding-inline',
    `${layoutTokens.pageHeaderPaddingInline}px`,
  )
  rootEle.style.setProperty('--cx-font-xs', `${typographyScale.fontSizeXs}px`)
  rootEle.style.setProperty('--cx-font-sm', `${typographyScale.fontSizeSm}px`)
  rootEle.style.setProperty('--cx-font-md', `${typographyScale.fontSizeMd}px`)
  rootEle.style.setProperty('--cx-font-lg', `${typographyScale.fontSizeLg}px`)
  rootEle.style.setProperty('--cx-font-xl', `${typographyScale.fontSizeXl}px`)
  rootEle.style.setProperty('--cx-divider', palette.divider)
  rootEle.style.setProperty('--cx-window-border', palette.window_border)
  rootEle.style.setProperty(
    '--cx-scrollbar-thumb-hover',
    palette.scrollbar_thumb_hover,
  )
}

export const buildGlobalThemeStyles = (
  mode: 'light' | 'dark',
  theme: MuiTheme,
) => {
  const palette = mode === 'light' ? lightPalette : darkPalette
  return `
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
          background-color: var(--scrollbar-bg);
        }
        ::-webkit-scrollbar-thumb {
          background-color: var(--scrollbar-thumb);
          border-radius: var(--cx-radius-xs);
        }
        ::-webkit-scrollbar-thumb:hover {
          background-color: var(--cx-scrollbar-thumb-hover, ${palette.scrollbar_thumb_hover});
        }

        body {
          background-color: var(--background-color);
        }

        .MuiPaper-root {
          border-color: var(--window-border-color) !important;
        }

        .MuiDialog-paper {
          background-color: var(--background-paper) !important;
        }

        .MuiMenu-paper {
          background-color: var(--background-paper) !important;
        }

        *:focus-visible:not(input):not(textarea):not(select):not(
            .MuiInputBase-input
          ):not(.MuiSelect-select) {
          outline: 2px solid ${alpha(theme.palette.primary.main, 0.5)} !important;
          outline-offset: 1px;
        }
      `
}

export const applyThemeStyleElement = (globalStyles: string) => {
  let styleElement = document.querySelector('style#verge-theme')
  if (!styleElement) {
    styleElement = document.createElement('style')
    styleElement.id = 'verge-theme'
    document.head.appendChild(styleElement)
  }
  styleElement.innerHTML = globalStyles
}

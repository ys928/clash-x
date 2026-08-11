import {
  alpha,
  createTheme,
  Theme as MuiTheme,
  Shadows,
  type ThemeOptions,
} from '@mui/material'
import {
  getCurrentWebviewWindow,
  WebviewWindow,
} from '@tauri-apps/api/webviewWindow'
import { Theme as TauriOsTheme } from '@tauri-apps/api/window'
import { useEffect, useMemo } from 'react'

import { useVerge } from '@/hooks/use-verge'
import { defaultDarkTheme, defaultTheme } from '@/pages/_theme'
import { useSetThemeMode, useThemeMode } from '@/services/states'

const CSS_INJECTION_SCOPE_ROOT = '[data-css-injection-root]'
const CSS_INJECTION_SCOPE_LIMIT =
  ':is(.monaco-editor .view-lines, .monaco-editor .view-line, .monaco-editor .margin, .monaco-editor .margin-view-overlays, .monaco-editor .view-overlays, .monaco-editor [class^="mtk"], .monaco-editor [class*=" mtk"])'
const TOP_LEVEL_AT_RULES = [
  '@charset',
  '@import',
  '@namespace',
  '@font-face',
  '@keyframes',
  '@counter-style',
  '@page',
  '@property',
  '@font-feature-values',
  '@color-profile',
]
let cssScopeSupport: boolean | null = null

type ThemeDefaults = typeof defaultTheme

const canUseCssScope = () => {
  if (cssScopeSupport !== null) {
    return cssScopeSupport
  }
  try {
    const testStyle = document.createElement('style')
    testStyle.textContent = '@scope (:root) { }'
    document.head.appendChild(testStyle)
    cssScopeSupport = !!testStyle.sheet?.cssRules?.length
    document.head.removeChild(testStyle)
  } catch {
    cssScopeSupport = false
  }
  return cssScopeSupport
}

const wrapCssInjectionWithScope = (css?: string) => {
  if (!css?.trim()) {
    return ''
  }
  const lowerCss = css.toLowerCase()
  const hasTopLevelOnlyRule = TOP_LEVEL_AT_RULES.some((rule) =>
    lowerCss.includes(rule),
  )
  if (hasTopLevelOnlyRule) {
    return null
  }
  const scopeRoot = CSS_INJECTION_SCOPE_ROOT
  const scopeLimit = CSS_INJECTION_SCOPE_LIMIT
  const scopedBlock = `@scope (${scopeRoot}) to (${scopeLimit}) {
${css}
}`
  return scopedBlock
}

const buildThemeOptions = (
  mode: 'light' | 'dark',
  dt: ThemeDefaults,
  setting: NonNullable<IVergeConfig['theme_setting']>,
): ThemeOptions => {
  const primaryMain = setting.primary_color || dt.primary_color
  const dividerColor =
    mode === 'light' ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.06)'
  const selectedBg = alpha(primaryMain, mode === 'light' ? 0.1 : 0.14)
  const hoverBg = dt.background_elevated

  return {
    breakpoints: {
      values: { xs: 0, sm: 650, md: 900, lg: 1200, xl: 1536 },
    },
    shape: {
      borderRadius: 8,
    },
    palette: {
      mode,
      primary: { main: primaryMain },
      secondary: { main: setting.secondary_color || dt.secondary_color },
      info: { main: setting.info_color || dt.info_color },
      error: { main: setting.error_color || dt.error_color },
      warning: { main: setting.warning_color || dt.warning_color },
      success: { main: setting.success_color || dt.success_color },
      text: {
        primary: setting.primary_text || dt.primary_text,
        secondary: setting.secondary_text || dt.secondary_text,
      },
      divider: dividerColor,
      background: {
        default: dt.background_default,
        paper: dt.background_color,
      },
    },
    shadows: Array(25).fill('none') as Shadows,
    typography: {
      fontFamily: setting.font_family
        ? `${setting.font_family}, ${dt.font_family}`
        : dt.font_family,
      fontWeightMedium: 500,
      fontWeightBold: 600,
      h6: { fontWeight: 600 },
      subtitle1: { fontWeight: 500 },
      button: { fontWeight: 500, textTransform: 'none' },
    },
    components: {
      MuiButton: {
        defaultProps: {
          disableElevation: true,
        },
        styleOverrides: {
          root: {
            borderRadius: 8,
            boxShadow: 'none',
          },
          contained: {
            boxShadow: 'none',
            '&:hover': {
              boxShadow: 'none',
            },
          },
          outlined: {
            borderWidth: 1,
            '&:hover': {
              borderWidth: 1,
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            boxShadow: 'none',
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            backgroundImage: 'none',
            border: `1px solid ${dividerColor}`,
            boxShadow: 'none',
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            backgroundImage: 'none',
            border: `1px solid ${dividerColor}`,
            boxShadow: 'none',
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            '&:hover': {
              backgroundColor: hoverBg,
            },
            '&.Mui-selected': {
              backgroundColor: selectedBg,
              '&:hover': {
                backgroundColor: selectedBg,
              },
            },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            '&:hover': {
              backgroundColor: alpha(
                primaryMain,
                mode === 'light' ? 0.06 : 0.1,
              ),
            },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor:
              mode === 'light'
                ? dt.background_elevated
                : dt.background_elevated,
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: dividerColor,
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: alpha(primaryMain, 0.4),
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: primaryMain,
              borderWidth: 1,
            },
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: mode === 'light' ? '#1C1D21' : '#2A2B2F',
            fontSize: 12,
            borderRadius: 6,
            padding: '6px 10px',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            boxShadow: 'none',
          },
        },
      },
    },
  }
}

/**
 * custom theme
 */
export const useCustomTheme = () => {
  const appWindow: WebviewWindow = useMemo(() => getCurrentWebviewWindow(), [])
  const { verge } = useVerge()
  const { theme_mode, theme_setting } = verge ?? {}
  const mode = useThemeMode()
  const setMode = useSetThemeMode()
  const userBackgroundImage = theme_setting?.background_image || ''
  const hasUserBackground = !!userBackgroundImage

  useEffect(() => {
    if (theme_mode === 'light' || theme_mode === 'dark') {
      setMode(theme_mode)
    }
  }, [theme_mode, setMode])

  useEffect(() => {
    if (theme_mode !== 'system') {
      return
    }

    let isMounted = true

    const timerId = setTimeout(() => {
      if (!isMounted) return
      appWindow
        .theme()
        .then((systemTheme) => {
          if (isMounted && systemTheme) {
            setMode(systemTheme)
          }
        })
        .catch((err) => {
          console.error('Failed to get initial system theme:', err)
        })
    }, 0)

    const unlistenPromise = appWindow.onThemeChanged(({ payload }) => {
      if (isMounted) {
        setMode(payload)
      }
    })

    return () => {
      isMounted = false
      clearTimeout(timerId)
      unlistenPromise
        .then((unlistenFn) => {
          if (typeof unlistenFn === 'function') {
            unlistenFn()
          }
        })
        .catch((err) => {
          console.error('Failed to unlisten from theme changes:', err)
        })
    }
  }, [theme_mode, appWindow, setMode])

  useEffect(() => {
    if (theme_mode === undefined) {
      return
    }

    if (theme_mode === 'system') {
      appWindow.setTheme(null).catch((err) => {
        console.error(
          'Failed to set window theme to follow system (setTheme(null)):',
          err,
        )
      })
    } else if (mode) {
      appWindow.setTheme(mode as TauriOsTheme).catch((err) => {
        console.error(`Failed to set window theme to ${mode}:`, err)
      })
    }
  }, [mode, appWindow, theme_mode])

  const theme = useMemo(() => {
    const setting = theme_setting || {}
    const dt = mode === 'light' ? defaultTheme : defaultDarkTheme
    let muiTheme: MuiTheme

    try {
      muiTheme = createTheme(buildThemeOptions(mode, dt, setting))
    } catch (e) {
      console.error('Error creating MUI theme, falling back to defaults:', e)
      muiTheme = createTheme(buildThemeOptions(mode, dt, {}))
    }

    const rootEle = document.documentElement
    if (rootEle) {
      const dividerColor =
        mode === 'light' ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.06)'
      const selectColor = mode === 'light' ? '#F2F3F5' : '#2A2B2F'
      const scrollColor = mode === 'light' ? '#A8ABB2' : '#4A4B50'

      rootEle.style.setProperty('--divider-color', dividerColor)
      rootEle.style.setProperty('--background-color', dt.background_default)
      rootEle.style.setProperty('--background-paper', dt.background_color)
      rootEle.style.setProperty('--background-elevated', dt.background_elevated)
      rootEle.style.setProperty('--selection-color', selectColor)
      rootEle.style.setProperty('--scroller-color', scrollColor)
      rootEle.style.setProperty('--primary-main', muiTheme.palette.primary.main)
      rootEle.style.setProperty(
        '--text-secondary',
        muiTheme.palette.text.secondary,
      )
      rootEle.style.setProperty(
        '--background-color-alpha',
        alpha(muiTheme.palette.primary.main, 0.1),
      )
      rootEle.style.setProperty(
        '--window-border-color',
        mode === 'light' ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.06)',
      )
      rootEle.style.setProperty(
        '--scrollbar-bg',
        mode === 'light' ? '#E8EAED' : dt.background_default,
      )
      rootEle.style.setProperty(
        '--scrollbar-thumb',
        mode === 'light' ? '#B8BBC2' : '#3D3E42',
      )
      rootEle.style.setProperty(
        '--user-background-image',
        hasUserBackground ? `url('${userBackgroundImage}')` : 'none',
      )
      rootEle.style.setProperty(
        '--background-blend-mode',
        setting.background_blend_mode || 'normal',
      )
      rootEle.style.setProperty(
        '--background-opacity',
        setting.background_opacity !== undefined
          ? String(setting.background_opacity)
          : '1',
      )
      rootEle.setAttribute('data-css-injection-root', 'true')
    }

    let styleElement = document.querySelector('style#verge-theme')
    if (!styleElement) {
      styleElement = document.createElement('style')
      styleElement.id = 'verge-theme'
      document.head.appendChild(styleElement!)
    }

    if (styleElement) {
      let scopedCss: string | null = null
      if (canUseCssScope() && setting.css_injection) {
        scopedCss = wrapCssInjectionWithScope(setting.css_injection)
      }
      const effectiveInjectedCss = scopedCss ?? setting.css_injection ?? ''
      const globalStyles = `
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
          background-color: var(--scrollbar-bg);
        }
        ::-webkit-scrollbar-thumb {
          background-color: var(--scrollbar-thumb);
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background-color: ${mode === 'light' ? '#9CA0A8' : '#505156'};
        }

        body {
          background-color: var(--background-color);
          ${
            hasUserBackground
              ? `
            background-image: var(--user-background-image);
            background-size: cover;
            background-position: center;
            background-attachment: fixed;
            background-blend-mode: var(--background-blend-mode);
            opacity: var(--background-opacity);
          `
              : ''
          }
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

        *:focus-visible {
          outline: 2px solid ${alpha(muiTheme.palette.primary.main, 0.5)} !important;
          outline-offset: 1px;
        }
      `

      styleElement.innerHTML = effectiveInjectedCss + globalStyles
    }

    return muiTheme
  }, [mode, theme_setting, userBackgroundImage, hasUserBackground])

  useEffect(() => {
    const id = setTimeout(() => {
      const dom = document.querySelector('#Gradient2')
      if (dom) {
        dom.innerHTML = `
        <stop offset="0%" stop-color="${theme.palette.primary.main}" />
        <stop offset="80%" stop-color="${theme.palette.primary.dark}" />
        <stop offset="100%" stop-color="${theme.palette.primary.dark}" />
        `
      }
    }, 0)
    return () => clearTimeout(id)
  }, [theme.palette.primary.main, theme.palette.primary.dark])

  return { theme }
}

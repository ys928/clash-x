import {
  alpha,
  createTheme,
  type Shadows,
  type Theme as MuiTheme,
  type ThemeOptions,
} from '@mui/material'

import {
  breakpoints,
  controlHeight,
  darkPalette,
  elevation,
  elevationDark,
  lightPalette,
  radius,
  type SemanticPalette,
  typographyScale,
} from './tokens'

export type ThemeColorDefaults = {
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
  font_family: string
}

const buildShadows = (mode: 'light' | 'dark'): Shadows => {
  const e = mode === 'light' ? elevation : elevationDark
  const list = Array(25).fill(e.none) as string[]
  list[1] = e.low
  list[2] = e.mid
  list[3] = e.high
  list[4] = e.high
  return list as Shadows
}

export const resolvePalette = (
  mode: 'light' | 'dark',
  dt: ThemeColorDefaults,
): SemanticPalette => {
  const base = mode === 'light' ? lightPalette : darkPalette
  return {
    ...base,
    primary_color: dt.primary_color,
    secondary_color: dt.secondary_color,
    primary_text: dt.primary_text,
    secondary_text: dt.secondary_text,
    info_color: dt.info_color,
    error_color: dt.error_color,
    warning_color: dt.warning_color,
    success_color: dt.success_color,
    background_color: dt.background_color,
    background_default: dt.background_default,
    background_elevated: dt.background_elevated,
  }
}

const buildThemeOptions = (
  mode: 'light' | 'dark',
  dt: ThemeColorDefaults,
): ThemeOptions => {
  const palette = resolvePalette(mode, dt)
  const primaryMain = palette.primary_color
  const dividerColor = palette.divider
  const selectedBg = alpha(primaryMain, mode === 'light' ? 0.1 : 0.12)
  const hoverBg =
    mode === 'light'
      ? alpha(palette.primary_text, 0.04)
      : alpha('#FFFFFF', 0.04)
  const elev = mode === 'light' ? elevation : elevationDark

  return {
    breakpoints: {
      values: { ...breakpoints },
    },
    shape: {
      borderRadius: radius.md,
    },
    spacing: 8,
    palette: {
      mode,
      primary: { main: primaryMain },
      secondary: { main: palette.secondary_color },
      info: { main: palette.info_color },
      error: { main: palette.error_color },
      warning: { main: palette.warning_color },
      success: { main: palette.success_color },
      text: {
        primary: palette.primary_text,
        secondary: palette.secondary_text,
      },
      divider: dividerColor,
      background: {
        default: palette.background_default,
        paper: palette.background_color,
      },
    },
    shadows: buildShadows(mode),
    typography: {
      fontFamily: dt.font_family,
      fontSize: typographyScale.fontSizeMd,
      fontWeightRegular: typographyScale.fontWeightRegular,
      fontWeightMedium: typographyScale.fontWeightMedium,
      fontWeightBold: typographyScale.fontWeightSemibold,
      h6: {
        fontWeight: typographyScale.fontWeightSemibold,
        fontSize: typographyScale.fontSizeXl,
      },
      subtitle1: {
        fontWeight: typographyScale.fontWeightMedium,
        fontSize: typographyScale.fontSizeLg,
      },
      body1: {
        fontSize: typographyScale.fontSizeMd,
      },
      body2: {
        fontSize: typographyScale.fontSizeSm,
      },
      caption: {
        fontSize: typographyScale.fontSizeXs,
      },
      button: {
        fontWeight: typographyScale.fontWeightMedium,
        textTransform: 'none',
        fontSize: typographyScale.fontSizeMd,
      },
    },
    components: {
      MuiButton: {
        defaultProps: {
          disableElevation: true,
          size: 'small',
        },
        styleOverrides: {
          root: {
            borderRadius: radius.md,
            minHeight: controlHeight.md,
            boxShadow: elev.none,
          },
          sizeSmall: {
            minHeight: controlHeight.md,
            paddingInline: 12,
          },
          sizeMedium: {
            minHeight: controlHeight.lg,
          },
          contained: {
            boxShadow: elev.none,
            '&:hover': {
              boxShadow: elev.low,
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
        defaultProps: {
          elevation: 0,
        },
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
          elevation1: {
            boxShadow: elev.low,
          },
          elevation2: {
            boxShadow: elev.mid,
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            backgroundImage: 'none',
            border: `1px solid ${dividerColor}`,
            borderRadius: radius.lg,
            boxShadow: elev.mid,
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            backgroundImage: 'none',
            border: `1px solid ${dividerColor}`,
            borderRadius: radius.md,
            boxShadow: elev.mid,
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: radius.md,
            minHeight: controlHeight.lg,
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
            borderRadius: radius.md,
            '&:hover': {
              backgroundColor: alpha(
                primaryMain,
                mode === 'light' ? 0.06 : 0.08,
              ),
            },
          },
          sizeSmall: {
            width: controlHeight.md,
            height: controlHeight.md,
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: palette.background_elevated,
            borderRadius: radius.md,
            minHeight: controlHeight.md,
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
          input: {
            paddingTop: 6,
            paddingBottom: 6,
          },
        },
      },
      MuiTooltip: {
        defaultProps: {
          arrow: true,
          enterDelay: 400,
        },
        styleOverrides: {
          tooltip: {
            backgroundColor:
              mode === 'light'
                ? palette.primary_text
                : palette.background_elevated,
            color: mode === 'light' ? '#FFFFFF' : palette.primary_text,
            fontSize: typographyScale.fontSizeXs,
            fontWeight: typographyScale.fontWeightMedium,
            lineHeight: typographyScale.lineHeightNormal,
            borderRadius: radius.sm,
            padding: '6px 10px',
            border: mode === 'dark' ? `1px solid ${dividerColor}` : 'none',
            boxShadow: elev.low,
            maxWidth: 280,
          },
          arrow: {
            color:
              mode === 'light'
                ? palette.primary_text
                : palette.background_elevated,
            ...(mode === 'dark' && {
              '&::before': {
                border: `1px solid ${dividerColor}`,
                boxSizing: 'border-box',
              },
            }),
          },
        },
      },
      MuiCard: {
        defaultProps: {
          elevation: 0,
        },
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            border: `1px solid ${dividerColor}`,
            borderRadius: radius.md,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: radius.sm,
            height: controlHeight.sm,
          },
        },
      },
      MuiCheckbox: {
        defaultProps: {
          disableRipple: true,
          size: 'small',
        },
        styleOverrides: {
          root: {
            borderRadius: radius.sm,
            padding: 6,
            color: alpha(palette.primary_text, mode === 'light' ? 0.28 : 0.4),
            transition: 'color 0.14s ease, background-color 0.14s ease',
            '&:hover': {
              backgroundColor: alpha(
                primaryMain,
                mode === 'light' ? 0.06 : 0.08,
              ),
            },
            '&.Mui-checked, &.MuiCheckbox-indeterminate': {
              color: primaryMain,
            },
            '&.Mui-disabled': {
              opacity: 0.42,
            },
          },
        },
      },
      MuiFormControlLabel: {
        styleOverrides: {
          root: {
            marginLeft: -6,
            marginRight: 0,
            gap: 4,
            borderRadius: radius.md,
            paddingBlock: 2,
            paddingInline: 4,
            '&:hover': {
              backgroundColor: alpha(
                primaryMain,
                mode === 'light' ? 0.04 : 0.06,
              ),
            },
          },
          label: {
            fontSize: typographyScale.fontSizeSm,
            fontWeight: typographyScale.fontWeightMedium,
            lineHeight: typographyScale.lineHeightNormal,
          },
        },
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: {
            fontSize: typographyScale.fontSizeLg,
            fontWeight: typographyScale.fontWeightSemibold,
            paddingBlock: 16,
            paddingInline: 20,
          },
        },
      },
      MuiDialogContent: {
        styleOverrides: {
          root: {
            paddingInline: 20,
            paddingBottom: 16,
          },
        },
      },
      MuiDialogActions: {
        styleOverrides: {
          root: {
            paddingInline: 20,
            paddingBottom: 16,
            gap: 8,
          },
        },
      },
    },
  }
}

export const createAppTheme = (
  mode: 'light' | 'dark',
  dt: ThemeColorDefaults,
): MuiTheme => {
  try {
    return createTheme(buildThemeOptions(mode, dt))
  } catch (e) {
    console.error('Error creating MUI theme, falling back to defaults:', e)
    return createTheme(buildThemeOptions(mode, dt))
  }
}

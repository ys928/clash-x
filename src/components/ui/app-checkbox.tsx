import { Checkbox, type CheckboxProps } from '@mui/material'
import { alpha, styled } from '@mui/material/styles'
import { forwardRef } from 'react'

import { radius } from '@/theme/tokens'

export type AppCheckboxProps = CheckboxProps

const BOX = 15

const UncheckedIcon = styled('span')(({ theme }) => ({
  width: BOX,
  height: BOX,
  borderRadius: radius.xs,
  boxSizing: 'border-box',
  border: '1.5px solid',
  borderColor: alpha(
    theme.palette.text.primary,
    theme.palette.mode === 'light' ? 0.22 : 0.34,
  ),
  backgroundColor:
    theme.palette.mode === 'light'
      ? theme.palette.background.paper
      : alpha(theme.palette.common.white, 0.04),
  transition:
    'border-color 0.14s ease, background-color 0.14s ease, box-shadow 0.14s ease',
}))

const CheckedIcon = styled('span')(({ theme }) => ({
  width: BOX,
  height: BOX,
  borderRadius: radius.xs,
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: theme.palette.primary.main,
  boxShadow: `0 0 0 1px ${alpha(theme.palette.primary.main, 0.18)}`,
  '&::after': {
    content: '""',
    width: 3.5,
    height: 7,
    marginTop: -1,
    border: 'solid',
    borderColor: theme.palette.primary.contrastText,
    borderWidth: '0 1.5px 1.5px 0',
    transform: 'rotate(45deg)',
  },
}))

const IndeterminateIcon = styled('span')(({ theme }) => ({
  width: BOX,
  height: BOX,
  borderRadius: radius.xs,
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: theme.palette.primary.main,
  boxShadow: `0 0 0 1px ${alpha(theme.palette.primary.main, 0.18)}`,
  '&::after': {
    content: '""',
    width: 7,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: theme.palette.primary.contrastText,
  },
}))

/**
 * Theme-aware checkbox — custom mark, soft hover, sizes from tokens.
 */
export const AppCheckbox = forwardRef<HTMLButtonElement, AppCheckboxProps>(
  function AppCheckbox(
    {
      disableRipple = true,
      size = 'small',
      sx,
      icon,
      checkedIcon,
      indeterminateIcon,
      ...rest
    },
    ref,
  ) {
    return (
      <Checkbox
        ref={ref}
        size={size}
        disableRipple={disableRipple}
        {...rest}
        icon={icon ?? <UncheckedIcon className="app-checkbox-box" />}
        checkedIcon={
          checkedIcon ?? (
            <CheckedIcon className="app-checkbox-box app-checkbox-box--checked" />
          )
        }
        indeterminateIcon={
          indeterminateIcon ?? (
            <IndeterminateIcon className="app-checkbox-box app-checkbox-box--checked" />
          )
        }
        sx={[
          {
            p: 0.5,
            borderRadius: `${radius.sm}px`,
            color: 'text.disabled',
            transition: 'background-color 0.14s ease',
            '&:hover': {
              bgcolor: 'transparent',
              '& .app-checkbox-box:not(.app-checkbox-box--checked)': {
                borderColor: 'primary.main',
                boxShadow: (theme) =>
                  `0 0 0 3px ${alpha(theme.palette.primary.main, 0.1)}`,
              },
            },
            '&.Mui-focusVisible .app-checkbox-box': {
              boxShadow: (theme) =>
                `0 0 0 3px ${alpha(theme.palette.primary.main, 0.22)}`,
            },
            '&.Mui-disabled': {
              opacity: 0.42,
            },
          },
          ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
        ]}
      />
    )
  },
)

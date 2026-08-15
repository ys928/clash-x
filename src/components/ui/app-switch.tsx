import { styled } from '@mui/material/styles'
import { default as MuiSwitch, type SwitchProps } from '@mui/material/Switch'

import { radius } from '@/theme/tokens'

export type AppSwitchProps = SwitchProps

const TRACK_WIDTH = 42
const TRACK_HEIGHT = 26
const THUMB = 22

/**
 * Theme-aware switch — colors from palette; sizes from tokens.
 */
export const AppSwitch = styled((props: AppSwitchProps) => (
  <MuiSwitch
    focusVisibleClassName=".Mui-focusVisible"
    disableRipple
    {...props}
  />
))(({ theme }) => ({
  width: TRACK_WIDTH,
  height: TRACK_HEIGHT,
  padding: 0,
  marginRight: 1,
  '& .MuiSwitch-switchBase': {
    padding: 0,
    margin: 2,
    transitionDuration: '300ms',
    '&.Mui-checked': {
      transform: 'translateX(16px)',
      color: theme.palette.common.white,
      '& + .MuiSwitch-track': {
        backgroundColor: theme.palette.primary.main,
        opacity: 1,
        border: 0,
      },
      '&.Mui-disabled + .MuiSwitch-track': {
        opacity: 0.5,
      },
    },
    '&.Mui-focusVisible .MuiSwitch-thumb': {
      color: theme.palette.success.main,
      border: `6px solid ${theme.palette.common.white}`,
    },
    '&.Mui-disabled .MuiSwitch-thumb': {
      color:
        theme.palette.mode === 'light'
          ? theme.palette.grey[100]
          : theme.palette.grey[600],
    },
    '&.Mui-disabled + .MuiSwitch-track': {
      opacity: theme.palette.mode === 'light' ? 0.7 : 0.3,
    },
  },
  '& .MuiSwitch-thumb': {
    boxSizing: 'border-box',
    width: THUMB,
    height: THUMB,
  },
  '& .MuiSwitch-track': {
    borderRadius: radius.md + TRACK_HEIGHT / 2,
    backgroundColor:
      theme.palette.mode === 'light'
        ? theme.palette.grey[400]
        : theme.palette.grey[700],
    opacity: 1,
    transition: theme.transitions.create(['background-color'], {
      duration: 500,
    }),
  },
}))

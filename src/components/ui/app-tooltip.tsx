import { Tooltip, type TooltipProps } from '@mui/material'
import type { ReactElement } from 'react'

export type AppTooltipProps = Omit<TooltipProps, 'children'> & {
  children: ReactElement
}

/**
 * Theme-aware tooltip. Styling comes from MuiTooltip theme overrides.
 */
export const AppTooltip = ({
  children,
  arrow = true,
  enterDelay = 400,
  enterNextDelay = 200,
  leaveDelay = 0,
  placement = 'top',
  disableInteractive = true,
  ...rest
}: AppTooltipProps) => {
  return (
    <Tooltip
      arrow={arrow}
      enterDelay={enterDelay}
      enterNextDelay={enterNextDelay}
      leaveDelay={leaveDelay}
      placement={placement}
      disableInteractive={disableInteractive}
      {...rest}
    >
      {children}
    </Tooltip>
  )
}

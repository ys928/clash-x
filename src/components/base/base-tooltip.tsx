import { Tooltip, type TooltipProps } from '@mui/material'
import type { ReactElement } from 'react'

export type BaseTooltipProps = Omit<TooltipProps, 'children'> & {
  children: ReactElement
}

/**
 * Theme-aware tooltip used in place of native `title` attributes.
 * Defaults (arrow, placement, delay) match the app chrome; styling comes from MuiTooltip.
 */
export const BaseTooltip = ({
  children,
  arrow = true,
  enterDelay = 400,
  enterNextDelay = 200,
  leaveDelay = 0,
  placement = 'top',
  disableInteractive = true,
  ...rest
}: BaseTooltipProps) => {
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

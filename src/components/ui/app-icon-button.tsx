import { IconButton, type IconButtonProps } from '@mui/material'
import { forwardRef } from 'react'

export type AppIconButtonProps = IconButtonProps

export const AppIconButton = forwardRef<HTMLButtonElement, AppIconButtonProps>(
  function AppIconButton({ size = 'small', ...rest }, ref) {
    return <IconButton ref={ref} size={size} {...rest} />
  },
)

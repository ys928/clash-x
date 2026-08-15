import { Button, type ButtonProps } from '@mui/material'
import { forwardRef } from 'react'

export type AppButtonProps = ButtonProps

/**
 * Primary action button — visuals come from MUI theme overrides (tokens).
 */
export const AppButton = forwardRef<HTMLButtonElement, AppButtonProps>(
  function AppButton(
    { size = 'small', disableElevation = true, ...rest },
    ref,
  ) {
    return (
      <Button
        ref={ref}
        size={size}
        disableElevation={disableElevation}
        {...rest}
      />
    )
  },
)

import { Chip, type ChipProps } from '@mui/material'
import { forwardRef } from 'react'

export type AppChipProps = ChipProps

export const AppChip = forwardRef<HTMLDivElement, AppChipProps>(
  function AppChip({ size = 'small', ...rest }, ref) {
    return <Chip ref={ref} size={size} {...rest} />
  },
)

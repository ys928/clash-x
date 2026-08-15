import { Select, type SelectProps, styled } from '@mui/material'

import { controlHeight } from '@/theme/tokens'

export type AppSelectProps = SelectProps<string>

export const AppSelect = styled((props: AppSelectProps) => {
  return (
    <Select
      size="small"
      autoComplete="new-password"
      sx={{
        width: 120,
        height: controlHeight.md + 1.375,
        mr: 1,
        '[role="button"]': { py: 0.65 },
      }}
      {...props}
    />
  )
})(({ theme }) => ({
  background:
    theme.palette.mode === 'light' ? theme.palette.background.paper : undefined,
}))

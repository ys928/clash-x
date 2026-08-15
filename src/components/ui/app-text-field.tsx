import { TextField, type TextFieldProps, styled } from '@mui/material'
import { useTranslation } from 'react-i18next'

import { controlHeight } from '@/theme/tokens'

const StyledField = styled(TextField)(({ theme }) => ({
  '& .MuiInputBase-root': {
    background:
      theme.palette.mode === 'light'
        ? theme.palette.background.paper
        : undefined,
    minHeight: controlHeight.md,
  },
}))

export type AppTextFieldProps = TextFieldProps

export const AppTextField = (props: AppTextFieldProps) => {
  const { t } = useTranslation()

  return (
    <StyledField
      autoComplete="new-password"
      hiddenLabel
      fullWidth
      size="small"
      variant="outlined"
      spellCheck="false"
      placeholder={t('shared.placeholders.filter')}
      {...props}
    />
  )
}

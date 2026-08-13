import { Box, Typography, alpha, useTheme } from '@mui/material'
import { memo } from 'react'
import type { Rule } from 'tauri-plugin-mihomo-api'

interface Props {
  value: Rule & { lineNo: number }
}

const resolveType = (type: Rule['type']) =>
  typeof type === 'string' ? type : type.Unknown

const RuleItem = memo(function RuleItem({ value }: Props) {
  const theme = useTheme()
  const typeLabel = resolveType(value.type)
  const isReject = value.proxy === 'REJECT' || value.proxy === 'REJECT-DROP'
  const isDirect = value.proxy === 'DIRECT'
  const isLight = theme.palette.mode === 'light'

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '40px minmax(88px, 128px) minmax(0, 1fr) auto',
        alignItems: 'center',
        columnGap: 1.25,
        px: 1.5,
        py: 0.75,
        minHeight: 40,
        borderBottom: '1px solid',
        borderColor: 'divider',
        transition: 'background-color 0.12s ease',
        '&:hover': {
          bgcolor: alpha(theme.palette.text.primary, isLight ? 0.03 : 0.06),
        },
      }}
    >
      <Typography
        variant="caption"
        sx={{
          color: 'text.disabled',
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          fontSize: 12,
          lineHeight: 1,
        }}
      >
        {value.lineNo}
      </Typography>

      <Typography
        component="span"
        sx={{
          justifySelf: 'start',
          maxWidth: '100%',
          px: 0.75,
          py: 0.25,
          borderRadius: 1,
          fontSize: 11,
          fontWeight: 600,
          lineHeight: 1.35,
          letterSpacing: 0.15,
          color: 'text.secondary',
          bgcolor: alpha(theme.palette.text.primary, isLight ? 0.04 : 0.08),
          border: '1px solid',
          borderColor: 'divider',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {typeLabel}
      </Typography>

      <Typography
        variant="body2"
        sx={{
          justifySelf: 'start',
          maxWidth: '100%',
          width: 'fit-content',
          color: 'text.primary',
          fontSize: 13,
          fontWeight: 500,
          lineHeight: 1.35,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          userSelect: 'text',
        }}
      >
        {value.payload || '-'}
      </Typography>

      <Typography
        component="span"
        sx={{
          justifySelf: 'end',
          maxWidth: 160,
          px: 0.75,
          py: 0.25,
          borderRadius: 1,
          fontSize: 11,
          fontWeight: 500,
          lineHeight: 1.35,
          color: isReject
            ? isLight
              ? 'error.dark'
              : 'error.light'
            : 'text.secondary',
          border: '1px solid',
          borderColor: isReject
            ? alpha(theme.palette.error.main, 0.35)
            : 'divider',
          bgcolor: isReject
            ? alpha(theme.palette.error.main, isLight ? 0.06 : 0.14)
            : isDirect
              ? 'transparent'
              : alpha(theme.palette.text.primary, isLight ? 0.03 : 0.06),
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value.proxy}
      </Typography>
    </Box>
  )
})

export default RuleItem

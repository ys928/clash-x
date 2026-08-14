import { Box, Typography, alpha, useTheme } from '@mui/material'
import { memo, type ReactNode } from 'react'

import type { SearchState } from '@/components/base'

interface Props {
  value: ILogItem
  searchState?: SearchState
}

type LevelTone = 'error' | 'warning' | 'info' | 'debug' | 'default'

const resolveLevelTone = (type: string): LevelTone => {
  const key = type.toLowerCase()
  if (key === 'error' || key === 'err') return 'error'
  if (key === 'warning' || key === 'warn') return 'warning'
  if (key === 'info' || key === 'inf') return 'info'
  if (key === 'debug' || key === 'dbg') return 'debug'
  return 'default'
}

const LogItem = memo(function LogItem({ value, searchState }: Props) {
  const theme = useTheme()
  const isLight = theme.palette.mode === 'light'
  const tone = resolveLevelTone(value.type)

  const levelColor =
    tone === 'error'
      ? theme.palette.error.main
      : tone === 'warning'
        ? theme.palette.warning.main
        : tone === 'info'
          ? theme.palette.info.main
          : theme.palette.text.secondary

  const renderHighlightText = (text: string) => {
    if (!searchState?.text.trim()) return text

    try {
      const searchText = searchState.text
      let pattern: string

      if (searchState.useRegularExpression) {
        try {
          new RegExp(searchText)
          pattern = searchText
        } catch {
          pattern = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        }
      } else {
        const escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        pattern = searchState.matchWholeWord ? `\\b${escaped}\\b` : escaped
      }

      const flags = searchState.matchCase ? 'g' : 'gi'
      const regex = new RegExp(pattern, flags)
      const elements: ReactNode[] = []
      let lastIndex = 0
      let match: RegExpExecArray | null

      while ((match = regex.exec(text)) !== null) {
        const start = match.index
        const matchText = match[0]

        if (matchText === '') {
          regex.lastIndex += 1
          continue
        }

        if (start > lastIndex) {
          elements.push(text.slice(lastIndex, start))
        }

        elements.push(
          <Box
            component="span"
            key={`highlight-${start}`}
            sx={{
              bgcolor:
                theme.palette.mode === 'dark'
                  ? alpha(theme.palette.warning.main, 0.28)
                  : alpha(theme.palette.warning.light, 0.55),
              borderRadius: 0.5,
              px: 0.25,
            }}
          >
            {matchText}
          </Box>,
        )

        lastIndex = start + matchText.length
      }

      if (lastIndex < text.length) {
        elements.push(text.slice(lastIndex))
      }

      return elements.length ? elements : text
    } catch {
      return text
    }
  }

  return (
    <Box
      sx={{
        boxSizing: 'border-box',
        display: 'grid',
        gridTemplateColumns: 'auto auto minmax(0, 1fr)',
        alignItems: 'start',
        columnGap: 1,
        rowGap: 0.25,
        px: 1.5,
        py: 0.9,
        minHeight: 44,
        borderBottom: '1px solid',
        borderColor: 'divider',
        transition: 'background-color 0.12s ease',
        userSelect: 'text',
        '&:hover': {
          bgcolor: alpha(theme.palette.text.primary, isLight ? 0.03 : 0.06),
        },
      }}
    >
      <Typography
        component="span"
        sx={{
          mt: '2px',
          color: 'text.disabled',
          fontSize: 12,
          lineHeight: 1.45,
          fontVariantNumeric: 'tabular-nums',
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          whiteSpace: 'nowrap',
        }}
      >
        {renderHighlightText(value.time || '')}
      </Typography>

      <Typography
        component="span"
        sx={{
          mt: '1px',
          justifySelf: 'start',
          px: 0.75,
          py: 0.15,
          borderRadius: 1,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.4,
          lineHeight: 1.5,
          textTransform: 'uppercase',
          color: levelColor,
          border: '1px solid',
          borderColor: alpha(levelColor, isLight ? 0.28 : 0.4),
          bgcolor: alpha(levelColor, isLight ? 0.08 : 0.16),
          whiteSpace: 'nowrap',
        }}
      >
        {renderHighlightText(value.type)}
      </Typography>

      <Typography
        component="span"
        sx={{
          minWidth: 0,
          color: 'text.primary',
          fontSize: 13,
          fontWeight: 450,
          lineHeight: 1.5,
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
        }}
      >
        {renderHighlightText(value.payload)}
      </Typography>
    </Box>
  )
})

export default LogItem

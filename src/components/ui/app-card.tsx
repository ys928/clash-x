import { Box, Typography, alpha, useTheme } from '@mui/material'
import { forwardRef, type ReactNode } from 'react'

import { controlHeight, radius, typographyScale } from '@/theme/tokens'

export interface AppCardProps {
  title: ReactNode
  icon: ReactNode
  action?: ReactNode
  children: ReactNode
  iconColor?: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success'
  minHeight?: number | string
  noContentPadding?: boolean
}

const titleTruncateStyle = {
  minWidth: 0,
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  display: 'block',
} as const

export const AppCard = forwardRef<HTMLElement, AppCardProps>(function AppCard(
  {
    title,
    icon,
    action,
    children,
    iconColor = 'primary',
    minHeight,
    noContentPadding = false,
  },
  ref,
) {
  const theme = useTheme()

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: `${radius.md}px`,
        backgroundColor: 'background.paper',
        border: 1,
        borderColor: 'divider',
      }}
      ref={ref}
    >
      <Box
        sx={{
          px: 2,
          py: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            minWidth: 0,
            flex: 1,
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: `${radius.sm}px`,
              width: controlHeight.lg + 2,
              height: controlHeight.lg + 2,
              mr: 1.5,
              flexShrink: 0,
              backgroundColor: alpha(theme.palette[iconColor].main, 0.12),
              color: theme.palette[iconColor].main,
            }}
          >
            {icon}
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            {typeof title === 'string' ? (
              <Typography
                variant="h6"
                sx={{
                  ...titleTruncateStyle,
                  fontWeight: typographyScale.fontWeightMedium,
                  fontSize: typographyScale.fontSizeXl,
                }}
                title={title}
              >
                {title}
              </Typography>
            ) : (
              <Box sx={titleTruncateStyle}>{title}</Box>
            )}
          </Box>
        </Box>
        {action && <Box sx={{ ml: 2, flexShrink: 0 }}>{action}</Box>}
      </Box>
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          p: noContentPadding ? 0 : 2,
          ...(minHeight && { minHeight }),
        }}
      >
        {children}
      </Box>
    </Box>
  )
})

import { ChevronRightRounded } from '@mui/icons-material'
import {
  Box,
  CircularProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListSubheader,
} from '@mui/material'
import { useState, type ReactNode } from 'react'

import { radius, typographyScale } from '@/theme/tokens'
import isAsyncFunction from '@/utils/is-async-function'

export interface AppListRowProps {
  label: ReactNode
  extra?: ReactNode
  children?: ReactNode
  secondary?: ReactNode
  onClick?: () => void | Promise<unknown>
}

export const AppListRow: React.FC<AppListRowProps> = ({
  label,
  extra,
  children,
  secondary,
  onClick,
}) => {
  const clickable = !!onClick

  const primary = (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        fontSize: typographyScale.fontSizeMd,
      }}
    >
      <span>{label}</span>
      {extra ? extra : null}
    </Box>
  )

  const [isLoading, setIsLoading] = useState(false)
  const handleClick = () => {
    if (onClick) {
      if (isAsyncFunction(onClick)) {
        setIsLoading(true)
        Promise.resolve(onClick()).finally(() => setIsLoading(false))
      } else {
        onClick()
      }
    }
  }

  return clickable ? (
    <ListItem disablePadding sx={{ mb: 0.25 }}>
      <ListItemButton
        onClick={handleClick}
        disabled={isLoading}
        sx={{
          borderRadius: `${radius.md}px`,
          px: 1.25,
          py: 0.85,
        }}
      >
        <ListItemText
          primary={primary}
          secondary={secondary}
          slotProps={{
            primary: {
              sx: {
                fontSize: typographyScale.fontSizeMd,
                fontWeight: typographyScale.fontWeightMedium,
              },
            },
            secondary: {
              sx: {
                fontSize: typographyScale.fontSizeXs,
                mt: 0.15,
              },
            },
          }}
        />
        {isLoading ? (
          <CircularProgress color="inherit" size={18} />
        ) : (
          <ChevronRightRounded sx={{ color: 'text.disabled', fontSize: 20 }} />
        )}
      </ListItemButton>
    </ListItem>
  ) : (
    <ListItem
      sx={{
        py: 0.75,
        px: 1.25,
        borderRadius: `${radius.md}px`,
      }}
    >
      <ListItemText
        primary={primary}
        secondary={secondary}
        slotProps={{
          primary: {
            sx: {
              fontSize: typographyScale.fontSizeMd,
              fontWeight: typographyScale.fontWeightMedium,
            },
          },
          secondary: {
            sx: {
              fontSize: typographyScale.fontSizeXs,
              mt: 0.15,
            },
          },
        }}
      />
      {children}
    </ListItem>
  )
}

export interface AppListProps {
  title: string
  children: ReactNode
}

export const AppList: React.FC<AppListProps> = ({ title, children }) => (
  <List
    sx={{
      py: 0.5,
      '& .MuiListItem-root': {
        borderRadius: `${radius.md}px`,
      },
    }}
  >
    <ListSubheader
      sx={{
        background: 'transparent',
        fontSize: typographyScale.fontSizeLg,
        fontWeight: typographyScale.fontWeightBold,
        color: 'text.primary',
        lineHeight: typographyScale.lineHeightTight,
        mb: 0.5,
        px: 1.25,
      }}
      disableSticky
    >
      {title}
    </ListSubheader>

    {children}
  </List>
)

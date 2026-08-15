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

import { typographyScale } from '@/theme/tokens'
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
    <ListItem disablePadding>
      <ListItemButton onClick={handleClick} disabled={isLoading}>
        <ListItemText primary={primary} secondary={secondary} />
        {isLoading ? (
          <CircularProgress color="inherit" size={20} />
        ) : (
          <ChevronRightRounded />
        )}
      </ListItemButton>
    </ListItem>
  ) : (
    <ListItem sx={{ py: 0.625 }}>
      <ListItemText primary={primary} secondary={secondary} />
      {children}
    </ListItem>
  )
}

export interface AppListProps {
  title: string
  children: ReactNode
}

export const AppList: React.FC<AppListProps> = ({ title, children }) => (
  <List>
    <ListSubheader
      sx={{
        background: 'transparent',
        fontSize: typographyScale.fontSizeLg,
        fontWeight: typographyScale.fontWeightBold,
        color: 'text.primary',
      }}
      disableSticky
    >
      {title}
    </ListSubheader>

    {children}
  </List>
)

import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from '@dnd-kit/core'
import {
  alpha,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from '@mui/material'
import type { CSSProperties, PointerEvent, ReactNode } from 'react'
import { useCallback } from 'react'
import { useMatch, useNavigate, useResolvedPath } from 'react-router'

interface SortableProps {
  setNodeRef?: (element: HTMLElement | null) => void
  attributes?: DraggableAttributes
  listeners?: DraggableSyntheticListeners
  style?: CSSProperties
  isDragging?: boolean
  disabled?: boolean
}

interface Props {
  to: string
  children: string
  icon: ReactNode[]
  sortable?: SortableProps
}
export const LayoutItem = (props: Props) => {
  const { to, children, icon, sortable } = props
  const resolved = useResolvedPath(to)
  const match = useMatch({ path: resolved.pathname, end: true })
  const navigate = useNavigate()

  const { setNodeRef, attributes, listeners, style, isDragging, disabled } =
    sortable ?? {}

  const draggable = Boolean(sortable) && !disabled
  const { onPointerDown, ...otherListeners } = draggable
    ? (listeners ?? {})
    : {}

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      onPointerDown?.(event)
    },
    [onPointerDown],
  )

  return (
    <ListItem
      ref={setNodeRef}
      style={style}
      sx={[
        { py: 0.5, maxWidth: 250, mx: 'auto', padding: '4px 0px' },
        isDragging ? { opacity: 0.78 } : {},
      ]}
    >
      <ListItemButton
        selected={!!match}
        {...(draggable ? (attributes ?? {}) : {})}
        {...(draggable ? otherListeners : {})}
        sx={[
          {
            borderRadius: 2,
            marginLeft: 1.25,
            paddingLeft: 1,
            paddingRight: 1,
            marginRight: 1.25,
            cursor: draggable ? 'grab' : 'pointer',
            '&:active': draggable ? { cursor: 'grabbing' } : {},
            '& .MuiListItemText-primary': {
              color: 'text.primary',
              fontWeight: 600,
            },
          },
          ({ palette: { mode, primary } }) => {
            const selectedBg = alpha(
              primary.main,
              mode === 'light' ? 0.1 : 0.14,
            )
            return {
              '&:hover': {
                backgroundColor: 'var(--background-elevated)',
              },
              '&.Mui-selected': {
                bgcolor: selectedBg,
                borderLeft: `3px solid ${primary.main}`,
                marginLeft: '7px',
                paddingLeft: '5px',
              },
              '&.Mui-selected:hover': {
                bgcolor: selectedBg,
              },
              '&.Mui-selected .MuiListItemText-primary': {
                color: 'text.primary',
              },
            }
          },
        ]}
        onPointerDown={handlePointerDown}
        onClick={() => navigate(to)}
      >
        <ListItemIcon
          sx={{
            color: match ? 'primary.main' : 'text.secondary',
            marginLeft: '6px',
            cursor: draggable ? 'grab' : 'inherit',
          }}
        >
          {icon[0]}
        </ListItemIcon>
        <ListItemText
          sx={{
            textAlign: 'center',
          }}
          primary={children}
        />
      </ListItemButton>
    </ListItem>
  )
}

import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CloseRounded, DragIndicatorRounded } from '@mui/icons-material'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Typography,
  alpha,
} from '@mui/material'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { AppCheckbox } from '@/components/ui'

export interface ConnectionColumnOption {
  id: string
  label: string
  visible: boolean
  toggleVisibility: (visible: boolean) => void
}

interface Props {
  open: boolean
  columns: ConnectionColumnOption[]
  onClose: () => void
  onOrderChange: (order: string[]) => void
  onReset: () => void
}

const listScrollSx = {
  maxHeight: 280,
  overflowY: 'auto',
  overflowX: 'hidden',
  pr: 0.5,
  mr: -0.5,
  display: 'flex',
  flexDirection: 'column',
  gap: 0.5,
  scrollbarWidth: 'thin',
  scrollbarColor: 'transparent transparent',
  '&:hover': {
    scrollbarColor: 'var(--scroller-color) transparent',
  },
  '&::-webkit-scrollbar': {
    width: 5,
  },
  '&::-webkit-scrollbar-track': {
    background: 'transparent',
  },
  '&::-webkit-scrollbar-thumb': {
    borderRadius: 5,
    backgroundColor: 'transparent',
  },
  '&:hover::-webkit-scrollbar-thumb': {
    backgroundColor: 'var(--scroller-color)',
  },
  '&::-webkit-scrollbar-corner': {
    background: 'transparent',
  },
} as const

export const ConnectionColumnManager = ({
  open,
  columns,
  onClose,
  onOrderChange,
  onReset,
}: Props) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  )
  const { t } = useTranslation()

  const items = useMemo(() => columns.map((column) => column.id), [columns])
  const visibleCount = useMemo(
    () => columns.filter((column) => column.visible).length,
    [columns],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const order = columns.map((column) => column.id)
      const oldIndex = order.indexOf(active.id as string)
      const newIndex = order.indexOf(over.id as string)
      if (oldIndex === -1 || newIndex === -1) return

      onOrderChange(arrayMove(order, oldIndex, newIndex))
    },
    [columns, onOrderChange],
  )

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      slotProps={{
        paper: {
          sx: (theme) => ({
            width: 340,
            maxWidth: 'calc(100vw - 48px)',
            maxHeight: 'min(420px, 72vh)',
            borderRadius: 2.5,
            border: '1px solid',
            borderColor: 'divider',
            backgroundImage: 'none',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            boxShadow:
              theme.palette.mode === 'light'
                ? '0 10px 32px rgba(15, 23, 42, 0.14)'
                : '0 14px 36px rgba(0, 0, 0, 0.55)',
          }),
        },
      }}
    >
      <DialogTitle
        sx={{
          position: 'relative',
          px: 2,
          pt: 1.75,
          pb: 1.25,
          pr: 5.5,
          fontSize: 15,
          fontWeight: 600,
          lineHeight: 1.35,
          flexShrink: 0,
        }}
      >
        {t('connections.components.columnManager.title')}
        <Typography
          component="div"
          variant="caption"
          color="text.secondary"
          sx={{ mt: 0.35, display: 'block', fontWeight: 400, fontSize: 12 }}
        >
          {t('connections.components.columnManager.hint')}
        </Typography>
        <IconButton
          aria-label={t('shared.actions.close')}
          onClick={onClose}
          size="small"
          sx={{
            position: 'absolute',
            right: 10,
            top: 12,
            color: 'text.secondary',
            borderRadius: 1.25,
            '&:hover': {
              color: 'text.primary',
              bgcolor: (theme) => alpha(theme.palette.action.hover, 0.08),
            },
          }}
        >
          <CloseRounded fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent
        sx={{
          px: 1.75,
          pt: '4px !important',
          pb: 1,
          flex: '1 1 auto',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <Box
          sx={(theme) => ({
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor:
              theme.palette.mode === 'light'
                ? alpha(theme.palette.grey[500], 0.04)
                : alpha(theme.palette.common.white, 0.03),
            p: 0.75,
            minHeight: 0,
            overflow: 'hidden',
          })}
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={items}>
              <Box sx={listScrollSx}>
                {columns.map((column) => (
                  <SortableColumnItem
                    key={column.id}
                    column={column}
                    dragHandleLabel={t(
                      'connections.components.columnManager.dragHandle',
                    )}
                    disableToggle={column.visible && visibleCount <= 1}
                  />
                ))}
              </Box>
            </SortableContext>
          </DndContext>
        </Box>
      </DialogContent>

      <Divider sx={{ opacity: 0.7 }} />
      <DialogActions
        sx={{
          px: 1.75,
          py: 1.25,
          gap: 0.75,
          flexShrink: 0,
        }}
      >
        <Button
          size="small"
          variant="text"
          color="inherit"
          onClick={onReset}
          sx={{
            textTransform: 'none',
            color: 'text.secondary',
            fontWeight: 500,
            fontSize: 13,
            minWidth: 0,
            px: 1,
          }}
        >
          {t('shared.actions.resetToDefault')}
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          variant="contained"
          onClick={onClose}
          sx={{
            textTransform: 'none',
            borderRadius: 1.5,
            px: 1.75,
            fontWeight: 600,
            fontSize: 13,
            boxShadow: 'none',
            minHeight: 30,
          }}
        >
          {t('shared.actions.close')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

interface SortableColumnItemProps {
  column: ConnectionColumnOption
  dragHandleLabel: string
  disableToggle?: boolean
}

const SortableColumnItem = ({
  column,
  dragHandleLabel,
  disableToggle = false,
}: SortableColumnItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id })

  const style = useMemo(
    () => ({
      transform: CSS.Transform.toString(transform),
      transition,
    }),
    [transform, transition],
  )

  return (
    <Box
      ref={setNodeRef}
      style={style}
      sx={(theme) => ({
        pl: 1,
        pr: 0.5,
        py: 0.25,
        minHeight: 34,
        borderRadius: 1.25,
        border: '1px solid',
        borderColor: isDragging ? 'primary.main' : 'transparent',
        backgroundColor: isDragging
          ? alpha(theme.palette.primary.main, 0.1)
          : theme.palette.background.paper,
        boxShadow: isDragging
          ? theme.palette.mode === 'light'
            ? '0 4px 12px rgba(15, 23, 42, 0.1)'
            : '0 6px 16px rgba(0, 0, 0, 0.35)'
          : 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        opacity: column.visible ? 1 : 0.62,
        zIndex: isDragging ? 2 : 0,
        transition:
          'border-color 0.12s ease, background-color 0.12s ease, opacity 0.12s ease',
        '&:hover': {
          backgroundColor: isDragging
            ? alpha(theme.palette.primary.main, 0.1)
            : alpha(
                theme.palette.action.hover,
                theme.palette.mode === 'light' ? 0.5 : 0.12,
              ),
        },
      })}
    >
      <AppCheckbox
        size="small"
        checked={column.visible}
        disabled={disableToggle}
        onChange={(event) => column.toggleVisibility(event.target.checked)}
        sx={{
          p: 0,
          m: 0,
          width: 18,
          height: 18,
          flexShrink: 0,
        }}
      />
      <Typography
        variant="body2"
        sx={{
          flex: 1,
          minWidth: 0,
          fontSize: 12.5,
          fontWeight: 500,
          lineHeight: 1.3,
          color: column.visible ? 'text.primary' : 'text.secondary',
          userSelect: 'none',
        }}
      >
        {column.label}
      </Typography>
      <IconButton
        size="small"
        sx={{
          width: 26,
          height: 26,
          flexShrink: 0,
          cursor: isDragging ? 'grabbing' : 'grab',
          color: 'text.disabled',
          borderRadius: 1,
          '&:hover': {
            color: 'text.secondary',
            bgcolor: (theme) => alpha(theme.palette.action.hover, 0.08),
          },
        }}
        aria-label={dragHandleLabel}
        {...attributes}
        {...listeners}
      >
        <DragIndicatorRounded sx={{ fontSize: 16 }} />
      </IconButton>
    </Box>
  )
}

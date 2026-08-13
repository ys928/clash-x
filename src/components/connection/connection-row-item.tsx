import { CloseRounded } from '@mui/icons-material'
import { Box, IconButton, alpha } from '@mui/material'
import { useLockFn } from 'ahooks'
import { memo, useCallback, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { closeConnection } from 'tauri-plugin-mihomo-api'

import { RelativeTime } from './connection-relative-time'
import type { ConnectionRowView } from './connection-row-view'

interface Props {
  row: ConnectionRowView
  closed: boolean
  onShowDetail: (id: string) => void
}

const Tag = ({ children }: { children: ReactNode }) => (
  <Box
    component="span"
    sx={{
      boxSizing: 'border-box',
      maxWidth: '100%',
      px: 0.75,
      py: 0.1,
      border: '1px solid',
      borderColor: 'divider',
      borderRadius: 1,
      fontSize: 10,
      lineHeight: 1.5,
      color: 'text.secondary',
      bgcolor: (theme) =>
        alpha(
          theme.palette.text.primary,
          theme.palette.mode === 'light' ? 0.03 : 0.06,
        ),
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </Box>
)

export const ConnectionRowItem = memo(
  function ConnectionRowItem({ row, closed, onShowDetail }: Props) {
    const { t } = useTranslation()
    const onDelete = useLockFn(async () => closeConnection(row.id))
    const handleShowDetail = useCallback(
      () => onShowDetail(row.id),
      [onShowDetail, row.id],
    )
    const showTraffic = row.uploadSpeed >= 100 || row.downloadSpeed >= 100

    return (
      <Box
        sx={(theme) => ({
          boxSizing: 'border-box',
          minHeight: 56,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 0.75,
          pr: closed ? 1.5 : 5.5,
          position: 'relative',
          overflow: 'hidden',
          borderBottom: '1px solid',
          borderColor: 'divider',
          transition: 'background-color 0.12s ease',
          '&:hover': {
            backgroundColor: alpha(
              theme.palette.primary.main,
              theme.palette.mode === 'light' ? 0.04 : 0.08,
            ),
            '& .connection-row-close': {
              opacity: 1,
            },
          },
        })}
      >
        <Box
          onClick={handleShowDetail}
          sx={{
            minWidth: 0,
            flex: 1,
            cursor: 'pointer',
            userSelect: 'text',
          }}
        >
          <Box
            sx={{
              fontSize: 14,
              fontWeight: 500,
              lineHeight: 1.4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: 'text.primary',
            }}
          >
            {row.host}
          </Box>
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 0.5,
              mt: 0.5,
              overflow: 'hidden',
            }}
          >
            <Tag>{row.network}</Tag>
            <Tag>{row.type}</Tag>
            {row.process ? <Tag>{row.process}</Tag> : null}
            {row.chains ? <Tag>{row.chains}</Tag> : null}
            <Tag>
              <RelativeTime start={row.time} />
            </Tag>
            {showTraffic ? (
              <Tag>
                {row.uploadSpeedText} / {row.downloadSpeedText}
              </Tag>
            ) : null}
          </Box>
        </Box>
        {!closed && (
          <IconButton
            className="connection-row-close"
            size="small"
            color="inherit"
            onClick={onDelete}
            title={t('connections.components.actions.closeConnection')}
            aria-label={t('connections.components.actions.closeConnection')}
            sx={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 30,
              height: 30,
              borderRadius: 1.5,
              opacity: 0.55,
              color: 'text.secondary',
              transition: 'opacity 0.12s ease, background-color 0.12s ease',
              '&:hover': {
                color: 'error.main',
                bgcolor: (theme) => alpha(theme.palette.error.main, 0.08),
              },
            }}
          >
            <CloseRounded fontSize="small" />
          </IconButton>
        )}
      </Box>
    )
  },
  (prev, next) =>
    prev.row === next.row &&
    prev.closed === next.closed &&
    prev.onShowDetail === next.onShowDetail,
)

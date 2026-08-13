import {
  CloseRounded,
  DeleteForeverRounded,
  MoreVert,
  TableChartRounded,
  TableRowsRounded,
  ViewColumnRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
  Chip,
  Divider,
  Fab,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
  Zoom,
  alpha,
} from '@mui/material'
import { useLockFn } from 'ahooks'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { closeAllConnections } from 'tauri-plugin-mihomo-api'

import {
  BaseEmpty,
  BasePage,
  BaseSearchBox,
  BaseStyledSelect,
  type SearchState,
  VirtualList,
} from '@/components/base'
import {
  ConnectionDetail,
  ConnectionDetailRef,
} from '@/components/connection/connection-detail'
import { ConnectionRowItem } from '@/components/connection/connection-row-item'
import {
  getConnectionStartTime,
  useConnectionRowViews,
} from '@/components/connection/connection-row-view'
import { ConnectionTable } from '@/components/connection/connection-table'
import { useConnectionData } from '@/hooks/use-connection-data'
import { useConnectionSetting } from '@/hooks/use-connection-setting'
import { useTrafficData } from '@/hooks/use-traffic-data'
import { useVisibility } from '@/hooks/use-visibility'
import parseTraffic from '@/utils/parse-traffic'

type OrderFunc = (list: IConnectionsItem[]) => IConnectionsItem[]

const ORDER_OPTIONS = [
  {
    id: 'default',
    labelKey: 'connections.components.order.default',
    fn: (list: IConnectionsItem[]) =>
      list.sort(
        (a, b) => getConnectionStartTime(b) - getConnectionStartTime(a),
      ),
  },
  {
    id: 'uploadSpeed',
    labelKey: 'connections.components.order.uploadSpeed',
    fn: (list: IConnectionsItem[]) =>
      list.sort((a, b) => (b.curUpload ?? 0) - (a.curUpload ?? 0)),
  },
  {
    id: 'downloadSpeed',
    labelKey: 'connections.components.order.downloadSpeed',
    fn: (list: IConnectionsItem[]) =>
      list.sort((a, b) => (b.curDownload ?? 0) - (a.curDownload ?? 0)),
  },
] as const

type OrderKey = (typeof ORDER_OPTIONS)[number]['id']

const orderFunctionMap = ORDER_OPTIONS.reduce<Record<OrderKey, OrderFunc>>(
  (acc, option) => {
    acc[option.id] = option.fn
    return acc
  },
  {} as Record<OrderKey, OrderFunc>,
)

const controlSx = {
  height: 34,
  borderRadius: 1.5,
  bgcolor: 'background.paper',
  outline: 'none',
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: 'divider',
  },
  '&:hover .MuiOutlinedInput-notchedOutline': {
    borderColor: 'divider',
  },
  '&.Mui-focused': {
    outline: 'none',
  },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
    borderWidth: 1,
    borderColor: 'divider',
  },
  '&.Mui-focused:hover .MuiOutlinedInput-notchedOutline': {
    borderColor: 'divider',
  },
} as const

const menuPaperSx = {
  mt: 0.75,
  minWidth: 200,
  borderRadius: 2,
  border: '1px solid',
  borderColor: 'divider',
  bgcolor: 'background.paper',
  backgroundImage: 'none',
  overflow: 'hidden',
  boxShadow: (theme: { palette: { mode: 'light' | 'dark' } }) =>
    theme.palette.mode === 'light'
      ? '0 4px 16px rgba(15, 23, 42, 0.08)'
      : '0 8px 24px rgba(0, 0, 0, 0.45)',
  '& .MuiList-root': { py: 0.5 },
  '& .MuiMenuItem-root': {
    mx: 0.5,
    px: 1.25,
    py: 0.75,
    minHeight: 34,
    borderRadius: 1.25,
    fontSize: 13,
  },
} as const

const EMPTY_CONNECTIONS: IConnectionsItem[] = []

const ConnectionsPage = () => {
  const { t } = useTranslation()
  const pageVisible = useVisibility()
  const [match, setMatch] = useState<(input: string) => boolean>(
    () => () => true,
  )
  const [hasSearch, setHasSearch] = useState(false)
  const [curOrderOpt, setCurOrderOpt] = useState<OrderKey>('default')
  const [connectionsType, setConnectionsType] = useState<'active' | 'closed'>(
    'active',
  )

  const {
    response: { data: connections },
    clearClosedConnections,
  } = useConnectionData({ enabled: pageVisible })
  const {
    response: { data: traffic },
  } = useTrafficData({ enabled: pageVisible })

  const [setting, setSetting] = useConnectionSetting()

  const isTableLayout = setting.layout === 'table'

  const [isColumnManagerOpen, setIsColumnManagerOpen] = useState(false)
  const [overflowAnchor, setOverflowAnchor] = useState<null | HTMLElement>(null)
  const [showClosed, setShowClosed] = useState(false)

  const selectedConnections =
    connectionsType === 'active'
      ? (connections?.activeConnections ?? EMPTY_CONNECTIONS)
      : (connections?.closedConnections ?? EMPTY_CONNECTIONS)

  const filterConn = useMemo(() => {
    const orderFunc = orderFunctionMap[curOrderOpt]

    if (isTableLayout && !hasSearch) return selectedConnections
    if (!hasSearch) return orderFunc([...selectedConnections])

    const matchConns = selectedConnections.filter((conn) => {
      const { host, destinationIP, process } = conn.metadata
      return (
        match(host || '') || match(destinationIP || '') || match(process || '')
      )
    })

    return orderFunc ? orderFunc(matchConns) : matchConns
  }, [selectedConnections, isTableLayout, hasSearch, match, curOrderOpt])

  const displayRows = useConnectionRowViews(
    isTableLayout ? EMPTY_CONNECTIONS : filterConn,
  )

  const detailRef = useRef<ConnectionDetailRef>(null!)

  const selectConnectionsType = useCallback(
    (type: 'active' | 'closed') => {
      if (type === connectionsType) return
      detailRef.current?.close()
      setIsColumnManagerOpen(false)
      setConnectionsType(type)
    },
    [connectionsType],
  )

  const showDetailById = useCallback(
    (id: string) => {
      const connection = filterConn.find((item) => item.id === id)
      if (connection) {
        detailRef.current?.open(connection, connectionsType === 'closed')
      }
    },
    [connectionsType, filterConn],
  )

  const onCloseAll = useLockFn(closeAllConnections)

  const handleSearch = useCallback(
    (match: (content: string) => boolean, state: SearchState) => {
      setMatch(() => match)
      setHasSearch(state.text.length > 0)
    },
    [],
  )
  const hasTableData = filterConn.length > 0
  const activeCount = connections?.activeConnections.length ?? 0
  const closedCount = connections?.closedConnections.length ?? 0

  return (
    <BasePage
      full
      title={
        <span style={{ whiteSpace: 'nowrap' }}>
          {t('connections.page.title')}
        </span>
      }
      contentStyle={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: '8px',
        minHeight: 0,
      }}
      header={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Button
            size="small"
            variant="outlined"
            color="inherit"
            startIcon={<CloseRounded sx={{ fontSize: 16 }} />}
            onClick={onCloseAll}
            sx={{
              height: 30,
              px: 1.25,
              borderRadius: 1.5,
              borderColor: 'divider',
              color: 'text.secondary',
              fontWeight: 500,
              fontSize: 13,
              textTransform: 'none',
              bgcolor: 'background.paper',
              whiteSpace: 'nowrap',
              '&:hover': {
                borderColor: 'error.main',
                color: 'error.main',
                bgcolor: (theme) => alpha(theme.palette.error.main, 0.06),
              },
            }}
          >
            {t('shared.actions.closeAll')}
          </Button>
          <IconButton
            size="small"
            color="inherit"
            onClick={(event) => setOverflowAnchor(event.currentTarget)}
            aria-label={t('connections.page.actions.more')}
            sx={{
              width: 30,
              height: 30,
              borderRadius: 1.5,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
            }}
          >
            <MoreVert fontSize="small" />
          </IconButton>
          <Menu
            anchorEl={overflowAnchor}
            open={Boolean(overflowAnchor)}
            onClose={() => setOverflowAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{ paper: { sx: menuPaperSx } }}
          >
            <MenuItem disabled sx={{ opacity: '1 !important' }}>
              <Typography variant="caption" color="text.secondary">
                {t('shared.labels.downloaded')}:{' '}
                {parseTraffic(traffic?.downTotal || 0)}
              </Typography>
            </MenuItem>
            <MenuItem disabled sx={{ opacity: '1 !important' }}>
              <Typography variant="caption" color="text.secondary">
                {t('shared.labels.uploaded')}:{' '}
                {parseTraffic(traffic?.upTotal || 0)}
              </Typography>
            </MenuItem>
            <Divider sx={{ my: 0.5 }} />
            <MenuItem
              onClick={() => {
                setSetting((o) =>
                  o?.layout !== 'table'
                    ? { ...o, layout: 'table' }
                    : { ...o, layout: 'list' },
                )
                setOverflowAnchor(null)
              }}
            >
              {isTableLayout ? (
                <TableRowsRounded fontSize="small" sx={{ mr: 1.25 }} />
              ) : (
                <TableChartRounded fontSize="small" sx={{ mr: 1.25 }} />
              )}
              {isTableLayout
                ? t('shared.actions.listView')
                : t('shared.actions.tableView')}
            </MenuItem>
            <MenuItem
              onClick={() => {
                setShowClosed((prev) => !prev)
                if (showClosed) {
                  selectConnectionsType('active')
                }
                setOverflowAnchor(null)
              }}
            >
              {showClosed
                ? t('connections.components.actions.hideClosed')
                : t('connections.components.actions.showClosed')}
            </MenuItem>
          </Menu>
        </Box>
      }
    >
      <Box
        sx={{
          px: 1.5,
          pt: 1.25,
          pb: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexWrap: 'wrap',
          borderBottom: '1px solid',
          borderColor: 'divider',
          userSelect: 'text',
          position: 'sticky',
          top: 0,
          zIndex: 2,
        }}
      >
        {showClosed ? (
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              p: 0.25,
              borderRadius: 1.5,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
            }}
          >
            {(
              [
                {
                  type: 'active' as const,
                  label: t('connections.components.actions.active'),
                  count: activeCount,
                },
                {
                  type: 'closed' as const,
                  label: t('connections.components.actions.closed'),
                  count: closedCount,
                },
              ] as const
            ).map((item) => {
              const selected = connectionsType === item.type
              return (
                <Chip
                  key={item.type}
                  size="small"
                  clickable
                  label={`${item.label} ${item.count}`}
                  onClick={() => selectConnectionsType(item.type)}
                  variant={selected ? 'filled' : 'outlined'}
                  color={selected ? 'primary' : 'default'}
                  sx={{
                    height: 26,
                    fontSize: 12,
                    fontWeight: 500,
                    border: 'none',
                    bgcolor: selected ? undefined : 'transparent',
                  }}
                />
              )
            })}
          </Box>
        ) : (
          <Chip
            size="small"
            variant="outlined"
            label={`${t('connections.components.actions.active')} ${activeCount}`}
            sx={{
              height: 28,
              fontSize: 12,
              fontWeight: 500,
              borderColor: 'divider',
              bgcolor: 'background.paper',
              color: 'text.secondary',
            }}
          />
        )}

        {!isTableLayout && (
          <BaseStyledSelect
            value={curOrderOpt}
            onChange={(e) => setCurOrderOpt(e.target.value as OrderKey)}
            sx={{
              ...controlSx,
              width: 132,
              height: 34,
              mr: 0,
              fontSize: 13,
              '& .MuiSelect-select': {
                py: '7px',
                display: 'flex',
                alignItems: 'center',
              },
            }}
          >
            {ORDER_OPTIONS.map((option) => (
              <MenuItem key={option.id} value={option.id} sx={{ fontSize: 13 }}>
                {t(option.labelKey)}
              </MenuItem>
            ))}
          </BaseStyledSelect>
        )}

        <Box
          sx={{
            flex: 1,
            minWidth: 160,
            display: 'flex',
            alignItems: 'center',
            '& .MuiInputBase-root': {
              ...controlSx,
              fontSize: 13,
              pr: 0.5,
            },
            '& .MuiInputBase-input': {
              py: '7px',
              fontSize: 13,
            },
            '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline':
              {
                borderWidth: '1px !important',
                borderColor: 'divider !important',
              },
          }}
        >
          <BaseSearchBox onSearch={handleSearch} />
        </Box>

        {isTableLayout && (
          <Tooltip title={t('connections.components.columnManager.title')}>
            <IconButton
              size="small"
              aria-label={t('connections.components.columnManager.title')}
              onClick={() => setIsColumnManagerOpen(true)}
              disabled={!hasTableData}
              sx={{
                width: 34,
                height: 34,
                flex: '0 0 auto',
                borderRadius: 1.5,
                border: '1px solid',
                borderColor: isColumnManagerOpen ? 'primary.main' : 'divider',
                bgcolor: (theme) =>
                  isColumnManagerOpen
                    ? alpha(theme.palette.primary.main, 0.08)
                    : 'background.paper',
                color: isColumnManagerOpen ? 'primary.main' : 'text.secondary',
                '&:hover': {
                  borderColor: 'primary.main',
                  bgcolor: (theme) => alpha(theme.palette.primary.main, 0.06),
                },
              }}
            >
              <ViewColumnRounded fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {!hasTableData ? (
        <BaseEmpty />
      ) : isTableLayout ? (
        <ConnectionTable
          connections={filterConn}
          onShowDetail={showDetailById}
          columnManagerOpen={isColumnManagerOpen}
          onCloseColumnManager={() => setIsColumnManagerOpen(false)}
        />
      ) : (
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            px: 1.5,
            pt: 1,
            pb: 1.25,
          }}
        >
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              '& > div': {
                scrollbarWidth: 'thin',
                scrollbarColor: 'transparent transparent',
                '&:hover': {
                  scrollbarColor: 'var(--scroller-color) transparent',
                },
                '&::-webkit-scrollbar': {
                  width: 6,
                  height: 6,
                },
                '&::-webkit-scrollbar-track': {
                  background: 'transparent',
                },
                '&::-webkit-scrollbar-thumb': {
                  borderRadius: 6,
                  backgroundColor: 'transparent',
                },
                '&:hover::-webkit-scrollbar-thumb': {
                  backgroundColor: 'var(--scroller-color)',
                },
                '&::-webkit-scrollbar-corner': {
                  background: 'transparent',
                },
              },
            }}
          >
            <VirtualList
              key={connectionsType}
              count={displayRows.length}
              estimateSize={56}
              renderItem={(i) => (
                <ConnectionRowItem
                  row={displayRows[i]}
                  closed={connectionsType === 'closed'}
                  onShowDetail={showDetailById}
                />
              )}
              style={{
                flex: 1,
                WebkitOverflowScrolling: 'touch',
                overscrollBehavior: 'contain',
              }}
            />
          </Box>
        </Box>
      )}
      <ConnectionDetail ref={detailRef} />
      <Zoom
        in={connectionsType === 'closed' && filterConn.length > 0}
        unmountOnExit
      >
        <Fab
          size="medium"
          variant="extended"
          sx={{
            position: 'absolute',
            right: 16,
            bottom: isTableLayout ? 70 : 16,
            borderRadius: 2,
            boxShadow: (theme) =>
              theme.palette.mode === 'light'
                ? '0 4px 14px rgba(15, 23, 42, 0.12)'
                : '0 6px 18px rgba(0, 0, 0, 0.4)',
          }}
          color="primary"
          onClick={() => clearClosedConnections()}
        >
          <DeleteForeverRounded sx={{ mr: 1 }} fontSize="small" />
          {t('shared.actions.clear')}
        </Fab>
      </Zoom>
    </BasePage>
  )
}

export default ConnectionsPage

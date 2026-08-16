import {
  DeleteOutlineRounded,
  PauseCircleOutlineRounded,
  PlayCircleOutlineRounded,
  SwapVertRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Tooltip,
  alpha,
} from '@mui/material'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  type SearchState,
  VirtualList,
  type VirtualListHandle,
} from '@/components/base'
import LogItem from '@/components/log/log-item'
import { AppEmpty, AppPage, AppSearchField, AppSelect } from '@/components/ui'
import { useClashLog } from '@/hooks/use-clash-log'
import { useLogData } from '@/hooks/use-log-data'

const LOG_LEVELS = ['all', 'debug', 'info', 'warn', 'err'] as const

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

const iconBtnSx = {
  width: 30,
  height: 30,
  borderRadius: 1.5,
  border: '1px solid',
  borderColor: 'divider',
  bgcolor: 'background.paper',
  color: 'text.secondary',
  '&:hover': {
    borderColor: 'primary.main',
    color: 'primary.main',
    bgcolor: (theme: { palette: { primary: { main: string } } }) =>
      alpha(theme.palette.primary.main, 0.06),
  },
} as const

const LogPage = () => {
  const { t } = useTranslation()
  const [clashLog, setClashLog] = useClashLog()
  const enableLog = clashLog.enable
  const logState = clashLog.logFilter
  const logOrder = clashLog.logOrder ?? 'asc'
  const isDescending = logOrder === 'desc'

  const [match, setMatch] = useState(() => (_: string) => true)
  const [searchState, setSearchState] = useState<SearchState>()
  const {
    response: { data: logData },
    refreshGetClashLog,
  } = useLogData()

  const filterLogs = useMemo(() => {
    if (!logData || logData.length === 0) {
      return []
    }

    return logData.filter((data) => {
      const searchText =
        `${data.time || ''} ${data.type} ${data.payload}`.toLowerCase()

      const matchesSearch = match(searchText)

      return (
        (logState == 'all' ? true : data.type.includes(logState)) &&
        matchesSearch
      )
    })
  }, [logData, logState, match])

  const filteredLogs = useMemo(
    () => (isDescending ? [...filterLogs].reverse() : filterLogs),
    [filterLogs, isDescending],
  )

  const scrollRef = useRef({ isNearBottom: true })
  const virtuosoRef = useRef<VirtualListHandle>(null)

  useEffect(() => {
    if (!isDescending && scrollRef.current.isNearBottom) {
      virtuosoRef.current?.scrollToIndex(filteredLogs.length - 1, {
        behavior: 'smooth',
      })
    }
  }, [isDescending, filteredLogs.length])

  const handleLogLevelChange = (newLevel: LogFilter) => {
    setClashLog((pre) => ({ ...pre!, logFilter: newLevel }))
  }

  const handleToggleLog = async () => {
    setClashLog((pre) => ({ ...pre!, enable: !enableLog }))
  }

  const handleToggleOrder = () => {
    setClashLog((pre) => ({
      ...pre!,
      logOrder: pre!.logOrder === 'desc' ? 'asc' : 'desc',
    }))
  }

  const handleSearch = useCallback(
    (matcher: (content: string) => boolean, state: SearchState) => {
      setMatch(() => matcher)
      setSearchState(state)
    },
    [],
  )

  const totalCount = logData?.length ?? 0
  const filteredCount = filteredLogs.length

  return (
    <AppPage
      full
      title={t('logs.page.title')}
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
          <Tooltip
            title={t(
              enableLog ? 'shared.actions.pause' : 'shared.actions.resume',
            )}
          >
            <IconButton
              size="small"
              color="inherit"
              onClick={handleToggleLog}
              aria-label={t(
                enableLog ? 'shared.actions.pause' : 'shared.actions.resume',
              )}
              sx={{
                ...iconBtnSx,
                ...(enableLog
                  ? {}
                  : {
                      borderColor: 'warning.main',
                      color: 'warning.main',
                      bgcolor: (theme) =>
                        alpha(theme.palette.warning.main, 0.08),
                    }),
              }}
            >
              {enableLog ? (
                <PauseCircleOutlineRounded sx={{ fontSize: 18 }} />
              ) : (
                <PlayCircleOutlineRounded sx={{ fontSize: 18 }} />
              )}
            </IconButton>
          </Tooltip>

          <Tooltip
            title={t(
              isDescending
                ? 'logs.actions.showAscending'
                : 'logs.actions.showDescending',
            )}
          >
            <IconButton
              size="small"
              color="inherit"
              onClick={handleToggleOrder}
              aria-label={t(
                isDescending
                  ? 'logs.actions.showAscending'
                  : 'logs.actions.showDescending',
              )}
              sx={iconBtnSx}
            >
              <SwapVertRounded
                sx={{
                  fontSize: 18,
                  transform: isDescending ? 'scaleY(-1)' : 'none',
                }}
              />
            </IconButton>
          </Tooltip>

          <Button
            size="small"
            variant="outlined"
            color="inherit"
            startIcon={<DeleteOutlineRounded sx={{ fontSize: 16 }} />}
            onClick={() => refreshGetClashLog(true)}
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
            {t('shared.actions.clear')}
          </Button>
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
        <Chip
          size="small"
          variant="outlined"
          label={
            filteredCount === totalCount
              ? `${filteredCount}`
              : `${filteredCount} / ${totalCount}`
          }
          sx={{
            height: 28,
            fontSize: 12,
            fontWeight: 500,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            color: 'text.secondary',
            fontVariantNumeric: 'tabular-nums',
          }}
        />

        {!enableLog && (
          <Chip
            size="small"
            label={t('shared.actions.pause')}
            sx={{
              height: 26,
              fontSize: 12,
              fontWeight: 500,
              border: 'none',
              color: 'warning.main',
              bgcolor: (theme) => alpha(theme.palette.warning.main, 0.12),
            }}
          />
        )}

        <AppSelect
          value={logState}
          onChange={(e) => handleLogLevelChange(e.target.value as LogFilter)}
          sx={{
            ...controlSx,
            width: 120,
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
          {LOG_LEVELS.map((level) => (
            <MenuItem key={level} value={level} sx={{ fontSize: 13 }}>
              {t(
                level === 'err'
                  ? 'shared.filters.logLevels.error'
                  : (`shared.filters.logLevels.${level}` as const),
              )}
            </MenuItem>
          ))}
        </AppSelect>

        <Box
          sx={{
            flex: 1,
            minWidth: 160,
            display: 'flex',
            alignItems: 'center',
            '& .MuiInputBase-root': {
              height: 34,
              borderRadius: 1.5,
              fontSize: 13,
              pr: 0.5,
            },
            '& .MuiInputBase-input': {
              py: '7px',
              fontSize: 13,
            },
          }}
        >
          <AppSearchField onSearch={handleSearch} />
        </Box>
      </Box>

      {filteredLogs.length > 0 ? (
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
              ref={virtuosoRef}
              count={filteredLogs.length}
              estimateSize={48}
              renderItem={(i) => (
                <LogItem value={filteredLogs[i]} searchState={searchState} />
              )}
              onScroll={(event) => {
                const element = event.currentTarget as HTMLDivElement
                scrollRef.current.isNearBottom =
                  element.scrollHeight -
                    element.scrollTop -
                    element.clientHeight <=
                  20
              }}
              style={{
                flex: 1,
                WebkitOverflowScrolling: 'touch',
                overscrollBehavior: 'contain',
              }}
            />
          </Box>
        </Box>
      ) : (
        <AppEmpty />
      )}
    </AppPage>
  )
}

export default LogPage

import {
  MoreVert,
  PauseCircleOutlineRounded,
  PlayCircleOutlineRounded,
  SwapVertRounded,
} from '@mui/icons-material'
import { Box, Button, IconButton, Menu, MenuItem } from '@mui/material'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  BaseEmpty,
  BasePage,
  BaseSearchBox,
  BaseStyledSelect,
  type SearchState,
  VirtualList,
  type VirtualListHandle,
} from '@/components/base'
import LogItem from '@/components/log/log-item'
import { useClashLog } from '@/hooks/use-clash-log'
import { useLogData } from '@/hooks/use-log-data'

const LogPage = () => {
  const { t } = useTranslation()
  const [clashLog, setClashLog] = useClashLog()
  const enableLog = clashLog.enable
  const logState = clashLog.logFilter
  const logOrder = clashLog.logOrder ?? 'asc'
  const isDescending = logOrder === 'desc'

  const [match, setMatch] = useState(() => (_: string) => true)
  const [searchState, setSearchState] = useState<SearchState>()
  const [overflowAnchor, setOverflowAnchor] = useState<null | HTMLElement>(null)
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

  return (
    <BasePage
      full
      title={t('logs.page.title')}
      contentStyle={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
      }}
      header={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton
            title={t(
              enableLog ? 'shared.actions.pause' : 'shared.actions.resume',
            )}
            aria-label={t(
              enableLog ? 'shared.actions.pause' : 'shared.actions.resume',
            )}
            size="small"
            color="inherit"
            onClick={handleToggleLog}
          >
            {enableLog ? (
              <PauseCircleOutlineRounded />
            ) : (
              <PlayCircleOutlineRounded />
            )}
          </IconButton>

          <Button
            size="small"
            variant="contained"
            onClick={() => {
              refreshGetClashLog(true)
            }}
          >
            {t('shared.actions.clear')}
          </Button>

          <IconButton
            size="small"
            color="inherit"
            onClick={(event) => setOverflowAnchor(event.currentTarget)}
            aria-label={t('logs.page.actions.more')}
          >
            <MoreVert fontSize="small" />
          </IconButton>
          <Menu
            anchorEl={overflowAnchor}
            open={Boolean(overflowAnchor)}
            onClose={() => setOverflowAnchor(null)}
          >
            <MenuItem
              onClick={() => {
                handleToggleOrder()
                setOverflowAnchor(null)
              }}
            >
              <SwapVertRounded
                fontSize="small"
                sx={{
                  mr: 1,
                  transform: isDescending ? 'scaleY(-1)' : 'none',
                }}
              />
              {t(
                isDescending
                  ? 'logs.actions.showAscending'
                  : 'logs.actions.showDescending',
              )}
            </MenuItem>
          </Menu>
        </Box>
      }
    >
      <Box
        sx={{
          pt: 1,
          mb: 0.5,
          mx: '10px',
          height: '39px',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <BaseStyledSelect
          value={logState}
          onChange={(e) => handleLogLevelChange(e.target.value as LogFilter)}
        >
          <MenuItem value="all">{t('shared.filters.logLevels.all')}</MenuItem>
          <MenuItem value="debug">
            {t('shared.filters.logLevels.debug')}
          </MenuItem>
          <MenuItem value="info">{t('shared.filters.logLevels.info')}</MenuItem>
          <MenuItem value="warn">{t('shared.filters.logLevels.warn')}</MenuItem>
          <MenuItem value="err">{t('shared.filters.logLevels.error')}</MenuItem>
        </BaseStyledSelect>
        <BaseSearchBox
          onSearch={(matcher, state) => {
            setMatch(() => matcher)
            setSearchState(state)
          }}
        />
      </Box>

      {filteredLogs.length > 0 ? (
        <VirtualList
          ref={virtuosoRef}
          count={filteredLogs.length}
          estimateSize={50}
          renderItem={(i) => (
            <LogItem value={filteredLogs[i]} searchState={searchState} />
          )}
          onScroll={(event) => {
            const element = event.currentTarget as HTMLDivElement
            scrollRef.current.isNearBottom =
              element.scrollHeight - element.scrollTop - element.clientHeight <=
              20
          }}
          style={{ flex: 1 }}
        />
      ) : (
        <BaseEmpty />
      )}
    </BasePage>
  )
}

export default LogPage

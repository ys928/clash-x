import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Box, List, Menu, MenuItem, Paper, ThemeProvider } from '@mui/material'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import type { CSSProperties } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useNavigate } from 'react-router'
import { MihomoWebSocket } from 'tauri-plugin-mihomo-api'

import { BaseErrorBoundary } from '@/components/base'
import { CustomTitlebar } from '@/components/layout/custom-titlebar'
import { LayoutItem } from '@/components/layout/layout-item'
import { LayoutTraffic } from '@/components/layout/layout-traffic'
import { NoticeManager } from '@/components/layout/notice-manager'
import { ServiceMigrationDialog } from '@/components/layout/service-migration-dialog'
import { SysproxyPrivilegeDialog } from '@/components/layout/sysproxy-privilege-dialog'
import { WindowResizeHandles } from '@/components/layout/window-controller'
import { AutoSwitchRunnerHost } from '@/components/proxy/auto-switch-runner-host'
import { useI18n } from '@/hooks/use-i18n'
import { useVerge } from '@/hooks/use-verge'
import { useThemeMode } from '@/services/states'
import { APP_NAVIGATE_EVENT } from '@/utils/app-navigate'
import getSystem from '@/utils/get-system'

import {
  useCustomTheme,
  useLayoutEvents,
  useLoadingOverlay,
  useNavMenuOrder,
  usePendingFailures,
} from './_layout/hooks'
import { handleNoticeMessage } from './_layout/utils'
import { navItems, primaryNavItems, settingsNavItem } from './_navigation'

import 'dayjs/locale/ru'
import 'dayjs/locale/zh-cn'

type NavItem = (typeof navItems)[number]

type MenuContextPosition = { top: number; left: number }

interface SortableNavMenuItemProps {
  item: NavItem
  label: string
}

const SortableNavMenuItem = ({ item, label }: SortableNavMenuItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.path,
  })

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  if (isDragging) {
    style.zIndex = 100
  }

  return (
    <LayoutItem
      to={item.path}
      icon={item.icon}
      sortable={{
        setNodeRef,
        attributes,
        listeners,
        style,
        isDragging,
      }}
    >
      {label}
    </LayoutItem>
  )
}

const filterOrderedItems = (
  order: string[],
  items: readonly NavItem[],
): NavItem[] => {
  const map = new Map(items.map((item) => [item.path, item] as const))
  const seen = new Set<string>()
  const result: NavItem[] = []

  for (const path of order) {
    const item = map.get(path)
    if (item && !seen.has(path)) {
      result.push(item)
      seen.add(path)
    }
  }

  for (const item of items) {
    if (!seen.has(item.path)) {
      result.push(item)
    }
  }

  return result
}

dayjs.extend(relativeTime)

const OS = getSystem()

const Layout = () => {
  const mode = useThemeMode()
  const { t } = useTranslation()
  const { theme } = useCustomTheme()
  const { verge, mutateVerge, patchVerge } = useVerge()
  const { language } = verge ?? {}
  const { switchLanguage } = useI18n()
  const navigate = useNavigate()
  const themeReady = useMemo(() => Boolean(theme), [theme])

  // 开发环境下检测 MihomoWebSocket 的所有实例
  useEffect(() => {
    let id: number
    if (import.meta.env.DEV) {
      id = setInterval(() => {
        MihomoWebSocket.get_all_instances().then((list) => {
          console.log('Mihomo ws instances', list)
        })
      }, 1000)
    }

    return () => {
      if (id) {
        clearInterval(id)
      }
    }
  }, [])

  const [menuUnlocked, setMenuUnlocked] = useState(false)
  const [menuContextPosition, setMenuContextPosition] =
    useState<MenuContextPosition | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const handleMenuOrderOptimisticUpdate = useCallback(
    (order: string[]) => {
      mutateVerge(
        (prev) => (prev ? { ...prev, menu_order: order } : prev),
        false,
      )
    },
    [mutateVerge],
  )

  const handleMenuOrderPersist = useCallback(
    (order: string[]) => patchVerge({ menu_order: order }),
    [patchVerge],
  )

  const { menuOrder, handleMenuDragEnd, isDefaultOrder, resetMenuOrder } =
    useNavMenuOrder({
      enabled: menuUnlocked,
      items: primaryNavItems,
      storedOrder: verge?.menu_order,
      onOptimisticUpdate: handleMenuOrderOptimisticUpdate,
      onPersist: handleMenuOrderPersist,
    })

  const orderedPrimaryItems = useMemo(
    () => filterOrderedItems(menuOrder, primaryNavItems),
    [menuOrder],
  )

  const handleMenuContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      event.preventDefault()
      event.stopPropagation()
      setMenuContextPosition({ top: event.clientY, left: event.clientX })
    },
    [],
  )

  const handleMenuContextClose = useCallback(() => {
    setMenuContextPosition(null)
  }, [])

  const handleResetMenuOrder = useCallback(() => {
    setMenuContextPosition(null)
    void resetMenuOrder()
  }, [resetMenuOrder])

  const handleUnlockMenu = useCallback(() => {
    setMenuUnlocked(true)
    setMenuContextPosition(null)
  }, [])

  const handleLockMenu = useCallback(() => {
    setMenuUnlocked(false)
    setMenuContextPosition(null)
  }, [])

  useLoadingOverlay(themeReady)

  const handleNotice = useCallback(
    (payload: [string, string]) => {
      const [status, msg] = payload
      try {
        handleNoticeMessage(status, msg, t, navigate)
      } catch (error) {
        console.error('[通知处理] 失败:', error)
      }
    },
    [t, navigate],
  )

  useLayoutEvents(handleNotice)
  usePendingFailures()

  useEffect(() => {
    if (language) {
      dayjs.locale(language === 'zh' ? 'zh-cn' : language)
      switchLanguage(language)
    }
  }, [language, switchLanguage])

  useEffect(() => {
    const onNavigate = (event: Event) => {
      const path = (event as CustomEvent<{ path: string }>).detail.path
      if (path) navigate(path)
    }

    window.addEventListener(APP_NAVIGATE_EVENT, onNavigate)
    return () => window.removeEventListener(APP_NAVIGATE_EVENT, onNavigate)
  }, [navigate])

  const renderNavList = (items: NavItem[], sortable: boolean) => {
    if (sortable) {
      return items.map((item) => (
        <SortableNavMenuItem
          key={item.path}
          item={item}
          label={t(item.label)}
        />
      ))
    }

    return items.map((item) => (
      <LayoutItem key={item.path} to={item.path} icon={item.icon}>
        {t(item.label)}
      </LayoutItem>
    ))
  }

  if (!themeReady) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          background: mode === 'light' ? '#F2F3F5' : '#1A1B1E',
          transition: 'background 0.2s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: mode === 'light' ? '#1C1D21' : '#E8E8EA',
        }}
      ></div>
    )
  }

  return (
    <ThemeProvider theme={theme}>
      {/* 左侧底部窗口控制按钮 */}
      <NoticeManager />
      <ServiceMigrationDialog />
      <SysproxyPrivilegeDialog />
      <div
        style={{
          animation: 'fadeIn 0.5s',
          WebkitAnimation: 'fadeIn 0.5s',
        }}
      />
      <style>
        {`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
          `}
      </style>
      <Paper
        square
        elevation={0}
        className={`${OS} layout`}
        onContextMenu={(e) => {
          if (
            OS === 'windows' &&
            !['input', 'textarea'].includes(
              e.currentTarget.tagName.toLowerCase(),
            ) &&
            !e.currentTarget.isContentEditable
          ) {
            e.preventDefault()
          }
        }}
        sx={[
          ({ palette }) => ({ bgcolor: palette.background.paper }),
          OS === 'linux'
            ? {
                borderRadius: '8px',
                width: '100vw',
                height: '100vh',
              }
            : {},
        ]}
      >
        <WindowResizeHandles />
        <CustomTitlebar />

        <div className="layout-content">
          <div className="layout-content__left">
            {menuUnlocked && (
              <Box
                sx={(theme) => ({
                  px: 1.5,
                  py: 0.75,
                  mx: 'auto',
                  mb: 1,
                  maxWidth: 250,
                  borderRadius: 1.5,
                  fontSize: 12,
                  fontWeight: 600,
                  textAlign: 'center',
                  color: theme.palette.warning.contrastText,
                  bgcolor:
                    theme.palette.mode === 'light'
                      ? theme.palette.warning.main
                      : theme.palette.warning.dark,
                })}
              >
                {t('layout.components.navigation.menu.reorderMode')}
              </Box>
            )}

            {menuUnlocked ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleMenuDragEnd}
              >
                <SortableContext
                  items={orderedPrimaryItems.map((item) => item.path)}
                >
                  <List
                    className="the-menu"
                    onContextMenu={handleMenuContextMenu}
                  >
                    {renderNavList(orderedPrimaryItems, true)}
                    <LayoutItem
                      to={settingsNavItem.path}
                      icon={settingsNavItem.icon}
                    >
                      {t(settingsNavItem.label)}
                    </LayoutItem>
                  </List>
                </SortableContext>
              </DndContext>
            ) : (
              <List className="the-menu" onContextMenu={handleMenuContextMenu}>
                {renderNavList(orderedPrimaryItems, false)}
                <LayoutItem
                  to={settingsNavItem.path}
                  icon={settingsNavItem.icon}
                >
                  {t(settingsNavItem.label)}
                </LayoutItem>
              </List>
            )}

            <Menu
              open={Boolean(menuContextPosition)}
              onClose={handleMenuContextClose}
              anchorReference="anchorPosition"
              anchorPosition={
                menuContextPosition
                  ? {
                      top: menuContextPosition.top,
                      left: menuContextPosition.left,
                    }
                  : undefined
              }
              transitionDuration={200}
              slotProps={{
                list: {
                  sx: { py: 0.5 },
                },
              }}
            >
              <MenuItem
                onClick={menuUnlocked ? handleLockMenu : handleUnlockMenu}
                dense
              >
                {menuUnlocked
                  ? t('layout.components.navigation.menu.lock')
                  : t('layout.components.navigation.menu.unlock')}
              </MenuItem>
              <MenuItem
                onClick={handleResetMenuOrder}
                dense
                disabled={isDefaultOrder}
              >
                {t('layout.components.navigation.menu.restoreDefaultOrder')}
              </MenuItem>
            </Menu>

            <div className="the-traffic">
              <LayoutTraffic />
            </div>
          </div>

          <div className="layout-content__right">
            <div className="the-bar"></div>
            <div className="the-content">
              <BaseErrorBoundary>
                <AutoSwitchRunnerHost />
                <Outlet />
              </BaseErrorBoundary>
            </div>
          </div>
        </div>
      </Paper>
    </ThemeProvider>
  )
}

export default Layout

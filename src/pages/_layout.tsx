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
import { ExpandLess, ExpandMore, MoreHorizOutlined } from '@mui/icons-material'
import {
  Box,
  Collapse,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  ThemeProvider,
  alpha,
} from '@mui/material'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import type { CSSProperties } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { MihomoWebSocket } from 'tauri-plugin-mihomo-api'

import { BaseErrorBoundary } from '@/components/base'
import { CustomTitlebar } from '@/components/layout/custom-titlebar'
import { LayoutItem } from '@/components/layout/layout-item'
import { LayoutTraffic } from '@/components/layout/layout-traffic'
import { NoticeManager } from '@/components/layout/notice-manager'
import { ServiceMigrationDialog } from '@/components/layout/service-migration-dialog'
import { WindowResizeHandles } from '@/components/layout/window-controller'
import { useI18n } from '@/hooks/use-i18n'
import { useVerge } from '@/hooks/use-verge'
import { useThemeMode } from '@/services/states'
import getSystem from '@/utils/get-system'

import {
  useCustomTheme,
  useLayoutEvents,
  useLoadingOverlay,
  useNavMenuOrder,
} from './_layout/hooks'
import { handleNoticeMessage } from './_layout/utils'
import {
  moreNavItems,
  navItems,
  primaryNavItems,
  settingsNavItem,
} from './_navigation'
import { moreNavPathSet } from './_navigation-meta'

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
  const navCollapsed = verge?.collapse_navbar ?? false
  const { switchLanguage } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
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
  const moreRouteActive = moreNavPathSet.has(location.pathname)
  const [moreExpanded, setMoreExpanded] = useState(moreRouteActive)
  const [prevMoreRouteActive, setPrevMoreRouteActive] =
    useState(moreRouteActive)

  // Expand "More" when navigating into a nested route; allow manual collapse after.
  if (moreRouteActive !== prevMoreRouteActive) {
    setPrevMoreRouteActive(moreRouteActive)
    if (moreRouteActive) {
      setMoreExpanded(true)
    }
  }

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

  // Persist a combined order: primary (reorderable) + more (stable relative) for compatibility.
  const { menuOrder, handleMenuDragEnd, isDefaultOrder, resetMenuOrder } =
    useNavMenuOrder({
      enabled: menuUnlocked,
      items: primaryNavItems,
      storedOrder: verge?.menu_order,
      onOptimisticUpdate: (primaryOrder) => {
        const moreOrder = (verge?.menu_order ?? []).filter((path) =>
          moreNavPathSet.has(path),
        )
        const missingMore = moreNavItems
          .map((item) => item.path)
          .filter((path) => !moreOrder.includes(path))
        handleMenuOrderOptimisticUpdate([
          ...primaryOrder,
          ...moreOrder,
          ...missingMore,
        ])
      },
      onPersist: async (primaryOrder) => {
        const moreOrder = (verge?.menu_order ?? []).filter((path) =>
          moreNavPathSet.has(path),
        )
        const missingMore = moreNavItems
          .map((item) => item.path)
          .filter((path) => !moreOrder.includes(path))
        await handleMenuOrderPersist([
          ...primaryOrder,
          ...moreOrder,
          ...missingMore,
        ])
      },
    })

  const orderedPrimaryItems = useMemo(
    () => filterOrderedItems(menuOrder, primaryNavItems),
    [menuOrder],
  )

  const orderedMoreItems = useMemo(
    () => filterOrderedItems(verge?.menu_order ?? [], moreNavItems),
    [verge?.menu_order],
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

  const handleToggleNavCollapsed = useCallback(() => {
    setMenuContextPosition(null)
    void patchVerge({ collapse_navbar: !navCollapsed })
  }, [navCollapsed, patchVerge])

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

  useEffect(() => {
    if (language) {
      dayjs.locale(language === 'zh' ? 'zh-cn' : language)
      switchLanguage(language)
    }
  }, [language, switchLanguage])

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

  const moreToggle = (
    <ListItem sx={{ py: 0.5, maxWidth: 250, mx: 'auto', padding: '4px 0px' }}>
      <ListItemButton
        selected={moreRouteActive && !moreExpanded}
        onClick={() => setMoreExpanded((open) => !open)}
        sx={[
          {
            borderRadius: 2,
            marginLeft: 1.25,
            paddingLeft: 1,
            paddingRight: 1,
            marginRight: 1.25,
            '& .MuiListItemText-primary': {
              color: 'text.primary',
              fontWeight: 600,
            },
          },
          ({ palette: { mode: paletteMode, primary } }) => {
            const selectedBg = alpha(
              primary.main,
              paletteMode === 'light' ? 0.1 : 0.14,
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
            }
          },
        ]}
        title={
          navCollapsed ? t('layout.components.navigation.tabs.more') : undefined
        }
        aria-label={t('layout.components.navigation.tabs.more')}
        aria-expanded={moreExpanded}
      >
        <ListItemIcon
          sx={{
            color: moreRouteActive ? 'primary.main' : 'text.secondary',
            marginLeft: '6px',
          }}
        >
          <MoreHorizOutlined />
        </ListItemIcon>
        <ListItemText
          sx={{ textAlign: 'center', marginLeft: '-35px' }}
          primary={t('layout.components.navigation.tabs.more')}
        />
        {moreExpanded ? (
          <ExpandLess fontSize="small" sx={{ color: 'text.secondary' }} />
        ) : (
          <ExpandMore fontSize="small" sx={{ color: 'text.secondary' }} />
        )}
      </ListItemButton>
    </ListItem>
  )

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
      <NoticeManager position={verge?.notice_position} />
      <ServiceMigrationDialog />
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
        className={`${OS} layout${navCollapsed ? ' layout--nav-collapsed' : ''}`}
        style={{
          borderTopLeftRadius: '0px',
          borderTopRightRadius: '0px',
        }}
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
                    {moreToggle}
                    <Collapse in={moreExpanded} timeout="auto" unmountOnExit>
                      <List disablePadding sx={{ pl: navCollapsed ? 0 : 1 }}>
                        {renderNavList(orderedMoreItems, false)}
                      </List>
                    </Collapse>
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
                {moreToggle}
                <Collapse in={moreExpanded} timeout="auto" unmountOnExit>
                  <List disablePadding sx={{ pl: navCollapsed ? 0 : 1 }}>
                    {renderNavList(orderedMoreItems, false)}
                  </List>
                </Collapse>
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
              <MenuItem onClick={handleToggleNavCollapsed} dense>
                {navCollapsed
                  ? t('layout.components.navigation.menu.expandNavBar')
                  : t('layout.components.navigation.menu.collapseNavBar')}
              </MenuItem>
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

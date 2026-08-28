import {
  closestCenter,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  KeyboardSensor,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  type SortingStrategy,
} from '@dnd-kit/sortable'
import {
  ClearRounded,
  ContentPasteRounded,
  RefreshRounded,
} from '@mui/icons-material'
import { Box, Button, Grid, IconButton } from '@mui/material'
import { TauriEvent } from '@tauri-apps/api/event'
import { readText } from '@tauri-apps/plugin-clipboard-manager'
import { readTextFile } from '@tauri-apps/plugin-fs'
import { useLockFn } from 'ahooks'
import { throttle } from 'lodash-es'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
import { closeAllConnections } from 'tauri-plugin-mihomo-api'

import {
  ProfileViewer,
  type ProfileViewerRef,
} from '@/components/profile/profile-viewer'
import { SortableProfileItem } from '@/components/profile/sortable-profile-item'
import { AppDialog, AppPage, AppTextField } from '@/components/ui'
import { useListen } from '@/hooks/use-listen'
import { useProfiles } from '@/hooks/use-profiles'
import {
  createProfile,
  deleteProfile,
  enhanceProfiles,
  getProfiles,
  //restartCore,
  importProfile,
  reorderProfile,
  updateProfile,
} from '@/services/cmds'
import { subscribeVergeEvents } from '@/services/events'
import { errorDetail, showNotice } from '@/services/notice-service'
import { fetchCacheData, revalidateQueries } from '@/services/query-client'
import { useLoadingCache, useSetLoadingCache } from '@/services/states'
import { debugLog } from '@/utils/debug'

// 与 src-tauri/src/main.rs 的 worker_limit 上限(8)保持一致，避免前后端更新风暴不对齐
const PROFILE_UPDATE_WORKER_LIMIT = 8
const PROFILE_SWITCH_LOADING_DELAY = 400

const profileCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args)
  return pointerCollisions.length > 0 ? pointerCollisions : closestCenter(args)
}

// Equivalent to rectSortingStrategy without copying the full rect array for every item.
const profileRectSortingStrategy: SortingStrategy = ({
  rects,
  activeIndex,
  overIndex,
  index,
}) => {
  let newIndex = index

  if (index === activeIndex) {
    newIndex = overIndex
  } else if (
    activeIndex < overIndex &&
    index > activeIndex &&
    index <= overIndex
  ) {
    newIndex = index - 1
  } else if (
    activeIndex > overIndex &&
    index >= overIndex &&
    index < activeIndex
  ) {
    newIndex = index + 1
  }

  const oldRect = rects[index]
  const newRect = rects[newIndex]
  if (!oldRect || !newRect) return null

  return {
    x: newRect.left - oldRect.left,
    y: newRect.top - oldRect.top,
    scaleX: newRect.width / oldRect.width,
    scaleY: newRect.height / oldRect.height,
  }
}

interface ProfileSwitchRequest {
  profile: string
  notifySuccess: boolean
  force: boolean
}

// 记录profile切换状态
const debugProfileSwitch = (action: string, profile: string, extra?: any) => {
  const timestamp = new Date().toISOString().substring(11, 23)
  debugLog(`[Profile-Debug][${timestamp}] ${action}: ${profile}`, extra || '')
}

const ProfilePage = () => {
  const { t } = useTranslation()
  const location = useLocation()
  const { addListener } = useListen()
  const [url, setUrl] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [activatings, setActivatings] = useState<string[]>([])
  const [switchTarget, setSwitchTarget] = useState<string | null>(null)
  const [visibleSwitchingProfile, setVisibleSwitchingProfile] = useState<
    string | null
  >(null)
  const [loading, setLoading] = useState(false)
  const [timerUpdateRevisions, setTimerUpdateRevisions] = useState<
    Map<string, number>
  >(() => new Map())
  const [completedUpdateRevisions, setCompletedUpdateRevisions] = useState<
    Map<string, number>
  >(() => new Map())

  // Profile 切换在前端串行执行；队列中只保留用户最后一次选择。
  const latestSwitchTargetRef = useRef<string | null>(null)
  const queuedSwitchRef = useRef<ProfileSwitchRequest | null>(null)
  const switchRunnerRef = useRef<Promise<void> | null>(null)
  const switchLoadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const currentProfileRef = useRef<string | undefined>(undefined)
  const profilePageMountedRef = useRef(true)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )
  const { current } = location.state || {}

  const {
    profiles = {},
    patchProfiles,
    mutateProfiles,
    error,
    isStale,
  } = useProfiles()

  useEffect(() => {
    currentProfileRef.current = profiles.current
  }, [profiles])

  useEffect(() => {
    const handleFileDrop = async () => {
      const unlisten = await addListener(
        TauriEvent.DRAG_DROP,
        async (event: any) => {
          const paths = event.payload.paths

          for (const file of paths) {
            if (!file.endsWith('.yaml') && !file.endsWith('.yml')) {
              showNotice.error('profiles.page.feedback.errors.onlyYaml')
              continue
            }
            const item = {
              type: 'local',
              name: file.split(/\/|\\/).pop() ?? 'New Profile',
              desc: '',
              url: '',
              option: {
                with_proxy: false,
                self_proxy: false,
              },
            } as IProfileItem
            const data = await readTextFile(file)
            await createProfile(item, data)
            await mutateProfiles()
          }
          await enhanceProfiles()
        },
      )

      return unlisten
    }

    const unsubscribe = handleFileDrop()

    return () => {
      unsubscribe.then((cleanup) => cleanup())
    }
  }, [addListener, mutateProfiles])

  // 添加紧急恢复功能
  const onEmergencyRefresh = useLockFn(async () => {
    debugLog('[紧急刷新] 开始强制刷新所有数据')

    try {
      // 只失效 profiles 相关 query，不影响 WS 订阅、IP 缓存等其他 query
      await revalidateQueries([['getProfiles']])

      // 强制重新获取配置数据
      await mutateProfiles()

      // 等待状态稳定后增强配置
      await new Promise((resolve) => setTimeout(resolve, 500))
      await onEnhance()

      showNotice.success(
        'profiles.page.feedback.notices.forceRefreshCompleted',
        2000,
      )
    } catch (error) {
      console.error('[紧急刷新] 失败:', error)
      showNotice.error(
        'profiles.page.feedback.notices.emergencyRefreshFailed',
        { message: errorDetail(error) },
        4000,
      )
    }
  })

  const viewerRef = useRef<ProfileViewerRef>(null)

  // distinguish type
  const profileItems = useMemo(() => {
    const items = profiles.items || []

    const type1 = ['local', 'remote']

    return items.filter((i) => i && type1.includes(i.type!))
  }, [profiles])

  const currentActivatings = () => {
    return [...new Set([profiles.current ?? ''])].filter(Boolean)
  }

  const onImport = async () => {
    if (!url) return
    // 校验url是否为http/https
    if (!/^https?:\/\//i.test(url)) {
      showNotice.error('profiles.page.feedback.errors.invalidUrl')
      return
    }
    setLoading(true)

    const handleImportSuccess = async (noticeKey: string) => {
      showNotice.success(noticeKey)
      setUrl('')
      setImportOpen(false)
      await performRobustRefresh()
    }
    try {
      // 尝试正常导入
      await importProfile(url)
      await handleImportSuccess('shared.feedback.notifications.importSuccess')
    } catch (initialErr) {
      console.warn('[订阅导入] 首次导入失败:', initialErr)

      const initialDetail = errorDetail(initialErr)
      if (initialDetail.toLowerCase().includes('legacy tls')) {
        showNotice.error(initialErr)
        return
      }

      showNotice.info('profiles.page.feedback.notifications.importRetry')
      try {
        // 使用自身代理尝试导入
        await importProfile(url, {
          with_proxy: false,
          self_proxy: true,
        })
        await handleImportSuccess(
          'shared.feedback.notifications.importWithClashProxy',
        )
      } catch (retryErr) {
        // 回退导入也失败
        showNotice.error(
          'profiles.page.feedback.notifications.importFail',
          retryErr,
        )
      }
    } finally {
      setLoading(false)
    }
  }

  // 强化的刷新策略
  // maxRetries 设为 1：useProfiles 内部 useQuery 已配置 retry:3，业务层只需 1 次额外重试
  const performRobustRefresh = async () => {
    let retryCount = 0
    const maxRetries = 1
    const baseDelay = 200

    while (retryCount < maxRetries) {
      try {
        debugLog(`[导入刷新] 第${retryCount + 1}次尝试刷新配置数据`)

        // 强制刷新，绕过所有缓存
        await mutateProfiles()

        // 等待状态稳定
        await new Promise((resolve) =>
          setTimeout(resolve, baseDelay * (retryCount + 1)),
        )

        await onEnhance()
        return
      } catch (error) {
        console.error(`[导入刷新] 第${retryCount + 1}次刷新失败:`, error)
        retryCount++
        await new Promise((resolve) =>
          setTimeout(resolve, baseDelay * retryCount),
        )
      }
    }

    // 所有重试失败后的最后尝试
    console.warn(`[导入刷新] 常规刷新失败，尝试清除缓存重新获取`)
    try {
      // 清除缓存并重新获取
      await fetchCacheData(['getProfiles'], getProfiles)
      await onEnhance()
      showNotice.error(
        'profiles.page.feedback.notifications.importNeedsRefresh',
        3000,
      )
    } catch (finalError) {
      console.error(`[导入刷新] 最终刷新尝试失败:`, finalError)
      showNotice.error(
        'profiles.page.feedback.notifications.importSuccess',
        5000,
      )
    }
  }

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (over) {
      if (active.id !== over.id) {
        await reorderProfile(active.id.toString(), over.id.toString())
        mutateProfiles()
      }
    }
  }

  const executeProfileSwitch = useCallback(
    async ({ profile, notifySuccess, force }: ProfileSwitchRequest) => {
      if (!force && currentProfileRef.current === profile) {
        debugProfileSwitch('ALREADY_CURRENT_IGNORED', profile)
        return
      }

      debugProfileSwitch('SWITCH_START', profile)

      try {
        const outcome = await patchProfiles({ current: profile })
        if (outcome.status === 'busy') {
          debugProfileSwitch('SWITCH_BUSY', profile)
          showNotice.info(
            'profiles.page.feedback.notifications.switchBusy',
            2000,
          )
          return
        }

        if (outcome.status === 'valid') {
          currentProfileRef.current = profile
          void closeAllConnections().catch(() => {})

          if (
            notifySuccess &&
            latestSwitchTargetRef.current === profile &&
            queuedSwitchRef.current === null
          ) {
            showNotice.success(
              'profiles.page.feedback.notifications.profileSwitched',
              1000,
            )
          }
          debugProfileSwitch('SWITCH_SUCCESS', profile)
        } else {
          debugProfileSwitch('SWITCH_REJECTED', profile, outcome)
        }
      } catch (err: any) {
        console.error(`[Profile] 切换失败:`, err)
        showNotice.error(err, 4000)
      } finally {
        debugProfileSwitch('SWITCH_END', profile)
      }
    },
    [patchProfiles],
  )

  const runProfileSwitchQueue = useCallback(async () => {
    while (profilePageMountedRef.current && queuedSwitchRef.current) {
      const request = queuedSwitchRef.current
      queuedSwitchRef.current = null
      await executeProfileSwitch(request)
    }
  }, [executeProfileSwitch])

  const activateProfile = useCallback(
    (profile: string, notifySuccess: boolean, force = false) => {
      if (!profilePageMountedRef.current) return Promise.resolve()

      if (
        !force &&
        currentProfileRef.current === profile &&
        switchRunnerRef.current === null
      ) {
        debugProfileSwitch('ALREADY_CURRENT_IGNORED', profile)
        return Promise.resolve()
      }

      if (
        latestSwitchTargetRef.current === profile &&
        switchRunnerRef.current
      ) {
        debugProfileSwitch('DUPLICATE_SWITCH_IGNORED', profile)
        return switchRunnerRef.current
      }

      latestSwitchTargetRef.current = profile
      queuedSwitchRef.current = { profile, notifySuccess, force }
      setSwitchTarget(profile)
      setVisibleSwitchingProfile(null)
      if (switchLoadingTimerRef.current) {
        window.clearTimeout(switchLoadingTimerRef.current)
      }
      switchLoadingTimerRef.current = window.setTimeout(() => {
        if (
          profilePageMountedRef.current &&
          latestSwitchTargetRef.current === profile
        ) {
          setVisibleSwitchingProfile(profile)
        }
      }, PROFILE_SWITCH_LOADING_DELAY)

      if (switchRunnerRef.current) {
        debugProfileSwitch('SWITCH_QUEUED', profile)
        return switchRunnerRef.current
      }

      const runner = runProfileSwitchQueue().finally(() => {
        if (switchRunnerRef.current === runner) {
          switchRunnerRef.current = null
          latestSwitchTargetRef.current = null
          if (switchLoadingTimerRef.current) {
            window.clearTimeout(switchLoadingTimerRef.current)
            switchLoadingTimerRef.current = null
          }
          if (profilePageMountedRef.current) {
            setSwitchTarget(null)
            setVisibleSwitchingProfile(null)
          }
        }
      })
      switchRunnerRef.current = runner
      return runner
    },
    [runProfileSwitchQueue],
  )

  const onSelect = async (profile: string, force: boolean) => {
    await activateProfile(profile, true, force)
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (current) {
        await mutateProfiles()
        if (cancelled) return
        await activateProfile(current, false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [current, activateProfile, mutateProfiles])

  const onEnhance = useLockFn(async () => {
    if (switchRunnerRef.current) {
      debugLog(
        `[Profile] 有profile正在切换中(${latestSwitchTargetRef.current})，跳过enhance操作`,
      )
      return
    }

    const currentProfiles = currentActivatings()
    setActivatings((prev) => [...new Set([...prev, ...currentProfiles])])

    try {
      if (!(await enhanceProfiles())) return
    } catch (err: any) {
      showNotice.error(err, 3000)
    } finally {
      setActivatings([])
    }
  })

  const onDelete = useLockFn(async (uid: string) => {
    const current = profiles.current === uid
    try {
      setActivatings([...(current ? currentActivatings() : []), uid])
      await deleteProfile(uid)
      mutateProfiles()
      if (current) {
        await onEnhance()
      }
    } catch (err: any) {
      showNotice.error(err)
    } finally {
      setActivatings([])
    }
  })

  // 更新所有订阅
  const loadingCache = useLoadingCache()
  const setLoadingCache = useSetLoadingCache()
  const setLoadingProfiles = useCallback(
    (uids: string[], loading: boolean) => {
      setLoadingCache((cache) => {
        const next = new Set(cache)
        for (const uid of uids) {
          if (loading) {
            next.add(uid)
          } else {
            next.delete(uid)
          }
        }
        return next
      })
    },
    [setLoadingCache],
  )

  useEffect(
    () =>
      subscribeVergeEvents({
        'profile-update-started': ({ uid }) => {
          if (uid) setLoadingProfiles([uid], true)
        },
        'profile-update-completed': ({ uid }) => {
          if (!uid) return
          setLoadingProfiles([uid], false)
          setCompletedUpdateRevisions((current) => {
            const next = new Map(current)
            next.set(uid, (next.get(uid) ?? 0) + 1)
            return next
          })
          void mutateProfiles()
        },
        'verge://timer-updated': (uid) => {
          setTimerUpdateRevisions((current) => {
            const next = new Map(current)
            next.set(uid, (next.get(uid) ?? 0) + 1)
            return next
          })
        },
      }),
    [mutateProfiles, setLoadingProfiles],
  )

  const runProfileUpdates = useCallback(
    async (uids: string[]) => {
      if (uids.length === 0) return

      const throttleMutate = throttle(mutateProfiles, 2000, {
        trailing: true,
      })
      let cursor = 0

      const updateOne = async (uid: string) => {
        try {
          await updateProfile(uid)
          throttleMutate()
        } catch (err: any) {
          console.error(`更新订阅 ${uid} 失败:`, err)
        }
      }

      const worker = async () => {
        while (cursor < uids.length) {
          const uid = uids[cursor++]
          await updateOne(uid)
        }
      }

      try {
        const active = Math.min(PROFILE_UPDATE_WORKER_LIMIT, uids.length)
        await Promise.allSettled(Array.from({ length: active }, worker))
      } finally {
        setLoadingProfiles(uids, false)
        // 避免长时间批量更新后列表数据过晚刷新
        void mutateProfiles()
      }
    },
    [mutateProfiles, setLoadingProfiles],
  )
  const onUpdateAll = useLockFn(async () => {
    const items = profileItems.filter((e) => e.type === 'remote')
    const target = items
      .map((item) => item.uid)
      .filter((uid) => !loadingCache.has(uid))

    setLoadingProfiles(target, true)
    await runProfileUpdates(target)
  })

  const onCopyLink = async () => {
    const text = await readText()
    if (text) setUrl(text)
  }

  const openImportDialog = useCallback(async () => {
    setImportOpen(true)
    if (url) return
    try {
      const text = (await readText())?.trim()
      if (text && /^https?:\/\//i.test(text)) {
        setUrl(text)
      }
    } catch {
      /* ignore clipboard errors */
    }
  }, [url])

  const closeImportDialog = useCallback(() => {
    if (loading) return
    setImportOpen(false)
  }, [loading])

  // 卸载后不再执行尚未发送的切换意图。
  useEffect(() => {
    profilePageMountedRef.current = true
    return () => {
      profilePageMountedRef.current = false
      queuedSwitchRef.current = null
      latestSwitchTargetRef.current = null
      if (switchLoadingTimerRef.current) {
        window.clearTimeout(switchLoadingTimerRef.current)
        switchLoadingTimerRef.current = null
      }
    }
  }, [])

  return (
    <AppPage
      full
      title={t('profiles.page.title')}
      contentStyle={{ height: '100%' }}
      header={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button
            size="small"
            color="inherit"
            onClick={() => void openImportDialog()}
            sx={{ textTransform: 'none', minWidth: 0, px: 1 }}
          >
            {t('profiles.page.actions.import')}
          </Button>
          <Button
            size="small"
            color="inherit"
            onClick={() => viewerRef.current?.create()}
            sx={{ textTransform: 'none', minWidth: 0, px: 1 }}
          >
            {t('shared.actions.new')}
          </Button>

          <IconButton
            size="small"
            color="inherit"
            title={t('profiles.page.actions.updateAll')}
            onClick={onUpdateAll}
          >
            <RefreshRounded />
          </IconButton>

          {(error || isStale) && (
            <IconButton
              size="small"
              color="warning"
              title={t('profiles.page.feedback.tooltips.forceRefreshStaleData')}
              onClick={onEmergencyRefresh}
              sx={{
                animation: 'pulse 2s infinite',
                '@keyframes pulse': {
                  '0%': { opacity: 1 },
                  '50%': { opacity: 0.5 },
                  '100%': { opacity: 1 },
                },
              }}
            >
              <ClearRounded />
            </IconButton>
          )}
        </Box>
      }
    >
      <DndContext
        sensors={sensors}
        collisionDetection={profileCollisionDetection}
        onDragEnd={onDragEnd}
      >
        <Box
          sx={{
            pl: '10px',
            pr: '10px',
            pt: 1.5,
            height: '100%',
            overflowY: 'auto',
          }}
        >
          <Box sx={{ mb: 1.5 }}>
            <Grid container spacing={{ xs: 1, lg: 1 }}>
              <SortableContext
                strategy={profileRectSortingStrategy}
                items={profileItems.map((x) => {
                  return x.uid
                })}
              >
                {profileItems.map((item) => (
                  <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={item.file}>
                    <SortableProfileItem
                      id={item.uid}
                      selected={(switchTarget ?? profiles.current) === item.uid}
                      activating={
                        activatings.includes(item.uid) ||
                        visibleSwitchingProfile === item.uid
                      }
                      itemData={item}
                      timerUpdateRevision={
                        timerUpdateRevisions.get(item.uid) ?? 0
                      }
                      completedUpdateRevision={
                        completedUpdateRevisions.get(item.uid) ?? 0
                      }
                      mutateProfiles={mutateProfiles}
                      onSelect={(f) => onSelect(item.uid, f)}
                      onEdit={() => viewerRef.current?.edit(item)}
                      onDelete={() => onDelete(item.uid)}
                    />
                  </Grid>
                ))}
              </SortableContext>
            </Grid>
          </Box>
        </Box>
        <DragOverlay />
      </DndContext>

      <ProfileViewer
        ref={viewerRef}
        onChange={async (isActivating) => {
          mutateProfiles()
          // 只有更改当前激活的配置时才触发全局重新加载
          if (isActivating) {
            await onEnhance()
          }
        }}
      />
      <AppDialog
        open={importOpen}
        title={t('profiles.page.actions.import')}
        contentSx={{ width: 420, maxWidth: '100%', pt: 1 }}
        okBtn={t('profiles.page.actions.import')}
        cancelBtn={t('shared.actions.cancel')}
        disableOk={!url || loading}
        loading={loading}
        onOk={() => void onImport()}
        onCancel={closeImportDialog}
        onClose={closeImportDialog}
      >
        <AppTextField
          autoFocus
          value={url}
          variant="outlined"
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) {
              return
            }
            if (!url || loading) {
              return
            }
            event.preventDefault()
            void onImport()
          }}
          placeholder={t('profiles.page.importForm.placeholder')}
          slotProps={{
            input: {
              sx: { pr: 1 },
              endAdornment: !url ? (
                <IconButton
                  size="small"
                  sx={{ p: 0.5 }}
                  title={t('profiles.page.importForm.actions.paste')}
                  onClick={() => void onCopyLink()}
                >
                  <ContentPasteRounded fontSize="inherit" />
                </IconButton>
              ) : (
                <IconButton
                  size="small"
                  sx={{ p: 0.5 }}
                  title={t('shared.actions.clear')}
                  onClick={() => setUrl('')}
                  disabled={loading}
                >
                  <ClearRounded fontSize="inherit" />
                </IconButton>
              ),
            },
          }}
        />
      </AppDialog>
    </AppPage>
  )
}

export default ProfilePage

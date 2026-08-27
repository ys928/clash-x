import { useLockFn } from 'ahooks'
import { throttle } from 'lodash-es'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'

import {
  BaseEmpty,
  BaseLoading,
  StickyVirtualList,
  type StickyVirtualListHandle,
} from '@/components/base'
import { useProfiles } from '@/hooks/use-profiles'
import { useProxySelection } from '@/hooks/use-proxy-selection'
import { useVerge } from '@/hooks/use-verge'
import { useProxiesData, useSystemData } from '@/providers/app-data-context'
import delayManager from '@/services/delay'
import {
  isInteractableMember,
  resolveMember,
  type ProxyGroupView,
  type ResolvedProxyMember,
} from '@/types/proxy-view'
import { debugLog } from '@/utils/debug'

import { ProxyEmptyState } from './proxy-empty-state'
import {
  resolveEmptyListReason,
  resolveProxyListState,
} from './proxy-empty-state-model'
import { ProxyGroupNavigator } from './proxy-group-navigator'
import { ProxyRender } from './proxy-render'
import {
  hasRenderableItems,
  type IRenderItem,
  useRenderList,
} from './use-render-list'

function useStableCallback<T extends (...args: any[]) => any>(fn: T): T {
  const ref = useRef(fn)
  ref.current = fn
  return useCallback((...args: Parameters<T>) => ref.current(...args), []) as T
}

interface Props {
  mode: string
}

/**
 * The empty state to draw when the render list turns out to contain nothing.
 *
 * Shared by both list components so the observation and its explanation stay together.
 */
function useEmptyRenderList() {
  const { isProxyViewError } = useProxiesData()
  const { runningMode } = useSystemData()

  return (
    <ProxyEmptyState
      reason={resolveEmptyListReason({ runningMode, isProxyViewError })}
    />
  )
}

function useProxyRenderState(mode: string) {
  const { verge } = useVerge()
  const { proxyView } = useProxiesData()
  const { renderList, onProxies, onHeadState } = useRenderList(mode)
  const scrollPositionKey = mode

  const timeout = verge?.default_latency_timeout || 10000

  // 测全部延迟
  const handleCheckAll = useStableCallback(
    useLockFn(async (groupName: string) => {
      debugLog(`[ProxyGroups] 开始测试所有延迟，组: ${groupName}`)

      const group =
        proxyView?.groups.find(({ name }) => name === groupName) ??
        (proxyView?.global?.name === groupName ? proxyView.global : undefined)
      const occurrences =
        proxyView && group
          ? group.members.map((member, memberIndex) => ({
              memberIndex,
              member: resolveMember(proxyView, member),
            }))
          : []
      const interactable = occurrences
        .map(({ member }) => member)
        .filter(isInteractableMember)

      debugLog(`[ProxyGroups] 找到代理数量: ${interactable.length}`)

      const url = delayManager.getUrl(groupName)
      debugLog(`[ProxyGroups] 测试URL: ${url}, 超时: ${timeout}ms`)

      try {
        await delayManager.checkListDelay(interactable, groupName, timeout)
        debugLog(`[ProxyGroups] 延迟测试完成，组: ${groupName}`)
      } catch (error) {
        console.error(`[ProxyGroups] 延迟测试出错，组: ${groupName}`, error)
      } finally {
        // Re-sorting is no longer poked from here: the delay store announces that the test
        // settled and the render list recomputes from that.
        onProxies()
      }
    }),
  )

  const saveScrollPosition = useCallback(
    (scrollTop: number) => {
      const scrollPositions = localStorage.getItem('proxy-scroll-positions')
        ? JSON.parse(localStorage.getItem('proxy-scroll-positions') ?? '{}')
        : {}
      scrollPositions[scrollPositionKey] = scrollTop
      try {
        localStorage.setItem(
          'proxy-scroll-positions',
          JSON.stringify(scrollPositions),
        )
      } catch (e) {
        console.error('Error saving scroll position:', e)
      }
    },
    [scrollPositionKey],
  )

  const getScrollPosition = useCallback(() => {
    try {
      const savedPositions = localStorage.getItem('proxy-scroll-positions')
      if (savedPositions) {
        const positions = JSON.parse(savedPositions)
        const savedPosition = positions[scrollPositionKey]
        return savedPosition ?? 0
      }
    } catch (e) {
      console.error('Error restoring scroll position:', e)
    }
  }, [scrollPositionKey])

  return {
    renderList,
    onProxies,
    onHeadState,
    handleCheckAll,
    saveScrollPosition,
    getScrollPosition,
  }
}

function NormalProxyGroups(props: { mode: string }) {
  const { mode } = props
  const stickyListRef = useRef<StickyVirtualListHandle>(null)
  const isRuleMode = mode === 'rule' || mode === 'script'

  const {
    renderList,
    onProxies,
    onHeadState,
    handleCheckAll,
    getScrollPosition,
    saveScrollPosition,
  } = useProxyRenderState(mode)
  const emptyList = useEmptyRenderList()
  const renderFirstRef = useRef(true)
  // 恢复滚动位置期间设为 true，避免程序化滚动触发的 scroll 事件把中间值写回存储
  const isRestoringRef = useRef(false)

  // 目前无法使用 StickyVirtualList 的 initialOffset 值设置初始化，具体原因需排查
  // 从 localStorage 恢复滚动位置
  useLayoutEffect(() => {
    if (renderList.length === 0) return
    if (!renderFirstRef.current) return
    const node = stickyListRef.current?.getScrollElement()
    if (!node) return

    const savedPosition = getScrollPosition()
    // 未保存过位置或位置为 0（顶部）时无需恢复
    if (!savedPosition) {
      renderFirstRef.current = false
      return
    }

    // 虚拟列表初始使用预估高度，真实高度测量完成后总高度才会稳定。
    // 尤其是过滤后节点数变少时，预估总高度常常不足以一次性滚动到目标位置，
    // 因此跨帧重试，直到到达目标位置（或内容确实不够高）为止。
    isRestoringRef.current = true
    let rafId = 0
    let attempts = 0
    const maxAttempts = 30

    const step = () => {
      const el = stickyListRef.current?.getScrollElement()
      if (!el) {
        isRestoringRef.current = false
        return
      }

      el.scrollTop = savedPosition
      attempts += 1

      const reached = Math.abs(el.scrollTop - savedPosition) <= 1
      if (reached || attempts >= maxAttempts) {
        renderFirstRef.current = false
        isRestoringRef.current = false
        return
      }

      rafId = requestAnimationFrame(step)
    }

    rafId = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(rafId)
      isRestoringRef.current = false
    }
  }, [renderList.length, getScrollPosition])

  const saveScrollPositionThrottled = useMemo(
    () => throttle(saveScrollPosition, 500),
    [saveScrollPosition],
  )

  const handleScroll = useCallback(
    (event: Event) => {
      // 恢复位置过程中产生的滚动不写回存储，避免中间的钳制值覆盖真实位置
      if (isRestoringRef.current) return
      const target = event.target as HTMLElement | null
      const nextScrollTop = target?.scrollTop ?? 0

      saveScrollPositionThrottled(nextScrollTop)
    },
    [saveScrollPositionThrottled],
  )

  useEffect(() => {
    const node = stickyListRef.current?.getScrollElement()
    if (!node) return

    const listener = handleScroll as EventListener
    const options: AddEventListenerOptions = { passive: true }

    node.addEventListener('scroll', listener, options)

    return () => {
      node.removeEventListener('scroll', listener, options)
    }
  }, [handleScroll])

  const { handleProxyGroupChange } = useProxySelection({
    onSuccess: () => {
      onProxies()
    },
    onError: (error) => {
      console.error('代理切换失败', error)
      onProxies()
    },
  })

  const handleChangeProxy = useCallback(
    (group: ProxyGroupView, member: ResolvedProxyMember) => {
      if (!['Selector', 'URLTest', 'Fallback'].includes(group.type)) return
      if (!isInteractableMember(member)) return

      handleProxyGroupChange(group, { name: member.ref.name })
    },
    [handleProxyGroupChange],
  )

  // 滚到对应的节点
  const handleLocation = useStableCallback((group: ProxyGroupView) => {
    if (!group) return
    const { name, now } = group

    const index = renderList.findIndex(
      (e) =>
        e.group?.name === name &&
        ((e.type === 2 && e.member?.member.ref.name === now) ||
          (e.type === 4 &&
            e.memberCol?.some(({ member }) => member.ref.name === now))),
    )

    if (index >= 0) {
      stickyListRef.current?.scrollToIndex(index, {
        align: 'center',
        behavior: 'smooth',
      })
    }
  })

  // 定位到指定的代理组
  const handleGroupLocationByName = useCallback(
    (groupName: string) => {
      const index = renderList.findIndex(
        (item) => item.type === 0 && item.group?.name === groupName,
      )

      if (index >= 0) {
        stickyListRef.current?.scrollToIndex(index, {
          align: 'start',
          behavior: 'smooth',
        })
      }
    },
    [renderList],
  )

  const proxyGroupNames = useMemo(() => {
    const names = renderList
      .filter((item) => item.type === 0 && item.group?.name)
      .map((item) => item.group!.name)
    return Array.from(new Set(names))
  }, [renderList])

  // 点击代理组改变展开状态，先滚动到sticky的代理组位置，再收起展开状态
  const handleGroupToggle = useCallback(
    async (group: ProxyGroupView) => {
      const index = renderList.findIndex(
        (item) => item.type === 0 && item.group.name === group.name,
      )
      if (index < 0) return

      if (!stickyListRef.current?.isItemScrolledPastStart(index, 1)) return

      stickyListRef.current.scrollToIndex(index, {
        align: 'start',
        behavior: 'auto',
      })

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      })
    },
    [renderList],
  )

  const renderGroupItem = useCallback(
    (item: IRenderItem, _index: number, stickyed: boolean) => (
      <ProxyRender
        item={item}
        stickyed={stickyed}
        onLocation={handleLocation}
        onCheckAll={handleCheckAll}
        onHeadState={async (groupName, patch) => {
          if (stickyed && patch.filterText !== undefined) {
            handleGroupLocationByName(groupName)
            await stickyListRef.current?.waitForScrollEnd()
          }
          onHeadState(groupName, patch)
        }}
        onChangeProxy={handleChangeProxy}
        onGroupToggle={handleGroupToggle}
      />
    ),
    [
      handleChangeProxy,
      handleCheckAll,
      onHeadState,
      handleLocation,
      handleGroupToggle,
      handleGroupLocationByName,
    ],
  )

  const renderProxyItem = useCallback(
    (item: IRenderItem) => (
      <ProxyRender
        key={item.key}
        item={item}
        onLocation={handleLocation}
        onCheckAll={handleCheckAll}
        onHeadState={onHeadState}
        onChangeProxy={handleChangeProxy}
      />
    ),
    [handleChangeProxy, handleCheckAll, onHeadState, handleLocation],
  )

  // The list is built; whether it holds anything is now an observation, not a guess.
  if (!hasRenderableItems(renderList)) return emptyList

  return (
    <div
      style={{
        position: 'relative',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
        }}
      >
        <StickyVirtualList
          ref={stickyListRef}
          items={renderList}
          isGroupItem={(item) => item.type === 0}
          getItemKey={(item) => item.key}
          estimateGroupItemHeight={80}
          estimateItemHeight={68}
          renderGroupItem={renderGroupItem}
          renderItem={renderProxyItem}
        />

        {isRuleMode && (
          <ProxyGroupNavigator
            proxyGroupNames={proxyGroupNames}
            onGroupLocation={handleGroupLocationByName}
          />
        )}
      </div>
    </div>
  )
}

export const ProxyGroups = (props: Props) => {
  const { mode } = props
  const { profiles, isLoading: isProfilesLoading } = useProfiles()
  const { isProxyViewPending } = useProxiesData()
  const { isRunningModePending } = useSystemData()

  const listState = resolveProxyListState({
    mode,
    profiles,
    isProfilesPending: !profiles && isProfilesLoading,
    isProxyViewPending,
    isRunningModePending,
  })

  switch (listState.kind) {
    case 'direct':
      return <BaseEmpty textKey="proxies.page.messages.directMode" />
    case 'loading':
      return <BaseLoading />
    case 'empty':
      return <ProxyEmptyState reason={listState.reason} />
    case 'render':
      return <NormalProxyGroups mode={mode} />
  }
}

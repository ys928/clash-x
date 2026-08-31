<script setup lang="ts">
import {
  Aim,
  Connection,
  MoreFilled,
  Refresh,
  Sort,
  Switch,
  View,
  Hide,
} from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  watch,
} from 'vue'
import {
  closeConnection,
  getConnections,
  selectNodeForGroup,
  unfixedProxy,
  updateProxyProvider,
} from 'tauri-plugin-mihomo-api'

import {
  filterSort,
  type ProxySortType,
} from '@/components/proxy/use-filter-sort'
import {
  resolveEmptyListReason,
  resolveProxyListState,
  type ProxyEmptyStateReason,
} from '@/components/proxy/proxy-empty-state-model'
import {
  getAutoSwitchGroups,
  hydrateAutoSwitchGroups,
  subscribeAutoSwitchGroups,
} from '@/components/proxy/auto-switch-store'
import {
  forgetSelectedNode,
  getProfiles,
  getProxyView,
  getRuntimeState,
  getVergeConfig,
  openLogsDir,
  recordSelectedNode,
  restartCore,
  syncTrayProxySelection,
} from '@/services/cmds'
import delayManager from '@/services/delay'
import i18n from '@/services/i18n'
import { showNotice } from '@/services/notice-service'
import { revalidateQuery } from '@/services/query-client'
import parseTraffic from '@/utils/parse-traffic'
import {
  isInteractableMember,
  resolveMember,
  type ProxyGroupView,
  type ProxyViewV1,
  type ResolvedProxyMember,
} from '@/types/proxy-view'
import { debugLog } from '@/utils/debug'
import { navigateApp } from '@/utils/app-navigate'

import { navigationItems } from '@/pages/_navigation-meta'

import ProxyNodeCard from '@/vue/components/ProxyNodeCard.vue'
import UiStatusMessage from '@/vue/components/ui/UiStatusMessage.vue'
import { resolvePrimaryProxyGroup } from '@/vue/utils/resolve-primary-proxy-group'

type ProxyProviderView = ProxyViewV1['providers'][number]

dayjs.extend(relativeTime)

/** Page always lists the primary selector group; clash mode is not toggled here. */
const DISPLAY_MODE = 'rule'

const SORT_STORAGE = 'proxies-vue-sort-type'
const SHOW_TYPE_STORAGE = 'proxies-vue-show-type'

const t = (key: string, options?: Record<string, unknown>) =>
  i18n.t(key as never, options) as string

const proxyView = shallowRef<ProxyViewV1 | null>(null)
const profiles = shallowRef<IProfilesConfig | null | undefined>(null)
const runningMode = ref<string | undefined>(undefined)
const loading = ref(true)
const proxyError = ref(false)
const latencyTimeout = ref(10000)
const latencyUrl = ref('http://cp.cloudflare.com/generate_204')
const autoCloseConnection = ref(false)

const sortType = ref<ProxySortType>(0)
const showType = ref(true)
const testingAll = ref(false)
const selecting = ref(false)
const restarting = ref(false)
const providerOpen = ref(false)
const updatingProviders = ref<Record<string, boolean>>({})
const delayTick = ref(0)
const listEl = ref<HTMLElement | null>(null)

const autoSwitchGroups = shallowRef(getAutoSwitchGroups())

let refreshTimer: ReturnType<typeof setInterval> | null = null
let unsubAutoSwitch: (() => void) | null = null
let unsubDelay: (() => void) | null = null

const sortTooltip = computed(
  () =>
    [
      t('proxies.page.tooltips.sortDefault'),
      t('proxies.page.tooltips.sortDelay'),
      t('proxies.page.tooltips.sortName'),
    ][sortType.value],
)

const primaryGroup = computed(() =>
  resolvePrimaryProxyGroup(proxyView.value, DISPLAY_MODE),
)

const enabledTargetGroups = computed(() => {
  const names = new Set<string>()
  for (const group of autoSwitchGroups.value) {
    if (group.enabled && group.targetGroupName) {
      names.add(group.targetGroupName)
    }
  }
  return names
})

const autoSwitchEnabledCount = computed(
  () => autoSwitchGroups.value.filter((group) => group.enabled).length,
)

const autoSwitchActive = computed(() => {
  const group = primaryGroup.value
  return Boolean(group && enabledTargetGroups.value.has(group.name))
})

const providers = computed(() => proxyView.value?.providers ?? [])
const providerUnavailable = computed(
  () => proxyView.value?.providerState === 'unavailable',
)

const listState = computed(() =>
  resolveProxyListState({
    mode: DISPLAY_MODE,
    profiles: profiles.value ?? undefined,
    isProfilesPending: loading.value && !profiles.value,
    isProxyViewPending: loading.value && !proxyView.value,
    isRunningModePending: loading.value && runningMode.value === undefined,
  }),
)

const emptyReason = computed<ProxyEmptyStateReason | null>(() => {
  if (listState.value.kind === 'empty') return listState.value.reason
  if (listState.value.kind !== 'render') return null
  if (!primaryGroup.value) {
    return resolveEmptyListReason({
      runningMode: runningMode.value,
      isProxyViewError: proxyError.value,
    })
  }
  return null
})

const occurrences = computed(() => {
  // delayTick keeps sort-by-delay fresh after batch tests settle
  void delayTick.value
  const view = proxyView.value
  const group = primaryGroup.value
  if (!view || !group) return []

  const members = group.members.map((member, memberIndex) => ({
    memberIndex,
    member: resolveMember(view, member),
  }))

  return filterSort(
    members,
    group.name,
    '',
    sortType.value,
    latencyTimeout.value,
  )
})

const currentName = computed(() => primaryGroup.value?.now ?? '')
const nodeCountLabel = computed(() =>
  t('proxies.page.labels.nodeCount', { count: occurrences.value.length }),
)

const bindDelayListener = (groupName: string | undefined) => {
  unsubDelay?.()
  unsubDelay = null
  if (!groupName) return
  unsubDelay = delayManager.addGroupListener(groupName, () => {
    delayTick.value += 1
  })
}

const refreshAll = async (opts?: { silent?: boolean }) => {
  if (!opts?.silent) loading.value = true
  proxyError.value = false
  try {
    const [view, profileData, verge, runtime] = await Promise.all([
      getProxyView(),
      getProfiles().catch(() => null),
      getVergeConfig().catch(() => null),
      getRuntimeState().catch(() => null),
    ])
    proxyView.value = view
    profiles.value = profileData
    runningMode.value = runtime?.mode
    if (verge) {
      latencyTimeout.value = verge.default_latency_timeout || 10000
      latencyUrl.value =
        verge.default_latency_test?.trim() ||
        'http://cp.cloudflare.com/generate_204'
      autoCloseConnection.value = verge.auto_close_connection ?? false
    }
  } catch (error) {
    console.error('[ProxiesPage] refresh failed', error)
    proxyError.value = true
  } finally {
    loading.value = false
  }
}

const syncReactProxyCache = () => {
  void revalidateQuery(['getProxyView'])
  void revalidateQuery(['getClashConfig'])
}

watch(
  () => primaryGroup.value?.name,
  (groupName) => {
    if (!groupName) return
    delayManager.setUrl(groupName, latencyUrl.value)
    bindDelayListener(groupName)
  },
  { immediate: true },
)

watch(latencyUrl, (url) => {
  const groupName = primaryGroup.value?.name
  if (groupName) delayManager.setUrl(groupName, url)
})

const cleanupConnections = async (previousProxy: string) => {
  try {
    const { connections } = await getConnections()
    const tasks = (connections ?? [])
      .filter((conn) => conn.chains.includes(previousProxy))
      .map((conn) => closeConnection(conn.id))
    if (tasks.length > 0) await Promise.allSettled(tasks)
  } catch (error) {
    console.warn('[ProxiesPage] connection cleanup failed', error)
  }
}

const onSelectMember = async (
  group: ProxyGroupView,
  member: ResolvedProxyMember,
) => {
  if (!['Selector', 'URLTest', 'Fallback'].includes(group.type)) return
  if (!isInteractableMember(member)) return
  if (selecting.value) return

  const proxyName = member.ref.name
  const previous = group.now
  const isFixed = group.fixed === proxyName
  selecting.value = true

  try {
    if (isFixed) {
      await unfixedProxy(group.name)
      await forgetSelectedNode(group.name)
    } else {
      await selectNodeForGroup(group.name, proxyName)
      await recordSelectedNode(group.name, proxyName)
    }
    syncTrayProxySelection().catch(() => {})
    if (autoCloseConnection.value && previous && previous !== proxyName) {
      void cleanupConnections(previous)
    }
    await refreshAll({ silent: true })
    syncReactProxyCache()
  } catch (error) {
    console.error('[ProxiesPage] select failed', error)
    await refreshAll({ silent: true })
  } finally {
    selecting.value = false
  }
}

const onCheckAll = async () => {
  const view = proxyView.value
  const group = primaryGroup.value
  if (!view || !group || testingAll.value) return

  testingAll.value = true
  debugLog(`[ProxiesPage] delay test start: ${group.name}`)
  try {
    const interactable = group.members
      .map((member) => resolveMember(view, member))
      .filter(isInteractableMember)
    await delayManager.checkListDelay(
      interactable,
      group.name,
      latencyTimeout.value,
    )
  } catch (error) {
    console.error('[ProxiesPage] delay test failed', error)
  } finally {
    testingAll.value = false
    delayTick.value += 1
  }
}

const onLocate = async () => {
  const now = primaryGroup.value?.now
  if (!now || !listEl.value) return
  await nextTick()
  const target = listEl.value.querySelector<HTMLElement>(
    `[data-proxy-name="${CSS.escape(now)}"]`,
  )
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

const cycleSort = () => {
  sortType.value = ((sortType.value + 1) % 3) as ProxySortType
  localStorage.setItem(SORT_STORAGE, String(sortType.value))
}

const toggleShowType = () => {
  showType.value = !showType.value
  localStorage.setItem(SHOW_TYPE_STORAGE, showType.value ? '1' : '0')
}

const openAutoSwitch = () => {
  window.dispatchEvent(new CustomEvent('clash-x:open-auto-switch'))
}

const openProfiles = () => {
  navigateApp(navigationItems.profiles.path)
}

const onRestartCore = async () => {
  if (restarting.value) return
  restarting.value = true
  try {
    await restartCore()
    await refreshAll()
    syncReactProxyCache()
  } catch (error) {
    showNotice.error(error)
  } finally {
    restarting.value = false
  }
}

const onOpenLogs = () => {
  void openLogsDir()
}

const updateOneProvider = async (name: string) => {
  try {
    updatingProviders.value = { ...updatingProviders.value, [name]: true }
    await updateProxyProvider(name)
    await refreshAll({ silent: true })
    syncReactProxyCache()
    showNotice.success(
      'proxies.feedback.notifications.provider.updateSuccess',
      {
        name,
      },
    )
  } catch (err) {
    showNotice.error('proxies.feedback.notifications.provider.updateFailed', {
      name,
      message: String(err),
    })
  } finally {
    updatingProviders.value = { ...updatingProviders.value, [name]: false }
  }
}

const updateAllProviders = async () => {
  const names = providers.value.map((p) => p.name)
  if (names.length === 0) {
    showNotice.info('proxies.feedback.notifications.provider.none')
    return
  }
  updatingProviders.value = Object.fromEntries(names.map((n) => [n, true]))
  for (const name of names) {
    try {
      await updateProxyProvider(name)
    } catch (err) {
      console.error(`更新 ${name} 失败`, err)
    } finally {
      updatingProviders.value = { ...updatingProviders.value, [name]: false }
    }
  }
  await refreshAll({ silent: true })
  syncReactProxyCache()
  showNotice.success('proxies.feedback.notifications.provider.allUpdated')
}

const providerTraffic = (provider: ProxyProviderView) => {
  const sub = provider.subscriptionInfo
  if (!sub) return null
  const used = (sub.upload || 0) + (sub.download || 0)
  const total = sub.total || 0
  const progress =
    total > 0 ? Math.min(Math.round((used * 100) / total) + 1, 100) : 0
  return {
    usedLabel: `${parseTraffic(used)} / ${parseTraffic(total)}`,
    expire: sub.expire ? dayjs(sub.expire * 1000).format('YYYY-MM-DD') : '-',
    progress,
  }
}

onMounted(() => {
  const savedSort = localStorage.getItem(SORT_STORAGE)
  if (savedSort === '0' || savedSort === '1' || savedSort === '2') {
    sortType.value = Number(savedSort) as ProxySortType
  }
  const savedShow = localStorage.getItem(SHOW_TYPE_STORAGE)
  if (savedShow === '0') showType.value = false

  void hydrateAutoSwitchGroups().catch(() => {})
  unsubAutoSwitch = subscribeAutoSwitchGroups(() => {
    autoSwitchGroups.value = getAutoSwitchGroups()
  })

  void refreshAll()
  refreshTimer = setInterval(() => {
    void refreshAll({ silent: true })
  }, 15000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
  unsubAutoSwitch?.()
  unsubDelay?.()
})
</script>

<template>
  <div class="proxies-page">
    <div class="proxies-page__toolbar">
      <div
        v-if="listState.kind === 'render' && primaryGroup"
        class="proxies-page__meta"
      >
        <span v-if="currentName" class="proxies-page__current">
          {{ t('proxies.page.focus.current') }}：{{ currentName }}
        </span>
        <span class="proxies-page__count">{{ nodeCountLabel }}</span>
      </div>
      <div v-else class="proxies-page__meta-spacer" />

      <div class="proxies-page__tools">
        <el-tooltip :content="t('proxies.page.tooltips.locate')" placement="top">
          <el-button
            :icon="Aim"
            circle
            size="small"
            :disabled="!currentName"
            @click="onLocate"
          />
        </el-tooltip>

        <el-tooltip
          :content="t('proxies.page.tooltips.delayCheck')"
          placement="top"
        >
          <el-button
            :icon="Connection"
            circle
            size="small"
            :loading="testingAll"
            :disabled="!primaryGroup"
            @click="onCheckAll"
          />
        </el-tooltip>

        <el-tooltip :content="sortTooltip" placement="top">
          <el-button :icon="Sort" circle size="small" @click="cycleSort" />
        </el-tooltip>

        <el-tooltip
          :content="
            showType
              ? t('proxies.page.tooltips.showBasic')
              : t('proxies.page.tooltips.showDetail')
          "
          placement="top"
        >
          <el-button
            :icon="showType ? View : Hide"
            circle
            size="small"
            @click="toggleShowType"
          />
        </el-tooltip>

        <el-tooltip
          :content="
            autoSwitchEnabledCount > 0
              ? t('proxies.page.autoSwitch.activeTooltip', {
                  count: autoSwitchEnabledCount,
                })
              : t('proxies.page.autoSwitch.title')
          "
          placement="top"
        >
          <el-button
            :icon="Switch"
            circle
            size="small"
            :type="autoSwitchEnabledCount > 0 ? 'primary' : 'default'"
            @click="openAutoSwitch"
          />
        </el-tooltip>

        <el-tooltip
          v-if="providers.length > 0 || providerUnavailable"
          :content="t('proxies.page.provider.title')"
          placement="top"
        >
          <el-button
            :icon="MoreFilled"
            circle
            size="small"
            :disabled="providerUnavailable"
            @click="providerOpen = true"
          />
        </el-tooltip>
      </div>
    </div>

    <div class="proxies-page__body">
      <UiStatusMessage v-if="listState.kind === 'loading' || (loading && !proxyView)">
        …
      </UiStatusMessage>

      <div v-else-if="emptyReason" class="proxies-page__empty">
        <div class="proxies-page__empty-title">
          {{
            emptyReason === 'no-subscriptions'
              ? t('proxies.page.empty.noSubscriptions.title')
              : emptyReason === 'inactive-subscription'
                ? t('proxies.page.empty.inactiveSubscription.title')
                : emptyReason === 'core-unavailable'
                  ? t('proxies.page.empty.coreUnavailable.title')
                  : t('proxies.page.empty.noProxyInfo.title')
          }}
        </div>
        <p class="proxies-page__empty-desc">
          {{
            emptyReason === 'no-subscriptions'
              ? t('proxies.page.empty.noSubscriptions.description')
              : emptyReason === 'inactive-subscription'
                ? t('proxies.page.empty.inactiveSubscription.description')
                : emptyReason === 'core-unavailable'
                  ? t('proxies.page.empty.coreUnavailable.description')
                  : t('proxies.page.empty.noProxyInfo.description')
          }}
        </p>
        <div class="proxies-page__empty-actions">
          <el-button
            v-if="
              emptyReason === 'no-subscriptions' ||
              emptyReason === 'inactive-subscription' ||
              emptyReason === 'no-proxy-info'
            "
            type="primary"
            @click="openProfiles"
          >
            {{ t('proxies.page.empty.actions.openProfiles') }}
          </el-button>
          <el-button
            v-if="
              emptyReason === 'core-unavailable' || emptyReason === 'no-proxy-info'
            "
            :loading="restarting"
            @click="onRestartCore"
          >
            {{ t('proxies.page.empty.actions.restartCore') }}
          </el-button>
          <el-button
            v-if="
              emptyReason === 'core-unavailable' || emptyReason === 'no-proxy-info'
            "
            @click="onOpenLogs"
          >
            {{ t('proxies.page.empty.actions.openLogs') }}
          </el-button>
        </div>
      </div>

      <UiStatusMessage v-else-if="occurrences.length === 0">
        {{ t('proxies.page.empty.noProxies') }}
      </UiStatusMessage>

      <el-scrollbar v-else class="proxies-page__scroll" height="100%">
        <div ref="listEl" class="proxies-page__grid">
          <div
            v-for="item in occurrences"
            :key="`${primaryGroup!.name}:${item.memberIndex}:${item.member.ref.name}`"
            :data-proxy-name="item.member.ref.name"
          >
            <ProxyNodeCard
              :group="primaryGroup!"
              :member="item.member"
              :selected="primaryGroup!.now === item.member.ref.name"
              :auto-switch-active="autoSwitchActive"
              :show-type="showType"
              :timeout="latencyTimeout"
              @select="onSelectMember(primaryGroup!, $event)"
            />
          </div>
        </div>
      </el-scrollbar>
    </div>

    <el-dialog
      v-model="providerOpen"
      :title="t('proxies.page.provider.title')"
      width="480px"
      align-center
      destroy-on-close
      append-to-body
    >
      <div class="proxies-provider__head">
        <el-button type="primary" size="small" @click="updateAllProviders">
          {{ t('proxies.page.provider.actions.updateAll') }}
        </el-button>
      </div>
      <div class="proxies-provider__list">
        <div
          v-for="provider in providers"
          :key="provider.name"
          class="proxies-provider__item"
        >
          <div class="proxies-provider__info">
            <div class="proxies-provider__name">
              <span>{{ provider.name }}</span>
              <span class="proxies-provider__chip">
                {{ provider.proxyRecordIds.length }}
              </span>
              <span class="proxies-provider__chip">
                {{ provider.vehicleType }}
              </span>
            </div>
            <div class="proxies-provider__time">
              {{ t('shared.labels.updateAt') }}:
              {{
                provider.updatedAt
                  ? dayjs(provider.updatedAt).fromNow()
                  : '-'
              }}
            </div>
            <template v-if="providerTraffic(provider)">
              <div class="proxies-provider__sub">
                <span>{{ providerTraffic(provider)!.usedLabel }}</span>
                <span>{{ providerTraffic(provider)!.expire }}</span>
              </div>
              <el-progress
                :percentage="providerTraffic(provider)!.progress"
                :stroke-width="6"
                :show-text="false"
              />
            </template>
          </div>
          <el-button
            :icon="Refresh"
            circle
            size="small"
            :loading="updatingProviders[provider.name]"
            @click="updateOneProvider(provider.name)"
          />
        </div>
      </div>
      <template #footer>
        <el-button @click="providerOpen = false">
          {{ t('shared.actions.close') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.proxies-page {
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  color: var(--text-primary);
  gap: 14px;
  padding: 8px 16px 16px;
  box-sizing: border-box;

  &__toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex: none;
    padding: 0 2px;
  }

  &__tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }

  &__meta {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 10px 16px;
    min-width: 0;
    font-size: 13px;
    color: var(--text-secondary, #6b6f76);
  }

  &__meta-spacer {
    flex: 1;
  }

  &__current {
    font-weight: 600;
    color: var(--text-primary);
  }

  &__body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  &__scroll {
    flex: 1;
    min-height: 0;

    :deep(.el-scrollbar__wrap) {
      overflow-x: hidden;
    }

    :deep(.el-scrollbar__view) {
      padding: 2px 2px 8px;
    }
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 14px;
    padding: 4px 2px 20px;
  }

  &__empty {
    margin: auto;
    max-width: 560px;
    padding: 20px;
    border-radius: var(--cx-radius-lg, 12px);
    border: 1px solid color-mix(in srgb, #ed6c02 35%, transparent);
    background: color-mix(in srgb, #ed6c02 6%, var(--background-paper));
  }

  &__empty-title {
    font-size: 15px;
    font-weight: 700;
    margin-bottom: 8px;
  }

  &__empty-desc {
    margin: 0 0 14px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-secondary, #6b6f76);
  }

  &__empty-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
}

.proxies-provider {
  &__head {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 12px;
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 200px;
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: var(--cx-radius-md, 8px);
    border: 1px solid var(--cx-divider, var(--divider-color, #e5e7eb));
    background: var(--background-paper);
  }

  &__info {
    flex: 1;
    min-width: 0;
  }

  &__name {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    font-weight: 650;
    font-size: 14px;
  }

  &__chip {
    padding: 0 4px;
    border-radius: 4px;
    border: 1px solid color-mix(in srgb, var(--primary-main) 40%, transparent);
    color: color-mix(in srgb, var(--primary-main) 80%, transparent);
    font-size: 10px;
    font-weight: 600;
  }

  &__time {
    margin-top: 4px;
    font-size: 12px;
    color: var(--text-secondary, #6b6f76);
  }

  &__sub {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin: 8px 0 4px;
    font-size: 12px;
    color: var(--text-secondary, #6b6f76);
  }
}
</style>

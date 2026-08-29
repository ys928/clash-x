<script setup lang="ts">
import { Delete } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import {
  DomainTrafficList,
  UiButton,
  UiSearchField,
  UiSegmentedControl,
  UiStatCard,
  UiStatusMessage,
} from '@/vue/components'
import {
  clearDomainTrafficBefore,
  clearDomainTrafficStats,
  getDomainTrafficStats,
  type DomainTrafficRange,
  type DomainTrafficStats,
} from '@/services/domain-traffic'
import i18n from '@/services/i18n'
import parseTraffic from '@/utils/parse-traffic'

type CleanupMode = 'before' | 'all'

const ranges: DomainTrafficRange[] = ['day', 'week', 'month', 'year']

const range = ref<DomainTrafficRange>('day')
const loading = ref(false)
const clearing = ref(false)
const cleanupOpen = ref(false)
const cleanupMode = ref<CleanupMode>('before')
const error = ref<string | null>(null)
const stats = ref<DomainTrafficStats | null>(null)
const query = ref('')
const clearBeforeDay = ref(defaultClearBeforeDay())

let refreshTimer: ReturnType<typeof setInterval> | null = null

function defaultClearBeforeDay() {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return formatDateInput(d)
}

function formatDateInput(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const t = (key: string, options?: Record<string, unknown>) =>
  i18n.t(key as never, options) as string

const formatBytes = (bytes: number) => {
  const [value, unit] = parseTraffic(bytes)
  return `${value} ${unit}`.trim()
}

const rangeOptions = computed(() =>
  ranges.map((item) => ({
    value: item,
    label: t(`traffic.ranges.${item}`),
  })),
)

const listColumns = computed(() => ({
  domain: t('traffic.columns.domain'),
  proxy: t('traffic.columns.proxy'),
  direct: t('traffic.columns.direct'),
  total: t('traffic.columns.total'),
}))

const filteredItems = computed(() => {
  const items = stats.value?.items ?? []
  const q = query.value.trim().toLowerCase()
  if (!q) return items
  return items.filter((item) => item.domain.toLowerCase().includes(q))
})

const cleanupConfirmLabel = computed(() =>
  cleanupMode.value === 'all'
    ? t('traffic.actions.clear')
    : t('traffic.actions.clearBefore'),
)

const load = async () => {
  loading.value = true
  error.value = null
  try {
    stats.value = await getDomainTrafficStats(range.value)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

const openCleanup = () => {
  cleanupMode.value = 'before'
  clearBeforeDay.value = defaultClearBeforeDay()
  cleanupOpen.value = true
}

const closeCleanup = () => {
  cleanupOpen.value = false
}

const confirmDestructive = async (message: string) => {
  try {
    await ElMessageBox.confirm(message, t('traffic.actions.cleanupTitle'), {
      type: 'warning',
      confirmButtonText: t('shared.actions.confirm'),
      cancelButtonText: t('shared.actions.cancel'),
      confirmButtonClass: 'el-button--danger',
    })
    return true
  } catch {
    return false
  }
}

const handleCleanupConfirm = async () => {
  if (clearing.value) return

  if (cleanupMode.value === 'before') {
    if (!clearBeforeDay.value) return
    const ok = await confirmDestructive(
      t('traffic.actions.clearBeforeConfirm', { date: clearBeforeDay.value }),
    )
    if (!ok) return

    clearing.value = true
    try {
      const result = await clearDomainTrafficBefore(clearBeforeDay.value)
      if (result.removedDays === 0) {
        ElMessage.info(t('traffic.actions.clearBeforeEmpty'))
      } else {
        ElMessage.success(
          t('traffic.actions.clearBeforeDone', { count: result.removedDays }),
        )
      }
      closeCleanup()
      await load()
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      clearing.value = false
    }
    return
  }

  const ok = await confirmDestructive(t('traffic.actions.clearConfirm'))
  if (!ok) return

  clearing.value = true
  try {
    await clearDomainTrafficStats()
    ElMessage.success(t('traffic.actions.clearDone'))
    closeCleanup()
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    clearing.value = false
  }
}

watch(range, () => {
  void load()
})

onMounted(() => {
  void load()
  refreshTimer = setInterval(() => {
    void load()
  }, 5000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<template>
  <div class="dt-page">
    <el-scrollbar class="dt-page__scroll" height="100%">
      <div class="dt-page__inner">
        <div class="dt-toolbar">
          <UiSegmentedControl v-model="range" :options="rangeOptions" />

          <div class="dt-toolbar__right">
            <UiSearchField v-model="query" :placeholder="t('traffic.searchPlaceholder')" />
            <UiButton :disabled="loading" @click="load">
              {{ t('traffic.actions.refresh') }}
            </UiButton>
            <el-button type="danger" plain :icon="Delete" :disabled="clearing" @click="openCleanup">
              {{ t('traffic.actions.cleanup') }}
            </el-button>
          </div>
        </div>

        <p class="dt-hint">{{ t('traffic.hint') }}</p>

        <div v-if="stats" class="dt-summary">
          <UiStatCard :label="t('traffic.summary.total')" :value="formatBytes(stats.totals.total)" />
          <UiStatCard tone="proxy" :label="t('traffic.summary.proxy')" :value="formatBytes(stats.totals.proxyTotal)" />
          <UiStatCard tone="direct" :label="t('traffic.summary.direct')" :value="formatBytes(stats.totals.directTotal)" />
        </div>

        <UiStatusMessage v-if="error" tone="error">{{ error }}</UiStatusMessage>

        <UiStatusMessage v-else-if="loading && !stats">
          {{ t('traffic.loading') }}
        </UiStatusMessage>

        <UiStatusMessage v-else-if="filteredItems.length === 0">
          {{ t('traffic.empty') }}
        </UiStatusMessage>

        <DomainTrafficList
          v-else
          :items="filteredItems"
          :columns="listColumns"
          :format-bytes="formatBytes"
        />
      </div>
    </el-scrollbar>
    <el-dialog
      v-model="cleanupOpen"
      class="dt-cleanup-dialog"
      :title="t('traffic.actions.cleanupTitle')"
      width="440px"
      align-center
      destroy-on-close
      append-to-body
      :close-on-click-modal="!clearing"
      :close-on-press-escape="!clearing"
      :show-close="!clearing"
    >
      <p class="dt-cleanup-dialog__desc">
        {{ t('traffic.actions.cleanupDesc') }}
      </p>

      <div class="dt-cleanup-modes" role="radiogroup">
        <div
          class="dt-cleanup-mode"
          :class="{ 'is-active': cleanupMode === 'before' }"
          role="radio"
          tabindex="0"
          :aria-checked="cleanupMode === 'before'"
          @click="cleanupMode = 'before'"
          @keydown.enter.prevent="cleanupMode = 'before'"
          @keydown.space.prevent="cleanupMode = 'before'"
        >
          <div class="dt-cleanup-mode__head">
            <span class="dt-cleanup-mode__radio" aria-hidden="true" />
            <div class="dt-cleanup-mode__copy">
              <div class="dt-cleanup-mode__title">
                {{ t('traffic.actions.clearBefore') }}
              </div>
              <div class="dt-cleanup-mode__hint">
                {{ t('traffic.actions.clearBeforeHint') }}
              </div>
            </div>
          </div>
          <div class="dt-cleanup-mode__date-wrap">
            <el-date-picker
              v-model="clearBeforeDay"
              type="date"
              value-format="YYYY-MM-DD"
              :disabled="cleanupMode !== 'before' || clearing"
              :placeholder="t('traffic.actions.clearBeforeLabel')"
              :clearable="false"
              :teleported="true"
              @click.stop
              @focus="cleanupMode = 'before'"
            />
          </div>
        </div>

        <div
          class="dt-cleanup-mode"
          :class="{ 'is-active': cleanupMode === 'all' }"
          role="radio"
          tabindex="0"
          :aria-checked="cleanupMode === 'all'"
          @click="cleanupMode = 'all'"
          @keydown.enter.prevent="cleanupMode = 'all'"
          @keydown.space.prevent="cleanupMode = 'all'"
        >
          <div class="dt-cleanup-mode__head">
            <span class="dt-cleanup-mode__radio" aria-hidden="true" />
            <div class="dt-cleanup-mode__copy">
              <div class="dt-cleanup-mode__title">
                {{ t('traffic.actions.clear') }}
              </div>
              <div class="dt-cleanup-mode__hint">
                {{ t('traffic.actions.clearAllHint') }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <el-button :disabled="clearing" @click="closeCleanup">
          {{ t('shared.actions.cancel') }}
        </el-button>
        <el-button
          type="danger"
          :loading="clearing"
          :disabled="cleanupMode === 'before' && !clearBeforeDay"
          @click="handleCleanupConfirm"
        >
          {{ cleanupConfirmLabel }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.dt-page {
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  color: var(--text-primary);

  &__scroll {
    flex: 1;
    min-height: 0;
    height: 100%;

    :deep(.el-scrollbar__wrap) {
      overflow-x: hidden;
    }
  }

  &__inner {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 4px 4px 16px 0;
  }
}

.dt-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  &__right {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
}

.dt-hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.45;
}

.dt-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
}

.dt-cleanup-dialog__desc {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

.dt-cleanup-modes {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.dt-cleanup-mode {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  min-width: 0;
  padding: 14px;
  text-align: left;
  border-radius: 10px;
  border: 1px solid var(--el-border-color);
  background: var(--el-fill-color-blank);
  color: inherit;
  cursor: pointer;
  overflow: hidden;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    box-shadow 0.15s ease;

  &:hover {
    border-color: color-mix(
      in srgb,
      var(--el-color-primary) 45%,
      var(--el-border-color)
    );
  }

  &.is-active {
    border-color: var(--el-color-primary);
    background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--el-color-primary) 28%, transparent);
  }

  &__head {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    min-width: 0;
  }

  &__copy {
    min-width: 0;
    flex: 1;
  }

  &__radio {
    flex: none;
    width: 16px;
    height: 16px;
    margin-top: 2px;
    border-radius: 50%;
    border: 2px solid var(--el-border-color-darker, var(--el-border-color));
    background: transparent;
    position: relative;

    .is-active & {
      border-color: var(--el-color-primary);

      &::after {
        content: '';
        position: absolute;
        inset: 3px;
        border-radius: 50%;
        background: var(--el-color-primary);
      }
    }
  }

  &__title {
    font-size: 14px;
    font-weight: 600;
    line-height: 1.3;
  }

  &__hint {
    margin-top: 4px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--el-text-color-secondary);
  }

  &__date-wrap {
    box-sizing: border-box;
    margin-left: 28px;
    width: calc(100% - 28px);
    min-width: 0;
    max-width: 100%;

    :deep(.el-date-editor) {
      width: 100% !important;
      max-width: 100%;
      min-width: 0 !important;
      box-sizing: border-box;
    }

    :deep(.el-input) {
      width: 100%;
      max-width: 100%;
    }

    :deep(.el-input__wrapper) {
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
    }
  }
}
</style>

<!-- Dialog teleports to body; keep shell styles unscoped. -->
<style lang="scss">
.dt-cleanup-dialog.el-dialog {
  --el-dialog-bg-color: var(--el-bg-color);
  --el-dialog-padding-primary: 16px 18px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--cx-radius-lg, 12px);
  box-shadow: var(--el-box-shadow-light);
  overflow: hidden;

  .el-dialog__header {
    margin-right: 0;
    padding-bottom: 8px;
  }

  .el-dialog__title {
    font-size: 16px;
    font-weight: 650;
    color: var(--el-text-color-primary);
  }

  .el-dialog__body {
    box-sizing: border-box;
    padding-top: 4px;
    overflow-x: hidden;
    color: var(--el-text-color-primary);
  }

  .el-dialog__footer {
    padding-top: 8px;
  }
}
</style>

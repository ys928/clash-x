<script setup lang="ts">
import {
  Close,
  Connection,
  Delete,
  Plus,
  Search,
  Switch,
} from '@element-plus/icons-vue'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import {
  bindingKey,
  createEmptyAutoSwitchGroup,
  DEFAULT_INTERVAL_SECONDS,
  DEFAULT_THRESHOLD_MS,
  MAX_INTERVAL_SECONDS,
  MAX_THRESHOLD_MS,
  MIN_INTERVAL_SECONDS,
  MIN_THRESHOLD_MS,
  toNodeBinding,
  type AutoSwitchGroup,
} from '@/components/proxy/auto-switch-model'
import {
  getAutoSwitchGroups,
  hydrateAutoSwitchGroups,
  subscribeAutoSwitchGroups,
} from '@/components/proxy/auto-switch-store'
import {
  deleteAutoSwitchGroup,
  patchAutoSwitchGroup,
  runAutoSwitchOnce,
  upsertAutoSwitchGroup,
} from '@/services/cmds'
import i18n from '@/services/i18n'
import { showNotice } from '@/services/notice-service'
import {
  isInteractableMember,
  resolveMember,
  type ProxyGroupView,
  type ProxyNodeView,
  type ProxyViewV1,
} from '@/types/proxy-view'

const INTERVAL_PRESETS = [30, 60, 120, 300]
const THRESHOLD_PRESETS = [0, 30, 50, 100, 200]
const SELECTABLE = new Set(['Selector', 'URLTest', 'Fallback'])

const props = defineProps<{
  open: boolean
  proxyView: ProxyViewV1 | null
  mode?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  refresh: []
}>()

const t = (key: string, options?: Record<string, unknown>) =>
  i18n.t(key as never, options) as string

const groups = ref<AutoSwitchGroup[]>(getAutoSwitchGroups())
const editing = ref<AutoSwitchGroup | null>(null)
const nodeFilter = ref('')
const testingId = ref<string | null>(null)

const selectableGroups = computed(() => {
  if (!props.proxyView) return [] as ProxyGroupView[]
  const fromGroups = props.proxyView.groups.filter(
    (group) => !group.hidden && SELECTABLE.has(group.type),
  )
  if (props.mode?.toLowerCase() === 'global' && props.proxyView.global) {
    return [
      props.proxyView.global,
      ...fromGroups.filter(
        (group) => group.name !== props.proxyView.global?.name,
      ),
    ]
  }
  return fromGroups
})

const targetGroup = computed(() => {
  if (!editing.value?.targetGroupName) return null
  return (
    selectableGroups.value.find(
      (group) => group.name === editing.value?.targetGroupName,
    ) ?? null
  )
})

const candidates = computed(() => {
  if (!targetGroup.value || !props.proxyView) return [] as ProxyNodeView[]
  const result: ProxyNodeView[] = []
  const seen = new Set<string>()
  for (const memberRef of targetGroup.value.members) {
    const member = resolveMember(props.proxyView, memberRef)
    if (!isInteractableMember(member) || member.kind !== 'node') continue
    if (seen.has(member.node.recordId)) continue
    seen.add(member.node.recordId)
    result.push(member.node)
  }
  return result
})

const filteredCandidates = computed(() => {
  const query = nodeFilter.value.trim().toLowerCase()
  if (!query) return candidates.value
  return candidates.value.filter(
    (node) =>
      node.name.toLowerCase().includes(query) ||
      node.type.toLowerCase().includes(query),
  )
})

const selectedKeys = computed(
  () => new Set(editing.value?.nodes.map(bindingKey) ?? []),
)

const isExisting = computed(
  () =>
    !!editing.value &&
    groups.value.some((group) => group.id === editing.value?.id),
)

const enabledCount = computed(
  () => groups.value.filter((group) => group.enabled).length,
)

const formatInterval = (seconds: number) =>
  seconds < 60
    ? t('proxies.page.autoSwitch.intervalSeconds', { count: seconds })
    : t('proxies.page.autoSwitch.intervalMinutes', {
        count: Math.round(seconds / 60),
      })

const close = () => {
  editing.value = null
  nodeFilter.value = ''
  testingId.value = null
  emit('update:open', false)
}

const startCreate = () => {
  const defaultTarget =
    props.mode?.toLowerCase() === 'global'
      ? (props.proxyView?.global?.name ?? '')
      : (selectableGroups.value[0]?.name ?? '')
  editing.value = createEmptyAutoSwitchGroup({
    name: t('proxies.page.autoSwitch.defaultName'),
    targetGroupName: defaultTarget,
    enabled: true,
  })
  nodeFilter.value = ''
}

const startEdit = (group: AutoSwitchGroup) => {
  editing.value = { ...group, nodes: group.nodes.map((node) => ({ ...node })) }
  nodeFilter.value = ''
}

const toggleNode = (node: ProxyNodeView) => {
  if (!editing.value) return
  const key = bindingKey(toNodeBinding(node))
  const nodes = selectedKeys.value.has(key)
    ? editing.value.nodes.filter((item) => bindingKey(item) !== key)
    : [...editing.value.nodes, toNodeBinding(node)]
  editing.value = { ...editing.value, nodes }
}

const removeNode = (key: string) => {
  if (!editing.value) return
  editing.value = {
    ...editing.value,
    nodes: editing.value.nodes.filter((node) => bindingKey(node) !== key),
  }
}

const clearNodes = () => {
  if (!editing.value) return
  editing.value = { ...editing.value, nodes: [] }
}

const handleTargetChange = (targetGroupName: string) => {
  if (!editing.value) return
  editing.value = { ...editing.value, targetGroupName, nodes: [] }
  nodeFilter.value = ''
}

const handleSave = async () => {
  if (!editing.value) return
  const name = editing.value.name.trim()
  if (!name) {
    return showNotice.error('proxies.page.autoSwitch.errors.nameRequired')
  }
  if (!editing.value.targetGroupName) {
    return showNotice.error('proxies.page.autoSwitch.errors.targetRequired')
  }
  if (editing.value.nodes.length < 2) {
    return showNotice.error('proxies.page.autoSwitch.errors.minNodes')
  }

  const group = {
    ...editing.value,
    name,
    intervalSeconds: Math.min(
      MAX_INTERVAL_SECONDS,
      Math.max(
        MIN_INTERVAL_SECONDS,
        Math.round(editing.value.intervalSeconds || DEFAULT_INTERVAL_SECONDS),
      ),
    ),
    thresholdMs: Math.min(
      MAX_THRESHOLD_MS,
      Math.max(
        MIN_THRESHOLD_MS,
        Math.round(
          Number.isFinite(editing.value.thresholdMs)
            ? editing.value.thresholdMs
            : DEFAULT_THRESHOLD_MS,
        ),
      ),
    ),
  }

  try {
    groups.value = await upsertAutoSwitchGroup(group)
    editing.value = null
    showNotice.success('proxies.page.autoSwitch.saved')
  } catch (error) {
    showNotice.error(error)
  }
}

const handleToggle = async (group: AutoSwitchGroup, enabled: boolean) => {
  try {
    groups.value = await patchAutoSwitchGroup(group.id, { enabled })
  } catch (error) {
    showNotice.error(error)
  }
}

const handleDelete = async (id: string) => {
  try {
    groups.value = await deleteAutoSwitchGroup(id)
    if (editing.value?.id === id) editing.value = null
  } catch (error) {
    showNotice.error(error)
  }
}

const errorMessage = (error: unknown) => {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    if (typeof record.detail === 'string') return record.detail
    if (typeof record.message === 'string') return record.message
  }
  return 'unknown'
}

const handleTest = async (group: AutoSwitchGroup) => {
  testingId.value = group.id
  try {
    const { decision } = await runAutoSwitchOnce(group)
    if (decision.action === 'keep') {
      showNotice.info('proxies.page.autoSwitch.testedKeep', {
        group: group.name,
      })
    } else {
      emit('refresh')
    }
  } catch (error) {
    const message = errorMessage(error)
    showNotice.error(
      message === 'target-unavailable'
        ? 'proxies.page.autoSwitch.errors.targetUnavailable'
        : message === 'no-nodes'
          ? 'proxies.page.autoSwitch.errors.noResolvableNodes'
          : 'proxies.page.autoSwitch.errors.testFailed',
    )
  } finally {
    testingId.value = null
  }
}

const syncGroups = () => {
  groups.value = getAutoSwitchGroups()
}

watch(
  () => props.open,
  (open) => {
    if (!open) {
      editing.value = null
      nodeFilter.value = ''
      testingId.value = null
    }
  },
)

let unsubscribe: (() => void) | undefined
onMounted(() => {
  void hydrateAutoSwitchGroups().catch(() => {})
  unsubscribe = subscribeAutoSwitchGroups(syncGroups)
})
onUnmounted(() => unsubscribe?.())
</script>

<template>
  <el-dialog
    :model-value="open"
    :title="t('proxies.page.autoSwitch.title')"
    width="min(920px, 94vw)"
    class="auto-switch-dialog"
    append-to-body
    destroy-on-close
    align-center
    :show-close="false"
    @close="close"
  >
    <template #header>
      <div class="as-header">
        <div class="as-header__brand">
          <div class="as-header__icon">
            <el-icon :size="18"><Switch /></el-icon>
          </div>
          <div class="as-header__copy">
            <div class="as-header__title">
              {{ t('proxies.page.autoSwitch.title') }}
            </div>
            <div class="as-header__subtitle">
              {{ t('proxies.page.autoSwitch.subtitle') }}
            </div>
          </div>
        </div>
        <div class="as-header__right">
          <div v-if="enabledCount > 0" class="as-header__badge">
            {{
              t('proxies.page.autoSwitch.activeTooltip', {
                count: enabledCount,
              })
            }}
          </div>
          <el-button
            class="as-header__close"
            text
            circle
            :icon="Close"
            :aria-label="t('shared.actions.close')"
            @click="close"
          />
        </div>
      </div>
    </template>

    <div class="as-body">
      <aside class="as-sidebar">
        <div class="as-sidebar__top">
          <el-button
            type="primary"
            :icon="Plus"
            class="as-sidebar__create"
            @click="startCreate"
          >
            {{ t('proxies.page.autoSwitch.create') }}
          </el-button>
        </div>

        <div class="as-sidebar__list">
          <div v-if="groups.length === 0" class="as-empty as-empty--compact">
            {{ t('proxies.page.autoSwitch.empty') }}
          </div>
          <button
            v-for="group in groups"
            :key="group.id"
            type="button"
            class="as-group"
            :class="{ 'is-selected': editing?.id === group.id }"
            @click="startEdit(group)"
          >
            <span
              class="as-group__dot"
              :class="{ 'is-enabled': group.enabled }"
            />
            <span class="as-group__content">
              <span class="as-group__name">{{ group.name }}</span>
              <span class="as-group__meta">
                {{
                  t('proxies.page.autoSwitch.listMeta', {
                    count: group.nodes.length,
                    target: group.targetGroupName || '—',
                  })
                }}
              </span>
            </span>
            <el-switch
              :model-value="group.enabled"
              size="small"
              @click.stop
              @change="handleToggle(group, $event)"
            />
          </button>
        </div>
      </aside>

      <main class="as-editor">
        <div v-if="!editing" class="as-hint">
          <div class="as-hint__icon">
            <el-icon :size="28"><Connection /></el-icon>
          </div>
          <div class="as-hint__title">
            {{ t('proxies.page.autoSwitch.hintTitle') }}
          </div>
          <p class="as-hint__body">
            {{ t('proxies.page.autoSwitch.hintBody') }}
          </p>
          <el-button type="primary" plain :icon="Plus" @click="startCreate">
            {{ t('proxies.page.autoSwitch.create') }}
          </el-button>
        </div>

        <div v-else class="as-form">
          <div class="as-form__toolbar">
            <div class="as-form__heading">
              {{
                isExisting
                  ? t('proxies.page.autoSwitch.editTitle')
                  : t('proxies.page.autoSwitch.createTitle')
              }}
            </div>
            <div class="as-form__actions">
              <el-tooltip
                :content="t('proxies.page.autoSwitch.testNow')"
                placement="top"
              >
                <el-button
                  circle
                  :icon="Connection"
                  :loading="testingId === editing.id"
                  :disabled="
                    editing.nodes.length < 2 || !editing.targetGroupName
                  "
                  @click="handleTest(editing)"
                />
              </el-tooltip>
              <el-tooltip
                v-if="isExisting"
                :content="t('shared.actions.delete')"
                placement="top"
              >
                <el-button
                  circle
                  type="danger"
                  plain
                  :icon="Delete"
                  @click="handleDelete(editing.id)"
                />
              </el-tooltip>
            </div>
          </div>

          <section class="as-card">
            <label class="as-field">
              <span class="as-field__label">
                {{ t('proxies.page.autoSwitch.fields.name') }}
              </span>
              <el-input
                v-model="editing.name"
                :placeholder="t('proxies.page.autoSwitch.fields.name')"
              />
            </label>

            <label class="as-field">
              <span class="as-field__label">
                {{ t('proxies.page.autoSwitch.fields.targetGroup') }}
              </span>
              <el-select
                :model-value="editing.targetGroupName"
                class="as-field__full"
                :placeholder="t('proxies.page.autoSwitch.fields.targetGroup')"
                @change="handleTargetChange"
              >
                <el-option
                  v-for="group in selectableGroups"
                  :key="group.name"
                  :label="group.name"
                  :value="group.name"
                >
                  <span class="as-option">
                    <span class="as-option__name">{{ group.name }}</span>
                    <span class="as-option__type">{{ group.type }}</span>
                  </span>
                </el-option>
              </el-select>
            </label>

            <div class="as-toggle-row">
              <div class="as-toggle-row__copy">
                <div class="as-toggle-row__title">
                  {{ t('proxies.page.autoSwitch.fields.enabled') }}
                </div>
              </div>
              <el-switch v-model="editing.enabled" />
            </div>
          </section>

          <div class="as-grid">
            <section class="as-card">
              <div class="as-card__head">
                <div class="as-card__title">
                  {{ t('proxies.page.autoSwitch.fields.interval') }}
                </div>
                <div class="as-card__hint">
                  {{ t('proxies.page.autoSwitch.fields.intervalHint') }}
                </div>
              </div>
              <el-radio-group
                v-model="editing.intervalSeconds"
                class="as-presets"
              >
                <el-radio-button
                  v-for="seconds in INTERVAL_PRESETS"
                  :key="seconds"
                  :value="seconds"
                >
                  {{ formatInterval(seconds) }}
                </el-radio-button>
              </el-radio-group>
              <div class="as-number">
                <el-input-number
                  v-model="editing.intervalSeconds"
                  class="as-number__input"
                  :min="MIN_INTERVAL_SECONDS"
                  :max="MAX_INTERVAL_SECONDS"
                  :controls="false"
                  :placeholder="t('proxies.page.autoSwitch.fields.intervalCustom')"
                />
                <span class="as-number__unit">s</span>
              </div>
            </section>

            <section class="as-card">
              <div class="as-card__head">
                <div class="as-card__title">
                  {{ t('proxies.page.autoSwitch.fields.threshold') }}
                </div>
                <div class="as-card__hint">
                  {{ t('proxies.page.autoSwitch.fields.thresholdHint') }}
                </div>
              </div>
              <el-radio-group v-model="editing.thresholdMs" class="as-presets">
                <el-radio-button
                  v-for="ms in THRESHOLD_PRESETS"
                  :key="ms"
                  :value="ms"
                >
                  {{
                    ms === 0
                      ? t('proxies.page.autoSwitch.thresholdAlways')
                      : t('proxies.page.autoSwitch.thresholdMs', { count: ms })
                  }}
                </el-radio-button>
              </el-radio-group>
              <div class="as-number">
                <el-input-number
                  v-model="editing.thresholdMs"
                  class="as-number__input"
                  :min="MIN_THRESHOLD_MS"
                  :max="MAX_THRESHOLD_MS"
                  :controls="false"
                  :placeholder="
                    t('proxies.page.autoSwitch.fields.thresholdCustom')
                  "
                />
                <span class="as-number__unit">ms</span>
              </div>
            </section>
          </div>

          <section class="as-card as-card--nodes">
            <div class="as-card__toolbar">
              <div class="as-card__title">
                {{
                  t('proxies.page.autoSwitch.fields.nodes', {
                    count: editing.nodes.length,
                  })
                }}
              </div>
              <el-button
                v-if="editing.nodes.length"
                text
                size="small"
                @click="clearNodes"
              >
                {{ t('proxies.page.autoSwitch.clearNodes') }}
              </el-button>
            </div>

            <div v-if="editing.nodes.length" class="as-selected">
              <el-tag
                v-for="node in editing.nodes"
                :key="bindingKey(node)"
                size="small"
                effect="plain"
                round
                closable
                @close="removeNode(bindingKey(node))"
              >
                {{ node.name }}
              </el-tag>
            </div>

            <el-input
              v-model="nodeFilter"
              clearable
              :placeholder="t('proxies.page.autoSwitch.searchNodes')"
              :prefix-icon="Search"
            />

            <div class="as-nodes">
              <div
                v-if="!editing.targetGroupName"
                class="as-empty as-empty--compact"
              >
                {{ t('proxies.page.autoSwitch.pickTargetFirst') }}
              </div>
              <div
                v-else-if="filteredCandidates.length === 0"
                class="as-empty as-empty--compact"
              >
                {{ t('proxies.page.autoSwitch.noMatchingNodes') }}
              </div>
              <button
                v-for="node in filteredCandidates"
                :key="node.recordId"
                type="button"
                class="as-node"
                :class="{
                  'is-selected': selectedKeys.has(
                    bindingKey(toNodeBinding(node)),
                  ),
                }"
                @click="toggleNode(node)"
              >
                <el-checkbox
                  :model-value="
                    selectedKeys.has(bindingKey(toNodeBinding(node)))
                  "
                  tabindex="-1"
                />
                <span class="as-node__name">{{ node.name }}</span>
                <span class="as-node__type">{{ node.type }}</span>
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>

    <template #footer>
      <div class="as-footer">
        <el-button @click="close">{{ t('shared.actions.close') }}</el-button>
        <div v-if="editing" class="as-footer__actions">
          <el-button @click="editing = null">
            {{ t('shared.actions.cancel') }}
          </el-button>
          <el-button type="primary" @click="handleSave">
            {{ t('shared.actions.save') }}
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.as-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 18px 16px 20px;
  border-bottom: 1px solid var(--cx-divider, var(--divider-color, #e5e7eb));

  &__brand {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  &__icon {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    flex: none;
    border-radius: var(--cx-radius-md, 8px);
    color: var(--primary-main);
    background: color-mix(in srgb, var(--primary-main) 12%, transparent);
  }

  &__copy {
    min-width: 0;
  }

  &__title {
    font-size: var(--cx-font-lg, 16px);
    font-weight: 700;
    line-height: 1.25;
    color: var(--text-primary);
  }

  &__subtitle {
    margin-top: 2px;
    font-size: var(--cx-font-xs, 12px);
    line-height: 1.4;
    color: var(--text-secondary, #6b6f76);
  }

  &__right {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
    flex: none;
  }

  &__badge {
    max-width: 220px;
    padding: 4px 10px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary-main) 10%, transparent);
    color: var(--primary-main);
    font-size: 11px;
    font-weight: 600;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__close {
    color: var(--text-secondary, #6b6f76);
  }
}

.as-body {
  display: flex;
  flex: 1;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.as-sidebar {
  display: flex;
  flex-direction: column;
  width: 260px;
  flex: none;
  min-height: 0;
  border-right: 1px solid var(--cx-divider, var(--divider-color, #e5e7eb));
  background: color-mix(in srgb, var(--text-primary) 2.5%, var(--background-paper));

  &__top {
    flex: none;
    padding: 14px 12px 8px;
  }

  &__create {
    width: 100%;
  }

  &__list {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 4px 10px 12px;
  }
}

.as-group {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin: 0 0 6px;
  padding: 10px 10px 10px 12px;
  border: 1px solid transparent;
  border-radius: var(--cx-radius-md, 8px);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;

  &:hover {
    background: color-mix(in srgb, var(--text-primary) 4%, transparent);
  }

  &.is-selected {
    border-color: color-mix(in srgb, var(--primary-main) 30%, transparent);
    background: color-mix(in srgb, var(--primary-main) 8%, transparent);
  }

  &__dot {
    width: 8px;
    height: 8px;
    flex: none;
    border-radius: 50%;
    background: color-mix(in srgb, var(--text-primary) 22%, transparent);

    &.is-enabled {
      background: var(--el-color-success, #67c23a);
      box-shadow: 0 0 0 3px
        color-mix(in srgb, var(--el-color-success, #67c23a) 18%, transparent);
    }
  }

  &__content {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  &__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--cx-font-sm, 13px);
    font-weight: 650;
  }

  &__meta {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-secondary, #6b6f76);
    font-size: 11px;
  }
}

.as-editor {
  min-width: 0;
  min-height: 0;
  flex: 1;
  padding: 18px 20px;
  overflow: auto;
  background: color-mix(in srgb, var(--text-primary) 1.5%, var(--background-paper));
}

.as-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 100%;
  min-height: 320px;
  text-align: center;

  &__icon {
    display: grid;
    place-items: center;
    width: 64px;
    height: 64px;
    margin-bottom: 4px;
    border-radius: 18px;
    color: var(--primary-main);
    background: color-mix(in srgb, var(--primary-main) 10%, transparent);
  }

  &__title {
    font-size: 15px;
    font-weight: 700;
    color: var(--text-primary);
  }

  &__body {
    max-width: 360px;
    margin: 0 0 6px;
    color: var(--text-secondary, #6b6f76);
    font-size: var(--cx-font-sm, 13px);
    line-height: 1.6;
  }
}

.as-form {
  display: flex;
  flex-direction: column;
  gap: 14px;

  &__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  &__heading {
    font-size: 15px;
    font-weight: 700;
    color: var(--text-primary);
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
}

.as-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.as-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 15px;
  border: 1px solid var(--cx-divider, var(--divider-color, #e5e7eb));
  border-radius: var(--cx-radius-lg, 12px);
  background: var(--background-paper);

  &__head {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  &__title {
    font-size: var(--cx-font-sm, 13px);
    font-weight: 650;
    color: var(--text-primary);
  }

  &__hint {
    color: var(--text-secondary, #6b6f76);
    font-size: 12px;
    line-height: 1.45;
  }
}

.as-field {
  display: flex;
  flex-direction: column;
  gap: 6px;

  &__label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary, #6b6f76);
  }

  &__full {
    width: 100%;
  }
}

.as-option {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;

  &__name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__type {
    flex: none;
    color: var(--text-secondary, #6b6f76);
    font-size: 12px;
  }
}

.as-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--cx-radius-md, 8px);
  background: color-mix(in srgb, var(--text-primary) 3%, transparent);

  &__title {
    font-size: var(--cx-font-sm, 13px);
    font-weight: 650;
  }
}

.as-presets {
  display: flex;
  width: 100%;

  :deep(.el-radio-button) {
    flex: 1;
  }

  :deep(.el-radio-button__inner) {
    width: 100%;
    padding: 7px 4px;
    font-size: 12px;
  }
}

.as-number {
  position: relative;

  &__input {
    width: 100%;
  }

  &__unit {
    position: absolute;
    top: 50%;
    right: 12px;
    color: var(--text-secondary, #6b6f76);
    font-size: 12px;
    font-weight: 600;
    pointer-events: none;
    transform: translateY(-50%);
  }

  :deep(.el-input__inner) {
    padding-right: 34px;
  }
}

.as-selected {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.as-nodes {
  max-height: 240px;
  overflow: auto;
  padding: 4px;
  border: 1px solid var(--cx-divider, var(--divider-color, #e5e7eb));
  border-radius: var(--cx-radius-md, 8px);
  background: color-mix(in srgb, var(--text-primary) 2%, transparent);
}

.as-node {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin: 0;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--cx-radius-sm, 6px);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.14s ease;

  &:hover {
    background: color-mix(in srgb, var(--text-primary) 4%, transparent);
  }

  &.is-selected {
    background: color-mix(in srgb, var(--primary-main) 10%, transparent);
  }

  &__name {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--cx-font-sm, 13px);
    font-weight: 560;
  }

  &__type {
    flex: none;
    padding: 1px 6px;
    border-radius: var(--cx-radius-xs, 4px);
    background: color-mix(in srgb, var(--text-primary) 7%, transparent);
    color: var(--text-secondary, #6b6f76);
    font-size: 10px;
    font-weight: 600;
  }
}

.as-empty {
  padding: 28px 16px;
  color: var(--text-secondary, #6b6f76);
  font-size: var(--cx-font-sm, 13px);
  line-height: 1.5;
  text-align: center;

  &--compact {
    padding: 20px 12px;
  }
}

.as-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;

  &__actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }
}

@media (max-width: 760px) {
  .as-body {
    flex-direction: column;
  }

  .as-sidebar {
    width: auto;
    max-height: 200px;
    border-right: 0;
    border-bottom: 1px solid var(--cx-divider, var(--divider-color, #e5e7eb));
  }

  .as-grid {
    grid-template-columns: 1fr;
  }

  .as-header__badge {
    display: none;
  }
}
</style>

<!-- Dialog teleports to body; keep shell height/overflow styles unscoped. -->
<style lang="scss">
.auto-switch-dialog.el-dialog {
  display: flex;
  flex-direction: column;
  width: min(920px, 94vw);
  height: min(740px, calc(100vh - 96px));
  max-height: calc(100vh - 96px);
  padding: 0;
  border: 1px solid var(--cx-divider, var(--divider-color, #e5e7eb));
  border-radius: var(--cx-radius-lg, 12px);
  overflow: hidden;
  box-shadow: var(--el-box-shadow, 0 18px 48px rgba(15, 23, 42, 0.16));

  &.is-align-center {
    margin: auto;
  }

  .el-dialog__header {
    flex: none;
    padding: 0;
    margin: 0;
  }

  .el-dialog__body {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    padding: 0;
    overflow: hidden;
  }

  .el-dialog__footer {
    flex: none;
    padding: 12px 18px;
    border-top: 1px solid var(--cx-divider, var(--divider-color, #e5e7eb));
    background: color-mix(in srgb, var(--text-primary) 2%, var(--background-paper));
  }
}
</style>

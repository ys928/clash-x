<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import delayManager, { type DelayUpdate } from '@/services/delay'
import i18n from '@/services/i18n'
import {
  isInteractableMember,
  memberDetails,
  type ProxyGroupView,
  type ResolvedProxyMember,
} from '@/types/proxy-view'
import { classifyDelay } from '@/utils/delay'

const PRESET_NAMES = new Set([
  'DIRECT',
  'REJECT',
  'REJECT-DROP',
  'PASS',
  'COMPATIBLE',
])

const t = (key: string, options?: Record<string, unknown>) =>
  i18n.t(key as never, options) as string

const props = withDefaults(
  defineProps<{
    group: ProxyGroupView
    member: ResolvedProxyMember
    selected: boolean
    autoSwitchActive?: boolean
    showType?: boolean
    timeout?: number
  }>(),
  {
    autoSwitchActive: false,
    showType: true,
    timeout: 10000,
  },
)

const emit = defineEmits<{
  select: [member: ResolvedProxyMember]
}>()

const delayState = ref<DelayUpdate>({ delay: -1, updatedAt: 0 })

const name = computed(() => props.member.ref.name)
const unresolved = computed(() => props.member.kind === 'unresolved')
const details = computed(() => memberDetails(props.member))
const isPreset = computed(
  () => unresolved.value || PRESET_NAMES.has(name.value),
)
const typeLabel = computed(() =>
  unresolved.value
    ? props.member.kind === 'unresolved'
      ? props.member.ref.reason
      : ''
    : (details.value?.type ?? ''),
)
const nestedNow = computed(() =>
  props.member.kind === 'group' ? props.member.group.now : undefined,
)
const delayValue = computed(() => delayState.value.delay)
const showAutoSwitch = computed(
  () => !unresolved.value && props.selected && props.autoSwitchActive,
)

const delayText = computed(() =>
  delayManager.formatDelay(delayValue.value, props.timeout),
)

const delayTone = computed(() => {
  switch (classifyDelay(delayValue.value, props.timeout)) {
    case 'timeout':
    case 'error':
      return 'danger'
    case 'measured':
      if (delayValue.value >= 400) return 'warn'
      if (delayValue.value >= 250) return 'mid'
      return 'good'
    default:
      return 'muted'
  }
})

const syncDelay = () => {
  if (unresolved.value) {
    delayState.value = { delay: -1, updatedAt: 0 }
    return
  }
  const cached = delayManager.getDelayUpdate(name.value, props.group.name)
  if (cached) {
    delayState.value = { ...cached }
    return
  }
  const fallback = delayManager.getDelayFix(props.member, props.group.name)
  if (fallback === -1) {
    delayState.value = { delay: -1, updatedAt: 0 }
    return
  }
  const history = details.value?.history
  let updatedAt = 0
  if (history && history.length > 0) {
    const parsed = Date.parse(history[history.length - 1].time)
    if (!Number.isNaN(parsed)) updatedAt = parsed
  }
  delayState.value = { delay: fallback, updatedAt }
}

watch(
  () => [name.value, props.group.name, props.member, isPreset.value] as const,
  ([, , , preset], _, onCleanup) => {
    if (preset) return
    const listener = (update: DelayUpdate) => {
      delayState.value = { ...update }
    }
    delayManager.setListener(name.value, props.group.name, listener)
    onCleanup(() => delayManager.removeListener(name.value, props.group.name))
  },
  { immediate: true },
)

watch(
  () => [props.member, props.group.name, details.value?.history] as const,
  () => syncDelay(),
  { immediate: true },
)

onMounted(syncDelay)
onUnmounted(() => {
  if (!isPreset.value) {
    delayManager.removeListener(name.value, props.group.name)
  }
})

const onSelect = () => {
  if (unresolved.value) return
  emit('select', props.member)
}

const onCheckDelay = async (event: Event) => {
  event.preventDefault()
  event.stopPropagation()
  if (!isInteractableMember(props.member)) return
  delayState.value = { delay: -2, updatedAt: Date.now() }
  delayState.value = await delayManager.checkDelay(
    props.member,
    props.group.name,
    props.timeout,
  )
}
</script>

<template>
  <button
    type="button"
    class="proxy-node"
    :class="{
      'is-selected': selected && !unresolved,
      'is-disabled': unresolved,
      'is-auto': showAutoSwitch,
    }"
    :disabled="unresolved"
    :title="name"
    @click="onSelect"
  >
    <div class="proxy-node__body">
      <div class="proxy-node__name">
        {{ name }}
        <span v-if="showType && nestedNow" class="proxy-node__now">
          — {{ nestedNow }}
        </span>
      </div>
      <div v-if="showType" class="proxy-node__meta">
        <span v-if="typeLabel" class="proxy-node__chip">{{ typeLabel }}</span>
        <span v-if="details?.udp" class="proxy-node__chip">UDP</span>
        <span v-if="details?.xudp" class="proxy-node__chip">XUDP</span>
        <span v-if="details?.tfo" class="proxy-node__chip">TFO</span>
        <span v-if="details?.mptcp" class="proxy-node__chip">MPTCP</span>
        <span v-if="details?.smux" class="proxy-node__chip">SMUX</span>
      </div>
    </div>

    <div v-if="!isPreset" class="proxy-node__side">
      <span
        v-if="showAutoSwitch"
        class="proxy-node__auto"
        :title="t('proxies.page.autoSwitch.nodeManaged')"
      >
        ⇄
      </span>
      <span v-if="delayValue === -2" class="proxy-node__delay is-loading">…</span>
      <button
        v-else-if="delayValue > 0"
        type="button"
        class="proxy-node__delay"
        :class="`is-${delayTone}`"
        @click="onCheckDelay"
      >
        {{ delayText }}
      </button>
      <button
        v-else
        type="button"
        class="proxy-node__check"
        @click="onCheckDelay"
      >
        {{ t('shared.actions.check') }}
      </button>
    </div>
  </button>
</template>

<style scoped lang="scss">
.proxy-node {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 68px;
  padding: 14px 16px;
  text-align: left;
  border-radius: var(--cx-radius-lg, 12px);
  border: 1px solid color-mix(in srgb, var(--text-primary) 10%, transparent);
  background: var(--background-paper);
  color: var(--text-primary);
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    box-shadow 0.15s ease;

  &:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--primary-main) 40%, transparent);
    background: color-mix(in srgb, var(--primary-main) 6%, var(--background-paper));
  }

  &.is-selected {
    border-color: color-mix(in srgb, var(--primary-main) 55%, transparent);
    background: color-mix(in srgb, var(--primary-main) 12%, var(--background-paper));
    box-shadow: inset 3px 0 0 var(--primary-main);
  }

  &.is-auto {
    box-shadow:
      inset 3px 0 0 var(--primary-main),
      inset 0 0 0 1px color-mix(in srgb, var(--primary-main) 28%, transparent);
  }

  &.is-disabled {
    opacity: 0.55;
    cursor: default;
  }

  &__body {
    flex: 1;
    min-width: 0;
  }

  &__name {
    font-size: 14px;
    font-weight: 600;
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__now {
    font-weight: 500;
    color: var(--text-secondary, #6b6f76);
  }

  &__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 6px;
  }

  &__chip {
    display: inline-block;
    padding: 0 4px;
    border-radius: var(--cx-radius-xs, 4px);
    border: 1px solid color-mix(in srgb, var(--text-primary) 18%, transparent);
    color: color-mix(in srgb, var(--text-primary) 45%, transparent);
    font-size: 10px;
    line-height: 1.35;
  }

  &__side {
    flex: none;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  &__auto {
    font-size: 13px;
    opacity: 0.85;
    color: var(--primary-main);
  }

  &__delay,
  &__check {
    appearance: none;
    border: 0;
    background: transparent;
    padding: 3px 6px;
    border-radius: var(--cx-radius-xs, 4px);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    color: var(--text-secondary, #6b6f76);

    &:hover {
      background: color-mix(in srgb, var(--primary-main) 14%, transparent);
    }

    &.is-loading {
      cursor: default;
    }

    &.is-good {
      color: #2e7d32;
    }

    &.is-mid {
      color: var(--primary-main);
    }

    &.is-warn {
      color: #ed6c02;
    }

    &.is-danger {
      color: #d32f2f;
    }
  }

  &__check {
    opacity: 0;
  }

  &:hover &__check {
    opacity: 1;
  }
}
</style>

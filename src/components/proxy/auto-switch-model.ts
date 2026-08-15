import type { ProxyNodeBinding, ProxyNodeView } from '@/types/proxy-view'
import { classifyDelay, DEFAULT_DELAY_TIMEOUT } from '@/utils/delay'

export const AUTO_SWITCH_STORAGE_KEY = 'clash-verge-auto-switch-groups'

export const DEFAULT_INTERVAL_SECONDS = 60
export const DEFAULT_THRESHOLD_MS = 50
export const MIN_INTERVAL_SECONDS = 15
export const MAX_INTERVAL_SECONDS = 3600
export const MIN_THRESHOLD_MS = 0
export const MAX_THRESHOLD_MS = 5000

export interface AutoSwitchGroup {
  id: string
  name: string
  /** Clash proxy group to select within (Selector / URLTest / Fallback). */
  targetGroupName: string
  nodes: ProxyNodeBinding[]
  enabled: boolean
  /** How often to re-test the curated set. */
  intervalSeconds: number
  /**
   * Switch when the best node is at least this many ms faster than the current one.
   * `0` means always prefer the lowest-latency node after each test.
   */
  thresholdMs: number
}

export interface AutoSwitchDecisionInput {
  currentName: string | undefined
  results: ReadonlyArray<{ name: string; delay: number }>
  thresholdMs: number
  timeout?: number
}

export type AutoSwitchDecision =
  | { action: 'keep' }
  | {
      action: 'switch'
      name: string
      bestDelay: number
      currentDelay: number | null
    }

const isValidBinding = (value: unknown): value is ProxyNodeBinding => {
  if (!value || typeof value !== 'object') return false
  const binding = value as ProxyNodeBinding
  return typeof binding.name === 'string' && binding.name.length > 0
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export const createAutoSwitchGroupId = () =>
  `asg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

export const createEmptyAutoSwitchGroup = (
  partial?: Partial<AutoSwitchGroup>,
): AutoSwitchGroup => ({
  id: createAutoSwitchGroupId(),
  name: '',
  targetGroupName: '',
  nodes: [],
  enabled: false,
  intervalSeconds: DEFAULT_INTERVAL_SECONDS,
  thresholdMs: DEFAULT_THRESHOLD_MS,
  ...partial,
})

export function normalizeAutoSwitchGroup(
  value: unknown,
): AutoSwitchGroup | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<AutoSwitchGroup>
  if (typeof raw.id !== 'string' || !raw.id) return null
  if (typeof raw.name !== 'string') return null
  if (typeof raw.targetGroupName !== 'string') return null
  if (!Array.isArray(raw.nodes)) return null

  const nodes = raw.nodes.filter(isValidBinding).map((node) => ({
    name: node.name,
    source: node.source,
  }))

  const intervalSeconds = clamp(
    typeof raw.intervalSeconds === 'number' &&
      Number.isFinite(raw.intervalSeconds)
      ? Math.round(raw.intervalSeconds)
      : DEFAULT_INTERVAL_SECONDS,
    MIN_INTERVAL_SECONDS,
    MAX_INTERVAL_SECONDS,
  )

  const thresholdMs = clamp(
    typeof raw.thresholdMs === 'number' && Number.isFinite(raw.thresholdMs)
      ? Math.round(raw.thresholdMs)
      : DEFAULT_THRESHOLD_MS,
    MIN_THRESHOLD_MS,
    MAX_THRESHOLD_MS,
  )

  return {
    id: raw.id,
    name: raw.name.trim() || 'Untitled',
    targetGroupName: raw.targetGroupName,
    nodes,
    enabled: Boolean(raw.enabled),
    intervalSeconds,
    thresholdMs,
  }
}

export function loadAutoSwitchGroups(): AutoSwitchGroup[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(AUTO_SWITCH_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(normalizeAutoSwitchGroup)
      .filter((group): group is AutoSwitchGroup => group !== null)
  } catch {
    return []
  }
}

export function saveAutoSwitchGroups(groups: AutoSwitchGroup[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(AUTO_SWITCH_STORAGE_KEY, JSON.stringify(groups))
  } catch {
    // ignore quota / private mode
  }
}

export function bindingKey(binding: ProxyNodeBinding) {
  if (!binding.source) return binding.name
  if (binding.source.kind === 'core') {
    return `${binding.name}::core::${binding.source.proxyName}`
  }
  return `${binding.name}::provider::${binding.source.providerName}::${binding.source.proxyName}`
}

export function toNodeBinding(node: ProxyNodeView): ProxyNodeBinding {
  return { name: node.name, source: node.source }
}

/**
 * Pick whether to keep the current node or switch after a curated-set delay test.
 *
 * Only real latency measurements count. Timeouts / errors never win.
 * If the current node is outside the set or failed, switch to the best measured node.
 */
export function decideAutoSwitch(
  input: AutoSwitchDecisionInput,
): AutoSwitchDecision {
  const timeout = input.timeout ?? DEFAULT_DELAY_TIMEOUT
  const measured = input.results
    .filter(({ delay }) => classifyDelay(delay, timeout) === 'measured')
    .slice()
    .sort((a, b) => a.delay - b.delay)

  if (measured.length === 0) return { action: 'keep' }

  const best = measured[0]
  const current = input.currentName
    ? measured.find(({ name }) => name === input.currentName)
    : undefined

  if (!current) {
    if (best.name === input.currentName) return { action: 'keep' }
    return {
      action: 'switch',
      name: best.name,
      bestDelay: best.delay,
      currentDelay: null,
    }
  }

  if (best.name === current.name) return { action: 'keep' }

  const improvement = current.delay - best.delay
  if (improvement < input.thresholdMs) return { action: 'keep' }

  return {
    action: 'switch',
    name: best.name,
    bestDelay: best.delay,
    currentDelay: current.delay,
  }
}

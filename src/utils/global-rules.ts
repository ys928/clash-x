import { dump } from 'js-yaml'

import { readProfileFile, saveProfileFile } from '@/services/cmds'
import { parseYamlSafe } from '@/utils/yaml'

export type GlobalRulesSeq = {
  prepend: string[]
  append: string[]
  delete: string[]
}

export const emptyGlobalRulesSeq = (): GlobalRulesSeq => ({
  prepend: [],
  append: [],
  delete: [],
})

export const normalizeRuleRaw = (raw: string) => {
  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.at(-1)?.toLowerCase() === 'no-resolve') parts.pop()
  if (parts.length === 0) return ''

  parts[0] = parts[0].toUpperCase()
  if (
    parts.length > 1 &&
    ['DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD'].includes(parts[0])
  ) {
    parts[1] = parts[1].toLowerCase()
  }
  if (parts.length > 2) {
    parts[parts.length - 1] = parts[parts.length - 1].toUpperCase()
  }
  return parts.join(',')
}

export const dedupeRuleRaws = (rawRules: string[]) => {
  const seen = new Set<string>()
  return rawRules.filter((raw) => {
    const key = normalizeRuleRaw(raw)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export const parseGlobalRule = (raw: string) => {
  const parts = normalizeRuleRaw(raw).split(',')
  if (parts.length < 2) return null

  const type = parts[0]
  const proxy = parts.at(-1) ?? ''
  const payload = type === 'MATCH' ? undefined : parts.slice(1, -1).join(',')
  return { type, payload, proxy }
}

export const runtimeRuleKey = (
  type: string,
  payload: string | undefined,
  proxy: string | undefined,
) => {
  const raw =
    type === 'MATCH' || !payload
      ? `${type},${proxy ?? ''}`
      : `${type},${payload},${proxy ?? ''}`
  return normalizeRuleRaw(raw)
}

export const globalRuleKeySet = (seq: GlobalRulesSeq) => {
  const keys = new Set<string>()
  for (const raw of [...seq.prepend, ...seq.append]) {
    const key = normalizeRuleRaw(raw)
    if (key) keys.add(key)
  }
  return keys
}

export async function loadGlobalRulesSeq(): Promise<GlobalRulesSeq> {
  try {
    const data = await readProfileFile('Rules')
    const obj = parseYamlSafe(data) as
      | Partial<GlobalRulesSeq>
      | null
      | undefined
    if (!obj || typeof obj !== 'object') return emptyGlobalRulesSeq()

    return {
      prepend: Array.isArray(obj.prepend) ? obj.prepend.map(String) : [],
      append: Array.isArray(obj.append) ? obj.append.map(String) : [],
      delete: Array.isArray(obj.delete) ? obj.delete.map(String) : [],
    }
  } catch {
    return emptyGlobalRulesSeq()
  }
}

const serializeGlobalRulesSeq = (seq: GlobalRulesSeq) =>
  dump(
    {
      prepend: seq.prepend,
      append: seq.append,
      delete: seq.delete,
    },
    { forceQuotes: true },
  )

export async function addGlobalRule(
  raw: string,
  position: 'prepend' | 'append',
): Promise<'added' | 'duplicate' | 'invalid'> {
  const seq = await loadGlobalRulesSeq()
  if (globalRuleKeySet(seq).has(normalizeRuleRaw(raw))) {
    return 'duplicate'
  }

  const next: GlobalRulesSeq =
    position === 'prepend'
      ? { ...seq, prepend: [raw, ...seq.prepend] }
      : { ...seq, append: [...seq.append, raw] }

  const saved = await saveProfileFile('Rules', serializeGlobalRulesSeq(next))
  return saved ? 'added' : 'invalid'
}

export async function addGlobalRules(
  rawRules: string[],
  position: 'prepend' | 'append' = 'prepend',
): Promise<'added' | 'noop' | 'invalid'> {
  const seq = await loadGlobalRulesSeq()
  const existing = globalRuleKeySet(seq)
  const toAdd = dedupeRuleRaws(rawRules).filter(
    (raw) => !existing.has(normalizeRuleRaw(raw)),
  )
  if (toAdd.length === 0) return 'noop'

  const next: GlobalRulesSeq =
    position === 'prepend'
      ? { ...seq, prepend: [...toAdd, ...seq.prepend] }
      : { ...seq, append: [...seq.append, ...toAdd] }

  const saved = await saveProfileFile('Rules', serializeGlobalRulesSeq(next))
  return saved ? 'added' : 'invalid'
}

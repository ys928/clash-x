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

const normalizeRuleRaw = (raw: string) => raw.replace(/,no-resolve$/i, '')

export const runtimeRuleKey = (
  type: string,
  payload: string | undefined,
  proxy: string | undefined,
) => {
  const policy = proxy ?? ''
  if (type === 'MATCH' || !payload) return `${type},${policy}`
  return `${type},${payload},${policy}`
}

export const globalRuleKeySet = (seq: GlobalRulesSeq) => {
  const keys = new Set<string>()
  for (const raw of [...seq.prepend, ...seq.append]) {
    keys.add(normalizeRuleRaw(raw))
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
  if (seq.prepend.includes(raw) || seq.append.includes(raw)) {
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
  const existing = new Set([...seq.prepend, ...seq.append])
  const toAdd = rawRules.filter((raw) => !existing.has(raw))
  if (toAdd.length === 0) return 'noop'

  const next: GlobalRulesSeq =
    position === 'prepend'
      ? { ...seq, prepend: [...toAdd, ...seq.prepend] }
      : { ...seq, append: [...seq.append, ...toAdd] }

  const saved = await saveProfileFile('Rules', serializeGlobalRulesSeq(next))
  return saved ? 'added' : 'invalid'
}

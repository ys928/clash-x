import { describe, expect, it } from 'vitest'

import {
  dedupeRuleRaws,
  globalRuleKeySet,
  normalizeRuleRaw,
  parseGlobalRule,
  runtimeRuleKey,
} from './global-rules'

describe('global rule normalization', () => {
  it('normalizes whitespace, case, and no-resolve consistently', () => {
    expect(normalizeRuleRaw(' domain-suffix, LOCAL, direct, no-resolve ')).toBe(
      'DOMAIN-SUFFIX,local,DIRECT',
    )
    expect(runtimeRuleKey('DOMAIN-SUFFIX', 'local', 'DIRECT')).toBe(
      'DOMAIN-SUFFIX,local,DIRECT',
    )
  })

  it('deduplicates equivalent rules while preserving the first raw value', () => {
    expect(
      dedupeRuleRaws([
        'DOMAIN-SUFFIX,local,DIRECT',
        'domain-suffix, LOCAL, direct, no-resolve',
        'DOMAIN,device.local,DIRECT',
      ]),
    ).toEqual(['DOMAIN-SUFFIX,local,DIRECT', 'DOMAIN,device.local,DIRECT'])
  })

  it('matches runtime rules against normalized global rules', () => {
    const keys = globalRuleKeySet({
      prepend: ['domain-suffix, LOCAL, direct, no-resolve'],
      append: [],
      delete: [],
    })

    expect(keys.has(runtimeRuleKey('DOMAIN-SUFFIX', 'local', 'DIRECT'))).toBe(
      true,
    )
  })

  it('parses global rules for direct display', () => {
    expect(parseGlobalRule('DOMAIN-SUFFIX,local,DIRECT')).toEqual({
      type: 'DOMAIN-SUFFIX',
      payload: 'local',
      proxy: 'DIRECT',
    })
    expect(parseGlobalRule('MATCH,PROXY')).toEqual({
      type: 'MATCH',
      payload: undefined,
      proxy: 'PROXY',
    })
  })
})

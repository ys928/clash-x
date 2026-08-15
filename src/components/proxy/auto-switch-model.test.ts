import { describe, expect, test } from 'vitest'

import { decideAutoSwitch } from './auto-switch-model'

describe('decideAutoSwitch', () => {
  test('keeps current when improvement is below threshold', () => {
    expect(
      decideAutoSwitch({
        currentName: 'a',
        thresholdMs: 50,
        results: [
          { name: 'a', delay: 120 },
          { name: 'b', delay: 90 },
        ],
      }),
    ).toEqual({ action: 'keep' })
  })

  test('switches when improvement meets threshold', () => {
    expect(
      decideAutoSwitch({
        currentName: 'a',
        thresholdMs: 50,
        results: [
          { name: 'a', delay: 160 },
          { name: 'b', delay: 90 },
        ],
      }),
    ).toEqual({
      action: 'switch',
      name: 'b',
      bestDelay: 90,
      currentDelay: 160,
    })
  })

  test('switches when current is outside the curated set', () => {
    expect(
      decideAutoSwitch({
        currentName: 'outside',
        thresholdMs: 50,
        results: [
          { name: 'a', delay: 140 },
          { name: 'b', delay: 80 },
        ],
      }),
    ).toEqual({
      action: 'switch',
      name: 'b',
      bestDelay: 80,
      currentDelay: null,
    })
  })

  test('ignores timeouts and errors when picking the best', () => {
    expect(
      decideAutoSwitch({
        currentName: 'a',
        thresholdMs: 0,
        results: [
          { name: 'a', delay: 200 },
          { name: 'dead', delay: 0 },
          { name: 'err', delay: 1e6 },
          { name: 'b', delay: 110 },
        ],
      }),
    ).toEqual({
      action: 'switch',
      name: 'b',
      bestDelay: 110,
      currentDelay: 200,
    })
  })

  test('keeps when no measured results exist', () => {
    expect(
      decideAutoSwitch({
        currentName: 'a',
        thresholdMs: 0,
        results: [
          { name: 'a', delay: 0 },
          { name: 'b', delay: 1e6 },
        ],
      }),
    ).toEqual({ action: 'keep' })
  })

  test('threshold zero always prefers the lowest measured delay', () => {
    expect(
      decideAutoSwitch({
        currentName: 'a',
        thresholdMs: 0,
        results: [
          { name: 'a', delay: 101 },
          { name: 'b', delay: 100 },
        ],
      }),
    ).toEqual({
      action: 'switch',
      name: 'b',
      bestDelay: 100,
      currentDelay: 101,
    })
  })
})

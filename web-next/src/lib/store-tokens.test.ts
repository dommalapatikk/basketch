import { describe, expect, it } from 'vitest'

import { STORE_DISPLAY_ORDER, STORE_KEYS, type StoreKey } from './store-tokens'

describe('STORE_DISPLAY_ORDER', () => {
  // Spec v2.1 §D.5 — store chips render in this exact order regardless of
  // filter state. Prevents accidental reordering via STORE_KEYS shuffling
  // (which would also shift URL meaning) or via accidental sorting on count.
  it('matches the spec-mandated chip order: Migros, Coop, LIDL, ALDI, Denner, SPAR, Volg', () => {
    expect([...STORE_DISPLAY_ORDER]).toEqual([
      'migros',
      'coop',
      'lidl',
      'aldi',
      'denner',
      'spar',
      'volg',
    ] satisfies StoreKey[])
  })

  it('contains every store key exactly once (no drift vs STORE_KEYS membership)', () => {
    const display = new Set<string>(STORE_DISPLAY_ORDER)
    const canonical = new Set<string>(STORE_KEYS)
    expect(display.size).toBe(STORE_DISPLAY_ORDER.length)
    expect(display).toEqual(canonical)
  })
})

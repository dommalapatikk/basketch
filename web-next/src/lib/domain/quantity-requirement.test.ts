import { describe, expect, it } from 'vitest'

import { isMultiBuy } from './quantity-requirement'

describe('isMultiBuy (D2, TP-7a)', () => {
  it('is true for a genuine multi-buy minimum', () => {
    expect(isMultiBuy(2)).toBe(true)
    expect(isMultiBuy(3)).toBe(true)
  })

  it('is false for the ordinary single-item price (null)', () => {
    // NULL is how the database, and lib/types.ts's Deal, represent "no
    // quantity condition was printed" — the same reasoning as the ALDI rule.
    expect(isMultiBuy(null)).toBe(false)
  })

  it('is false when the field is absent — a ListItem saved before WP-W4', () => {
    // stores/list-store.ts: an item added before this field existed
    // rehydrates with the key simply missing, not null.
    expect(isMultiBuy(undefined)).toBe(false)
  })

  it('is false for a value below the printable minimum', () => {
    // The DB CHECK constraint (deals_min_quantity_at_least_two) should make
    // this unreachable, but the predicate itself claims nothing it cannot
    // support — "ab 1 Stück" is not a real printed form (the WP-C4 ADR).
    expect(isMultiBuy(1)).toBe(false)
    expect(isMultiBuy(0)).toBe(false)
  })
})

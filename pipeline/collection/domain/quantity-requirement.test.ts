import { describe, expect, it } from 'vitest'

import {
  SINGLE_ITEM,
  describeQuantityRequirement,
  isMinimumQuantity,
  minimumQuantity,
} from './quantity-requirement'
import { isOk, unwrap } from './result'

describe('QuantityRequirement — the invariant: a minimum below 2 cannot be constructed', () => {
  it('rejects a minimum of 1 — that is just the single-item price, not a real "ab 1 Stück" form', () => {
    expect(isOk(minimumQuantity(1))).toBe(false)
  })

  it('rejects a minimum of 0 and negative counts', () => {
    expect(isOk(minimumQuantity(0))).toBe(false)
    expect(isOk(minimumQuantity(-2))).toBe(false)
  })

  it('rejects a non-integer count', () => {
    expect(isOk(minimumQuantity(2.5))).toBe(false)
  })

  it('accepts 2 — the "ab 2 Stück" form actually printed on the fixture', () => {
    const q = unwrap(minimumQuantity(2))
    expect(q).toEqual({ kind: 'minimum', count: 2 })
  })

  it('accepts a stated minimum above 2 — the count is read from the label, never hardcoded', () => {
    const q = unwrap(minimumQuantity(3))
    expect(q).toEqual({ kind: 'minimum', count: 3 })
  })
})

describe('QuantityRequirement — identification', () => {
  it('SINGLE_ITEM is not a minimum-quantity requirement', () => {
    expect(isMinimumQuantity(SINGLE_ITEM)).toBe(false)
  })

  it('a constructed minimum is recognised as one', () => {
    expect(isMinimumQuantity(unwrap(minimumQuantity(2)))).toBe(true)
  })
})

describe('QuantityRequirement — the display label: a conditional price never renders bare (TP-7a)', () => {
  it('a single-item requirement has no label', () => {
    expect(describeQuantityRequirement(SINGLE_ITEM)).toBe('')
  })

  it('a minimum of 2 reads "from 2 items"', () => {
    expect(describeQuantityRequirement(unwrap(minimumQuantity(2)))).toBe('from 2 items')
  })

  it('a minimum of 3 reads "from 3 items" — the label states what was actually printed', () => {
    expect(describeQuantityRequirement(unwrap(minimumQuantity(3)))).toBe('from 3 items')
  })
})

import { describe, expect, it } from 'vitest'

import { createMoney } from './money'
import { collectedWithYieldCheck, collectionFailed } from './offer-source'
import { createOffer } from './offer'
import { unwrap } from './result'
import { createValidityPeriod } from './validity-period'

const WEEK = unwrap(createValidityPeriod('2026-09-03', '2026-09-09'))

const makeOffers = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    unwrap(
      createOffer({
        retailer: 'coop',
        productName: `Product ${i}`,
        salePrice: unwrap(createMoney(1.95)),
        originalPrice: unwrap(createMoney(2.7)),
        validity: WEEK,
      }),
    ),
  )

const coop = { retailer: 'coop' as const, expectedMinimumOffers: 100 }

describe('CollectionResult — empty is not success', () => {
  it('treats zero parsed offers as source-changed, not a clean run', () => {
    // This is the exact failure mode that hid the categorisation bug for months.
    const r = collectedWithYieldCheck(coop, [])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('source-changed')
  })

  it('flags a suspiciously short run as below-expected-yield', () => {
    const r = collectedWithYieldCheck(coop, makeOffers(3))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('below-expected-yield')
      expect(r.detail).toContain('expected at least 100')
    }
  })

  it('accepts a healthy run', () => {
    const r = collectedWithYieldCheck(coop, makeOffers(180))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.offers).toHaveLength(180)
      expect(r.warnings).toEqual([])
    }
  })

  it('accepts exactly the minimum', () => {
    expect(collectedWithYieldCheck(coop, makeOffers(100)).ok).toBe(true)
  })

  it('carries warnings on an otherwise successful run', () => {
    const r = collectedWithYieldCheck(coop, makeOffers(150), [{ message: 'no price found', item: 'page 12 tile 3' }])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.warnings).toHaveLength(1)
  })

  it('records an unreachable source distinctly from a broken parse', () => {
    const r = collectionFailed('coop', 'source-unavailable', 'HTTP 503')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('source-unavailable')
  })
})

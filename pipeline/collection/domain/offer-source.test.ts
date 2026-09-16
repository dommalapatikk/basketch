import { describe, expect, it } from 'vitest'

import { createMoney } from './money'
import { DISPLAY_TRUNCATED_NAME_DEGRADED_SHARE, collected, collectedWithYieldCheck, collectionFailed } from './offer-source'
import { createOffer } from './offer'
import { unwrap } from './result'
import { createValidityPeriod } from './validity-period'

const WEEK = unwrap(createValidityPeriod('2026-09-03', '2026-09-09'))

const makeOffer = (name: string) =>
  unwrap(
    createOffer({
      retailer: 'coop',
      productName: name,
      salePrice: unwrap(createMoney(1.95)),
      originalPrice: unwrap(createMoney(2.7)),
      validity: WEEK,
    }),
  )

const makeOffers = (n: number) => Array.from({ length: n }, (_, i) => makeOffer(`Product ${i}`))

const makeOffersWithTruncated = (total: number, truncatedCount: number) => [
  ...Array.from({ length: truncatedCount }, (_, i) => makeOffer(`Truncated Product ${i}...`)),
  ...Array.from({ length: total - truncatedCount }, (_, i) => makeOffer(`Product ${i}`)),
]

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

describe('CollectionResult — degraded by display-truncated names (WP-C3 / HANDOVER item 8)', () => {
  it('a source serving >5% truncated names is degraded', () => {
    // 274 of 923 live Coop deals (29.7%) ended in "..." — the real ratio this
    // guard exists for.
    const r = collected('coop', makeOffersWithTruncated(100, 6))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.degraded).toBe(true)
  })

  it('exactly the threshold share is not yet degraded', () => {
    expect(DISPLAY_TRUNCATED_NAME_DEGRADED_SHARE).toBe(0.05)
    const r = collected('coop', makeOffersWithTruncated(100, 5))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.degraded).toBe(false)
  })

  it('a healthy run with no truncated names is not degraded', () => {
    const r = collected('coop', makeOffers(100))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.degraded).toBe(false)
  })

  it('collectedWithYieldCheck carries the degraded flag through, same as warnings', () => {
    const r = collectedWithYieldCheck(coop, makeOffersWithTruncated(120, 20))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.degraded).toBe(true)
  })
})

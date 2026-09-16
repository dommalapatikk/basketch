import { describe, expect, it } from 'vitest'

import { votesInVerdict } from './votes-in-verdict'

const TODAY = '2026-04-27'

const votable = (over: Partial<Parameters<typeof votesInVerdict>[0]> = {}) => ({
  isUncertain: false,
  priceBasis: { kind: 'everyone' as const },
  validFrom: '2026-04-24',
  validTo: '2026-05-01',
  ...over,
})

describe('votesInVerdict — the single "listed but does not vote" rule (D2)', () => {
  it('votes when in effect, open-priced and confidently categorised', () => {
    expect(votesInVerdict(votable(), TODAY)).toBe(true)
  })

  it('does not vote when the classifier was not confident', () => {
    expect(votesInVerdict(votable({ isUncertain: true }), TODAY)).toBe(false)
  })

  it('does not vote when the price is member-only', () => {
    const deal = votable({ priceBasis: { kind: 'member-only', programme: 'Lidl Plus' } })
    expect(votesInVerdict(deal, TODAY)).toBe(false)
  })

  it('does not vote when the deal has not started yet', () => {
    const deal = votable({ validFrom: '2026-05-01', validTo: '2026-05-07' })
    expect(votesInVerdict(deal, TODAY)).toBe(false)
  })

  it('does not vote once the deal has expired', () => {
    const deal = votable({ validFrom: '2026-04-01', validTo: '2026-04-10' })
    expect(votesInVerdict(deal, TODAY)).toBe(false)
  })

  it('does not vote when the price requires buying 2 or more items (D2, TP-7a)', () => {
    const deal = votable({ minQuantity: 2 })
    expect(votesInVerdict(deal, TODAY)).toBe(false)
  })

  it('votes normally when minQuantity is absent — a Votable built before WP-W4', () => {
    const deal = votable({ minQuantity: undefined })
    expect(votesInVerdict(deal, TODAY)).toBe(true)
  })
})

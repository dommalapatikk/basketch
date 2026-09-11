import { describe, expect, it } from 'vitest'
import { createMoney } from '../domain/money'
import { type Offer, createOffer } from '../domain/offer'
import { cropRegionImage, sourceUrlImage } from '../domain/product-image'
import { unwrap } from '../domain/result'
import {
  type LegacyCount,
  compareCollection,
  formatComparison,
  readCollectionMode,
  safeToCutOver,
} from './collection-mode'
import { createSourceAttributes } from '../domain/source-attributes'
import { createValidityPeriod } from '../domain/validity-period'

const WEEK = unwrap(createValidityPeriod('2026-09-10', '2026-09-16'))

const offer = (retailer: Offer['retailer'], over: Record<string, unknown> = {}): Offer =>
  unwrap(
    createOffer({
      retailer,
      productName: `p-${Math.random()}`,
      salePrice: unwrap(createMoney(1.5)),
      validity: WEEK,
      ...over,
    }),
  )

describe('readCollectionMode — off is the safe default', () => {
  it('defaults to off when unset', () => {
    expect(readCollectionMode({})).toBe('off')
  })

  it('defaults to off for anything unrecognised', () => {
    // A typo must never silently enable a live cutover.
    expect(readCollectionMode({ COLLECTION_MODE: 'liv' })).toBe('off')
    expect(readCollectionMode({ COLLECTION_MODE: 'true' })).toBe('off')
  })

  it('reads shadow and live', () => {
    expect(readCollectionMode({ COLLECTION_MODE: 'shadow' })).toBe('shadow')
    expect(readCollectionMode({ COLLECTION_MODE: 'LIVE' })).toBe('live')
    expect(readCollectionMode({ COLLECTION_MODE: ' shadow ' })).toBe('shadow')
  })
})

describe('comparing the two paths', () => {
  const legacy: LegacyCount[] = [
    { retailer: 'denner', count: 280 },
    { retailer: 'coop', count: 950 },
    { retailer: 'lidl', count: 200 },
  ]

  it('reports the delta per retailer', () => {
    const c = compareCollection(legacy, [offer('denner'), offer('denner'), offer('coop')])
    const denner = c.find((x) => x.retailer === 'denner')
    expect(denner?.legacy).toBe(280)
    expect(denner?.collected).toBe(2)
    expect(denner?.delta).toBe(-278)
  })

  it('counts flyer crops the legacy path never had', () => {
    const image = unwrap(cropRegionImage({ pageImageUrl: 'https://x.test/p.jpg', x: 0, y: 0, width: 1, height: 1 }))
    const c = compareCollection([], [offer('spar', { image }), offer('spar', { image })])
    const spar = c.find((x) => x.retailer === 'spar')
    expect(spar?.withCropRegions).toBe(2)
    expect(spar?.note).toContain('flyer crops')
  })

  it('does not count a source url as a crop', () => {
    const image = unwrap(sourceUrlImage('https://x.test/a.jpg'))
    const c = compareCollection([], [offer('denner', { image })])
    expect(c[0]?.withImages).toBe(1)
    expect(c[0]?.withCropRegions).toBe(0)
  })

  it('flags member-only prices as a FEATURE, not a regression', () => {
    // Lidl's filter dropping offers is the point: those are member prices, and
    // publishing them as normal ones is the Art. 3(1)(e) UWG exposure.
    const c = compareCollection(legacy, [
      offer('lidl', { priceBasis: { kind: 'member-only', programme: 'Lidl Plus' } }),
    ])
    const lidl = c.find((x) => x.retailer === 'lidl')
    expect(lidl?.memberOnly).toBe(1)
    expect(lidl?.note).toContain('member-only prices flagged')
  })

  it('counts offers carrying published metadata', () => {
    const attrs = unwrap(createSourceAttributes({ descriptor: 'am Stück, ca. 900 g' }))
    const c = compareCollection([], [offer('denner', { sourceAttributes: attrs }), offer('denner')])
    expect(c[0]?.withPublishedData).toBe(1)
  })

  it('notes a retailer the legacy path never covered', () => {
    const c = compareCollection([], [offer('volg')])
    expect(c[0]?.note).toContain('not collected by the legacy path')
  })

  it('notes a significant swing in either direction', () => {
    const c = compareCollection([{ retailer: 'coop', count: 100 }], Array.from({ length: 40 }, () => offer('coop')))
    expect(c[0]?.note).toContain('-60%')
  })

  it('stays quiet when the counts are close', () => {
    const c = compareCollection([{ retailer: 'coop', count: 100 }], Array.from({ length: 95 }, () => offer('coop')))
    expect(c[0]?.note).toBe('no significant change')
  })
})

describe('the cutover gate', () => {
  it('blocks when a retailer collected nothing while the legacy path did', () => {
    // The failure that would put a week of missing prices on a live site.
    const c = compareCollection([{ retailer: 'coop', count: 950 }], [])
    expect(safeToCutOver(c)).toBe(false)
    expect(c[0]?.note).toContain('COLLECTED NOTHING')
  })

  it('allows a cutover when every legacy retailer is covered', () => {
    const c = compareCollection([{ retailer: 'denner', count: 10 }], [offer('denner')])
    expect(safeToCutOver(c)).toBe(true)
  })

  it('is not blocked by a retailer that is new in the collection path', () => {
    const c = compareCollection([{ retailer: 'denner', count: 10 }], [offer('denner'), offer('spar')])
    expect(safeToCutOver(c)).toBe(true)
  })
})

describe('the report a human actually reads', () => {
  it('shows totals and the warning when a cutover is unsafe', () => {
    const out = formatComparison(compareCollection([{ retailer: 'coop', count: 950 }], []))
    expect(out).toContain('TOTAL')
    expect(out).toContain('NOT SAFE TO CUT OVER')
  })

  it('omits the warning when everything is covered', () => {
    const out = formatComparison(compareCollection([{ retailer: 'denner', count: 1 }], [offer('denner')]))
    expect(out).not.toContain('NOT SAFE')
  })
})

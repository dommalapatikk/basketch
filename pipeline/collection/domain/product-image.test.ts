import { describe, expect, it } from 'vitest'

import { cropRegionFromPoints, cropRegionImage, sourceUrlImage } from './product-image'
import { isOk, unwrap } from './result'

const PAGE = 'https://epaper.coop.ch/catalogs/AM_AKMA_W36_2026_DE_ZZ--SHORTTERM/large/bk_5.jpg'

describe('ProductImage — source URL', () => {
  it('accepts a retailer image URL (Denner, Lidl, Volg)', () => {
    const img = unwrap(sourceUrlImage('https://denner.imgix.net/assets/x/web/661106_kombi.png'))
    expect(img.kind).toBe('source-url')
  })

  it('rejects anything that is not an http(s) URL', () => {
    expect(isOk(sourceUrlImage('not-a-url'))).toBe(false)
    expect(isOk(sourceUrlImage('javascript:alert(1)'))).toBe(false)
    expect(isOk(sourceUrlImage(''))).toBe(false)
  })
})

describe('ProductImage — crop region', () => {
  it('accepts a valid fractional region', () => {
    const img = unwrap(cropRegionImage({ pageImageUrl: PAGE, x: 0.1, y: 0.2, width: 0.3, height: 0.25 }))
    expect(img.kind).toBe('crop-region')
  })

  it('rejects pixel or point coordinates leaking in as fractions', () => {
    // This is the bug the review caught: raw points would be meaningless
    // once the page is rendered at a different DPI.
    expect(isOk(cropRegionImage({ pageImageUrl: PAGE, x: 218, y: 37, width: 60, height: 46 }))).toBe(false)
  })

  it('rejects a zero-area region', () => {
    expect(isOk(cropRegionImage({ pageImageUrl: PAGE, x: 0.1, y: 0.1, width: 0, height: 0.2 }))).toBe(false)
  })

  it('rejects a region running off the page', () => {
    expect(isOk(cropRegionImage({ pageImageUrl: PAGE, x: 0.8, y: 0.1, width: 0.5, height: 0.1 }))).toBe(false)
    expect(isOk(cropRegionImage({ pageImageUrl: PAGE, x: 0.1, y: 0.9, width: 0.1, height: 0.5 }))).toBe(false)
  })

  it('rejects a negative coordinate', () => {
    expect(isOk(cropRegionImage({ pageImageUrl: PAGE, x: -0.1, y: 0.1, width: 0.2, height: 0.2 }))).toBe(false)
  })
})

describe('cropRegionFromPoints — the adapter boundary', () => {
  // Real numbers from the Coop flyer: A4 at 595.276 x 841.890 pt.
  // "Naturafarm Speck geräuchert" caption sits around x=43..130, y=198..210.
  const A4 = { widthPt: 595.276, heightPt: 841.89 }

  it('converts PDF points to fractions', () => {
    const img = unwrap(cropRegionFromPoints(PAGE, { xMin: 43, yMin: 198, xMax: 277, yMax: 300 }, A4))
    if (img.kind !== 'crop-region') throw new Error('expected crop-region')
    expect(img.region.x).toBeCloseTo(43 / 595.276, 6)
    expect(img.region.y).toBeCloseTo(198 / 841.89, 6)
    expect(img.region.width).toBeCloseTo((277 - 43) / 595.276, 6)
    expect(img.region.height).toBeCloseTo((300 - 198) / 841.89, 6)
  })

  it('produces a region that survives any render size — the whole point', () => {
    const img = unwrap(cropRegionFromPoints(PAGE, { xMin: 0, yMin: 0, xMax: 595.276, yMax: 841.89 }, A4))
    if (img.kind !== 'crop-region') throw new Error('expected crop-region')
    // Full page maps to the unit square regardless of DPI.
    expect(img.region.width).toBeCloseTo(1, 6)
    expect(img.region.height).toBeCloseTo(1, 6)
  })

  it('clamps a box that overhangs the page rather than producing an invalid region', () => {
    const img = cropRegionFromPoints(PAGE, { xMin: 500, yMin: 800, xMax: 700, yMax: 900 }, A4)
    expect(isOk(img)).toBe(true)
  })

  it('rejects an inverted box', () => {
    expect(isOk(cropRegionFromPoints(PAGE, { xMin: 300, yMin: 100, xMax: 200, yMax: 200 }, A4))).toBe(false)
  })

  it('rejects non-positive page dimensions', () => {
    expect(isOk(cropRegionFromPoints(PAGE, { xMin: 1, yMin: 1, xMax: 2, yMax: 2 }, { widthPt: 0, heightPt: 842 }))).toBe(
      false,
    )
  })
})

import { describe, expect, it } from 'vitest'
import { createCropRegion } from './crop-region'
import { isOk, unwrap } from './result'

const valid = {
  pageImageUrl: 'https://image.isu.pub/abc/jpg/page_5.jpg',
  x: 0.25,
  y: 0.5,
  width: 0.2,
  height: 0.1,
}

describe('createCropRegion', () => {
  it('builds a region from fractions of a page', () => {
    const region = unwrap(createCropRegion(valid))
    expect(region).toMatchObject({ x: 0.25, y: 0.5, width: 0.2, height: 0.1 })
  })

  it('accepts a region covering the whole page', () => {
    expect(isOk(createCropRegion({ ...valid, x: 0, y: 0, width: 1, height: 1 }))).toBe(true)
  })

  // ── the page URL ──────────────────────────────────────────────────────────
  // A real defect this prevents: an empty Issuu revision produced
  // 'image.isu.pub//jpg/page_5.jpg', which every visitor's browser 404'd while
  // the pipeline reported a clean run.
  it('refuses a page url that is not http(s)', () => {
    const r = createCropRegion({ ...valid, pageImageUrl: 'javascript:alert(1)' })
    expect(isOk(r)).toBe(false)
  })

  it('refuses an empty page url', () => {
    expect(isOk(createCropRegion({ ...valid, pageImageUrl: '' }))).toBe(false)
    expect(isOk(createCropRegion({ ...valid, pageImageUrl: '   ' }))).toBe(false)
  })

  // ── the fractions ─────────────────────────────────────────────────────────
  it('refuses coordinates outside 0..1', () => {
    expect(isOk(createCropRegion({ ...valid, x: -0.1 }))).toBe(false)
    expect(isOk(createCropRegion({ ...valid, y: 1.2 }))).toBe(false)
  })

  it('refuses a zero-area region', () => {
    // Would divide by zero in the render and paint the whole page over the card.
    expect(isOk(createCropRegion({ ...valid, width: 0 }))).toBe(false)
    expect(isOk(createCropRegion({ ...valid, height: 0 }))).toBe(false)
  })

  it('refuses a negative extent', () => {
    expect(isOk(createCropRegion({ ...valid, width: -0.2 }))).toBe(false)
    expect(isOk(createCropRegion({ ...valid, height: -0.1 }))).toBe(false)
  })

  it('refuses NaN and Infinity rather than emitting them into the DOM', () => {
    expect(isOk(createCropRegion({ ...valid, x: Number.NaN }))).toBe(false)
    expect(isOk(createCropRegion({ ...valid, width: Number.POSITIVE_INFINITY }))).toBe(false)
  })

  // ── the invariant the render code never checked ───────────────────────────
  it('refuses a region running off the right edge of the page', () => {
    // x + width = 1.1. The rectangle names a part of the page that does not
    // exist, so the card would show the page edge and whatever sits beside it.
    const r = createCropRegion({ ...valid, x: 0.9, y: 0, width: 0.2, height: 0.1 })
    expect(isOk(r)).toBe(false)
  })

  it('refuses a region running off the bottom edge of the page', () => {
    const r = createCropRegion({ ...valid, x: 0, y: 0.95, width: 0.1, height: 0.2 })
    expect(isOk(r)).toBe(false)
  })

  it('allows a region that ends exactly on the edge', () => {
    // Floating point: 0.8 + 0.2 is 1.0000000000000002 in binary. A strict
    // comparison would reject a perfectly good crop.
    expect(isOk(createCropRegion({ ...valid, x: 0.8, y: 0, width: 0.2, height: 0.1 }))).toBe(true)
  })

  it('says what was wrong, so a bad row can be found in the data', () => {
    const r = createCropRegion({ ...valid, width: 0 })
    expect(isOk(r)).toBe(false)
    if (!isOk(r)) expect(r.error).toMatch(/width|height|area/i)
  })
})

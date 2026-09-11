import { describe, expect, it } from 'vitest'

import { type CropRegion, createCropRegion } from '@/lib/domain/crop-region'
import { unwrap } from '@/lib/domain/result'

import { cropImageStyle } from './product-image'

const crop = (over: Partial<CropRegion> = {}): CropRegion => ({
  pageImageUrl: 'https://image.isu.pub/abc/jpg/page_5.jpg',
  x: 0.25,
  y: 0.5,
  width: 0.2,
  height: 0.1,
  ...over,
})

describe('cropImageStyle', () => {
  it('scales the page so the crop is exactly as wide as its slot', () => {
    // A crop 20% of the page wide has to become 100% of the card, so the page
    // is rendered at 5x the card's width.
    expect(cropImageStyle(crop({ width: 0.2 }))?.width).toBe('500%')
  })

  it('renders a full-width crop at natural scale', () => {
    expect(cropImageStyle(crop({ width: 1 }))?.width).toBe('100%')
  })

  it("brings the crop's left edge to the slot's left edge", () => {
    // translateX is a percentage of the IMAGE's own width, so the offset is the
    // raw fraction — not the fraction divided by the crop width.
    const style = cropImageStyle(crop({ x: 0.25 }))
    expect(style?.transform).toContain('translate(-25%')
  })

  it('centres the crop vertically rather than aligning its top edge', () => {
    // y = 0.5, height = 0.1 → the crop's centre is at 0.55 of the page, so the
    // image shifts up by 55% of its own height and the centre lands on the
    // container's middle line.
    const style = cropImageStyle(crop({ y: 0.5, height: 0.1 }))
    expect(style?.transform).toBe('translate(-25%, -55%)')
  })

  it('handles a crop at the very top of the page', () => {
    const style = cropImageStyle(crop({ x: 0, y: 0, width: 0.5, height: 0.25 }))
    expect(style).toEqual({
      width: '200%',
      transform: 'translate(0%, -12.5%)',
      clipPath: 'inset(0% 50% 75% 0%)',
    })
  })

  // A crop WIDER than the square slot underfills it vertically, and without a
  // clip the neighbouring products on the flyer page show above and below it —
  // reproduced in a browser, where one card rendered three rows of other
  // products. overflow:hidden cannot fix it: it clips what leaves the slot, not
  // what surrounds the crop.
  it('clips to the rectangle so neighbouring products cannot bleed in', () => {
    const style = cropImageStyle(crop({ x: 0.25, y: 0.5, width: 0.2, height: 0.1 }))
    // top 50%, right 100-(25+20)=55%, bottom 100-(50+10)=40%, left 25%
    expect(style?.clipPath).toBe('inset(50% 55% 40% 25%)')
  })

  it('clips nothing when the crop is the whole page', () => {
    const style = cropImageStyle(crop({ x: 0, y: 0, width: 1, height: 1 }))
    expect(style?.clipPath).toBe('inset(0% 0% 0% 0%)')
  })

  it('clips a full-width row on its horizontal edges only', () => {
    const style = cropImageStyle(crop({ x: 0, y: 0.5, width: 1, height: 0.25 }))
    expect(style?.clipPath).toBe('inset(50% 0% 25% 0%)')
  })

  // ⚠️ The rejection cases that used to live here — zero area, negative
  // fractions, NaN coordinates — moved to lib/domain/crop-region.test.ts when
  // CropRegion became a value object. They were testing an invariant from the
  // wrong side: a render function that checks its own input is the caller
  // remembering to check, which is what the domain rules forbid. A CropRegion
  // now cannot be built in a state this function would have to reject, so
  // `cropImageStyle` is total and there is nothing left here to assert.
  it('is total — every CropRegion the domain allows produces a style', () => {
    const region = unwrap(
      createCropRegion({
        pageImageUrl: 'https://example.com/p.jpg',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      }),
    )
    expect(cropImageStyle(region)).toEqual({
      width: '100%',
      transform: 'translate(0%, -50%)',
      clipPath: 'inset(0% 0% 0% 0%)',
    })
  })
})

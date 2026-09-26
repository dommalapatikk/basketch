import { describe, expect, it } from 'vitest'
import { PRODUCT_IMAGE_BRAND, imageColumns, type ProductImage } from './product-image'

// These are built directly here (not through the collection-domain
// constructors) because a shared-package test must not depend on pipeline —
// that would run the import direction backwards. The brand is exported
// specifically so a legitimate constructor (in pipeline/collection/domain)
// can produce one; this file uses it the same way, to test the pure mapper
// in isolation.
const sourceUrl = (url: string): ProductImage => ({ kind: 'source-url', url, [PRODUCT_IMAGE_BRAND]: true })
const cropRegion = (region: { pageImageUrl: string; x: number; y: number; width: number; height: number }): ProductImage => ({
  kind: 'crop-region',
  region,
  [PRODUCT_IMAGE_BRAND]: true,
})

describe('imageColumns — total by construction (ADR-IMG-1 condition 2)', () => {
  it('emits all six keys as null when there is no image', () => {
    expect(imageColumns(null)).toEqual({
      image_url: null,
      page_image_url: null,
      crop_x: null,
      crop_y: null,
      crop_w: null,
      crop_h: null,
    })
  })

  it('writes image_url and nulls every crop column for a source-url image', () => {
    const cols = imageColumns(sourceUrl('https://denner.imgix.net/x.jpg'))
    expect(cols.image_url).toBe('https://denner.imgix.net/x.jpg')
    expect(cols.page_image_url).toBeNull()
    expect(cols.crop_x).toBeNull()
    expect(cols.crop_y).toBeNull()
    expect(cols.crop_w).toBeNull()
    expect(cols.crop_h).toBeNull()
  })

  it('writes the page url and all four fractions, and nulls image_url, for a crop-region image', () => {
    const cols = imageColumns(cropRegion({ pageImageUrl: 'https://image.isu.pub/page_5.jpg', x: 0.1, y: 0.2, width: 0.3, height: 0.4 }))
    expect(cols.image_url).toBeNull()
    expect(cols.page_image_url).toBe('https://image.isu.pub/page_5.jpg')
    expect(cols.crop_x).toBe(0.1)
    expect(cols.crop_y).toBe(0.2)
    expect(cols.crop_w).toBe(0.3)
    expect(cols.crop_h).toBe(0.4)
  })

  it('never returns both image_url and page_image_url set — deals_one_image_kind', () => {
    for (const image of [
      sourceUrl('https://a.test/x.jpg'),
      cropRegion({ pageImageUrl: 'https://b.test/p.jpg', x: 0, y: 0, width: 1, height: 1 }),
      null,
    ]) {
      const cols = imageColumns(image)
      expect(cols.image_url === null || cols.page_image_url === null).toBe(true)
    }
  })
})

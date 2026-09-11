import { describe, expect, it } from 'vitest'

import { isStandaloneAttribute, visibleAttributes } from './deal-attributes'

describe('visibleAttributes', () => {
  it('renders nothing when the retailer stated nothing', () => {
    // The normal case for dairy: not one of Denner's 12 dairy names stated a
    // fat percentage on 2026-09-10.
    expect(visibleAttributes({}, 'en')).toEqual([])
    expect(visibleAttributes(undefined, 'en')).toEqual([])
    expect(visibleAttributes(null, 'en')).toEqual([])
  })

  it('never renders a null as "unknown" — absent means not stated', () => {
    expect(visibleAttributes({ fatPercent: null, origin: null }, 'en')).toEqual([])
  })

  it('appends the unit to a number so 3.5 is not mistaken for a count', () => {
    const [attr] = visibleAttributes({ fatPercent: 3.5 }, 'en')
    expect(attr?.value).toBe('3.5%')
    expect(attr?.label).toBe('Fat')
  })

  it('renders a true boolean as a standalone word', () => {
    const [attr] = visibleAttributes({ organic: true }, 'en')
    expect(attr?.value).toBe('Organic')
    expect(isStandaloneAttribute('organic')).toBe(true)
  })

  it('drops a false boolean rather than printing "Not organic"', () => {
    expect(visibleAttributes({ organic: false }, 'en')).toEqual([])
  })

  it('title-cases enum slugs without inventing a translation', () => {
    const [attr] = visibleAttributes({ priceBasis: 'per-100g' }, 'en')
    expect(attr?.value).toBe('Per-100g')
  })

  it('translates labels and boolean words into German', () => {
    const [organic] = visibleAttributes({ organic: true }, 'de')
    expect(organic?.value).toBe('Bio')
    const [fat] = visibleAttributes({ fatPercent: 3.5 }, 'de')
    expect(fat?.label).toBe('Fett')
  })

  it('caps the line at three facts so the price keeps its room', () => {
    const wine = {
      wineColour: 'rot',
      vintage: 2021,
      grape: 'Merlot',
      appellation: 'DOC',
      sweetness: 'trocken',
      origin: 'Ticino',
      organic: true,
    }
    expect(visibleAttributes(wine, 'en')).toHaveLength(3)
  })

  it('puts the price-tier attributes first when it has to choose', () => {
    const wine = { sweetness: 'trocken', organic: true, wineColour: 'rot' }
    const ids = visibleAttributes(wine, 'en').map((a) => a.id)
    // organic and wineColour outrank sweetness — they change what the product
    // costs, sweetness mostly changes who wants it.
    expect(ids[0]).toBe('organic')
    expect(ids).toContain('wineColour')
  })

  it('hides storage — it has its own facet and its own column', () => {
    expect(visibleAttributes({ storage: 'frozen' }, 'en')).toEqual([])
  })

  it('shows an attribute it has never heard of rather than dropping it', () => {
    // Schema drift must degrade, not break: shared/attribute-schemas.ts can grow
    // a field without a matching edit here.
    const [attr] = visibleAttributes({ brewMethod: 'cold-brew' }, 'en')
    expect(attr?.label).toBe('Brew Method')
    expect(attr?.value).toBe('Cold-brew')
  })

  it('ignores values of a type it cannot render', () => {
    expect(visibleAttributes({ weird: { nested: true }, other: [1, 2] }, 'en')).toEqual([])
  })

  it('ignores a non-finite number instead of printing NaN', () => {
    expect(visibleAttributes({ fatPercent: Number.NaN }, 'en')).toEqual([])
  })
})

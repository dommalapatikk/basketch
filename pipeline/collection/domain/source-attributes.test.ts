import { describe, expect, it } from 'vitest'
import { createMoney } from './money'
import { isOk, unwrap } from './result'
import {
  EMPTY_SOURCE_ATTRIBUTES,
  createSourceAttributes,
  hasPublishedData,
  publishedQuantity,
} from './source-attributes'

describe('publishedQuantity', () => {
  it('normalises kilograms to grams', () => {
    expect(unwrap(publishedQuantity(0.9, 'kg'))).toEqual({ amount: 900, unit: 'g' })
  })

  it('normalises centilitres to millilitres', () => {
    expect(unwrap(publishedQuantity(75, 'cl'))).toEqual({ amount: 750, unit: 'ml' })
  })

  it('normalises litres to millilitres', () => {
    expect(unwrap(publishedQuantity(1.5, 'l'))).toEqual({ amount: 1500, unit: 'ml' })
  })

  it('keeps base units unchanged', () => {
    expect(unwrap(publishedQuantity(380, 'g'))).toEqual({ amount: 380, unit: 'g' })
    expect(unwrap(publishedQuantity(6, 'piece'))).toEqual({ amount: 6, unit: 'piece' })
  })

  it('rounds away floating-point dust from unit conversion', () => {
    // 0.38 kg * 1000 is 380.00000000000006 in IEEE 754.
    expect(unwrap(publishedQuantity(0.38, 'kg')).amount).toBe(380)
  })

  it('rejects a non-positive amount — a zero-gram product is a parse failure', () => {
    expect(isOk(publishedQuantity(0, 'g'))).toBe(false)
    expect(isOk(publishedQuantity(-5, 'g'))).toBe(false)
  })

  it('rejects a non-finite amount', () => {
    expect(isOk(publishedQuantity(Number.NaN, 'g'))).toBe(false)
    expect(isOk(publishedQuantity(Number.POSITIVE_INFINITY, 'g'))).toBe(false)
  })
})

describe('createSourceAttributes', () => {
  it('defaults every field to absent', () => {
    const a = unwrap(createSourceAttributes({}))
    expect(a).toEqual(EMPTY_SOURCE_ATTRIBUTES)
  })

  it('carries a published quantity', () => {
    const a = unwrap(createSourceAttributes({ quantity: unwrap(publishedQuantity(0.4, 'kg')) }))
    expect(a.quantity).toEqual({ amount: 400, unit: 'g' })
  })

  it('trims, drops blanks and de-duplicates labels', () => {
    const a = unwrap(
      createSourceAttributes({ labels: ['  Suisse Garantie ', '', 'Bio', 'Suisse Garantie', '   '] }),
    )
    expect(a.labels).toEqual(['Suisse Garantie', 'Bio'])
  })

  it('treats a blank descriptor as absent', () => {
    expect(unwrap(createSourceAttributes({ descriptor: '   ' })).descriptor).toBeNull()
  })

  it('keeps a real descriptor verbatim', () => {
    const a = unwrap(createSourceAttributes({ descriptor: 'am Stück, mager, ca. 900 g, per 100 g' }))
    expect(a.descriptor).toBe('am Stück, mager, ca. 900 g, per 100 g')
  })

  it('normalises non-breaking spaces — Denner ships U+00A0 inside its text', () => {
    // Byte-different from a plain space, visually identical. Left alone it
    // produces cache keys that never match and duplicate-looking products.
    const a = unwrap(createSourceAttributes({ descriptor: 'ca. 900 g', labels: ['Suisse Garantie'] }))
    expect(a.descriptor).toBe('ca. 900 g')
    expect(a.labels).toEqual(['Suisse Garantie'])
  })

  it('de-duplicates labels that differ only by space character', () => {
    const a = unwrap(createSourceAttributes({ labels: ['Suisse Garantie', 'Suisse Garantie'] }))
    expect(a.labels).toEqual(['Suisse Garantie'])
  })

  it('rejects a pack size below one', () => {
    expect(isOk(createSourceAttributes({ packSize: 0 }))).toBe(false)
    expect(isOk(createSourceAttributes({ packSize: -2 }))).toBe(false)
  })

  it('rejects a fractional pack size — you cannot buy 2.5 bottles', () => {
    expect(isOk(createSourceAttributes({ packSize: 2.5 }))).toBe(false)
  })

  it('carries the unit price', () => {
    const money = unwrap(createMoney(6.3))
    const a = unwrap(createSourceAttributes({ unitPrice: money }))
    expect(a.unitPrice?.rappen).toBe(630)
  })
})

describe('createSourceAttributes — wine', () => {
  it('carries the published wine fields', () => {
    const a = unwrap(
      createSourceAttributes({
        wine: {
          colour: 'Rotwein',
          vintage: 2023,
          grape: 'Carménère',
          region: 'Colchagua Valley',
          country: 'Chile',
        },
      }),
    )
    expect(a.wine).toEqual({
      colour: 'Rotwein',
      vintage: 2023,
      grape: 'Carménère',
      region: 'Colchagua Valley',
      country: 'Chile',
    })
  })

  it('blanks inside the wine block become null', () => {
    const a = unwrap(createSourceAttributes({ wine: { colour: '  ', grape: '' } }))
    expect(a.wine).toEqual({ colour: null, vintage: null, grape: null, region: null, country: null })
  })

  it('rejects an implausible vintage', () => {
    expect(isOk(createSourceAttributes({ wine: { vintage: 1723 } }))).toBe(false)
    expect(isOk(createSourceAttributes({ wine: { vintage: 2500 } }))).toBe(false)
  })

  it('rejects a fractional vintage', () => {
    expect(isOk(createSourceAttributes({ wine: { vintage: 2023.5 } }))).toBe(false)
  })
})

describe('hasPublishedData', () => {
  it('is false when the retailer published nothing', () => {
    expect(hasPublishedData(EMPTY_SOURCE_ATTRIBUTES)).toBe(false)
  })

  it('is true when any field is present', () => {
    const a = unwrap(createSourceAttributes({ labels: ['Bio'] }))
    expect(hasPublishedData(a)).toBe(true)
  })

  it('is true for a wine block with any populated field', () => {
    const a = unwrap(createSourceAttributes({ wine: { vintage: 2023 } }))
    expect(hasPublishedData(a)).toBe(true)
  })

  it('is false for a wine block that is entirely blank', () => {
    const a = unwrap(createSourceAttributes({ wine: { colour: '  ' } }))
    expect(hasPublishedData(a)).toBe(false)
  })
})

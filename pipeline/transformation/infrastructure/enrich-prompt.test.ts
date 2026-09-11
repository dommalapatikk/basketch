import { describe, expect, it } from 'vitest'
import { buildEnrichPrompt, groupBySubCategory, validateAttributes } from './enrich-prompt'
import type { EnrichRequest } from './enrich-prompt'

const item = (productName: string, subCategory: string, descriptor: string | null = null): EnrichRequest => ({
  request: { productName, descriptor, retailer: 'denner' },
  subCategory,
})

describe('buildEnrichPrompt', () => {
  it('asks only for the fields that sub-category defines', () => {
    const p = buildEnrichPrompt('dairy', [item('Emmi Milch 1L', 'dairy')])
    expect(p).toContain('fatPercent')
    expect(p).toContain('salted')
    // Detergent fields must not appear on a milk prompt.
    expect(p).not.toContain('washLoads')
  })

  it('includes the allowed values for an enum', () => {
    const p = buildEnrichPrompt('dairy', [item('Le Gruyère AOP', 'dairy')])
    expect(p).toContain('hart, halbhart, weich, frisch')
  })

  it('carries the cross-cutting fields onto every sub-category', () => {
    const p = buildEnrichPrompt('laundry', [item('Dash Color', 'laundry')])
    expect(p).toContain('organic')
    expect(p).toContain('storage')
  })

  it('passes the retailer descriptor through — it is where the numbers are', () => {
    const p = buildEnrichPrompt('meat', [item('Denner Schweinsnierstück', 'meat', 'am Stück, mager, ca. 900 g, per 100 g')])
    expect(p).toContain('per 100 g')
  })

  it('states the never-infer rule with the real example', () => {
    // Measured: NOT ONE of Denner's 12 dairy names stated a fat percentage.
    const p = buildEnrichPrompt('dairy', [item('Emmi Milch 1L', 'dairy')])
    expect(p).toMatch(/do not infer/i)
    expect(p).toContain('the answer is null')
    expect(p).toContain('not 3.5')
  })

  it('explains WHY each field matters — the prompt reads the schema rationale', () => {
    const p = buildEnrichPrompt('meat', [item('Denner Schweinshuft', 'meat')])
    expect(p).toContain('wrong by 10×')
  })
})

describe('validateAttributes — a model must not invent fields', () => {
  it('keeps a valid number', () => {
    expect(validateAttributes('dairy', { fatPercent: 3.5 })).toEqual({ fatPercent: 3.5 })
  })

  it('keeps a valid boolean', () => {
    expect(validateAttributes('dairy', { salted: false })).toEqual({ salted: false })
  })

  it('keeps a valid enum value', () => {
    expect(validateAttributes('dairy', { cheeseFirmness: 'hart' })).toEqual({ cheeseFirmness: 'hart' })
  })

  it('drops an enum value outside the allowed list', () => {
    expect(validateAttributes('dairy', { cheeseFirmness: 'sehr-hart' })).toEqual({})
  })

  it('drops a field the schema does not define', () => {
    // A field nobody asked for is a hallucination, not a bonus.
    expect(validateAttributes('dairy', { freshness: 'very fresh' })).toEqual({})
  })

  it('drops a value of the wrong type', () => {
    expect(validateAttributes('dairy', { fatPercent: 'whole' })).toEqual({})
    expect(validateAttributes('dairy', { salted: 'yes' })).toEqual({})
  })

  it('drops NaN and Infinity', () => {
    expect(validateAttributes('dairy', { fatPercent: Number.NaN })).toEqual({})
    expect(validateAttributes('dairy', { fatPercent: Number.POSITIVE_INFINITY })).toEqual({})
  })

  it('omits null rather than storing it — absent IS the value', () => {
    // The commonest correct answer. Storing an explicit null would suggest we
    // looked and found nothing, which is the same thing but noisier.
    expect(validateAttributes('dairy', { fatPercent: null, salted: true })).toEqual({ salted: true })
  })

  it('keeps trimmed text and drops blank text', () => {
    expect(validateAttributes('dairy', { flavour: '  Banane  ' })).toEqual({ flavour: 'Banane' })
    expect(validateAttributes('dairy', { flavour: '   ' })).toEqual({})
  })

  it('accepts cross-cutting fields on any sub-category', () => {
    expect(validateAttributes('laundry', { organic: true, storage: 'ambient' })).toEqual({
      organic: true,
      storage: 'ambient',
    })
  })

  it('rejects a storage value outside the enum — ADR-001 allows exactly four', () => {
    expect(validateAttributes('dairy', { storage: 'room-temperature' })).toEqual({})
  })

  it('returns an empty object for a sub-category with no schema, not a crash', () => {
    // 59 of 76 sub-categories have no schema yet; that is a valid state.
    expect(validateAttributes('toys', { anything: 1 })).toEqual({})
  })

  it('survives null and undefined input', () => {
    expect(validateAttributes('dairy', null as never)).toEqual({})
    expect(validateAttributes('dairy', undefined as never)).toEqual({})
  })
})

describe('the fields that make price comparison correct', () => {
  it('accepts a meat price basis — comparing per-100g with per-kg is wrong by 10x', () => {
    expect(validateAttributes('meat', { priceBasis: 'per-100g' })).toEqual({ priceBasis: 'per-100g' })
  })

  it('accepts detergent wash loads — the only comparable unit for detergent', () => {
    expect(validateAttributes('laundry', { washLoads: 100 })).toEqual({ washLoads: 100 })
  })

  it('accepts paper ply and sheet counts', () => {
    expect(validateAttributes('paper-goods', { plyCount: 3, sheetCount: 150 })).toEqual({ plyCount: 3, sheetCount: 150 })
  })

  it('accepts a wine vintage', () => {
    expect(validateAttributes('wine', { vintage: 2023, grape: 'Carménère' })).toEqual({ vintage: 2023, grape: 'Carménère' })
  })
})

describe('groupBySubCategory', () => {
  it('batches by schema so the field list is sent once, not per product', () => {
    const groups = groupBySubCategory([
      item('Emmi Milch', 'dairy'),
      item('Le Gruyère', 'dairy'),
      item('Dash Color', 'laundry'),
    ])
    expect(groups.get('dairy')).toHaveLength(2)
    expect(groups.get('laundry')).toHaveLength(1)
  })

  it('handles an empty input', () => {
    expect(groupBySubCategory([]).size).toBe(0)
  })
})

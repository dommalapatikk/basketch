import { describe, expect, it } from 'vitest'
import {
  ATTRIBUTE_SCHEMAS,
  CROSS_CUTTING_ATTRIBUTES,
  attributesFor,
  hasAttributeSchema,
} from './attribute-schemas'
import { BROWSE_CATEGORIES } from './types'

describe('every schema is well formed', () => {
  const all = [...CROSS_CUTTING_ATTRIBUTES, ...Object.values(ATTRIBUTE_SCHEMAS).flat()]

  it('gives every attribute a reason it exists', () => {
    // An attribute nobody can justify is one the model will be asked to guess
    // at for no benefit. The `why` is also read by the prompt.
    for (const a of all) {
      expect(a.why.length, `${a.id} needs a why`).toBeGreaterThan(20)
    }
  })

  it('gives every enum its allowed values', () => {
    for (const a of all) {
      if (a.type === 'enum') expect(a.values?.length, `${a.id}`).toBeGreaterThan(1)
    }
  })

  it('gives no non-enum a values list', () => {
    for (const a of all) {
      if (a.type !== 'enum') expect(a.values, `${a.id}`).toBeUndefined()
    }
  })

  it('never duplicates an attribute id within one sub-category', () => {
    for (const [sub, specs] of Object.entries(ATTRIBUTE_SCHEMAS)) {
      const ids = specs.map((s) => s.id)
      expect(new Set(ids).size, `${sub} has duplicate ids`).toBe(ids.length)
    }
  })

  it('never shadows a cross-cutting attribute', () => {
    const crossIds = new Set(CROSS_CUTTING_ATTRIBUTES.map((a) => a.id))
    for (const [sub, specs] of Object.entries(ATTRIBUTE_SCHEMAS)) {
      for (const s of specs) {
        expect(crossIds.has(s.id), `${sub}/${s.id} shadows a cross-cutting attribute`).toBe(false)
      }
    }
  })
})

describe('schemas attach to sub-categories that actually exist', () => {
  it('names only real sub-categories', () => {
    // A schema keyed on a sub-category nobody can be classified into would
    // never fire, and nothing would say so.
    const real = new Set(BROWSE_CATEGORIES.flatMap((c) => c.subCategories))
    for (const sub of Object.keys(ATTRIBUTE_SCHEMAS)) {
      expect(real.has(sub), `'${sub}' is not a sub-category in BROWSE_CATEGORIES`).toBe(true)
    }
  })
})

describe('attributesFor', () => {
  it('always includes the cross-cutting attributes', () => {
    const ids = attributesFor('dairy').map((a) => a.id)
    for (const c of CROSS_CUTTING_ATTRIBUTES) expect(ids).toContain(c.id)
  })

  it('adds the sub-category specifics on top', () => {
    const ids = attributesFor('dairy').map((a) => a.id)
    expect(ids).toContain('fatPercent')
    expect(ids).toContain('salted')
  })

  it('returns only cross-cutting attributes for a sub-category with no schema', () => {
    // A valid state, not a gap: attributes may be null, so an unschema'd
    // sub-category simply extracts nothing specific (architecture finding A4).
    expect(attributesFor('toys')).toEqual(CROSS_CUTTING_ATTRIBUTES)
    expect(hasAttributeSchema('toys')).toBe(false)
  })
})

describe('the fields that make price comparison correct', () => {
  it('asks meat, poultry and fish for a price basis', () => {
    // Comparing a per-100g price with a per-kg price is wrong by 10x — the most
    // consequential extraction in the whole system.
    for (const sub of ['meat', 'poultry', 'fish']) {
      expect(attributesFor(sub).map((a) => a.id), sub).toContain('priceBasis')
    }
  })

  it('asks detergent for wash loads, not weight', () => {
    expect(attributesFor('laundry').map((a) => a.id)).toContain('washLoads')
  })

  it('asks paper goods for ply and sheet counts, not roll count alone', () => {
    const ids = attributesFor('paper-goods').map((a) => a.id)
    expect(ids).toContain('plyCount')
    expect(ids).toContain('sheetCount')
  })

  it('asks coffee for its form — capsules cost several times more per cup', () => {
    expect(attributesFor('coffee-tea').map((a) => a.id)).toContain('coffeeForm')
  })

  it('carries storage as a cross-cutting attribute, never a category (ADR-001)', () => {
    const storage = CROSS_CUTTING_ATTRIBUTES.find((a) => a.id === 'storage')
    expect(storage?.values).toContain('frozen')
    expect(Object.keys(ATTRIBUTE_SCHEMAS)).not.toContain('storage')
  })
})

describe('the never-infer rule is documented where it will be read', () => {
  it('warns on fatPercent that null is the normal answer', () => {
    // Measured: NOT ONE of Denner's 12 dairy names stated a fat percentage.
    const fat = ATTRIBUTE_SCHEMAS['dairy']?.find((a) => a.id === 'fatPercent')
    expect(fat?.why).toMatch(/expect null/i)
  })

  it('records why the wine vintage comes from the structured field', () => {
    const vintage = ATTRIBUTE_SCHEMAS['wine']?.find((a) => a.id === 'vintage')
    expect(vintage?.why).toContain('27%')
  })
})

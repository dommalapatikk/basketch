import { describe, expect, it } from 'vitest'
import { BROWSE_CATEGORIES, NON_PUBLISHABLE_SUB_CATEGORIES, isPublishable } from './types'

describe('isPublishable — the tobacco block', () => {
  it('blocks tobacco', () => {
    expect(isPublishable('tobacco')).toBe(false)
  })

  it('publishes every other kiosk sub-category', () => {
    for (const sub of ['gift-cards', 'prepaid-credit', 'cut-flowers', 'waste-bags']) {
      expect(isPublishable(sub)).toBe(true)
    }
  })

  it('publishes ordinary groceries', () => {
    for (const sub of ['dairy', 'meat', 'chocolate', 'wine', 'beer', 'spirits']) {
      expect(isPublishable(sub)).toBe(true)
    }
  })

  it('treats an unclassified product as publishable', () => {
    // D3: an uncertain product is never dropped. Only an explicit block stops it.
    expect(isPublishable(null)).toBe(true)
  })
})

describe('taxonomy integrity', () => {
  it('assigns every blocked sub-category to a real browse category', () => {
    // A blocked sub-category with no category would resolve to "Other", which
    // D1 forbids. Blocking is a publication rule, not a hole in the taxonomy.
    const all = new Set(BROWSE_CATEGORIES.flatMap((c) => c.subCategories))
    for (const blocked of NON_PUBLISHABLE_SUB_CATEGORIES) {
      expect(all.has(blocked)).toBe(true)
    }
  })

  it('never assigns a sub-category to two browse categories', () => {
    const seen = new Map<string, string>()
    const duplicates: string[] = []
    for (const c of BROWSE_CATEGORIES) {
      for (const sub of c.subCategories) {
        if (seen.has(sub)) duplicates.push(`${sub}: ${seen.get(sub)} + ${c.id}`)
        else seen.set(sub, c.id)
      }
    }
    expect(duplicates).toEqual([])
  })

  it('gives every browse category at least one sub-category', () => {
    const empty = BROWSE_CATEGORIES.filter((c) => c.subCategories.length === 0).map((c) => c.id)
    expect(empty).toEqual([])
  })

  it('has no sub-category name a model could read as belonging elsewhere', () => {
    // Found live in the bake-off: the model classified "Powerade Mountain Blast"
    // as drinks/sports, meaning a SPORTS DRINK. But 'sports' in this taxonomy
    // meant sports EQUIPMENT, under toys-games — so a correct answer was
    // rejected as invalid. The sub-category name is part of the prompt, and an
    // ambiguous name is a bug in the prompt.
    //
    // Names here must be unambiguous when read out of context, because that is
    // exactly how the model reads them.
    const AMBIGUOUS = ['sports', 'storage', 'media', 'outdoor', 'hardware', 'care', 'office', 'accessories']

    const offenders: string[] = []
    for (const c of BROWSE_CATEGORIES) {
      for (const sub of c.subCategories) {
        if (AMBIGUOUS.includes(sub)) offenders.push(`${c.id}/${sub}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps alcohol out of the soft-drinks category', () => {
    const drinks = BROWSE_CATEGORIES.find((c) => c.id === 'drinks')
    expect(drinks?.subCategories).not.toContain('beer')
    expect(drinks?.subCategories).not.toContain('wine')
  })
})

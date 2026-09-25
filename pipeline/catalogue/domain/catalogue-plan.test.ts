// Domain tests for the batched catalogue-identity plan (ARCH-X §2.6, tech-lead
// cross-review §7 WP-1a). Pure — no mocks, no Supabase: if a test here needed
// one, the layering would be wrong (CLAUDE.md § TDD "Domain first").

import { describe, it, expect } from 'vitest'

import type { Deal } from '../../../shared/types'
import { planCatalogueIdentity } from './catalogue-plan'
import type { ResolverRule } from './concept-resolution'

const NOW = '2026-09-25T00:00:00.000Z'

function makeDeal(overrides: Partial<Deal> = {}): Deal {
  return {
    store: 'coop',
    productName: 'Emmi Vollmilch 1L',
    originalPrice: 2.5,
    salePrice: 1.95,
    discountPercent: 22,
    validFrom: '2026-09-09',
    validTo: '2026-09-16',
    imageUrl: null,
    sourceCategory: null,
    sourceUrl: null,
    category: 'dairy-eggs',
    subCategory: 'milch',
    taxonomyConfidence: 0.9,
    ...overrides,
  } as Deal
}

describe('C-1: two deals with the same store and normalised name produce ONE sku draft', () => {
  it('dedupes drafts before a batch would ever be sent', () => {
    const deals = [
      makeDeal({ productName: 'Emmi Vollmilch 1L', validFrom: '2026-09-09' }),
      // Different casing/whitespace, different valid_from — same normalised identity.
      makeDeal({ productName: '  emmi   vollmilch 1l  ', validFrom: '2026-09-16' }),
    ]

    const plan = planCatalogueIdentity(deals, [], new Set(), NOW)

    expect(plan.skuDrafts).toHaveLength(1)
    expect(plan.skuKeyByDeal.size).toBe(2) // both deals still resolve to that one draft
  })
})

describe('C-2: a resolver rule wins over the fallback concept (Almo Thunfisch → cat food)', () => {
  const rules: ResolverRule[] = [
    {
      id: 'rule-1',
      rule_type: 'contains',
      pattern: 'almo',
      concept_id: 'concept-cat-food',
      priority: 1,
      is_active: true,
    },
  ]

  it('uses the existing concept id and never plans a new concept or family', () => {
    const deal = makeDeal({ productName: 'Almo Thunfisch', subCategory: 'fisch', category: 'fresh' })

    const plan = planCatalogueIdentity([deal], rules, new Set(), NOW)

    expect(plan.families).toHaveLength(0)
    expect(plan.concepts).toHaveLength(0)
    expect(plan.skuDrafts).toHaveLength(1)
    expect(plan.skuDrafts[0]!.key.conceptRef).toEqual({ kind: 'existing', id: 'concept-cat-food' })
  })

  it('an inactive rule never wins, even with a matching pattern', () => {
    const inactive: ResolverRule[] = [{ ...rules[0]!, is_active: false }]
    const deal = makeDeal({ productName: 'Almo Thunfisch', subCategory: 'fisch' })

    const plan = planCatalogueIdentity([deal], inactive, new Set(), NOW)

    expect(plan.skuDrafts[0]!.key.conceptRef.kind).toBe('planned')
  })
})

describe('C-3: a deal with no sub-category is skipped with a counted reason', () => {
  it('counts the skip instead of silently continuing', () => {
    const deals = [makeDeal({ subCategory: null }), makeDeal({ subCategory: undefined }), makeDeal()]

    const plan = planCatalogueIdentity(deals, [], new Set(), NOW)

    expect(plan.skipped.noSubCategory).toBe(2)
    expect(plan.skuDrafts).toHaveLength(1)
  })
})

describe('V-c: regular_price is omitted, never nulled, when no original price was printed', () => {
  it('the key is absent from the draft, not present with an undefined value', () => {
    const deal = makeDeal({ originalPrice: null })

    const plan = planCatalogueIdentity([deal], [], new Set(), NOW)

    expect('regularPrice' in plan.skuDrafts[0]!).toBe(false)
  })

  it('a printed price is carried through untouched', () => {
    const deal = makeDeal({ originalPrice: 3.4 })

    const plan = planCatalogueIdentity([deal], [], new Set(), NOW)

    expect(plan.skuDrafts[0]!.regularPrice).toBe(3.4)
  })
})

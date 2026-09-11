import { describe, expect, it } from 'vitest'
import { isOk, unwrap } from '../../collection/domain/result'
import {
  LABEL_VISIBLE_ABOVE,
  createClassification,
  createConfidence,
  isDisplayable,
  subCategoriesFor,
} from './classification'

describe('createConfidence', () => {
  it('accepts the full range', () => {
    expect(unwrap(createConfidence(0)).value).toBe(0)
    expect(unwrap(createConfidence(1)).value).toBe(1)
    expect(unwrap(createConfidence(0.61)).value).toBe(0.61)
  })

  it('rejects values outside 0..1 — a probability cannot be 1.4', () => {
    expect(isOk(createConfidence(1.4))).toBe(false)
    expect(isOk(createConfidence(-0.1))).toBe(false)
  })

  it('rejects non-finite values', () => {
    expect(isOk(createConfidence(Number.NaN))).toBe(false)
    expect(isOk(createConfidence(Number.POSITIVE_INFINITY))).toBe(false)
  })
})

describe('createClassification — the category-exists invariant', () => {
  const ok = { category: 'dairy', subCategory: 'dairy', confidence: unwrap(createConfidence(0.9)), tier: 1 as const, model: 'test' }

  it('builds a valid classification', () => {
    const c = unwrap(createClassification(ok))
    expect(c.category).toBe('dairy')
    expect(c.subCategory).toBe('dairy')
  })

  it('rejects a category that does not exist', () => {
    // A model can return 'tinned-goods': well-formed, plausible, not ours.
    // A classification naming a category that does not exist is not a
    // classification. This is why validation lives in the domain, not the adapter.
    const r = createClassification({ ...ok, category: 'tinned-goods', subCategory: 'canned' })
    expect(isOk(r)).toBe(false)
  })

  it('rejects "other" — nothing may fall out as Other (D1)', () => {
    expect(isOk(createClassification({ ...ok, category: 'other', subCategory: 'other' }))).toBe(false)
  })

  it('rejects "all" — it is a UI filter, not a real category', () => {
    expect(isOk(createClassification({ ...ok, category: 'all', subCategory: 'dairy' }))).toBe(false)
  })

  it('rejects a sub-category that belongs to a different category', () => {
    // 'chocolate' is real, but it is not under dairy.
    const r = createClassification({ ...ok, category: 'dairy', subCategory: 'chocolate' })
    expect(isOk(r)).toBe(false)
  })

  it('rejects a sub-category that does not exist at all', () => {
    expect(isOk(createClassification({ ...ok, subCategory: 'cheese-ish' }))).toBe(false)
  })

  it('accepts every real (category, sub-category) pair in the taxonomy', () => {
    for (const category of ['meat-fish', 'alcohol', 'pantry-canned', 'kiosk', 'pet-supplies']) {
      for (const sub of subCategoriesFor(category)) {
        const r = createClassification({ ...ok, category, subCategory: sub })
        expect(isOk(r), `${category}/${sub} should be valid`).toBe(true)
      }
    }
  })
})

describe('uncertainty is first-class', () => {
  const at = (n: number) =>
    unwrap(
      createClassification({
        category: 'dairy',
        subCategory: 'dairy',
        confidence: unwrap(createConfidence(n)),
        tier: 1,
        model: 'test',
      }),
    )

  it('marks a low-confidence classification uncertain', () => {
    expect(at(0.4).isUncertain).toBe(true)
  })

  it('does not mark a confident classification uncertain', () => {
    expect(at(0.95).isUncertain).toBe(false)
  })

  it('treats the threshold itself as confident', () => {
    expect(at(LABEL_VISIBLE_ABOVE).isUncertain).toBe(false)
  })

  it('hides the label when uncertain but never the deal (D3)', () => {
    // The offer is always published; only the category label is withheld.
    expect(isDisplayable(at(0.4))).toBe(false)
    expect(isDisplayable(at(0.95))).toBe(true)
  })
})

describe('tier records which rung answered', () => {
  const build = (tier: 1 | 2) =>
    unwrap(
      createClassification({
        category: 'bakery',
        subCategory: 'bread',
        confidence: unwrap(createConfidence(0.8)),
        tier,
        model: 'gemini-2.5-flash-lite',
      }),
    )

  it('records tier and model for traceability (§7b.1)', () => {
    const c = build(2)
    expect(c.tier).toBe(2)
    expect(c.model).toBe('gemini-2.5-flash-lite')
  })

  it('rejects a blank model — every decision names its decider', () => {
    const r = createClassification({
      category: 'bakery',
      subCategory: 'bread',
      confidence: unwrap(createConfidence(0.8)),
      tier: 1,
      model: '   ',
    })
    expect(isOk(r)).toBe(false)
  })

  it('accepts both rungs', () => {
    expect(build(1).tier).toBe(1)
    expect(build(2).tier).toBe(2)
  })
})

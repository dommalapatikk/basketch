// Classification — what component 2 decides about a product.
//
// The invariant that matters: a classification naming a category that does not
// exist is not a classification. A model can return 'tinned-goods' — well-formed,
// plausible, and not one of ours. Structured output is not a guarantee, so the
// check lives HERE, in the domain, not in whichever adapter happened to call the
// model. See docs/component-2-agent-design.md §4.2.
//
// Uncertainty is first-class. The old categorize.ts always produced an answer,
// which is exactly how the tomato-purée bug survived for months: nothing was ever
// visibly unsure, so nothing was ever reviewed. Low confidence hides the LABEL;
// it never hides the OFFER (decision D3).
//
// This module imports no infrastructure.

// Relative, not '@shared/types': the tsconfig path alias resolves for tsc but
// not at runtime under tsx/vitest. Existing pipeline modules do the same.
import { BROWSE_CATEGORIES, type StorageState, isStorageState } from '../../../shared/types'
import { type Result, err, ok } from '../../collection/domain/result'

/**
 * Confidence in [0, 1].
 *
 * NOTE this is deliberately a bare number today. Whether a model's self-reported
 * confidence means anything is an OPEN question — it must be calibrated against
 * the Denner benchmark before it is trusted (§6.4). Until then it is recorded,
 * not believed.
 */
export type Confidence = { readonly value: number }

export function createConfidence(value: number): Result<Confidence> {
  if (!Number.isFinite(value)) return err(`confidence must be finite, got ${value}`)
  if (value < 0 || value > 1) return err(`confidence must be within 0..1, got ${value}`)
  return ok({ value })
}

/**
 * Below this, the category label is withheld and the row joins the review queue.
 *
 * PROVISIONAL. The old pipeline used 0.3 to DELETE products; D3 retires that.
 * This number governs visibility only, and it must be set from measured
 * calibration rather than taste — see §6.4.
 */
export const LABEL_VISIBLE_ABOVE = 0.7

/** Which rung of the ladder answered. */
export type ClassificationTier = 1 | 2

export type Classification = {
  readonly category: string
  readonly subCategory: string
  readonly confidence: Confidence
  readonly tier: ClassificationTier
  /** Which model decided. Recorded for traceability (§7b.1). */
  readonly model: string
  readonly isUncertain: boolean
}

export type ClassificationInput = {
  category: string
  subCategory: string
  confidence: Confidence
  tier: ClassificationTier
  model: string
}

/** Sub-categories belonging to a browse category. Empty when it does not exist. */
export function subCategoriesFor(category: string): readonly string[] {
  return BROWSE_CATEGORIES.find((c) => c.id === category)?.subCategories ?? []
}

export function isKnownCategory(category: string): boolean {
  // 'all' is a UI filter, not a category a product can belong to.
  if (category === 'all') return false
  return BROWSE_CATEGORIES.some((c) => c.id === category)
}

export function createClassification(input: ClassificationInput): Result<Classification> {
  const category = input.category?.trim()
  const subCategory = input.subCategory?.trim()

  if (!category) return err('classification must name a category')
  if (!subCategory) return err('classification must name a sub-category')

  if (!isKnownCategory(category)) {
    return err(`'${category}' is not a category in the taxonomy`)
  }

  const allowed = subCategoriesFor(category)
  if (!allowed.includes(subCategory)) {
    return err(`sub-category '${subCategory}' does not belong to '${category}' (expected one of: ${allowed.join(', ')})`)
  }

  const model = input.model?.trim()
  if (!model) return err('classification must record which model decided')

  return ok({
    category,
    subCategory,
    confidence: input.confidence,
    tier: input.tier,
    model,
    isUncertain: input.confidence.value < LABEL_VISIBLE_ABOVE,
  })
}

/**
 * Whether the category LABEL may be shown.
 *
 * Never gates the offer itself — an uncertain product still appears on the site
 * with its price, because the price is not what we are unsure about (D3).
 */
export function isDisplayable(c: Classification): boolean {
  return !c.isUncertain
}

/**
 * Marks a classification uncertain on evidence other than its own confidence.
 *
 * WHY THIS EXISTS. `createClassification` derives isUncertain from the model's
 * self-reported confidence, and that number is close to worthless: measured on
 * the 291-product Denner benchmark, only 5 scored below 0.9 while 16 were
 * actually wrong. The model is confidently wrong, so a threshold over its own
 * confidence flags almost nothing.
 *
 * The judge is the signal that earned trust — it caught 25% of the errors with
 * a 0% false-alarm rate, which is what makes a "wrong" verdict worth acting on.
 * When the judge disputes an answer and reflection cannot settle it, the label
 * is withheld no matter how sure the classifier said it was.
 *
 * The category itself is untouched. It stays a real, validated category, because
 * the product still has one — what we are unsure about is whether it is right.
 */
export function markUncertain(c: Classification): Classification {
  return c.isUncertain ? c : { ...c, isUncertain: true }
}

/**
 * Reads the storage facet out of a bag of enriched attributes.
 *
 * Lives in the domain, not in the bridge that happens to call it: "what counts
 * as a storage state" is a rule about the model, and the application layer's
 * job is orchestration. It was in classify-deals.ts first, which is the same
 * mistake as putting an invariant in a caller.
 *
 * `storage` is a CROSS_CUTTING_ATTRIBUTE, so the enricher returns it in the
 * same bag as everything else. Anything the column's CHECK constraint would
 * reject becomes null rather than failing the batch — the model can answer
 * 'tiefkühl', which is what a retailer prints and not what we store. The raw
 * answer stays in `attributes`, so nothing is lost, it is just not promoted to
 * a facet we would filter on.
 */
export function storageFrom(attributes: Record<string, unknown>): StorageState | null {
  return isStorageState(attributes.storage) ? attributes.storage : null
}

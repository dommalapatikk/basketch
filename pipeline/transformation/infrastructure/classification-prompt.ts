// The classification prompt and response parsing — shared by every provider.
//
// Provider-agnostic on purpose: tier 1 (Gemini) and tier 2 (OpenRouter) must ask
// the SAME question in the SAME words. If they differed, a disagreement between
// the tiers would tell us the prompts differ, not that the product is hard —
// and disagreement is precisely the uncertainty signal the ladder relies on.

import { isOk } from '../../collection/domain/result'
import {
  type Classification,
  type ClassificationTier,
  createClassification,
  createConfidence,
} from '../domain/classification'
import type { ClassificationOutcome, ClassificationRequest } from '../domain/classifier'

/** Bump when the prompt changes — it is part of the cache key (§7). */
export const PROMPT_VERSION = 1

export type TaxonomyEntry = { category: string; subCategories: readonly string[] }

/** One answer, as the model is asked to return it. */
export type ModelAnswer = { i?: number; category?: string; subCategory?: string; confidence?: number }

export function buildPrompt(
  taxonomy: readonly TaxonomyEntry[],
  batch: readonly ClassificationRequest[],
  /**
   * Retrieval few-shot: what we decided for the nearest already-classified
   * products. Empty on a cold cache, which is exactly when the model has least
   * help — so the prompt must work with and without it.
   */
  examples = '',
): string {
  const list = taxonomy.map((t) => `${t.category}: ${t.subCategories.join(', ')}`).join('\n')
  const products = batch
    .map((r, i) => `${i}. ${r.productName}${r.descriptor ? ` — ${r.descriptor}` : ''}`)
    .join('\n')

  const memory = examples ? `\n${examples}` : ''

  return `You classify Swiss supermarket products into a fixed taxonomy.
Product names are mostly German, some French or Italian.

TAXONOMY — category: allowed sub-categories
${list}

RULES
- Answer with a category and a sub-category from the list above. Never invent one.
- The sub-category must be one of those listed for the category you choose.
- Every product gets a category. "other" is not permitted.
- confidence is 0.0-1.0: how sure you are. Be honest — a low score is useful,
  a confidently wrong answer is not.
- Judge only from the text given. Do not assume typical values for a brand.

EXAMPLES
- "Denner Tomatenpüree 3x200g" is a preserved tomato product, not fresh produce:
  pantry-canned / canned
- "Cailler Tafelschokolade Milch" is a chocolate bar: snacks-sweets / chocolate
- "Purina ONE Katzentrockenfutter" is cat food: pet-supplies / pet-food
- "Corona Bier Cero 0.0%" is still beer: alcohol / beer
${memory}
PRODUCTS
${products}

Return a JSON array with one object per product: {"i": <number>, "category": "...", "subCategory": "...", "confidence": <number>}`
}

/**
 * REPAIR — the model returned something outside the taxonomy. Tell it what was
 * wrong and let it try again.
 *
 * ⚠️ BUILT BUT NOT WIRED, DELIBERATELY. Measured 2026-09-10:
 *
 *   gemini-3.5-flash-lite   0 invalid answers across 291 products
 *   gpt-5-nano              several, e.g. `"bread, pastry, cake, dough"` —
 *                           copying the whole allowed list instead of choosing
 *
 * Tier 1 is the Gemini model, which produced NOTHING for this loop to repair.
 * Wiring a node that never executes adds a branch to reason about and a cost to
 * carry for zero measured benefit — the same test every other loop had to pass.
 *
 * The existing behaviour is already safe: an invalid category is rejected by the
 * domain, the product becomes uncertain, and it reaches the review queue rather
 * than the site.
 *
 * WIRE THIS IF: a model change makes `invalid_category_rejected` non-zero in
 * pipeline_run — the alert for that already exists (`invalid-category-spike`).
 * Until then it is measured-and-declined, not forgotten.
 */
export function buildRepairPrompt(
  taxonomy: readonly TaxonomyEntry[],
  request: ClassificationRequest,
  previousAnswer: { category?: string; subCategory?: string },
  error: string,
): string {
  const list = taxonomy.map((t) => `${t.category}: ${t.subCategories.join(', ')}`).join('\n')
  return `Your previous answer was rejected.

PRODUCT: ${request.productName}${request.descriptor ? ` — ${request.descriptor}` : ''}
YOU ANSWERED: category="${previousAnswer.category ?? ''}", subCategory="${previousAnswer.subCategory ?? ''}"
WHY IT WAS REJECTED: ${error}

Pick exactly ONE category and ONE sub-category from this list. Do not return the
list itself, do not combine values, do not invent new ones.

${list}

Return one JSON object: {"i": 0, "category": "...", "subCategory": "...", "confidence": <0-1>}`
}

/**
 * REFLECT — the model was unsure. Ask it to argue against its own answer before
 * committing.
 *
 * Distinct from simply re-asking: tier 2 re-asks the same question with fewer
 * products competing for attention. This asks a DIFFERENT question — "what would
 * make this wrong?" — which is the only way a single model can catch a
 * misunderstanding rather than a slip.
 */
export function buildReflectPrompt(
  taxonomy: readonly TaxonomyEntry[],
  request: ClassificationRequest,
  answer: { category: string; subCategory: string; confidence: number },
): string {
  const list = taxonomy.map((t) => `${t.category}: ${t.subCategories.join(', ')}`).join('\n')
  return `You classified a Swiss supermarket product and were not confident.

PRODUCT: ${request.productName}${request.descriptor ? ` — ${request.descriptor}` : ''}
YOUR ANSWER: ${answer.category} / ${answer.subCategory}  (confidence ${answer.confidence})

Before answering again:
1. State the strongest argument that your answer is WRONG.
2. Name the single most likely alternative category.
3. Decide which is better supported by the product text alone.

Judge only from the text. Do not assume typical values for a brand.

${list}

Return one JSON object with your FINAL answer:
{"i": 0, "category": "...", "subCategory": "...", "confidence": <0-1>, "reasoning": "<one sentence>"}`
}

/**
 * JUDGE — a second, different model scores an answer it did not produce.
 *
 * WHY: a model's self-reported confidence is a generated token, not a
 * measurement. A judge from another lab gives an independent signal. It never
 * overrides the answer — it only decides whether the answer is trustworthy.
 */
export function buildJudgePrompt(
  taxonomy: readonly TaxonomyEntry[],
  request: ClassificationRequest,
  answer: { category: string; subCategory: string },
): string {
  const list = taxonomy.map((t) => `${t.category}: ${t.subCategories.join(', ')}`).join('\n')
  return `Judge whether this product classification is correct. You did not make it.

PRODUCT: ${request.productName}${request.descriptor ? ` — ${request.descriptor}` : ''}
PROPOSED: ${answer.category} / ${answer.subCategory}

TAXONOMY
${list}

Answer honestly. If the proposal is defensible, say so even if you would have
chosen differently — many products sit legitimately between two categories.

Return one JSON object:
{"i": 0, "verdict": "correct" | "defensible" | "wrong", "category": "<what you would choose>", "confidence": <0-1>}`
}

/**
 * Pulls the JSON array out of a response.
 *
 * Tolerant by necessity: models wrap JSON in markdown fences, prepend "Here you
 * go:", and append commentary — all unprompted, and differently per provider.
 */
export function extractAnswers(text: string): ModelAnswer[] | null {
  const cleaned = text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim()
  if (!cleaned) return null

  // 1. A bare array — what we ask for, and what Gemini returns.
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1))
      if (Array.isArray(parsed)) return parsed as ModelAnswer[]
    } catch {
      // fall through
    }
  }

  // 2. An object wrapping the array, or a single bare object.
  //
    // Providers that enforce a JSON-object response format cannot emit a
  // top-level array, so they return {"results": [...]} — or, for a one-item
  // batch, the object alone. Observed on OpenRouter, 2026-09-10.
  const objStart = cleaned.indexOf('{')
  const objEnd = cleaned.lastIndexOf('}')
  if (objStart !== -1 && objEnd > objStart) {
    try {
      const parsed = JSON.parse(cleaned.slice(objStart, objEnd + 1)) as Record<string, unknown>
      for (const v of Object.values(parsed)) {
        if (Array.isArray(v)) return v as ModelAnswer[]
      }
      // A lone answer object: treat as a one-element batch, defaulting i to 0.
      //
      // `verdict` is accepted as well as `category` because the JUDGE returns a
      // verdict and may omit the category entirely. Requiring `category` made a
      // valid {"verdict":"defensible"} parse as nothing, which the judge then
      // read as "unavailable" — silently disabling it whenever it answered
      // concisely. Caught by a test, not in production.
      if ('category' in parsed || 'verdict' in parsed) {
        return [{ i: typeof parsed.i === 'number' ? parsed.i : 0, ...parsed } as ModelAnswer]
      }
    } catch {
      return null
    }
  }

  return null
}

/**
 * One model answer -> a domain Classification.
 *
 * The taxonomy check happens inside createClassification, in the DOMAIN — a
 * model returning 'tinned-goods' is well-formed, plausible and not ours, and
 * that judgement must not depend on which adapter happened to make the call.
 */
export function toOutcome(
  request: ClassificationRequest,
  answer: ModelAnswer | undefined,
  model: string,
  tier: ClassificationTier,
): ClassificationOutcome {
  if (!answer) return { ok: false, request, reason: 'no-answer', detail: 'model returned no entry for this product' }

  const conf = createConfidence(typeof answer.confidence === 'number' ? answer.confidence : 0)
  if (!isOk(conf)) return { ok: false, request, reason: 'no-answer', detail: `bad confidence: ${answer.confidence}` }

  const built = createClassification({
    category: String(answer.category ?? ''),
    subCategory: String(answer.subCategory ?? ''),
    confidence: conf.value,
    tier,
    model,
  })

  if (!isOk(built)) return { ok: false, request, reason: 'invalid-category', detail: built.error }
  return { ok: true, request, classification: built.value as Classification }
}

/**
 * Matches answers to requests by the index the model echoed back, NOT by array
 * position.
 *
 * WHY: a model that drops or reorders one item would otherwise shift every
 * subsequent label onto the wrong product — 24 silent mislabels from one
 * missing entry. Observed in testing, hence the explicit index.
 */
export function alignByIndex(
  batch: readonly ClassificationRequest[],
  answers: readonly ModelAnswer[],
  model: string,
  tier: ClassificationTier,
): ClassificationOutcome[] {
  const byIndex = new Map<number, ModelAnswer>()
  for (const a of answers) if (typeof a.i === 'number') byIndex.set(a.i, a)
  return batch.map((request, i) => toOutcome(request, byIndex.get(i), model, tier))
}

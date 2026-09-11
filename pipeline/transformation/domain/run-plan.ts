// Run planning — the cold start, and shipping a prompt change safely.
//
// THE COLD START PROBLEM
// The cache is the reason this pipeline is free: after a month, 85–95% of
// products are already known and never reach a model. But on the FIRST run the
// cache is empty. Every one of ~1,800 products needs classifying, which is the
// single most expensive run the system will ever do — and the one we would
// otherwise never have tested.
//
// The same thing happens, without warning, every time a version is bumped:
// changing the prompt changes `prompt_version`, which changes every cache key,
// which empties the cache. A one-word prompt edit silently triggers a cold start.
//
// THE PROMPT SAFETY PROBLEM
// A prompt edit changes every classification on the site. Today there is nothing
// stopping a change that makes things worse from shipping, and no way back.

import type { Budget, BudgetState } from './guardrails'

// ── Cold start ───────────────────────────────────────────────────────────────

export type RunPlan = {
  /** How many products to classify this run. */
  readonly limit: number
  readonly isColdStart: boolean
  readonly deferred: number
  readonly reason: string
}

/**
 * Products a single run may classify from scratch.
 *
 * ~1,800 offers at 25 per call is 72 calls — inside the 1,000/day cap, but it
 * assumes nothing else consumed quota and no retries happened. 800 leaves the
 * first run comfortable and finishes the backlog over three runs, which is a
 * few days at 3–5 runs a week.
 */
export const COLD_START_LIMIT = 800

/** Below this hit rate the cache is effectively empty. */
export const COLD_START_HIT_RATE = 0.3

export function planRun(
  totalProducts: number,
  expectedCacheHits: number,
  budget: Budget,
  spent: BudgetState,
): RunPlan {
  const misses = Math.max(0, totalProducts - expectedCacheHits)
  const hitRate = totalProducts === 0 ? 1 : expectedCacheHits / totalProducts

  // What the remaining budget can actually pay for, at ~1,100 tokens per batch
  // of 25 — measured, not assumed.
  const tokensLeft = Math.max(0, budget.maxTokens - spent.tokensUsed)
  const affordable = Math.floor((tokensLeft / 1_100) * 25)

  if (hitRate >= COLD_START_HIT_RATE) {
    const limit = Math.min(misses, affordable)
    return {
      limit,
      isColdStart: false,
      deferred: misses - limit,
      reason: limit < misses ? 'budget-limited' : 'normal run',
    }
  }

  const limit = Math.min(misses, COLD_START_LIMIT, affordable)
  return {
    limit,
    isColdStart: true,
    deferred: misses - limit,
    reason:
      `cold start: cache hit rate ${(hitRate * 100).toFixed(0)}%. ` +
      `Classifying ${limit} of ${misses}; the rest resume next run. ` +
      'A cold start also happens whenever a taxonomy, prompt or schema version is bumped.',
  }
}

/**
 * Which products to do first when the run cannot do them all.
 *
 * Deferring is only acceptable if it is fair. Ordering by name is arbitrary but
 * STABLE, so a product deferred this run is not deferred again next run — the
 * ones already classified become cache hits and drop out of the queue.
 */
export function orderForColdStart<T extends { productName: string }>(products: readonly T[]): T[] {
  return [...products].sort((a, b) => a.productName.localeCompare(b.productName, 'de-CH'))
}

// ── Prompt safety ────────────────────────────────────────────────────────────

export type PromptCandidate = {
  readonly version: number
  readonly macroF1: number
  readonly accuracy: number
  readonly invalidCategoryCount: number
  readonly productsScored: number
}

export type PromptGate =
  | { readonly ship: true; readonly note: string }
  | { readonly ship: false; readonly reason: string }

/**
 * Minimum products a candidate must be scored on.
 *
 * Below this the measurement is noise: the benchmark is imbalanced, so a small
 * sample can miss whole categories entirely.
 */
export const MIN_PROMPT_EVAL_SIZE = 200

/**
 * How much worse a new prompt may be and still ship: nothing beyond measured
 * noise. Temperature 0 produced a ~0.7pp swing run-to-run on identical input,
 * so a tolerance of 0 would block harmless edits, and anything larger lets a
 * real regression through.
 */
export const PROMPT_REGRESSION_TOLERANCE = 0.02

export function evaluatePromptChange(current: PromptCandidate, candidate: PromptCandidate): PromptGate {
  if (candidate.productsScored < MIN_PROMPT_EVAL_SIZE) {
    return {
      ship: false,
      reason: `candidate scored on only ${candidate.productsScored} products; ${MIN_PROMPT_EVAL_SIZE} required. The benchmark is imbalanced — a small sample can miss whole categories.`,
    }
  }

  if (candidate.invalidCategoryCount > current.invalidCategoryCount) {
    return {
      ship: false,
      reason: `candidate produced ${candidate.invalidCategoryCount} answers outside the taxonomy vs ${current.invalidCategoryCount}. The prompt and the taxonomy have drifted apart.`,
    }
  }

  const delta = candidate.macroF1 - current.macroF1
  if (delta < -PROMPT_REGRESSION_TOLERANCE) {
    return {
      ship: false,
      reason: `macro-F1 would fall ${Math.abs(delta).toFixed(3)} (${current.macroF1.toFixed(3)} → ${candidate.macroF1.toFixed(3)}). Shipping this rewrites every category on the site.`,
    }
  }

  if (delta < 0) {
    return {
      ship: true,
      note: `macro-F1 ${delta.toFixed(3)} — within the measured noise floor, not a regression. Bumping the prompt version empties the cache and forces a cold start.`,
    }
  }

  return {
    ship: true,
    note: `macro-F1 +${delta.toFixed(3)} (${current.macroF1.toFixed(3)} → ${candidate.macroF1.toFixed(3)}). Bumping the prompt version empties the cache and forces a cold start.`,
  }
}

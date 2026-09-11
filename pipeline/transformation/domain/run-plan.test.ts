import { describe, expect, it } from 'vitest'
import { isOk } from '../../collection/domain/result'
import { FREE_TIER_BUDGET, ZERO_SPEND } from './guardrails'
import {
  BLOCKED_MODELS,
  JUDGE_CHAIN,
  TIER1_CHAIN,
  downgradeWarning,
  selectModel,
} from './model-registry'
import {
  COLD_START_LIMIT,
  MIN_PROMPT_EVAL_SIZE,
  type PromptCandidate,
  evaluatePromptChange,
  orderForColdStart,
  planRun,
} from './run-plan'

const up = (id: string) => ({ id, available: true })
const down = (id: string, detail: string) => ({ id, available: false, detail })

describe('model registry — surviving a retirement', () => {
  it('picks the best model when it is alive', () => {
    const r = selectModel(TIER1_CHAIN, TIER1_CHAIN.map((m) => up(m.id)))
    expect(isOk(r) && r.value.id).toBe('gemini-3.5-flash-lite')
  })

  it('falls back when the primary is retired mid-week', () => {
    // Exactly what happened: models.list said available, generateContent 404'd.
    const r = selectModel(TIER1_CHAIN, [
      down('gemini-3.5-flash-lite', '404 no longer available to new users'),
      up('gemini-3.1-flash-lite'),
      up('gemini-flash-lite-latest'),
    ])
    expect(isOk(r) && r.value.id).toBe('gemini-3.1-flash-lite')
  })

  it('fails loudly when the whole chain is down, listing why', () => {
    const r = selectModel(TIER1_CHAIN, TIER1_CHAIN.map((m) => down(m.id, '404')))
    expect(isOk(r)).toBe(false)
    if (!isOk(r)) expect(r.error).toContain('no model in the chain is available')
  })

  it('refuses a chain containing a blocked model', () => {
    const bad = [{ ...TIER1_CHAIN[0]!, id: 'gemini-3.5-flash' }]
    const r = selectModel(bad, [up('gemini-3.5-flash')])
    expect(isOk(r)).toBe(false)
    if (!isOk(r)) expect(r.error).toContain('20 requests PER DAY')
  })

  it('remembers every model proven unusable today', () => {
    expect(BLOCKED_MODELS['gemini-2.5-flash-lite']).toContain('retired')
    expect(BLOCKED_MODELS['gemini-3.5-flash']).toContain('20 requests PER DAY')
    expect(BLOCKED_MODELS['thinkingmachines/inkling:free']).toContain('403')
  })

  it('records the judge chain with the measurement that justified it', () => {
    expect(JUDGE_CHAIN[0]?.id).toBe('openai/gpt-5-nano')
    expect(JUDGE_CHAIN[0]?.note).toContain('0% false-alarm')
  })
})

describe('a downgrade is never silent', () => {
  it('says nothing when running on the primary', () => {
    expect(downgradeWarning(TIER1_CHAIN, TIER1_CHAIN[0]!)).toBeNull()
  })

  it('quantifies the accuracy cost of a fallback', () => {
    const w = downgradeWarning(TIER1_CHAIN, TIER1_CHAIN[1]!)
    expect(w).toContain('macro-F1')
    expect(w).toContain('0.842')
  })

  it('flags loudly when falling back to a model nobody has benchmarked', () => {
    const w = downgradeWarning(TIER1_CHAIN, TIER1_CHAIN[2]!)
    expect(w).toContain('NEVER been benchmarked')
  })
})

describe('cold start — the run most likely to blow the budget', () => {
  it('caps the first run and defers the rest', () => {
    const p = planRun(1800, 0, FREE_TIER_BUDGET, ZERO_SPEND)
    expect(p.isColdStart).toBe(true)
    expect(p.limit).toBe(COLD_START_LIMIT)
    expect(p.deferred).toBe(1800 - COLD_START_LIMIT)
  })

  it('does not cap a normal run with a warm cache', () => {
    const p = planRun(1800, 1650, FREE_TIER_BUDGET, ZERO_SPEND)
    expect(p.isColdStart).toBe(false)
    expect(p.limit).toBe(150)
    expect(p.deferred).toBe(0)
  })

  it('detects the cold start caused by bumping a version', () => {
    // A one-word prompt edit changes prompt_version, which changes every cache
    // key, which empties the cache. Same cost as day one, with no warning.
    const p = planRun(1800, 0, FREE_TIER_BUDGET, ZERO_SPEND)
    expect(p.reason).toContain('version is bumped')
  })

  it('never plans beyond what the remaining budget can pay for', () => {
    // 4,400 tokens left ÷ ~1,100 per batch = 4 batches = 100 products.
    const nearlySpent = { ...ZERO_SPEND, tokensUsed: FREE_TIER_BUDGET.maxTokens - 4_400 }
    const p = planRun(1800, 0, FREE_TIER_BUDGET, nearlySpent)
    expect(p.limit).toBe(100)
    expect(p.deferred).toBe(1700)
  })

  it('plans nothing when there is nothing to do', () => {
    const p = planRun(1800, 1800, FREE_TIER_BUDGET, ZERO_SPEND)
    expect(p.limit).toBe(0)
  })
})

describe('deferring must be fair', () => {
  it('orders stably, so the same products are not deferred every run', () => {
    const products = [{ productName: 'Zweifel Chips' }, { productName: 'Emmi Milch' }, { productName: 'Äpfel' }]
    const once = orderForColdStart(products).map((p) => p.productName)
    const twice = orderForColdStart([...products].reverse()).map((p) => p.productName)
    expect(once).toEqual(twice)
  })

  it('sorts with Swiss German collation', () => {
    const out = orderForColdStart([{ productName: 'Zopf' }, { productName: 'Äpfel' }]).map((p) => p.productName)
    expect(out[0]).toBe('Äpfel')
  })
})

describe('prompt safety — a change rewrites every category on the site', () => {
  const current: PromptCandidate = { version: 1, macroF1: 0.855, accuracy: 0.948, invalidCategoryCount: 0, productsScored: 291 }

  it('ships a clear improvement', () => {
    const g = evaluatePromptChange(current, { ...current, version: 2, macroF1: 0.89 })
    expect(g.ship).toBe(true)
    if (g.ship) expect(g.note).toContain('+0.035')
  })

  it('blocks a regression', () => {
    const g = evaluatePromptChange(current, { ...current, version: 2, macroF1: 0.70 })
    expect(g.ship).toBe(false)
    if (!g.ship) expect(g.reason).toContain('rewrites every category')
  })

  it('allows a change inside the measured noise floor', () => {
    // Temperature 0 is not deterministic — a tolerance of 0 would block
    // harmless edits every time.
    const g = evaluatePromptChange(current, { ...current, version: 2, macroF1: 0.845 })
    expect(g.ship).toBe(true)
    if (g.ship) expect(g.note).toContain('noise floor')
  })

  it('blocks a candidate scored on too few products', () => {
    const g = evaluatePromptChange(current, { ...current, version: 2, macroF1: 0.95, productsScored: 20 })
    expect(g.ship).toBe(false)
    if (!g.ship) expect(g.reason).toContain('imbalanced')
  })

  it('blocks a candidate that names categories outside the taxonomy', () => {
    const g = evaluatePromptChange(current, { ...current, version: 2, macroF1: 0.90, invalidCategoryCount: 5 })
    expect(g.ship).toBe(false)
    if (!g.ship) expect(g.reason).toContain('drifted apart')
  })

  it('warns that shipping empties the cache', () => {
    const g = evaluatePromptChange(current, { ...current, version: 2, macroF1: 0.87 })
    expect(g.ship && g.note).toContain('cold start')
  })

  it('requires a meaningful sample size', () => {
    expect(MIN_PROMPT_EVAL_SIZE).toBeGreaterThanOrEqual(200)
  })
})

describe('judge sampling', () => {
  /**
   * THE COLD-START BOTTLENECK, found 2026-09-11.
   *
   * Every successful classification is pushed to the judge — deliberately, as
   * the judge is the escalation trigger and self-reported confidence is not
   * (5 of 291 scored below 0.9 while 16 were wrong). But each verdict is ONE
   * sequential HTTP call, so a cold start of 800 products meant ~800 calls
   * before enrichment even began. Two live cutovers died on it.
   *
   * Classification itself is only 32 calls — it was never the slow part.
   *
   * A cold start is a one-off bulk load, so it samples. Every normal week
   * classifies a handful of genuinely new products and judges all of them.
   */
  it('judges every product on a normal warm run', () => {
    const p = planRun(1800, 1750, FREE_TIER_BUDGET, ZERO_SPEND)
    expect(p.isColdStart).toBe(false)
    expect(p.judgeSampleRate).toBe(1)
  })

  it('samples the judge on a cold start rather than making ~800 sequential calls', () => {
    const p = planRun(1800, 0, FREE_TIER_BUDGET, ZERO_SPEND)
    expect(p.isColdStart).toBe(true)
    expect(p.judgeSampleRate).toBeLessThan(1)
    expect(p.judgeSampleRate).toBeGreaterThan(0)
  })

  it('keeps the sampled rate divisible into a whole stride', () => {
    // classify-graph samples with `i % Math.round(1 / rate)`, so a rate whose
    // reciprocal is not a clean integer silently judges the wrong count.
    const p = planRun(1800, 0, FREE_TIER_BUDGET, ZERO_SPEND)
    const stride = Math.round(1 / p.judgeSampleRate)
    expect(stride).toBeGreaterThan(1)
    expect(Math.abs(1 / stride - p.judgeSampleRate)).toBeLessThan(1e-9)
  })

  it('never samples the judge away entirely', () => {
    // Sampling to zero would publish a whole cold-start cohort with no
    // independent check at all.
    for (const hits of [0, 100, 400]) {
      expect(planRun(1800, hits, FREE_TIER_BUDGET, ZERO_SPEND).judgeSampleRate).toBeGreaterThan(0)
    }
  })
})

describe('enrichment is deferred on a cold start', () => {
  /**
   * MEASURED 2026-09-11. Enrichment is ~30 of the ~59 sequential model calls a
   * chunk of 100 makes — more than half — and its prompt is by far the largest:
   * 2,614 characters for 15 products, because every attribute ships its full
   * `why:` sentence as input on every call (enrich-prompt.ts:49). It returns 15
   * objects of up to ten fields each.
   *
   * It is also, by the pipeline's own rule, OPTIONAL: "Enrichment must never be
   * able to cost a product its category" (classify-deals.ts). So on the one run
   * that cannot afford it, it does not run.
   *
   * The call count is worse than it looks, and this is the reason deferring
   * beats shrinking chunks: gemini-enricher groups by SUB-CATEGORY and then
   * batches 15 within a group, so the number of calls scales with sub-category
   * diversity rather than product count. 100 products spread over ~30
   * sub-categories is ~30 near-empty calls. One pass over the whole corpus
   * later needs ~76 calls instead of ~240 — cheaper in quota AND in time.
   *
   * Accuracy cost: ZERO. It touches no category. The cost is metadata
   * completeness, chiefly the storage facet behind the Frozen browse tile.
   */
  it('does not enrich on a cold start', () => {
    const p = planRun(1800, 0, FREE_TIER_BUDGET, ZERO_SPEND)
    expect(p.isColdStart).toBe(true)
    expect(p.enrich).toBe(false)
  })

  it('enriches on a normal warm run', () => {
    const p = planRun(1800, 1750, FREE_TIER_BUDGET, ZERO_SPEND)
    expect(p.isColdStart).toBe(false)
    expect(p.enrich).toBe(true)
  })

  it('ties the decision to the plan, not to the caller', () => {
    // The condition must not live in classify-deals as an `if (isColdStart)`.
    // planRun already owns "what can this run afford"; judgeSampleRate lives
    // here for the same reason. An invariant enforced by a caller remembering
    // to check is a comment, not an invariant.
    for (const hits of [0, 200, 1750]) {
      const p = planRun(1800, hits, FREE_TIER_BUDGET, ZERO_SPEND)
      expect(p.enrich).toBe(!p.isColdStart)
    }
  })
})

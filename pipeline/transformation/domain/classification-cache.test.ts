import { describe, expect, it } from 'vitest'

import { needsEnrichment } from './classification-cache'

describe('needsEnrichment', () => {
  /**
   * THE OTHER HALF OF DEFERRED ENRICHMENT.
   *
   * A cold start skips enrichment to afford its classification budget
   * (RunPlan.enrich). That is only a DEFERRAL if something later picks the work
   * up — and a cache hit is otherwise terminal: classify-deals returns
   * `entry.attributes` verbatim and never routes a hit to the enricher.
   *
   * Without this predicate, "defer enrichment" silently means "those 800
   * products have no attributes, permanently" — so `storageFrom` yields nothing
   * and the Frozen browse tile's facet count undercounts by up to 800 (ADR-001).
   *
   * A named domain predicate rather than an inline `Object.keys(x).length === 0`
   * in the caller: the rule is "what counts as un-enriched", and that is a
   * domain question.
   */
  const entry = (attributes: Record<string, unknown>) => ({
    cacheKey: 'k',
    normalisedName: 'emmi vollmilch 1l',
    classification: {} as never,
    attributes,
    runId: 'run-1',
  })

  it('flags an entry a cold start left empty', () => {
    expect(needsEnrichment(entry({}))).toBe(true)
  })

  it('leaves an already-enriched entry alone', () => {
    expect(needsEnrichment(entry({ fatPercent: 3.5 }))).toBe(false)
  })

  it('treats a retailer who stated nothing as still needing a look', () => {
    // An empty bag is indistinguishable from "never asked". Asking again costs
    // one batched call; never asking costs the facet forever. The enricher is
    // idempotent, so the safe direction is to re-ask.
    expect(needsEnrichment(entry({}))).toBe(true)
  })

  it('does not re-enrich an entry whose only attribute is false', () => {
    // `false` is a stated answer, not an absence.
    expect(needsEnrichment(entry({ organic: false }))).toBe(false)
  })

  it('survives a null attributes bag from an old row', () => {
    expect(needsEnrichment({ ...entry({}), attributes: null as never })).toBe(true)
  })
})

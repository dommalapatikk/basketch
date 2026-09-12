import { describe, expect, it } from 'vitest'

import { createInMemoryCache, mergeForCache, needsEnrichment } from './classification-cache'
import type { CachedClassification } from './classification-cache'
import { isOk } from '../../collection/domain/result'

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

describe('merging entries that share a cache key', () => {
  /**
   * THE DEFECT, verified against the live table 2026-09-12.
   *
   * `cache_key` is the PRIMARY KEY and the upsert's conflict target. Postgres
   * raises SQLSTATE 21000 — "ON CONFLICT DO UPDATE command cannot affect row a
   * second time" — when ONE statement carries the same key twice, and rejects
   * the WHOLE statement. Each persist writes exactly one statement of 100, so a
   * single duplicate pair discards ~100 classifications we already paid for.
   *
   * The key is deliberately RETAILER-INDEPENDENT, so the same product sold by
   * Coop and Denner collides by design. Across seven retailers that is routine,
   * not an edge case. Measured: 1,315 products classified, 446 persisted (34%)
   * — and 0% after stable ordering put identical names in the same chunk.
   *
   * The merge is a FIELD-WISE FOLD, not a pick, because colliding entries are
   * usually but not always identical.
   */
  const entry = (over: Partial<CachedClassification> = {}): CachedClassification => ({
    cacheKey: 'emmi vollmilch 1l|t3|p1|s1',
    normalisedName: 'emmi vollmilch 1l',
    classification: {
      category: 'dairy',
      subCategory: 'dairy',
      confidence: { value: 0.9 },
      tier: 1,
      model: 'gemini-3.5-flash-lite',
      isUncertain: false,
    } as CachedClassification['classification'],
    attributes: {},
    runId: 'run-1',
    ...over,
  })

  it('collapses two entries for the same product into one', () => {
    expect(mergeForCache([entry(), entry()])).toHaveLength(1)
  })

  it('keeps the enriched attributes when the other entry has none', () => {
    // An empty bag is an ABSENCE, not an answer. Writing {} over real
    // attributes costs a backfill round-trip, and on a cold start costs the
    // storage facet until a warm run repairs it (ADR-001).
    const empty = entry({ attributes: {} })
    const rich = entry({ attributes: { fatPercent: 3.5 } })
    for (const pair of [[empty, rich], [rich, empty]]) {
      const [merged] = mergeForCache(pair)
      expect(merged?.attributes).toMatchObject({ fatPercent: 3.5 })
    }
  })

  it('keeps the uncertain flag — a judge dispute must not be erased by a copy that was never judged', () => {
    // On a cold start the judge samples 1 in 4, so a colliding pair where one
    // was judged and one was not is the EXPECTED case. `false` is usually the
    // absence of a judge call, not counter-evidence.
    //
    // The costs are one-sided: wrongly uncertain withholds a label while the
    // price still shows (D3). Wrongly certain ships a disputed label, and the
    // cache makes it a hit forever, so it never returns to the review queue.
    const certain = entry()
    const disputed = entry({
      classification: { ...entry().classification, isUncertain: true },
    })
    for (const pair of [[certain, disputed], [disputed, certain]]) {
      const [merged] = mergeForCache(pair)
      expect(merged?.classification.isUncertain).toBe(true)
    }
  })

  it('keeps distinct products apart', () => {
    const other = entry({ cacheKey: 'denner brot|t3|p1|s1', normalisedName: 'denner brot' })
    expect(mergeForCache([entry(), other])).toHaveLength(2)
  })

  it('preserves first-seen order, so deliberate cold-start ordering survives', () => {
    const a = entry({ cacheKey: 'a|t3|p1|s1' })
    const b = entry({ cacheKey: 'b|t3|p1|s1' })
    expect(mergeForCache([a, b, a]).map((e) => e.cacheKey)).toEqual(['a|t3|p1|s1', 'b|t3|p1|s1'])
  })

  it('the in-memory cache reports the same count as the real one', async () => {
    // THE REASON THE WHOLE SUITE MISSED THIS. createInMemoryCache is a Map
    // keyed on cacheKey, so it silently absorbs duplicates AND returns
    // entries.length — a count the real adapter cannot produce. Any test that
    // saved duplicates and then inspected the resulting state passed before the
    // fix, for the wrong reason.
    const cache = createInMemoryCache()
    const saved = await cache.save([entry(), entry()])
    expect(isOk(saved) ? saved.value : -1).toBe(1)
  })
})

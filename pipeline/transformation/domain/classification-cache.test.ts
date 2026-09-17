import { describe, expect, it } from 'vitest'

import { CURRENT_ATTRIBUTE_SCHEMA_VERSION } from '../../../shared/attribute-schemas'
import {
  attributesFrom,
  attributesVersionFor,
  createInMemoryCache,
  mergeForCache,
  needsEnrichment,
  summariseEnrichmentOutcomes,
} from './classification-cache'
import type { CachedClassification, EnrichmentOutcome } from './classification-cache'
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
   * WP-P9 (D3): the predicate reads `attributesVersion`, not `attributes`
   * emptiness — see the entries below, which have no `attributes` field at all
   * because none of this is about what the bag holds.
   */
  const entry = (attributesVersion: number | null) => ({ attributesVersion })

  it('flags an entry that has never been resolved', () => {
    expect(needsEnrichment(entry(null))).toBe(true)
  })

  it('leaves an entry resolved under the CURRENT schema alone', () => {
    expect(needsEnrichment(entry(CURRENT_ATTRIBUTE_SCHEMA_VERSION))).toBe(false)
  })

  it('flags a row enriched under an OLDER schema version — a new attribute field shipped since', () => {
    // Deliberately not equal to CURRENT_ATTRIBUTE_SCHEMA_VERSION. Bumping this
    // version must never require bumping the cache key's schemaVersion, which
    // would cold-start CLASSIFICATION too (see the comment on CachedClassification).
    expect(needsEnrichment(entry(CURRENT_ATTRIBUTE_SCHEMA_VERSION - 1))).toBe(true)
  })

  /**
   * THE DEFECT WP-P9 CLOSES, made concrete.
   *
   * "Emmi Milch 1L" genuinely states no fat percentage. Under the OLD rule
   * (attributes empty ⇒ owed), that answer was indistinguishable from "never
   * asked" and the product was re-requested every run, forever. Under the NEW
   * rule, a `statedNothing` outcome sets the version, so it is asked ONCE.
   */
  it('a product whose name states nothing is enriched once, not re-requested every run', () => {
    const statedNothing: EnrichmentOutcome = { kind: 'statedNothing' }
    const resolvedVersion = attributesVersionFor(statedNothing)
    expect(needsEnrichment(entry(resolvedVersion))).toBe(false)
  })

  /**
   * THE OTHER HALF: a rate-limited (or otherwise failed) attempt must NEVER
   * set the version, or a 429'd batch would read as done and never be asked
   * again — trading "re-ask forever" for "never ask", which is worse because
   * it is silent. This is the exact scenario measured on 2026-09-14: 255 of
   * 1,107 backfill calls refused with 429.
   */
  it('a rate-limited product is still owed next run — never marked done', () => {
    const rateLimited: EnrichmentOutcome = { kind: 'failed', reason: 'HTTP 429', rateLimited: true }
    const resolvedVersion = attributesVersionFor(rateLimited)
    expect(resolvedVersion).toBeNull()
    expect(needsEnrichment(entry(resolvedVersion))).toBe(true)
  })

  it('an ordinary failure (not rate-limited) is also still owed next run', () => {
    const unparseable: EnrichmentOutcome = { kind: 'failed', reason: 'unparseable response', rateLimited: false }
    expect(needsEnrichment(entry(attributesVersionFor(unparseable)))).toBe(true)
  })
})

describe('attributesFrom', () => {
  it('returns the stated attributes for a real answer', () => {
    expect(attributesFrom({ kind: 'stated', attributes: { fatPercent: 3.5 } })).toEqual({ fatPercent: 3.5 })
  })

  it('returns an empty bag when nothing was stated', () => {
    expect(attributesFrom({ kind: 'statedNothing' })).toEqual({})
  })

  it('returns an empty bag for a failure — never guesses', () => {
    expect(attributesFrom({ kind: 'failed', reason: 'HTTP 429', rateLimited: true })).toEqual({})
  })
})

describe('attributesVersionFor', () => {
  it('sets the current version for a real answer', () => {
    expect(attributesVersionFor({ kind: 'stated', attributes: { fatPercent: 3.5 } })).toBe(CURRENT_ATTRIBUTE_SCHEMA_VERSION)
  })

  it('sets the current version when nothing was stated — that is still an answer', () => {
    expect(attributesVersionFor({ kind: 'statedNothing' })).toBe(CURRENT_ATTRIBUTE_SCHEMA_VERSION)
  })

  it('leaves the version null for ANY failure, rate-limited or not', () => {
    expect(attributesVersionFor({ kind: 'failed', reason: 'HTTP 429', rateLimited: true })).toBeNull()
    expect(attributesVersionFor({ kind: 'failed', reason: 'unparseable response', rateLimited: false })).toBeNull()
  })
})

describe('summariseEnrichmentOutcomes', () => {
  it('is all zero for no outcomes at all — empty is not a crash', () => {
    expect(summariseEnrichmentOutcomes([])).toEqual({
      attempted: 0,
      enriched: 0,
      statedNothing: 0,
      rateLimited: 0,
      failed: 0,
    })
  })

  it('buckets a mix of outcomes correctly, and counts rate-limited as a SUBSET of failed', () => {
    const outcomes: EnrichmentOutcome[] = [
      { kind: 'stated', attributes: { fatPercent: 3.5 } },
      { kind: 'stated', attributes: { organic: true } },
      { kind: 'statedNothing' },
      { kind: 'failed', reason: 'HTTP 429', rateLimited: true },
      { kind: 'failed', reason: 'HTTP 429', rateLimited: true },
      { kind: 'failed', reason: 'unparseable response', rateLimited: false },
    ]
    expect(summariseEnrichmentOutcomes(outcomes)).toEqual({
      attempted: 6,
      enriched: 2,
      statedNothing: 1,
      rateLimited: 2,
      failed: 3,
    })
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
    attributesVersion: null,
    runId: 'run-1',
    ...over,
  })

  it('collapses two entries for the same product into one', () => {
    expect(mergeForCache([entry(), entry()])).toHaveLength(1)
  })

  it('keeps the enriched attributes when the other entry has none', () => {
    // An unresolved bag is an ABSENCE, not an answer. Writing {} over real
    // attributes costs a backfill round-trip, and on a cold start costs the
    // storage facet until a warm run repairs it (ADR-001).
    const unresolved = entry({ attributes: {}, attributesVersion: null })
    const rich = entry({ attributes: { fatPercent: 3.5 }, attributesVersion: CURRENT_ATTRIBUTE_SCHEMA_VERSION })
    for (const pair of [[unresolved, rich], [rich, unresolved]]) {
      const [merged] = mergeForCache(pair)
      expect(merged?.attributes).toMatchObject({ fatPercent: 3.5 })
    }
  })

  it('keeps the attributesVersion paired with the attributes it belongs to', () => {
    // The version must travel WITH the bag it resolves, never separately —
    // otherwise a resolved version could survive next to a stale empty bag,
    // which `needsEnrichment` would then wrongly call "done".
    const unresolved = entry({ attributes: {}, attributesVersion: null })
    const rich = entry({ attributes: { fatPercent: 3.5 }, attributesVersion: CURRENT_ATTRIBUTE_SCHEMA_VERSION })
    for (const pair of [[unresolved, rich], [rich, unresolved]]) {
      const [merged] = mergeForCache(pair)
      expect(merged?.attributesVersion).toBe(CURRENT_ATTRIBUTE_SCHEMA_VERSION)
    }
  })

  it('keeps a genuinely resolved "stated nothing" row resolved, even paired with an unresolved copy', () => {
    const statedNothing = entry({ attributes: {}, attributesVersion: CURRENT_ATTRIBUTE_SCHEMA_VERSION })
    const neverAsked = entry({ attributes: {}, attributesVersion: null })
    for (const pair of [[statedNothing, neverAsked], [neverAsked, statedNothing]]) {
      const [merged] = mergeForCache(pair)
      expect(merged?.attributesVersion).toBe(CURRENT_ATTRIBUTE_SCHEMA_VERSION)
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

// ClassificationCache — the port, and the cache key.
//
// This is a MEMO, not a checkpoint (design §7.1). Every run processes every
// offer; the cache only makes repeats free. Checkpoint semantics would let a run
// that died between classification and upsert mark a never-stored deal as done.
//
// The key is the whole design. Two rules matter:
//
//   1. Keyed on the NORMALISED NAME, not the retailer. Coca-Cola is Drinks
//      whether Coop or Denner sells it, so one entry serves all seven.
//   2. VERSIONS ARE IN THE KEY. The classic cache bug is improving a prompt and
//      then serving answers from the old one forever. Bumping a version misses
//      every stale entry automatically — no manual flush, no mystery six weeks
//      later. The cost is a cold start, which run-plan.ts handles explicitly.

import type { Result } from '../../collection/domain/result'
import type { Classification } from './classification'
import { markUncertain } from './classification'

/** Bump any of these and every existing entry is invalidated by construction. */
export type CacheVersions = {
  readonly taxonomyVersion: number
  readonly promptVersion: number
  readonly schemaVersion: number
}

export const CURRENT_VERSIONS: CacheVersions = {
  // 22 categories / 76 sub-categories as of 2026-09-10 (ADR-001).
  taxonomyVersion: 3,
  promptVersion: 1,
  schemaVersion: 1,
}

export type CachedClassification = {
  readonly cacheKey: string
  readonly normalisedName: string
  readonly classification: Classification
  readonly attributes: Record<string, unknown>
  readonly runId: string | null
}

/**
 * Normalises a product name for cache lookup.
 *
 * Deliberately aggressive: 'Emmi Caffè Latte' and 'EMMI  CAFFÈ   LATTE' are the
 * same product and must not occupy two entries and cost two model calls.
 *
 * Non-breaking spaces are stripped here as well as in the collection domain —
 * Denner ships U+00A0 between a number and its unit, and a key that differs by
 * an invisible character never matches.
 */
export function normaliseForCache(productName: string): string {
  return productName
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function cacheKeyFor(productName: string, versions: CacheVersions = CURRENT_VERSIONS): string {
  const name = normaliseForCache(productName)
  return `${name}|t${versions.taxonomyVersion}|p${versions.promptVersion}|s${versions.schemaVersion}`
}

/**
 * The port. Infrastructure implements it; the graph depends on this.
 *
 * Never throws — a cache failure must degrade to a cache miss, never take the
 * run down. Losing the memo costs money; losing the run costs a week of data.
 */
export type ClassificationCache = {
  /** Returns only the entries it found. A miss is an absence, not an error. */
  lookup(cacheKeys: readonly string[]): Promise<Result<readonly CachedClassification[]>>
  save(entries: readonly CachedClassification[]): Promise<Result<number>>
}

/** In-memory implementation for tests and dry runs. */
export function createInMemoryCache(seed: readonly CachedClassification[] = []): ClassificationCache {
  const store = new Map<string, CachedClassification>(seed.map((e) => [e.cacheKey, e]))
  return {
    async lookup(keys) {
      const found = keys.map((k) => store.get(k)).filter((v): v is CachedClassification => v !== undefined)
      return { ok: true, value: found }
    },
    async save(entries) {
      // Merge first, exactly as the real adapter does. A bare Map silently
      // absorbs duplicates AND reports entries.length — a count Postgres
      // cannot produce — which is why the whole suite passed straight through
      // the duplicate-key defect. The two implementations of this port must
      // return the same number for the same input.
      const merged = mergeForCache(entries)
      for (const e of merged) store.set(e.cacheKey, e)
      return { ok: true, value: merged.length }
    },
  }
}

/**
 * Whether a cached entry still owes us its attributes.
 *
 * THE OTHER HALF OF DEFERRED ENRICHMENT. A cold start skips enrichment to
 * afford its classification budget (`RunPlan.enrich`), which is only a
 * DEFERRAL if something later picks the work up. A cache hit is otherwise
 * terminal — classify-deals returns `entry.attributes` verbatim and never
 * routes a hit to the enricher — so without this predicate "defer" silently
 * means "those products have no attributes, permanently". `storageFrom` would
 * then yield nothing and the Frozen browse tile would undercount by up to 800
 * (ADR-001).
 *
 * An empty bag is deliberately treated as "ask again" rather than "the
 * retailer stated nothing". The two are indistinguishable once stored, and the
 * costs are not symmetric: re-asking costs one batched call on a warm run,
 * never asking costs the facet forever. The enricher is idempotent, so the
 * safe direction is to re-ask.
 *
 * Note `{ organic: false }` is NOT empty — false is a stated answer.
 */
export function needsEnrichment(entry: { attributes: Record<string, unknown> | null }): boolean {
  const attributes = entry.attributes
  if (!attributes) return true
  return Object.keys(attributes).length === 0
}

/**
 * Collapses entries that share a cache key, folding their fields.
 *
 * WHY THIS EXISTS. `cache_key` is the PRIMARY KEY and the upsert's conflict
 * target. Postgres raises SQLSTATE 21000 — "ON CONFLICT DO UPDATE command
 * cannot affect row a second time" — when one statement carries the same key
 * twice, and rejects the WHOLE statement. Each persist is exactly one statement
 * of 100, so a single duplicate pair discarded ~100 classifications already
 * paid for.
 *
 * The collision is by design, not by accident: the key is deliberately
 * RETAILER-INDEPENDENT, so the same product sold by Coop and Denner produces
 * byte-identical keys. Across seven retailers that is routine. Measured on
 * 2026-09-12: 1,315 products classified, 446 persisted — and 0% once stable
 * ordering put identical names in the same chunk.
 *
 * WHY A FOLD AND NOT A PICK. Colliding entries are usually identical but not
 * always: one may have been judged and the other not (the judge samples 1 in 4
 * on a cold start), one enriched and the other empty.
 *
 *   attributes   first NON-EMPTY wins — an empty bag is an absence, not an
 *                answer, and writing {} over real attributes costs a backfill
 *                round-trip and the storage facet (ADR-001)
 *   isUncertain  STICKY — if any entry is uncertain the survivor is. `false` is
 *                usually the absence of a judge call rather than counter-
 *                evidence, and the costs are one-sided: wrongly uncertain
 *                withholds a label while the price still shows (D3); wrongly
 *                certain ships a disputed label that the cache then serves
 *                forever, never returning to the review queue.
 *   everything else  first-seen wins
 *
 * Last-write-wins — what Postgres and a bare Map both do — is what kept this
 * latent for months, and it is order-dependent in a system whose ordering just
 * changed underneath it.
 */
export function mergeForCache(
  entries: readonly CachedClassification[],
): CachedClassification[] {
  const byKey = new Map<string, CachedClassification>()

  for (const entry of entries) {
    const existing = byKey.get(entry.cacheKey)
    if (!existing) {
      byKey.set(entry.cacheKey, entry)
      continue
    }

    const attributes = needsEnrichment(existing) ? entry.attributes : existing.attributes
    const isUncertain = existing.classification.isUncertain || entry.classification.isUncertain

    byKey.set(entry.cacheKey, {
      ...existing,
      attributes,
      classification: isUncertain
        ? markUncertain(existing.classification)
        : existing.classification,
    })
  }

  return [...byKey.values()]
}

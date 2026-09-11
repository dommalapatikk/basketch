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
      for (const e of entries) store.set(e.cacheKey, e)
      return { ok: true, value: entries.length }
    },
  }
}

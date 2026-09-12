// SupabaseClassificationCache — the memo, persisted.
//
// THE RULE THIS FILE OBEYS, as amended 2026-09-12.
//
// It used to be absolute: a cache failure degrades to a cache MISS, never to a
// run failure — losing the memo costs a few cents of model calls, losing the
// run costs a week of grocery data.
//
// That arithmetic broke when classification moved to a free tier capped at 15
// requests per MINUTE. A lost memo is no longer worth cents; it is worth
// minutes, and enough of them exceed the step timeout. On run 34703713179
// three unreadable lookup chunks (~600 products) turned a warm run — sized at
// ~2 minutes in pipeline.yml — into a cold-start-sized one. Both attempts hit
// the 45-minute wall and nothing was stored. Degrading did not protect the
// run; it guaranteed a slower failure that also spent the quota.
//
// So the rule now reads:
//   - a failed WRITE degrades to a miss, always. (Unchanged.)
//   - a failed READ is RETRIED first — most are transient.
//   - a minority of still-unreadable chunks degrades to a miss.
//   - a majority FAILS the lookup, because proceeding is a doomed run.
//
// The asymmetry between read and write is deliberate: if Supabase cannot be
// read it almost certainly cannot be written either, so a run that presses on
// was going to fail at the storage step regardless.
//
// Supabase vocabulary — PostgrestError, .upsert(), snake_case columns — stops
// here. The domain sees CachedClassification.

import type { SupabaseClient } from '@supabase/supabase-js'
import { type Result, err, isOk, ok } from '../../../collection/domain/result'
import { createClassification, createConfidence } from '../../domain/classification'
import type { CachedClassification, ClassificationCache } from '../../domain/classification-cache'
import { mergeForCache } from '../../domain/classification-cache'

const TABLE = 'product_classification_cache'

/**
 * Postgres has a practical ceiling on `IN (...)` list length, and a 1,800-key
 * lookup in one statement is both slow and fragile.
 */
const LOOKUP_CHUNK = 200
const WRITE_CHUNK = 100

/**
 * How many times one lookup chunk is attempted before it counts as unreadable.
 *
 * Run 34703713179 lost three chunks — ~600 products — to `TypeError: fetch
 * failed`, a transient network error that a single retry would almost
 * certainly have cleared.
 */
const LOOKUP_ATTEMPTS = 3

/** Backoff between lookup attempts. Short: eight chunks, and the run is waiting. */
const LOOKUP_BACKOFF_MS = [250, 1_000] as const

/**
 * How much of the cache may be unreadable before the lookup FAILS instead of
 * quietly reporting a miss.
 *
 * THE REASONING, and why this file's opening rule now has an exception.
 *
 * "Degrade to a miss, never to a run failure" assumed the downside was "a few
 * cents of model calls". Under the free tier's 15 requests/minute that is no
 * longer the downside. On 2026-09-12 losing ~440 cached classifications turned
 * a warm run — which pipeline.yml sizes at ~2 minutes — into a cold-start-sized
 * one that the 45-minute step timeout could not fit. Both attempts died.
 *
 * So proceeding on a mostly-unreadable cache does not degrade gracefully; it
 * guarantees a slow failure while burning the day's quota. Failing here is
 * faster, cheaper, and names the real cause in the log.
 *
 * A minority is still tolerated: one bad chunk in eight loses ~90 hits, which
 * a warm run absorbs. Same shape of judgement as MIN_REFRESH_SHARE in
 * stale-sweep.ts — proceed only on a plausible share of what should be there.
 */
const MAX_UNREADABLE_SHARE = 0.25

type CacheRow = {
  cache_key: string
  normalised_name: string
  category: string
  sub_category: string
  attributes: Record<string, unknown> | null
  confidence: number
  is_uncertain: boolean
  model: string
  tier: number
  taxonomy_version: number
  prompt_version: number
  schema_version: number
  run_id: string | null
}

export type SupabaseCacheDeps = {
  client: SupabaseClient
  versions: { taxonomyVersion: number; promptVersion: number; schemaVersion: number }
  /** Injected so a degraded cache is visible in telemetry rather than silent. */
  onDegraded?: (operation: string, detail: string) => void
  /** Injected so retry tests do not actually wait. */
  sleep?: (ms: number) => Promise<void>
}

function rowToCached(row: CacheRow): CachedClassification | null {
  const conf = createConfidence(Number(row.confidence))
  if (!isOk(conf)) return null

  // Re-validated on READ, not just on write. A row can become invalid without
  // being touched: removing a sub-category from the taxonomy leaves cached rows
  // pointing at something that no longer exists. Treat those as misses.
  const built = createClassification({
    category: row.category,
    subCategory: row.sub_category,
    confidence: conf.value,
    tier: row.tier === 2 ? 2 : 1,
    model: row.model,
  })
  if (!isOk(built)) return null

  return {
    cacheKey: row.cache_key,
    normalisedName: row.normalised_name,
    classification: built.value,
    attributes: row.attributes ?? {},
    runId: row.run_id,
  }
}

export function createSupabaseClassificationCache(deps: SupabaseCacheDeps): ClassificationCache {
  const degraded = (op: string, detail: string) => deps.onDegraded?.(op, detail)
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))

  /**
   * One chunk, retried. Returns null when every attempt failed.
   *
   * Both failure shapes are retried: a THROWN error (`TypeError: fetch failed`
   * — the one that actually bit us) and a returned PostgrestError. Treating
   * only the thrown one as retryable would leave half the hole open.
   */
  async function readChunk(chunk: readonly string[]): Promise<CacheRow[] | null> {
    let lastDetail = 'unknown error'

    for (let attempt = 0; attempt < LOOKUP_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await sleep(LOOKUP_BACKOFF_MS[attempt - 1] ?? LOOKUP_BACKOFF_MS[LOOKUP_BACKOFF_MS.length - 1] ?? 1_000)
      }

      try {
        const { data, error } = await deps.client
          .from(TABLE)
          .select('cache_key,normalised_name,category,sub_category,attributes,confidence,is_uncertain,model,tier,taxonomy_version,prompt_version,schema_version,run_id')
          .in('cache_key', chunk)

        if (!error) return (data ?? []) as CacheRow[]
        lastDetail = error.message
      } catch (e) {
        lastDetail = e instanceof Error ? e.message : String(e)
      }
    }

    degraded('lookup', `${chunk.length} keys unreadable after ${LOOKUP_ATTEMPTS} attempts: ${lastDetail}`)
    return null
  }

  return {
    async lookup(cacheKeys): Promise<Result<readonly CachedClassification[]>> {
      if (cacheKeys.length === 0) return ok([])

      const found: CachedClassification[] = []
      let stale = 0
      let chunks = 0
      let unreadable = 0

      for (let i = 0; i < cacheKeys.length; i += LOOKUP_CHUNK) {
        chunks++
        const rows = await readChunk(cacheKeys.slice(i, i + LOOKUP_CHUNK))
        if (rows === null) {
          unreadable++
          continue
        }

        for (const row of rows) {
          const mapped = rowToCached(row)
          if (mapped) found.push(mapped)
          else stale++
        }
      }

      if (stale > 0) degraded('lookup', `${stale} cached rows no longer satisfy the taxonomy and were ignored`)

      // Note this counts CHUNKS THAT COULD NOT BE READ — not rows that were
      // absent. An empty cache reads cleanly and returns nothing, which is a
      // legitimate zero and must still proceed, or no cold start could ever
      // run.
      if (unreadable > 0 && unreadable > chunks * MAX_UNREADABLE_SHARE) {
        const detail =
          `${unreadable} of ${chunks} lookup chunks could not be read — refusing to treat ` +
          `~${unreadable * LOOKUP_CHUNK} cached products as uncached. Re-classifying them at the ` +
          `free tier's per-minute cap would exceed the step timeout and spend quota already paid.`
        degraded('lookup', detail)
        return err(detail)
      }

      return ok(found)
    },

    async save(entries): Promise<Result<number>> {
      if (entries.length === 0) return ok(0)

      // ⚠️ ONE ROW PER CONFLICT KEY, ENFORCED HERE. Line below is the only place
      // in the codebase that says `onConflict: 'cache_key'`, so this is the
      // layer that owns that clause's precondition: Postgres raises SQLSTATE
      // 21000 and rejects the WHOLE statement if a key appears twice.
      //
      // Putting this in the callers would be an invariant that only exists in
      // the caller — and there are two of them, plus every future one. Merging
      // BEFORE chunking matters too: per-chunk dedupe would still allow two
      // statements for one key, where last-write-wins could overwrite enriched
      // attributes with an empty bag depending on where the chunk boundary fell.
      const merged = mergeForCache(entries)

      let written = 0
      for (let i = 0; i < merged.length; i += WRITE_CHUNK) {
        const chunk = merged.slice(i, i + WRITE_CHUNK)
        const rows: CacheRow[] = chunk.map((e) => ({
          cache_key: e.cacheKey,
          normalised_name: e.normalisedName,
          category: e.classification.category,
          sub_category: e.classification.subCategory,
          attributes: e.attributes,
          confidence: e.classification.confidence.value,
          is_uncertain: e.classification.isUncertain,
          model: e.classification.model,
          tier: e.classification.tier,
          taxonomy_version: deps.versions.taxonomyVersion,
          prompt_version: deps.versions.promptVersion,
          schema_version: deps.versions.schemaVersion,
          run_id: e.runId,
        }))

        try {
          const { error } = await deps.client.from(TABLE).upsert(rows, { onConflict: 'cache_key' })
          if (error) {
            // A failed write means we pay to classify these again next run.
            // Annoying; not a reason to lose the run.
            degraded('save', error.message)
            continue
          }
          written += rows.length
        } catch (e) {
          degraded('save', e instanceof Error ? e.message : String(e))
        }
      }

      return ok(written)
    },
  }
}

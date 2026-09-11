// SupabaseClassificationCache — the memo, persisted.
//
// THE RULE THIS FILE OBEYS: a cache failure degrades to a cache MISS, never to a
// run failure. Losing the memo costs a few cents of model calls. Losing the run
// costs a week of grocery data. So every method catches, logs and returns an
// empty result rather than propagating.
//
// Supabase vocabulary — PostgrestError, .upsert(), snake_case columns — stops
// here. The domain sees CachedClassification.

import type { SupabaseClient } from '@supabase/supabase-js'
import { type Result, isOk, ok } from '../../../collection/domain/result'
import { createClassification, createConfidence } from '../../domain/classification'
import type { CachedClassification, ClassificationCache } from '../../domain/classification-cache'

const TABLE = 'product_classification_cache'

/**
 * Postgres has a practical ceiling on `IN (...)` list length, and a 1,800-key
 * lookup in one statement is both slow and fragile.
 */
const LOOKUP_CHUNK = 200
const WRITE_CHUNK = 100

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

  return {
    async lookup(cacheKeys): Promise<Result<readonly CachedClassification[]>> {
      if (cacheKeys.length === 0) return ok([])

      const found: CachedClassification[] = []
      let stale = 0

      for (let i = 0; i < cacheKeys.length; i += LOOKUP_CHUNK) {
        const chunk = cacheKeys.slice(i, i + LOOKUP_CHUNK)
        try {
          const { data, error } = await deps.client
            .from(TABLE)
            .select('cache_key,normalised_name,category,sub_category,attributes,confidence,is_uncertain,model,tier,taxonomy_version,prompt_version,schema_version,run_id')
            .in('cache_key', chunk)

          if (error) {
            // Degrade to a miss. The run continues and pays for the model.
            degraded('lookup', error.message)
            continue
          }

          for (const row of (data ?? []) as CacheRow[]) {
            const mapped = rowToCached(row)
            if (mapped) found.push(mapped)
            else stale++
          }
        } catch (e) {
          degraded('lookup', e instanceof Error ? e.message : String(e))
        }
      }

      if (stale > 0) degraded('lookup', `${stale} cached rows no longer satisfy the taxonomy and were ignored`)
      return ok(found)
    },

    async save(entries): Promise<Result<number>> {
      if (entries.length === 0) return ok(0)

      let written = 0
      for (let i = 0; i < entries.length; i += WRITE_CHUNK) {
        const chunk = entries.slice(i, i + WRITE_CHUNK)
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

// Supabase storage: upserts deals, logs pipeline runs, deactivates expired deals.
// Product names are normalised before upsert (lowercase, collapse whitespace, standardise units).

import 'dotenv/config'

import type { Deal } from '../shared/types'
import { dealToRow } from '../shared/types'

import { supabase } from './supabase-client'

const BATCH_SIZE = 100

/**
 * Build a composite key for product ID lookups: "store|productName".
 * Used by storeDeals (this file) and run.ts when merging resolved product IDs.
 * Keep these two usages in sync.
 */
export function productLookupKey(store: string, productName: string): string {
  return `${store}|${productName}`
}

// ============================================================
// Product name normalisation
// ============================================================


// Re-exported from the shared kernel: the normalisation is part of the upsert
// key, so every writer and every by-name matcher must use the SAME function.
import { normalizeProductName } from '../shared/types'

export { normalizeProductName }

/**
 * Upserts deals to Supabase in batches of 100.
 * Conflict key: (store, product_name, valid_from).
 * Returns the number of deals successfully stored.
 */
/**
 * What the DATABASE accepted, per store — never what we handed it.
 *
 * `total` was a plain number and `storedCount += batch.length` was a claim, not
 * a measurement: PostgREST returns no error for rows a CHECK constraint
 * rejected, so a batch that landed nothing looked identical to one that worked.
 * On 2026-09-11 that read `Upserted 922 of 922` while the table gained nothing.
 *
 * `byStore` exists because this number feeds `storesSafeToSweep`, which decides
 * which stores have their un-refreshed deals switched off. Fed the input count,
 * a run that stored NOTHING would have deactivated every deal on a public site.
 * A guard fed a lie is not a guard.
 */
export type StoreDealsResult = {
  readonly attempted: number
  readonly total: number
  readonly byStore: Map<string, number>
}

export async function storeDeals(
  deals: Deal[],
  productIds?: Map<string, string>,
): Promise<StoreDealsResult> {
  if (deals.length === 0) return { attempted: 0, total: 0, byStore: new Map() }

  const allRows = deals.map((d) => {
    const row = dealToRow(d, productIds?.get(productLookupKey(d.store, d.productName)))
    // Normalise product name for consistent upsert matching
    row.product_name = normalizeProductName(row.product_name)
    return row
  })

  // Deduplicate by conflict key (store + product_name + valid_from).
  // Postgres fails when a single batch upserts the same row twice.
  // Keep the entry with the highest discount.
  const deduped = new Map<string, (typeof allRows)[number]>()
  for (const row of allRows) {
    const key = `${row.store}|${row.product_name}|${row.valid_from}`
    const existing = deduped.get(key)
    if (!existing || (row.discount_percent ?? 0) > (existing.discount_percent ?? 0)) {
      deduped.set(key, row)
    }
  }
  const rows = [...deduped.values()]
  let storedCount = 0
  const byStore = new Map<string, number>()

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)

    // .select() is the whole point: without it the response carries no rows and
    // a batch the database rejected is indistinguishable from one it accepted.
    const { data, error } = await supabase
      .from('deals')
      .upsert(batch, {
        onConflict: 'store,product_name,valid_from',
      })
      .select('id, store')

    if (error) {
      console.error(
        `[storage] [ERROR] Upsert batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`,
        error.message,
      )
      continue
    }

    const accepted = (data ?? []) as { store: string }[]
    storedCount += accepted.length
    for (const row of accepted) byStore.set(row.store, (byStore.get(row.store) ?? 0) + 1)

    if (accepted.length < batch.length) {
      console.error(
        `[storage] [ERROR] Batch ${Math.floor(i / BATCH_SIZE) + 1}: database accepted ${accepted.length} of ${batch.length} rows`,
      )
    }
  }

  console.log(`[storage] [INFO] Upserted ${storedCount} of ${deals.length} deals`)
  return { attempted: deals.length, total: storedCount, byStore }
}

export interface PipelineRunInput {
  store_results: Record<string, { status: string; count: number }>
  total_stored: number
  duration_ms: number
  error_log: string | null
}

/**
 * Logs a pipeline run to the pipeline_runs table.
 */
export async function logPipelineRun(run: PipelineRunInput): Promise<void> {
  const { error } = await supabase
    .from('pipeline_runs')
    .insert(run)

  if (error) {
    console.error('[storage] [ERROR] Failed to log pipeline run:', error.message)
  }
}

/**
 * Sets is_active=false for deals whose valid_to date is in the past.
 * Returns the number of deals deactivated.
 */
export async function deactivateExpiredDeals(): Promise<number> {
  // Use Swiss local time to match user expectations around midnight
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Zurich' }).format(new Date())

  const { data, error } = await supabase
    .from('deals')
    .update({ is_active: false })
    .eq('is_active', true)
    .lt('valid_to', today)
    .select('id')

  if (error) {
    console.error('[storage] [ERROR] Failed to deactivate expired deals:', error.message)
    return 0
  }

  const count = data?.length ?? 0
  if (count > 0) {
    console.log(`[storage] [INFO] Deactivated ${count} expired deals`)
  }
  return count
}

/**
 * Sync-purge stale rows after a successful fetch.
 *
 * The upsert conflict key is (store, product_name, valid_from). When aktionis
 * changes the valid_from date on a card between runs, upsert creates a NEW
 * row instead of updating, and the old row stays is_active=true until its
 * valid_to passes. Coop accumulated ~450 such stale rows before this was
 * caught.
 *
 * For each store that we successfully refreshed in this run, mark any
 * is_active=true row whose updated_at is older than runStartedAt as inactive.
 * Skipped stores keep their previous data intact (failure-safe).
 *
 * Returns the total number of rows deactivated across all successful stores.
 */
export async function deactivateStaleForStores(
  successfulStores: string[],
  runStartedAt: Date,
): Promise<number> {
  if (successfulStores.length === 0) return 0

  const cutoff = runStartedAt.toISOString()
  const { data, error } = await supabase
    .from('deals')
    .update({ is_active: false })
    .eq('is_active', true)
    .in('store', successfulStores)
    .lt('updated_at', cutoff)
    .select('id, store')

  if (error) {
    console.error('[storage] [ERROR] Failed to deactivate stale deals:', error.message)
    return 0
  }

  const count = data?.length ?? 0
  if (count > 0) {
    const byStore: Record<string, number> = {}
    for (const row of data ?? []) {
      const s = (row as { store: string }).store
      byStore[s] = (byStore[s] ?? 0) + 1
    }
    const breakdown = Object.entries(byStore)
      .sort((a, b) => b[1] - a[1])
      .map(([s, n]) => `${s}=${n}`)
      .join(', ')
    console.log(`[storage] [INFO] Deactivated ${count} stale deals (${breakdown})`)
  }
  return count
}

/**
 * How many active, unexpired deals each store currently has.
 *
 * Read BEFORE the write, so the sweep can ask "did this run refresh a plausible
 * share of what is already live?" rather than merely "did it write anything".
 *
 * The difference is not academic: on 2026-09-11 a quota-truncated run wrote 2
 * Migros deals and swept the 168 that were already there.
 */
export async function activeDealCountByStore(): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('deals')
    .select('store')
    .eq('is_active', true)
    .gte('valid_to', today)
    .limit(10_000)

  if (error) {
    // Fail SAFE: an empty map means every store looks like a first run, which
    // permits sweeping. That is the wrong direction, so say so loudly and let
    // the caller decide — it is better than silently guessing either way.
    console.error('[storage] [ERROR] Could not read active deal counts:', error.message)
    return counts
  }
  for (const row of (data ?? []) as { store: string }[]) {
    counts.set(row.store, (counts.get(row.store) ?? 0) + 1)
  }
  return counts
}

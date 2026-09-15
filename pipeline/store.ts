// Supabase storage: upserts deals, logs pipeline runs, deactivates expired deals.
// Product names are normalised before upsert (lowercase, collapse whitespace, standardise units).

import 'dotenv/config'

import type { Deal } from '../shared/types'
import { dealToRow } from '../shared/types'

import { sweepWindows } from './storage/domain/stale-sweep'
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
 *
 * `windowsByStore` is the same lesson applied to WHICH ROWS may be swept, not
 * just which stores: the publication windows (by `valid_from`) this store's
 * WRITTEN rows actually belong to (see `sweepWindows`, item #10). Built from
 * the same accepted-by-the-database rows as `byStore` — never from `deals`,
 * the input — for the identical reason.
 */
export type StoreDealsResult = {
  readonly attempted: number
  readonly total: number
  readonly byStore: Map<string, number>
  readonly windowsByStore: Map<string, Set<string>>
}

export async function storeDeals(
  deals: Deal[],
  productIds?: Map<string, string>,
): Promise<StoreDealsResult> {
  if (deals.length === 0) return { attempted: 0, total: 0, byStore: new Map(), windowsByStore: new Map() }

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
  const writtenRows: { store: string; validFrom: string }[] = []

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)

    // .select() is the whole point: without it the response carries no rows and
    // a batch the database rejected is indistinguishable from one it accepted.
    // valid_from is selected alongside store/id so sweepWindows below can be
    // built from what the database actually WROTE, not from what was handed
    // to it — the same discipline as `byStore` (defect #5).
    const { data, error } = await supabase
      .from('deals')
      .upsert(batch, {
        onConflict: 'store,product_name,valid_from',
      })
      .select('id, store, valid_from')

    if (error) {
      console.error(
        `[storage] [ERROR] Upsert batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`,
        error.message,
      )
      continue
    }

    const accepted = (data ?? []) as { store: string; valid_from: string }[]
    storedCount += accepted.length
    for (const row of accepted) {
      byStore.set(row.store, (byStore.get(row.store) ?? 0) + 1)
      writtenRows.push({ store: row.store, validFrom: row.valid_from })
    }

    if (accepted.length < batch.length) {
      console.error(
        `[storage] [ERROR] Batch ${Math.floor(i / BATCH_SIZE) + 1}: database accepted ${accepted.length} of ${batch.length} rows`,
      )
    }
  }

  console.log(`[storage] [INFO] Upserted ${storedCount} of ${deals.length} deals`)
  return { attempted: deals.length, total: storedCount, byStore, windowsByStore: sweepWindows(writtenRows) }
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
 * The upsert conflict key is (store, product_name, valid_from). When a
 * retailer changes the valid_from date on a card between runs, upsert
 * creates a NEW row instead of updating, and the old row stays
 * is_active=true until its valid_to passes. Coop accumulated ~450 such
 * stale rows before this was caught.
 *
 * ITEM #10, 2026-09-15 — THE ROW PREDICATE (see stale-sweep.ts for the full
 * reasoning). A row may be swept only if ALL of:
 *   - its store is in `successfulStores` (storesSafeToSweep already
 *     required a plausible refresh share for that store), AND
 *   - its `valid_from` is a window THIS run actually WROTE for that store
 *     (`windowsByStore`, from `sweepWindows` over accepted rows), AND
 *   - its `updated_at` is older than `runStartedAt` (not re-written).
 * A row whose `valid_from` is a window this run did not write is NEVER
 * swept here, however old its `updated_at` — it was never this run's to
 * judge. It stays visible until `deactivateExpiredDeals` retires it on
 * `valid_to`. Run 34833209176 is the incident this guards against: it wrote
 * ALDI/LIDL/SPAR's NEXT WEEK flyer and, without this scope, deactivated
 * every active row of those stores — including the CURRENT week's, which
 * this run never touched — leaving 0 offers in effect for three retailers.
 *
 * Looped per store rather than one query across `successfulStores`: windows
 * differ store to store, and a single `.in('valid_from', …)` shared across
 * stores would let one store's window scope a sweep for another. At most
 * seven stores exist, so this is not the batch-vs-loop antipattern the
 * project avoids elsewhere — it is the only correct shape here.
 *
 * Skipped stores (not in `successfulStores`, or with no recorded window)
 * keep their previous data intact (failure-safe).
 *
 * Returns the total number of rows deactivated across all successful stores.
 */
/**
 * Deactivates one store's stale rows, scoped to that store's own windows —
 * the query the row predicate above describes. Returns the count switched
 * off (0 on a query error, logged and swallowed here so one store's failure
 * does not abort the rest — the same failure-safe shape as the caller).
 */
async function sweepStoreWindows(store: string, windows: Set<string>, cutoff: string): Promise<number> {
  const { data, error } = await supabase
    .from('deals')
    .update({ is_active: false })
    .eq('is_active', true)
    .eq('store', store)
    .in('valid_from', [...windows])
    .lt('updated_at', cutoff)
    .select('id')

  if (error) {
    console.error(`[storage] [ERROR] Failed to deactivate stale deals for ${store}:`, error.message)
    return 0
  }
  return data?.length ?? 0
}

export async function deactivateStaleForStores(
  successfulStores: string[],
  runStartedAt: Date,
  windowsByStore: Map<string, Set<string>>,
): Promise<number> {
  if (successfulStores.length === 0) return 0

  const cutoff = runStartedAt.toISOString()
  const byStore: Record<string, number> = {}

  for (const store of successfulStores) {
    const windows = windowsByStore.get(store)
    // No window recorded means this run wrote nothing for this store — which
    // storesSafeToSweep should already have excluded from successfulStores.
    // If it happens anyway, sweeping nothing is the safe default.
    if (!windows || windows.size === 0) continue

    const n = await sweepStoreWindows(store, windows, cutoff)
    if (n > 0) byStore[store] = n
  }

  const count = Object.values(byStore).reduce((sum, n) => sum + n, 0)
  if (count > 0) {
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

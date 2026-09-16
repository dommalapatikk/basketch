// Supabase storage: upserts deals, logs pipeline runs, deactivates expired deals.
// Product names are normalised before upsert (lowercase, collapse whitespace, standardise units).

import 'dotenv/config'

import type { Deal } from '../shared/types'
import { dealToRow } from '../shared/types'

import type { StoreSweepPlan, WrittenRow } from './storage/domain/stale-sweep'
import { writtenCountsByWindow } from './storage/domain/stale-sweep'
import { productLookupKey } from './storage/domain/product-key'
import { supabase } from './supabase-client'

const BATCH_SIZE = 100

// Moved to storage/domain/product-key.ts (code review of WP-P2): pure, so the
// application layer can import it without constructing this file's Supabase
// client. Re-exported here so existing callers are unaffected.
export { productLookupKey }

// ============================================================
// Product name normalisation
// ============================================================


// Re-exported from the shared kernel: the normalisation is part of the upsert
// key, so every writer and every by-name matcher must use the SAME function.
import { normalizeProductName } from '../shared/types'

export { normalizeProductName }

/**
 * What the DATABASE accepted, per store — never what we handed it.
 *
 * `total` was a plain number and `storedCount += batch.length` was a claim, not
 * a measurement: PostgREST returns no error for rows a CHECK constraint
 * rejected, so a batch that landed nothing looked identical to one that worked.
 * On 2026-09-11 that read `Upserted 922 of 922` while the table gained nothing.
 *
 * `byStore` exists because this number used to feed the store-level sweep
 * guard, and still logs storage shortfalls. Fed the input count, a run that
 * stored NOTHING would have deactivated every deal on a public site. A guard
 * fed a lie is not a guard.
 *
 * `writtenByWindow` is the same lesson applied to WHICH ROWS may be swept,
 * not just which stores: how many rows landed per store PER PUBLICATION
 * WINDOW (`valid_from`) — see `writtenCountsByWindow` and `sweepPlan`, item
 * #10. Built from the same accepted-by-the-database rows as `byStore` —
 * never from `deals`, the input — for the identical reason.
 */
export type StoreDealsResult = {
  readonly attempted: number
  readonly total: number
  readonly byStore: Map<string, number>
  readonly writtenByWindow: Map<string, Map<string, number>>
}

/**
 * F2, 2026-09-15. `accepted` is cast from the database response, not
 * validated — a row missing `valid_from` (a null from a schema drift, a
 * partial select, a future column rename) would silently pollute the sweep
 * with an `undefined` window. This narrows one row, dropping — and WARNing
 * about — any accepted row without a usable `valid_from`, so a malformed row
 * can be excluded from `writtenByWindow` WITHOUT hiding that the database
 * genuinely stored it (see the caller: it still counts toward `byStore`).
 */
function validWindowRow(row: { store: string; valid_from: unknown }): WrittenRow | null {
  if (typeof row.valid_from === 'string' && row.valid_from.length > 0) {
    return { store: row.store, validFrom: row.valid_from }
  }
  console.warn(
    `[storage] [WARN] Accepted row for ${row.store} has no usable valid_from — excluded from the sweep window`,
  )
  return null
}

export async function storeDeals(
  deals: Deal[],
  productIds?: Map<string, string>,
): Promise<StoreDealsResult> {
  if (deals.length === 0) return { attempted: 0, total: 0, byStore: new Map(), writtenByWindow: new Map() }

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
  const writtenRows: WrittenRow[] = []

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)

    // .select() is the whole point: without it the response carries no rows and
    // a batch the database rejected is indistinguishable from one it accepted.
    // valid_from is selected alongside store/id so writtenCountsByWindow below
    // can be built from what the database actually WROTE, not from what was
    // handed to it — the same discipline as `byStore` (defect #5). F2: the
    // exact projection is asserted in store.test.ts, and a mutation dropping
    // valid_from from it is red — silently losing this column is how a
    // TypeScript cast on the response would have hidden the defect.
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

    const accepted = (data ?? []) as { store: string; valid_from: unknown }[]
    storedCount += accepted.length
    for (const row of accepted) {
      byStore.set(row.store, (byStore.get(row.store) ?? 0) + 1)
      const written = validWindowRow(row)
      if (written) writtenRows.push(written)
    }

    if (accepted.length < batch.length) {
      console.error(
        `[storage] [ERROR] Batch ${Math.floor(i / BATCH_SIZE) + 1}: database accepted ${accepted.length} of ${batch.length} rows`,
      )
    }
  }

  console.log(`[storage] [INFO] Upserted ${storedCount} of ${deals.length} deals`)
  return { attempted: deals.length, total: storedCount, byStore, writtenByWindow: writtenCountsByWindow(writtenRows) }
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
 * Deactivates one store's stale rows per its sweep plan: within the plan's
 * `[min, max]` publication range AND restricted to the plan's exact
 * sweepable windows, AND not re-written since `cutoff` — see
 * `deactivateStaleForStores` below for the full row predicate this
 * implements. The range bound and the exact-window bound are deliberately
 * both present: `windows` is already exact, so `gte`/`lte` cannot widen what
 * gets swept, but it is one independent check against a bug in how
 * `windows` was computed ever reaching the database.
 *
 * Returns the count switched off (0 on a query error, logged with
 * `.details`/`.hint` and swallowed here so one store's failure does not
 * abort the rest — the same failure-safe shape as the caller).
 */
async function sweepStoreWindows(store: string, plan: StoreSweepPlan, cutoff: string): Promise<number> {
  const { data, error } = await supabase
    .from('deals')
    .update({ is_active: false })
    .eq('is_active', true)
    .eq('store', store)
    .gte('valid_from', plan.range.min)
    .lte('valid_from', plan.range.max)
    .in('valid_from', [...plan.windows])
    .lt('updated_at', cutoff)
    .select('id')

  if (error) {
    const { details, hint } = error
    console.error(`[storage] [ERROR] Failed to deactivate stale deals for ${store}:`, error.message, {
      details,
      hint,
    })
    return 0
  }
  return data?.length ?? 0
}

/**
 * Sync-purge stale rows after a successful fetch, scoped by `plan` — the
 * output of `sweepPlan` (`storage/domain/stale-sweep.ts`), which is the one
 * place both halves of the row predicate below are decided together.
 *
 * ITEM #10, 2026-09-15 — THE ROW PREDICATE. A row may be swept only if ALL of:
 *   - its store has a plan (`sweepPlan` already required collection to have
 *     succeeded AND a plausible refresh share), AND
 *   - its `valid_from` is one of that store's plan.windows — inside the
 *     range this run published AND clearing the per-window or whole-range
 *     share check (F3/F4) — AND
 *   - its `updated_at` is older than `runStartedAt` (not re-written).
 * A row whose `valid_from` is not in `plan.windows` is NEVER swept here,
 * however old its `updated_at` — it was never this run's to judge. It stays
 * visible until `deactivateExpiredDeals` retires it on `valid_to`.
 *
 * Run 34833209176 is the incident this guards against: it wrote
 * ALDI/LIDL/SPAR's NEXT WEEK flyer and, without a plan, deactivated every
 * active row of those stores — including the CURRENT week's, which this run
 * never touched — leaving 0 offers in effect for three retailers.
 *
 * Looped per store rather than one query across every planned store: ranges
 * and windows differ store to store, and a single shared filter would let
 * one store's window scope a sweep for another. At most seven stores exist,
 * so this is not the batch-vs-loop antipattern the project avoids
 * elsewhere — it is the only correct shape here.
 *
 * A store absent from `plan` (collection failed, or nothing was written)
 * keeps its previous data intact (failure-safe). Every store IN the plan is
 * logged every run, even when it sweeps zero rows — a silent no-op sweep is
 * as worth seeing as a loud one (F5).
 *
 * Returns the total number of rows deactivated across all planned stores.
 */
export async function deactivateStaleForStores(
  runStartedAt: Date,
  plan: Map<string, StoreSweepPlan>,
): Promise<number> {
  if (plan.size === 0) return 0

  const cutoff = runStartedAt.toISOString()
  const byStore: Record<string, number> = {}

  for (const [store, storePlan] of plan) {
    if (storePlan.windows.size === 0) {
      console.log(
        `[storage] [INFO] Swept ${store}: range=[${storePlan.range.min}, ${storePlan.range.max}] windows=[] deactivated=0`,
      )
      continue
    }

    const n = await sweepStoreWindows(store, storePlan, cutoff)
    byStore[store] = n
    console.log(
      `[storage] [INFO] Swept ${store}: range=[${storePlan.range.min}, ${storePlan.range.max}] windows=[${[...storePlan.windows].join(', ')}] deactivated=${n}`,
    )
  }

  const count = Object.values(byStore).reduce((sum, n) => sum + n, 0)
  if (count > 0) {
    const breakdown = Object.entries(byStore)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([s, n]) => `${s}=${n}`)
      .join(', ')
    console.log(`[storage] [INFO] Deactivated ${count} stale deals total (${breakdown})`)
  }
  return count
}

/** Why a live-count read could not be trusted — carried up so the caller can log it, not just react to it. */
export type UnreadableCount = {
  readonly message: string
  readonly details?: string
  readonly hint?: string
}

export type ActiveCountsResult =
  | { readonly ok: true; readonly counts: Map<string, Map<string, number>> }
  | { readonly ok: false; readonly error: UnreadableCount }

const LIVE_COUNT_PAGE_SIZE = 1000

/**
 * How many pages `activeCountsByWindow` will follow before refusing to
 * guess. 50 pages × 1000 rows = 50,000 — this table holds a few thousand
 * rows at the scale this project runs at (CLAUDE.md: 10-50 users, free
 * tier); a real run never gets close. It exists purely so a page that never
 * shrinks — a mock, or a server bug, repeating the same page — terminates
 * instead of looping forever (N2, 2026-09-16: the reviewer's own
 * repeated-page mutation hung on the previous unbounded `for (;;)`).
 */
const MAX_LIVE_COUNT_PAGES = 50

function unreadableFromPostgrestError(error: { message: string; details?: string; hint?: string }): UnreadableCount {
  return { message: error.message, details: error.details, hint: error.hint }
}

/** One page of the active-window read — the `.select` projection and filters live in exactly one place. */
function fetchLiveCountsPage(today: string, from: number) {
  return supabase
    .from('deals')
    .select('store, valid_from', { count: 'exact' })
    .eq('is_active', true)
    .gte('valid_to', today)
    .order('id')
    .range(from, from + LIVE_COUNT_PAGE_SIZE - 1)
}

function accumulatePage(
  counts: Map<string, Map<string, number>>,
  page: readonly { store: string; valid_from: string }[],
): void {
  for (const row of page) {
    const forStore = counts.get(row.store) ?? new Map<string, number>()
    forStore.set(row.valid_from, (forStore.get(row.valid_from) ?? 0) + 1)
    counts.set(row.store, forStore)
  }
}

/**
 * How many active, unexpired deals exist per (store, valid_from) window,
 * read BEFORE this run writes anything (F1, 2026-09-15).
 *
 * PAGINATED, in a deterministic order, with the actual row count requested
 * alongside the page (`{ count: 'exact' }`). PostgREST caps a single
 * request's rows at its configured `db-max-rows` regardless of `.limit()`,
 * SILENTLY — no error, just fewer rows than asked for. Stopping the loop on
 * "this page came back shorter than 1000" (the original F1 fix) is not
 * enough on its own: if the SERVER's own cap is lower than 1000, every page
 * looks "short" from row one, and the loop would stop after page 1 having
 * silently missed everything past the server's cap — the exact same
 * undercount F1 exists to prevent, one layer down (N2, 2026-09-16). The
 * `count: 'exact'` total is computed by Postgres independently of any page
 * size, so comparing it against what was actually paginated catches this:
 * a mismatch is treated as unreadable, not as "that's all there is".
 *
 * Read is per (store, valid_from), not per store — the F1/F3/F4 sweep plan
 * needs to compare a run's write against what was live IN THE SAME WINDOW,
 * not the store's grand total, which could span an unrelated publication.
 *
 * Returns `{ ok: false }` — never a bare empty map — on any read error, an
 * unresolvable page-count mismatch, or exceeding `MAX_LIVE_COUNT_PAGES`, so
 * the caller can tell "genuinely nothing live" from "we don't know" and
 * sweep NOTHING rather than guess. A guard that reads "don't know" as
 * "nothing live" permits sweeping on a lie — the same defect class as #5,
 * one level up the call chain.
 */
export async function activeCountsByWindow(): Promise<ActiveCountsResult> {
  const counts = new Map<string, Map<string, number>>()
  const today = new Date().toISOString().slice(0, 10)
  let from = 0
  let rowsSeen = 0
  let reportedTotal: number | null = null

  for (let pagesFetched = 1; ; pagesFetched++) {
    if (pagesFetched > MAX_LIVE_COUNT_PAGES) {
      const error = { message: `exceeded ${MAX_LIVE_COUNT_PAGES} pages (${MAX_LIVE_COUNT_PAGES * LIVE_COUNT_PAGE_SIZE} rows) without finishing` }
      console.error('[storage] [ERROR] Could not read active window counts:', error.message)
      return { ok: false, error }
    }

    const { data, error, count } = await fetchLiveCountsPage(today, from)

    if (error) {
      const unreadable = unreadableFromPostgrestError(error)
      console.error('[storage] [ERROR] Could not read active window counts:', unreadable.message, {
        details: unreadable.details,
        hint: unreadable.hint,
      })
      return { ok: false, error: unreadable }
    }

    if (count != null) reportedTotal = count
    const page = (data ?? []) as { store: string; valid_from: string }[]
    rowsSeen += page.length
    accumulatePage(counts, page)

    if (page.length < LIVE_COUNT_PAGE_SIZE) break
    from += LIVE_COUNT_PAGE_SIZE
  }

  if (reportedTotal !== null && rowsSeen !== reportedTotal) {
    const error = {
      message: `paginated ${rowsSeen} rows but the server reports ${reportedTotal} live — a page cap below ${LIVE_COUNT_PAGE_SIZE} may have truncated a page silently`,
    }
    console.error('[storage] [ERROR] Could not read active window counts:', error.message)
    return { ok: false, error }
  }

  return { ok: true, counts }
}

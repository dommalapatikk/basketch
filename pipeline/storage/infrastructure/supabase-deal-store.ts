// SupabaseDealStore — writes offers to the `deals` table.
//
// THE RULE THIS FILE EXISTS TO ENFORCE, from CLAUDE.md:
//   "Pipeline sources never throw. They return a result — and do not treat
//    empty as success."
//
// The same applies on the way out. A storage run that writes 3 rows when it
// normally writes 1,600 is a FAILURE, not a quiet success. That distinction is
// the one the old pipeline lacked: `pipeline_runs` recorded that a run
// happened, never whether it stored anything worth having.
//
// Supabase vocabulary — PostgrestError, .upsert(), onConflict — stops here.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Offer } from '../../collection/domain/offer'
import type { Classified, DealRow } from '../domain/deal-row'
import { offerToRow } from '../domain/deal-row'

/**
 * Rows per statement.
 *
 * 1,600 offers in one insert is a single point of failure — one bad row and the
 * whole run stores nothing. Batching means one bad batch loses 100 rows, and the
 * other 1,500 still land.
 */
const BATCH_SIZE = 100

/** Below this share of attempted rows, the run is a failure, not a partial. */
export const MINIMUM_STORE_RATE = 0.8

export type StoreResult = {
  readonly attempted: number
  readonly stored: number
  readonly failed: number
  readonly failures: readonly { batch: number; reason: string; sample: string }[]
  /** False when too little was stored to call the run useful. */
  readonly ok: boolean
}

export type DealStoreDeps = {
  client: SupabaseClient
  runId: string
  log?: (message: string) => void
}

export type OfferWithClassification = {
  readonly offer: Offer
  readonly classified: Classified
}

export function createSupabaseDealStore(deps: DealStoreDeps) {
  const log = deps.log ?? (() => {})

  return {
    /**
     * Writes offers, batch by batch.
     *
     * Never throws. A failed batch is recorded with its reason and a sample
     * product name — the sample matters because "23514 check constraint
     * violation" alone tells you nothing about which product tripped it.
     */
    async store(items: readonly OfferWithClassification[]): Promise<StoreResult> {
      if (items.length === 0) {
        return { attempted: 0, stored: 0, failed: 0, failures: [], ok: true }
      }

      const rows: DealRow[] = items.map((i) => offerToRow(i.offer, i.classified, deps.runId))

      let stored = 0
      const failures: { batch: number; reason: string; sample: string }[] = []

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE)
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1

        try {
          // Upsert, not insert: a source re-run in the same week must update
          // the existing row rather than duplicate it. `unique_deal` is the
          // natural key the table already enforces.
          const { error } = await deps.client
            .from('deals')
            .upsert(batch, { onConflict: 'store,product_name,valid_from', ignoreDuplicates: false })

          if (error) {
            failures.push({
              batch: batchNumber,
              reason: error.message,
              sample: batch[0]?.product_name ?? '?',
            })
            continue
          }
          stored += batch.length
        } catch (e) {
          failures.push({
            batch: batchNumber,
            reason: e instanceof Error ? e.message : String(e),
            sample: batch[0]?.product_name ?? '?',
          })
        }
      }

      const failed = rows.length - stored
      const rate = rows.length === 0 ? 1 : stored / rows.length
      const ok = rate >= MINIMUM_STORE_RATE

      log(`[storage] stored ${stored}/${rows.length} (${(rate * 100).toFixed(0)}%)`)
      for (const f of failures) {
        log(`[storage] batch ${f.batch} failed near "${f.sample}": ${f.reason.slice(0, 120)}`)
      }
      if (!ok) {
        log(`[storage] FAILED — stored ${(rate * 100).toFixed(0)}%, below the ${MINIMUM_STORE_RATE * 100}% floor`)
      }

      return { attempted: rows.length, stored, failed, failures, ok }
    },

    /**
     * Marks expired deals inactive.
     *
     * The date filter on every read query is a safety net; this is the thing it
     * is a net for. Without it the site slowly fills with last month's prices,
     * which is the single most damaging failure for a price comparison.
     */
    async deactivateExpired(today: string): Promise<number> {
      try {
        const { data, error } = await deps.client
          .from('deals')
          .update({ is_active: false })
          .lt('valid_to', today)
          .eq('is_active', true)
          .select('id')

        if (error) {
          log(`[storage] could not deactivate expired deals: ${error.message}`)
          return 0
        }
        const n = data?.length ?? 0
        if (n > 0) log(`[storage] deactivated ${n} expired deals`)
        return n
      } catch (e) {
        log(`[storage] deactivate threw: ${e instanceof Error ? e.message : String(e)}`)
        return 0
      }
    },
  }
}

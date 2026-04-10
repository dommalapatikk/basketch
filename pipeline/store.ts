// Supabase storage: upserts deals, logs pipeline runs, deactivates expired deals.

import 'dotenv/config'

import { createClient } from '@supabase/supabase-js'

import type { Deal, PipelineRun } from '../shared/types'
import { dealToRow } from '../shared/types'

const BATCH_SIZE = 100

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Upserts deals to Supabase in batches of 100.
 * Conflict key: (store, product_name, valid_from).
 * Returns the number of deals successfully stored.
 */
export async function storeDeals(deals: Deal[]): Promise<number> {
  if (deals.length === 0) return 0

  const allRows = deals.map((d) => dealToRow(d))

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

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)

    const { error } = await supabase
      .from('deals')
      .upsert(batch, {
        onConflict: 'store,product_name,valid_from',
      })

    if (error) {
      console.error(
        `[storage] [ERROR] Upsert batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`,
        error.message,
      )
    } else {
      storedCount += batch.length
    }
  }

  console.log(`[storage] [INFO] Upserted ${storedCount} of ${deals.length} deals`)
  return storedCount
}

/**
 * Logs a pipeline run to the pipeline_runs table.
 */
export async function logPipelineRun(
  run: Omit<PipelineRun, 'id' | 'run_at'>,
): Promise<void> {
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
  const today = new Date().toISOString().slice(0, 10)

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

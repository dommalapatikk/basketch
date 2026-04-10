// Pipeline entry point: reads deal JSON files, categorizes, stores, and logs the run.

import 'dotenv/config'

import fs from 'node:fs'
import path from 'node:path'

import type { UnifiedDeal } from '../shared/types'

import { categorizeDeal } from './categorize'
import { storeDeals, logPipelineRun, deactivateExpiredDeals } from './store'
import { isValidDealEntry } from './validate'

function readDealsFile(filename: string): UnifiedDeal[] {
  const filePath = path.resolve(process.cwd(), filename)
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      console.error(`[pipeline] [ERROR] ${filename} is not an array`)
      return []
    }

    const valid: UnifiedDeal[] = []
    let skipped = 0
    for (const entry of parsed) {
      if (isValidDealEntry(entry)) {
        valid.push(entry)
      } else {
        skipped++
      }
    }

    if (skipped > 0) {
      console.warn(`[pipeline] [WARN] Skipped ${skipped} invalid entries in ${filename}`)
    }

    return valid
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`[pipeline] [WARN] Could not read ${filename}: ${message}`)
    return []
  }
}

async function main(): Promise<void> {
  const startTime = Date.now()
  console.log('[pipeline] [INFO] Starting pipeline run')

  // Read deal files from disk (artifacts from previous CI jobs)
  // Artifacts are downloaded to pipeline/ by CI, but Coop writes to coop/ subdirectory.
  // Check both locations for Coop deals.
  const migrosRaw = readDealsFile('migros-deals.json')
  const coopRaw = readDealsFile('coop-deals.json').length > 0
    ? readDealsFile('coop-deals.json')
    : readDealsFile('coop/coop-deals.json')

  const migrosStatus = migrosRaw.length > 0 ? 'success' : 'failed'
  const coopStatus = coopRaw.length > 0 ? 'success' : 'failed'

  if (migrosRaw.length === 0 && coopRaw.length === 0) {
    console.error('[pipeline] [ERROR] No deal data available from either source')
    process.exit(1)
  }

  console.log(
    `[pipeline] [INFO] Read ${migrosRaw.length} Migros deals, ${coopRaw.length} Coop deals`,
  )

  // Categorize all deals
  const allRaw = [...migrosRaw, ...coopRaw]
  const categorized = allRaw.map((deal) => categorizeDeal(deal))

  console.log(`[pipeline] [INFO] Categorized ${categorized.length} deals`)

  // Store deals
  const storedCount = await storeDeals(categorized)

  // Check for significant storage loss (more than 10% of deals failed to store)
  const storageShortfall = categorized.length - storedCount
  const storagePartialFailure = storedCount < categorized.length
  if (storagePartialFailure) {
    console.error(
      `[pipeline] [ERROR] Storage shortfall: stored ${storedCount} of ${categorized.length} deals (${storageShortfall} failed)`,
    )
  }

  // Deactivate expired deals
  const deactivatedCount = await deactivateExpiredDeals()
  if (deactivatedCount > 0) {
    console.log(`[pipeline] [INFO] Deactivated ${deactivatedCount} expired deals`)
  }

  // Build error log from all failure sources
  const errors: string[] = []
  if (migrosStatus === 'failed' || coopStatus === 'failed') {
    errors.push(`Sources: migros=${migrosStatus}, coop=${coopStatus}`)
  }
  if (storagePartialFailure) {
    errors.push(`Storage: stored ${storedCount}/${categorized.length} (${storageShortfall} failed)`)
  }

  // Log pipeline run
  const durationMs = Date.now() - startTime
  await logPipelineRun({
    migros_status: migrosStatus as 'success' | 'failed' | 'skipped',
    migros_count: migrosRaw.length,
    coop_status: coopStatus as 'success' | 'failed' | 'skipped',
    coop_count: coopRaw.length,
    total_stored: storedCount,
    duration_ms: durationMs,
    error_log: errors.length > 0 ? errors.join('; ') : null,
  })

  // Fail hard only if zero deals stored despite having data to store
  if (storedCount === 0 && categorized.length > 0) {
    console.error('[pipeline] [ERROR] Zero deals stored — failing pipeline')
    process.exit(1)
  }

  console.log(`[pipeline] [INFO] Pipeline complete in ${durationMs}ms — stored ${storedCount} deals`)
}

// Exit 0 on partial success (one source), exit 1 on unexpected crash
main().catch((err) => {
  console.error('[pipeline] [ERROR] Unexpected pipeline error:', err)
  process.exit(1)
})

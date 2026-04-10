// Pipeline entry point: reads deal JSON files, categorizes, stores, and logs the run.

import 'dotenv/config'

import fs from 'node:fs'
import path from 'node:path'

import type { UnifiedDeal } from '../shared/types'

import { categorizeDeal } from './categorize'
import { storeDeals, logPipelineRun, deactivateExpiredDeals } from './store'

function readDealsFile(filename: string): UnifiedDeal[] {
  const filePath = path.resolve(process.cwd(), filename)
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      console.error(`[pipeline] [ERROR] ${filename} is not an array`)
      return []
    }
    return parsed as UnifiedDeal[]
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
  const migrosRaw = readDealsFile('migros-deals.json')
  const coopRaw = readDealsFile('coop-deals.json')

  const migrosStatus = migrosRaw.length > 0 ? 'success' : 'failed'
  const coopStatus = coopRaw.length > 0 ? 'success' : 'failed'

  if (migrosRaw.length === 0 && coopRaw.length === 0) {
    console.error('[pipeline] [ERROR] No deal data available from either source')
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

  // Deactivate expired deals
  const deactivatedCount = await deactivateExpiredDeals()
  if (deactivatedCount > 0) {
    console.log(`[pipeline] [INFO] Deactivated ${deactivatedCount} expired deals`)
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
    error_log: null,
  })

  console.log(`[pipeline] [INFO] Pipeline complete in ${durationMs}ms — stored ${storedCount} deals`)
}

// Best-effort: exit 0 even on partial failure
main().catch((err) => {
  console.error('[pipeline] [ERROR] Unexpected pipeline error:', err)
  process.exit(0)
})

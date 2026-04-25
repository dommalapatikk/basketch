// Pipeline entry point: reads deal JSON files, categorizes, stores, and logs the run.

import 'dotenv/config'

import fs from 'node:fs'
import path from 'node:path'

import type { Store, UnifiedDeal } from '../shared/types'
import { ALL_STORES, aktionisSlugToStore } from '../shared/types'

import { categorizeDeal } from './categorize'
import { filterGrocery } from './grocery-filter'
import { extractProductMetadata } from './product-metadata'
import { storeDeals, logPipelineRun, deactivateExpiredDeals, deactivateStaleForStores, normalizeProductName, productLookupKey } from './store'
import { resolveProducts } from './product-resolve'
import { isValidDealEntry } from './validate'

/**
 * Confidence threshold: deals below this score are rejected as "likely
 * miscategorised" and never written to the DB. See v4 spec §13.
 * Lowered from 0.4 → 0.3 after live data showed 42% of real aktionis deals
 * were fallback-tier (no brand/source/keyword match) but still valid groceries.
 * Non-grocery items are already rejected upstream by grocery-filter.
 */
const MIN_TAXONOMY_CONFIDENCE = 0.3

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
  const startDate = new Date(startTime)
  console.log('[pipeline] [INFO] Starting pipeline run')

  // Discover all *-deals.json files in the current working directory
  const cwd = process.cwd()
  const allFiles = fs.readdirSync(cwd)
  const dealFiles = allFiles.filter((f) => /^[a-z][\w-]*-deals\.json$/.test(f))

  // Track per-store status in a map
  const storeStatusMap = new Map<Store, { status: 'success' | 'failed' | 'skipped'; count: number }>()

  // Collect all raw deals, keyed by store
  const storeDealsMap = new Map<Store, UnifiedDeal[]>()

  for (const file of dealFiles) {
    const slug = file.replace('-deals.json', '')
    // Map aktionis slug to internal store name (e.g. 'aldi-suisse' → 'aldi', 'coop-megastore' → 'coop')
    const storeName = aktionisSlugToStore(slug) ?? (ALL_STORES.includes(slug as Store) ? slug as Store : null)
    if (!storeName) {
      console.warn(`[pipeline] [WARN] Unknown store in filename: ${file} — skipping`)
      continue
    }
    const deals = readDealsFile(file)
    // Merge deals if multiple files map to the same store (e.g. coop + coop-megastore)
    const existing = storeDealsMap.get(storeName) ?? []
    storeDealsMap.set(storeName, [...existing, ...deals])
    const prev = storeStatusMap.get(storeName)
    storeStatusMap.set(storeName, {
      status: (existing.length + deals.length) > 0 ? 'success' : (prev?.status ?? 'failed'),
      count: (prev?.count ?? 0) + deals.length,
    })
  }

  // Log summary of what was found
  for (const [store, result] of storeStatusMap) {
    console.log(`[pipeline] [INFO] Read ${result.count} ${store} deals`)
  }

  // Fail early if no deals found at all
  const allRaw = Array.from(storeDealsMap.values()).flat()
  if (allRaw.length === 0) {
    console.error('[pipeline] [ERROR] No deal data available from any source')
    process.exit(1)
  }

  // Step 1: Normalize product names (lowercase, collapse whitespace, standardise units)
  for (const deal of allRaw) {
    deal.productName = normalizeProductName(deal.productName)
  }
  console.log(`[pipeline] [INFO] Normalised ${allRaw.length} product names`)

  // Step 1b: Reject non-grocery items at ingest (Parkside, Silvercrest, etc.).
  // See v4 spec §13 and pipeline/grocery-filter.ts.
  const groceryOnly: UnifiedDeal[] = []
  const rejectionReasons = new Map<string, number>()
  for (const deal of allRaw) {
    const decision = filterGrocery(deal)
    if (decision.keep) {
      groceryOnly.push(deal)
    } else {
      const key = `${decision.reason}:${decision.matched ?? ''}`
      rejectionReasons.set(key, (rejectionReasons.get(key) ?? 0) + 1)
    }
  }
  const rejected = allRaw.length - groceryOnly.length
  if (rejected > 0) {
    const breakdown = [...rejectionReasons.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, n]) => `${k}=${n}`)
      .join(', ')
    console.log(
      `[pipeline] [INFO] Grocery filter rejected ${rejected} non-grocery items (${breakdown})`,
    )
  }

  // Step 2: Extract metadata (brand, quantity, unit, organic flag)
  // Metadata is used downstream by product resolver; log summary here for visibility
  let organicCount = 0
  let brandCount = 0
  let quantityCount = 0
  for (const deal of groceryOnly) {
    const meta = extractProductMetadata(deal.productName, deal.sourceCategory)
    if (meta.isOrganic) organicCount++
    if (meta.brand) brandCount++
    if (meta.quantity != null) quantityCount++
  }
  console.log(
    `[pipeline] [INFO] Metadata: ${brandCount} brands, ${quantityCount} quantities, ${organicCount} organic`,
  )

  // Step 3: Categorize all deals and drop any whose taxonomy confidence is too
  // low (likely miscategorised non-grocery). See §13.
  //
  // We intentionally DO NOT filter out discount_percent=0 rows. aktionis.ch
  // often shows a sale price without the crossed-out original price, which
  // makes discount_percent compute to 0 even though the card was listed as
  // a promo. Dropping these lost ~40% of Migros / LIDL stock unnecessarily.
  const categorized = groceryOnly
    .map((deal) => categorizeDeal(deal))
    .filter((d) => d.taxonomyConfidence >= MIN_TAXONOMY_CONFIDENCE)

  const filtered = groceryOnly.length - categorized.length
  console.log(
    `[pipeline] [INFO] Categorized ${categorized.length} deals (filtered ${filtered} with confidence < ${MIN_TAXONOMY_CONFIDENCE})`,
  )

  // Resolve products per store dynamically
  const storeNames = Array.from(storeStatusMap.keys())
  const resolvedMaps = await Promise.all(
    storeNames.map((store) => resolveProducts(categorized.filter((d) => d.store === store), store)),
  )

  // Merge product ID maps (store|source_name -> product_id)
  // Keyed by store to prevent cross-store name collisions
  const productIds = new Map<string, string>()
  for (let i = 0; i < storeNames.length; i++) {
    const store = storeNames[i]!
    const resolved = resolvedMaps[i]!
    for (const [name, result] of resolved) {
      productIds.set(productLookupKey(store, name), result.productId)
    }
  }

  console.log(`[pipeline] [INFO] Resolved ${productIds.size} products`)

  // Store deals with product_id references
  const storedCount = await storeDeals(categorized, productIds)

  // Sync-purge: any previously-active row for a successfully-refreshed store
  // that wasn't touched in this run is stale and should be deactivated.
  // Stores with failed fetches keep their last-known data (failure-safe).
  const successfulStores = [...storeStatusMap.entries()]
    .filter(([, r]) => r.status === 'success' && r.count > 0)
    .map(([store]) => store)
  await deactivateStaleForStores(successfulStores, startDate)

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
  const failedStores = Array.from(storeStatusMap.entries())
    .filter(([, r]) => r.status === 'failed')
    .map(([store]) => store)
  if (failedStores.length > 0) {
    errors.push(`Sources failed: ${failedStores.join(', ')}`)
  }
  if (storagePartialFailure) {
    errors.push(`Storage: stored ${storedCount}/${categorized.length} (${storageShortfall} failed)`)
  }

  // Build store_results for logPipelineRun
  const storeResults: Record<string, { status: string; count: number }> = {}
  for (const [store, result] of storeStatusMap) {
    storeResults[store] = { status: result.status, count: result.count }
  }

  // Log pipeline run
  const durationMs = Date.now() - startTime
  await logPipelineRun({
    store_results: storeResults,
    total_stored: storedCount,
    duration_ms: durationMs,
    error_log: errors.length > 0 ? errors.join('; ') : null,
  })

  // Fail if stored deals fall below 80% of categorized (significant data loss)
  const storageRatio = categorized.length > 0 ? storedCount / categorized.length : 1
  const STORAGE_THRESHOLD = 0.8
  if (categorized.length > 0 && storageRatio < STORAGE_THRESHOLD) {
    console.error(
      `[pipeline] [ERROR] Storage ratio ${(storageRatio * 100).toFixed(1)}% is below ${STORAGE_THRESHOLD * 100}% threshold — failing pipeline`,
    )
    process.exit(1)
  }

  console.log(`[pipeline] [INFO] Pipeline complete in ${durationMs}ms — stored ${storedCount} deals`)

  // Bust the web-next snapshot cache so fresh data shows up immediately
  // instead of waiting for the cacheLife('hours') safety belt to expire.
  // No-op if either env var is missing — local runs and the legacy `web/`
  // app don't depend on this.
  await pingRevalidateWebhook()
}

async function pingRevalidateWebhook(): Promise<void> {
  const url = process.env.WEB_REVALIDATE_URL
  const secret = process.env.WEB_REVALIDATE_SECRET
  if (!url || !secret) {
    console.log('[pipeline] [INFO] revalidate webhook skipped — env vars not set')
    return
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tag: 'deals' }),
    })
    if (!res.ok) {
      console.error(`[pipeline] [WARN] revalidate webhook ${res.status} ${res.statusText}`)
      return
    }
    console.log('[pipeline] [INFO] revalidate webhook ok')
  } catch (err) {
    console.error('[pipeline] [WARN] revalidate webhook failed:', err)
  }
}

// Exit 0 on partial success (one source), exit 1 on unexpected crash
main().catch((err) => {
  console.error('[pipeline] [ERROR] Unexpected pipeline error:', err)
  process.exit(1)
})

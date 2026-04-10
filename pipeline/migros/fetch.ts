// Fetches current Migros promotions using migros-api-wrapper and outputs UnifiedDeal[].

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { MigrosAPI } from 'migros-api-wrapper'

import type { UnifiedDeal } from '../../shared/types'

import { normalizeMigrosDeal } from './normalize'

const PROMO_PAGE_SIZE = 100
const CARD_BATCH_SIZE = 50

/**
 * Fetch all current Migros promotions.
 * Step 1: Get promo item IDs via getProductPromotionSearch (returns ids only).
 * Step 2: Fetch full product details in batches via getProductCards.
 * Returns UnifiedDeal[] on success, empty array on failure (never throws).
 */
export async function fetchMigrosDeals(): Promise<UnifiedDeal[]> {
  try {
    const guestInfo = await MigrosAPI.account.oauth2.getGuestToken()
    const token = guestInfo.token

    if (!token) {
      console.error('[migros] [ERROR] Failed to obtain guest token')
      return []
    }

    console.log('[migros] [INFO] Guest token acquired')

    // Step 1: Collect all promo item IDs
    const promoUids: number[] = []
    let from = 0
    let hasMore = true

    while (hasMore) {
      const response = await MigrosAPI.products.productDisplay.getProductPromotionSearch(
        {
          from,
          until: from + PROMO_PAGE_SIZE,
        },
        { leshopch: token },
      )

      const items = response?.items
      if (!Array.isArray(items) || items.length === 0) {
        if (from === 0) {
          console.warn('[migros] [WARN] Empty response on first page — API may be down')
        }
        hasMore = false
        break
      }

      for (const item of items) {
        if (item.type === 'PRODUCT' && typeof item.id === 'number') {
          promoUids.push(item.id)
        }
      }

      console.log(
        `[migros] [INFO] Fetched promo page at offset ${from}: ${items.length} items, ${promoUids.length} product IDs so far`,
      )

      if (items.length < PROMO_PAGE_SIZE) {
        hasMore = false
      } else {
        from += PROMO_PAGE_SIZE
      }
    }

    if (promoUids.length === 0) {
      console.log('[migros] [INFO] No promotion IDs found')
      return []
    }

    console.log(`[migros] [INFO] Found ${promoUids.length} promo product IDs, fetching details...`)

    // Step 2: Fetch full product cards in batches
    const deals: UnifiedDeal[] = []

    for (let i = 0; i < promoUids.length; i += CARD_BATCH_SIZE) {
      const batch = promoUids.slice(i, i + CARD_BATCH_SIZE)

      try {
        const cards = await MigrosAPI.products.productDisplay.getProductCards(
          { productFilter: { uids: batch } },
          { leshopch: token },
        )

        if (Array.isArray(cards)) {
          for (const raw of cards) {
            const deal = normalizeMigrosDeal(raw)
            if (deal) {
              deals.push(deal)
            }
          }
        }

        console.log(
          `[migros] [INFO] Batch ${Math.floor(i / CARD_BATCH_SIZE) + 1}: ${batch.length} requested, ${deals.length} total normalized`,
        )
      } catch (batchError) {
        console.error(
          `[migros] [WARN] Batch at offset ${i} failed:`,
          batchError instanceof Error ? batchError.message : batchError,
        )
        // Continue with next batch — partial data is better than none
      }
    }

    console.log(`[migros] [INFO] Fetched ${deals.length} deals total`)
    return deals
  } catch (error) {
    console.error(
      '[migros] [ERROR] Failed to fetch deals:',
      error instanceof Error ? error.message : error,
    )
    return []
  }
}

// When run directly as a script, write output to migros-deals.json
const currentFile = fileURLToPath(import.meta.url)
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)

if (isDirectRun) {
  fetchMigrosDeals().then((deals) => {
    const outputPath = path.resolve(process.cwd(), 'migros-deals.json')
    fs.writeFileSync(outputPath, JSON.stringify(deals, null, 2))
    console.log(`[migros] [INFO] Wrote ${deals.length} deals to ${outputPath}`)
  })
}

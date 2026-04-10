// Fetches current Migros promotions using migros-api-wrapper and outputs UnifiedDeal[].

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { MigrosAPI } from 'migros-api-wrapper'

import type { UnifiedDeal } from '../../shared/types'

import { normalizeMigrosDeal } from './normalize'

const PAGE_SIZE = 100

/**
 * Fetch all current Migros promotions, paginating until no more items.
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

    const deals: UnifiedDeal[] = []
    let from = 0
    let hasMore = true

    while (hasMore) {
      const response = await MigrosAPI.products.productDisplay.getProductPromotionSearch(
        {
          from,
          until: from + PAGE_SIZE,
        },
        { leshopch: token },
      )

      const products = response?.products
      if (!Array.isArray(products) || products.length === 0) {
        if (from === 0) {
          console.warn('[migros] [WARN] Empty response on first page — API may be down')
        } else {
          console.log(`[migros] [INFO] No more items after offset ${from}`)
        }
        hasMore = false
        break
      }

      for (const raw of products) {
        const deal = normalizeMigrosDeal(raw)
        if (deal) {
          deals.push(deal)
        }
      }

      console.log(
        `[migros] [INFO] Fetched page at offset ${from}: ${products.length} raw, ${deals.length} total normalized`,
      )

      // Stop if we got fewer than a full page
      if (products.length < PAGE_SIZE) {
        hasMore = false
      } else {
        from += PAGE_SIZE
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

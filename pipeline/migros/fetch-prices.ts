// Fetches regular (non-promotional) shelf prices for Migros products.
// Uses searchProduct API to find products by keyword, then getProductCards for prices.

import 'dotenv/config'

import { createClient } from '@supabase/supabase-js'
import { MigrosAPI } from 'migros-api-wrapper'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const CARD_BATCH_SIZE = 50

interface PriceResult {
  sourceName: string
  regularPrice: number
  imageUrl: string | null
}

/**
 * Search Migros for products matching a keyword and return their regular prices.
 * Uses searchProduct to find product IDs, then getProductCards for price data.
 */
async function searchRegularPrices(
  keyword: string,
  token: string,
): Promise<PriceResult[]> {
  try {
    const searchResponse = await MigrosAPI.products.productSearch.searchProduct(
      {
        query: keyword,
        language: 'de' as never,
        regionId: 'national' as never,
      },
      { leshopch: token },
    )

    // Extract product UIDs from search results
    const uids: number[] = []
    const products = searchResponse?.products ?? searchResponse?.items ?? []

    if (Array.isArray(products)) {
      for (const item of products) {
        const uid = item?.uid ?? item?.id
        if (typeof uid === 'number') {
          uids.push(uid)
        }
      }
    }

    // Also check if results are nested under a different key
    if (uids.length === 0 && searchResponse && typeof searchResponse === 'object') {
      // Try to find products in any array property
      for (const key of Object.keys(searchResponse)) {
        const val = (searchResponse as Record<string, unknown>)[key]
        if (Array.isArray(val) && val.length > 0 && val[0]?.uid) {
          for (const item of val) {
            if (typeof item.uid === 'number') uids.push(item.uid)
          }
          break
        }
      }
    }

    if (uids.length === 0) return []

    // Limit to first 20 results per keyword (most relevant)
    const limitedUids = uids.slice(0, 20)

    // Fetch product cards for price data
    const results: PriceResult[] = []

    for (let i = 0; i < limitedUids.length; i += CARD_BATCH_SIZE) {
      const batch = limitedUids.slice(i, i + CARD_BATCH_SIZE)

      try {
        const cards = await MigrosAPI.products.productDisplay.getProductCards(
          { productFilter: { uids: batch } },
          { leshopch: token },
        )

        if (Array.isArray(cards)) {
          for (const card of cards) {
            const result = extractRegularPrice(card)
            if (result) results.push(result)
          }
        }
      } catch {
        // Continue with next batch
      }
    }

    return results
  } catch (err) {
    console.warn(
      `[migros-prices] [WARN] Search failed for "${keyword}":`,
      err instanceof Error ? err.message : err,
    )
    return []
  }
}

/**
 * Extract regular price from a Migros product card.
 * Regular price is offer.price.advertisedValue (the shelf price, not promo price).
 */
function extractRegularPrice(raw: unknown): PriceResult | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  const name = (r.title as string) ?? (r.name as string) ?? null
  if (!name) return null

  const offer = r.offer
  if (!offer || typeof offer !== 'object') return null
  const o = offer as Record<string, unknown>

  const price = o.price as Record<string, unknown> | null | undefined
  const regularPrice = typeof price?.advertisedValue === 'number' ? price.advertisedValue : null

  if (regularPrice == null || regularPrice <= 0) return null

  // Normalize product name (same as deal normalizer)
  const sourceName = name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(\d+)\s*x\s*(\d)/g, '$1x$2')
    .replace(/(\d)\s*(ml|cl|dl|l|g|kg)\b/g, '$1$2')

  // Image
  let imageUrl: string | null = null
  const imgTransparent = r.imageTransparent as Record<string, unknown> | null | undefined
  if (imgTransparent?.url && typeof imgTransparent.url === 'string') {
    imageUrl = imgTransparent.url.replace('{stack}', 'original')
  }

  return { sourceName, regularPrice, imageUrl }
}

/**
 * Fetch regular prices for all Migros products that belong to a product group.
 * Strategy:
 * 1. Load all product groups with their search keywords
 * 2. For each group, search Migros by keyword
 * 3. Match results to existing products by source_name
 * 4. Update regular_price in the products table
 */
export async function fetchMigrosRegularPrices(): Promise<number> {
  try {
    const guestInfo = await MigrosAPI.account.oauth2.getGuestToken()
    const token = guestInfo.token

    if (!token) {
      console.error('[migros-prices] [ERROR] Failed to obtain guest token')
      return 0
    }

    console.log('[migros-prices] [INFO] Guest token acquired')

    // Load product groups with search keywords
    const { data: groups, error: groupError } = await supabase
      .from('product_groups')
      .select('id, search_keywords')

    if (groupError || !groups) {
      console.error('[migros-prices] [ERROR] Failed to load product groups:', groupError?.message)
      return 0
    }

    // Load existing Migros products
    const { data: existingProducts, error: prodError } = await supabase
      .from('products')
      .select('id, source_name')
      .eq('store', 'migros')

    if (prodError || !existingProducts) {
      console.error('[migros-prices] [ERROR] Failed to load products:', prodError?.message)
      return 0
    }

    const productLookup = new Map<string, string>()
    for (const p of existingProducts) {
      productLookup.set(p.source_name, p.id)
    }

    // Collect all unique keywords across all groups
    const keywordToGroups = new Map<string, string[]>()
    for (const group of groups) {
      const keywords: string[] = group.search_keywords ?? []
      for (const kw of keywords) {
        const existing = keywordToGroups.get(kw) ?? []
        existing.push(group.id)
        keywordToGroups.set(kw, existing)
      }
    }

    // Search for each unique keyword (deduplicated to minimize API calls)
    const uniqueKeywords = [...keywordToGroups.keys()]
    console.log(`[migros-prices] [INFO] Searching ${uniqueKeywords.length} keywords across ${groups.length} product groups`)

    const updates: { id: string; regular_price: number }[] = []
    let searchCount = 0

    for (const keyword of uniqueKeywords) {
      const results = await searchRegularPrices(keyword, token)
      searchCount++

      for (const result of results) {
        const productId = productLookup.get(result.sourceName)
        if (productId) {
          updates.push({ id: productId, regular_price: result.regularPrice })
        }
      }

      // Rate limiting: small delay between searches
      if (searchCount % 5 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    if (updates.length === 0) {
      console.log('[migros-prices] [INFO] No price updates to apply')
      return 0
    }

    // Deduplicate updates (same product may match multiple keywords)
    const deduped = new Map<string, number>()
    for (const u of updates) {
      const existing = deduped.get(u.id)
      // Keep the lower price if duplicate (more conservative)
      if (existing == null || u.regular_price < existing) {
        deduped.set(u.id, u.regular_price)
      }
    }

    // Batch update products with regular prices
    const now = new Date().toISOString()
    let updatedCount = 0

    for (const [productId, price] of deduped) {
      const { error: updateError } = await supabase
        .from('products')
        .update({ regular_price: price, price_updated_at: now })
        .eq('id', productId)

      if (!updateError) {
        updatedCount++
      }
    }

    console.log(
      `[migros-prices] [INFO] Updated ${updatedCount} of ${deduped.size} Migros products with regular prices`,
    )

    return updatedCount
  } catch (error) {
    console.error(
      '[migros-prices] [ERROR] Failed to fetch prices:',
      error instanceof Error ? error.message : error,
    )
    return 0
  }
}

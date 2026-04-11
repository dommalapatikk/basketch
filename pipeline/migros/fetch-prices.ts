// Fetches regular (non-promotional) shelf prices for Migros products.
// Uses searchProduct API to find products by keyword, then getProductCards for prices.
// Also CREATES new product rows for products not yet in the database.

import 'dotenv/config'

import { createClient } from '@supabase/supabase-js'
import { MigrosAPI } from 'migros-api-wrapper'

import { assignProductGroup } from '../product-group-assign'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const CARD_BATCH_SIZE = 50

interface PriceResult {
  sourceName: string
  regularPrice: number
  imageUrl: string | null
  category: string | null
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

    if (uids.length === 0) {
      console.log(`[migros-prices] [DEBUG] No UIDs found for "${keyword}". Response keys: ${searchResponse ? Object.keys(searchResponse).join(', ') : 'null'}`)
      // Log a sample of the response structure
      if (searchResponse && typeof searchResponse === 'object') {
        for (const key of Object.keys(searchResponse)) {
          const val = (searchResponse as Record<string, unknown>)[key]
          console.log(`[migros-prices] [DEBUG]   key "${key}": type=${typeof val}, isArray=${Array.isArray(val)}, length=${Array.isArray(val) ? val.length : 'n/a'}`)
        }
      }
      return []
    }

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

  // Category from breadcrumbs
  const breadcrumbs = r.breadcrumbs as Array<{ name?: string }> | null | undefined
  const category = breadcrumbs?.[0]?.name?.toLowerCase() ?? null

  return { sourceName, regularPrice, imageUrl, category }
}

/**
 * Check if a product name should be excluded from a group based on exclude_keywords.
 */
function isExcludedByGroup(
  sourceName: string,
  excludeKeywords: string[],
): boolean {
  if (!excludeKeywords || excludeKeywords.length === 0) return false
  const name = sourceName.toLowerCase()
  return excludeKeywords.some((ek) => ek && name.includes(ek.toLowerCase()))
}

/**
 * Fetch regular prices for all Migros products that belong to a product group.
 * Strategy:
 * 1. Load all product groups with their search keywords + exclude keywords
 * 2. For each group, search Migros by keyword
 * 3. Match results to existing products by source_name → update regular_price
 * 4. For unmatched results → CREATE new product rows with regular_price + product_group
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

    // Load product groups with search keywords AND exclude keywords
    const { data: groups, error: groupError } = await supabase
      .from('product_groups')
      .select('id, search_keywords, exclude_keywords, category, product_form')

    if (groupError || !groups) {
      console.error('[migros-prices] [ERROR] Failed to load product groups:', groupError?.message)
      return 0
    }

    // Build lookup: groupId → group data
    const groupLookup = new Map<string, typeof groups[0]>()
    for (const g of groups) {
      groupLookup.set(g.id, g)
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

    // Collect all unique keywords, mapped to their group IDs
    const keywordToGroupIds = new Map<string, string[]>()
    for (const group of groups) {
      const keywords: string[] = group.search_keywords ?? []
      for (const kw of keywords) {
        const existing = keywordToGroupIds.get(kw) ?? []
        existing.push(group.id)
        keywordToGroupIds.set(kw, existing)
      }
    }

    const uniqueKeywords = [...keywordToGroupIds.keys()]
    console.log(`[migros-prices] [INFO] Searching ${uniqueKeywords.length} keywords across ${groups.length} product groups`)

    const updates: { id: string; regular_price: number }[] = []
    const newProducts: {
      source_name: string
      canonical_name: string
      store: 'migros'
      category: string
      product_group: string
      product_form: string
      regular_price: number
      price_updated_at: string
      brand: string | null
      is_organic: boolean
      sub_category: string | null
    }[] = []
    let searchCount = 0

    for (const keyword of uniqueKeywords) {
      const groupIds = keywordToGroupIds.get(keyword) ?? []
      const results = await searchRegularPrices(keyword, token)
      searchCount++

      for (const result of results) {
        // Check if product already exists
        const productId = productLookup.get(result.sourceName)
        if (productId) {
          updates.push({ id: productId, regular_price: result.regularPrice })
          continue
        }

        // New product — check which group it belongs to using exclude_keywords
        let assignedGroupId: string | null = null
        let assignedGroup: typeof groups[0] | null = null

        for (const gid of groupIds) {
          const group = groupLookup.get(gid)
          if (!group) continue
          if (!isExcludedByGroup(result.sourceName, group.exclude_keywords ?? [])) {
            assignedGroupId = gid
            assignedGroup = group
            break
          }
        }

        // Also try the pipeline's regex-based assignment as fallback
        if (!assignedGroupId) {
          const ruleAssignment = assignProductGroup(result.sourceName)
          if (ruleAssignment) {
            assignedGroupId = ruleAssignment.groupId
            assignedGroup = groupLookup.get(ruleAssignment.groupId) ?? null
          }
        }

        if (!assignedGroupId || !assignedGroup) continue

        // Don't add duplicates within this batch
        if (newProducts.some((p) => p.source_name === result.sourceName)) continue

        // Basic metadata extraction
        const nameLower = result.sourceName.toLowerCase()
        const isOrganic = nameLower.includes('bio ') || nameLower.includes('naturaplan')
        const brand = nameLower.startsWith('m-budget') ? 'M-Budget'
          : nameLower.startsWith('m-classic') ? 'M-Classic'
            : nameLower.startsWith('aha!') ? 'aha!'
              : null

        const canonicalName = result.sourceName
          .split(/\s+/)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')

        newProducts.push({
          source_name: result.sourceName,
          canonical_name: canonicalName,
          store: 'migros',
          category: assignedGroup.category ?? 'fresh',
          product_group: assignedGroupId,
          product_form: assignedGroup.product_form ?? 'raw',
          regular_price: result.regularPrice,
          price_updated_at: new Date().toISOString(),
          brand,
          is_organic: isOrganic,
          sub_category: null,
        })

        // Add to lookup so we don't try to create duplicates
        productLookup.set(result.sourceName, 'pending')
      }

      if (searchCount <= 3 || searchCount % 20 === 0) {
        console.log(`[migros-prices] [DEBUG] Keyword "${keyword}": ${results.length} results, ${updates.length} updates total, ${newProducts.length} new products total`)
      }

      // Rate limiting: small delay between searches
      if (searchCount % 5 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    // Apply updates to existing products
    const deduped = new Map<string, number>()
    for (const u of updates) {
      const existing = deduped.get(u.id)
      if (existing == null || u.regular_price < existing) {
        deduped.set(u.id, u.regular_price)
      }
    }

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
      `[migros-prices] [INFO] Updated ${updatedCount} of ${deduped.size} existing Migros products`,
    )

    // Create new products
    let createdCount = 0
    if (newProducts.length > 0) {
      // Batch insert in groups of 100
      for (let i = 0; i < newProducts.length; i += 100) {
        const batch = newProducts.slice(i, i + 100)
        const { error: insertError, data: inserted } = await supabase
          .from('products')
          .upsert(batch, { onConflict: 'store,source_name' })
          .select('id')

        if (insertError) {
          console.error(`[migros-prices] [ERROR] Batch insert failed:`, insertError.message)
        } else {
          createdCount += inserted?.length ?? 0
        }
      }

      console.log(
        `[migros-prices] [INFO] Created ${createdCount} new Migros products with regular prices`,
      )
    }

    return updatedCount + createdCount
  } catch (error) {
    console.error(
      '[migros-prices] [ERROR] Failed to fetch prices:',
      error instanceof Error ? error.message : error,
    )
    return 0
  }
}

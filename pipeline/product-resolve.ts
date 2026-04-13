// Resolves deals to products: finds or creates a product row for each deal,
// then returns a map of source_name -> product_id.
//
// Known limitation: regular_price is not updated for existing products here.
// Migros regular prices are fetched separately by migros/fetch-prices.ts.
// Coop regular prices (deal.originalPrice) are not captured on the product row —
// only stored on the deal row itself. This is acceptable for MVP.

import 'dotenv/config'

import { createClient } from '@supabase/supabase-js'

import type { Deal, ProductMetadata, Store } from '../shared/types'
import { extractProductMetadata } from './product-metadata'
import { assignProductGroup } from './product-group-assign'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const BATCH_SIZE = 100

interface ResolvedProduct {
  productId: string
  productGroup: string | null
}

/**
 * Resolve products for a batch of deals.
 * For each deal: look up or create a product row, then return the product_id mapping.
 *
 * Strategy:
 * 1. Batch-fetch all existing products for the store
 * 2. Match deals to existing products by source_name
 * 3. Create new product rows for unmatched deals
 * 4. Return map: source_name -> product_id
 */
export async function resolveProducts(
  deals: Deal[],
  store: Store,
): Promise<Map<string, ResolvedProduct>> {
  const result = new Map<string, ResolvedProduct>()
  if (deals.length === 0) return result

  // Step 1: Fetch all existing products for this store
  const { data: existingProducts, error: fetchError } = await supabase
    .from('products')
    .select('id, source_name, product_group')
    .eq('store', store)

  if (fetchError) {
    console.error(`[product-resolve] [ERROR] Failed to fetch products for ${store}:`, fetchError.message)
    return result
  }

  // Build lookup map: source_name -> { id, product_group }
  const existing = new Map<string, { id: string; product_group: string | null }>()
  for (const p of existingProducts ?? []) {
    existing.set(p.source_name, { id: p.id, product_group: p.product_group })
  }

  // Step 2: Match deals to existing products, collect new ones
  const newProducts: {
    canonical_name: string
    brand: string | null
    store: Store
    category: string
    sub_category: string | null
    quantity: number | null
    unit: string | null
    is_organic: boolean
    product_form: string
    product_group: string | null
    source_name: string
  }[] = []

  for (const deal of deals) {
    const sourceName = deal.productName
    const existingProduct = existing.get(sourceName)

    if (existingProduct) {
      result.set(sourceName, {
        productId: existingProduct.id,
        productGroup: existingProduct.product_group,
      })
    } else {
      // Extract metadata for new product
      const meta: ProductMetadata = extractProductMetadata(sourceName, deal.sourceCategory)

      // Auto-assign product group
      const groupAssignment = assignProductGroup(sourceName)

      // Build canonical name: strip brand prefix if found
      let canonicalName = deal.productName
      if (meta.brand) {
        const brandLower = meta.brand.toLowerCase()
        const nameLower = canonicalName.toLowerCase()
        if (nameLower.startsWith(brandLower)) {
          canonicalName = canonicalName.slice(brandLower.length).trim()
        }
      }
      // Title case the canonical name
      canonicalName = canonicalName.split(/\s+/).map((w) =>
        w.charAt(0).toUpperCase() + w.slice(1),
      ).join(' ')

      newProducts.push({
        canonical_name: canonicalName,
        brand: meta.brand,
        store,
        category: deal.category,
        sub_category: meta.subCategory ?? deal.subCategory ?? null,
        quantity: meta.quantity,
        unit: meta.unit,
        is_organic: meta.isOrganic,
        product_form: groupAssignment?.productForm ?? meta.productForm,
        product_group: groupAssignment?.groupId ?? null,
        source_name: sourceName,
      })
    }
  }

  // Step 3: Batch-insert new products
  if (newProducts.length > 0) {
    // Deduplicate by source_name (same product can appear in multiple deals within one run)
    const deduped = new Map<string, (typeof newProducts)[number]>()
    for (const p of newProducts) {
      if (!deduped.has(p.source_name)) {
        deduped.set(p.source_name, p)
      }
    }
    const toInsert = [...deduped.values()]

    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE)

      const { data: inserted, error: insertError } = await supabase
        .from('products')
        .upsert(batch, { onConflict: 'store,source_name' })
        .select('id, source_name, product_group')

      if (insertError) {
        console.error(
          `[product-resolve] [ERROR] Failed to insert product batch ${Math.floor(i / BATCH_SIZE) + 1}:`,
          insertError.message,
        )
        continue
      }

      for (const p of inserted ?? []) {
        result.set(p.source_name, {
          productId: p.id,
          productGroup: p.product_group,
        })
      }
    }

    console.log(
      `[product-resolve] [INFO] Created ${toInsert.length} new ${store} products`,
    )
  }

  const resolvedCount = result.size
  const totalDeals = deals.length
  const resolutionRate = Math.round((resolvedCount / totalDeals) * 100)

  console.log(
    `[product-resolve] [INFO] Resolved ${resolvedCount}/${totalDeals} ${store} deals to products (${resolutionRate}%)`,
  )

  if (resolutionRate < 80) {
    console.warn(
      `[product-resolve] [WARN] Low resolution rate for ${store}: ${resolutionRate}%. Check product creation logic.`,
    )
  }

  return result
}

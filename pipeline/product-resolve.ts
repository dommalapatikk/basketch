// Resolves deals to products: finds or creates a product row for each deal,
// then returns a map of source_name -> product_id.
//
// Known limitation: regular_price is not updated for existing products here.
// Migros regular prices are fetched separately by migros/fetch-prices.ts.
// Coop regular prices (deal.originalPrice) are not captured on the product row —
// only stored on the deal row itself. This is acceptable for MVP.
//
// WP-1c (2026-09-25 tech-lead plan, RCA §2.2): this used to read the WHOLE
// `products` table for a store with no `.range()`. PostgREST's `max-rows`
// caps an unpaged SELECT at 1,000 rows, SILENTLY — Coop alone has 7,793.
// ~90% of a week's products looked "new" to the in-memory map built from that
// capped read, and were re-upserted onto their EXISTING rows, rewriting
// first-seen-adjacent columns and logging "Created 916 new coop products"
// when 147 were actually new.
//
// The fix (P2, "resolve identity by key set, in batches"): look up ONLY the
// source_names THIS RUN needs, chunked through `.in()` — the same shape
// `supabase-classification-cache.ts` already uses for the same reason. A
// filtered read never depends on how many rows the table holds.

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

/**
 * How many `source_name`s ride in one `.in()` lookup or one grouped upsert.
 * Chosen well under any PostgREST/HTTP query-length limit — a store's whole
 * weekly run (a few hundred to ~2,000 names) becomes a handful of requests
 * instead of one unpaged, uncapped-in-principle read.
 */
const CHUNK_SIZE = 200

interface ResolvedProduct {
  productId: string
  productGroup: string | null
}

/**
 * One row of the existing-products lookup.
 *
 * `canonical_name`, `store` and `category` are NOT NULL with no default
 * (`00000000000000_baseline.sql`) — they ride, UNCHANGED, on the offer-date
 * grouped upsert below purely so Postgres's own row-validation does not
 * reject the statement. Postgres validates NOT NULL on the candidate row
 * BEFORE it even looks at `ON CONFLICT`, so a partial-column upsert that
 * omits them fails outright, conflict or not. Echoing back the value already
 * in the database is not a rewrite — the offer-date upsert never has a
 * different value to put there.
 */
interface ExistingProductRow {
  id: string
  source_name: string
  product_group: string | null
  canonical_name: string
  category: string
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

/**
 * Looks up existing products by (store, source_name) key set — chunked,
 * never a whole-table read.
 *
 * Returns `null` (never an empty map) when a chunk could not be read, so the
 * caller can tell "no existing products" from "some are unknown" and refuses
 * to treat an unreadable name as new — creating one on a guess would mint a
 * duplicate that a later run can never undo.
 */
async function fetchExistingByKeySet(
  store: Store,
  sourceNames: readonly string[],
): Promise<Map<string, ExistingProductRow> | null> {
  const existing = new Map<string, ExistingProductRow>()

  for (const namesChunk of chunk(sourceNames, CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('products')
      .select('id, source_name, product_group, canonical_name, category')
      .eq('store', store)
      .in('source_name', namesChunk)

    if (error) {
      console.error(
        `[product-resolve] [ERROR] Failed to look up existing ${store} products by key set:`,
        error.message,
      )
      return null
    }
    for (const row of (data ?? []) as ExistingProductRow[]) {
      existing.set(row.source_name, row)
    }
  }

  return existing
}

/**
 * Resolve products for a batch of deals.
 * For each deal: look up or create a product row, then return the product_id mapping.
 *
 * Strategy:
 * 1. Look up existing products by THIS RUN's key set (chunked `.in()`)
 * 2. Match deals to existing products; queue offer-date updates for matches
 * 3. Insert ONLY the missing products (ignoreDuplicates — never rewrites an
 *    existing row's canonical_name or product_group)
 * 4. Grouped-upsert offer dates onto existing rows, one request per batch
 */
export async function resolveProducts(
  deals: Deal[],
  store: Store,
): Promise<Map<string, ResolvedProduct>> {
  const result = new Map<string, ResolvedProduct>()
  if (deals.length === 0) return result

  // Step 1: look up only the keys THIS RUN needs.
  const distinctNames = [...new Set(deals.map((d) => d.productName))]
  const existing = await fetchExistingByKeySet(store, distinctNames)

  if (existing === null) {
    // A chunk was unreadable — we cannot tell new from existing for ANY name
    // in this run. The deals are still stored (without a product_id; see
    // run-pipeline.ts resolveProductIds), and the next run tries again.
    return result
  }

  // Step 2: match deals to existing products, collect new ones + offer date updates
  const offerDateUpdates: {
    id: string
    store: Store
    source_name: string
    canonical_name: string
    category: string
    offer_valid_from: string
    offer_valid_to: string | null
  }[] = []
  const newProducts: {
    canonical_name: string
    brand: string | null
    store: Store
    category: string
    is_organic: boolean
    product_form: string
    product_group: string | null
    source_name: string
    offer_valid_from: string | null
    offer_valid_to: string | null
  }[] = []

  for (const deal of deals) {
    const sourceName = deal.productName
    const existingProduct = existing.get(sourceName)

    if (existingProduct) {
      result.set(sourceName, {
        productId: existingProduct.id,
        productGroup: existingProduct.product_group,
      })
      // Queue offer date update for existing product
      if (deal.validFrom) {
        offerDateUpdates.push({
          id: existingProduct.id,
          store,
          source_name: existingProduct.source_name,
          canonical_name: existingProduct.canonical_name,
          category: existingProduct.category,
          offer_valid_from: deal.validFrom,
          offer_valid_to: deal.validTo ?? null,
        })
      }
    } else {
      // Extract metadata for new product
      const meta: ProductMetadata = extractProductMetadata(sourceName, deal.sourceCategory)

      // Auto-assign product group
      const groupAssignment = assignProductGroup(sourceName)
      if (!groupAssignment) {
        console.log(`[product-group-assign] [UNMATCHED] ${store}: ${sourceName}`)
      }

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
        is_organic: meta.isOrganic,
        product_form: groupAssignment?.productForm ?? meta.productForm,
        product_group: groupAssignment?.groupId ?? null,
        source_name: sourceName,
        offer_valid_from: deal.validFrom ?? null,
        offer_valid_to: deal.validTo ?? null,
      })
    }
  }

  // Step 3: insert ONLY the missing ones. `ignoreDuplicates: true` means a
  // row that turns out to already exist (a concurrent run, a stale lookup)
  // is left completely untouched — no canonical_name, no product_group,
  // nothing rewritten — and `.select()` after an ignore-duplicates upsert
  // returns ONLY the rows Postgres actually inserted. That is what
  // "DB-confirmed" means below: the log line reports what the database did,
  // never what we intended to send.
  if (newProducts.length > 0) {
    // Deduplicate by source_name (same product can appear in multiple deals within one run)
    const deduped = new Map<string, (typeof newProducts)[number]>()
    for (const p of newProducts) {
      if (!deduped.has(p.source_name)) {
        deduped.set(p.source_name, p)
      }
    }
    const toInsert = [...deduped.values()]

    let insertedCount = 0
    for (const batch of chunk(toInsert, BATCH_SIZE)) {
      const { data: inserted, error: insertError } = await supabase
        .from('products')
        .upsert(batch, { onConflict: 'store,source_name', ignoreDuplicates: true })
        .select('id, source_name, product_group')

      if (insertError) {
        console.error(
          `[product-resolve] [ERROR] Failed to insert product batch:`,
          insertError.message,
        )
        continue
      }

      for (const p of inserted ?? []) {
        result.set(p.source_name, {
          productId: p.id,
          productGroup: p.product_group,
        })
        insertedCount++
      }
    }

    console.log(
      `[product-resolve] [INFO] Created ${insertedCount} new ${store} products`,
    )
  }

  // Step 4: offer dates for existing rows — ONE grouped upsert per batch,
  // never one request per row. `onConflict: 'id'` is the same idiom
  // `store.ts` uses for deals: a single statement that updates N rows with N
  // different values, matched on the primary key.
  if (offerDateUpdates.length > 0) {
    let updatedDates = 0
    let failedDates = 0
    let firstFailure: string | null = null

    for (const batch of chunk(offerDateUpdates, BATCH_SIZE)) {
      // ⚠️ A Supabase query builder RESOLVES with `{ error }` on a PostgREST
      // failure — it does not reject. The old `Promise.all` over one
      // `.update().eq('id', id)` per row threw the settled values away and
      // reported the number of rows we INTENDED to write as though the
      // database had accepted them. Same shape as the writeEnrichment loss
      // of 2026-09-11. `.select()` here is what makes a rejected statement
      // visible, and `data.length` is the only count this function trusts.
      const { data, error } = await supabase
        .from('products')
        .upsert(
          batch.map(({ id, store: s, source_name, canonical_name, category, offer_valid_from, offer_valid_to }) => ({
            id,
            store: s,
            source_name,
            canonical_name,
            category,
            offer_valid_from,
            offer_valid_to,
          })),
          { onConflict: 'id' },
        )
        .select('id')

      if (error) {
        failedDates += batch.length
        firstFailure ??= error.message
        continue
      }
      updatedDates += data?.length ?? 0
    }

    if (failedDates > 0) {
      console.error(
        `[product-resolve] [ERROR] Failed to update offer dates on ${failedDates} of ${offerDateUpdates.length} ${store} products (first error: ${firstFailure})`,
      )
    }
    if (updatedDates > 0) {
      console.log(
        `[product-resolve] [INFO] Updated offer dates on ${updatedDates} existing ${store} products`,
      )
    }
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

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
// source_names THIS RUN needs, chunked through `.in()`.
//
// M-1 (2026-09-26 review). The first version of this fix chunked by KEY
// COUNT (`CHUNK_SIZE = 200`), which the review comment above once claimed was
// "the same shape `supabase-classification-cache.ts` already uses" — it was
// not: that file chunks by BYTES (`LOOKUP_BUDGET_BYTES = 5_000`), precisely
// because it already hit this exact failure in production (run
// 34703713179): `source_name` is a raw retailer string carrying umlauts, `%`,
// `&` and spaces that percent-encode to 3-6 bytes each, so a 200-key chunk of
// long Coop names can silently overflow postgrest-js's 8,000-byte
// `urlLengthLimit` while a chunk of short ones would not — "exactly 3 of 8
// chunks failed on every attempt, the chunks holding the longest names."
//
// The fix now: `chunkByEncodedSize` (`pipeline/shared-kernel/`), the SAME
// function the classification cache uses, imported rather than duplicated so
// the two contexts cannot drift back into two different chunking rules. A
// failed chunk is retried (bounded) and, if still unreadable, degrades ONLY
// that chunk's names to "unreadable" — never the whole store. The old
// `fetchExistingByKeySet` returned `null` (never an empty map) the moment ANY
// chunk failed, which zeroed EVERY Coop deal's product_id on a single
// oversized chunk. See `fetchExistingByKeySet` below.

import 'dotenv/config'

import { createClient } from '@supabase/supabase-js'

import type { Deal, ProductMetadata, Store } from '../shared/types'
import { chunkByEncodedSize, encodedSize } from './shared-kernel/chunk-by-encoded-size'
import { extractProductMetadata } from './product-metadata'
import { assignProductGroup } from './product-group-assign'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** How many rows ride in one grouped insert or offer-date upsert (a request BODY, not a `.in()` URL — no byte-budget concern). */
const BATCH_SIZE = 100

/**
 * How many times one `.in()` lookup chunk is attempted before it counts as
 * unreadable. Bounded, same shape as `supabase-classification-cache.ts`'s
 * `LOOKUP_ATTEMPTS` — most read failures here are transient (a dropped
 * connection, a momentary timeout) and clear on retry.
 */
const LOOKUP_ATTEMPTS = 3

/** Backoff between lookup attempts. Short: a run has up to seven stores to get through. */
const LOOKUP_BACKOFF_MS = [100, 400] as const

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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

/** The outcome of one (store, source_name) key-set lookup, chunked by byte budget. */
type KeySetLookup = {
  readonly existing: Map<string, ExistingProductRow>
  /**
   * source_names whose chunk stayed unreadable after every retry (M-1). A
   * name in here is NEVER resolved and NEVER treated as new this run —
   * creating one on a guess would mint a duplicate a later run can never
   * undo. Deliberately per-NAME, not per-store: a bad chunk must degrade
   * only the names it carried, not every deal for the store.
   */
  readonly unreadable: ReadonlySet<string>
}

/**
 * One `.in()` lookup chunk, retried up to `LOOKUP_ATTEMPTS` times. Returns
 * `null` only once every attempt has failed — the caller then degrades
 * EXACTLY THIS CHUNK's names to unreadable, never the whole store (M-1).
 */
async function readLookupChunk(
  store: Store,
  namesChunk: readonly string[],
  chunkIndex: number,
): Promise<ExistingProductRow[] | null> {
  let lastMessage = 'unknown error'

  for (let attempt = 0; attempt < LOOKUP_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(LOOKUP_BACKOFF_MS[attempt - 1] ?? LOOKUP_BACKOFF_MS[LOOKUP_BACKOFF_MS.length - 1] ?? 400)
    }

    const { data, error } = await supabase
      .from('products')
      .select('id, source_name, product_group, canonical_name, category')
      .eq('store', store)
      .in('source_name', namesChunk)

    if (!error) return (data ?? []) as ExistingProductRow[]
    lastMessage = error.message
  }

  console.error(
    `[product-resolve] [ERROR] Lookup chunk ${chunkIndex} for ${store} (${namesChunk.length} names, ` +
      `${encodedSize(namesChunk)} encoded bytes) unreadable after ${LOOKUP_ATTEMPTS} attempts: ${lastMessage}`,
  )
  return null
}

/**
 * Looks up existing products by (store, source_name) key set — chunked by
 * BYTE BUDGET (`chunkByEncodedSize`), never by key count and never a
 * whole-table read (M-1, see file header).
 *
 * A chunk that stays unreadable after retry degrades ONLY ITS OWN names to
 * `unreadable`, never the whole store's map to `null` — the earlier version
 * of this function did exactly that, and one oversized Coop chunk zeroed
 * every Coop deal's product_id, deterministically, every run.
 */
async function fetchExistingByKeySet(store: Store, sourceNames: readonly string[]): Promise<KeySetLookup> {
  const existing = new Map<string, ExistingProductRow>()
  const unreadable = new Set<string>()

  let chunkIndex = 0
  for (const namesChunk of chunkByEncodedSize(sourceNames)) {
    chunkIndex++
    const rows = await readLookupChunk(store, namesChunk, chunkIndex)
    if (rows === null) {
      for (const name of namesChunk) unreadable.add(name)
      continue
    }
    for (const row of rows) existing.set(row.source_name, row)
  }

  return { existing, unreadable }
}

/** One queued offer-date update. Exported nowhere — see `dedupeOfferDateUpdates` for the shape's only other consumer. */
type OfferDateUpdate = {
  id: string
  store: Store
  source_name: string
  canonical_name: string
  category: string
  offer_valid_from: string
  offer_valid_to: string | null
}

/**
 * M-2 (2026-09-26 review). Two deals that resolve to the SAME existing
 * product (a duplicate parse, or two promotion windows landing in one run)
 * used to push TWO entries here, both carrying the same `id`. The single
 * grouped `ON CONFLICT (id) DO UPDATE` upsert then proposed the same
 * conflict key twice, and Postgres rejects the WHOLE STATEMENT for that
 * (SQLSTATE 21000) — losing up to a whole batch (100) products' offer dates,
 * not just the duplicate pair.
 *
 * Dedupe by `id` before the upsert. THE RULE, documented here because it is
 * the only place it is decided: the entry with the LATEST `offer_valid_from`
 * wins — the most recently-starting promotion window is the one worth
 * keeping current on the product row. Ties (identical `offer_valid_from`)
 * keep whichever is encountered LAST, matching the old per-row
 * `Promise.all` behaviour (last write won).
 */
function dedupeOfferDateUpdates(updates: readonly OfferDateUpdate[]): OfferDateUpdate[] {
  const byId = new Map<string, OfferDateUpdate>()
  for (const update of updates) {
    const current = byId.get(update.id)
    if (!current || update.offer_valid_from >= current.offer_valid_from) {
      byId.set(update.id, update)
    }
  }
  return [...byId.values()]
}

/**
 * Resolve products for a batch of deals.
 * For each deal: look up or create a product row, then return the product_id mapping.
 *
 * Strategy:
 * 1. Look up existing products by THIS RUN's key set (chunked by byte budget, M-1)
 * 2. Match deals to existing products; queue offer-date updates for matches
 * 3. Insert ONLY the missing products (ignoreDuplicates — never rewrites an
 *    existing row's canonical_name or product_group)
 * 4. Dedupe offer-date updates by product id (M-2), then grouped-upsert them
 *    onto existing rows, one request per batch
 */
export async function resolveProducts(
  deals: Deal[],
  store: Store,
): Promise<Map<string, ResolvedProduct>> {
  const result = new Map<string, ResolvedProduct>()
  if (deals.length === 0) return result

  // Step 1: look up only the keys THIS RUN needs.
  const distinctNames = [...new Set(deals.map((d) => d.productName))]
  const { existing, unreadable } = await fetchExistingByKeySet(store, distinctNames)

  if (unreadable.size > 0) {
    console.warn(
      `[product-resolve] [WARN] ${unreadable.size} of ${distinctNames.length} ${store} product names were ` +
        `unreadable this run — their deals get no product_id and are skipped, never guessed as new`,
    )
  }

  // Step 2: match deals to existing products, collect new ones + offer date updates
  const offerDateUpdates: OfferDateUpdate[] = []
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
    // M-1: a name whose lookup chunk was unreadable is NEVER resolved and
    // NEVER treated as new — we genuinely do not know which it is, and
    // guessing "new" would mint a duplicate a later run can never undo.
    if (unreadable.has(sourceName)) continue

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
  //
  // M-2: deduped by id FIRST. Two deals resolving to the same existing
  // product would otherwise put the same conflict key into one upsert twice,
  // and Postgres rejects the WHOLE grouped statement for that (SQLSTATE
  // 21000) — losing every OTHER product's offer date in the same batch too.
  const dedupedOfferDateUpdates = dedupeOfferDateUpdates(offerDateUpdates)
  if (dedupedOfferDateUpdates.length > 0) {
    let updatedDates = 0
    let failedDates = 0
    let firstFailure: string | null = null

    for (const batch of chunk(dedupedOfferDateUpdates, BATCH_SIZE)) {
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
        `[product-resolve] [ERROR] Failed to update offer dates on ${failedDates} of ${dedupedOfferDateUpdates.length} ${store} products (first error: ${firstFailure})`,
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

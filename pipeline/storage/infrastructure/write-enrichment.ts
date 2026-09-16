// writeEnrichment — the second write, for columns `UnifiedDeal` cannot carry.
//
// The main storage step writes through UnifiedDeal, which has no room for a
// CropRegion, a price basis, or integer rappen. Those are written here, keyed on
// the constraint the table already enforces: unique_deal
// (store, product_name, valid_from).
//
// WHY A SEPARATE WRITE RATHER THAN A BIGGER ONE
// Splitting means the two halves fail independently. If this pass breaks, the
// deals are already stored — the site loses flyer images and price-basis flags,
// not its prices. Folding it into the main write would put every deal at risk
// to gain a crop rectangle.
//
// It is also idempotent: re-running updates the same rows by natural key.
//
// ⚠️ WP-C4 (QuantityRequirement) — two findings recorded here, not fixed here.
//
// 1. `minQuantity` does NOT travel through this pass. It is a plain nullable
//    number (like `quantity` on UnifiedDeal already), so it fits the MAIN
//    write directly — see `offerToUnifiedDeal`'s own comment for why routing
//    it through here specifically would be the wrong call.
//
// 2. The natural key THIS FILE already uses — `store|productName|validFrom`,
//    the same three columns as the database's `unique_deal` constraint — has
//    no room for a quantity requirement at all. `collection/domain/offer.ts`
//    (`offerKey`) was changed to keep a multi-buy offer and its single-item
//    sibling apart IN MEMORY for exactly this reason (WP-C4). This file was
//    NOT changed to match, and — more importantly — NEITHER WAS THE DATABASE
//    CONSTRAINT ITSELF (`supabase/migrations/20260916_quantity_requirement.sql` adds
//    only the column, deliberately, see that file's own note on why widening
//    the constraint is a coordinated, cross-lane change, not a one-file fix).
//    So a real week where the SAME product carries both an everyone-price
//    AND an "ab N Stück" price collapses to ONE row two separate ways before
//    either could reach this file:
//      - `pendingEnrichment.set(enrichment.key, enrichment)` in
//        `run-pipeline.ts` (a `Map`, keyed on this same natural key) silently
//        keeps only the LAST offer processed for that key — the same
//        "a `Map` absorbed a real collision" shape as HANDOVER §4's
//        `createInMemoryCache` defect.
//      - `store.ts`'s own upsert-batch dedupe collapses the two long before
//        either reaches this file, keeping whichever has the higher
//        `discount_percent` — usually the multi-buy row, silently.
//    Neither failure throws, logs or is visible in the funnel. It does not
//    happen on the KW36 fixture (none of the five multi-buy product names
//    collide with any single-item one), so nothing here is red — this is a
//    known, currently-open gap for the next real week that prints both forms
//    for one product, not a regression this WP introduces.

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeProductName } from '../../../shared/types'
import type { DealEnrichment } from '../domain/offer-to-unified'

/** Rows per statement. One bad batch loses 50 enrichments, not all of them. */
const BATCH_SIZE = 50

/**
 * Applies enrichment to already-stored deals.
 *
 * Returns how many rows were updated. Never throws: a failure here must not
 * take down a run whose deals are already safely written.
 */
export async function writeEnrichment(
  client: SupabaseClient,
  enrichments: readonly DealEnrichment[],
  log: (message: string) => void = () => {},
): Promise<number> {
  if (enrichments.length === 0) return 0

  let updated = 0
  let failed = 0
  let missed = 0

  for (let i = 0; i < enrichments.length; i += BATCH_SIZE) {
    const batch = enrichments.slice(i, i + BATCH_SIZE)

    // Updated one at a time inside the batch: PostgREST cannot express
    // "update these 50 rows, each with different values, matched on a
    // three-column key" in a single statement. The batching exists to bound
    // the damage of a failure, not to reduce round trips.
    for (const e of batch) {
      const [store, rawName, validFrom] = e.key.split('|')
      if (!store || !rawName || !validFrom) {
        failed++
        continue
      }
      // ⚠️ MATCH THE NAME THE WAY STORAGE WROTE IT. storeDeals normalises
      // product_name before the upsert (store.ts), so an enrichment keyed on
      // the raw offer name updates ZERO rows — and PostgREST reports no error
      // for that. On 2026-09-11 this pass logged "enriched 1618/1620" while the
      // database ended with zero crops and zero labelled member prices.
      const productName = normalizeProductName(rawName)

      try {
        const { data, error } = await client
          .from('deals')
          .update({
            sale_price_rappen: e.sale_price_rappen,
            original_price_rappen: e.original_price_rappen,
            price_basis: e.price_basis,
            loyalty_programme: e.loyalty_programme,
            page_image_url: e.page_image_url,
            crop_x: e.crop_x,
            crop_y: e.crop_y,
            crop_w: e.crop_w,
            crop_h: e.crop_h,
          })
          .eq('store', store)
          .eq('product_name', productName)
          .eq('valid_from', validFrom)
          // .select() is what makes a no-op visible: without it an UPDATE that
          // matched nothing is indistinguishable from one that worked.
          .select('id')

        if (error) {
          failed++
          // The first failure is worth seeing in full; the rest are counted.
          if (failed === 1) log(`enrichment failed for "${productName}": ${error.message.slice(0, 120)}`)
          continue
        }
        if (!data || data.length === 0) {
          // The row is not there — held back by classification, or the key
          // does not match what storage wrote. Either way nothing was
          // enriched, and counting it as success is how this hid for a day.
          missed++
          if (missed === 1) log(`enrichment matched no row for "${productName}" (${store}, ${validFrom})`)
          continue
        }
        updated++
      } catch (e2) {
        failed++
        if (failed === 1) log(`enrichment threw for "${productName}": ${e2 instanceof Error ? e2.message : String(e2)}`)
      }
    }
  }

  if (failed > 0) log(`enrichment: ${failed} of ${enrichments.length} failed`)
  if (missed > 0) {
    log(
      `enrichment: ${missed} of ${enrichments.length} matched NO row — those deals have no crop, no price basis and no rappen. Expected while a cold start holds products back; investigate if it persists once classification is complete.`,
    )
  }
  return updated
}

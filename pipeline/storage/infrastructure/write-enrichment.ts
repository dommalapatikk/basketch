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

import type { SupabaseClient } from '@supabase/supabase-js'
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

  for (let i = 0; i < enrichments.length; i += BATCH_SIZE) {
    const batch = enrichments.slice(i, i + BATCH_SIZE)

    // Updated one at a time inside the batch: PostgREST cannot express
    // "update these 50 rows, each with different values, matched on a
    // three-column key" in a single statement. The batching exists to bound
    // the damage of a failure, not to reduce round trips.
    for (const e of batch) {
      const [store, productName, validFrom] = e.key.split('|')
      if (!store || !productName || !validFrom) {
        failed++
        continue
      }

      try {
        const { error } = await client
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

        if (error) {
          failed++
          // The first failure is worth seeing in full; the rest are counted.
          if (failed === 1) log(`enrichment failed for "${productName}": ${error.message.slice(0, 120)}`)
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
  return updated
}

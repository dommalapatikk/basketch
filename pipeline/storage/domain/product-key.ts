// product-key — the composite key product-id lookups are keyed on.
//
// Pure: no Supabase, no fetch. Moved out of `store.ts` (code review of
// WP-P2) so the application layer (`run-pipeline.ts`) can import it without
// transitively constructing the real Supabase client — `store.ts` does that
// at module load time, which is exactly the "correct unit nothing wires up"
// shape this project keeps tripping over.

/**
 * Build a composite key for product ID lookups: "store|productName".
 * Used by `storeDeals` (store.ts) and `run-pipeline.ts` when merging resolved
 * product IDs. Keep both usages in sync.
 */
export function productLookupKey(store: string, productName: string): string {
  return `${store}|${productName}`
}

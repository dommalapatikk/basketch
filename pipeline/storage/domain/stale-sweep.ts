// Which stores may have their un-refreshed deals switched off.
//
// `deactivateStaleForStores` is the most destructive thing the pipeline does:
// it sets is_active = false on every deal for a store that this run did not
// touch. The reasoning behind it is sound — a deal the retailer no longer
// advertises should stop showing — but it rests entirely on one assumption:
//
//   THIS RUN ACTUALLY REFRESHED THAT STORE.
//
// If it did not, "not refreshed by this run" does not mean "withdrawn by the
// retailer". It means we failed, and sweeping turns our failure into an empty
// aisle on a public site.
//
// WHY THIS IS A SEPARATE, PURE MODULE. The rule used to live implicitly in
// run.ts, as `successfulStores` derived from whether the FETCH succeeded — a
// different question from whether anything was STORED. On 2026-09-11 the two
// came apart for the first time: all seven retailers collected 1,670 offers,
// then every classification call timed out and nothing was written. Collection
// had "succeeded" for all seven, so the sweep would have deactivated every deal
// on the site. A 15-minute step timeout fired first, which is luck, not design.
//
// An invariant that only exists in the caller is a comment, not an invariant.

export type SweepInput = {
  /** Stores whose collection succeeded this run. */
  readonly collectionSucceeded: readonly string[]
  /** Rows this run actually wrote, per store. */
  readonly storedByStore: ReadonlyMap<string, number>
}

/**
 * The stores it is safe to sweep: collection succeeded AND at least one row was
 * written. Both halves are required.
 *
 * Erring towards keeping stale data is deliberate and matches the rule the
 * collection module already follows — a stale week from the previous run is
 * visibly old, while an empty site looks broken and loses the visitor.
 */
export function storesSafeToSweep(input: SweepInput): string[] {
  return input.collectionSucceeded.filter((store) => (input.storedByStore.get(store) ?? 0) > 0)
}

/**
 * Counts rows per store, for the map above.
 *
 * Takes the deals that were HANDED TO the writer. It is an upper bound on what
 * landed — an upsert can still fail — but it distinguishes the case that
 * matters here: whether this run had anything at all to say about a store.
 */
export function countByStore(deals: readonly { store: string }[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const d of deals) counts.set(d.store, (counts.get(d.store) ?? 0) + 1)
  return counts
}

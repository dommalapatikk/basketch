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
  /** Rows this run actually wrote, per store — from the DATABASE, not the input. */
  readonly storedByStore: ReadonlyMap<string, number>
  /**
   * Rows already live for each store, before this run.
   *
   * Sweeping asserts "anything I did not refresh has been withdrawn by the
   * retailer". That is only credible if this run refreshed a plausible SHARE of
   * what is already there — see MIN_REFRESH_SHARE.
   *
   * Optional so existing callers keep compiling; absent means "nothing live",
   * which is the correct reading for a store's first run.
   */
  readonly activeByStore?: ReadonlyMap<string, number>
}

/**
 * How much of a store's live set this run must refresh before it may sweep.
 *
 * THE REGRESSION THIS NUMBER EXISTS FOR, 2026-09-11. The guard previously asked
 * only "did this store write at least one row". A cold start ran out of daily
 * quota partway through the queue, wrote 2 Migros deals and 33 Lidl deals, and
 * both stores qualified — so the sweep deactivated the 168 and 176 good rows
 * already live. The site fell from 787 deals to 491. The run destroyed far more
 * than it added.
 *
 * 0.5 rather than something tighter: retailers genuinely run shorter weeks, and
 * a flyer cycle of 60% of the previous week is ordinary. Losing MORE than half
 * in one week is not a promotion cycle — it is us.
 */
export const MIN_REFRESH_SHARE = 0.5

/**
 * The stores it is safe to sweep: collection succeeded AND at least one row was
 * written. Both halves are required.
 *
 * Erring towards keeping stale data is deliberate and matches the rule the
 * collection module already follows — a stale week from the previous run is
 * visibly old, while an empty site looks broken and loses the visitor.
 */
export function storesSafeToSweep(input: SweepInput): string[] {
  return input.collectionSucceeded.filter((store) => {
    const written = input.storedByStore.get(store) ?? 0
    if (written === 0) return false

    // Nothing live yet — a first run has nothing to protect.
    const live = input.activeByStore?.get(store) ?? 0
    if (live === 0) return true

    return written >= live * MIN_REFRESH_SHARE
  })
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

// ============================================================
// Which ROWS may be swept (item #10, 2026-09-15)
// ============================================================
//
// `storesSafeToSweep` above answers "may this STORE be swept at all" — a
// coarse, store-level eligibility gate. It says nothing about which of that
// store's rows are fair game, and until this fix `deactivateStaleForStores`
// filled that gap with `updated_at < runStart` alone: every active row of an
// eligible store, WHATEVER ITS validFrom.
//
// That reads "not refreshed by this run" as "withdrawn by the retailer",
// which is only true if the run could have refreshed it. Run 34833209176
// (2026-09-15) fetched ALDI's, LIDL's and SPAR's NEXT WEEK flyer — a
// different, later publication from the one currently in effect. This run
// never touched — and never intended to touch — this week's rows, but the
// sweep does not distinguish "not touched because withdrawn" from "not
// touched because it isn't the publication we fetched". Deactivated 316
// (aldi=143, lidl=80, spar=69, coop=19, denner=5); ALDI, LIDL and SPAR fell
// to 0 offers in effect.
//
// THE ROW PREDICATE (what may be swept, stated once so it is not
// re-derived, wrongly, at the call site):
//
//   - Row's store was refreshed this run (storesSafeToSweep), AND
//   - Row's valid_from is a window THIS RUN WROTE for that store, AND
//   - Row's updated_at is older than this run's start (not re-written)
//     ⇒ withdrawn from that publication → SWEEP.
//
//   - Row's valid_from is a window this run did NOT write for that store
//     ⇒ this run has no opinion on it. It is NEVER swept by this run;
//       it lives until deactivateExpiredDeals expires it on valid_to.
//
// `sweepWindows` supplies the second clause: the set of publication windows
// (by valid_from) a store's WRITTEN rows actually belong to. `store.ts`
// applies it with `.in('valid_from', …)` per store, alongside the existing
// `updated_at` cutoff.

/** A row this run's write actually accepted — never a row merely attempted. */
export type WrittenRow = {
  readonly store: string
  readonly validFrom: string
}

/**
 * Groups the rows this run WROTE into the publication windows they belong to,
 * per store — the scope `deactivateStaleForStores` must restrict itself to.
 *
 * Fed from what the DATABASE accepted (see `StoreDealsResult.windowsByStore`
 * in `store.ts`), never from what was merely attempted — the same lesson as
 * `storedByStore` above (defect #5): a guard fed a count of intent, not
 * outcome, is not a guard.
 */
export function sweepWindows(writtenRows: readonly WrittenRow[]): Map<string, Set<string>> {
  const windows = new Map<string, Set<string>>()
  for (const row of writtenRows) {
    const forStore = windows.get(row.store) ?? new Set<string>()
    forStore.add(row.validFrom)
    windows.set(row.store, forStore)
  }
  return windows
}

// CONSIDERED AND DEFERRED: computing MIN_REFRESH_SHARE per publication window
// rather than per store. Store-level share can be misleading once a store
// carries two live windows at once (this week's, still in effect, and next
// week's, newly published) — a thin write to the NEW window can look
// "plausible" only because it is compared against the OLD window's healthy
// count. The row-level scope above already prevents the data-loss failure
// mode this store-level share exists to catch (a thin write can no longer
// license switching off an unrelated window), so this WP stops at row
// scoping and leaves per-window share sizing to a follow-up rather than
// widening `storesSafeToSweep`'s contract and every test built on it here.

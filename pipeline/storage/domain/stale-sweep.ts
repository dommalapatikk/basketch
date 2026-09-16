// Which rows may be deactivated when a store is refreshed — the sweep plan.
//
// `deactivateStaleForStores` is the most destructive thing the pipeline does:
// it can set is_active = false on deals for a store that this run refreshed.
// The reasoning is sound — a deal the retailer no longer advertises should
// stop showing — but every clause below exists because a plausible-sounding
// version of that reasoning caused real, live data loss.
//
// THIS MODULE ANSWERS TWO QUESTIONS, TOGETHER, SO THEY CANNOT DISAGREE:
//   1. Should this STORE be swept at all this run?
//   2. Within an eligible store, which WINDOWS (valid_from dates) may be
//      swept, and which are out of this run's jurisdiction to judge?
//
// `sweepPlan` is the single answer to both. There used to be two separate
// guards (`storesSafeToSweep` at the store level, an unscoped `updated_at`
// cutoff at the row level) that could each look correct in isolation and
// still license the wrong sweep together — see the two incidents below.

// ============================================================
// Written rows and windows
// ============================================================

/** A row this run's WRITE actually accepted — never a row merely attempted. */
export type WrittenRow = {
  readonly store: string
  readonly validFrom: string
}

/** store → (valid_from → row count). Shared shape for both live and written counts. */
export type CountsByWindow = ReadonlyMap<string, ReadonlyMap<string, number>>

/**
 * Counts the rows this run WROTE, per store, per publication window
 * (`valid_from`). Fed from what the DATABASE accepted (see
 * `StoreDealsResult.writtenByWindow` in `store.ts`), never from what was
 * merely attempted — the same lesson as the old `storedByStore` guard
 * (2026-09-11 defect #5): a guard fed a count of intent, not outcome, is not
 * a guard.
 */
export function writtenCountsByWindow(writtenRows: readonly WrittenRow[]): Map<string, Map<string, number>> {
  const counts = new Map<string, Map<string, number>>()
  for (const row of writtenRows) {
    const forStore = counts.get(row.store) ?? new Map<string, number>()
    forStore.set(row.validFrom, (forStore.get(row.validFrom) ?? 0) + 1)
    counts.set(row.store, forStore)
  }
  return counts
}

// ============================================================
// The share guard
// ============================================================

/**
 * How much of what is already live a run must refresh before any of it may
 * be swept. Reused by BOTH clauses of `sweepPlan` below — one constant, so
 * the per-window check and the whole-range check can never disagree about
 * what "plausible" means.
 *
 * THE REGRESSION THIS NUMBER EXISTS FOR, 2026-09-11. A guard that asked only
 * "did this store write at least one row" let a quota-truncated cold start —
 * 2 Migros deals, 33 Lidl deals — sweep the 168 and 176 good rows already
 * live. The site fell from 787 deals to 491.
 *
 * 0.5 rather than something tighter: retailers genuinely run shorter weeks,
 * and a flyer cycle of 60% of the previous week is ordinary. Losing MORE than
 * half in one week is not a promotion cycle — it is us.
 */
export const MIN_REFRESH_SHARE = 0.5

// ============================================================
// The sweep plan (item #10, 2026-09-15 — F1/F3/F4)
// ============================================================
//
// THE INCIDENT. Run 34833209176 fetched ALDI's, LIDL's and SPAR's NEXT WEEK
// flyer, wrote it, and the row-level sweep then deactivated every active row
// of those stores whose `updated_at` predated the run — including THIS
// WEEK's rows, a publication the run never touched. ALDI, LIDL and SPAR fell
// to 0 offers in effect. An exact-match fix (sweep only the exact
// `valid_from` dates written this run) closes that hole, but reopens the
// sweep's ORIGINAL purpose: a retailer card whose start date moves between
// runs, or is withdrawn entirely between two dates that were never
// themselves re-written, would never be swept again.
//
// THE PLAN, per store:
//   - RANGE — `[min, max]` of the `valid_from` dates this run actually
//     WROTE. Only windows inside this range are ever in scope; a disjoint
//     earlier publication (this week, while next week is being written)
//     cannot be reached by construction — no share math is needed to protect
//     it.
//   - Within the range, a window W is SWEEPABLE only if:
//       (a) W was WRITTEN this run, and the write is a plausible share of
//           what was already live in THAT EXACT window
//           (written(W) ≥ MIN_REFRESH_SHARE × live(W)) — blocks a thin
//           write (e.g. 2 of 57) from licensing the rest of its own window.
//       (b) W was NOT written this run (a card's start date moved off it, or
//           it was dropped outright) but the run's write covers a plausible
//           share of the WHOLE range it published
//           (Σwritten(range) ≥ MIN_REFRESH_SHARE × Σlive(range)) — this is
//           what lets a moved Coop card be swept from its old date without
//           requiring every in-between date to be individually re-written.
//   - A window failing both clauses is left alone. It stays visible until
//     `deactivateExpiredDeals` retires it on `valid_to` — the same
//     failure-safe default the rest of this module uses throughout.
//
// `store.ts` turns a plan into the actual query: `.gte(min).lte(max)` scopes
// the range at the database, `.in('valid_from', […])` restricts it further
// to exactly the sweepable windows the plan computed.
//
// A NOTE ON WHAT CLAUSE (b) CANNOT SEE. Clause (b) protects an unwritten
// in-range window using only the RANGE'S aggregate share — it has no
// per-window number for that date, because nothing was written to it. If two
// DIFFERENT, independently-scheduled publications ever shared a store and
// overlapped so that an unwritten window belonged to a still-running
// publication this run did not touch at all (rather than to the one it did),
// clause (b) could not tell the difference and would judge that window by
// the wrong range's share. No current retailer's schedule produces that
// overlap — each store publishes one flyer edition at a time — so this is a
// documented limit of the model, not a live defect.

export type StoreSweepPlan = {
  /** `[min, max]` of the valid_from dates this run wrote for this store. */
  readonly range: { readonly min: string; readonly max: string }
  /** The exact valid_from dates, within the range, this run may sweep. */
  readonly windows: ReadonlySet<string>
}

export type SweepPlanInput = {
  /** Stores whose collection succeeded this run. */
  readonly collectionSucceeded: readonly string[]
  /** What THIS run wrote, per store, per window — from the DATABASE. */
  readonly writtenByWindow: CountsByWindow
  /**
   * What was already live, per store, per window, BEFORE this run wrote
   * anything. `null` — never an empty map — means the read failed: an
   * unreadable count must sweep NOTHING, anywhere. An empty map that silently
   * stands in for "we don't know" reads as "nothing is live", which permits
   * sweeping on a guess. See `store.ts#activeCountsByWindow`.
   */
  readonly liveByWindow: CountsByWindow | null
}

function sumWindowCounts(byWindow: ReadonlyMap<string, number>, windows: Iterable<string>): number {
  let total = 0
  for (const w of windows) total += byWindow.get(w) ?? 0
  return total
}

function windowIsSweepable(
  validFrom: string,
  written: ReadonlyMap<string, number>,
  live: ReadonlyMap<string, number>,
  rangeShareOk: boolean,
): boolean {
  const writtenCount = written.get(validFrom)
  if (writtenCount === undefined) {
    // (b) never touched this run — only sweepable if the WHOLE range is
    // trustworthy, since there is no per-window number to judge it by.
    return rangeShareOk
  }
  // (a) touched this run — judged on its own live count, not the range's.
  const liveCount = live.get(validFrom) ?? 0
  return liveCount === 0 || writtenCount >= liveCount * MIN_REFRESH_SHARE
}

/**
 * Every candidate window for a store: every date this run wrote, plus every
 * currently-live date that falls inside the range those written dates
 * define. A window this run neither wrote nor has any live row in cannot be
 * swept (there is nothing to sweep) and is correctly absent from both sets.
 */
function candidateWindows(
  writtenDates: readonly string[],
  live: ReadonlyMap<string, number>,
  range: { min: string; max: string },
): Set<string> {
  const candidates = new Set<string>(writtenDates)
  for (const validFrom of live.keys()) {
    if (validFrom >= range.min && validFrom <= range.max) candidates.add(validFrom)
  }
  return candidates
}

/**
 * Builds one store's plan. Returns `null` if this run wrote nothing for the
 * store — there is no range to define, and nothing to protect by sweeping.
 */
function planForStore(store: string, input: SweepPlanInput): StoreSweepPlan | null {
  const written = input.writtenByWindow.get(store)
  if (!written || written.size === 0) return null

  const writtenDates = [...written.keys()].sort()
  const range = { min: writtenDates[0]!, max: writtenDates[writtenDates.length - 1]! }
  const live = input.liveByWindow?.get(store) ?? new Map<string, number>()
  const candidates = candidateWindows(writtenDates, live, range)

  const liveInRange = sumWindowCounts(live, candidates.values())
  const writtenInRange = sumWindowCounts(written, candidates.values())
  const rangeShareOk = liveInRange === 0 || writtenInRange >= liveInRange * MIN_REFRESH_SHARE

  const windows = new Set<string>()
  for (const validFrom of candidates) {
    if (windowIsSweepable(validFrom, written, live, rangeShareOk)) windows.add(validFrom)
  }

  return { range, windows }
}

/**
 * The sweep plan for every eligible store. A store appears in the result iff
 * its collection succeeded AND it wrote at least one row this run — the same
 * two-part eligibility the retired `storesSafeToSweep` enforced, now folded
 * into one function so there is exactly one place this decision is made.
 *
 * `plan.get(store).windows` may be EMPTY — that is a real, meaningful
 * outcome ("wrote something, but none of it clears the share guard"), kept
 * distinct from the store being absent entirely ("wrote nothing this run")
 * so callers can log the right reason.
 */
export function sweepPlan(input: SweepPlanInput): Map<string, StoreSweepPlan> {
  const plan = new Map<string, StoreSweepPlan>()
  if (input.liveByWindow === null) return plan // an unreadable live count sweeps nothing, anywhere

  for (const store of input.collectionSucceeded) {
    const storePlan = planForStore(store, input)
    if (storePlan) plan.set(store, storePlan)
  }
  return plan
}

// ============================================================
// A pure fake that APPLIES a plan — for outcome-based tests
// ============================================================
//
// `store.ts` turns a plan into a Postgres query; this turns it into a filter
// over an in-memory row list, so a test can assert the OUTCOME ("this
// week's 143 ALDI rows stay active") rather than only the shape of the query
// sent. It mirrors `sweepStoreWindows`'s predicate exactly — is_active,
// store, valid_from ∈ windows, updated_at < cutoff — and nothing else.

export type FakeDealRow = {
  readonly id: string
  readonly store: string
  readonly validFrom: string
  readonly updatedAt: string
  readonly isActive: boolean
}

/** The ids of the rows a plan would deactivate, applied to a fake table. */
export function rowsToSweep(
  rows: readonly FakeDealRow[],
  plan: ReadonlyMap<string, StoreSweepPlan>,
  cutoffIso: string,
): readonly string[] {
  return rows
    .filter((row) => row.isActive)
    .filter((row) => plan.get(row.store)?.windows.has(row.validFrom) ?? false)
    .filter((row) => row.updatedAt < cutoffIso)
    .map((row) => row.id)
}

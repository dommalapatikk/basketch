// IsoWeek — value object for a canonical ISO 8601 week label.
//
// WHY a value object, not a bare string: WP-J2 persists this as (part of) a
// fetch ledger's primary key. A non-canonical key ('2026-W7' vs '2026-W07')
// would read as "never fetched" and let the ledger be bypassed silently — the
// same raw-vs-normalised-key defect recorded in HANDOVER §4 #4. Accepting
// ONLY 'YYYY-Www' at construction makes that impossible here, not merely
// documented (CLAUDE.md § Domain-Driven Design: "an invariant that only
// exists in a markdown file is a comment, not an invariant").
//
// This file is pure calendar math and knows no retailer. WHICH weekday a
// given retailer's publication cycle starts on is retailer knowledge and
// stays inside that retailer's own adapter (CLAUDE.md § DDD) —
// `isoWeekOfCycle` only knows how to label "the most recent occurrence of a
// given weekday on or before a date"; it has no opinion on which weekday any
// one retailer actually uses. See docs/decisions/2026-09-17-publication-editions.md
// for the per-retailer evidence.

import { type Result, err, ok } from './result'

export type IsoWeek = string & { readonly __brand: 'IsoWeek' }

const CANONICAL = /^(\d{4})-W(\d{2})$/

/** The only way to produce an IsoWeek. Refuses anything but 'YYYY-Www'. */
export function createIsoWeek(raw: string): Result<IsoWeek> {
  const m = CANONICAL.exec(raw)
  if (!m) return err(`not a canonical ISO week (expected YYYY-Www): "${raw}"`)
  const week = Number(m[2])
  if (week < 1 || week > 53) return err(`ISO week out of range 01-53: "${raw}"`)
  return ok(raw as IsoWeek)
}

/** {year, week} decomposed from an already-canonical IsoWeek. */
export function isoWeekParts(week: IsoWeek): { readonly year: number; readonly week: number } {
  const m = CANONICAL.exec(week)!
  return { year: Number(m[1]), week: Number(m[2]) }
}

function formatIsoWeek(year: number, week: number): IsoWeek {
  return `${year}-W${String(week).padStart(2, '0')}` as IsoWeek
}

/**
 * The plain ISO 8601 week (Monday-based) containing `date`. Thursday-of-the-
 * week rule, per ISO 8601: the week containing the year's first Thursday is
 * week 1.
 *
 * Moved here from run-pipeline.ts's own `isoWeekOf` (WP-J1) — one definition,
 * returning the canonical value object instead of a loose {kw, year} pair
 * every caller had to format for itself.
 */
export function isoWeekOf(date: Date): IsoWeek {
  const t = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7))
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7)
  return formatIsoWeek(t.getUTCFullYear(), week)
}

/**
 * The ISO week label of the publication cycle IN EFFECT on `date`, for a
 * retailer whose week runs from `anchorWeekday` (0=Sunday..6=Saturday, the
 * same convention as `Date.getUTCDay()`) through the day before the next
 * occurrence of that weekday.
 *
 * Generic calendar math only: it labels "the most recent occurrence of
 * anchorWeekday on or before date" with THAT day's own plain ISO week. It has
 * no opinion on which weekday any one retailer uses — see each adapter's own
 * `*_CYCLE_START_WEEKDAY` constant and the ADR for the evidence behind it.
 *
 * Worked example (the WP-J1 defect this exists to fix): Migros's "KW37" flyer
 * runs 2026-09-10 (Thu) to 2026-09-16 (Wed). `isoWeekOfCycle('2026-09-14', 4)`
 * (a Monday) finds the most recent Thursday on or before it — 2026-09-10 —
 * and returns that day's own plain ISO week, '2026-W37'. The pre-fix code
 * asked for the ISO week of the run date itself ('2026-W38'), which is next
 * week's flyer and does not exist yet (measured: HTTP 404).
 */
export function isoWeekOfCycle(date: Date, anchorWeekday: number): IsoWeek {
  const daysSinceAnchor = (date.getUTCDay() - anchorWeekday + 7) % 7
  const anchorDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - daysSinceAnchor))
  return isoWeekOf(anchorDate)
}

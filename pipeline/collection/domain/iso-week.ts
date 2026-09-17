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
//
// WHY THE ZURICH CALENDAR DAY (code review SF-2). CLAUDE.md states the
// project's one date rule as the Zurich calendar day, not UTC
// (`web-next/src/lib/domain/validity.ts`'s `todayInZurich`, for the identical
// reason). At the pipeline's 05:00 UTC cron this never bites. It bites on a
// `workflow_dispatch` fired 22:00-24:00 UTC on a cycle-start day: UTC is
// still the day before, so an edition computed from the UTC date would return
// the PREVIOUS edition — one stale flyer today, but a wrong row written to
// WP-J2's `(retailer, publication)` primary key once the ledger exists, which
// then refuses to fetch the right one. `zurichDateParts` mirrors
// `todayInZurich`'s own `Intl.DateTimeFormat` technique exactly, so the two
// date rules in this codebase stay one rule, computed one way.

import { type Result, err, ok } from './result'

const ZURICH_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Zurich',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** The Zurich calendar day `date` falls on, as {year, month (1-indexed), day}. */
function zurichDateParts(date: Date): { readonly year: number; readonly month: number; readonly day: number } {
  const parts = ZURICH_DATE_FORMATTER.formatToParts(date)
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? Number.NaN)
  return { year: part('year'), month: part('month'), day: part('day') }
}

/**
 * UTC midnight of the Zurich calendar day `date` falls on. Zurich is always
 * ahead of UTC (CET UTC+1 or CEST UTC+2), so this is a pure day-boundary
 * shift, never a change of hour within a day — safe to feed straight into
 * the UTC-based week arithmetic below, which only ever reads the
 * year/month/day off it.
 */
function zurichMidnightUtc(date: Date): Date {
  const { year, month, day } = zurichDateParts(date)
  return new Date(Date.UTC(year, month - 1, day))
}

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
 * The plain ISO 8601 week (Monday-based) containing the ZURICH calendar day
 * `date` falls on. Thursday-of-the-week rule, per ISO 8601: the week
 * containing the year's first Thursday is week 1.
 *
 * Moved here from run-pipeline.ts's own `isoWeekOf` (WP-J1) — one definition,
 * returning the canonical value object instead of a loose {kw, year} pair
 * every caller had to format for itself.
 */
export function isoWeekOf(date: Date): IsoWeek {
  const t = zurichMidnightUtc(date)
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
  const zurichToday = zurichMidnightUtc(date)
  const daysSinceAnchor = (zurichToday.getUTCDay() - anchorWeekday + 7) % 7
  const anchorDate = new Date(Date.UTC(zurichToday.getUTCFullYear(), zurichToday.getUTCMonth(), zurichToday.getUTCDate() - daysSinceAnchor))
  return isoWeekOf(anchorDate)
}

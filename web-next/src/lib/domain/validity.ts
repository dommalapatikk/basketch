/**
 * Validity — "in effect" made a real predicate, in the Zurich calendar day.
 *
 * WHY THIS EXISTS (docs/rca/2026-09-15-final-plan.md §1.3). The only date rule
 * that ever existed was `.gte('valid_to', today)` — half a validity window.
 * That held while every deal came from aktionis.ch, because "collected" and
 * "in effect" were the same thing by construction of that source. The
 * 2026-09-11 cutover to retailers' own flyers broke the assumption silently:
 * flyers publish 1-2 weeks ahead, so a fetch can return a deal that has not
 * started yet. On 2026-09-15, ALDI, LIDL and SPAR had ZERO deals in effect —
 * every one on the site was next week's price, presented as today's. Nothing
 * ever noticed, because nothing ever asked.
 *
 * WHY ZURICH AND NOT UTC. `new Date().toISOString().slice(0, 10)` reads the
 * UTC date. Zurich is UTC+1 (CET) or UTC+2 (CEST). For up to two hours every
 * day — after Zurich midnight, before UTC midnight — the UTC date is still
 * yesterday. A deal that starts at Zurich midnight would be silently excluded
 * from "today" for that whole window. `Intl.DateTimeFormat` with an explicit
 * `timeZone` is the one place this is decided, instead of every caller
 * guessing.
 *
 * WHY AN INJECTABLE CLOCK. `todayInZurich` is the only function here that
 * touches the wall clock. Everything built on it (`isInEffect`,
 * `startsAfterToday`) takes `today` as a plain string, so they stay pure and
 * every test is a fixed instant, not "whatever day the test happens to run".
 */

export type Clock = () => Date

export const systemClock: Clock = () => new Date()

const ZURICH_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Zurich',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * Today's date in Zurich, as `YYYY-MM-DD`.
 *
 * Built from `formatToParts` rather than trusting a locale's default part
 * ORDER (`lib/format.ts` `formatValidFromShort` does the same, for the same
 * reason): the locale tag here only chooses which calendar and digit script
 * to use, not the shape of the output, so the YYYY-MM-DD assembly is ours,
 * not implicit in a locale's formatting convention. That shape is also the
 * lexicographic order Postgres `date` columns (`valid_from`, `valid_to`)
 * compare in as strings.
 */
export function todayInZurich(clock: Clock = systemClock): string {
  const parts = ZURICH_DATE_FORMATTER.formatToParts(clock())
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

/**
 * `valid_from <= today <= valid_to`, both bounds inclusive, compared as
 * `YYYY-MM-DD` strings (safe lexicographically — that is the whole point of
 * the ISO shape).
 */
export function isInEffect(deal: { validFrom: string; validTo: string }, today: string): boolean {
  return deal.validFrom <= today && today <= deal.validTo
}

/**
 * True when a deal's window has not opened yet, by the Zurich date.
 *
 * `validFrom` is optional here — not on `Deal`, which always has one, but on
 * `ListItem` (stores/list-store.ts), which persists to localStorage across
 * deploys: an item saved before this field existed rehydrates without it.
 * Unknown reads as "already running" — the reading that claims less, and the
 * one that never puts an unearned "from <date>" label on a price nobody
 * ever withheld.
 */
export function startsAfterToday(deal: { validFrom?: string }, today: string): boolean {
  return deal.validFrom !== undefined && deal.validFrom > today
}

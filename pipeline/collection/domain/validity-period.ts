// ValidityPeriod — value object. The window a promotion is actually valid for.
//
// WHY it is a value object and not two strings: Art. 3(1)(e) UWG requires price
// comparisons to rest on objectively correct facts, and the Fribourg case was
// lost partly on a claim built from EXPIRED entries. Expiry is a domain rule
// here, not a display concern — see CLAUDE.md § Legal Constraints.

import { type Result, err, ok } from './result'

/** ISO calendar date, e.g. '2026-09-03'. */
export type IsoDate = string

export type ValidityPeriod = {
  readonly from: IsoDate
  readonly to: IsoDate
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isRealCalendarDate(d: IsoDate): boolean {
  if (!ISO_DATE.test(d)) return false
  const parsed = new Date(`${d}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return false
  // Rejects 2026-02-30, which Date would roll forward to 2026-03-02.
  return parsed.toISOString().slice(0, 10) === d
}

export function createValidityPeriod(from: IsoDate, to: IsoDate): Result<ValidityPeriod> {
  if (!isRealCalendarDate(from)) return err(`validFrom must be an ISO date (YYYY-MM-DD), got '${from}'`)
  if (!isRealCalendarDate(to)) return err(`validTo must be an ISO date (YYYY-MM-DD), got '${to}'`)
  if (to < from) return err(`validTo (${to}) must not precede validFrom (${from})`)
  return ok({ from, to })
}

/** Inclusive at both ends — a promotion is valid on its last printed day. */
export function isActiveOn(p: ValidityPeriod, day: IsoDate): boolean {
  return day >= p.from && day <= p.to
}

export function hasExpiredOn(p: ValidityPeriod, day: IsoDate): boolean {
  return day > p.to
}

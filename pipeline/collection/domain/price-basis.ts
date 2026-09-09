// PriceBasis — value object. WHO can actually pay this price.
//
// WHY this exists: Lidl's flyer JSON reports the Lidl Plus member price with no
// flag at all. Red grapes come back as 1.39 when a non-member pays 1.49 — the
// PDF says "Lidl Plus" 47 times, the JSON says it zero times. Ingesting that
// blindly publishes a price nobody pays, which is exactly the Art. 3(1)(e) UWG
// exposure. Promoting it into the domain makes the mistake unrepresentable:
// a member price cannot exist without naming its programme.

import { type Result, err, ok } from './result'

export type LoyaltyProgramme = 'Lidl Plus' | 'Supercard' | 'Cumulus' | 'SPAR Friends'

export type PriceBasis =
  | { readonly kind: 'everyone' }
  | { readonly kind: 'member-only'; readonly programme: LoyaltyProgramme }

export const PRICE_FOR_EVERYONE: PriceBasis = { kind: 'everyone' }

export function memberOnly(programme: LoyaltyProgramme): Result<PriceBasis> {
  // Guard against a caller passing '' or a value widened to string at a boundary.
  if (typeof programme !== 'string' || programme.trim() === '') {
    return err('member-only price must name its loyalty programme')
  }
  return ok({ kind: 'member-only', programme })
}

export function isMemberOnly(b: PriceBasis): b is { kind: 'member-only'; programme: LoyaltyProgramme } {
  return b.kind === 'member-only'
}

/** Display suffix. A member price must never render bare. */
export function describePriceBasis(b: PriceBasis): string {
  return b.kind === 'everyone' ? '' : `with ${b.programme}`
}

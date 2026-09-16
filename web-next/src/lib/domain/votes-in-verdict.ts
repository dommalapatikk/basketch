import { isMemberOnly, type PriceBasis } from './price-basis'
import { isInEffect } from './validity'

/**
 * The minimal shape `votesInVerdict` needs — not `Deal` (lib/types.ts).
 * Staying structural keeps this file dependency-free within `lib/domain`
 * (architecture.test.ts): `Deal` pulls in `DealCategory`, `CropRegion` and
 * more that this predicate has no business knowing about.
 */
export type Votable = {
  isUncertain: boolean
  priceBasis: PriceBasis
  validFrom: string
  validTo: string
}

/**
 * The single "listed but does not vote" rule (CLAUDE.md § DDD; RCA D2).
 *
 * A domain rule, not a server-only one: `server/verdict/algorithm.ts` uses it
 * to score the category verdict, and `server/data/filter-deals.ts` — reached
 * from a client component (`DealsClient.tsx`) — uses it to decide which deal
 * may wear the "Cheapest" tag. Living in `lib/domain` is what makes that
 * second, client-side use ordinary rather than a server-only module leaking
 * into a client bundle by accident.
 *
 * Three independent facts can each disqualify a deal from deciding a category
 * winner or wearing the "Cheapest" tag, while leaving it fully visible with
 * its own label:
 *
 *   - isUncertain   — the classifier's category guess was not confident (D3)
 *   - member-only    — only Lidl Plus / Supercard / Cumulus members can pay it
 *   - not in effect  — its validity window has not opened, or has closed
 *
 * One predicate, not three separate checks scattered across the two places
 * that need it — the next exception should not have to be wired into the
 * category verdict but forgotten on the "Cheapest" card, or the other way
 * round.
 */
export function votesInVerdict(deal: Votable, today: string): boolean {
  if (deal.isUncertain) return false
  if (isMemberOnly(deal.priceBasis)) return false
  if (!isInEffect(deal, today)) return false
  return true
}

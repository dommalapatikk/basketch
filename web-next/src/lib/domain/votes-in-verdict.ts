import { isMemberOnly, type PriceBasis } from './price-basis'
import { isMultiBuy } from './quantity-requirement'
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
  /**
   * WP-W4 / D2, TP-7a. `undefined` covers a `Votable` built from a
   * `ListItem` saved before this field existed — read the same as `null`,
   * "no quantity condition was printed" (lib/domain/quantity-requirement.ts).
   */
  minQuantity?: number | null
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
 * Four independent facts can each disqualify a deal from deciding a category
 * winner or wearing the "Cheapest" tag, while leaving it fully visible with
 * its own label:
 *
 *   - isUncertain    — the classifier's category guess was not confident (D3)
 *   - member-only     — only Lidl Plus / Supercard / Cumulus members can pay it
 *   - not in effect   — its validity window has not opened, or has closed
 *   - multi-buy (D2)  — the price only applies from N items (WP-C4, TP-7a);
 *                        a conditional price is listed with its "from N
 *                        items" label but can never win "Cheapest" — the
 *                        comparison is only fair against a price everyone
 *                        pays for one item, exactly the reasoning already
 *                        applied to a member-only price above.
 *
 * One predicate, not four separate checks scattered across the two places
 * that need it — the next exception should not have to be wired into the
 * category verdict but forgotten on the "Cheapest" card, or the other way
 * round.
 */
export function votesInVerdict(deal: Votable, today: string): boolean {
  if (deal.isUncertain) return false
  if (isMemberOnly(deal.priceBasis)) return false
  if (!isInEffect(deal, today)) return false
  if (isMultiBuy(deal.minQuantity)) return false
  return true
}

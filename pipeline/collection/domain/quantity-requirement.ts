// QuantityRequirement — value object. HOW MANY of an item must be bought for
// this price to apply.
//
// WHY THIS IS A SEPARATE CONCEPT FROM PriceBasis (Tech Lead ruling D2,
// docs/rca/2026-09-15-final-plan.md):
//
//   PriceBasis          WHO may pay this price (everyone | a loyalty member)
//   QuantityRequirement  HOW MANY items must be bought to pay this price
//
// A union of the two would make "Lidl Plus price, from 2 items" — two
// independent facts — unrepresentable as a single value. Two value objects
// model two independent facts, with no special case for their combination.
//
// THE EVIDENCE: Migros prints "ab 2 Stück" ("from 2 items") next to about a
// third of a flyer's "statt" anchors — the price only applies when the
// shopper buys two or more. WP-C1 already parsed and counted these but
// withheld them from publishing, because until this module existed there was
// nowhere honest to record "from N items" — publishing the price bare would
// be the exact Art. 3(1)(e) UWG failure this project exists to avoid (an
// objectively incorrect price comparison). PM decision TP-7a: publish these
// WITH a visible "from N items" label; unlabelled is not an option.

import { type Result, err, ok } from './result'

export type QuantityRequirement =
  | { readonly kind: 'single' }
  | { readonly kind: 'minimum'; readonly count: number }

export const SINGLE_ITEM: QuantityRequirement = { kind: 'single' }

/**
 * n >= 2 is enforced HERE, in the constructor — not left for a caller to
 * remember. "ab 1 Stück" is not a real printed form (buying one item is
 * simply the single-item price), so a minimum of 1 is not a lesser version
 * of this concept, it is a mis-parse.
 */
export function minimumQuantity(count: number): Result<QuantityRequirement> {
  if (!Number.isInteger(count) || count < 2) {
    return err(`a minimum-quantity requirement must be a whole number of at least 2, got ${count}`)
  }
  return ok({ kind: 'minimum', count })
}

export function isMinimumQuantity(q: QuantityRequirement): q is { kind: 'minimum'; count: number } {
  return q.kind === 'minimum'
}

/** Display suffix. A conditional price must never render bare (TP-7a). */
export function describeQuantityRequirement(q: QuantityRequirement): string {
  return q.kind === 'single' ? '' : `from ${q.count} items`
}

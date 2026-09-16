/**
 * QuantityRequirement — the read-side half of WP-C4's domain concept.
 *
 * Migros prints an "ab N Stück" ("from N items") price on a share of a
 * flyer's anchors: the sale price only applies when the shopper buys N or
 * more. The pipeline enforces `minimum(n >= 2)` as a constructor invariant
 * (`pipeline/collection/domain/quantity-requirement.ts`, Tech Lead ruling
 * D2) and persists it as `deals.min_quantity`
 * (`supabase/migrations/20260916_quantity_requirement.sql`).
 *
 * On the read side there is no constructor to run — `minQuantity` arrives
 * already validated by the database CHECK constraint
 * (`deals_min_quantity_at_least_two`) — so this is a plain predicate, not a
 * second value object. `null` (the ordinary single-item price) and
 * `undefined` (a `ListItem` saved before WP-W4 has no `minQuantity` key at
 * all — stores/list-store.ts) both read as "no condition was printed", the
 * same "claims less" rule `lib/domain/price-basis.ts` already applies to an
 * unrecognised database value.
 *
 * PM decision TP-7a: a multi-buy price is published WITH this label —
 * unlabelled is not an option (Art. 3(1)(e) UWG) — and Tech Lead ruling D2:
 * it is listed but does not vote in the category verdict, the same
 * "listed but does not vote" rule already applied to a not-yet-started or
 * member-only price (lib/domain/votes-in-verdict.ts).
 */
export function isMultiBuy(minQuantity: number | null | undefined): boolean {
  return typeof minQuantity === 'number' && minQuantity >= 2
}

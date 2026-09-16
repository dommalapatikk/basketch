# ADR: `QuantityRequirement` — a separate value object from `PriceBasis`

**Status:** Accepted
**Date:** 2026-09-16
**Decides:** Tech Lead ruling D2, PM decision TP-7a (`docs/rca/2026-09-15-final-plan.md`)
**Lands in:** WP-C4 (this package, pipeline side). WP-W4 (web label + verdict exclusion) is
separate and NOT landed here.

---

## Context

Migros prints an "ab N Stück" ("from N items") price on roughly a third of a flyer's "statt"
anchors — a price that only applies when the shopper buys N or more of the item. WP-C1
(2026-09-15/16) already detected and parsed both printed forms of this (an inline
`"3.02statt4.50"` token with no separate display numeral, and a separate `"ab N Stück"` label) but
withheld every one of them from publishing: `PriceBasis` — the domain's existing "who may pay this
price" concept (`everyone | member-only(programme)`) — had no honest way to say "from N items", and
publishing the price bare would have been exactly the Art. 3(1)(e) UWG failure ("a price comparison
must be objectively correct") this project exists to avoid. That withholding showed up as five of
eighteen anchors on the committed KW36 fixture being parsed, counted in the funnel, and discarded.

PM decision TP-7a: **publish** these prices, **with** a visible "from N items" label. Unlabelled is
not an option.

## Decision

`QuantityRequirement` is a **separate value object**, not a variant added to `PriceBasis`:

```ts
export type QuantityRequirement =
  | { readonly kind: 'single' }
  | { readonly kind: 'minimum'; readonly count: number }
```

- `PriceBasis` answers **WHO** may pay a price (`everyone` | a named loyalty programme).
- `QuantityRequirement` answers **HOW MANY** must be bought.

These are independent facts. A union of the two (`PriceBasis = everyone | memberOnly(programme) |
minimumQuantity(n)`) would make "a Lidl Plus price, from 2 items" — a real, representable
combination — impossible to express as a single value. Two independent value objects on `Offer`
model two independent facts, with no special case for the (currently unobserved, but not
impossible) combination of both.

**The invariant — `count >= 2`, enforced in the constructor, not left to a caller:**
`minimumQuantity(count)` refuses any count below 2. "ab 1 Stück" is not a real printed form; buying
one item is simply the single-item price, so a stated minimum of 1 is not a lesser version of this
concept, it is a mis-parse. `Offer`'s own constructor (`createOffer`) re-checks this invariant a
second time, exactly as it already does for the LIDL rule (`isMemberOnly(priceBasis) &&
!priceBasis.programme`) — `QuantityRequirement` is a plain union, so nothing stops a caller from
constructing `{ kind: 'minimum', count: 1 }` by hand, bypassing the factory. An invariant that only
lives in one constructor a caller could skip is not enforced, it is a suggestion.

**It enters `offerKey`.** `collection/domain/offer.ts`'s de-duplication identity
(`retailer|name|price|validity|priceBasis`) gained a `quantity` component
(`single` or `min<N>`), so a multi-buy price and the ordinary single-item price for the same
product, on the same dates, are never collapsed into one offer in memory. Mutation-tested: removing
the field from `offerKey` turns the "a multi-buy price never dedupes against the single-item price"
test red.

**`N` is parsed from the label, never hardcoded.** Every "ab N Stück" label on the committed KW36
fixture reads "2" (five real anchors, all labelled 2), but `parseMultiBuyQuantity` reads whatever
digit is actually printed — a future "ab 3 Stück" week is not silently treated as 2. An anchor whose
price is structurally conditional (an inline token, a label found, or both) but whose label could
not be read as a whole number of at least 2 — garbled OCR, a label found stating "ab 1 Stück", or no
label at all near an inline-only anchor — is **still withheld**, under a new funnel field
(`multiBuyUnquantified`), distinct from `multiBuy` (published, labelled) and from ordinary
rejections. TP-7a requires an honest label; "probably 2, because every other one this week said 2"
is a guess, not a reading, and this codebase's standing rule is that a conditional price is listed
with its label or not at all — never bare, never guessed.

## Consequences

**Easier**
- Migros's yield floor (`migrosYieldReason`) is simpler than before WP-C4, not more complex: a
  multi-buy anchor that publishes now counts toward `acceptedCount` like any other offer, so the
  denominator only excludes anchors that are structurally impossible to publish honestly
  (`multiBuyUnquantified`), not every multi-buy anchor regardless of whether it could be labelled.
- The KW36 fixture's yield rose from 12/18 (67%, all multi-buy withheld) to 17/18 (94%).

**Harder / accepted**
- **A storage-layer collision, not fixed by this ADR.** `deals`' live identity constraint is
  `(store, product_name, valid_from)` — it has no room for a quantity requirement. `offerKey` keeps
  a multi-buy offer and its single-item sibling apart IN MEMORY inside collection; the DATABASE
  constraint, `pipeline/store.ts`'s own in-memory dedupe, and the enrichment pass's natural key
  (`pipeline/storage/infrastructure/write-enrichment.ts`) do not. The first real week a single
  product prints both an everyone-price and an "ab N Stück" price, the two will collapse to one row
  — silently, no error, no warning. Not observed on the KW36 fixture (verified: none of its five
  multi-buy product names collide with any of its twelve single-item ones). See the migration file
  (`supabase/migrations/20260916_quantity_requirement.sql`) for why the constraint is not widened in
  this change — it is a coordinated, cross-lane fix (the constraint, both `onConflict` call sites,
  and `store.ts`'s in-memory dedupe key, together), not a one-file fix, and NULL's non-distinctness
  in a standard Postgres UNIQUE constraint means a naive fix would break idempotent upserts for
  every ordinary (non-multi-buy) offer. Flagged as the next decision point for the Tech Lead.
- **Migros multi-buy per-item sale prices are not on the ordinary 5-rappen shelf grid.** Confirmed
  against the fixture: every multi-buy offer's ORIGINAL ("statt") price is still a multiple of 5
  rappen, but the per-item sale price next to "ab N Stück" is not (302, 117, 466, 288, 94 rappen —
  none are). Read as a bundle total divided by N ("2 für 6.04" → "3.02 je"), not an independently
  rounded shelf price. `isConsistentWithPrices` already accepted all five on the plain
  percentage-point rule alone, without needing the grid, so this changes nothing about correctness —
  it is recorded in `price-step-property.test.ts` as a documented exemption, not silently patched
  away.
- **A new NAME-search path for the inline multi-buy form.** The inline form ("3.02statt4.50") has no
  separate display numeral, so there is no `saleBox` at the same height as the name the way an
  ordinary anchor's display price provides. `findMultiBuyNameLine` picks the TOPMOST non-price,
  non-descriptor candidate above the price line instead of the nearest — real fixture evidence
  showed a country-of-origin descriptor line ("Italien/Spanien/Griechenland,") sitting closer to the
  price (3px) than the real product name (76px), which the ordinary "nearest wins" rule would have
  picked in error.
- **`DESCRIPTOR`'s `\bBIO\b` pattern was too broad.** It matched the standalone "BIO" quality badge
  Migros prints as its own line (the intended target) but ALSO matched inside a genuine product name
  that happens to contain the word — "Migros Bio Bohnen" — silently discarding that offer's own name
  as "not a product name". Anchored to `^\s*BIO\s*$` (the whole line, not a substring) instead. This
  is a general fix, not multi-buy-specific — it was only ever exercised for the first time because
  WP-C4 is what made "Migros Bio Bohnen" reachable as a name candidate at all (it was one of the five
  previously-withheld multi-buy anchors).

## Alternatives considered

**A. Fold quantity into `PriceBasis` as a third variant.** Rejected — see Decision above; makes
"member price, from N items" unrepresentable.

**B. Default an unreadable "ab N Stück" quantity to 2, since every observed case is 2.** Rejected.
TP-7a's own wording — publish WITH a label, unlabelled is not an option — reads the same way whether
the missing piece is the whole price or just the number: a "from 2 items" label placed on an offer
whose actual printed quantity was never confirmed is exactly the "probably true" comparison Art.
3(1)(e) UWG's "objectively correct" standard exists to prevent. `multiBuyUnquantified` keeps this
case withheld, exactly as multi-buy was withheld wholesale before this WP.

**C. Route `minQuantity` through the same enrichment pass as `priceBasis`/`CropRegion`/rappen.**
Rejected. Those three are routed through a second write specifically because `UnifiedDeal` cannot
hold them at all (a union type, a compound object, and a precision the NUMERIC columns cannot
express). `minQuantity` is a plain nullable number — the same shape `quantity`/`quantityUnit`
already occupy on `UnifiedDeal` as optional fields from the aktionis Python scraper — so it fits the
MAIN write with no loss. Routing it through the enrichment pass instead would put it on the exact
natural key (`store|productName|validFrom`) that does NOT distinguish a multi-buy offer from its
single-item sibling, reproducing the storage-collision risk described above one layer earlier, for
no benefit.

## Open

- **DEPLOY GATE (code review finding, must hold): `min_quantity` reaches nowhere in `web-next/src`
  today — verified, zero references anywhere in the frontend.** `SELECT_COLUMNS`
  (`server/data/supabase-provider.ts`) does not name it, so the web layer does not even read the
  column yet, let alone render a label or exclude the deal from the verdict. Between this package
  running in production and WP-W4 shipping, a multi-buy offer would reach the site as an
  indistinguishable EVERYONE price for the price ONLY a 2-or-more purchase actually gets: it renders
  BARE (no "from N items" label — the exact TP-7a "unlabelled is not an option" case) and it VOTES in
  the category verdict and can win "Cheapest" (`votesInVerdict` has no quantity check yet — see the
  companion ADR `2026-09-15-in-effect-vs-upcoming.md`'s own Open section, which named this exact gap
  ahead of the data existing). That is a live Art. 3(1)(e) UWG exposure, not a cosmetic one.
  **The pipeline must not run against production data until WP-W4 (the label and the verdict
  exclusion) is deployed.** This is a release-sequencing gate, not a code defect in this package —
  recorded here so it is not lost between review and deploy.
- The storage-layer identity collision (Consequences, above) is the next decision point. It needs a
  Tech Lead ruling on the coordinated fix (constraint shape, both `onConflict` targets, `store.ts`'s
  dedupe key) before the FIRST real week that actually prints both a single-item and a multi-buy
  price for one product — which the KW36 fixture does not exercise. Code review's decisive addition:
  this collision loses one OFFER (silently, still worth fixing), but it never publishes a wrong or
  unlabelled price — so it carries no UWG exposure of its own, unlike the deploy-gate item above.
- WP-W4 (the "from N items" label on the card, and `min_quantity`'s exclusion from the category
  verdict / "Cheapest" tag — the same "listed but does not vote" rule already applied to a
  not-yet-started deal and a member-only price, per D2's own ruling) is NOT built here. It depends on
  this migration being applied.
- **F5 (code review, carried forward, not fixed):** `findMultiBuyNameLine` picks the topmost
  candidate in a band that spans half the page width with no x-alignment check and a 4%-of-page-height
  reach — correct against the KW36 fixture's actual spacing, but structurally looser than the
  ordinary anchor's x-aligned "nearest wins" search, and a denser flyer layout could let it reach
  into a neighbouring tile's text. Revisit if a second real Migros flyer's funnel shows it happening.
- **F6 (code review, carried forward, not fixed):** `RejectedOutcome['funnelField']`'s type
  (`keyof Omit<MigrosFunnel, 'anchors' | 'accepted'>`) now also admits `multiBuy` and `gridAccepted`
  — both subset counters, never valid rejection reasons — so a typo at a call site could increment
  one of them as if it were a rejection and silently break the funnel's own reconciliation total.
  Narrow the union to only the real rejection reasons in a follow-up.

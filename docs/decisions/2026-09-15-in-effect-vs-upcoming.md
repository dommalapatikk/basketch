# ADR: "In effect" vs "upcoming" — the web validity predicate

**Status:** Accepted
**Date:** 2026-09-15
**Decides:** PM decision #10, tech-lead ruling D2 (TP-10) in `docs/rca/2026-09-15-final-plan.md`
**Lands in:** WP-W2

---

## Context

On 2026-09-15, 283 of 1,523 live deals had `validFrom` after today. ALDI, LIDL and SPAR had
**zero** deals in effect — every one on the site was next week's flyer, fetched early
(`docs/rca/2026-09-15-final-plan.md` §1.3). No component in `web-next` ever read `validFrom`; the
category verdict, the "Cheapest" card and the "Only at X" badge all filtered on `valid_to` only.
That half-rule held under the legacy aktionis.ch source because "collected" and "in effect" were
the same thing by construction — nothing ever needed to ask whether a listed deal had started.
The 2026-09-11 cutover to retailers' own flyers broke that assumption silently, because flyers
publish 1–2 weeks ahead.

Separately, `server/verdict/algorithm.ts` had no `priceBasis` check: a Lidl Plus member-only price
could win a category and wear the "Cheapest" tag despite Art. 3(1)(e) UWG requiring price
comparisons to be objectively correct for the price a visitor can actually pay.

## Decision

**"In effect"** (`valid_from ≤ today ≤ valid_to`, both bounds inclusive, compared as Zurich
calendar dates) becomes a real predicate, not an assumption. A deal that is not in effect is
**"upcoming"** if `validFrom > today` — still real, still shown, just not voting yet.

Both facts — **upcoming** and **member-only** — are handled by the same rule, because a PM and a
tech-lead ruling independently arrived at the identical shape: *listed with its own label, but
does not vote and can never be "Cheapest"*. That is also the rule already applied to an
`isUncertain` deal (D3). Rather than writing three separate exclusion checks, one predicate —
`votesInVerdict(deal, today)` in `server/verdict/algorithm.ts` — covers all three:

```
votesInVerdict = isInEffect(deal, today) AND !isMemberOnly(deal.priceBasis) AND !deal.isUncertain
```

This predicate is reused, not reimplemented, everywhere the rule applies:
- `server/verdict/algorithm.ts` — category verdict scoring
- `server/data/filter-deals.ts` `buildSections` — which deal in a sub-category group may wear the
  "Cheapest" tag (the group's headline card still goes to whichever eligible deal has the best
  discount; if none is eligible, the group's best deal is still featured, with no tag)

`onlyStoreSubCategories` uses only the narrower `isInEffect` check (not the full `votesInVerdict`)
— a member-only deal still genuinely exists as an offer at that store, so it should still count
toward "no other store has one"; a not-yet-started deal should not, because the claim is about
TODAY.

**"Today" is the Zurich calendar date**, not UTC (`lib/domain/validity.ts` `todayInZurich`). Zurich
is UTC+1/+2; for up to two hours a day, the UTC date is still yesterday. Computed once per
snapshot build (`supabase-provider.ts`) and carried on `WeeklySnapshot.today`, so every client-side
consumer (`buildSections`, `onlyStoreSubCategories`) agrees with the verdicts already computed
server-side for the same cached snapshot, rather than each recomputing "now" independently and
risking disagreement across an hour-long cache window.

## Alternatives considered

**A. Hide upcoming deals entirely (filter them out of the snapshot).**
Rejected — explicit PM decision. Hiding a real, honestly-collected price is its own inaccuracy,
and it would also quietly shrink the site to zero deals for a store whose flyer was fetched a few
days early (exactly what happened to ALDI/LIDL/SPAR on 2026-09-15, compounded by the pipeline-side
sweep bug fixed separately in WP-P1).

**B. A single boolean `isEligible` on `Deal` instead of a predicate function.**
Rejected — `Deal` is a value read from the database each request; baking a point-in-time boolean
into it would go stale the moment the calendar date rolls over inside the snapshot's cache window,
and it would hide the "why" (in effect? member-only? uncertain?) that the UI needs to choose which
label to show.

**C. Separate ad-hoc checks in each call site instead of one exported predicate.**
Rejected per the tech-lead's explicit instruction: "one 'votes' predicate ... reuse the existing
uncertain rule rather than adding a parallel one." Three independent implementations of the same
rule is exactly the shape of defect this codebase has repeatedly hit (HANDOVER.md §4) — a rule that
exists in one place and is silently not applied in another.

## Consequences

**Easier**
- A single, tested predicate is the one place "does this deal count today" is answered.
- The `isCheapest` tag can no longer be wrong about a deal that has not started yet or cannot be
  paid by everyone — it is no longer a hardcoded `true` on `buildSections`' primary.

**Harder / accepted**
- `WeeklySnapshot` gained a `today` field, threaded from the server render into client-side
  `buildSections`/`onlyStoreSubCategories` calls. A caller that reconstructs a `WeeklySnapshot` by
  hand (tests) must now supply it — acceptable, since every such fixture already has to supply
  `valid_from`/`valid_to` on each deal.
- `ListItem` (the shopping list snapshot) now carries `validFrom` and `priceBasis` as raw fields,
  not a pre-rendered label, so the "from" date and member-price note can still be shown correctly
  in the list drawer and the shared WhatsApp/email text days after the item was added, in whatever
  locale the list is viewed in.

## Open

- `concept_cheapest_now` and the "Worth picking up" materialized view still filter on
  `CURRENT_DATE` only, inside Postgres, refreshed on a schedule — WP-W3 re-applies `isInEffect` at
  read time there, for the same reason `today` is carried on `WeeklySnapshot` here: a materialized
  view freezes `CURRENT_DATE` at refresh, not at read.
- "From 2 items" (`QuantityRequirement`, TP-7a/D2) is a second, independent "does not vote" fact
  arriving in WP-C4/WP-W4. It slots into the same `votesInVerdict` predicate as a fourth check —
  deliberately not added here, ahead of the data existing.

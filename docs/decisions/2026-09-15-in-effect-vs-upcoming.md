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

**Amended in code review of 9525601:** `votesInVerdict` moved from `server/verdict/algorithm.ts`
into `lib/domain/votes-in-verdict.ts`. It is a domain rule reached from a client component
(`DealsClient.tsx` → `buildSections`), not a server-only one — keeping it under `server/` made
that client-side use an accident of where a symbol happened to live rather than an ordinary import
from the shared read domain, next to `lib/domain/validity.ts` and `lib/domain/price-basis.ts`
which it is built from.

A second predicate, `onlyStoreBadgeStore` (`server/data/filter-deals.ts`), was added in the same
review: `buildSections`' primary is not always a deal from the store `onlyStoreSubCategories`
names — `pickPrimary` falls back to the section's best discount overall when nothing in it votes,
and that fallback can be a different store entirely. The "Only at Coop" badge was being attached
to whichever card was featured, with no check of whose card it actually was, which put "Only at
Coop" on a LIDL card showing a not-yet-started price — a false comparative claim under Art.
3(1)(e) UWG, not a cosmetic bug. `onlyStoreBadgeStore` requires both that the primary's own store
matches the named one AND that the primary is itself in effect.

`onlyStoreSubCategories` uses only the narrower `isInEffect` check (not the full `votesInVerdict`)
— a member-only deal still genuinely exists as an offer at that store, so it should still count
toward "no other store has one"; a not-yet-started deal should not, because the claim is about
TODAY.

**"Today" is the Zurich calendar date**, not UTC (`lib/domain/validity.ts` `todayInZurich`). Zurich
is UTC+1/+2; for up to two hours a day, the UTC date is still yesterday. Computed once per
snapshot build (`supabase-provider.ts`) and carried on `WeeklySnapshot.today`, so every client-side
consumer (`buildSections`, `onlyStoreSubCategories`) agrees with the verdicts already computed
server-side for the same cached snapshot, rather than each recomputing "now" independently and
risking disagreement within the cache's lifetime.

**Amended in code review of 9525601 — how stale can that cached "today" get?**
`server/data/snapshot.ts` originally wrapped the computation in `cacheLife('hours')`: `stale` 5 min,
`revalidate` 1 hour, `expire` 1 day. `revalidate` only triggers a background refresh on the NEXT
request after it elapses — it does not fire on a timer. With 10-50 users (CLAUDE.md) and a quiet
overnight gap in traffic, nobody's request ever triggers that background refresh, so the cache
keeps serving its last value until `expire` forces a synchronous rebuild. The realistic worst case
was therefore not "an hour stale" but up to a day: the first visitor after a quiet night could see
Thursday's flyer still reading "from Thu" and excluded from the verdict, hours after Zurich
midnight.

**Fix:** an explicit inline profile, `cacheLife({ revalidate: 900, expire: 3600 })` — `expire` of
one hour bounds the worst case to at most an hour, because after that the next request MUST
rebuild synchronously rather than serve a stale value.

**Alternative considered — compute `today` outside the cache entirely.** The architecturally
cleaner fix: split `SupabaseDealsProvider.getWeeklySnapshot` so the (expensive, Supabase-querying)
deals fetch stays cached, while `today` and the category verdicts — cheap, pure, in-memory — are
computed fresh on every request, decoupling a time-sensitive derived value from a cache boundary
entirely. This is the textbook answer and removes the residual one-hour window completely.
**Rejected for now** — it requires reshaping `DealsProvider`'s contract (splitting what is cached
from what is not, and re-plumbing `provider.contract.ts` and its callers) for a benefit that, at
10-50 users, is "at most an hour of boundary staleness" versus "none". CLAUDE.md: "Reject
over-engineering. One developer, 10–50 users, free tier." The tightened `expire` is the simplest
change that actually bounds the defect the review found; full decoupling is the natural next step
if the user base or the tolerance for that hour ever changes — nothing here forecloses it.

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

## Amendment: the persisted shopping list shape change (BLOCKER, code review of 9525601)

`ListItem` (`stores/list-store.ts`) gained `validFrom`/`priceBasis` so the list drawer and the
shared WhatsApp/email text could carry the same two labels DealCard shows (§ above). They were
added as **required** fields with no storage migration. `useListStore` persists to `localStorage`
across deploys, so a list saved before this shipped rehydrated with neither key present at all —
not `null`, simply absent. `ListDrawer` is mounted in every layout and calls `createShareTarget` →
`buildShareText` → `groupNote` on every render, which read `it.priceBasis.kind` and threw a
TypeError. Every returning user with a non-empty list got a client exception on the next visit.

**Decision:** make the two fields **optional**, not required, and treat "absent" as "we don't
know" everywhere they are read — never a crash, and never a guess dressed up as a fact:
- `isMemberOnly`/`programmeOf` (`lib/domain/price-basis.ts`) and `formatMemberPriceLabel`
  (`lib/format.ts`) accept `PriceBasis | undefined` and read it as an open price. This is the same
  "claims less" rule `createPriceBasis` already applies to an unrecognised database value.
- `startsAfterToday` (`lib/domain/validity.ts`) accepts `validFrom?: string` and reads "absent" as
  "already running" — never puts an unearned "from `<date>`" label on a price nobody withheld.

**Also bumped `STORAGE_VERSION` to 2**, with a `migrate` hook (runs on a version mismatch) and a
`merge` hook (runs on EVERY rehydrate, matched version or not) that both call the same
`sanitizeItems` — the one place untrusted `localStorage` content is validated: `items` must be an
array, and each entry must have the base fields a `ListItem` has always had (`id`, `store`,
`productName`, `category`, `salePrice`); anything else is dropped, never thrown. `merge` matters
independently of `migrate`: a hand-edited or otherwise corrupted value under the CURRENT version
never goes through `migrate` (versions already match) — only `merge` runs, so validating there too
is what catches that case rather than trusting a version match to mean "safe".

This is the general shape CLAUDE.md's HANDOVER §4 already names as basketch's most common defect
class: a schema (or storage) change that is correct for a new write and silently wrong for an old
read. The fix here is the same one used elsewhere in the codebase for that class — validate at the
boundary where untrusted (here: previously-written, now out-of-shape) data enters, rather than
trusting that "it used to be well-formed" still holds.

## Open

- `concept_cheapest_now` and the "Worth picking up" materialized view still filter on
  `CURRENT_DATE` only, inside Postgres, refreshed on a schedule — WP-W3 re-applies `isInEffect` at
  read time there, for the same reason `today` is carried on `WeeklySnapshot` here: a materialized
  view freezes `CURRENT_DATE` at refresh, not at read.
- "From 2 items" (`QuantityRequirement`, TP-7a/D2) is a second, independent "does not vote" fact
  arriving in WP-C4/WP-W4. It slots into the same `votesInVerdict` predicate as a fourth check —
  deliberately not added here, ahead of the data existing.

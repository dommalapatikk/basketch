# ADR: `Edition` and per-retailer publication calendars (D5)

**Status:** Accepted
**Date:** 2026-09-17
**Decides:** Tech Lead ruling D5 (`docs/rca/2026-09-15-final-plan.md`)
**Lands in:** WP-J1 (this package). WP-J2 (fetch ledger, `decideFetch`) is separate and NOT landed
here — this package makes the mechanical call (`editionFor` then `fetchOffers(edition)`) but does
not yet gate it against a persisted "already collected" record.

---

## Context

`run.ts` computed ONE ISO week from the run date (`isoWeekOf(runDate)`) and handed it to all seven
`OfferSource`s. Every adapter declared `fetchOffers(_week: IsoWeek)` and ignored the argument,
building its URL from a `kw`/`year` pair captured once when `createLiveSources` was constructed
instead (item 1 RCA, `docs/rca/2026-09-15-architect-items-1-2-5.md` §1.1: "the port's `week`
argument is ignored by all seven adapters").

Migros publishes flyer weeks Thursday to Wednesday, not Monday to Sunday. On a Monday or Tuesday
run, `isoWeekOf(runDate)` is already the *next* Migros week — one not yet published. Measured on
run 34833209176 (Mon 2026-09-14): `FAIL migros 0 offers … HTTP 404` requesting
`migros-wochenflyer-38-2026`, against 34 offers two days earlier requesting `…-37-2026`
(item 7a RCA, `docs/rca/2026-09-15-tech-lead-items-6-9.md` §7.2a). The same run swept LIDL, ALDI and
SPAR a week early too (item #10 RCA, `docs/rca/2026-09-15-final-plan.md` §1.3): every offer from
those three retailers on the live site that day was dated `validFrom` the *following* Thursday or
Monday, with **zero** offers from any of the three in effect.

D5's ruling: `OfferSource.editionFor(date): Edition` plus `fetchOffers(edition)`. The port must let
the caller (WP-J2's fetch ledger) know WHICH publication is in effect *before* fetching, so a
publication can be recorded as collected and never re-fetched. Calendar knowledge — which weekday a
retailer's own publication cycle starts on — stays inside that retailer's adapter (CLAUDE.md § DDD:
"every retailer adapter is an anti-corruption layer"), not in the domain and not in `run.ts`.

## Decision

### `Edition` has no `cycle` field

The Architect's original proposal (`docs/rca/2026-09-15-architect-items-1-2-5.md` §1.4) was
`Edition = { retailer, fetchWeek: IsoWeek, cycle? }`, with `cycle` existing only if a PM decided
dual-cycle retailers (ALDI, Volg) were a legitimate second dimension. Investigating that question
for this ADR found the answer is no, for both:

- **ALDI's catalogue bundles both of its promo cycles into ONE publication.** The adapter's own
  module header already documents this (`aldi-flyer-source.ts`, point 3): *"TWO PROMO CYCLES IN ONE
  FLYER. KW37 carries both 'AB DONNERSTAG, 10.9.' and 'AB MONTAG, 14.9.'"* D5's own note records the
  same finding independently: *"on Mon 14.9 the ALDI catalogue carried both the 17.9 and 21.9 cycles
  (live: 70 + 57 offers)"*. One `data.json` fetch returns both cycles' offers, each carrying its own
  per-page validity window (`parseCycleStart`) — there is nothing a second fetch would add.
  **The decisive fact, which rules out the one scenario that would break this design:** the
  wrongly-fetched Mon 14.9 run requested the KW38 catalogue — content starting **Thursday 17.9,
  three days later** — and both cycles (17.9 *and* the following Monday 21.9) were already present
  in that single fetch, three days *before* the catalogue's own Thursday start. If ALDI only
  populated its Monday cycle into the catalogue partway through the week, a single upfront
  Thursday fetch could miss it; the measured evidence is the opposite — both cycles are complete
  the moment the catalogue itself becomes fetchable. That is what makes the no-`cycle`-field design
  safe, not merely convenient.
- **Volg's "fresh" section is a validity window inside one publication, not a second one.**
  `volg-html-source.ts`'s own header: *"THREE sections with DIFFERENT validity windows.
  'Frische-Aktionen' runs Wed–Sat while 'Volg-Aktionen' and 'Weitere Aktionen' run Mon–Sat."* One
  `GET /sortiment/wochenaktionen/` returns all three sections; the later start date is carried on the
  `Offer`'s own `ValidityPeriod` and surfaced to a visitor via the "from `<weekday> <date>`" label
  (WP-W2), never by a second fetch.

Since both "dual-cycle" retailers turn out to be single-publication in practice, `Edition` is:

```ts
export type Edition = {
  readonly retailer: Retailer
  readonly publication: IsoWeek
}
```

This is the Kent Beck "fewest elements" call: a `cycle` field with no real value ever observed to
put in it is a field this codebase would carry forever on the promise it might someday matter.

### `IsoWeek` becomes a value object

`createIsoWeek(raw)` accepts only canonical `YYYY-Www`. `IsoWeek` becomes part of a persisted key in
WP-J2 (the fetch ledger's primary key is `(retailer, publication)`), and a non-canonical key
(`2026-W7` vs `2026-W07`) would read as "not yet fetched" and silently bypass the ledger — the same
raw-vs-normalised-key defect recorded in `HANDOVER.md` §4 #4, in a new place. See
`pipeline/collection/domain/iso-week.ts`.

### The per-retailer publication calendar

`isoWeekOfCycle(date, anchorWeekday)` (`iso-week.ts`) is pure, generic calendar math: it labels "the
most recent occurrence of `anchorWeekday` on or before `date`" with that day's own plain ISO 8601
week. It has no opinion on which weekday any retailer uses — each adapter supplies that as its own
`*_CYCLE_START_WEEKDAY` constant, keeping the fact itself inside the ACL per CLAUDE.md, while reusing
one shared, tested implementation of the date arithmetic.

| Retailer | Cycle | Evidence |
|---|---|---|
| **Migros** | Thursday–Wednesday | Live KW37 window is `2026-09-10` (Thu) → `2026-09-16` (Wed); `2026-09-10`'s own plain ISO week is 37 (verified: Python `datetime.date(2026,9,10).isocalendar()` → `week=37`). Matches the item 7 RCA's own statement of the window. |
| **Lidl** | Thursday–Wednesday | Module header (`lidl-flyer-source.ts`): *"the flyer publishes on 2026-09-06 but the offers only run 2026-09-10 → 2026-09-16"* — same Thu-Wed window as Migros. Confirmed by item #10 RCA: the wrongly-fetched Mon 14.9 run's LIDL offers were all dated `validFrom 2026-09-17` (the *next* Thu-Wed cycle), not the run date. Lidl's JSON endpoint itself becomes fetchable ~1 week before the content's own start date (research: "KW36 ✓ KW37 ✓ KW38 404, ~1 week lookahead") — that is a *publish-ahead* property of the endpoint, separate from which cycle is *in effect*, and does not change the anchor weekday. |
| **Aldi** | Thursday–Wednesday | Confirmed above: one catalogue per Thu-Wed week bundles the Thursday half-cycle and the following Monday half-cycle. Item #10 RCA: wrongly-fetched Mon 14.9 run's ALDI offers were 70 dated `17.9` (Thu) + 57 dated `21.9` (Mon) — both inside the following Thu-Wed week (`17.9`–`23.9`), none dated `14.9` (that Monday's own, correctly-in-effect cycle, which the WRONG kw failed to fetch). |
| **Spar** | Thursday–Wednesday | Item #10 RCA: wrongly-fetched Mon 14.9 run's SPAR offers were all dated `validFrom 2026-09-17`, the same one-cycle-early pattern as Lidl and Migros. Spar's cron trigger is Tuesday (`pipeline.yml`) — five days after the Thursday anchor, still well inside the same Thu-Wed cycle that started two days earlier — consistent with, not contradicting, the Thursday anchor. |
| **Denner** | No week-numbered URL | `denner-api-source.ts` header: *"No auth. pageId 12 = current week, 13 = next week."* The API has no publication identifier on the wire at all — "current" is resolved server-side. `editionFor` returns the plain ISO week of the date asked, for ledger bookkeeping only; it is never read back into a request. |
| **Coop** | No week-numbered URL | `coop-aktionis-source.ts`: `GET https://www.aktionis.ch/vendors/coop` is a continuously-updated listing with no week parameter in the URL at all. `editionFor` returns the plain ISO week, bookkeeping only. |
| **Volg** | No week-numbered URL | `volg-html-source.ts`: `GET https://www.volg.ch/sortiment/wochenaktionen/` is a single "current promotions" page, no week parameter. `editionFor` returns the plain ISO week, bookkeeping only. |

**Every retailer with a week-numbered URL (Migros, Lidl, Aldi, Spar) shares the identical
Thursday-anchor rule.** That was not assumed going in — Migros's and Lidl's evidence came from their
own module headers (written before this ADR, for unrelated reasons), Aldi's from its own
"two cycles in one flyer" comment, and Spar's from the item #10 RCA's independent measurement. Four
independent pieces of evidence agreeing is why `MIGROS_CYCLE_START_WEEKDAY`,
`LIDL_CYCLE_START_WEEKDAY`, `ALDI_CYCLE_START_WEEKDAY` and `SPAR_CYCLE_START_WEEKDAY` are declared
separately, one per adapter file, each with its own citation — not refactored into one shared
`THURSDAY_ANCHORED_RETAILERS` constant. That would encode a coincidence of the current evidence as a
domain rule; if a future flyer capture shows one of the four has drifted, the adapters must be able to
diverge independently, and Rule of Three (tolerate duplication until the *third* occurrence forces an
abstraction — here, four *separately justified* constants that currently happen to share a value) is
not license to collapse facts that are independently sourced.

### `editionFor(date)` returns the publication IN EFFECT, not an upcoming one

Per D5's semantics: `editionFor(date)` never pre-fetches a publication that has not started yet. A
retailer whose catalogue nonetheless carries later-starting content (ALDI's Monday half, Volg's fresh
section) still surfaces those offers — via their own `Offer.validity.from`, shown with the "from
`<weekday> <date>`" label (WP-W2) — but the *edition requested* is always the one in effect on `date`.

### Consequence for AP-1 ("never refetch a publication")

Because ALDI and Volg's second cycles are inside the same publication as the first, `editionFor`
returns the SAME `Edition` value for a Monday-triggered check and a Thursday-triggered check within
one Thu-Wed week. Once WP-J2's ledger exists, this means the legacy assumption "ALDI and Volg: twice
a week (Mon + Thu)" collapses to one fetch per week for both, satisfying AP-1 ("never refetch a
publication") by construction — no special case needed to prevent a second fetch, because there is
only ever one `Edition` to fetch in the first place.

## Rejected alternatives

- **A `cycle` field on `Edition`.** Rejected above — no retailer's real publication needs it.
  **The fallback cost, named explicitly:** if a future ALDI (or Volg) flyer capture ever shows its
  two cycles split into genuinely separate publications, the cost of having chosen no `cycle` field
  now is not "add the field back" — by then WP-J2's `collection_edition` table will exist with
  primary key `(retailer, publication)`, and `publication` alone will have stopped being unique for
  that retailer. Recovering means a primary-key migration on a live table, not a one-line type
  change. That cost is accepted here because the evidence for "one publication" is measured, not
  assumed (see the decisive fact above) — but it is the real cost, and worth naming rather than
  discovering later.
- **A shared `THURSDAY_ANCHORED_RETAILERS` list, imported by all four flyer adapters.** Rejected:
  collapses four independently-evidenced facts into one, and would need to be un-collapsed the day
  any one of the four retailers changes its cycle without the others.
- **Keeping `kw`/`year` on `LiveSourceOptions`, with `editionFor` computed only for the ledger.**
  Rejected: the URL a retailer is asked for would then be able to disagree with the `Edition` the
  ledger believes it fetched — exactly the "guard fed an intent value instead of a real one" shape
  HANDOVER §4 #5 already names as a recurring defect class.

## Consequences

- **Blast radius:** `OfferSource` port signature (`fetchOffers`, new `editionFor`); all seven
  adapters; `live-sources.ts` (drops `kw`/`year` from `LiveSourceOptions`, threads `Edition` into each
  adapter's `loadPages`/`fetchFlyer`/`flyerUrl` dependency); `collect-offers.ts` (`runOne` now calls
  `source.editionFor(referenceDate)` before `fetchOffers`); `run-pipeline.ts` and `composition.ts`
  (drop the shared `IsoWeekParts` argument to `PipelineDeps.sources`).
- **Also closed in the same pass (adjacent, not re-litigated):** the Lidl flyer JSON was fetched
  twice per collection — once to read products, once more just to read `pdfUrl` off it
  (item 1 RCA, path f). `lidl-flyer-source.ts`'s `fetchOffers` now reads both out of the ONE response
  `deps.fetchFlyer` returns (`extractPdfUrl`), mutation-tested.
- **A small semantic change, noted here because the code review found it undocumented:** a Lidl
  flyer JSON carrying no `pdfUrl` now reports `source-changed` (the shape of the response is not
  what was expected) rather than the earlier `source-unavailable` `live-sources.ts` used to raise
  via its own `unavailable()` throw-and-catch. `source-changed` is the more accurate reason — the
  fetch succeeded, the shape did not match — but it is a behaviour change for anything reading
  `CollectionFailureReason` (alerts, the run summary), not merely a refactor.
- **Not yet built:** the fetch ledger itself (WP-J2) — `decideFetch(edition, record)`, the
  `collection_edition` table, and the actual "never call `fetchOffers` twice for one edition"
  enforcement. This package makes the mechanical call unconditionally; WP-J2 inserts the gate.
- **Risk:** if a retailer's publication calendar drifts from what is recorded here (a Thursday
  anchor moving, a URL scheme changing), the per-adapter constant and its citation are the single
  place to correct — and the golden-master/URL tests in each adapter's own test file, plus
  `live-sources.test.ts`'s composition-root tests, will show a 404 or a wrong-week fetch immediately
  rather than silently.

## Known gaps, carried forward to WP-J2 (not fixed in this package)

- **CF-1: ALDI's dual-cycle bundling is not fixture-backed.** The committed fixture
  (`aldi/__fixtures__/catalog-kw37-pages3-6.xml`) contains only the `AB DONNERSTAG, 10.9.` heading;
  `AB MONTAG, 14.9.` exists only as a string literal in `parseCycleStart`'s own test and in this
  ADR's prose, never in an offline fixture. Nothing in the committed test suite would go red if
  ALDI ever split its cycles into two catalogues. Capture a Monday-cycle page from the next real
  ALDI fetch and add it to the fixture set.
- **CF-2: No year-boundary test for `isoWeekOfCycle`.** Verified by hand during code review:
  `isoWeekOfCycle(new Date('2027-01-04'), 4)` (a Monday, Thursday anchor) correctly returns
  `2026-W53` — the ISO year-53 case, canonical and correct. `IsoWeek` becomes a persisted primary
  key in WP-J2, so this should be a committed regression test, not a one-off manual check that
  leaves no trace once the reviewer's terminal closes.
- **CF-3: `run-pipeline.ts`'s local `week` variable (feeding `collectOffers`'s `runWeek` display
  argument) should probably not exist at all once per-source `SourceSpan.publication` (MUST-FIX 1)
  is the field anyone actually reads.** Kept for this package because removing the run-level display
  week is a product decision about what the step summary heading shows, not a mechanical follow-on
  of this fix.

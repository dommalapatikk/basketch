# PM decisions — taxonomy divergence (WP-T1 / WP-T2 / WP-W5)

**Date:** 2026-09-17
**Decided by:** Kiran (PM/product owner)
**Context:** `docs/rca/2026-09-17-architect-taxonomy-divergence.md` and
`docs/rca/2026-09-17-tech-lead-taxonomy-divergence.md`, after cross-review.

These are **product** decisions. The technical rulings that surround them belong to
the Tech Lead and are recorded in those two files, not here.

---

## PM-1 — General merchandise is grouped, not promoted

**Decision: toys, clothing, books & media, appliances, stationery, garden, DIY, baby
and kiosk are presented under a single `general-merchandise` top group, NOT as
individual top-level browse categories.**

**The question.** Fixing the taxonomy gives a browse chip to ~28% of the active
catalogue that currently has none — measured on 2026-09-17: 227 toys, 91 clothing,
26 kitchen-appliance, 23 books-media, 13 home-textiles, plus stationery, tools,
plants and baby goods. Mostly Coop, whose feed carries far more general merchandise
than the other six retailers. 92% of the unmapped deals are top-level `non-food`.

**Why grouped.** basketch is a grocery price-comparison product that routes a
shopping list to the cheapest store. Giving Toys and Clothing chips equal visual
weight to Dairy and Bakery changes what the product appears to *be* — a shopper
opening the browse page would see a general catalogue, not a grocery comparison.
Grouping keeps the grocery categories legible while leaving the non-food deals
findable, which is the actual defect being fixed: those ~330 deals are currently
unbrowsable.

ADR-001 already contemplated a `general-merchandise` top group, so this is the
designed option rather than a new invention.

**What this does NOT mean.** The deals are not hidden, not filtered out, and not
deprioritised in search or in the deal list. They remain fully visible; only their
browse presentation is grouped.

**Consequence for the build.** `BROWSE_CATEGORIES` is the source of truth and the DB
seed is generated from it, so this grouping must be expressed IN `BROWSE_CATEGORIES`
— not as a second translation layer in the frontend. A translation table is exactly
the mechanism this whole work package exists to delete (five copies of one
vocabulary, four failing open). If expressing it there is not straightforward,
escalate rather than adding a sixth copy.

---

## PM-2 — The German labels ship now, on their own

**Decision: the missing sub-category labels ship this week as their own small
package, independently of WP-T1.**

**The question.** `web-next/src/lib/sub-category-labels.ts` carries German and
English labels for 28 sub-categories. The pipeline emits far more. Measured on
2026-09-17 against live data: **35 distinct sub-categories covering 585 of 1,169
active deals (50%) have no German label**, so a visitor to `/de` sees Title-Cased
English section headings — "Toys", "Pastry", "Dough", "Kitchen Appliance",
"Body Care".

**Why now, and why separate.** This is the most visible defect of the set: it is on
every deal card and every sub-category heading, whereas the category-filter gap sits
two taps deep behind a Type selection. It is also genuinely independent — the Tech
Lead confirmed `deals.sub_category` values are NOT changing under either design, so
these labels do not translate strings that are about to be deleted.

**Split, confirmed by the Tech Lead's cross-review:**
- **Sub-category labels (48 of 76 missing) — no dependency. Ships now, lane W.**
- **Category labels (22 chips) — must follow WP-T1**, because those slugs change.

The architect's WP-T2 correctly bundled the category half after T1 and incorrectly
bundled the sub-category half with it. This decision splits them.

**Build note.** Do not add a sixth copy of the vocabulary. The endorsed mechanism is
messages keyed by slug, guarded by a test that reads the generated `.sql` artefact —
a plain file both halves of the repo can read despite `web-next` being unable to
import `shared/`. The file's existing header ("keep in sync with
`pipeline/categorize.py`") names a file that no longer exists and must be corrected.

### Amendment, 2026-09-17 — the guard mechanism named above was substituted

**As built, the guard does NOT read a generated `.sql` artefact.** It is
`shared/sub-category-labels.test.ts`, which imports
`web-next/src/lib/sub-category-labels.ts` by relative path and asserts set equality
against `BROWSE_CATEGORIES` in both directions.

Recorded here rather than left in a code comment, because PM-2 named a specific
mechanism and this is a deviation from it. Two reasons, both accepted on review:

1. **The `.sql` artefact does not exist yet.** WP-T1 owns generating the DB seed
   from `BROWSE_CATEGORIES`, and WP-T1 has not landed. Gating W5 on it would have
   re-created the very dependency this decision exists to remove — and a guard that
   reads a file nothing produces is a guard that passes because there is nothing to
   check.
2. **A direct import is strictly stronger than parsing an artefact.** It verifies
   the exported binding rather than the text that produces it. The rejected
   alternative — an `fs` + regex read — is a parser nobody tests, whose
   characteristic failure is matching zero entries and passing silently. That is
   fail-open by construction, which is the defect class this package closes.

The import direction is the safe one: the `@shared/*` trap documented in CLAUDE.md
is about alias resolution (`tsc` honours `paths`, the runtime ignores them) in the
`web-next → shared` direction. This is a plain relative path in the reverse
direction, in a test that is never shipped. Its failure mode is red-in-CI, not
green-in-CI-broken-in-production.

**Carry-forward:** retarget the guard at the generated `.sql` once WP-T1 lands — at
that point the artefact is what the database actually enforces, which makes it the
better anchor. And note the coupling this creates meanwhile: `ci.yml`'s
`test-shared` job installs **pipeline** dependencies only, so the day
`sub-category-labels.ts` gains any import of its own, the shared suite breaks with a
module-resolution error in a job named after something else. The file's header states
import-free as a **rule**, names the specific import most likely to be added by a
well-meaning refactor (`import { BROWSE_CATEGORIES } from '../../../shared/types'`),
and warns that the tempting fix will be to delete the guard.

---

## PM-3 — Deferred, not decided: the 11,206 historical rows

**No decision required, by design.**

The architect's original plan required deleting rows with no category before
`NOT NULL` could be applied. That count was estimated at "under 50". Measured
against production it is **11,206 of 26,371 deals (42.5%)**, of which 10,137 also
have no `sub_category` and can never be repaired by any backfill.

The Tech Lead's `CHECK (category_slug IS NOT NULL) NOT VALID` ruling enforces the
invariant on every INSERT and UPDATE from the moment it is applied, **without
scanning or deleting a single historical row**. The product decision is therefore
not needed to ship the fix, and is explicitly deferred.

For whenever it IS raised: nothing reads inactive deals (every read path filters
`is_active = true`) and there is no price-history feature, so they are dead weight
today. The only argument for keeping them is a future price-history product. That
makes it a data-retention decision, not a schema one.

---

## Open, still with the PM

- **`coffee-tea` stops being a category** and its 9–11 deals move under Drinks.
  Correct under the new taxonomy, but visible to a returning shopper. No decision
  taken yet; flagged so it is not a surprise.
- **Category chips are invisible at the default `?type=all`.** Fixing the data does
  not by itself surface categories to a first-time visitor. Fixing that is a design
  change, not part of WP-T1.

# RCA + design: the taxonomy divergence

**Author:** Architect agent · **Date:** 2026-09-17 · **Status:** revised after cross-review with the Tech
Lead (§12). Ready for build.
**No source code was changed in writing this.** Every claim below is traced to a file and line.

**Reads as prerequisite:** `CLAUDE.md`, `docs/rca/2026-09-15-final-plan.md`, `HANDOVER.md` §4,
`docs/rca/2026-09-17-tech-lead-taxonomy-divergence.md`.

> **Revision note (2026-09-17, after cross-review).** Sections marked **[amended]** changed after reading the
> Tech Lead's independent analysis. The substantive changes: I was **wrong to be silent about the live
> foreign key** (§1.4, §12.1); the migration is now **one transaction** with the Tech Lead's statement order
> (§5.2); the build order now follows their sequencing ruling (§5.7); WP-T2 is rescoped around the 48
> missing sub-category labels (§9). I **hold** `NOT NULL` (§6, §12.2) and I hold **deleting the alias
> lookup** (§12.6), with the arguments strengthened rather than restated.

---

## 0. The verdict in six lines

1. There are not two taxonomies. There are **five copies** of one vocabulary, four of which fail open.
2. The root cause is not the 2026-09-11 expansion. It is that **the pipeline throws away a field it already
   has** — the classifier's validated browse category — and then reconstructs it from a second,
   hand-maintained lookup table. `dc9a0a4` only made the reconstruction start missing.
3. **`BROWSE_CATEGORIES` is the source of truth.** `taxonomy_alias` is deleted. `taxonomy_category` survives
   as a *generated projection* of `BROWSE_CATEGORIES`, kept only because it is the foreign key that makes
   "an unmapped deal is never published" a property of Postgres rather than a habit.
4. The 608 divergent rows are **remapped, not renamed and not left** — via `sub_category`, which is the
   mapping that is already authoritative, not via a second hand-written category→category table.
5. **`deals.category_slug` becomes `NOT NULL`.** This is not a new risk: it is already true of every row the
   database will accept, because `deals.category` is `NOT NULL` and is derived from the *same* field. The
   April 2026 migration itself called the nullability **temporary** (§6, point 5).
6. The category filter is **not** dead for the 608. It works. It is *incoherent* — which is worse, because
   nothing looks broken.

---

## 1. What I verified

Everything in the brief checked out. Four things the brief did not say, which change the design. The fourth
I did **not** find on my own; the Tech Lead did, and it is the most consequential fact in the problem.

### 1.1 The live frontend does **not** use `BROWSE_CATEGORIES`

`grep -r BROWSE_CATEGORIES web-next/src` → **zero matches.** The only frontend importing it is
`archive/web-vite/`, which is retired. `web-next` cannot import `shared/` at all
(`lib/deal-attributes.ts` records the Turbopack rule; `lib/v3-types.ts:4` and
`lib/domain/storage-state.ts:11` both say "single source of truth still lives in shared/types.ts" and then
keep a local copy anyway).

The live category facet is **purely data-driven**. `filter-deals.ts:130` and `FilterSheet.tsx:75` build the
chip list from `new Set(deals.map(d => d.categorySlug))`. Labels come from `humaniseSlug()`
(`FilterSheet.tsx:35-40`, `FilterRail.tsx:40`), icons from `iconForSubCategory()` with a `Package` fallback
(`IconHeading.tsx:123-133`).

**Consequence for the decision in §3:** the argument "BROWSE_CATEGORIES already drives the browse UI, so it
wins" is *false as stated*. It wins for a different and stronger reason — see §3.

### 1.2 The answer to the open question: what happens to the 608

The brief asked me to determine this. Traced through `filter-deals.ts` and both filter surfaces:

| Question | Answer | Evidence |
|---|---|---|
| Does the chip render? | **Yes.** | `FilterRail.tsx:170-203`, `FilterSheet.tsx:187-213` — the list is built from the data, so `dairy-eggs` produces a chip. |
| Is the label broken or missing? | **Neither.** It is machine-generated: "Dairy Eggs", "Home Cleaning", "Pasta Rice Grains", "Vegetables Fruits", "Prepared Meals". | `humaniseSlug()` title-cases the slug. No crash, no empty string. |
| Is the icon broken? | No. `dairy-eggs` contains `dairy` → `Milk`. Unmatched slugs fall back to `Package`. | `IconHeading.tsx:129-132` |
| Is the filter dead for them? | **No. It works correctly.** `?cat=dairy-eggs` returns exactly those 55 deals. | `matchDeal` (`filter-deals.ts:28`) compares the URL string to `d.categorySlug` — both sides are the DB value, so they agree. |

**So the filter is not substantially broken for all deals. It is broken for 561 and *incoherent* for 608.**
Incoherent is the more interesting failure, because it is invisible:

- Under `type=long-life` a shopper sees **"Drinks" and "Coffee Tea" as sibling chips**, while the model that
  produced the data treats `coffee-tea` as a *sub-category of* `drinks` (`shared/types.ts:257`). The two
  schemes disagree about **levels**, and the UI presents both levels as peers.
- 227 toys, 91 clothing, 26 kitchen-appliance deals have **no chip at all** and vanish on any category click.
- `subCategoryCounts` (`filter-deals.ts:160-192`) narrows sub-category chips to the selected category, so
  under "Dairy Eggs" you get `dairy` and `eggs` — internally consistent, and therefore reassuring. Nothing
  on screen tells a shopper that a fifth of the catalogue is unreachable.

**One mitigating fact, worth knowing before estimating user impact:** the category section only renders when
a Type is selected (`FilterRail.tsx:150` `showCategory`, `FilterSheet.tsx:176` `draft.type !== 'all'`), and
the default is `type=all`. A shopper who never touches the Type filter never sees a category chip at all, so
the 48% loss is shielded behind two taps. That lowers the *incident* severity. It does not lower the *data*
severity, and it is itself a browse-UX question for the PM (§8, F-3).

### 1.3 The vocabulary is copied five times, and four copies fail open

| # | Copy | Size | On an unknown value |
|---|---|---|---|
| 1 | `shared/types.ts` `BROWSE_CATEGORIES` | 22 / 76 | **Fails closed** — `createClassification` rejects (`transformation/domain/classification.ts:85-92`) |
| 2 | `taxonomy_category` / `taxonomy_subcategory` / `taxonomy_alias` | 17 / 50 / 28 | Fails open — `resolveTaxonomy` returns the deal unchanged (`resolve-taxonomy.ts:61`) |
| 3 | `web-next/src/lib/sub-category-labels.ts` | **28 of 76** | Fails open — falls back to the raw key. Its own header says *"Keep in sync with pipeline/categorize.py"*, a file that no longer drives classification. |
| 4 | `web-next/src/components/ui/IconHeading.tsx` `ICON_RULES` | ~40 substrings | Fails open — `Package` |
| 5 | `shared/category-rules.ts` `CATEGORY_RULES` | legacy keyword rules | n/a — deliberately stale, slated for deletion |

Copy 1 is the only one with an invariant. That asymmetry *is* the bug.

### 1.4 **[amended]** The foreign key exists in production and is absent from the repository — I missed this

**I did not verify the constraint. I read `00000000000000_baseline.sql:87`, saw `category_slug TEXT` with no
`REFERENCES`, and concluded the column was unconstrained.** The Tech Lead checked the database instead of
the repository and found a live `deals_category_slug_fkey`; the coordinator confirmed it independently
against `pg_constraint`. I was wrong, and the way I was wrong is the point: **I validated a design against a
schema that production does not have.** My §6 argument for `NOT NULL` was built on the premise that the FK
was "the disarmed guard". It is not disarmed. It is live, and it is missing from the repo.

The mechanism, which I did verify myself once told where to look:

- `00000000000000_baseline.sql:87` declares `category_slug TEXT` — no FK — and its prefix sorts first.
- `20260425_taxonomy_4level.sql:107-108` then runs
  `ALTER TABLE deals ADD COLUMN IF NOT EXISTS category_slug TEXT REFERENCES taxonomy_category(slug);`
  Postgres skips the **entire** `ADD COLUMN` clause when the column exists — **the `REFERENCES` clause
  included.** On a rebuilt database the FK is never created.

**Repo schema ≠ production schema, on exactly the column this work package is about.** Everything this
implies is worked through in §12.1, and §5.2 and §8 are amended accordingly.

---

## 2. Root cause

### 2.1 Five whys

1. **Why do 561 active deals have `category_slug = NULL`?**
   `resolveTaxonomy` looked up the classifier's `subCategory` in `taxonomy_alias`, found nothing, and
   returned the deal unchanged (`resolve-taxonomy.ts:58-63`). A miss writes NULL and continues.

2. **Why was there a lookup at all?**
   Because the pipeline had already discarded the answer. `classify-deals.ts:372`:

   ```ts
   category: topCategoryFor(fields.category) as Deal['category'],
   ```

   `fields.category` is the classifier's browse category — `'dairy'`, `'toys-games'` — already validated
   against `BROWSE_CATEGORIES` in the domain. `topCategoryFor` collapses it to its top group
   (`'fresh'`), and `shared/types.ts:505-512` gives `Deal` **no field to carry the browse id**. The only
   survivor is `subCategory`. So the value was thrown away at 09:00 and reconstructed, badly, at 09:05 —
   from a strictly weaker signal (the child) through a strictly weaker mechanism (a hand-maintained table).

3. **Why was it discarded?**
   Because of the fix to **HANDOVER §4 defect #3** — *"Browse category written to `deals.category`" →
   `Upserted 0 of 922`*. `deals.category` has a CHECK for the three top groups, so writing `'dairy'` there
   killed three cutovers. The fix mapped browse → top group. The comment above the line
   (`classify-deals.ts:366-371`) explains exactly why it must not go in `deals.category`.
   **Nobody asked where it *should* go.** The answer — `deals.category_slug`, a column that already existed,
   already FK'd, already read by the frontend — was sitting one line away in `dealToRow`
   (`shared/types.ts:961`). **The fix for defect #3 created this defect.** Loud bug, silent twin.

4. **Why did the 2026-09-11 expansion not fail?**
   Because the two vocabularies are joined by a **nullable** foreign key.
   A nullable FK is an invariant **any row may opt out of by writing NULL**. Postgres was never asked a
   question it could refuse. Add `taxonomyVersion: 3`, which invalidated the whole classification cache and
   forced 90 new tags through at once, and 48% of the catalogue opted out in a single run.

5. **Why did no test catch it?**
   `shared/types.test.ts:35-49` has a tripwire — *"has 22 browse categories"*, *"maps 76 sub-categories"*.
   It compares **code against code**. `dc9a0a4` updated the numbers in the same commit, which is what a
   tripwire is for. No test anywhere compares `BROWSE_CATEGORIES` against `supabase/migrations/`, and no test
   runs `resolveTaxonomy` over the real taxonomy. `resolve-taxonomy.test.ts` uses a hand-built `AliasMap`, so
   it passes against an alias table that does not exist.

### 2.2 Root cause, stated structurally

> **A shared vocabulary was replicated across a module boundary with no mechanical link between the copies,
> and the one operation that joins them was allowed to fail silently.**
>
> The pipeline discards the classifier's validated browse category and re-derives it from a second,
> independently-maintained table. That re-derivation has no invariant: a miss produces `null`, `null` is a
> legal value for the column, and the run reports success.

Both named defect classes from HANDOVER §4 are present, in sequence:

- **"An operation reporting success while doing nothing."** `resolveTaxonomyStep` logs
  `Taxonomy alias: 608/1169 deals got a category_slug` (`run-pipeline.ts:411`) and
  `console.warn`s the unmapped tags (`:407`) — then returns normally. 48% coverage is printed as an INFO
  line. No alert reads it. `shouldFailRun` never sees it. This is the same shape as
  *"enriched 1618/1620, zero rows changed"*.
- **"A correct unit that nothing wires up."** `pipeline_unknown_tags` is written correctly
  (`resolve-taxonomy.ts:100-116`) into a table with **no reader** — no dashboard, no query, no alert, no
  frontend. It has been accumulating since 11 September. The RCA that produced these numbers was done by
  hand against production, not by reading the table built for exactly this purpose.

### 2.3 The missing invariant, named

> **`deals.category_slug` must name a category that exists, for every published deal — and the set of
> categories that exist is defined in exactly one place.**

Three things are needed to make that true, and none of them existed:

| Needed | Was | Becomes (§5, §6) |
|---|---|---|
| A single definition of the category set | Two, drifting | `BROWSE_CATEGORIES`; the DB table is generated from it |
| The column cannot be empty | Nullable | `NOT NULL` |
| Code and database cannot disagree | Nothing checked | A CI test + a run preflight |

---

## 3. Decision: which taxonomy is the source of truth

### 3.1 The candidates

**A. `BROWSE_CATEGORIES` in `shared/types.ts`.** DB tables become a generated projection.
**B. `taxonomy_category` / `taxonomy_alias` in Postgres.** Code reads the taxonomy at run start.
**C. Delete the DB tables entirely.** `category_slug` is free text validated only in code.

I am required to argue A rather than assume it, and specifically to ask whether the DB tables earn their
existence. Here is the honest case for each.

### 3.2 Weighted matrix

Weights: 3 = decides the outcome, 2 = matters, 1 = tie-breaker.

| Criterion (weight) | A: code is truth | B: DB is truth | C: code only, no tables |
|---|---|---|---|
| Already enforces an invariant at construction (3) | 5 → **15** — `createClassification` rejects an unknown category *today* (`classification.ts:85`) | 1 → **3** — would require loading the taxonomy before the domain can validate, i.e. an infrastructure dependency inside the domain layer. CLAUDE.md forbids it. | 5 → **15** |
| Database can refuse a bad write (3) | 5 → **15** — FK survives | 5 → **15** | 1 → **3** — free text; the next divergence is silent again |
| Reviewable in a pull request (2) | 5 → **10** — a diff | 1 → **2** — a seeded row an operator may have edited in the Supabase console; the repo cannot tell you what is live | 5 → **10** |
| Change cost for one new category (2) | 4 → **8** — edit the constant, regenerate, one migration | 2 → **4** — a migration *plus* alias rows, and the code constant anyway (the prompt needs it) | 5 → **10** |
| Cost of getting it wrong (2) | 4 → **8** — CI fails | 2 → **4** — silent until the next run | 1 → **2** — silent forever |
| Ubiquitous language (1) | 4 → **4** — one word, "browse category" | 2 → **2** — three levels named `category` | 4 → **4** |
| Fewest moving parts (1) | 3 → **3** | 2 → **2** | 5 → **5** |
| **Total** | **63** | **32** | **49** |

### 3.3 Decision

**`BROWSE_CATEGORIES` is the source of truth. `taxonomy_alias` is deleted. `taxonomy_category` and
`taxonomy_subcategory` survive as generated projections of it.**

The decisive argument is not "it already drives the UI" (§1.1 shows it does not). It is this:

> **The classifier's output is already validated against `BROWSE_CATEGORIES` in the domain, at construction,
> before a `Classification` can exist.** That is the project's own definition of an invariant
> (CLAUDE.md: *"enforced in the constructor, never by a caller remembering to check"*). Any other source of
> truth requires *a second* validation against *a different* list — which is precisely the arrangement that
> produced 561 nulls.

**Why C is rejected, and this is the interesting part.** C is simpler, and the standing rule is
"reject over-engineering". I reject it anyway, on one ground: the FK is the only mechanism in the entire
system capable of noticing this class of bug, and it was defeated solely by being nullable. Make it
`NOT NULL` and it becomes the cheapest possible guard — zero code, zero maintenance, enforced on every write
by software we do not own. Deleting it to save one generated `INSERT` statement trades a permanent, free
invariant for a one-off tidiness win. `concept_family.category_slug` also references it
(`20260427_v3_concept_layer.sql:77`, **32 of 70 live rows non-null**, per the Tech Lead's live count), so C
additionally means dropping a constraint on a second table.

**What the DB tables are demoted to:** they are no longer a *definition*. They are a **projection**, with
exactly two jobs — (1) give the FK something to point at, (2) supply the one-time `sub_category → category`
mapping the backfill joins on. They are generated, never hand-edited, and a test fails if they drift.
**They are not consulted at runtime.** That distinction is the substance of §12.6.

### 3.4 Reversibility (Bezos two-way door) **[amended]**

| Decision | Door | Analysis given |
|---|---|---|
| Which constant is truth | **Two-way** — the projection can be regenerated in either direction | Fast. Decided above. |
| `category_slug` **values** (the slug strings) | **One-way-ish** — they appear in `?cat=` URLs | §5.3. Bounded: no sitemap, no static route, no canonical link, no share URL, and **no internal link emits `?cat=`** (Tech Lead §2). |
| `category_slug` **NOT NULL** | **One-way in practice** — reverting means re-accepting silent loss | §6, §12.2 |
| Deleting `taxonomy_alias` (the **lookup**) | **Two-way** — seeded reference table, re-creatable from the migration | Fast. Delete it. §12.6. |
| Dropping the **FK** | **Genuinely one-way** — it is the only enforcement this column has | **Not done.** Kept, and re-created where the repo is missing it. Tech Lead §6 and I agree completely here. |

---

## 4. Answering the brief's questions directly

**Q: Rename, remap, or leave the 608?**
**Remap, and remap all 1,169 — not just the 608.** Driven by `sub_category`, not by a
category→category table. §5.2.

**Q: Are existing `category_slug` values in any URL or bookmark that renaming would break?**
**Yes, one surface, and it is bounded.** `?cat=<slug>` on `/[locale]/deals` (`lib/filters.ts:68, 84`).
Verified absent from: `sitemap`, any static/dynamic route segment, `lib/share.ts`, `lib/share-url.ts`, any
`<link rel=canonical>`, any `<Link href>` with a hard-coded slug. The Tech Lead independently confirmed the
same set and added that **no internal link emits `?cat=` at all** — the only producer is `serializeFilters`
after a user clicks a chip, and those chips regenerate weekly from live data.
**Failure mode on a stale bookmark: an empty list, not a crash** — `parseFilters` accepts any string
(`filters.ts:68`) and `matchDeal` then matches nothing. Mitigation in §5.3. We both independently required
the same eight-to-twelve-line `TYPE_ALIASES`-shaped fix; that one is closed.

**Q: Should `deals.category_slug` be `NOT NULL`?**
**Yes.** §6, defended against the Tech Lead's counter-ruling in §12.2.

---

## 5. The fix — WP-T1 (data correctness), test-first

**[amended]** **Lane:** a **fourth lane (T)**, opening when WP-J1 merges — the Tech Lead's sequencing ruling,
adopted in full (§5.7, §12.4). **WP-T1 touches no file any open package owns, including `shared/types.ts`.**
**MIG:** one transactional migration, plus a follow-up for `NOT NULL`. **ADR:** yes, §10.

### 5.0 The trap that would make this fix inert

> `resolveTaxonomyStep` runs **after** classification (`run-pipeline.ts:839`). If you set `categorySlug` at
> classification time and leave that step in place, the alias table **overwrites 608 of your correct values
> with the old divergent slugs** and leaves the other 561 correct by accident.

Delete `resolveTaxonomyStep` **in the same commit**. Otherwise this is "a correct unit that nothing wires
up", for the eleventh time. The composition-root test in §5.5 exists to make that impossible.

### 5.1 The code change (small) **[amended]**

| File | Change |
|---|---|
| `pipeline/transformation/application/classify-deals.ts` | In `toDeal` (`:372`): add `categorySlug: fields.category` beside the existing `category: topCategoryFor(fields.category)`. **One line.** The value is already validated. |
| `pipeline/run-pipeline.ts` | Delete `resolveTaxonomyStep` (`:402-413`) and its call (`:839`). Remove `loadAliases` + `reportUnknownTags` from `StorageDeps` (`:88-89`). Add the preflight (§7.2). |
| `pipeline/resolve-taxonomy.ts` + `.test.ts` | **Delete.** Read first, per the project's read-before-delete rule. |
| `pipeline/composition.ts` | Drop the two removed deps; wire `readTaxonomyCategorySlugs`. |
| `pipeline/storage/domain/deal-row.ts` | `offerToRow` (component-3 path, not currently wired into `run.ts`) gains `category_slug: classified.category`, so the two write paths cannot disagree the moment the second is switched on. |

`shared/types.ts` `dealToRow:961` already writes `category_slug: deal.categorySlug`. **No change.** That is the
measure of how close the correct answer always was.

**`shared/types.ts` is NOT edited by WP-T1.** My first draft retyped `Deal.categorySlug` from
`string | null` to `BrowseCategory` and rewrote the stale comment at `:509-512`. The Tech Lead is right that
lane C owns that file and WP-J1 is in review against it; re-basing a package already in code review to
accommodate a type narrowing is a self-inflicted wound. The one-liner in `classify-deals.ts` type-checks
fine against `string | null`, so nothing is blocked. **Both edits move to WP-T2**, after J1 merges.

### 5.2 The data fix **[amended — rewritten after cross-review]**

**Filename:** `supabase/migrations/20260918090000_taxonomy_align_to_browse_categories.sql`.
Fourteen digits, strictly greater than every existing prefix. My first draft used `20260917a_…`, which
violates the convention that this session's duplicate-prefix incident already proved is load-bearing. The
config test enforcing it is in §7.1.

**One file, one transaction.** I originally split projection+backfill from `NOT NULL`, which is the right
split; but within the first file I had the rename `UPDATE`s and the `DELETE` as loose steps. The Tech Lead's
framing is better and I adopt it wholesale: **the final `DELETE` is not cleanup, it is the integrity
assertion** — if any child row anywhere still points at a retired category, the FK raises and the whole
transaction rolls back. You only get that guarantee if the repointing and the delete are in the same
transaction.

Statement order. Every step is `ON CONFLICT DO NOTHING` or an idempotent `UPDATE`, so re-running is a no-op.

```
1.  taxonomy_type          INSERT 'non-food'
                           (deals.category already emits it; 'household' stays, unreferenced)
2.  taxonomy_category      INSERT all 22 BROWSE ids, ON CONFLICT DO NOTHING   (7 exist, 15 new)
3.  deals                  DO $$ … IF NOT EXISTS (SELECT 1 FROM pg_constraint
                             WHERE conname='deals_category_slug_fkey')
                           THEN ALTER TABLE deals ADD CONSTRAINT deals_category_slug_fkey
                             FOREIGN KEY (category_slug) REFERENCES taxonomy_category(slug);
                           END IF; $$                                   ← §1.4: repo ≠ production
4.  taxonomy_subcategory   INSERT all 76 sub-categories with their BROWSE parent (28 exist, 48 new)
                           UPDATE the 28 existing rows onto their new parent
5.  deals                  UPDATE category_slug per rename pair                 (the 608)
6.  concept_family         UPDATE category_slug per rename pair                 (32 live rows)
7.  taxonomy_alias         UPDATE category_slug per rename pair   (28 rows — repoint, then dropped
                                                                   in WP-T2 once nothing reads it)
8.  taxonomy_category      DELETE WHERE slug NOT IN (<the 22>)                  ← THE ASSERTION
    taxonomy_type          DELETE 'household'
9.  deals                  UPDATE d SET category_slug = s.category_slug
                             FROM taxonomy_subcategory s
                            WHERE s.slug = d.sub_category
                              AND d.category_slug IS NULL                       ← backfill of the 561
```

**Step 3 is mine, and it is not optional.** Without it, a reviewer who rebuilds a test database from this
repository validates the migration against a schema with **no FK on this column** — step 8's `DELETE`
succeeds where production would roll back, and the migration is certified by a test that cannot fail.
`IF NOT EXISTS` via a `DO` block rather than `DROP … ADD`, so production is never momentarily unconstrained.
Rationale in §12.1, question 4.

**Step 9 joins on `sub_category`, and that choice is load-bearing.** This is the whole lesson of the RCA
restated as a technical decision:

- It uses the mapping that is **already authoritative and already unique** (`shared/types.test.ts:51-55`
  guarantees no sub-category belongs to two browse categories).
- It fixes **all 1,169 rows**, not the 608. Every one of the top-ten unmapped tags resolves:
  `toys → toys-games`, `clothing → clothing-textiles`, `kitchen-appliance → household-appliances`,
  `books-media → stationery-media`, `pet-food → pet-supplies`, `pastry → bakery`,
  `home-textiles → clothing-textiles`, `coffee-tea → drinks`, `electronics-accessories → stationery-media`,
  `dough → bakery` — **444 of the 561 in the top ten alone.**
- **It gets a case a hand-written category→category map would get wrong.** ADR-001 moved `wine` and `beer`
  out of `drinks` into `alcohol` (`shared/types.ts:255-256, 275`). A category map would send DB `drinks` →
  BROWSE `drinks` and silently leave wine in the soft-drinks aisle. The sub-category join sends
  `sub_category='wine'` to `alcohol`, correctly, with nobody having to remember.

For readers, the resulting category→category effect (**derived**, not a table anyone maintains):

| Old DB slug | Becomes | Note |
|---|---|---|
| `dairy-eggs` | `dairy` | |
| `vegetables-fruits` | `fruits-vegetables` | word order reversed in code |
| `home-cleaning`, `laundry`, `paper-goods` | `home` | three merge into one |
| `personal-care` | `beauty-hygiene` | |
| `coffee-tea` | `drinks` | **was a category, is now a sub-category** |
| `prepared-meals`, `frozen` | `ready-meals-frozen` | two merge |
| `pasta-rice-grains` | `pasta-rice-cereals` | |
| `drinks` | `drinks`, **or `alcohol`** | depends on `sub_category` — see above |
| `bakery`, `meat-fish`, `snacks-sweets`, `pantry-canned`, `beauty-hygiene`, `pet-supplies` | unchanged | the 7 that already agreed |

**`deals.sub_category` values are not touched.** They are already the code's vocabulary. The Tech Lead
pre-emptively ruled against renaming them (their §2, disagreement #8); I never proposed it and I agree —
renaming would break `sub-category-labels.ts`, `iconForSubCategory` and `subCategoryCounts` simultaneously
for no gain.

**Rollback:** the seven retired slugs and their inverse `UPDATE`s go in a `-- ROLLBACK:` comment block at the
foot of the file. No separate down-migration — this folder has no such convention and inventing one for a
single case creates a second artefact to keep in sync. (Tech Lead §3.5, adopted.)

**Verification, immediately after apply, before anything else.** Adopt the Tech Lead's six queries
verbatim (their §3.4). Two of them are ones I did not think to write and would not have caught my own
mistakes without:

- **Query 2 — the FK still exists.** Zero rows is stop-the-line: it means the migration dropped the only
  enforcement this column has.
- **Query 5 — every `sub_category` in live data resolves.** This is the query that would have caught the
  bug on 2026-09-11.

And their discipline point, which is the one always skipped: **re-run queries 1 and 5 after the next real
pipeline run.** The classifier's vocabulary is the moving part, not the table. The rollout is not complete
until one production run has passed query 5. Also confirm `REFRESH MATERIALIZED VIEW concept_cheapest_now`
still succeeds — it should, the MVs carry no category column, but this session has already lost a grant to a
DROP/CREATE cycle.

**Follow-up migration — `…_category_slug_not_null.sql`**, applied **after** the pipeline code deploy, so at
least one run has written the new values.

1. **Measure first**, and put the number in the PR:
   `SELECT count(*) FROM deals WHERE category_slug IS NULL` — rows whose `sub_category` is NULL or not in
   `BROWSE_CATEGORIES` (legacy pre-classifier rows).
2. `DELETE` them, reporting the count and a 10-row sample. They carry no category at either level, so they
   are already unreachable through every category surface; they will be re-collected next run; precedent
   #10b in the 2026-09-15 plan accepted losing 292 rows for less.
   **If the count exceeds 50, stop and escalate to the PM.**
3. `ALTER TABLE deals ALTER COLUMN category_slug SET NOT NULL;`

### 5.3 The stale-bookmark alias (included, with an expiry date)

`?cat=dairy-eggs` currently returns 55 deals. After the fix it returns **zero** — an empty page with a
"Reset" pill and no explanation.

Add a 10-entry map in `web-next/src/lib/filters.ts`, using the pattern **already there** for exactly this
reason (`TYPE_ALIASES`, `:32-34`, whose comment records that a silent fallback was *"a real perf bug we hit
during Patch G review"*):

```
CATEGORY_ALIASES: dairy-eggs→dairy, vegetables-fruits→fruits-vegetables, home-cleaning→home,
laundry→home, paper-goods→home, personal-care→beauty-hygiene, coffee-tea→drinks,
prepared-meals→ready-meals-frozen, frozen→ready-meals-frozen, pasta-rice-grains→pasta-rice-cereals
```

Applied in `parseFilters`, not in `matchDeal` — translate at the boundary, once.
**Delete after 2026-11-17** (60 days), with a dated `TODO` naming this document. `frozen→…` is a lossy
merge; that is correct — `frozen` is a storage facet now (ADR-001, `?storage=frozen`), not a category.

### 5.4 What is explicitly **not** in WP-T1

- `shared/types.ts` edits — moved to WP-T2 (§5.1), to keep out of lane C's way while J1 is in review.
- Translated labels and icons → **WP-T2** (§9), now rescoped.
- The `taxonomy-coverage` alert → **WP-T2.** The Tech Lead's ordering constraint (their §5) is correct and I
  adopt it: an alert that fires on unmapped coverage must not be switched on before the seed is fixed, or
  the very next run exits 1 by design.
- Dropping `taxonomy_alias` **the table** → WP-T2. WP-T1 stops *reading* it (deletes `resolve-taxonomy.ts`)
  and repoints its rows so step 8 can succeed. Dropping a table while a deployed pipeline might still query
  it is an unnecessary ordering hazard for zero benefit.
- `taxonomy_subcategory` **set equality.** WP-T1 asserts a **superset**: every BROWSE sub-category present
  with the correct parent; legacy rows (`cheese`, `red-meat`, `milk`) left alone. **Named, accepted
  relaxation** — nothing FKs `deals` to that table, so an extra row cannot corrupt a deal, whereas deleting
  one risks violating `concept_family.subcategory_slug`. Recorded as R-4.
- Renaming `deals.category` → `type_slug`. Still the one-way door April declined.

### 5.5 First failing tests (written before the code, named after the real defect)

**`shared/taxonomy-projection.test.ts`** (new)
- `the database projection names every browse category — 5 of 22 were missing and 561 of 1,169 live deals lost their category (2026-09-17)`
- `every browse sub-category projects to its own parent category — 'wine' belonged to 'drinks' in the database and to 'alcohol' in code`
- `no projected category is absent from BROWSE_CATEGORIES — the inverse direction, so a hand-added row is caught too` (Tech Lead §4.1 assertion 3, adopted)

**`pipeline/config/migration-filenames.test.ts`** (new, Tech Lead §3.1, adopted)
- `every migration filename is 14 digits, unique and strictly increasing — a duplicate prefix made a column silently not exist`

**`pipeline/transformation/application/classify-deals.test.ts`**
- `a classified deal carries its browse category to the row, not only its top group — topCategoryFor discarded 'toys-games' and nothing else had it (classify-deals.ts:372)`
- `an uncertain deal still gets a category_slug — the label is withheld, the category is not (D3)`

**`pipeline/run-pipeline.test.ts`** — *through the composition root*
- `a full run writes a category_slug for EVERY stored deal — the alias table produced 608 of 1,169`
- `no taxonomy alias table is consulted during a run — resolveTaxonomyStep overwrote correct values with divergent ones`
- `a run whose database taxonomy is missing a browse category makes zero fetches and exits 1` (§7.2)
- `a database taxonomy that cannot be READ exits 75, not 1 — unreadable is transient`

**`web-next/src/lib/filters.test.ts`**
- `a bookmarked ?cat=dairy-eggs still finds the dairy deals after the 2026-09-17 remap`

**`web-next/e2e/v2-acceptance.spec.ts`** (Tech Lead §4.3, adopted — and it closes a standing ticket)
- `the Category facet is populated for every Type — 561 of 1,169 deals had no category_slug`. **No
  `test.skip`.** Zero chips is a red run. This is the only guard that exercises classifier → column → facet
  → chip end to end, and the plan already flags the nine skip-on-empty assertions as a standing weakness
  (`final-plan.md:595-601`).

### 5.6 Mutation tests (each guard is proven to fail)

| Reintroduce | Must go red |
|---|---|
| Drop `categorySlug` from `toDeal` | `a classified deal carries its browse category…` |
| Restore `resolveTaxonomyStep` after classification | `no taxonomy alias table is consulted during a run` |
| Add a category to `BROWSE_CATEGORIES` without regenerating | `the database projection names every browse category…` |
| **Delete one line from the checked-in `.sql` seed block** | same test — **and this mutation is the one that matters.** The first only proves the generator sees new code; this proves the file on disk is actually read. (Tech Lead §4.1 M1/M2 — a distinction my first draft missed.) |
| Add a row to the seed by hand that is not a BROWSE id | the inverse-direction assertion |
| Make the preflight warn instead of fail | `a run whose database taxonomy is missing…` |
| Point the backfill at a category→category map instead of `sub_category` | `'wine' → alcohol` assertion |
| Rename a migration to an 8-digit prefix | `every migration filename is 14 digits…` |

### 5.7 Build order **[amended]**

**Lane order, adopted from the Tech Lead's §1 ruling: `J1 → T1 → J2 → T2 → J3`.**
I had implied T1 was urgent enough to jump the queue. It is not. **Availability outranks browsability**, and
their reasoning is sound: J3 is what stops the pipeline hitting CI's 60-minute wall, and a pipeline that does
not finish produces no rows to categorise at all. A degraded facet on a working price comparison is a
smaller harm than no data. §12.4 records the one correction I make to their plan.

Within WP-T1:

1. Generator + guard test (§7.1) — **red**, because the projection does not exist yet.
2. The migration (§5.2). Guard test → green. **The site is fixed at this point**, before any pipeline code
   ships: 1,169 rows get a slug and every chip is a browse id.
3. Run the six verification queries. Query 2 (FK present) is stop-the-line.
4. Preflight + composition-root tests (§7.2).
5. `classify-deals.ts` one-liner; delete `resolve-taxonomy.ts` and `resolveTaxonomyStep`.
6. Deploy pipeline. **Run once. Verify `Taxonomy: 1169/1169`, and re-run queries 1 and 5.**
7. `NOT NULL` migration.
8. `?cat` alias in `web-next`. Deploy.

Steps 1–3 are independently shippable and independently valuable. Step 7 must not precede step 6. (Deploy
order is not theoretical: commit `ad72e60` is a MUST-FIX for a false deploy-order claim in WP-P9.)

---

## 6. `NOT NULL`: the plain answer

### Yes. `deals.category_slug NOT NULL REFERENCES taxonomy_category(slug)`.

The Tech Lead rules against this (their §5 and §7 disagreement #1). It is the one substantive technical
disagreement between us, and the Tech Lead decides technical disagreements. I set out my case here and
address theirs point by point in §12.2; if they hold after reading it, I defer and the design degrades
gracefully — everything else in this document stands unchanged with a nullable column.

The brief asked me to weigh *"empty is not success"* against *"a run that would then fail wholesale on one
new tag."* Five reasons:

1. **There is no longer a second vocabulary to miss.** The written value *is* `classification.category`,
   which `createClassification` refused to construct unless it is in `BROWSE_CATEGORIES`
   (`classification.ts:85-87`). There is no lookup, so there is no lookup miss. "One new tag" was a hazard
   of the alias table — the table we are deleting.
2. **The constraint is already true of every acceptable row.** `deals.category` is `NOT NULL`
   (`baseline.sql:85`) and is `topCategoryFor(classification.category)`. A row with no browse category
   already cannot be written — it fails on `category`, **one column earlier, in the same batch, with the
   same blast radius.** `NOT NULL` on `category_slug` therefore adds **zero** new rejection paths.
3. **The rejection path people fear belongs to the FK, not to `NOT NULL`.** With the FK live (§1.4), any
   BROWSE id missing from `taxonomy_category` fails the write *whether the column is nullable or not*, the
   moment we write a real slug. `NOT NULL` does not create that exposure and cannot remove it. Argued in
   full at §12.2.
4. **The only remaining way to fail is projection drift** — caught twice before a run writes anything: in CI
   by the guard test, and at run start by the preflight, which exits **before any fetch, any write and any
   ledger entry**. A drifted projection costs a red build, not a lost week.
5. **The April migration called the nullability temporary, in writing.**
   `20260425_taxonomy_4level.sql:15-16`: *"Adds `deals.category_slug TEXT NULL` … **Stays nullable until
   backfill + ETL change land in a follow-up patch**."* This work package **is** that backfill and that ETL
   change. Setting `NOT NULL` now **honours** the 2026-04-25 decision; it does not invert it.

**The failure mode I am accepting, named:** a classifier that returns a category the projection lacks makes
the **whole run** refuse rather than half-publish. I accept it, and I prefer it. Half-publishing is what we
are here to fix, it is invisible, and under Art. 3(1)(e) UWG a catalogue where half the items are
unreachable by category is a worse comparison than no catalogue. A refusal pages an operator; a NULL pages
nobody.

**The one honest cost:** `NOT NULL` makes *adding a category* a two-step deploy forever — migration first,
code second. That is already the project's standing rule (`shared/types.ts:996-1001` on `min_quantity`), it
is enforced by the preflight's error message, and the ADR names it.

---

## 7. The guard that makes this un-repeatable

Two guards in WP-T1, a third in WP-T2. None is sufficient alone, and I want that stated rather than implied:

> The CI test proves **code and the intended SQL agree.**
> The preflight proves **the SQL reached the database.**
> The e2e assertion proves **a human would have seen it.**

### 7.1 Build-time — `shared/taxonomy-projection.test.ts` (blocking, in CI)

**Mechanism: generate, do not compare.** A test that *parses* SQL is a second implementation of the thing it
checks. A test that compares against *generated* SQL cannot drift. The Tech Lead reached the same conclusion
independently (their §4.1); we differ only on whether `taxonomy_alias` is among the generated artefacts
(§12.6).

| Artefact | Path | What it is |
|---|---|---|
| Generator | `shared/taxonomy-projection.ts` | Pure. `taxonomyProjectionSql(): string` from `BROWSE_CATEGORIES`. No I/O, no imports outside `shared/`. |
| Script | `shared/scripts/write-taxonomy-sql.ts` | `npm run taxonomy:sql` |
| Generated file | `supabase/taxonomy-projection.generated.sql` | Idempotent `INSERT … ON CONFLICT`, 22 + 76 rows, `-- GENERATED — DO NOT EDIT` header |
| Test | `shared/taxonomy-projection.test.ts` | byte-equality + both set directions |

**Asserts, exactly:**
1. The generated file is byte-identical to the generator's current output.
2. Every `BROWSE_CATEGORIES.id` (excluding `'all'`) appears exactly once as a `taxonomy_category` slug.
3. **No projected slug is absent from `BROWSE_CATEGORIES`** — the inverse direction, so a row added by hand
   because a tag showed up somewhere is caught too. (Adopted from Tech Lead §4.1 assertion 3; my first draft
   had only the forward direction.)
4. Every `taxonomy_category.type_slug` equals its `topCategory` **verbatim** — no translation.
5. Every sub-category appears exactly once as a `taxonomy_subcategory` slug, with its BROWSE parent.

**Failure message must name the offending ids and say what to do:**
`Run \`npm run taxonomy:sql\` and paste the changed block into a new dated migration. Missing: toys-games, …`

**It does not touch the database, and that is deliberate.** `ci.yml` carries no Supabase credentials and
should not — the service-role key grants full write access and has no business in a PR runner. The test
reads the `.sql` file with `fs`. A guard that only runs where credentials exist is a guard that runs after
the damage.

**Where it runs.** `cd shared && npx vitest run` is a **separate suite that neither `pipeline` nor
`web-next` runs** (CLAUDE.md, "easy to forget"). **A guard in a suite CI does not run is a comment.** The
Tech Lead cites `ci.yml:41-57` as an existing `test-shared` job; **the builder must confirm that job exists
and executes this file, and add it if not.** Blocking sub-task, not a footnote (R-7).

**Also in this WP: the migration-filename config test** (Tech Lead §3.1, adopted without reservation). Three
assertions over `supabase/migrations/*.sql`: 14-digit prefix, unique, strictly increasing in lexical order.
`00000000000000_baseline.sql` passes all three. This WP adds a migration, so this WP is the right one to add
the check — and this session has already lost a column to a duplicate prefix.

### 7.2 Run-time — the preflight (blocking, before any fetch)

| Layer | File | Responsibility |
|---|---|---|
| Domain (pure) | `pipeline/storage/domain/taxonomy-projection-check.ts` | `checkTaxonomyProjection(dbSlugs: readonly string[]): Result<void>` — set comparison against `BROWSE_CATEGORIES`. No I/O, no mocks. |
| Infrastructure | `pipeline/storage/infrastructure/supabase-taxonomy-projection.ts` | `SELECT slug FROM taxonomy_category` |
| Wiring | `run-pipeline.ts`, before `collectOffers` | via `StorageDeps.readTaxonomyCategorySlugs()` |

**Exit semantics, matching the T1 contract:**

| Situation | Outcome |
|---|---|
| Read fails (network, auth, Supabase down) | **exit 75** — transient, retryable |
| Read succeeds, sets differ | **critical alert `taxonomy-drift`, exit 1**, zero fetches, zero writes, **zero ledger entries** |
| Sets match | proceed |

Placed before collection so a drifted deploy costs a minute of free Actions time instead of a full run's
Gemini quota, thirty minutes of classification, and — once WP-J2 lands — a publication marked fetched that
AP-1 forbids re-fetching. **This placement is what answers the Tech Lead's strongest objection** (§12.2).

### 7.3 Schema — the third guard, free

`NOT NULL` + the FK, re-created where the repo is missing it (§5.2 step 3). No code, no maintenance,
enforced by Postgres on every write.

### 7.4 Observability — WP-T2, with the Tech Lead's thresholds

`run-pipeline.ts:411` already computes coverage and throws it into a `console.log`. Their §5 specifies the
fix better than my first draft did, and I adopt it:

- `stats.taxonomy = { mapped, total, unmappedTags }` into `pipeline_runs.metrics` (the WP-P7 jsonb column),
  so it is comparable across runs rather than a log line.
- **`taxonomy-unmapped`, warning, at >2%** — deliberately the same number as the existing
  `invalid-category-spike` threshold (`alerts.ts:294`), so the project has one number for "the prompt and
  the taxonomy have drifted", not two that can themselves drift.
- **`taxonomy-coverage-collapse`, critical, at >20% or a >20-point drop against the previous snapshot.** The
  step-change clause is what catches a `dc9a0a4`-shaped event on the day.
- **The threshold is only correct if it fires on the known incident.** A builder must verify retrospectively
  against 2026-09-11's numbers (~0% → 48%) before the threshold is accepted. Any threshold that leaves that
  run green is the wrong threshold.
- `::warning::` / `::error::` annotations and a `$GITHUB_STEP_SUMMARY` line — both already wired by WP-P7 —
  so it reaches a human without anyone reading logs.

With `NOT NULL` these alerts should be permanently at zero; they exist to catch the world being different
from the model, which is exactly when you want them. **If the PM rules against `NOT NULL`, these alerts stop
being belt-and-braces and become the primary control** — which is the Tech Lead's position, and it is a
coherent one.

**`pipeline_unknown_tags` is deleted in WP-T2**, with its contents exported to the PR description first
(read-before-delete). Its purpose dies with the alias lookup, and its replacement already exists and already
alerts: `invalidCategoryRejected` (`alerts.ts:294-300`). A table nobody queries is not an alert.

---

## 8. Risk register **[amended]**

| # | Risk | Severity | Disposition |
|---|---|---|---|
| R-1 | `NOT NULL` migration deployed before pipeline code → every write fails | **High** | Build order §5.7 makes it step 7 of 8. `ad72e60` is the precedent. Reviewer checks the order explicitly. |
| R-2 | Adding a category now needs migration-then-code, forever | Medium | **Accepted.** Already the project rule. The preflight's message names the fix. In the ADR. |
| R-3 | Stale `?cat=` bookmark → empty page | Low | Mitigated (§5.3), 60-day expiry. |
| R-4 | `taxonomy_subcategory` keeps ~30 legacy rows | Low | **Accepted, named.** Nothing FKs `deals` to it; deleting risks `concept_family`. Follow-up ticket. Guard asserts superset and says so. |
| R-5 | `taxonomy_type` keeps an orphan `'household'` row | Very low | Now **removed** in §5.2 step 8, since `'non-food'` is inserted at step 1. Was accepted; now closed. |
| R-6 | The `NOT NULL` migration's `DELETE` removes real deals | Medium | Count measured and published first; **>50 escalates to the PM**. |
| R-7 | The `shared` suite may not run in CI — the guard would be inert | **High** | Blocking sub-task of WP-T1 (§7.1). This is HANDOVER §4's defect class applied to the fix for HANDOVER §4's defect class. |
| R-8 | `iconForSubCategory` returns `Package` for several new ids | Very low | WP-T2. Cosmetic. |
| R-9 | Someone edits `taxonomy_category` in the Supabase console | Low | Preflight fails the next run. Formerly undetectable. |
| R-10 | The concept/v3 layer reads `category_slug` under the old scheme | Medium | `v3-cutover.ts:269, 96` and `seed-v3-from-deals.ts:101` filter through `validCats`/`validSubcats`, so they degrade to `null` rather than writing garbage — the fail-open pattern again, harmless only because v3 is not live. §5.2 step 6 repoints the 32 live `concept_family` rows. **Re-verify when v3 is switched on.** |
| **R-11** | **Repo-built schema lacks the live FK, so the migration can be certified by a test that cannot fail** | **High** | **New, from cross-review.** Closed by §5.2 step 3 (create the FK if absent) and verification query 2. The broader baseline-fidelity audit is a separate ticket (§12.1 q4). |
| **R-12** | **An FK violation costs up to 100 deals per batch** (`store.ts:118-142`, `BATCH_SIZE = 100`, `continue` on error) — and with WP-J2's ledger the publication is not re-fetched | **High** | **New, from cross-review.** Prevented, not mitigated: the preflight (§7.2) makes the violating state unreachable, because `emitted ⊆ BROWSE_CATEGORIES ⊆ seeded`. Argued at §12.2. Note the batch loss is **not** silent today — `logStorageShortfall` sets `storage-shortfall` → **exit 1** (`run-pipeline.test.ts:412-413`) — but exit 1 is not retried, so the week is still lost. |
| **R-13** | **`store.ts:141` `continue`s past a rejected batch**, so one bad row discards 99 good ones | Medium | **New, from cross-review. Not fixed here — carry-forward ticket.** A per-row retry after a batch rejection would turn a 100-row loss into a 1-row loss for every constraint violation this table will ever have, not just this one. Out of scope; raise it. |

### Findings for the PM (not architecture decisions)

- **F-1 — 227 of 1,169 active "grocery deals" are toys** (19%), plus 91 clothing and 13 home-textiles —
  ~28% general merchandise. Once they get a chip they become visible. ADR-001 already contemplated a
  separate `general-merchandise` top group (`shared/types.ts:278-281`). Your call.
- **F-2 — `coffee-tea` stops being a category.** 9–11 deals move under Drinks and a chip a returning shopper
  may have used disappears. Correct per one taxonomy, but visible.
- **F-3 — category chips are invisible at `?type=all`**, which is the default. Fixing the data does not by
  itself surface 22 categories to a first-time visitor. Designer/PM look after WP-T1, separately.
- **F-4 — null rate tracked retailer breadth** (coop 57%, migros 8%). Consistent with the cause; no separate
  investigation needed.
- **F-5 — [new] 48 of 76 sub-categories have no German or English label**, and this is on the **default**
  page, not behind a filter. See §9 and §12.7. **Raise in the same breath as F-1.**

---

## 9. WP-T2 **[amended — rescoped]**

The Tech Lead found the more visible half of the same bug, and I was wrong to file it as cosmetic
garnish. Rescoped, in priority order:

**9.1 Sub-category labels — 48 of 76 missing, and visible on first load.**
`sub-category-labels.ts` holds **28** DE and **28** EN entries against 76 sub-categories.
`subCategoryLabel` falls back to a title-cased slug (`:70-75`). Three things make this worse than the facet
gap, and I verified each:

- It renders in the **section headings of the default deals list** (`DealsClient.tsx:254`) — no Type
  selection, no filter, no taps. Every visitor, first paint.
- It renders **inside the shopping list and the forwarded share text** (`DealsClient.tsx:269`), so a German
  shopper's WhatsApp message says "Toys", "Pastry", "Dough".
- `subCategoryLabel` only branches `de` vs everything-else-gets-English, so **French and Italian visitors get
  English for all 76**, not just the 48.

**9.2 Category labels — 22, currently `humaniseSlug`.** "Ready Meals Frozen", "Diy Tools".

**Do not add a sixth copy of the vocabulary to `web-next` source.** Labels go in
`web-next/src/messages/{en,de,fr,it}.json`, keyed by slug, falling back to `humaniseSlug`. Guard with a test
that reads **`supabase/taxonomy-projection.generated.sql`** — a plain file, no bundler involved — and asserts
every slug in it has a message key in every locale. The generated artefact becomes the contract between the
two halves of the repo that cannot import each other.

**9.3 Also in WP-T2:** `shared/types.ts` edits deferred from T1 (§5.1); the `taxonomy-unmapped` /
`taxonomy-coverage-collapse` alerts (§7.4); `DROP TABLE taxonomy_alias` and `pipeline_unknown_tags`; dedupe
`humaniseSlug`, currently copied verbatim into two components.

---

## 10. ADR-00X: BROWSE_CATEGORIES is the taxonomy; the database holds a generated projection

**Status:** Proposed · **Date:** 2026-09-17 · **Supersedes:** the alias-map design in
`20260425_taxonomy_4level.sql` §7 and `pipeline/resolve-taxonomy.ts`

### Context

The taxonomy existed in two independent places. Code (`BROWSE_CATEGORIES`, 22/76) fed the classifier prompt
and enforced an invariant at construction. The database (`taxonomy_category` 17, `taxonomy_alias` 28) was
seeded on 2026-04-26 and never touched again. They were joined by `resolveTaxonomy`, a lookup whose miss
produced `null` — a legal value for a nullable foreign key. On 2026-09-11 `dc9a0a4` expanded the code side
and invalidated the classification cache. Six days later **561 of 1,169 active deals (48%) had no
`category_slug`** and 608 more carried a slug from the older scheme. Nothing failed.

The underlying cause predates the expansion: `classify-deals.ts:372` discards the classifier's validated
browse category — the answer — and the pipeline reconstructs it from a weaker signal through a
hand-maintained table.

**A second fact, found during cross-review:** `deals.category_slug` carries a live
`deals_category_slug_fkey` in production that **a database rebuilt from this repository does not have**,
because `20260425_taxonomy_4level.sql:107-108` uses `ADD COLUMN IF NOT EXISTS` against a column the baseline
already created, which makes the whole statement — `REFERENCES` clause included — a no-op.

### Decision

1. **`BROWSE_CATEGORIES` in `shared/types.ts` is the single source of truth.**
2. **The pipeline writes `deals.category_slug` directly from `classification.category`**, already validated
   in the domain. No lookup, no translation, no runtime database round trip.
3. **`pipeline/resolve-taxonomy.ts` is deleted**; `taxonomy_alias` and `pipeline_unknown_tags` are dropped
   in WP-T2 once nothing reads them.
4. **`taxonomy_category` and `taxonomy_subcategory` become generated projections**, produced by
   `shared/taxonomy-projection.ts`, checked in as `supabase/taxonomy-projection.generated.sql`, never
   hand-edited. They are reference data for the FK and a one-time backfill join — not a runtime dependency.
5. **The FK is kept, and created where the repository is missing it.**
6. **`deals.category_slug` becomes `NOT NULL`** in a follow-up migration, after one successful run.
7. **Three guards:** a blocking CI test that the generated SQL matches the constant; a run preflight that
   fails the run (exit 1, before any fetch) if the live table disagrees, with an unreadable table as exit
   75; and one non-skippable e2e assertion that the facet is populated.
8. **Existing rows are remapped by joining on `sub_category`**, in one transaction whose final `DELETE` is
   the integrity assertion.

### Alternatives considered

- **Database as source of truth (32/70).** Rejected: the domain would have to load the taxonomy before it
  could validate a classification, putting infrastructure inside the domain layer, which CLAUDE.md forbids.
  It also makes the taxonomy unreviewable in a pull request.
- **Delete the tables; `category_slug` as free text (49/70).** Rejected despite being simpler: the FK is the
  only enforcement this column has, and dropping it is the single genuine one-way door in the problem.
  Arming it costs one generated `INSERT`. The Tech Lead reached the identical conclusion independently and
  dated a revisit for 2026-12, once the generator exists and the tables' remaining weight can be assessed.
  **Recorded as a deliberate, dated deferral, not an unconsidered option.**
- **Keep both, add a sync test only.** Rejected: it preserves two definitions and makes the test the sole
  thing between them. Deleting one definition is strictly stronger than testing two.
- **Keep the alias lookup and generate the alias table too** (the Tech Lead's design). Rejected — see §12.6.
  It fixes the instance and leaves the mechanism: every new *sub-category* still needs a generated alias row,
  and the classifier's answer is still discarded and reconstructed at runtime.
- **Add ~33 alias rows against the existing 17 categories** (the "cheap" fix). Rejected on the Tech Lead's
  measurement, which is decisive: **77% of the gap has no target in the 17** — no category exists for toys,
  clothing, appliances, cookware, home textiles, books/media, stationery, tools, plants or baby goods. The
  cheap option is the expensive option with the cleanup omitted.
- **Leave `category_slug` nullable, add a coverage alert.** Rejected here, but it is the Tech Lead's ruling
  and the disagreement is live (§12.2). If it stands, nothing else in this design changes.
- **An `uncategorised` catch-all category so the column can be NOT NULL.** Never proposed and explicitly
  rejected: it makes 561 deals *look* categorised, destroys the signal the alert depends on, and puts a junk
  chip in the facet list. NULL is honest.
- **Remap the 608 with a hand-written old→new category map.** Rejected: it leaves `wine` and `beer` under
  `drinks` instead of `alcohol`, fixes only the 608, and re-creates the hand-maintained mapping table that
  caused the incident.

### Consequences

**Easier.** One place to add a category. A new category is a reviewable diff. Divergence is impossible to
ship (CI) and impossible to run (preflight). An unmapped deal cannot be published. 561 deals become
filterable; 608 stop lying about which scheme they belong to. One fewer table, one fewer module, one fewer
pipeline step, and one fewer network round trip per run. **Adding a sub-category to an existing category
becomes a pure code change** — no migration at all, because sub-categories no longer participate in the
mapping.

**Harder.** Adding a *category* is a two-step deploy — migration, then code — forever. A projection drift
fails the whole run instead of publishing half of it; that is the intent. `web-next` still cannot import the
constant, so labels are guarded through the generated SQL artefact rather than a type (WP-T2).

**Accepted risks:** R-2, R-4, R-10, R-13 above.

---

## 11. Self-check

- [x] Root cause stated structurally, with the line of code and the causal link to HANDOVER defect #3
- [x] Both named defect classes located in the live code, with line numbers
- [x] Source of truth **argued**, not assumed — including the candidate the brief suggested and the case for
      deleting the DB layer entirely
- [x] Alternatives scored; eight rejected in the ADR with reasons
- [x] The 608 answered: remap, via `sub_category`, with the case a hand-written map gets wrong
- [x] URL/bookmark impact traced, failure mode named, mitigated
- [x] The brief's open question answered with evidence (§1.2), including the correction that the filter
      *works* for the 608
- [x] Guards named, located, asserted, mutation-tested — including the mutation my first draft missed
- [x] `NOT NULL`: yes, with the counter-ruling engaged point by point rather than dismissed (§12.2)
- [x] **The fact I got wrong is stated as a finding about my method, not a footnote (§1.4, §12.1)**
- [x] Right-sized: no new service, no new dependency, ~100 lines of new code, two migrations, CHF 0
- [x] No source code modified

---

## 12. Cross-review response

Read `docs/rca/2026-09-17-tech-lead-taxonomy-divergence.md` in full. It is a better operational document
than mine and it found the fact that matters most. Below: where we agree (so the coordinator can close it),
the four questions I was asked to answer first, each predicted disagreement, and the one real disagreement
neither of their eight items names.

### 12.0 Where we agree — close these

Four items, stated identically in both documents, reached independently:

1. **There must be exactly one taxonomy.**
2. **`BROWSE_CATEGORIES` is the source of truth.**
3. **The database seed is a generated artefact, byte-compared in CI, never hand-written.**
4. **A guard, not a convention, is what prevents recurrence** — and it must run credential-free in the pull
   request, not only where a service-role key exists.

Three more we converged on without knowing it: the `?cat=` alias must reuse the `TYPE_ALIASES` shape in
`parseFilters`; the FK must not be dropped; and the "cheap" 33-alias-rows option is not cheap. Their §6
measurement — **77% of the unmapped gap has no target among the 17 existing categories** — is the number
that ends that debate, and I did not have it.

**Not open. Stop treating them as decisions.**

### 12.1 The foreign key — the four questions

**Did I verify it? No. I read the repository and inferred.** The Tech Lead queried the database. That is the
whole difference, and it is a finding about method, not about a missing paragraph: *I validated a design
against a schema production does not have.* §1.4 now records it as such. Their §7 prediction #7 — "most
likely they will read the repo's schema and conclude `category_slug` is unconstrained `TEXT`" — was exactly
right about me, and I would rather that be on the record than smoothed over.

**Q1: Does my migration order survive the FK?**
**Yes, and it always did — but for a worse reason than I should have given.** My original §5.2 ordered
inserts before updates and the `DELETE` last, and I justified it as "order matters, because of two foreign
keys". That reasoning was correct by accident: I was thinking of `taxonomy_subcategory.category_slug` and
`concept_family.category_slug`, both of which are visible in the repo, and I was unaware of the one on
`deals` itself. The order is unchanged. **Two things did change, and both come from their document:**

- The whole thing is now **one transaction**, so the final `DELETE` functions as an integrity assertion
  rather than as cleanup. If any child anywhere still points at a retired category, everything rolls back.
  I had it as an ordered list of statements, which is not the same guarantee.
- **§5.2 step 3 is new and is mine**: create `deals_category_slug_fkey` if it does not exist, via a `DO`
  block, after the category inserts and before any `deals` update. Without it a reviewer who rebuilds a test
  database from the repo validates this migration against a schema where step 8's `DELETE` **cannot fail** —
  a test certified by an environment that has no constraint to violate. That is R-11, and it is High.

**Q2: Does it change or strengthen the `NOT NULL` conclusion?**
**It changes the argument materially and strengthens the conclusion.** My §6 said the FK "was the disarmed
guard" and that arming it was the point. That framing is now wrong: the FK is live. The corrected argument
is sharper, and it relocates the risk everyone is worried about:

> **The rejection path belongs to the FK, not to `NOT NULL`.** With the FK live, the moment
> `classify-deals.ts` writes a real slug, any BROWSE id absent from `taxonomy_category` fails the write —
> **whether the column is nullable or not.** `NOT NULL` neither creates that exposure nor removes it.

So the Tech Lead's blast-radius objection, which is a good objection, is not an objection to `NOT NULL`. It
is an objection to **writing a real slug at all**, which both designs do. Detail in §12.2.

**Q3: Should the baseline be corrected so a rebuilt database matches production?**
**Yes — minimally, in this WP; comprehensively, as its own ticket.** Two different jobs:

- **In WP-T1:** create this one FK if absent (§5.2 step 3), and assert it with verification query 2. This is
  not scope creep — my design's entire safety argument rests on this constraint existing, so a WP that
  leaves the repo unable to reproduce it has not finished its own job.
- **Its own ticket:** an audit of whether `00000000000000_baseline.sql` is missing *other* live constraints
  while its header claims fidelity about foreign keys. That is an unknown-size investigation against
  production, it touches every table, and bolting it onto a taxonomy fix would be exactly the "scope grew
  past one column" line the Tech Lead draws in their §3.3. Their compass principle 5 — *"the repository must
  be able to rebuild production; where it cannot, that is a defect with a ticket"* — is right, and a ticket
  is what it should get.

**Q4: The batch-of-100.** Answered in §12.2, because it is the heart of the `NOT NULL` disagreement.

### 12.2 Disagreement #1 — `NOT NULL`. I hold. Here is the argument they have not seen.

Their ruling rests on four points. Two are answered by an argument they did not have; one is answered by
checking the citation; one is a genuinely new fact that I accept and that does not change the conclusion.

**Their point 1: *"empty is not success" is about collection, not classification.*** **Conceded, entirely.**
They are right about the provenance of the phrase, and I should not have leaned on it. A deal with a correct
name, store, price, discount and validity window is not "empty" in the sense CLAUDE.md means. My conclusion
does not depend on that phrase and I withdraw it as support.

**Their point 2: *it inverts an explicit 2026-04-25 design decision.*** **This is the one where the citation
decides it, and it decides the other way.** `20260425_taxonomy_4level.sql:15-16` reads:

> *"Adds `deals.category_slug TEXT NULL` referencing taxonomy_category. **Stays nullable until backfill +
> ETL change land in a follow-up patch.**"*

They cite line 31 — *"category_slug stays NULL until a separate backfill SQL runs"* — from the
"WHAT THIS MIGRATION DOES NOT DO" section. **Both citations frame nullability as a temporary state pending
exactly two things: a backfill and an ETL change.** This work package is the backfill (§5.2 step 9) and the
ETL change (`classify-deals.ts`). Setting `NOT NULL` now **completes** the April decision rather than
inverting it. I would defer if the April author had written "nullable by design"; they wrote the opposite,
twice.

**Their point 3: the batch-of-100 blast radius, worsened by WP-J2's ledger.** **New to me, verified, and the
strongest thing in their document on this question.** I confirmed every element: `store.ts:118-142`
(`BATCH_SIZE = 100`, `continue` on error at `:141`). I also checked what they did not mention, and it makes
the picture slightly better and slightly worse:

- **Not silent.** `logStorageShortfall` (`run-pipeline.ts:524-536`) computes a genuine shortfall net of
  collapses, and *any* shortfall yields `storage-shortfall` → **exit 1** (`run-pipeline.test.ts:412-413`).
  So a lost batch fails the run loudly today.
- **But exit 1 is never retried** (`exitCodeFor`, `:172-180`). So under J2 the publication is recorded
  fetched and the week is genuinely lost. Their concern survives my correction.

**And here is why it does not decide against `NOT NULL`: the exposure exists identically in their design.**
After their T1, the seed holds 22 categories and the alias table 76 tags. If a 23rd category later reaches
code without a migration, their `resolveTaxonomy` misses and writes NULL — graceful, granted. But if anyone
ever writes a BROWSE id directly, their §2 already flags it: *"It becomes unsafe the instant anyone writes a
BROWSE id directly without seeding first."* Their design is safe because it keeps the round trip. **Mine is
safe because the violating state is unreachable**, and by construction rather than by degradation:

```
createClassification  guarantees   emitted ⊆ BROWSE_CATEGORIES     (classification.ts:85-87)
preflight             guarantees   BROWSE_CATEGORIES ⊆ seeded      (§7.2, before any fetch)
                      therefore    emitted ⊆ seeded  →  the FK cannot fire
```

The preflight runs **before `collectOffers`**, so the drifted-deploy scenario costs a minute of free Actions
time and produces **zero fetches, zero writes and zero ledger entries**. The "lost week of one retailer's
offers" outcome they are protecting against is specifically the outcome the preflight prevents. Their §5
machinery is detection after the fact; this is prevention before the fetch, and they did not have it in
front of them.

Residual: someone edits `taxonomy_category` in the Supabase console mid-run. One operator, 10–50 users, and
the next preflight catches it. R-9.

**Their point 4: the unseen tag is not hypothetical — the classifier is a model.** **Agreed on the premise,
and it argues for my side.** A model's stray output is already caught at `createClassification` and counted
as `invalidCategoryRejected` with an existing alert. It never becomes a `Classification`, so it never
reaches a row. The residual they cite — 16 errors one run, 18 the next — is *wrong categories*, not
*non-existent* ones, and no constraint of any kind catches a confidently-wrong-but-valid category.

**What I concede as a change, not just an argument.** Three things move because of their point 3:

- **R-12 and R-13 are new entries in the risk register**, at High and Medium. I had neither.
- **R-13 gets raised as its own ticket**: `store.ts:141`'s `continue` means one bad row discards 99 good
  ones, for *every* constraint this table will ever have. Worth fixing on its own merits.
- **The preflight is promoted from "cheap addition" to load-bearing.** In my first draft I nearly cut it as
  over-engineering. Their objection is precisely what it exists to answer, and §7.2 now says so.

**What would make me withdraw.** If the preflight cannot be placed before `collectOffers` for a reason I
have not foreseen, the composition `emitted ⊆ seeded` breaks, the FK becomes reachable, and their ruling is
correct. **Tech Lead decides.** If they hold, set the column nullable, keep everything else, and their §5
alerts become the primary control instead of belt-and-braces — §7.4 is written so that substitution is a
one-line change to this document, not a redesign.

### 12.3 Disagreement #2 — layer. Largely a phantom; I concede the principle.

**They predicted a value object in `collection/domain/`. I did not propose one there, and my first draft
already put the vocabulary in `shared/`.** For the record: §7.1 puts the generator at
`shared/taxonomy-projection.ts`, and §7.2 puts the preflight's pure comparison at
`pipeline/storage/domain/taxonomy-projection-check.ts`.

**I concede the principle without reservation**, and their reasoning is better than my instinct: the
taxonomy has four consumers, two of them in `web-next`, which cannot import across the boundary. `shared/`
is the only home. That is also why WP-T2 guards `web-next`'s labels through the generated `.sql` artefact
rather than a shared type (§9).

**One placement I defend:** `checkTaxonomyProjection` stays in `pipeline/storage/domain/`. It is a pipeline
concern — `web-next` never performs this check — and it is a pure function over `readonly string[]` that
imports `shared/types` and nothing else. Putting it in `shared/` would move a pipeline-only rule into a
module `web-next` also compiles. Their principle is about the *vocabulary*; this is a *policy over* the
vocabulary. Two-way door either way.

**And I concede their layering point in a place they did not raise it:** my first draft had WP-T1 editing
`shared/types.ts` to retype `Deal.categorySlug`. Lane C owns that file and WP-J1 is in review against it.
Moved to WP-T2 (§5.1). That is a real conflict avoided, found by their ownership table, not by mine.

### 12.4 Disagreement #3 — sequencing. Conceded, with one correction that improves their plan.

**Adopted: `J1 → T1 → J2 → T2 → J3`, fourth lane, does not take J3's slot.** Their argument is right and
mine was weaker than I realised. I never explicitly claimed priority over J2/J3 — my doc only said "merge it
between packages" — but I implied urgency by calling the site "fixed at step 2", and I should be plain:
**availability outranks browsability, and it is not close.** A pipeline that hits the 60-minute wall produces
no rows at all; a pipeline that finishes with a degraded facet produces a working price comparison. Nobody
is shown a wrong price by this bug. There is no UWG exposure. It is a rung below P1/W2/C1 and I agree with
their severity call.

**The correction.** Their §1 ownership table lists the files lane T needs and concludes *"the one file it
must not touch is `shared/types.ts`."* **But their own §4.1 design puts the generator at
`shared/taxonomy-seed.ts`, and mine at `shared/taxonomy-projection.ts`** — new files in the directory lane C
owns, whose `package.json` and vitest config lane C's WP-J1 may also touch. Adding a *new file* to `shared/`
is far lower risk than editing `types.ts`, and their table does say "new file → none". But the `shared`
suite's test glob and `package.json` scripts (`npm run taxonomy:sql`) are shared surfaces. **Concretely: T1
adds files and one `package.json` script under `shared/`, and edits no existing `shared/` source file.** The
builder should confirm with whoever holds J1 before merging. Minor, and it makes their table right rather
than nearly right.

### 12.5 Disagreement #6 — backfill placement. Conceded; their version is better than mine.

We actually agreed on the substance: my §5.2 already had the backfill inside the migration, and my split was
projection+backfill / `NOT NULL`, which is the same split their §5 endorses for a different reason. **What I
adopt is their execution:**

- **One transaction**, not an ordered list of statements. I did not say "transaction" anywhere, and without
  it the `DELETE`-as-assertion guarantee does not exist.
- **The `DELETE` reframed as the integrity check**, not cleanup. Better idea, better name, adopted verbatim.
- **Their six verification queries**, including two I did not think of (FK presence; every live
  `sub_category` resolves).
- **Their rollback convention** — inverse `UPDATE`s in a `-- ROLLBACK:` comment block, no down-migration file.
- **The 14-digit filename rule and its config test.** My draft used `20260917a_…`, which violates the very
  convention this session's duplicate-prefix incident proved load-bearing. Corrected in §5.2, and the test is
  now a WP-T1 deliverable (§5.5, §7.1).

Their "I expect to be alone in this" is unnecessary. One transaction cannot half-apply; two files
demonstrably can, and that is this session's incident, not a hypothesis.

### 12.6 The real disagreement, which is not in their list of eight: does the alias **lookup** survive?

Their design keeps `resolveTaxonomy` and generates `taxonomy_alias` alongside the other two tables (§4.1
assertion 2: *"every BROWSE sub-category has exactly one `taxonomy_alias` row"*). Mine deletes the lookup
and writes `classification.category` straight through. Both fix today's incident. **They differ in what
happens next, and I hold my position for three reasons.**

1. **Theirs fixes the instance; the mechanism survives.** Generating the alias table removes *this* drift.
   But the pipeline still discards the classifier's answer and reconstructs it at runtime from the child
   tag — which is §2.1's root cause, unaltered. A generated table makes the reconstruction reliable; it does
   not make it necessary. My §2.2 root cause statement and their compass principle 2 (*"translate at the
   boundary, in code, before reaching for a table"*) point the same way. **Their own §0.3 is the best
   evidence in either document for my design**, not theirs: `CATEGORY_ALIAS` in `supabase-provider.ts:74-80`
   solves the identical divergence one level up in six lines with no table and no drift, and they call the
   asymmetry "the bug".
2. **The coupling it removes is not small.** Under theirs, every new *sub-category* needs a generated alias
   row and therefore a migration — 76 today, and sub-categories are the fast-growing level (28 → 76 in one
   commit). Under mine, sub-categories do not participate in the mapping at all: **adding a sub-category to
   an existing category becomes a pure code change with no migration.** Only a new *category* needs one.
   That is a materially smaller change surface for the level that changes most.
3. **Their stated reason for preferring a table does not apply to my design.** Their §6 rejects the
   code-translation option *"on one ground only: dropping the FK is the one genuine one-way door"*, and
   defers it to 2026-12. **I do not drop the FK.** I keep `taxonomy_category`, keep the constraint, create it
   where the repo is missing it, and delete only `taxonomy_alias` — the layer that actually diverged. That is
   the middle neither of their two options describes: their "cheap" option keeps both tables and both
   definitions; their "genuinely cheaper" option drops everything including the guard. Mine keeps the guard
   and deletes the translation. **I believe this is the option their 2026-12 revisit is heading toward, and
   it is available now without touching the one-way door.**

**What I concede in exchange.** Theirs degrades more gracefully in exactly one scenario — a category in code
with no seed row — because a lookup miss writes NULL where a direct write hits the FK. That is real, and it
is the same scenario as §12.2's. My answer is the same and it is the only load-bearing one: the preflight
makes that state unreachable before any fetch. **If the preflight is rejected, their design is better than
mine and I would switch to it.** The two questions are one question.

**Escalation:** this is technical, so the Tech Lead decides. It is a two-way door either way — the alias
lookup is 14 lines and can be restored.

### 12.7 The 48 missing labels — agreed, and it rescopes WP-T2

**Yes, raise it to the PM in the same breath, and yes, it changes my scoping — it was the weakest judgement
in my first draft.** I found `sub-category-labels.ts` (my §1.3, copy 3), noted that it fails open, and filed
it as cosmetic garnish in a non-blocking WP. The Tech Lead counted it and drew the right conclusion. I
verified their number and then checked three things they did not, all of which make it worse:

- **It renders on the default page, not behind a filter.** `DealsClient.tsx:254` uses `subCategoryLabel` for
  the **section headings of the deals list** — no Type selection, no chips, no taps. Every visitor, first
  paint. The category facet this whole RCA is about is behind two taps (§1.2). **They are right that it is
  more visible, and the gap is larger than "more".**
- **It leaks into the product's output.** `DealsClient.tsx:269` puts the same label into the shopping list
  and the forwarded share text — the thing basketch exists to produce. A German shopper's WhatsApp message
  reads "Toys", "Pastry", "Dough".
- **It is worse than 48/76.** `subCategoryLabel:71` branches `de` versus everything-else-gets-English, so
  **French and Italian visitors get English for all 76 sub-categories**, not just the 48. On a four-locale
  Swiss site.

**Scoping change:** WP-T2 now leads with sub-category labels (§9.1) and treats category labels as second
(§9.2). Both are guarded by the same generated-artefact test, so it is one mechanism covering both, which is
the argument for keeping them in one WP rather than splitting further. Added to the PM findings as **F-5**.

### 12.8 Summary of changes made to this document

| § | Change | Source |
|---|---|---|
| 0, 1.4 | The live FK, and that I missed it by reading the repo instead of the database | TL §0.1 |
| 3.3, 3.4 | FK reversibility row rewritten; `concept_family` live count added | TL §2 |
| 4 | `?cat=` answer credits their independent confirmation; both required the same mitigation | TL §2 |
| 5 header, 5.1 | WP-T1 no longer touches `shared/types.ts`; retype deferred to T2 | TL §1 |
| 5.2 | **Rewritten.** 14-digit filename; one transaction; their statement order; `DELETE` as integrity assertion; **new step 3 creates the FK if absent**; their six verification queries; their rollback convention | TL §3, mine |
| 5.4 | Alert and `DROP TABLE` moved to T2 to respect their ordering constraint | TL §5 |
| 5.5, 5.6 | Migration-filename test; inverse-direction assertion; the **second** mutation (delete a line from the checked-in SQL); the non-skippable e2e assertion | TL §3.1, §4.1, §4.3 |
| 5.7 | Build order `J1 → T1 → J2 → T2 → J3` | TL §1 |
| 6 | Argument restructured: `NOT NULL` adds no rejection path the FK does not already create; the April citation added as point 5 | mine, after TL §5 |
| 7.1 | Inverse-direction assertion; credential-free rationale; migration-filename test | TL §4.1, §3.1 |
| 7.2 | Preflight promoted to load-bearing; "zero ledger entries" made explicit | TL §5 point 3 |
| 7.4 | Their thresholds adopted wholesale, incl. "verify it fires on 2026-09-11" | TL §5 |
| 8 | **R-11, R-12, R-13 added.** R-5 closed. R-10 extended with the 32 `concept_family` rows | TL §0.1, §2 |
| 9 | **WP-T2 rescoped** around the 48 missing sub-category labels, plus three findings of my own | TL §0.4, mine |
| 10 | ADR records the FK fact, the dated 2026-12 deferral, and two more rejected alternatives | TL §6 |

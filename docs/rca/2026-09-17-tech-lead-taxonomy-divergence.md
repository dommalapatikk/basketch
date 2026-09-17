# Tech Lead ruling: the taxonomy divergence

**Author:** Tech Lead agent · **Date:** 2026-09-17 · **Status:** rulings, ready for a build order
**Scope:** operational and delivery questions only. A Solution Architect is designing the fix in
parallel; this document deliberately does not propose a design, and its author did not read theirs.
**No source code was changed in writing this.**

Method and prior rulings taken from `docs/rca/2026-09-15-final-plan.md`. Every number below was
re-measured directly against production on 2026-09-17 (Zurich date), not taken on trust.

---

## 0. What I verified myself, and the one fact nobody has stated yet

Confirmed the brief's numbers: **1,169 active deals, 561 (48.0%) with `category_slug IS NULL`**,
`taxonomy_category` holds exactly the 17 listed slugs.

Then I checked four things the brief did not cover. Three came back clean. One did not.

### 0.1 THE FOREIGN KEY EXISTS IN PRODUCTION, AND IT IS NOT IN THE REPOSITORY

`deals.category_slug` carries a live `REFERENCES taxonomy_category(slug)` constraint. Proved
read-only against production by asking PostgREST to resolve the embed, which it can only do when the
constraint exists:

```
GET /rest/v1/deals?select=id,category_slug,taxonomy_category(slug)&limit=1
→ [{"id":"29ca584c-…","category_slug":null,"taxonomy_category":null}]     ← resolved
GET /rest/v1/concept_family?select=slug,taxonomy_category(slug)&limit=1
→ [{"slug":"milk","taxonomy_category":{"slug":"dairy-eggs"}}]             ← control, resolved
```

**A database rebuilt from this repository does not have that constraint.**
`supabase/migrations/00000000000000_baseline.sql:87` declares `category_slug TEXT` with no FK, and it
sorts first. `supabase/migrations/20260425_taxonomy_4level.sql:108` then runs
`ALTER TABLE deals ADD COLUMN IF NOT EXISTS category_slug TEXT REFERENCES taxonomy_category(slug)` —
the column already exists, so the whole statement is a no-op and **the FK is never created**. The
baseline's own header claims it is faithful about foreign keys; on this column it is not.

Three consequences that bear directly on every ruling below:

1. **Production rejects a slug that a repo-built test database accepts.** Any design validated against
   a locally rebuilt schema is validated against a schema production does not have.
2. **An FK violation costs up to 100 deals per occurrence, silently-ish.** `pipeline/store.ts:118-142`
   upserts in batches of `BATCH_SIZE = 100` and does `continue` on error. The run reports
   `Upsert batch N failed` and carries on. Nothing else notices.
3. **You cannot write `dairy` into `category_slug` until `taxonomy_category` has a row `dairy`.**
   The ordering of the fix is therefore not a style preference, it is a constraint.

### 0.2 The clean three

- **Materialized views: unaffected.** `concept_cheapest_now` and `worth_picking_up_candidates`
  (`supabase/migrations/20260917120000_mv_price_basis.sql:133-190`) join `sku → deals` on `sku_id`
  and select no category column at all. `grep -n category_slug` across all three MV migrations returns
  nothing inside any view body.
- **Persisted shopping lists: unaffected.** `ListItem` (`web-next/src/stores/list-store.ts:14-60`)
  carries `category: DealCategory` — the top-level `'fresh' | 'longlife' | 'household'` — not
  `category_slug`. `isWellFormedItem` checks `typeof v.category === 'string'`. **This is not WP-W2
  again.** No `STORAGE_VERSION` bump is needed and no returning user's page can crash from this change.
- **Share URLs and sitemap: unaffected.** `web-next/src/lib/share-url.ts:33` carries `?items=<ids>`
  only. `web-next/src/app/sitemap.ts:8` emits `['/', '/deals']` and nothing else — there is no
  `/deals/[category]` route segment anywhere and no category URL has ever been submitted for indexing.

### 0.3 The top-level divergence is already solved, in code, and that is the most useful fact in this document

Production `deals.category` holds `fresh` (227), `long-life` (357), `non-food` (585). The web's
`DealCategory` is `'fresh' | 'longlife' | 'household'`. Those two vocabularies do not overlap on two of
three values — and the Type filter works perfectly, because
`web-next/src/server/data/supabase-provider.ts:74-80` translates at the read boundary:

```ts
const CATEGORY_ALIAS: Record<string, DealCategory> = {
  fresh: 'fresh', 'long-life': 'longlife', longlife: 'longlife',
  'non-food': 'household', household: 'household',
}
```

Six lines, one file, no database round trip, no migration, no FK. **The same class of divergence, one
level up, is a solved problem in this codebase.** The mid-level failed because it was routed through a
hand-seeded database table instead. The asymmetry *is* the bug. I record it here because it is the
strongest available evidence about which direction the design should lean, and because it makes one
otherwise-tempting option (§6) genuinely arguable rather than reckless.

### 0.4 Two more unupdated dependents of the same commit

`dc9a0a4` expanded `BROWSE_CATEGORIES` and updated **one** of its four consumers.

| Consumer | Updated at dc9a0a4? |
|---|---|
| Classifier prompt (`pipeline/composition.ts:89`) | yes |
| DB seed (`taxonomy_category` / `taxonomy_alias`) | **no** — this document |
| Web sub-category labels (`web-next/src/lib/sub-category-labels.ts`) | **no** — see below |
| Keyword rules (`shared/category-rules.ts`) | no, **deliberately** and documented (`it.fails`, file slated for deletion) |

**48 of the 76 sub-categories have no German and no English label.** `subCategoryLabel`
(`sub-category-labels.ts:70-75`) falls back to a title-cased slug, so a German visitor is currently
shown "Toys", "Kitchen Appliance", "Books Media", "Pastry", "Dough", "Home Textiles". That file's own
header says *"Keep in sync with basketch/pipeline/categorize.py"* — a file that no longer exists. This
is not in scope for the taxonomy WP, but it has the same root cause and the same fix shape, and it is
more visible to a Swiss user than the facet gap is. **Raise it to the PM as a separate ticket in the
same breath.**

`shared/types.test.ts:36` already has a count tripwire ("has 22 browse categories", "maps 76
sub-categories"). It fired at `dc9a0a4` and was simply updated alongside the change — correctly, since
the taxonomy is additive by PM instruction. **A count tripwire cannot catch a missing dependent.** Only
a cross-artifact test can. That is the systems lesson of this incident, and it drives §4.

---

## 1. Severity and sequencing

### Severity: high, but a rung below P1/W2/C1. It is a *browsability* defect, not a correctness one.

Nobody is shown a wrong price. Nobody is shown an expired price. There is no UWG exposure. Every one of
the 561 unmapped deals still appears in the deal list, still carries its correct price, validity window
and store, and is still reachable by free-text search and by store filter. What is broken is one facet.

How broken, precisely — and it is worse than "the filter is wrong":

- `web-next/src/server/data/filter-deals.ts:130-131` drops any deal with no slug from `categoryCounts`
  (`if (!key) continue`). 561 deals appear in **no** category chip.
- `filter-deals.ts:28` then hard-filters on the slug when a chip is selected, so those 561 are
  unreachable *through* every chip too.
- `web-next/src/components/deals/FilterRail.tsx:95` only renders the Category facet at all when a Type
  is selected (`showCategory = filters.type !== 'all' && …`), so most sessions never see it.
- The chips that do render are labelled by `humaniseSlug` (`FilterRail.tsx:40`, duplicated verbatim at
  `FilterSheet.tsx:35`), so they read "Dairy Eggs", "Home Cleaning", "Vegetables Fruits" — untranslated
  in all four locales.

So the user-facing loss is: roughly half the catalogue is invisible to one secondary navigation
control that is itself behind a prior selection and labelled in machine slugs.

Against that, the three items the plan already calls urgent were: live data loss, a legal exposure, and
wrong product names shipped to visitors. **This is not in that class**, and I will not pretend it is in
order to give the PM the answer they asked for.

### Sequencing ruling: a fourth lane, in parallel. It does not displace J2 or J3.

```
Lane C : … → J1 (in review) → J2 → ┐
Lane P : … → P9 (merged)  ────────→ J3
Lane T : ─────────── T1 → T2 ──────┘   ← NEW, starts once J1 merges
```

**Why it does not go before J3.** J3 is the structural fix for the pipeline hitting CI's 60-minute
wall. A pipeline that does not finish produces no rows at all; a pipeline that finishes with 48% of
rows uncategorised produces a working price comparison with a degraded facet. Availability outranks
browsability, and the gap between them is not close. The plan already priced this: J3 is what makes
"one fetch per publication" and "never miss a publication" both hold (`final-plan.md:161-166`). Delaying
it to fix a filter would be trading a systemic risk for a cosmetic one.

**Why it does not wait for J3 either.** The queue-stale argument is real and it cuts the other way here.
Every week this waits, the classifier's live vocabulary broadens against a frozen alias table, the
backfill grows, and the "which tags exist?" evidence goes out of date — I had to re-measure it today
because the brief's snapshot was already a different shape from what I found. And the cost of holding
it is not one week of inconvenience: it is that the taxonomy alert specified in §5 cannot be turned on
until the seed is fixed, so the pipeline stays blind to this entire failure class for as long as the
fix is queued.

**Why a separate lane is safe.** Checked the file ownership from `final-plan.md:242-247`:

| File the taxonomy WP needs | Owning lane today | Conflict? |
|---|---|---|
| `supabase/migrations/2026…_taxonomy_align.sql` | new file | none |
| `pipeline/resolve-taxonomy.ts` | **unowned by any open WP** | none |
| `pipeline/transformation/domain/alerts.ts` | lane P — **P9 is merged**, J3 does not touch it | none |
| `pipeline/transformation/application/run-snapshot.ts` | lane P — same, merged | none |
| `shared/taxonomy-seed.ts` (new) | new file | none |
| `web-next/src/lib/filters.ts` | lane W — **W4 is the last W package; it does not touch filters.ts** | none |

The one file it must **not** touch is `shared/types.ts`. Lane C owns it, WP-J1 is in review against it,
and re-basing a package that is already in code review to accommodate this would be a self-inflicted
wound. **`BROWSE_CATEGORIES` is not edited by this work** — it is the source of truth being replicated,
not the thing being changed. That also honours the PM's standing additive-only instruction
(`shared/types.test.ts:16-17`).

**Therefore: lane T opens the moment WP-J1 merges.** If there is genuinely only one builder and lanes
must serialise, the order is `J1 → T1 → J2 → T2 → J3`. T1 is roughly a day and unblocks the alert; J2's
cost of a one-day slip is one extra day of over-fetching, which P3's concurrency group, P4's retired
legacy job and the standing no-dispatch rule already cap at about 10% of the original excess
(`final-plan.md:668-670`).

---

## 2. Blast radius of renaming `category_slug` values — definitive

Grepped for `category_slug`, `categorySlug`, `taxonomy_category`, `taxonomy_alias` across `pipeline/`,
`web-next/`, `shared/`, `supabase/` (excluding `archive/`, `node_modules/`), and queried production for
the live child-row counts. **Verdict: the rename is safe. It is not the WP-W2 class of defect.**

### Load-bearing — must be handled

| Thing | Evidence | Handling |
|---|---|---|
| **FK `deals.category_slug → taxonomy_category(slug)`** | §0.1, verified live | Insert new categories **before** updating any row. Delete old categories **last**. No `ON UPDATE CASCADE` is declared, so a bare `UPDATE taxonomy_category SET slug=…` fails. |
| **FK `taxonomy_subcategory.category_slug`** (NOT NULL) | `20260425_taxonomy_4level.sql:67` | Repoint before the parent delete. |
| **FK `taxonomy_alias.category_slug`** | `20260425:79` | Same. |
| **FK `concept_family.category_slug`** — **32 of 70 live rows non-null** (drinks 5, dairy-eggs 4, meat-fish 4, snacks-sweets 3, pantry-canned 2, home-cleaning 2, coffee-tea 2, vegetables-fruits 2, pasta-rice-grains 2, one each of bakery/frozen/laundry/paper-goods/personal-care/prepared-meals) | `20260427_v3_concept_layer.sql:77`, live count | Repoint. No user-visible effect: `web-next/src/server/data/concepts.ts:14` selects the field into `ConceptFamily`, and **no component reads it**. |
| **`pipeline/v3-cutover.ts:95`** writes `concept_family.category_slug` on every run | `run-pipeline.ts:846` | Safe as-is — it only ever passes a value that came out of the alias table. It becomes unsafe the instant anyone writes a BROWSE id directly without seeding first. |

### The one genuine cost: `?cat=` is a public URL contract

`web-next/src/lib/filters.ts:68` reads `cat`, `:85` writes it, and `filter-deals.ts:28` compares it to
`categorySlug`. A bookmarked or pasted `/deals?cat=dairy-eggs` becomes an **empty result set with no
explanation** after a rename — no error, no "unknown filter" notice, just zero cards.

Scope of the exposure is small: **no internal link in the codebase emits `?cat=`.** The only producer is
`serializeFilters` after a user clicks a chip. (`CategoryVerdictCard.tsx:31` uses the query key
`category`, which `parseFilters` does not read at all — a separate, pre-existing dead link worth a
ticket.) So the population at risk is bookmarks and pasted links on a four-month-old, low-traffic site.

**I require the mitigation anyway, because it is eight lines and it converts a one-way door into a
two-way door.** A `CATEGORY_SLUG_ALIASES` map applied inside `parseFilters`, in exactly the shape
`TYPE_ALIASES` (`filters.ts:32-34`) already has for `?type=long-life` — a pattern this file's own
comment records as fixing "a real perf bug we hit during Patch G review." Same problem, same answer,
already precedented in the same function. There is no argument for solving it a second, different way.

### Not load-bearing — confirmed clean

Materialized views, persisted shopping lists, share URLs, sitemap, routes: all covered in §0.2.
Vercel cache keys: the snapshot is a `use cache` read over the whole deal set
(`web-next/src/server/data/snapshot.ts`) and all category filtering is in-memory
(`filter-deals.ts:44`) — the slug is never part of a cache key.

Cosmetic only: `web-next/src/server/data/worth-picking-up.ts:291` renders
`Top discount in ${sub_category ?? category_slug}` as a display fallback. The rename changes
"Dairy Eggs" to "Dairy". That is an improvement.

### One thing that must not be renamed

**`deals.sub_category` values are not touched.** They are already the code's vocabulary — they are what
the classifier emits and what `BROWSE_CATEGORIES[].subCategories` lists. The divergence is entirely at
the category level. Any design that also rewrites `sub_category` has misdiagnosed the problem, and it
would break `sub-category-labels.ts`, `iconForSubCategory`, `subCategoryCounts` and the 28 existing
`taxonomy_alias.source_tag` keys all at once for no gain.

---

## 3. Migration safety

### 3.1 Naming and ordering — binding, and this fixes the incident

**Filename:** `supabase/migrations/20260918090000_taxonomy_align_to_browse_categories.sql`

**The rule, from now on, no exceptions:** `YYYYMMDDHHMMSS_snake_case.sql`. Fourteen digits, always, and
the prefix strictly greater than every file already in the folder. The duplicate-prefix incident this
session (`20260916_mv_validity_window.sql` beside `20260916120000_quantity_requirement.sql`) happened
because two files' parsed version keys collided, `supabase db push` applied one and failed the other on
a duplicate key, and a column silently did not exist. That is a system defect, not a human one.

**The system fix — required in the same PR, ~15 lines** (Fournier: *what check would have caught this?*):

A config test, in `pipeline/` beside the existing `pipeline.yml` config tests, asserting over
`supabase/migrations/*.sql`:
```
every filename matches /^\d{14}_[a-z0-9_]+\.sql$/
the 14-digit prefixes are unique
the 14-digit prefixes are strictly increasing in lexical filename order
```
`00000000000000_baseline.sql` passes all three. Mutation to prove it: rename any migration to an
8-digit prefix, confirm red, restore. **Without this check the incident recurs, and it has already cost
one silently-missing column.** Any WP that adds a migration is the right WP to add it; this one adds a
migration, so it is this one.

**`supabase/migrations/README.md` is now factually wrong and must be corrected in the same PR.** It
states *"none rename or drop"* and *"applying them out of order is also safe."* Both
`20260916_mv_validity_window.sql:124-125` and `20260917120000_mv_price_basis.sql:124-125` issue
`DROP MATERIALIZED VIEW`, and this migration will `DELETE` taxonomy rows. A reviewer trusting that
README will apply files out of order and break production. Unwritten strategy changes silently; wrong
written strategy is worse than none.

### 3.2 Statement order inside the file — the order *is* the safety property

One file, one transaction, in exactly this sequence. Every step is an `ON CONFLICT DO NOTHING` insert or
an idempotent update, so re-running the file is a no-op.

```
1. taxonomy_type      INSERT 'non-food'            (deals.category already emits it; the table
                                                    has 'household', which nothing references)
2. taxonomy_category  INSERT all 22 BROWSE ids, ON CONFLICT DO NOTHING   (7 exist, 15 new)
3. taxonomy_subcategory  INSERT all 76 sub-categories with their parent  (28 exist, 48 new)
                         UPDATE the 28 existing rows onto their new parent
4. deals              UPDATE category_slug per rename pair                (the 608 non-null rows)
5. concept_family     UPDATE category_slug per rename pair                (32 rows)
   taxonomy_alias     UPDATE category_slug per rename pair                (28 rows)
6. taxonomy_alias     INSERT the 48 new source_tag rows
7. taxonomy_type      DELETE 'household'
   taxonomy_category  DELETE WHERE slug NOT IN (<the 22>)     ← the assertion
8. deals              UPDATE d SET category_slug = a.category_slug
                        FROM taxonomy_alias a
                       WHERE lower(d.sub_category) = lower(a.source_tag)
                         AND d.category_slug IS NULL          ← the backfill of the 561
```

Step 7 is not cleanup, it is the integrity check. If any child row anywhere still points at a retired
category, the FK raises and the whole transaction rolls back. You get the guarantee for free, but
**only if steps 4–6 are in the same transaction as step 7.**

Step 8 mirrors `supabase/migrations/20260426_taxonomy_backfill.sql:15-21` exactly. Use the existing
statement; do not invent a second idiom for the same operation.

### 3.3 Backfill in the migration, not separate — and I expect to be alone in this

The textbook answer is "backfill separately, reviewed on its own." **I rule the opposite here**, for
three project-specific reasons:

1. **Steps 4–6 are not optional.** They are what makes step 7 succeed. Splitting them out means either
   the DELETE is also deferred (leaving 17+22 = 32 categories live, with seven of them stale and
   reachable by hand-edited URL) or the DELETE runs against unrepointed children and rolls back.
2. **This session has already been burned by a two-file migration half-applying.** One transactional
   file cannot half-apply. Two files demonstrably can — that is the incident, not a hypothetical.
3. **Volume is 1,169 rows.** Steps 4 and 8 are two `UPDATE`s over a table that fits in memory. This is
   not a long-running backfill that risks a lock; it is sub-second.

The line I hold: **nothing in this migration mutates a price, a date, a name or an `is_active` flag.**
It writes exactly one column on `deals` plus reference tables. That is what makes bundling it defensible;
if the scope ever grew past that, split it.

### 3.4 Verification against live data — MUST run immediately after apply, before anything else

```sql
-- 1. The number that was 561.
SELECT count(*) FILTER (WHERE category_slug IS NULL) AS unmapped, count(*) AS active
FROM   deals
WHERE  is_active AND valid_to >= (now() AT TIME ZONE 'Europe/Zurich')::date;
-- EXPECT unmapped = 0.  Anything > 0 names a sub-category with no alias row -> query 5.

-- 2. THE FK STILL EXISTS. The repository does not prove this; only the database does (§0.1).
SELECT conname, confrelid::regclass AS references
FROM   pg_constraint
WHERE  conrelid = 'deals'::regclass AND contype = 'f'
  AND  conkey @> ARRAY[(SELECT attnum FROM pg_attribute
                        WHERE attrelid='deals'::regclass AND attname='category_slug')];
-- EXPECT exactly one row -> taxonomy_category.  ZERO ROWS IS A STOP-THE-LINE RESULT:
-- it means the migration dropped the only enforcement this column has.

-- 3. The category table is exactly the code taxonomy, in both directions.
SELECT slug FROM taxonomy_category ORDER BY slug;
-- EXPECT the 22 BROWSE_CATEGORIES ids, and nothing else. Count = 22.

-- 4. No orphaned children.
SELECT 'concept_family' AS t, count(*) FROM concept_family cf
  LEFT JOIN taxonomy_category c ON c.slug = cf.category_slug
  WHERE cf.category_slug IS NOT NULL AND c.slug IS NULL
UNION ALL
SELECT 'taxonomy_subcategory', count(*) FROM taxonomy_subcategory s
  LEFT JOIN taxonomy_category c ON c.slug = s.category_slug WHERE c.slug IS NULL
UNION ALL
SELECT 'taxonomy_alias', count(*) FROM taxonomy_alias a
  LEFT JOIN taxonomy_category c ON c.slug = a.category_slug
  WHERE a.category_slug IS NOT NULL AND c.slug IS NULL;
-- EXPECT all three = 0.

-- 5. Every sub-category the LIVE DATA actually uses has an alias row.
SELECT DISTINCT d.sub_category
FROM   deals d LEFT JOIN taxonomy_alias a ON lower(a.source_tag) = lower(d.sub_category)
WHERE  d.is_active AND d.sub_category IS NOT NULL AND a.source_tag IS NULL;
-- EXPECT 0 rows. This is the query that would have caught the bug on 2026-09-11.

-- 6. The facet is actually populated, per category. Eyeball it.
SELECT category_slug, count(*) FROM deals
WHERE is_active AND valid_to >= (now() AT TIME ZONE 'Europe/Zurich')::date
GROUP BY 1 ORDER BY 2 DESC;
-- EXPECT ~22 rows, no NULL row, toys ≈ 226 and clothing ≈ 85 now landing under
-- toys-games and clothing-textiles rather than vanishing.
```

**Then, and this is the step that is always skipped: re-run queries 1 and 5 after the next real
pipeline run.** A migration that is green at T+0 and regresses at the first run is the actual risk here,
because the classifier's vocabulary is the moving part, not the table. The rollout is not complete until
one production run has passed query 5.

Also confirm `REFRESH MATERIALIZED VIEW concept_cheapest_now` still succeeds at the end of that run. It
should — the MVs carry no category column (§0.2) — but the session has already lost a grant to a
DROP/CREATE cycle, so confirm rather than assume.

### 3.5 Rollback

Keep the seven retired slugs in a `-- ROLLBACK:` comment block at the foot of the file with the inverse
`UPDATE`s. Do not write a separate down-migration file; this folder has no down-migration convention and
inventing one for a single case creates a second thing to keep in sync.

---

## 4. The test that makes this un-repeatable

The architect will propose one test. **I require three, at three distances, because the defect had three
chances to be caught and took none: the pull request, the pipeline run, and the rendered page.**

### 4.1 Primary guard — pure, credential-free, in `shared/`, fails in the PR

**This is the one that matters. The rest are backstops.**

**Where:** `shared/taxonomy-seed.test.ts`, run by the existing `test-shared` CI job
(`.github/workflows/ci.yml:41-57`).

**What changes to make it possible:** the DB seed stops being hand-written SQL. A pure generator
`shared/taxonomy-seed.ts` — no I/O, no imports outside `shared/` — renders `BROWSE_CATEGORIES` into the
exact `INSERT` statements for `taxonomy_category`, `taxonomy_subcategory` and `taxonomy_alias`. The
migration file contains that generated text between two sentinel comments.

**What it asserts** — four things, and the last two are the ones people forget:

```
1. the seed block in <migration>.sql is byte-identical to generateTaxonomySeed(BROWSE_CATEGORIES)
2. every BROWSE_CATEGORIES sub-category has exactly one taxonomy_alias row   ← the violated one
3. every taxonomy_category slug in the seed is a BROWSE_CATEGORIES id        ← no DB-only category
4. every taxonomy_alias source_tag is a BROWSE_CATEGORIES sub-category       ← no DB-only tag
```

Assertions 3 and 4 are the inverse direction. Without them, the *next* drift — someone adding a row to
the SQL by hand because a tag showed up in `pipeline_unknown_tags` — is invisible again.

**Does it hit the database? No, and that is deliberate, not a compromise.** `ci.yml` carries no Supabase
credentials and should not; the service-role key grants full write access and has no business in a PR
runner. The test reads the `.sql` file from disk with `fs`. A guard that only runs where credentials
exist is a guard that runs *after* the damage. The live-data equivalent is §3.4 query 5 plus the runtime
alert in §5 — different job, different distance.

**Why it fails at the right moment:** it goes red in the pull request that edits `BROWSE_CATEGORIES`,
with a message naming the tags that have no alias row. That is the exact commit — `dc9a0a4` — that
should have been red and was green. The fix is then mechanical: regenerate, paste, done.

**The mutation that must prove it** (project rule: *a guard that has never failed is not yet a guard*).
**Two mutations, because there are two failure directions, and one only proves half:**

| # | Mutation | Expected |
|---|---|---|
| M1 | Add `'test-drift'` to any `BROWSE_CATEGORIES` entry's `subCategories`. Run `cd shared && npx vitest run`. | **Red** on assertion 2 (and on the `types.test.ts` count tripwire, which is fine and expected). Revert → green. |
| M2 | Delete one `taxonomy_alias` line from the checked-in `.sql` seed block. Run the same. | **Red** on assertion 1. Revert → green. |

Both outputs pasted verbatim into the WP's review notes. M1 alone is insufficient: it proves the
generator sees new code, not that the file on disk is checked.

### 4.2 Runtime guard — see §5. A measured alert with a threshold, not a log line.

### 4.3 End-to-end guard — one non-skippable Playwright assertion

The plan already flags this weakness as a standing ticket (`final-plan.md:595-601`): nine e2e assertions
in `web-next/e2e/v2-acceptance.spec.ts` are `test.skip(count === 0, …)` against live data, so **a page
that renders nothing turns them green**. That is precisely a test that cannot fail when it matters most,
and it is why the browse UI never reported this.

One assertion, written the correct way:

```
`the Category facet is populated for every Type — 561 of 1,169 deals had no category_slug`
  visit /deals?type=longlife  → at least 3 Category chips render
  click the first chip        → at least 1 deal card renders
  repeat for ?type=fresh and ?type=household
```

No `test.skip`. Zero chips is a red run. This is the only guard that exercises the whole chain —
classifier → alias → column → facet → chip — and it is the one that would have shown a human the bug on
day one.

### 4.4 What I do NOT require

A test that asserts the live database matches the seed. It cannot run in CI, it would run only from a
developer's laptop, and it would therefore be run once and never again. If you want that assurance, it
is §3.4 query 5, run as part of the rollout checklist by a named human — an operational step, honestly
labelled, not a test pretending to be automated.

---

## 5. Should the pipeline refuse to publish a deal it cannot categorise?

**No. Warn — but the warning becomes a measured alert with a threshold, and above the threshold it fails
the run.** This is not a compromise between "fail" and "warn"; it is the correct reading of *empty is
not success*.

### Why NOT NULL is wrong

1. **"Empty is not success" is a rule about collection, not classification.** Its subject is a source
   that normally yields ~200 offers returning 3. A deal with a correct name, store, price, discount and
   validity window, missing only a browse slug, is not empty. It is publishable and legally complete —
   the price comparison, which is the product, does not depend on `category_slug` at all.
2. **It inverts an explicit, documented decision.** `20260425_taxonomy_4level.sql:31` states
   *"No backfill of existing deal rows. category_slug stays NULL until a later backfill."* The column was
   designed nullable. Reversing that silently, inside a bug fix, is the kind of undocumented drift this
   whole document is about.
3. **The blast radius is asymmetric and gets worse, not better.** `store.ts:118-142` discards a whole
   100-row batch on constraint violation. Once WP-J2's ledger lands, the publication is already marked
   fetched and **will not be re-fetched** (AP-1, AP-2). So one unseen model output would cost a week of
   one retailer's offers to protect a facet chip. That trade is indefensible at any threshold.
4. **The unseen tag is not hypothetical.** The classifier is a model. Its vocabulary is constrained by
   the prompt (`composition.ts:89`) and validated on the way out (`classification.ts:75 isValidCategory`,
   counted as `invalidCategoryRejected`), but the residual rate is small, not zero — and
   `alerts.ts:13-15` already records that this project measured 16 errors one run and 18 the next at
   temperature 0.

### What makes the warning impossible to ignore

The existing warning fired every run from 2026-09-11 and nobody noticed for six days. It failed on four
counts, and every one has to be fixed or the same thing happens again:

| Why it was missed | Fix |
|---|---|
| A `console.warn` inside a 60-minute log | An annotation on the Actions run page, not in it |
| No threshold — "some unmapped" reads the same at 1% and at 48% | Two thresholds, one of them fatal |
| Not in the run snapshot, so nothing could compare runs | `stats.taxonomy` into `pipeline_runs.metrics` |
| `pipeline_unknown_tags` recorded everything and has zero readers | Surface the count where a human already looks |

WP-P7 built exactly the machinery for this and taxonomy was never wired into it. Concretely:

1. **`stats.taxonomy = { mapped, total, unmappedTags: string[] }`** flows through
   `transformation/application/run-snapshot.ts` into `pipeline_runs.metrics` (the WP-P7 jsonb column).
   A number in a column is comparable across runs; a log line is not.
   `run-pipeline.ts:402-412` already computes `mappedCount` — it just throws it away into `console.log`.

2. **Two alerts in `transformation/domain/alerts.ts`**, in the existing `Measured<T>` / severity shapes:

   - **`taxonomy-unmapped` — `warning`** when `unmapped / total > 2%`, message naming the offending
     tags. 2% deliberately matches the existing `invalid-category-spike` threshold (`alerts.ts:294`), so
     the project has **one** number for "the prompt and the taxonomy have drifted," not two that can
     themselves drift apart.
   - **`taxonomy-coverage-collapse` — `critical`** (therefore exit 1, per AP-7) when
     `unmapped / total > 20%`, **or** when coverage fell more than 20 points against the previous
     snapshot. The step-change clause is what catches a `dc9a0a4`-shaped event on the day it happens
     rather than when the absolute number happens to cross a line.

   **The threshold is only correct if it fires on the known incident.** 2026-09-11 went from ~0% to 48%
   unmapped in one commit: both clauses trip, the run exits 1, and the defect surfaces that day instead
   of six days later. **A builder must verify this retrospectively against the 2026-09-11 run's numbers
   before the threshold is accepted.** Any threshold that leaves that run green is the wrong threshold,
   whatever its justification.

3. **It reaches a human without anyone reading logs.** `::warning::` / `::error::` annotation plus a
   `$GITHUB_STEP_SUMMARY` line — both already wired by WP-P7 — put it on the run page. A failed run also
   breaks the healthchecks.io ping (AP-5), which is the out-of-band channel that does not depend on
   anyone opening GitHub at all.

4. **`pipeline_unknown_tags` gets a reader.** It already captures the tags with an unresolved index
   (`resolve-taxonomy.ts:100-116`, `20260425:270-272`) and nothing has ever queried it. Put
   `N unresolved tags, oldest observed <date>` in the step summary. A table nobody queries is not an
   alert; it is a landfill.

### One ordering constraint this creates

`taxonomy-coverage-collapse` must **not** be enabled until the seed is fixed, or the very next run exits
1 by design. **Two commits, in this order: the migration and seed (T1), then the alert (T2).** The ADR
records why they are split — which is the one place in this whole fix where I *do* want two steps rather
than one, and it is for the opposite reason to §3.3: here the second step is a new failure mode being
switched on, not a data change that needs the first step's transaction.

---

## 6. Is there a cheaper correct fix than re-seeding?

**No. "Add ~33 alias rows against the existing 17 categories" is rejected — and not on taste. It does
not work, and I can put a number on it.**

### It cannot cover the gap

Live distribution of `sub_category` among unmapped active deals, measured today (492 of a 1,000-row
sample; the sample is the PostgREST page cap, and the shape is stable):

```
226 toys            25 kitchen-appliance   11 electronics-accessories   5 home-textiles
 85 clothing        23 books-media          8 coffee-tea                5 cookware
                    18 pet-food             7 dough                     5 feminine-care
                    12 pastry               7 body-care                 5 pet-care
                                            7 kitchen-tools             5 cake
… plus games 4, office-supplies 3, tools 3, plants 2, baby-care 2, stationery 1, garden-care 1, …
```

**454 of the 492 (92%) sit under top-level `non-food`.**

The 17 existing DB categories are: bakery, beauty-hygiene, coffee-tea, dairy-eggs, drinks, frozen,
home-cleaning, laundry, meat-fish, pantry-canned, paper-goods, pasta-rice-grains, personal-care,
pet-supplies, prepared-meals, snacks-sweets, vegetables-fruits.

**There is no target in that list for toys, clothing, appliances, cookware, home textiles, books/media,
stationery, tools, plants or baby goods.** That is roughly 380 of the 492 unmapped deals — **77% of the
gap has nowhere to point.** You would have to invent categories, at which point you are re-seeding —
just without saying so, and without deleting the seven stale ones. The "cheap" option is the expensive
option with the cleanup omitted.

### What it costs the next person

Even if the coverage worked, this is the part that decides it.

- **The alias table stops being a translation and becomes a second definition.** A translation can be
  generated from its source and tested for free (§4.1). A definition cannot — you would be asserting
  that two independently hand-maintained lists agree, forever, by hand. That is exactly the regime that
  produced this incident.
- **`coffee-tea` stays a category in the database and a sub-category in the code.** The two models
  disagree about *how many levels the tree has*. **No alias row can fix a level mismatch** — an alias
  maps a tag to a (category, sub-category) pair, and here the same string must be both. Anyone who
  later writes a drill-down, a breadcrumb, or an icon lookup has to special-case it.
- **It preserves the exact shape of the defect.** A person adding a category to `BROWSE_CATEGORIES`
  still has to remember a SQL file that nothing points them at. The next drift is scheduled, not
  prevented. (Larson: *fix the system, not the instance.* Patching 33 rows is the instance.)

The comparison people reach for — "33 rows versus 98 rows" — is the wrong one. Both are one generated
file. The real comparison is **"one taxonomy, generated and tested" versus "two taxonomies, reconciled
by hand forever,"** and the second is more expensive from the first week.

### The one genuinely cheaper option, which I reject *for now* and want on the record

**Delete `taxonomy_category` / `taxonomy_subcategory` / `taxonomy_alias`, drop the FK, and translate in
code** — the way `CATEGORY_ALIAS` (`supabase-provider.ts:74-80`) already translates the top level. Six
lines instead of a migration. The project has already proved this pattern works one level up (§0.3), and
the DDD reading is that the taxonomy is a *published vocabulary*, not persisted state, so it belongs in
`shared/` where both consumers already import from.

**I reject it, for now, on one ground only: dropping the FK is the one genuine one-way door in this
whole problem.** That constraint is what turns "the pipeline wrote a slug nobody defined" from a silent
NULL into a loud rejection, and today it is the *only* enforcement of any kind on this column. Removing
the sole existing guard in the same change that fixes a six-day-invisible bug is bad sequencing
regardless of how right it might eventually be. Keep the constraint; generate the data; get §4.1 and §5
in place. **Revisit in three months** — if the taxonomy tables are carrying no other weight by then,
retiring them is a two-way door *because the generator will already exist*. Record that as a deliberate,
dated deferral in the ADR, not as a decision that was never considered.

---

## 7. Where I expect to disagree with the Architect

Written before reading their output, so it can be tested honestly.

| # | What I expect them to propose | My ruling and why |
|---|---|---|
| **1** | **Make `category_slug` NOT NULL** — "a deal without a category is an invalid state, and invariants belong in the constructor." | **Disagree, and this is the sharpest one.** The DDD instinct is right about invariants and wrong about *which* invariant. The real invariant is **"every sub-category the code can emit has an alias row"** — a property of the *seed*, checkable in CI at zero cost (§4.1). "Every row has a slug" is a property of *runtime output* whose only enforcement point is a batch write that drops 100 deals per violation into a publication that AP-1 forbids re-fetching. Enforce where a human can still fix it: the pull request. See §5. |
| **2** | **A `CategorySlug` value object / a `Taxonomy` aggregate in `collection/domain/`.** | **Disagree on layering, not on the idea.** Classification is `transformation/`, not `collection/` — no adapter has an opinion about categories. More decisively: the taxonomy has **four consumers** (classifier prompt, DB seed, web labels, web URL contract), two of which live in `web-next/`, which cannot import across the project boundary (the Turbopack rule documented in `lib/deal-attributes.ts`). Putting it under `collection/domain/` reproduces the exact split that caused defect #10 (`final-plan.md:205-209`). **`shared/` is the only correct home**, because `shared/` is already what both sides import. |
| **3** | **Add an `uncategorised` / `other` category so the column can be NOT NULL.** | **Disagree — strictly worse than NULL.** It makes 561 deals *look* categorised, destroying the signal the §5 alert depends on, and puts a junk chip in the user's facet list. NULL is honest. (Torvalds: the special case disappears by refusing to invent it.) |
| **4** | **A `TaxonomySource` port / repository wrapping the alias lookup.** | **Disagree — over-engineering, explicitly out of bounds.** `loadAliases` is 14 lines and already pure enough to test. CLAUDE.md's own clause: *"Repositories-wrapping-repositories, event buses and CQRS do not"* pay for themselves at one developer and 10–50 users. |
| **5** | **This should go before J2/J3 — it is a correctness bug, and correctness precedes structure.** | **Disagree on the delivery question.** J3 is what stops the pipeline hitting the 60-minute wall; a pipeline that does not finish produces no rows to categorise at all. Availability outranks browsability. §1: fourth lane, in parallel, not J3's slot. |
| **6** | **Backfill as a separate reviewed step** (the textbook answer). | **Disagree, on project-specific grounds.** The rename `UPDATE`s are structurally required for the `DELETE` to succeed, 1,169 rows is one sub-second statement, and **this session has already been burned by a two-file migration half-applying**. One transaction cannot half-apply. §3.3. |
| **7** | **Nothing about the foreign key** — most likely they will read the repo's schema and conclude `category_slug` is an unconstrained `TEXT` column. | **They will be wrong, and it is the single most consequential fact in the problem.** The FK exists in production and does *not* exist in a database rebuilt from this repository (§0.1). Any design validated against a repo-built schema is validated against a schema production does not have, and will discover this as a 100-row batch loss on a Monday morning. I verified it empirically; ask them how they verified it. |
| **8** | Possibly **"rename `sub_category` values too, for consistency."** | **Disagree — out of scope and net-negative.** Sub-categories are already the code's vocabulary. Renaming them breaks `sub-category-labels.ts`, `iconForSubCategory`, `subCategoryCounts` and the 28 existing `source_tag` keys simultaneously, for no gain. §2. |

**Where I expect to agree, and will say so plainly:** that there must be exactly one taxonomy; that
`BROWSE_CATEGORIES` is the source of truth; that the DB seed must be a generated artifact rather than a
hand-written file; and that a lint-or-test guard, not a convention, is what prevents recurrence. If
their design says all four, the disagreements above are about placement and sequencing, and every one of
them is a two-way door except #1 and #7.

---

## 8. Compass principles this adds to `docs/technical-strategy.md`

1. **A vocabulary with more than one consumer is generated, never copied.** If two artifacts must agree
   and one is hand-written, they will diverge — the only question is when. Generate the dependent from
   the source and assert byte-equality in CI. *(This incident, and the 48 missing sub-category labels
   that came from the same commit.)*
2. **Translate at the boundary, in code, before reaching for a table.** `CATEGORY_ALIAS`
   (`supabase-provider.ts:74-80`) solves the identical problem one level up in six lines with no
   migration, no FK and no drift. A reference table earns its keep only when the data is edited
   independently of a deploy. Ours is not.
3. **A count tripwire cannot catch a missing dependent.** `shared/types.test.ts:36` did its job at
   `dc9a0a4` and the bug shipped anyway, because it asserted the source changed deliberately, not that
   everything downstream followed. Assert relationships, not cardinalities.
4. **A warning with no threshold is not a warning.** "Some unmapped tags" reads identically at 1% and at
   48%. Every operational signal gets a number, a comparison against the previous run, and a level at
   which it stops being advisory. *(Six days.)*
5. **The repository must be able to rebuild production.** Where it cannot, that gap is a defect with a
   ticket, not a footnote in a file header. `00000000000000_baseline.sql` is missing at least one live
   foreign key while claiming to capture foreign keys.
6. **Migration filenames are 14 digits, strictly increasing, enforced by a test.** *(One column silently
   did not exist.)*

---

## 9. Carry-forward tickets (not this WP, same root cause)

| Id | Finding | Evidence |
|---|---|---|
| **T-a** | **48 of 76 sub-categories have no DE or EN label.** German visitors see "Toys", "Kitchen Appliance", "Books Media", "Pastry", "Dough", "Home Textiles". Header claims sync with a file that no longer exists. Same commit, same root cause, more visible to a Swiss user than the facet gap. | `web-next/src/lib/sub-category-labels.ts:1-6, 70-75` |
| **T-b** | `supabase/migrations/README.md` claims *"none rename or drop"* and *"out of order is also safe."* Both false since 2026-09-16. | `README.md:33-36` vs `20260916…:124-125` |
| **T-c** | `CategoryVerdictCard` links with query key `category`; `parseFilters` reads `cat`. The link has never applied a filter. | `components/landing/CategoryVerdictCard.tsx:31` vs `lib/filters.ts:68` |
| **T-d** | `humaniseSlug` is duplicated verbatim in two components; mid-level category chips are untranslated in all four locales. | `FilterRail.tsx:40`, `FilterSheet.tsx:35` |
| **T-e** | `pipeline_unknown_tags` has an unresolved-rows index and zero readers since April. | `20260425:270-272` |
| **T-f** | Deferred by decision: retire the taxonomy tables in favour of a code-side translation map, once §4.1's generator exists and the FK's value can be re-assessed. **Revisit 2026-12.** | §6 |

---

# Cross-review response

**Added:** 2026-09-17, after reading `docs/rca/2026-09-17-architect-taxonomy-divergence.md`.
Everything below was verified by me directly — against production read-only, and against the files —
not taken from their document. No source code changed.

## CR-0. Bottom line

**Adopt the Architect's design. It is better than mine.** They found the actual root cause; I found the
symptom's boundary conditions. Their fix removes the mechanism; mine would have made the mechanism
correct. Removing it is strictly better.

But their build order does not survive contact with production. **Three defects, all verified live:**

| # | Defect | Severity |
|---|---|---|
| **CR-A** | Migration 1 **step 6 hard-fails on an FK violation.** 20 `taxonomy_subcategory` rows point at the 7 doomed parents, and their own R-4 decides to keep exactly those rows. | **Blocker** |
| **CR-B** | Migration 2's delete target is **11,206 rows, not "under 50."** Their escalation threshold is off by 224×, and 10,137 of those rows can never be repaired by the `sub_category` join. | **Blocker** |
| **CR-C** | R-7 ("the `shared` suite may not run in CI") is **already mitigated.** The `test-shared` job exists. Their blocking sub-task is not needed. | Correction — removes work |

And one place I was wrong, and one where the counter-argument they raised is sound and I concede it.

---

## CR-1. Where I was wrong

**I asserted `BROWSE_CATEGORIES` "also drives the browse UI." It does not.** `grep -rn BROWSE_CATEGORIES
web-next/src` → **zero matches**; the only frontend importing it is retired `archive/web-vite/`. I took
that clause from the brief and did not check it, while checking six other things in the same paragraph.
The category facet is built from data (`filter-deals.ts:130`, `FilterSheet.tsx:75`) and labelled by
`humaniseSlug`. My §0.4 dependency table is wrong on that row and the Architect's §1.3 five-copy table is
the correct picture.

It does not change any of my rulings — my §6 case never rested on it — but it is the kind of error I
flagged them for, so it goes at the top rather than in a footnote.

**And they found the root cause, which I missed.** Verified at `classify-deals.ts:372`:

```ts
category: topCategoryFor(fields.category) as Deal['category'],
```

`fields.category` is the classifier's browse category, already validated against `BROWSE_CATEGORIES` by
`createClassification` (`classification.ts:78-92`, verified). `topCategoryFor` collapses it to its top
group and **the browse id is discarded**, because `Deal` has no field to carry it. Five minutes later
`resolveTaxonomyStep` (`run-pipeline.ts:839`, verified) reconstructs it from the *child* (`sub_category`)
through a hand-maintained table. `shared/types.ts:961` `dealToRow` already writes `category_slug` and
needs no change.

**The fix for HANDOVER §4 defect #3 created this defect**, and the comment at `classify-deals.ts:366-371`
explains at length why the value must not go in `deals.category` while never asking where it *should*
go. I diagnosed a drift between two lists. They diagnosed why there are two lists. **Theirs is the real
root cause and `dc9a0a4` is only the trigger.** My §0.4 "four dependents, one updated" framing is true
and useful for the *other* three copies; it is not the cause.

---

## CR-2. Does this change my §6 ruling? Yes — substantially.

**My "77% of the gap has nowhere to point" argument stands as written, and is now irrelevant to the
chosen design.** It was an argument against *adding alias rows against the existing 17 categories*. The
Architect does not add alias rows; they delete the lookup. An argument against a lookup-miss does not
apply to a design with no lookup. I withdraw it as a live consideration and keep it on the record as the
reason the cheap option was never available.

**Better: I verified their backfill join is total, which my analysis did not establish.** Every live
active `sub_category` value is in `BROWSE_CATEGORIES` — **0 distinct orphans across 1,169 active deals**
— and every value is lowercase, so their exact-match `s.slug = d.sub_category` join (which drops the
lowercasing `resolveTaxonomy:60` used to do) maps **100% of the active catalogue in one statement**. That
is a stronger result than "444 of 561 in the top ten alone" and they should claim it.

**Does the generated projection still earn the tables, or does this strengthen my deferred "delete
them"?** We reached the same verdict independently and for the same reason — they scored candidate C at
49 and rejected it because "the nullable FK was the only mechanism capable of noticing this bug." That
convergence is worth something. **But my stated justification was weaker than theirs, and I am replacing
it.**

I deferred deletion on "the FK is the only enforcement." Under their design that is no longer quite true:
`createClassification` is now the primary guard and the FK is a second check. The FK's real justification
is different, and it is this:

> **There is more than one write path to `deals.category_slug`, and only one of them goes through
> `createClassification`.**

Verified write paths: `dealToRow` (`shared/types.ts:961`), `offerToRow`
(`storage/domain/deal-row.ts` — the component-3 path, not yet wired, which the Architect correctly
patches in §5.1), `v3-cutover.ts:95`, `seed-v3-from-deals.ts:101`, plus hand-edits in the Supabase
console. The domain invariant covers exactly one of five. The FK covers all five, for free, forever.

**Ruling: keep the tables. Revisit when — and only when — there is exactly one write path to
`deals.category_slug`.** That is a sharper criterion than my "revisit 2026-12" and it is falsifiable.
Supersedes ticket T-f in §9.

---

## CR-3. The `resolveTaxonomyStep` trap — confirmed, and it is worse than they state

**Confirmed by reading the code.** `run-pipeline.ts:839` calls `resolveTaxonomyStep(deps, categorized)`
inside the write tail, **after** classification, and its output `resolved` is what feeds
`writeDealsWithSweepGuard`, `v3CutoverStep` and `resolveProductIds`. `resolveTaxonomy:58-63` does
`return { ...deal, categorySlug: entry.categorySlug }` on a hit and returns the deal **unchanged** on a
miss.

So if `categorySlug` is set at classification time and the step is left in:

- the **608** deals whose `sub_category` has an alias row get their correct new slug **overwritten with
  the old divergent one** (hit → spread → overwrite);
- the **561** whose tag has no alias row keep the correct new value (miss → unchanged).

**The Architect states this. What they do not state is that it is worse than leaving the bug alone**: the
result is a catalogue where correctness is *inversely* correlated with whether the legacy table knew
about the tag. Today's failure is at least legible — 561 NULLs, one shape. That failure would be 608 rows
silently wrong and 561 silently right, with a green run and 100% coverage. It would defeat their own
`categorySlugCoverage < 1.0 is critical` alert (§7.4), because coverage would be **1.0**.

**Ruling: yes, deleted in the same commit — and the composition-root test is not optional.** Their test
`no taxonomy alias table is consulted during a run` is the guard, and its mutation (restore the step) must
be run and recorded. I am additionally requiring one assertion they do not have, because coverage cannot
catch this class:

```
`a run's stored category_slug equals the classifier's category for every deal —
 resolveTaxonomyStep overwrote 608 correct values with divergent ones and coverage stayed 1.0`
```

Assert the **value**, not the count. A count-based guard is exactly what let this incident run for six
days (§8 principle 3).

---

## CR-4. Does the FK survive their approach? Ordering ruling.

**Yes, and the ordering is not merely reviewer discipline — their design already makes it
self-enforcing. I am ruling that property load-bearing and requiring it be named as such.**

The hazard is real and is my §0.1 finding applied to their design: the classifier can emit any of 22
browse ids; the FK permits only the slugs in `taxonomy_category`; `store.ts:136` discards a **whole
100-row batch** on error with a `continue`. Ship the code before the migration and a run loses deals in
100-row blocks while reporting `accepted N of 100` into a log nobody reads.

**But their preflight (§7.2) closes it completely, and this is the elegant part of their design:**

- The preflight ships *with* the code, in the same deploy.
- It reads `SELECT slug FROM taxonomy_category` and compares to `BROWSE_CATEGORIES` **before any fetch or
  write**.
- Sets differ → exit 1, zero fetches, zero writes. Read fails → exit 75 (transient), matching T1.

So a code-before-migration deploy costs **a minute of free Actions time**, not a mangled catalogue. The
FK can never actually be violated at write time, because `classifier output ⊆ BROWSE_CATEGORIES ids =
taxonomy_category slugs` is checked at run start. That is a machine-enforced deploy order, which is
strictly better than `ad72e60`'s lesson (a reviewer catching a false deploy-order claim in prose).

**Ruling, in three parts:**

1. **Migration 1 lands strictly before the pipeline deploy** — same discipline as WP-P9, and their §5.7
   already sequences it correctly (migration is step 2, code is step 4).
2. **The preflight is NOT descopable.** If it is cut for time, the FK hazard returns at full strength and
   the ordering goes back to being prose. It is the cheapest guard in the whole design and it is the one
   that makes the other decisions safe. **If the preflight is cut, `NOT NULL` must be cut with it** —
   see CR-5.
3. **Add one config assertion I did not see in their tests:** the preflight must run *before*
   `collectOffers`, not merely before `storeDeals`. Test:
   `a drifted taxonomy makes ZERO retailer requests` — asserting transport call count is 0, not that the
   run exited 1. Under AP-1/J2, a run that fetches and then dies has burned a publication it may never
   refetch. Exiting 1 after collecting is a different and much more expensive failure than exiting 1
   before it.

---

## CR-5. `NOT NULL` — I concede the argument, and rule against the instrument

The coordinator is right that my document did not address their specific argument. Addressing it directly.

### Their argument is sound. I concede it.

> `NOT NULL` adds zero new rejection paths, because `deals.category` is already `NOT NULL`
> (`baseline.sql:85`, verified) and both columns derive from the same `classification.category`.

I traced it. `deals.category = topCategoryFor(fields.category)`, which returns
`BROWSE_CATEGORIES.find(c => c.id === browseCategory)?.topCategory ?? null` (`shared/types.ts:1026`). A
`fields.category` outside the taxonomy yields `null` → the row already fails `category NOT NULL` one
column earlier. And it cannot be outside the taxonomy, because `createClassification` refuses to
construct (`classification.ts:85-87`). I also checked the two holes I expected to find and **both are
closed**: `filterToGroceryOnly` (`run-pipeline.ts:808`) drops unclassifiable deals before they can reach
a write, so there is no unclassified write path; and the classification cache stores and returns the
whole validated `Classification` rather than re-deriving one.

**So my batch-of-100 blast radius and my "J2 lost week" counters do not survive against *their* design.**
Those were arguments against a *lookup miss*, and they deleted the lookup. I withdraw them as objections
to NOT NULL. They remain valid as the justification for the preflight (CR-4), which is where they belong.

### But `NOT NULL` is not only a constraint on future writes, and this is where their plan breaks

`ALTER TABLE deals ALTER COLUMN category_slug SET NOT NULL` validates **every row in the table**, not
just the rows a future run will write. Measured against production today:

```
deals, all rows                                    26,371
deals WHERE category_slug IS NULL                  11,206   (42.5% of the table)
deals WHERE sub_category IS NULL                   10,137   ← the sub_category join can NEVER fix these
active + in-window WHERE sub_category IS NULL           0
```

Their Migration 2 step 2 says: measure the count, `DELETE` them, and **"if the count exceeds 50, stop and
escalate to the PM."**

**The count is 11,206. Their threshold is off by a factor of 224.** Their diagnosis of *what* those rows
are is exactly right — legacy pre-classifier rows, all historical, none active — but the magnitude turns
step 2 from a cleanup into **deleting 43% of the deals table**. As written, the migration self-halts at
its own escalation gate on migration night. The gate working is the good news; discovering it at 23:00 is
the bad news.

### Ruling: the invariant is approved. The instrument is not. Use `CHECK … NOT VALID`.

There is no reason to couple "every *new* row must have a category" to "delete or repair 11,206
historical rows." Postgres separates them:

```sql
-- Migration 2, replacing SET NOT NULL. No table scan. No deletions. No PM decision required.
ALTER TABLE deals
  ADD CONSTRAINT deals_category_slug_present
  CHECK (category_slug IS NOT NULL) NOT VALID;
```

`NOT VALID` skips the full-table validation and **still enforces the constraint on every INSERT and every
UPDATE**. Every property the Architect argues for in their §6 — the refusal, the arming of the disarmed
invariant, "a refusal pages an operator; a NULL pages nobody" — holds in full, from the moment it is
applied, against 11,206 non-conforming rows that nobody has to touch. Later, once the PM has ruled on the
archive:

```sql
ALTER TABLE deals VALIDATE CONSTRAINT deals_category_slug_present;  -- or SET NOT NULL
```

(If the project is on PG 18+, `SET NOT NULL … NOT VALID` exists and is equivalent; the `CHECK` idiom is
the portable one and works on every version Supabase ships.)

This is the Torvalds test from my own compass: **the special case disappears with a better structure.**
Their design needs an `if` — "delete the legacy rows, unless there are more than 50, in which case
escalate." The `NOT VALID` constraint has no branch. The 11,206 rows stop being an obstacle to the
invariant and go back to being what they are: a data-retention question, on its own timeline.

**So the ruling is: adopt `NOT NULL` semantics immediately via `CHECK … NOT VALID`; do not run
`SET NOT NULL`; do not delete any rows in this WP.** Migration 2 becomes two lines and stops needing a
PM decision to ship. The `VALIDATE` step becomes a separate, dated follow-up.

**One binding condition, from CR-4:** this constraint is only safe with the preflight in place. Preflight
and constraint ship together or neither ships.

---

## CR-6. CR-A — Migration 1 step 6 will hard-fail. Verified.

Their step 6 is `DELETE FROM taxonomy_category WHERE slug NOT IN (<the 22 browse ids>)`, with the note:
*"If it errors on an FK, a row was missed — that is the constraint doing its job; do not CASCADE."*

**It will error, every time, and the row was not missed — their R-4 decided to keep it.** R-4 accepts
leaving ~30 legacy `taxonomy_subcategory` rows (`cheese`, `red-meat`, `milk`) in place, and
`taxonomy_subcategory.category_slug` is `NOT NULL REFERENCES taxonomy_category(slug)`
(`20260425_taxonomy_4level.sql:67`). Their step 3 upserts only the **76 browse** sub-category slugs, so
any legacy slug that is not a browse sub-category is never repointed.

Queried production: `taxonomy_subcategory` has 52 rows. 26 point at one of the 7 doomed parents. Of
those, 6 (`cleaning`, `coffee`, `eggs`, `hair-care`, `tea`, `vegetables`) are browse sub-categories and
*are* repointed by step 3. **The other 20 are not, and each one is an FK that blocks the DELETE:**

```
air-care → home-cleaning      butter  → dairy-eggs     grains → pasta-rice-grains   oral-care → personal-care
bathroom → home-cleaning      cheese  → dairy-eggs     noodles→ pasta-rice-grains   skin-care → personal-care
kitchen  → home-cleaning      milk    → dairy-eggs     pasta  → pasta-rice-grains   deodorant → personal-care
detergent→ laundry            yogurt  → dairy-eggs     rice   → pasta-rice-grains
softener → laundry            fruits  → vegetables-fruits    herbs → vegetables-fruits
stain-removal → laundry       salads  → vegetables-fruits
```

**R-4 and step 6 are mutually exclusive.** One of them has to give.

**Ruling: delete the 20, and it is safe.** I checked the only thing that could pin them —
`concept_family.subcategory_slug REFERENCES taxonomy_subcategory(slug)`
(`20260427_v3_concept_layer.sql:78`) — and **zero `concept_family` rows reference any of the 20.** So add
a step 5.5:

```sql
DELETE FROM taxonomy_subcategory
WHERE  slug NOT IN (<the 76 browse sub-categories>);   -- 20 rows; verified unpinned 2026-09-17
```

This also upgrades their guard from "superset" to **set equality**, which is the assertion you actually
want and the one their §7.1 item 4 is written for anyway. **R-4 is withdrawn, not accepted** — it was
accepted on the belief that removing the rows risked `concept_family`, and that belief is measurably
false. Re-verify the zero-pin count in the migration PR against live data, since `v3-cutover.ts` writes
`concept_family` on every run and the number could move.

---

## CR-7. CR-C — R-7 is already mitigated. Remove the blocking sub-task.

They rate R-7 **High** ("the `shared` suite may not run in CI — the guard would be inert") and make
confirming it a blocking sub-task of WP-T1, calling it "the difference between a guard and a decoration."

**It already runs.** `.github/workflows/ci.yml:41-57`, job `test-shared`, named
*"Test (shared types + taxonomy)"*, borrowing vitest from `pipeline/node_modules`:

```yaml
      - name: Test shared
        run: ../pipeline/node_modules/.bin/vitest run --root .
        working-directory: shared
```

The instinct was right and the risk was real when CLAUDE.md's warning was written; someone has since
fixed it. **Ruling: R-7 drops to nil, the blocking sub-task is removed, and the builder instead adds one
line to the WP's evidence — a link to a CI run showing `test-shared` green.** Verify, then delete the
risk; do not carry a mitigated risk as live work.

---

## CR-8. Two smaller corrections to their plan

1. **The migration filenames `20260917a_…` / `20260917b_…` violate the rule that caused this session's
   incident.** Alphabetic suffixes are exactly the pattern that produced the duplicate-version collision.
   Rename to `20260918090000_…` and `20260918091000_…`, and add the 14-digit CI config test from my §3.1.
   Non-negotiable, and it costs 15 lines.
2. **Their §7.4 deletes `pipeline_unknown_tags`.** I agree the table's purpose dies with the alias
   lookup, and their read-before-delete step (export to the PR) is right. But their stated replacement,
   `invalidCategoryRejected` (`alerts.ts:294-300`), measures a *different* thing — answers naming a
   category outside the taxonomy, i.e. model error. It does not measure what `pipeline_unknown_tags`
   measured. That is fine, because under the new design the thing it measured **cannot happen**. Say that
   in the ADR rather than naming a replacement that is not one; otherwise the next reader will believe a
   signal is covered when it is merely gone.

---

## CR-9. Product vs technical split — I agree, with one addition and one subtraction

**Agreed, these are the PM's, not ours:**

- **F-1 — ~28% of the active catalogue is general merchandise** (227 toys, 91 clothing) and gains browse
  chips. This is "what is basketch for" — the most product question in the set. ADR-001 already
  contemplated a `general-merchandise` top group (`shared/types.ts:278-281`), so there is a designed
  option to offer.
- **F-2 — `coffee-tea` stops being a category**, 9–11 deals move under Drinks, a chip a returning shopper
  may have used disappears. Technically forced by one taxonomy; the *visible change* is theirs.
- **F-3 — chips invisible at the default `?type=all`.** Pure browse-UX. PM and Designer.

**One addition — I am moving a decision out of the technical column and into the PM's:**

- **The 11,206 historical rows** (CR-5). The Architect's plan disposes of them by `DELETE` inside a
  migration. Whatever the right answer, **deleting 43% of the deals table is a data-retention decision,
  not a schema decision**, and precedent #10b shows this PM expects to make that call themselves for far
  less (292 rows). My `CHECK … NOT VALID` ruling is what makes it *unnecessary to decide now*, which is
  the point — it stops a product decision from blocking a correctness fix.
  For the PM's benefit when they do decide: nothing reads inactive deals today (every read path filters
  `is_active = true` — `supabase-provider.ts:198`, `worth-picking-up.ts:267`) and there is no
  price-history feature. So the rows are currently dead weight; the only argument for keeping them is a
  future price-history product.

**One subtraction — this one is NOT the PM's, it is mine, and I have ruled it:** the Architect's
Migration 2 ">50 rows, escalate to the PM" gate. With `CHECK … NOT VALID` there is nothing to escalate,
because there is nothing to delete. Do not send the PM a question that a better instrument removes.

---

## CR-10. The missing labels — count confirmed, and the dependency is not what it looks like

**Confirmed: 48 of the 76 sub-categories have no German and no English label.** Computed by parsing
`BROWSE_CATEGORIES` and diffing against the keys in `web-next/src/lib/sub-category-labels.ts`:

```
pastry, cake, dough, drinks, coffee-tea, catering, hair-care, dental-care, facial-care, body-care,
make-up, mens-care, feminine-care, health-wellbeing, pet-food, pet-care, kitchen-appliance,
home-appliance, spirits, cookware, kitchen-tools, food-storage, clothing, shoes, home-textiles,
plants, garden-care, outdoor-living, tools, diy-hardware, car-accessories, toys, games,
sports-equipment, baby-care, nappies, baby-food, formula, baby-accessories, stationery, … (48 total)
```

`subCategoryLabel` (`sub-category-labels.ts:70-75`) falls back to a title-cased slug, so a German
visitor sees "Toys", "Pastry", "Dough", "Kitchen Appliance", "Body Care" — English, in all four locales.

**Ruling: split it in two. The half the PM cares about is fully independent and shippable today.**

| | Depends on the taxonomy work? | Why |
|---|---|---|
| **Sub-category labels (48 of 76)** | **No. Completely independent.** | `deals.sub_category` values are **not changing** — they are already the code's vocabulary, already correct in the database, and no part of either design touches them. The keys these labels need are stable today. Ship whenever someone has an hour. |
| **Category labels (22 chips)** | **Yes — must follow T1.** | The slugs themselves change (`dairy-eggs` → `dairy`, `vegetables-fruits` → `fruits-vegetables`). Translating them before the remap means translating strings that are about to be deleted. |

So the Architect's WP-T2 correctly bundles the category half after T1, and **incorrectly bundles the
sub-category half with it**. The sub-category half is the more visible defect — it is on every deal card
and every sub-category chip, not behind two taps — and it has zero dependencies. **Recommend to the PM:
ship the 48 sub-category labels this week, independently, in lane W.**

I endorse their mechanism for both halves: put the strings in `messages/{en,de,fr,it}.json` keyed by
slug, guard with a test that reads the **generated `.sql` artefact** — a plain file, no bundler — and
asserts every slug has a message key. That is the correct answer to "`web-next` cannot import
`shared/`," and it is better than anything in my document.

---

## CR-11. Consolidated build order (supersedes their §5.7 and my §1)

```
0.  [Lane T, blocking]  14-digit migration-filename config test + fix migrations/README.md   (my §3.1)
1.  Generator + shared guard test (red)                            — NOT a blocking CI sub-task (CR-7)
2.  MIGRATION 1  20260918090000_taxonomy_projection.sql
      steps 1-5 as the Architect wrote them
      + step 5.5  DELETE the 20 legacy taxonomy_subcategory rows   (CR-6 — without this, step 6 fails)
      step 6      DELETE the 7 doomed taxonomy_category rows
      → guard green. SITE IS FIXED HERE, before any pipeline code ships.
3.  Preflight + composition-root tests, incl. `a drifted taxonomy makes ZERO retailer requests`  (CR-4.3)
4.  classify-deals.ts one-liner; DELETE resolveTaxonomyStep + resolve-taxonomy.ts  — SAME COMMIT (CR-3)
      + the value-equality test, not only coverage                                              (CR-3)
5.  Deploy pipeline. One run. Verify Taxonomy 1169/1169 AND spot-check values against classifier output.
6.  MIGRATION 2  20260918091000_category_slug_present.sql
      CHECK (category_slug IS NOT NULL) NOT VALID        — two lines, no deletions, no PM gate  (CR-5)
7.  ?cat= alias map in web-next/src/lib/filters.ts, 60-day expiry. Deploy.
8.  [Independent, any time]  48 sub-category labels in messages/*.json                         (CR-10)
9.  [After 5, separate]      VALIDATE CONSTRAINT, once the PM has ruled on the 11,206 rows      (CR-5)
```

Lane placement unchanged from my §1: **lane T, parallel, opening when WP-J1 merges; it does not take
J3's slot.** The Architect notes WP-T1 conflicts with lane P (`run-pipeline.ts`, `classify-deals.ts`) and
lane C (`shared/types.ts`) and must merge *between* packages rather than alongside them — that is
correct and sharper than my §1 table, which had checked `resolve-taxonomy.ts` but not `classify-deals.ts`.
**Their merge-window constraint is adopted.** Steps 0–2 have no such conflict and can start immediately.

---

## CR-12. Scorecard

**Adopted from the Architect, over my own position:** the root cause (§2.2); writing `categorySlug`
directly from validated classifier output; deleting `taxonomy_alias` and `resolve-taxonomy.ts`; the
backfill joining `sub_category` rather than a category→category map (their `wine → alcohol` case is one
my approach would have got wrong); the run preflight, which is better than any guard I specified; the
generated-SQL-as-contract mechanism for `web-next` labels; and the `NOT NULL` *argument*.

**Mine that stands:** the FK finding and the repo/production schema drift (§0.1 — absent from their
document); the 14-digit filename rule and config test; the migrations README correction; the stale-`?cat=`
alias map (we converged, independently, on the same `TYPE_ALIASES` precedent); keeping the taxonomy tables
(converged); and the three defects above.

**Genuinely open, for the Challenger rather than for me:** whether the preflight belongs in
`storage/domain` as they place it, or beside the other run-start checks. Two-way door, not worth a round
trip.

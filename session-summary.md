# basketch — session summary

**Dates:** 2026-09-10 → 2026-09-11
**Branch:** `feat/collection-module` (not merged)
**Resume with:** "read session-summary.md and continue"

---

## State at the end of this session

```
pipeline    903 tests passing    tsc clean
web-next    124 tests passing    tsc clean    next build OK
shared       77 passing · 3 FAILING (expected — see below)
OCR           7 tests passing

Components 1, 2, 3 built and verified against live data.
Component 4 (frontend) DONE — all six UI items built.
```

**Component 4 closed on 2026-09-11. See "Component 4 — frontend" below.**

**The 3 failing `shared` tests are deliberate.** They are `category-rules.ts`
mis-categorising `Nespresso Kapseln` and `Rivella` — live evidence of the bug this
work replaces. They disappear when D4 deletes that file, which is blocked only by
`resolve-taxonomy.ts` still importing from it.

---

## What was discovered (more important than what was built)

**Component 1 was never actually running.** The handoff said *"done: 7 of 7
retailers, 252 tests"*. True of the PARSERS. But four adapters had no way to
fetch anything, there was no composition root, and `run.ts` never imported the
module. A fixture-based suite cannot catch a missing fetch path — it is designed
not to touch it.

**Twelve modules were built, tested, and never called.** Including the judge
(measured at 25% error catch, 0% false alarms), all eight alert conditions, rate
limiting, and the attribute schemas. Nine are now wired; the rest are documented
decisions, not oversights.

**Three bugs that passing tests could not see:**
- `maxAttempts: 3` produced FOUR calls — the name said attempts, the logic counted retries
- `extractAnswers` required a `category` key, so `{"verdict":"defensible"}` parsed as
  nothing and the judge silently disabled itself whenever it answered concisely
- an empty Issuu revision produced `image.isu.pub//jpg/page_5.jpg` — every Migros crop
  would 404 in the visitor's browser while the pipeline reported a clean run

---

## Component 1 — collection. DONE, verified live.

All seven fetch. Measured 2026-09-10/11:

| | |
|---|---|
| Coop | 980 offers · 19.8s |
| Denner | 291 offers · rich published metadata |
| Volg | 25 offers |
| Spar | 69 offers · 17 pages · **69 flyer crops** |
| Aldi | 144 offers · 40 pages |
| Lidl | 102 offers · 18 loyalty pages (matches original research exactly) |
| Migros | 34 offers · 24 pages · **34 flyer crops** |

**Built this session:** `flyer-fetcher.ts` (PDF download + poppler), `issuu-fetcher.ts`
(Migros page images), `ocr.py` (+ 7 pytest tests), `live-sources.ts` (the composition
root), poppler installed in CI.

**Migros OCR, measured not inherited.** The research said *"2× fixed it, 1.5×+
segfaults"*. Both halves were wrong:
- The segfault is IMAGE SIZE, not upscaling. A 4398×5994 page crashes; a 4398×2158
  strip at the same 2× does not. Tiling gives the upscale without the crash.
- 2× recovers NO additional sale prices (11 vs 11 on page 5). What it recovers is
  `statt 9.-` where 1× reads `statt 9.` — a REFERENCE price. Default is 1×;
  `--tiled` is an explicit trade.

---

## Component 2 — transformation. DONE.

**Model bake-off, all measured on the 291-product Denner benchmark:**

| Model | macro-F1 | accuracy | note |
|---|---|---|---|
| **gemini-3.5-flash-lite** | **0.855** | **94.8%** | SHIPPED as tier 1 |
| gemini-3.5-flash | — | — | **20 requests/DAY** free tier — unusable |
| qwen3.7-flash | 0.887* | 89.2% | *on a harder stratified sample |
| gpt-5-nano | 0.831 | 83.1% | used as the JUDGE, not the classifier |
| mistral-small-24b | 0.518 | 55.4% | my "European = better German" prediction, falsified |

**The ladder:** tier 1 Gemini batched 25 → judge (gpt-5-nano, different lab) →
reflect (Gemini, single item) → human review queue.

**The judge is the escalation trigger, NOT confidence.** Measured: only 5 of 291
scored below 0.9 while 16 were wrong. The model is confidently wrong. The judge
caught 25% of errors with a **0% false-alarm rate** — so a "wrong" verdict is
trustworthy in a way self-reported confidence is not.

**Also built and wired:** guardrails (prompt injection EN+DE, budget), resilience
(rate limits, backoff, circuit breaker), alerts (8 conditions), model registry +
startup probe, cold-start planning, Supabase cache, enrichment (17 attribute
schemas).

**Measured and REJECTED — do not re-add without re-measuring:**
- retrieval few-shot: −2.1pp accuracy, +7 parse failures (D12)
- diverse tier-2 model: every candidate 10+ points worse than tier 1
- repair loop: gemini produced 0 invalid answers across 291 products

---

## Component 3 — storage. DONE.

- **Baseline migration** — 10 tables existed ONLY in the live database. The repo
  could not rebuild it. Captured via the PostgREST descriptor (Docker unavailable);
  the file states plainly what that misses.
- **Offer fields** — `price_basis`, `crop_*`, integer rappen, `attributes` jsonb,
  `storage`, and `category` made NULLABLE with `is_uncertain`.
- Every constraint verified in BOTH directions against the live database.

**Schema surprise worth remembering:** `deals.category` holds the top-level group
(`fresh|long-life|non-food`); the browse category lives in `sub_category`. The names
are the reverse of what they suggest.

**Cutover shadow run says SAFE:**
```
legacy 1,271 → collected 1,616   (+345, +27%)
+5 retailers never previously collected · +103 flyer crops
```

---

## Component 4 — frontend. DONE 2026-09-11.

**Read boundary (earlier):** `Deal` type extended (`isUncertain`, `storage`,
`priceBasis`, `loyaltyProgramme`, `crop`, `attributes`), `SELECT_COLUMNS`
widened, `mapRow` maps them with safe defaults for pre-migration rows.

**All six UI items built:**
- **Crop rendering** — `components/ui/product-image.tsx`. Plain `<img>`, never
  `next/image`: optimising it would fetch the page onto Vercel and serve a
  derived copy from our own domain, which is exactly what Art. 2 Abs. 3bis URG
  forbids. Also, `image.isu.pub` is not in `images.remotePatterns`.
- **Uncertain deals** — "Category unverified" tag on the card, and they no
  longer vote in `scoreStoresForCategory`.
- **Only-at-store** — badge + scope-stating note, `onlyStoreSubCategories`.
- **Member price** — badge naming the programme, on BOTH card variants.
- **Storage facet** — `?storage=` in the URL contract, section in FilterRail
  AND FilterSheet (the rail is `hidden lg:block`; mobile would have had no
  access to it).
- **Attributes** — `lib/deal-attributes.ts`, max 3 facts, primary card only.

**THE CROP GEOMETRY BUG THAT ONLY A BROWSER FOUND.** The arithmetic was right
and the render was wrong. A crop WIDER than the square slot underfills it
vertically, and `overflow: hidden` does not help — it clips what leaves the
slot, not what surrounds the crop. A row-spanning crop rendered THREE ROWS of
other retailers' products inside one card. Fixed with `clip-path: inset(...)`
on the image, whose percentages resolve in the same space as the fractions.
Verified by screenshotting a synthetic 3×4 labelled grid in headless Chrome and
checking each slot showed its own cell. **Do not simplify this back to
`overflow: hidden` — it was already tried and it looked fine in the code.**

## The read domain — `web-next/src/lib/domain/` (added 2026-09-11)

The first cut of component 4 passed its tests and broke the project's own rules.
Written down because the violations are easy to reintroduce and each one looked
reasonable at the time.

| Rule | What was wrong |
|---|---|
| Value objects over primitives | `CropRegion` was a bare record of numbers |
| Invariants in the constructor, never a caller remembering | `cropImageStyle` validated at RENDER time |
| `MemberOnly must name its programme` | A string + a nullable field, so the invalid state was representable |
| Do not duplicate shared types | `StorageState` was validated in three places |
| Domain first, tests first | Implementation was written first |

**`price-basis.ts` is the one to understand.** `priceBasis: string` beside
`loyaltyProgramme: string | null` loses the pairing the database CHECK holds,
so every renderer has to remember it. In practice that meant a fallback branch
announcing *"Loyalty members only"* and naming nobody — precisely the
unlabelled member price Art. 3(1)(e) UWG is about. As a discriminated union the
programme is reachable only through the branch that has one, so
`memberPriceLabel` has no fallback because it has no failing case.

**`mapRow` is now the anti-corruption layer** and is exported and tested
directly (`server/data/map-row.test.ts`, 14 tests). It DROPS a member price that
names no programme — the only row refused outright, because unlabelled is the
UWG problem and relabelling it as open is worse. An unusable crop costs the
image only, never the deal: the price is still right, it is the picture we
cannot place.

**`createCropRegion` caught a real gap.** The render code never checked
`x + width <= 1`, so a rectangle running off the page edge would render the page
edge and whatever sits beside it. The pipeline's `cropRegionImage` had that
check all along; the read side did not.

**`lib/domain/architecture.test.ts` enforces the layering.** Mirrors the
pipeline's version — Biome has no import-boundary rule, and "the domain imports
no infrastructure" in a markdown file is a comment, not an invariant. It was
verified by temporarily adding a Supabase import and watching it fail with the
file, line and reason. **If you add a directory under `lib/domain`, it is
covered automatically; if you rename the directory, the "finds the domain files"
guard fails rather than passing vacuously.**

**Attribute labels are COPIED, not imported.** `lib/deal-attributes.ts` carries
a display-only projection of `shared/attribute-schemas.ts` because web-next
cannot import across the project boundary — Turbopack rejects it under
`cacheComponents`, which is why `lib/v3-types.ts` inlines its types too. Drift
is safe: an unknown attribute id humanises its own key rather than breaking.

---

## Live infrastructure changes made this session

- Migrations **applied** to production Supabase (baseline + classification cache + offer fields)
- GitHub secrets **set**: `GOOGLE_AI_API_KEY`, `OPENROUTER_API_KEY`
- `pipeline.yml`: poppler installed, API keys + `GITHUB_RUN_ID` passed
- `pipeline/archive/migros/` **deleted**, `migros-api-wrapper` uninstalled
  (backup: `/tmp/basketch-archive-backup-20260910`)
- `openrouter-classifier.ts` deleted (backup: `/tmp/basketch-deleted-20260911`)

---

## The D3 breach that was fixed on 2026-09-11 (component 2)

Finishing component 4 turned up a stale workaround, and it is worth knowing why
the obvious reading of it was wrong.

**Uncertain never meant uncategorised.** `createClassification`
(`transformation/domain/classification.ts:82-92`) rejects a missing category, an
unknown category, and a sub-category that does not belong to its parent. Every
product that reaches the write HAS a name and a category. `isUncertain` is a
LABEL-visibility flag on a product that has a perfectly good one.

**The deals were being dropped in the bridge, not the frontend.**
`classify-deals.ts` gated on `status === 'classified'`, so judge-disputed
outcomes — which DO carry a validated classification
(`classify-graph.ts:231/239/251`) — fell through and were counted and discarded.
The comment above it said this was temporary "until component 3 makes `category`
nullable and adds `is_uncertain`". Component 3 did that on 2026-09-10. The
blocker had expired; the workaround had not.

**Three things changed:**
1. Judge-disputed deals are published with their category and `is_uncertain`.
2. A judge dispute now sets `isUncertain` regardless of confidence
   (`markUncertain`). Confidence alone could not do this job — 5 of 291 scored
   below 0.9 while 16 were wrong. The judge's 0% false-alarm rate is what earns
   the override.
3. `stats.uncertain` (published, flagged) is now split from `stats.heldBack`
   (no classification exists — deferred, rejected, provider down). Conflating
   them is how a silent drop looked accounted for.

**Enriched attributes were also being dropped.** They were computed, written to
the classification cache, and then never attached to the deal — the `attributes`
column was `'{}'` on every row. `toDeal` now carries them, and lifts `storage`
onto its own column for the Frozen facet.

## 2026-09-12 — the cold start, and seven silent failures

The cutover took two days not because anything was hard, but because seven
separate defects all had the same shape: **an operation reported success while
doing nothing**. Each was found by accident, hours apart.

| # | Defect | How it presented |
|---|---|---|
| 1 | Cache saved once at the very end | `cache: 0/1650 hits` on every retry |
| 2 | Sweep keyed on fetch success, not write success | would have emptied the site |
| 3 | Browse category written to `deals.category` | `Upserted 0 of 922` |
| 4 | Enrichment keyed on the raw name, storage writes the normalised one | `enriched 1618/1620` with zero rows changed |
| 5 | Sweep fed an intent count | 2 Migros rows licensed deleting 168 |
| 6 | A per-MINUTE rate limit read as a per-DAY cap | runs abandoned 7 of 8 chunks |
| 7 | Duplicate `cache_key` in one upsert → Postgres 21000 | whole 100-row statement rejected |

**#6 and #7 were the cold start.** Fixing the rate-limit misclassification took
a run from 42 products to 799. Fixing the duplicate key took persistence yield
from 34% (and 0% after stable ordering) to 100% — `cached 97 of 97` on every
chunk. Cache went 446 → 1,214 in one run.

**Three fixes of mine caused two of the defects.** Raising `ERROR_BODY_CHARS`
200 → 2000 (needed to recover Google's `retryDelay`) is what let a stray
"PerDay" string into the text being matched, creating #6. Wiring
`orderForColdStart` put identical names in the same chunk, converting #7 from
latent to certain. Both were correct fixes that armed the next defect.

**Three separate instances of coverage theatre**, all passing while the bug was
live: a test asserting `category === 'dairy'` (the defect itself, #3); a
`retryDelay` test using a hand-written string that passes at 200 chars; and a
test named *"produces a key both halves agree on"* that compared `naturalKey`
against itself while #4 was in production. `createInMemoryCache` is a Map keyed
on `cacheKey`, which silently absorbed duplicates — that is why the whole suite
missed #7.

**`basketch.vercel.app` was pinned to a deployment from 139 days ago.** Vercel
called each new build "production" while the domain pointed elsewhere, so every
deploy landed on a URL nobody was looking at. It was never a project domain,
just a hand-made deployment alias. Now added properly, so it auto-follows.

### Standing rules that came out of this
- **`deals.category` takes the TOP-LEVEL group**, never the browse category.
  `topCategoryFor` in shared/types.ts. The column names are the reverse of what
  they suggest.
- **Anything matching a row BY NAME must use `normalizeProductName`** — it is
  part of the upsert key. One definition, in the shared kernel.
- **Never allowlist a pattern granting arbitrary code execution** in
  `.claude/settings.json`.
- **Do not bump `taxonomyVersion`/`promptVersion`/`schemaVersion`** until the
  cold start finishes — any bump discards every cached row.

## NEXT STEPS, in order

1. **Set `COLLECTION_MODE=shadow`** as a repo variable, let one scheduled run
   produce the comparison table in the Actions log, then flip to `live`.
   Default is `off`, so the five new retailers do not appear until you do.
2. Delete `categorize.ts` + `shared/category-rules.ts` (D4). Blocked by
   `resolve-taxonomy.ts`; clears the 3 red tests.
3. LangSmith — needs a `LANGSMITH_API_KEY`; the only thing never started.
4. **Tighten the only-at-store claim** once the `concept` layer is populated.
   Today it is scoped to the SUB-CATEGORY, because `products` are resolved per
   store (`product-resolve.ts` filters `.eq('store', store)`) so there is no
   cross-store identity to compare. Swap the grouping key in
   `onlyStoreSubCategories` from `subCategory` to the concept id and tighten
   the copy; nothing else has to change. **Do not match on product names** —
   "M-Classic Vollmilch" and "Coop Naturaplan Milch" never match, so nearly
   every deal would wrongly claim "only at", which is the exhaustiveness claim
   Art. 3(1)(e) UWG forbids.

## Still nobody's verified

**Nothing has run end-to-end in CI.** Everything is verified locally against live
data. The next scheduled run is the real test, and it will be a COLD START —
empty cache, capped at 800 products, the rest deferred.

**No component-4 surface has been seen against real rows.** Tests, `tsc` and
`next build` all pass, and the crop geometry plus the assembled card were
screenshotted in headless Chrome — but against a synthetic grid, not a real
flyer. Until a run writes `page_image_url`, `is_uncertain`, `storage` and
`attributes`, every one of those code paths renders its empty state on the live
site. First thing to check after the first live run:
- a Spar/Aldi/Migros card actually shows its product, not a slice of its neighbour
- `WHERE is_uncertain` is non-empty and those deals appear with the tag
- the Storage facet counts are not all zero (they will be if enrich ran without
  a `GOOGLE_AI_API_KEY`)

---

## Things that will bite if forgotten

**A Google API key was exposed and revoked.** An early key (`AQ.Ab8RN6…`) was
pasted into the chat and is therefore in that transcript permanently. It was
deleted in AI Studio and a fresh one created. **Keep the old one revoked.** The
current key and the OpenRouter key were never typed into the chat — they were
read from `.env` by variable name and piped to `gh secret set` via stdin.

**Migros OCR needs Python deps that were declared nowhere.** Fixed on 2026-09-11:
`pipeline/collection/infrastructure/migros/requirements.txt` now exists and the
workflow installs it with an import check. Locally, point `MIGROS_OCR_PYTHON` at
a venv that has them, or the Migros source fails with
*"rapidocr-onnxruntime not installed"* while every other retailer succeeds.

**The taxonomy grew a lot.** 11 → **22 browse categories**, 23 → **76
sub-categories**, driven by Migros' and Coop's own shop navigation (supplied as
screenshots; both sites 403 automated clients). Added: `pet-supplies`,
`household-appliances`, `alcohol` (split from `drinks` — age-restricted stock
with separate Swiss advertising rules), `home-kitchen`, `kiosk`, and six
general-merchandise categories. Six ambiguous sub-category names were renamed
(`sports` → `sports-equipment`, etc.) after the model read `sports` as *sports
drink* and a correct answer was rejected as invalid.

**Tobacco is classified but never published (D10).** The Swiss
Tabakproduktegesetz restricts tobacco advertising where minors can see it, and
basketch is public and un-gated. `kiosk/tobacco` exists so nothing resolves to
"Other", and `NON_PUBLISHABLE_SUB_CATEGORIES` in `shared/types.ts` stops it
reaching the site. **One list, one place — do not scatter this rule.**

**`CLAUDE.md` was stale in three places**, now corrected: `shared/` DOES have a
package.json and its own test suite (which no CI job runs — that is why 12 tests
were failing unnoticed); the `@shared/*` path alias type-checks but FAILS at
runtime under tsx/vitest, so use relative imports; the testing-commands section
omitted `shared` entirely.

**The benchmark lives at**
`pipeline/transformation/__benchmark__/denner-2026-W37.json` — 291 products, 251
labelled by Denner, 40 hand-labelled and tagged `derived` so the two are never
mixed. **Standing rule: the answer key does NOT change because a model disagreed
with it.** It changes only when a label is wrong on its own terms. If `derived`
ever exceeds 20% of rows, the benchmark stops being credible.

---

## Key documents

- `docs/component-2-decisions.md` — 12 numbered decisions with reasoning, including where the PM overruled me and was right
- `docs/component-2-agent-design.md` — trust hierarchy, agent graph, cache, observability
- `docs/adr-001-category-regroup.md` — storage as a facet; why Migros/Coop taxonomies were adopted
- `docs/component-1-integration-gaps.md` — why "done" was not done

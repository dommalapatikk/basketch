# Component 2 — Decision record

**Date:** 2026-09-10
**Method:** structured grilling session, decisions made by the user (PM/owner).
**Companion:** `docs/component-2-agent-design.md` — the design these decisions constrain.

Every decision below is binding on downstream work. Where a recommendation was **overruled**,
that is recorded with the reasoning, because the reasoning is usually the more valuable artefact.

---

## D1 — Nothing may be classified as "Other"

**Decision.** Every product gets a real category and its metadata fields. `Sonstiges` / `Other` is
not an acceptable output.

**Consequences.**
- The 47 Denner `Sonstiges` items get hand-written labels for the benchmark, tagged `derived` so
  they are never confused with Denner's own labels. Both scores reported separately.
- The taxonomy must cover **everything a supermarket sells**, or D1 is impossible the first time
  Lidl sells a drill. This is what forced D8.

---

## D2 — Wine vintage comes from the structured `year` field

**Decision.** Where Denner's `year` field and its `nameSubline` disagree, `year` wins.

**Evidence — this was settled with data, not opinion.** 7 of 26 wines conflict. Fetching all three
sampled product pages from denner.ch:

| | occurrences on page | context |
|---|---|---|
| `year` field value | 10–13× | product metadata, `og:image` |
| subline vintage | 1–5× | review `datePublished`, JS bundle offsets — coincidental |

**Overruled recommendation.** I proposed showing no vintage for conflicting wines. The user
rejected it: vintage is a real product differentiator (the same wine at 10 and 15 years old is not
the same product), so the field must be resolved, not dropped. Verification proved the conflict is
resolvable, so nothing is lost.

---

## D3 — An uncertain product is never dropped

**Decision.** The model must place every product. Products are not deleted for low confidence.

**What this replaces.** `run.ts:169` currently drops everything below
`MIN_TAXONOMY_CONFIDENCE = 0.3`, silently. That policy is retired — it is *how the tomato-purée bug
survived*: nothing was ever visibly unsure, so nothing was ever reviewed.

**Retained.** `is_uncertain` still flags low-confidence rows for a review queue. It controls
visibility of the *label*, never of the *offer*.

---

## D4 — Delete the keyword categoriser outright, no shadow run

**Decision.** `pipeline/categorize.ts` and `shared/category-rules.ts` are deleted at cutover.

**Reasoning (user's).** The old matcher is known-wrong, so disagreements between it and the model
are mostly the old code being wrong. Low signal, not worth the parallel-run machinery.

**Overruled recommendation.** I proposed a two-cycle shadow run.

---

## D5 — Pet food and appliances stay

**Decision.** Purina cat food and the Bosch Tassimo machine are kept, not filtered out.

**Overruled recommendation.** I proposed dropping appliances as one-off durables. The user's
position: cat food is food for a pet, an appliance is an appliance — both are legitimate
supermarket offers, and neither is a reason to discard a deal.

**Consequence.** Required new categories (D8) — the 11-category taxonomy had no home for either.
The only `pet` in the codebase was PET *plastic*, a bottle material.

---

## D6 — Google AI Studio key first

**Decision.** The user provides a free Google AI Studio key. No card, no other provider yet.

**Reasoning.** Free tier is 500 req/day; batched at 25 products per call the entire month is ~240
requests. It can staff both ladder rungs (Flash-Lite → Flash). OpenAI or OpenRouter get added only
if the bake-off produces a number showing Google losing.

---

## D7 — Every offer is kept; comparability is not a filter

**Decision.** No offer is discarded for lacking a competitor. `grocery-filter.ts` retires.

**Overruled recommendation — and this one I got materially wrong.** I proposed dropping offers with
no cross-store equivalent. The user's counter: if Coop is the only store discounting 1.5 L milk,
that is not an orphan — **that is basketch working perfectly.** Coop *is* the cheapest store for
milk that week. I had conflated *"no other store sells it"* with *"no other store has it on sale"*,
which are opposite situations. The filter would have deleted the single most useful result on the
site.

Same logic extends to a Lidl-exclusive pyjama: a deal with no rival is still a deal.

**Also found.** The brand blocklist matched **0 of 40** products in the current Lidl fixture — it
keys on brand names (`parkside`, `livergy`) that this week's non-food items don't carry. Meanwhile
Lidl publishes a reliable `categoryPrimary: Food | Non Food` flag we ignore.

---

## D8 — 19 categories in 3 family groups, with storage as an attribute

**Decision.** Three top-level groups by **product family**; storage state becomes a **cross-cutting
attribute**, not a group.

```
FOOD & DRINKS          NON-FOOD              GENERAL MERCHANDISE
 fruits-vegetables      home                  clothing-textiles
 meat-fish              beauty-hygiene        garden-plants
 dairy                  pet-supplies     NEW  diy-tools
 bakery                 appliances       NEW  toys-games
 snacks-sweets                                baby-kids
 pasta-rice-cereals                           stationery-media
 drinks
 ready-meals                                  storage: fresh | chilled
 pantry-canned                                       | frozen | ambient
```

**Why storage is an attribute, not a category — the ice-cream problem.** The old grouping stacked
two different axes: `fresh / long-life` is a *storage* axis, while `dairy / snacks-sweets` is a
*product-family* axis. It holds until ice cream, which is a sweet (family) that is frozen
(storage), and "Long-life" is simply the wrong word for it.

```
Ice cream       snacks-sweets / ice-cream        storage=frozen
Frozen peas     fruits-vegetables / vegetables   storage=frozen
Frozen mango    fruits-vegetables / fruit        storage=frozen
Frozen pizza    ready-meals / pizza              storage=frozen
Fish fingers    meat-fish / fish                 storage=frozen
Butter          dairy / dairy                    storage=chilled
Chocolate       snacks-sweets / chocolate        storage=ambient
```

"Cheapest mango" now finds fresh **and** frozen. The shopper can still browse a frozen aisle,
because `storage` is filterable.

`ready-meals-frozen` becomes `ready-meals`; the frozen half moves to the attribute.

**Butter** is `dairy / dairy`, `dairyType=butter`, `salted=true|false`. The `salted` field exists
because `Butter gesalzen` and `ungesalzen` are different products at different prices.

**Overruled recommendation.** I argued for keeping four groups to preserve the existing
Fresh/Long-life filter rail. The user's original three-group instinct was correct.

**Cost, stated plainly.** `FilterRail.tsx`, `TypeSegmented.tsx`, `lib/filters.ts`,
`lib/store-tokens.ts` and `lib/category-rules.ts` all hardcode `fresh | longlife | household`.
This is a frontend refactor, not a constants edit.

---

## D9 — Lone offers carry a store-named badge

**Decision.** Badge: **"Only at Coop this week"**, sub-text: *"No other store we track has this on
offer."*

**Reasoning.** UWG Art. 3(1)(e) forbids implying exhaustiveness. "Only offer this week" reads as
*nowhere in Switzerland*, which we cannot know across seven retailers. Naming the store makes the
badge informative rather than apologetic; *"we track"* keeps it accurate without sounding defensive.

We never show non-promoted prices, so no comparison is invented.

**Already present.** `web-next/src/server/verdict/algorithm.ts` has a `single-store` state at
category level. This extends the same concept to product level.

---

## D10 — Tobacco is classified but never published

**Decision.** Coop's `Kiosk` shelf is adopted (gift cards, prepaid credit, cut flowers, waste bags,
tobacco), but **tobacco offers are never served to the site.**

**Reasoning.** The Swiss Tabakproduktegesetz restricts tobacco advertising, particularly where minors
can see it. basketch is public, un-gated and login-free, so a page of discounted cigarettes is
arguably tobacco advertising.

**Implementation — classify honestly, publish selectively:**

```
collected      →  the offer exists, the pipeline stays honest about what it saw
classified     →  'kiosk / tobacco'  — D1 holds, nothing resolves to "Other"
published      →  NEVER — blocked by NON_PUBLISHABLE_SUB_CATEGORIES
```

`shared/types.ts` → `NON_PUBLISHABLE_SUB_CATEGORIES` + `isPublishable()`. One list, one place,
auditable. Deliberately *not* a collection-time filter and *not* a missing category — either would
hide the constraint inside unrelated logic.

Note this is not a category removal. Per the PM's standing instruction the taxonomy is additive
only; this is a publication rule layered on top.

---

## D11 — Migros and Coop are the reference taxonomies

**Decision.** The taxonomy follows Migros' and Coop's own shop navigation rather than one invented
here. Supplied by the PM as screenshots on 2026-09-10 (both sites return 403 to automated clients).

**What changed as a result:**

| Change | Source |
|---|---|
| `alcohol` split from `drinks` | Both. Age-restricted stock with its own Swiss advertising rules. |
| `home-kitchen` added | Migros `Home & kitchen`; Coop `Household & Kitchen` |
| `beauty-hygiene` expanded from **1** sub-category to **9** | Coop's `Cosmetics & Health` shelf — hair, dental, facial, body, make-up, men's, feminine, health & well-being |
| `catering` added | Coop `Food ▸ Catering` |
| `formula` split from `baby-food` | Coop `Baby & Child ▸ Powder Formula` |
| `kiosk` added | Coop `Kiosk` |

**The decisive insight — navigation ≠ data model.** Migros keeps `Frozen food` as a category. So
does Coop. So does Open Food Facts. All three also present `Specific diets` — gluten-free, vegan,
organic — as a category, when those are plainly attributes.

They are not being sloppy. **They are shops; basketch is a comparison tool.** Shoppers expect a
frozen aisle; comparison needs frozen mango beside fresh mango. Both are right for their own job, so
we do both:

```
DATA MODEL   storage = frozen | chilled | fresh | ambient   → "cheapest mango" spans both
NAVIGATION   "Frozen food" tile      = a saved filter over storage=frozen
             "Specific diets" tile   = a saved filter over the diet attributes
```

A browse tile is a **pre-set filter**, not a category. Three independent retailers converging on the
same pattern is strong evidence it is correct.

**Deliberate deviations:** we keep `diy-tools` (Migros does not sell tools — that is Do it + Garden
— but Lidl and Aldi do, and we cover them), and we keep `pasta-rice-cereals` separate from
`pantry-canned` where Migros merges them, because pasta and tinned tomatoes are not substitutes.

---

## ⚠️ Finding — the `shared` test suite runs in no CI job

`shared/` has its own `package.json` and its own vitest suite (`types.test.ts`,
`category-rules.test.ts`), but **neither `pipeline` nor `web-next` includes it**, and `CLAUDE.md`
§Testing Commands does not list it. It had **12 failing tests before any work today** — nobody was
running it.

CLAUDE.md also states `shared/` has *no* package.json. It does. The doc is stale.

**Remaining failures — 3, all pre-existing, all in `category-rules.test.ts`:**

| Test | Meaning |
|---|---|
| `"Nespresso Kapseln"` → got `coffee`, expected `coffee-tea` | the keyword matcher is wrong |
| `"Rivella Rot 6x1.5L"` → got `soft-drinks`, expected `drinks` | the keyword matcher is wrong |
| `covers all 23 sub-categories` | keyword rules never covered the taxonomy |

These are live evidence of the defect D4 deletes, and they disappear with
`shared/category-rules.ts`. Left red deliberately until then.

**Action:** add `shared` to CI and to CLAUDE.md's testing commands.

---

## D12 — Retrieval few-shot: MEASURED AND REJECTED

**Decision.** The classifier prompt does **not** include examples retrieved from the cache.

**Measured 2026-09-10**, leave-one-out on all 291 benchmark products — each product's
neighbours drawn from the other 290, so nothing leaked its own answer:

| | macro-F1 | accuracy | parse failures |
|---|---|---|---|
| without few-shot | **0.840** | **94.2%** | **0** |
| with few-shot | 0.830 | 92.1% | 7 |

The macro-F1 delta sits inside the noise floor, but **-2.1pp accuracy and seven parse failures
do not.** Roughly 600 extra tokens per batch made the model both less accurate and less reliable
at producing well-formed output.

**Why it likely hurt.** The model already knows what chocolate is. The examples added length and
distraction without adding information. Retrieval few-shot pays off when a task depends on
*house conventions* the model cannot infer; grocery categorisation mostly does not.

**What is kept.** `transformation/domain/similar-products.ts` and its 20 tests remain, and the
`examplesFor` hook stays on the Gemini adapter — both are inert unless wired. The module may yet
earn its place in the **enrich** step, where house conventions genuinely do apply (which
sub-category schema, which attribute vocabulary). That would need its own measurement.

**Do not re-enable without re-measuring.** This is the third pattern measured and rejected today,
after a diverse tier-2 model and Mistral-for-German.

---

## Still open

| # | Question | Blocked on |
|---|---|---|
| A | Which model at tier 1 and tier 2 | the bake-off (needs D6 key) |
| B | Confidence method — self-reported vs disagreement | calibration measured against the benchmark |
| C | Second answer key for `pantry-canned` / `pasta-rice-cereals` | whether D1 hand-labelling gives enough coverage |
| D | Base `deals` table is absent from `supabase/migrations/` — a fresh DB cannot be rebuilt | unrelated, pre-existing |

---

## Already built under these decisions

| Date | Change | Tests |
|---|---|---|
| 2026-09-10 | `SourceAttributes` value object; `Offer.sourceAttributes` | 25 |
| 2026-09-10 | Denner `parseContentSize` + `mapSourceAttributes` — 100% descriptor/unit-price/pack-size recovery on 291 live offers | 16 |
| 2026-09-10 | Lidl `decodeEntities` + `lidlSourceAttributes` — 100% descriptor recovery, 0 entities left | 9 |
| 2026-09-10 | `pet-supplies` + `household-appliances` added to `BROWSE_CATEGORIES` | — |
| 2026-09-10 | Volg section-title capture — **withdrawn**, titles are promo buckets not categories | — |

**Totals:** pipeline 547 passing, web-next 33 passing, `tsc` clean on both.

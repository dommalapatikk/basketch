# Component 2 — Transformation (clean, label, enrich)

**Written:** 2026-09-09, as a handoff before `/clear`.
**Read first:** `docs/collection-module-design.md`, then `docs/data-source-research-2026-09-07.md`.
**Branch:** `feat/collection-module` (not merged to main).

---

## Where the project actually is

Three components. Only the first is built.

```
[1] COLLECTION            [2] TRANSFORMATION          [3] STORAGE
    ✅ BUILT                  ❌ THIS BRIEF                ⚠️ old
    pipeline/collection/      loose files in pipeline/     store.ts, v3-cutover.ts
    emits Offer               expects UnifiedDeal          writes UnifiedDeal shapes
                        ↑
                THEY DO NOT CONNECT YET
```

**Component 1 is done:** 7 of 7 retailers, 252 tests, `tsc` clean.

| Store | Route | Live yield |
|---|---|---|
| Coop | aktionis listing pages | **924** |
| Denner | own JSON API (only source with real categories) | **244** |
| Aldi | Publitas catalogue PDF | **144** |
| Spar | iPaper flyer PDF | **69** |
| Volg | own HTML | **25** |
| Lidl | flyer JSON + PDF loyalty cross-check | verified subset |
| Migros | Issuu JPEGs + free OCR | partial, noisy names |

> ⚠️ **Nothing runs on a schedule.** `run.ts` does not import `collection/`, and `pipeline.yml` still runs the old Python scrapers. The live site is still served by the old pipeline with `sourceCategory = None` hardcoded — **the tomato-purée bug is still in production.**

---

## What component 2 is

Everything between a collected `Offer` and a storable, labelled product.

Each piece already exists as a **flat file** in `pipeline/`, working on the old `UnifiedDeal`:

| Job | Existing file | Verdict |
|---|---|---|
| Clean names | `normalizeProductName` in `run.ts` | Reuse |
| Grocery filter | `grocery-filter.ts` | Reuse |
| Metadata: brand, quantity, organic | `product-metadata.ts` | Reuse |
| Format dimensions | `format-extract.ts` | Reuse |
| **Label: category + sub-category** | `categorize.ts` | **REPLACE — this is the bug** |
| Taxonomy aliases | `resolve-taxonomy.ts` | Review |
| Product identity | `product-resolve.ts`, `product-group-assign.ts` | Reuse |

### Why `categorize.ts` must be replaced, not patched

Its three tiers are brand → **source category** → keyword fallback. Tier 2 was dead because the old scraper hardcoded `sourceCategory = None`.

**It is now dead by design.** Component 1 deliberately sets `sourceCategory: null` for six of seven retailers, because passing a third party's labels (aktionis') off as the retailer's own would misrepresent provenance. **Only Denner supplies genuine retailer categories.**

So the keyword matcher would now be *more* wrong than before. The model replaces it.

### Target structure — mirror component 1

```
transformation/
  domain/          Category, SubCategory, Classification, Confidence, Brand, Quantity
                   → invariants: what makes a classification valid/publishable
  application/     the pipeline: clean → filter → extract → classify → resolve
  infrastructure/  the classifier adapter(s) + the Denner-scored accuracy gate
```

Same rules as component 1: domain imports no infrastructure; the classifier sits behind a port so it can be swapped; nothing throws; empty is never success.

---

## THE OPEN QUESTION — which model classifies?

The user wants component 2 to have **its own agent**, using **cheap** models. Names raised: *"OpenCloud"* (probably **OpenRouter**), *"Kim"* (probably **Kimi / Moonshot**), or any cheapest-tier provider.

**This reverses an earlier decision** and that is fine, but note it explicitly:
`feedback_basketch_zero_paid_services` says free tiers only, and we previously chose **`intfloat/multilingual-e5-small`** — 118M params, ~470MB, MIT, CPU-only, free on a GitHub Actions runner. The user is now open to paying a little.

### The volume maths — do this first, it reframes everything

- ~**1,400 offers/week** → ~6,000/month
- Per item: product name (~15 tok) + prompt with the category list (~200 tok) + output (~10 tok) ≈ **250 tokens**
- **≈ 1.5M tokens/month**

At typical cheap-tier input pricing, that is **cents per month, not francs.** Even a comparatively expensive small model stays around CHF 1–2/month.

> **Do not quote model prices from memory.** Pricing changes constantly and my knowledge has a cutoff. **Verify current per-token pricing from each provider's own pricing page before recommending.**

### Candidates to evaluate

| Route | Why it is interesting | What to check |
|---|---|---|
| **Local `multilingual-e5-small`** | CHF 0. No key, no network, no rate limit. Runs in Actions. | Accuracy on Swiss German product names vs an LLM |
| **OpenRouter** | One key, many models, easy A/B between them | Current cheapest models that handle German; rate limits |
| **Kimi / Moonshot** | User asked for it by name | Pricing, German quality, EU/CH latency, availability |
| **Gemini Flash / GPT-4o-mini / DeepSeek / Groq** | Standard cheap tiers | Pricing, structured-output support, throughput |

### What actually decides it — accuracy, not price

At these volumes price is nearly irrelevant, so choose on **measured accuracy**.

**We already have a free, honest benchmark: Denner.** It is the only retailer publishing its own categories (`Fleisch/Wurst/Fisch`, `Milch/Käse/Eier`, `Brot/Backwaren`…). So:

1. Take the **244 live Denner offers** with their real categories
2. Classify them **blind** with each candidate model
3. Score against Denner's own labels
4. **Also score `e5-small`** — if free is within a few points, free wins

That gives a real number per model for a few cents of testing, and it becomes a permanent regression gate: every pipeline run can re-score itself against Denner and report accuracy in telemetry.

### Non-negotiables for whichever model wins

- **Must handle German** (plus French/Italian later). Swiss product names are the whole input.
- Must run from **GitHub Actions** with a key in secrets and a **hard spend cap**.
- Must return a **category from our fixed taxonomy** (`shared/types.ts` → `BROWSE_CATEGORIES`), never free text.
- Must be **behind a port**, so swapping providers is one adapter.
- **Low confidence must be representable** — `MIN_TAXONOMY_CONFIDENCE` exists for a reason. An uncertain classification should be visible, not silently confident.
- Cache by product name: the same products recur weekly, so a cache cuts the bill and the latency to near zero.

---

## Also open

**Component 3 needs a DB migration** (the user approved `Offer` replacing `UnifiedDeal` outright). The `deals` table has no column for:
- `price_basis` — the Lidl Plus flag. Without it, the LIDL rule is enforced then discarded on write.
- `crop_region` — `{pageImageUrl, x, y, w, h}` for Spar/Aldi/Migros images. Without it, every flyer crop is lost.
- Money as integer rappen (table stores decimals).

**Finding worth acting on eventually:** the base `deals` table is **not in `supabase/migrations/`** — all six files there are incremental additions. A fresh database cannot be rebuilt from this repo. Capture the current schema as a baseline migration.

**Migros:** name extraction is noisy at native OCR resolution. A 2× upscale fixed it in testing (it recovered `9.90` correctly) but 1.5×+ segfaults the ONNX runtime locally despite ~10 GB free. **Re-test upscaling on the CI runner.**

**Lidl:** the page-level loyalty check discards roughly half its offers. Per-product detection would need `pdftotext -bbox`, which crashes on that PDF.

---

## How to resume after `/clear`

Say: **"read docs/component-2-transformation-brief.md and continue"**

Then the first task is the model bake-off:
1. Verify current pricing from each provider's own page — do not trust remembered figures
2. Pull the 244 Denner offers with their real categories as the benchmark set
3. Score each candidate, including free `e5-small`, blind against Denner's labels
4. Report accuracy and real monthly cost per option, then let the user choose

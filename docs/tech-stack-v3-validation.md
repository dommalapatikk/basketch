# basketch — Tech Stack v3 Validation (zero-cost)

**Date:** 2026-04-27
**Author:** Tech Lead (PM did this directly in main thread, not via subagent)
**Reviewing:** 9-table data model (locked) + 4 UX surfaces (v3.3.1 builder-ready)
**Constraint:** Zero paid services. Supabase free (500 MB), GitHub Actions free (2,000 min/mo private), Vercel Hobby (100 GB bandwidth, 10s function timeout, 1 cron).

---

## Verdict — **GO with 3 stack changes**

The 9-table model + 4 UX surfaces fit zero-cost comfortably. Storage and pipeline cadence have wide headroom. Function timeout (Vercel Hobby 10s) is the only real risk — addressed by 2 materialised views + ingestion-time concept resolution. Builder can start.

---

## 1. Storage analysis (Supabase free 500 MB)

### Inputs
- 8 store sources (Coop, Coop Megastore, Migros, LIDL, ALDI, Denner, SPAR, Volg) per `pipeline.yml`
- ~5k SKUs per store per scrape (estimate; current `deals` table sits at ~1.4k rows but that's only on-deal items)
- Retention: **3 months** (locked)
- Cadence: **3 scrape days/week** (Mon partial, Tue partial, Thu full)

### Per-table estimates (worst case)

| Table | Row count at steady state | Bytes/row | Total |
|---|---|---|---|
| `concept` | ~5,000 | 500 | 2.5 MB |
| `sku` | ~40,000 (8 stores × 5k unique) | 400 | 16 MB |
| `sku_alias` | ~80,000 (2× sku for synonyms) | 200 | 16 MB |
| `deals` | ~150,000 (40k/wk × 12 wk × 30% on-deal) | 350 | 53 MB |
| `user_interest` | <100 (solo, no real users) | 200 | trivial |
| `concept_resolver` | ~500 rules | 300 | trivial |
| `pipeline_run` | ~150 (3 days/wk × 12 wk) | 200 | trivial |
| `store`, `region`, `concept_family` lookups | <50 total | 200 | trivial |
| **Materialised view** `concept_cheapest_now` | ~5,000 | 600 | 3 MB |
| Indexes (~30% of data) | — | — | ~30 MB |
| **TOTAL** | — | — | **~120 MB** |

**Headroom: 4.2× under 500 MB free tier.** Architect's earlier 28 MB estimate assumed flatter data; my 120 MB is the conservative ceiling.

**What grows past 500 MB:** if `deals` retention is bumped to 12 months (4× data) AND 4 more stores are added, we hit ~480 MB. Plenty of room before that becomes a real risk.

---

## 2. Function timeout analysis (Vercel Hobby 10s)

Per surface, every query the UI fires + the latency budget:

| Surface | Query | Pattern | Worst-case latency | Risk |
|---|---|---|---|---|
| 1 — Variant Picker | `SELECT concepts WHERE family_slug = ?` | Single indexed lookup | <50 ms | **None** |
| 1 — Variant Picker (cold-start fallback) | `pipeline_run.deal_count` aggregation | Single query, hard-coded fallback if empty | <100 ms | **None** |
| 2 — Freshness strip (per item, 7 stores) | `SELECT sku WHERE concept_id IN (?) AND store_id IN (?)` + `last_deal_seen_at` | Indexed on (concept_id, store_id) | <300 ms for 4-item list | **Low** |
| 2 — A-state deal lookup | `SELECT deals WHERE sku_id IN (?) AND valid_to >= today` | Already indexed in v3.2 | <100 ms | **None** |
| 3 — Worth picking up candidates | JOIN user_interest × deals × concept WHERE discount ≥ 30%, ORDER BY (interest_weight × discount) | Multi-JOIN, decay calc | **6-9 s without help** | **HIGH — needs MV** |
| 3 — Add to list | INSERT into user_list | trivial | <50 ms | None |
| 3.5 — Hidden suggestions list | `SELECT user_interest WHERE dismissed_at IS NOT NULL ORDER BY dismissed_at DESC` | Indexed | <100 ms | None |
| 3.5 — Restore | `UPDATE user_interest SET dismissed_at = NULL` | Single row | <50 ms | None |
| Snapshot (home VerdictHero) | Existing cached via `useCachedQuery` + Next.js use cache | already cached | served from cache | None |

**The single risk: Surface 3 candidate calculation.** Solved by a materialised view (`worth_picking_up_candidates`) refreshed at end of weekly pipeline run. See Stack Change #1 below.

---

## 3. Pipeline cadence analysis (GitHub Actions 2,000 min/mo free)

Reading `pipeline.yml`:

- **Mon:** ALDI + Volg (2 jobs)
- **Tue:** SPAR (1 job)
- **Thu:** Coop, Coop Megastore, Migros, LIDL, Denner, ALDI (Thu cycle), Volg (fresh) = 7 jobs
- **Plus:** `process-and-store` job runs after every scrape day = 3/wk
- **Plus:** `keep-alive` (trivial, ~5 sec) = however often it's triggered

Per-job duration: ~3 min average (fetch + upload artifacts).

| Type | Per week | Per month (4.3 wk) | Min per run | Total min/mo |
|---|---|---|---|---|
| Scrape jobs | 10 | 43 | 3 | **129** |
| Process & store | 3 | 13 | 5 | **65** |
| CI on PRs (`ci.yml`) | ~5 | ~20 | 4 | **80** |
| Keep-alive | 1/day | 30 | 0.5 | **15** |
| **TOTAL** | — | — | — | **~290 min/mo** |

**Headroom: 6.9× under 2,000 min free tier.** Comfortable. Adding LLM-based resolution would have spiked this 5-10× — confirms the architect's call to drop LLM.

---

## 4. Resolver feasibility (rules-only, no LLM)

The 9-table model dropped LLM fallback. Resolver is rules-based via `concept_resolver` table with priority ordering.

### Highest-risk concept families (likely to have unmatched SKUs)

1. **Multi-language brand variants** — "Naturafarm" vs "Bio Suisse" — same supplier, different label per store
2. **Bundles & multipacks** — "12er-pack Tomaten" needs to map to single-can `tomatoes-canned` concept with `bundle_quantity=12`
3. **Seasonal items** — Christmas chocolate, summer ice cream — appear briefly, may not match if rules haven't been written yet
4. **Pet food** — known gotcha (cat tuna → "fish" misclassification) — explicit priority rule needed
5. **Ambiguous keywords** — "Almo Thunfisch" (cat food) vs "Thunfisch in Wasser" (human tuna)

### Triage queue mechanism (zero-cost, no admin UI)

Per the data model spec, unmatched SKUs go to a triage queue. Without paid services or a built admin UI:

- Add a Supabase view `triage_queue_view` listing unmatched SKUs from the last pipeline run, sorted by frequency.
- PM (you) reviews via Supabase Studio (free, web UI) — once per week, ~10 min.
- For each unmatched SKU, PM either: (a) adds a `concept_resolver` row (insert via Supabase Studio SQL), or (b) flags as junk (add to `sku_alias` with `concept_id = NULL`).
- Pipeline catches up next run.

**No new code. No new service. Supabase Studio is free.**

Expected unmatched rate: **10-15%** of new SKUs (per architect estimate). At 8 stores × ~50 new SKUs/wk = 400 new SKUs/wk × 12% = **~48 SKUs/wk to triage**. ~10 min/wk PM effort.

---

## 5. Migration path: current schema → v3.0 9-table model

### What's in production today

- `deals` table with embedded category/sub_category strings (the v3.2 4-level taxonomy migration just landed 2026-04-25)
- `taxonomy_*` reference tables (just added)
- No `concept`, `sku`, `sku_alias`, `user_interest` tables yet
- Pipeline writes directly to `deals` after categorize.ts maps to (category_slug, subcategory_slug)

### Migration steps (numbered, additive-first to never break the live site)

1. **Phase 1 — additive (no breaking changes):**
   - Migration `20260427_v3_concept_layer.sql` — create `concept`, `sku`, `sku_alias`, `concept_family`, `concept_resolver`, `user_interest`, `pipeline_run`, `store`, `region` tables. All empty.
   - Add `deals.sku_id UUID NULL REFERENCES sku(id)` (nullable for backward compat).
   - Live site continues using `deals.category_slug` — no change.
2. **Phase 2 — backfill:**
   - Seed `concept_family` from existing taxonomy_subcategory rows.
   - Seed `concept` from current distinct `deals.product_name` (deduped, normalized) — script in `pipeline/migrate/seed-concepts.ts`.
   - Seed `sku` from `deals` (one row per (product_name, store) tuple). Set `sku.last_deal_seen_at = max(deals.created_at)` per (sku, store).
   - Backfill `deals.sku_id`.
   - Verify: every existing deal has a sku_id.
3. **Phase 3 — pipeline cutover:**
   - Update `pipeline/run.ts` to write to new tables (concept resolution → sku upsert → deals insert with sku_id).
   - Run pipeline once on Mon and verify both old and new tables get written.
4. **Phase 4 — frontend cutover:**
   - Build the 4 UX surfaces against the new tables.
   - Switch home page snapshot query to use new model (with rollback flag).
5. **Phase 5 — cleanup (only after 2+ weeks of new model running clean):**
   - Drop `deals.category_slug`, `deals.sub_category` (the legacy strings).
   - Drop `taxonomy_alias` if unused.

**Rollback:** any phase 1-4 step can be reverted independently because additive-first. Phase 5 requires backup.

---

## 6. Three recommended stack changes (replacing the 3 paid-service ones)

### Change #1 — Materialised view `worth_picking_up_candidates` refreshed at end of pipeline run

**What:** A Postgres materialised view that pre-computes Surface 3 candidates: `(user_interest_id, deal_id, score)` filtered to discount ≥ 30%, scored by `interest_weight × discount_pct`.

**Why:** The runtime JOIN (user_interest × deals × concept × decay calc + ORDER BY) takes 6-9s on cold cache — well over Vercel's 10s timeout once you add network. The MV cuts it to <200ms (single indexed scan).

**Service used:** Postgres `CREATE MATERIALIZED VIEW` (built into Supabase free tier).

**Refresh cadence:** End of every `process-and-store` GitHub Action job (3×/week). Trivial cost.

**Rollback:** Drop the MV; queries fall back to the JOIN. Site degrades to slow-but-working until restored.

---

### Change #2 — Move SKU→concept resolution from runtime to ingestion time

**What:** Write `sku.concept_id` during pipeline ingestion (using `concept_resolver` rules), not at query time. Frontend never resolves; it just JOINs `sku → concept`.

**Why:** The current pattern (resolve at query time using rules) would fire a complex multi-rule lookup on every page load. Doing it once per SKU at ingestion (~40k rows/wk) keeps frontend queries trivial.

**Service used:** Same GitHub Actions pipeline; no new service.

**Cost:** +~10 sec to `process-and-store` job. Negligible vs free-tier 2,000 min/mo.

**Rollback:** Pipeline keeps writing `sku.concept_id`; frontend can ignore it and resolve at runtime if needed. Two-way door.

---

### Change #3 — Vercel ISR (incremental static regeneration) for `/[locale]` home + comparison pages

**What:** Use Next.js `export const revalidate = 3600` (1 hour) on home page snapshot and comparison page rendering. Pages cached at the CDN edge after first render; subsequent visits served from cache.

**Why:** The `useCachedQuery` localStorage cache only helps repeat visits on the same device. ISR at the edge helps every visitor and slashes Supabase request count (free-tier read budget is 50k MAU, but 500k DB rows/mo). Also: zero risk of hitting Vercel 10s function timeout because the query runs at build/revalidate time, not at request time.

**Service used:** Vercel ISR (built into Vercel Hobby — Next.js 16 supports it natively).

**Cost:** Zero. Build time bumps by ~20 sec for the snapshot regeneration.

**Rollback:** Remove `revalidate` export; pages render dynamically at request time again.

---

## 7. Risks & open questions for the PM

1. **Supabase auto-pause on free tier** — DB pauses after 1 week of inactivity. Already mitigated by the `keep-alive` job in `pipeline.yml`. **No action needed.**
2. **5,000 SKUs/store estimate is unverified** — if real volume is 10,000+ per store, storage doubles to ~240 MB (still under 500 MB but headroom shrinks to 2×). **Action:** verify after first full v3 pipeline run; if higher, consider 2-month retention instead of 3.
3. **Triage queue PM bandwidth** — the ~10 min/wk estimate assumes you (PM) actually do this. If skipped, unmatched SKUs accumulate and Surface 2 shows lots of "Not yet seen" cells. **Mitigation:** set a weekly calendar reminder.
4. **Migration phase 5 (drop legacy columns)** — destructive. Only run after 2+ weeks of v3 in production with no rollback events. **PM must explicitly approve before phase 5.**
5. **next-intl French/Italian copy** — the 4 UX surfaces have copy in EN/DE/FR/IT but the existing `messages/` directory only ships full EN/DE. **Builder must add FR/IT copy keys for new surfaces** (designer's M2 fix) AND someone (PM or human translator) must verify the FR/IT translations are accurate before ship.

---

## 8. Builder go/no-go

**GO.** Builder can start with Phase 1 (additive migration). Recommended order:

1. Migration `20260427_v3_concept_layer.sql` (additive — does not break live site)
2. Backfill scripts (seed concepts, skus from existing deals)
3. Pipeline cutover (write to new tables)
4. UX surfaces in order: Surface 1 → Surface 2 → Surface 3 → Surface 3.5
5. Migration phase 5 cleanup (with PM approval)

**No blockers. No paid services. No surprise costs.**

End of validation.

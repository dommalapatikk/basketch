# QA Test Report — WP-1c/1d/1e (products resolve by key set, image on main row, enrichment retired)

**Date:** 2026-09-26
**Tested by:** QA Tester Agent
**Branch under test:** `worktree-agent-a515051bebfd72d2c` (worktree `/Users/kiran/ClaudeCode/basketch/.claude/worktrees/agent-a515051bebfd72d2c`), HEAD `09dde74`
**Code review reference:** `docs/reviews/2026-09-26-review-wp1c-1d-1e.md` — re-review verdict: WP-1c/1d/1e all **Approved**, 0 MUST-FIX, 0 open SHOULD-FIX (S-3 ruled accepted), 5 open NITs.
**Scope:** READ-ONLY against production. No DB writes, no push/merge, no workflow triggers, no source edits. All Supabase queries are small, limited SELECTs against the anon-key client.

---

## Check 1 — Live Supabase baseline (what the web app reads TODAY)

Queried `https://ziqqgfhyruagmkbcwcgm.supabase.co/rest/v1/deals` with the anon key from `web-next/.env.local` (main repo). Small, limited/head-only (`Range: 0-0`, `Prefer: count=exact`) queries only — no row dumps beyond a single `limit=1` sample to confirm the live column set.

**Live column set (confirmed via `select=*&limit=1`):** `id, store, product_name, category, original_price, sale_price, discount_percent, valid_from, valid_to, image_url, source_category, source_url, is_active, fetched_at, created_at, updated_at, product_id, sub_category, format, container, pack_size, unit_volume_ml, unit_weight_g, unit_count, canonical_unit, canonical_unit_value, price_per_unit, taxonomy_confidence, category_slug, sku_id, bundle_quantity, bundle_unit_price, bundle_total_price, classification_key, run_id, is_uncertain, price_basis, loyalty_programme, page_image_url, crop_x, crop_y, crop_w, crop_h, sale_price_rappen, original_price_rappen, attributes, storage, min_quantity`.

**Per-store active (`is_active=true`) deal counts — baseline:**

| Store | Active count | image_url set | page_image_url (crop) set |
|---|---|---|---|
| migros | 49 | 0 | 49 |
| coop | 1003 | 1003 | 0 |
| lidl | 35 | 35 | 0 |
| aldi | 211 | 0 | 0 |
| denner | 241 | 241 | 0 |
| spar | 60 | 0 | 0 |
| volg | 24 | 17 | 0 |
| **Total** | **1623** | — | — |

Migros is the only store currently on the crop path (`page_image_url` + `crop_x/y/w/h`); Coop/LIDL/Denner/Volg use a direct `image_url`; ALDI and SPAR currently have **no image at all** on any active row (baseline, not a regression to watch for — the pipeline has never populated an image for these two).

**LIDL member-price labelling (baseline):** all 35 active LIDL deals are `price_basis='everyone', loyalty_programme=NULL`. A repo-wide (all-time, including inactive) count of `store=lidl AND price_basis='member-only'` returns **0** — LIDL Plus member pricing has never been written to this table yet. This is the baseline the next run must not silently invent violations of (no member-only row without a programme), not a coverage target.

**price_basis CHECK integrity (all stores, all rows):** `price_basis='member-only' AND loyalty_programme IS NULL` → **0 rows**. The DB constraint is currently unbroken.

**rappen columns:** of 1623 active deals, **1622 have non-NULL `sale_price_rappen`**, only 1 is NULL. This is already near-100% today because the (soon-retired) old enrichment pass populated it after the fact. This is the number the next run's direct write (WP-1d, no separate enrichment pass) must maintain or improve — regressing this to near-zero would be the signature failure if `dealToRow`'s rappen values weren't wired into the main upsert.

**min_quantity:** 3/1623 active rows non-NULL (multi-buy is rare in the current catalogue — baseline, not a defect).

**Check 1: PASS.** Live baseline captured with small, bounded, read-only queries. No writes made.

## Check 2 — `dealToRow` output vs. production row shape, per retailer

Throwaway script (scratchpad only, not committed): built one real-shaped `Offer` per retailer through the branch's own domain constructors (`createOffer`, `createMoney`, `cropRegionImage`/`sourceUrlImage`, `minimumQuantity`) → `offerToUnifiedDeal` → `dealToRow` (all from `pipeline/collection/domain/*`, `pipeline/storage/domain/offer-to-unified.ts`, `shared/types.ts` on the branch, run with the pipeline's own `tsx`). Product names/prices/image-shape choices were modelled on the real fixtures under `pipeline/collection/infrastructure/<retailer>/__fixtures__/` and cross-checked against Check 1's live column shape per store.

| Retailer | image_url | page_image_url+crop | sale_price_rappen | original_price_rappen | price_basis | loyalty_programme | min_quantity | discount_percent | Matches live shape (Check 1)? |
|---|---|---|---|---|---|---|---|---|---|
| migros | null | set (0.1,0.1,0.2,0.2) | 350 | null | everyone | null | null | 0 | **Yes** — migros is crop-only in prod (49/49) |
| coop | set | null | 160 | 195 | everyone | null | null | 18 | **Yes** — coop is image_url-only in prod (1003/1003) |
| lidl | set | null | 249 | 349 | member-only | "Lidl Plus" | null | 29 | Shape matches; **prod currently has 0 member-only LIDL rows (Check 1)**, so this exercises a path production hasn't hit yet — see note below |
| aldi | null | null | 195 | null | everyone | null | null | 0 | **Yes** — ALDI rule holds (no original price → discount stays 0/null-equivalent, never back-computed); matches prod's current 0-image baseline |
| denner | set | null | 990 | 1290 | everyone | null | null | 23 | **Yes** — denner is image_url-only in prod (241/241) |
| spar | null | null | 450 | 550 | everyone | null | null | 18 | **Yes** — matches prod's current 0-image baseline |
| volg | set | null | 420 | null | everyone | null | 2 | 0 | **Yes** — image_url matches prod pattern; `min_quantity=2` exercises the multi-buy column (prod has only 3/1623 non-null today) |

**Every row**: `sale_price_rappen`/`original_price_rappen` populated directly from the domain's integer `Money.rappen` (not back-derived from francs) — confirms the WP-1e claim that rappen "ride the same statement" rather than needing a second enrichment pass. The LIDL member row correctly paired `price_basis='member-only'` with a non-null `loyalty_programme` — the illegal "member-only, no programme" combination is unconstructable (S-5's discriminated-union fix, confirmed by trying to omit `programme` from the literal, which fails `tsc`).

**Note (not a defect):** LIDL member-price labelling could not be checked against a *live* example, because Check 1 found zero member-only LIDL rows in the current database — the feature has never fired in production yet. This QA can only confirm the code path is correct in isolation; the "next real run" checklist (Check 4) includes a live LIDL Plus check to close this gap once real member offers are collected.

**Check 2: PASS.** Column shape for all 7 retailers matches what's live in production today (Check 1), and the two structural invariants exercised (ALDI no-discount, LIDL member+programme pairing) hold.

## Check 3 — Web compatibility (`web-next/src/server/data/supabase-provider.ts`)

`SELECT_COLUMNS` (line 69, unchanged on this branch — confirmed no diff under `web-next/` per the code review §6, and independently re-read here) is:
`id, store, product_name, category, category_slug, sub_category, sale_price, original_price, discount_percent, price_per_unit, canonical_unit, format, image_url, valid_from, valid_to, source_url, product_id, taxonomy_confidence, is_uncertain, storage, price_basis, loyalty_programme, page_image_url, crop_x, crop_y, crop_w, crop_h, attributes, is_active, updated_at, min_quantity`.

Cross-checked column by column against `dealToRow`'s write set (`shared/types.ts:1006-1074`, read in full): every one of those columns (other than the three DB-managed ones — `id`, `updated_at`, and `fetched_at`/`created_at` which `dealToRow`'s own return type explicitly `Omit`s) is written by the branch's single main-row upsert. `image_url`/`page_image_url`/`crop_x..h` come from `imageColumns(deal.image)` (WP-1d, total by construction — always all six keys). `price_basis`/`loyalty_programme` come from the WP-1e discriminated field. No column the web reads is left unwritten, and no column was renamed or removed.

`mapRow` (`supabase-provider.ts:100-144`) — the anti-corruption layer that turns a `DealRow` into a `Deal` — reads `price_basis`+`loyalty_programme` together via `createPriceBasis` (drops the row loudly if a member price has no programme, which the DB CHECK plus WP-1e's discriminated union should make unreachable) and `page_image_url`+`crop_x/y/w/h` together via `createCropRegion` (drops to "no image" if the crop is partial, never guesses). Both match how the branch produces these columns.

**Check 3: PASS.** No column the web app reads is left unwritten by this branch. Matches the code review's own §6 conclusion ("Unaffected"), independently re-verified column by column here.

## Check 4 — Checklist for the coordinator: verify after the next real (Monday) pipeline run

**Must NOT regress (compare against the 2026-09-26 baseline in Check 1):**

```sql
-- 1. Per-store active deal counts vs baseline (migros 49, coop 1003, lidl 35, aldi 211, denner 241, spar 60, volg 24, total 1623)
select store, count(*) as active_count
from deals
where is_active = true
group by store
order by store;
```
- [ ] Every store's count is the same order of magnitude as baseline. A store dropping to ~0 (M-1's old failure mode: one oversized `.in()` chunk zeroing out a whole store's `product_id`s) is the regression signal — but note M-1 only zeroed `product_id`, never the deal row itself, so a count near zero here would point to a *different*, new defect, not a M-1 relapse. Cross-check with query 6 below for the M-1-specific symptom.

```sql
-- 2. Image coverage per store vs baseline (migros: crop-only, ~100%; coop/lidl/denner: image_url-only, ~100%; aldi/spar: 0% baseline, volg: ~70% baseline)
select store,
  count(*) filter (where is_active) as active,
  count(*) filter (where is_active and image_url is not null) as with_image_url,
  count(*) filter (where is_active and page_image_url is not null) as with_crop
from deals
group by store
order by store;
```
- [ ] Migros stays crop-only (`with_crop` ≈ `active`, `with_image_url` ≈ 0). Coop/LIDL/Denner stay image_url-only. A store that used to have images and now shows 0 in both columns is the regression signal (WP-1d image write path broken).

```sql
-- 3. LIDL Plus (member-only) labels present, and the CHECK invariant holds everywhere
select price_basis, loyalty_programme, count(*)
from deals
where store = 'lidl' and is_active
group by price_basis, loyalty_programme;

select count(*) as illegal_member_rows
from deals
where price_basis = 'member-only' and loyalty_programme is null;   -- must stay 0
```
- [ ] `illegal_member_rows` = 0 (the DB CHECK plus WP-1e's discriminated `UnifiedDeal.priceBasis` should make this unreachable — Check 1 confirms it is 0 today). If LIDL's flyer this run actually carried a Lidl Plus price (baseline had zero — see Check 2's note), confirm it shows up here as `('member-only', 'Lidl Plus', N)`, not silently dropped or shown unlabelled as `'everyone'`.

```sql
-- 4. No NULL sale_price_rappen among active deals (baseline: 1622/1623 non-null)
select count(*) as null_rappen
from deals
where is_active = true and sale_price_rappen is null;
```
- [ ] `null_rappen` stays at or near 0-1 (not a jump to hundreds/thousands — that would mean WP-1e's direct rappen write regressed and nothing is filling the gap the old enrichment pass used to fill).

```sql
-- 5. No duplicate (store, source_name) products -- confirms M-2's dedupe-by-id fix holds live
select store, source_name, count(*)
from products
group by store, source_name
having count(*) > 1;
```
- [ ] Zero rows. Any row here plus a failed run would point to the unique index being bypassed or M-2's `dedupeOfferDateUpdates` not actually running in production.

```sql
-- 6. "Created N new products" sanity per store -- confirms M-1's byte-budget chunking is not silently degrading a whole store to product_id: null
select store, count(*) as created_since_run
from products
where created_at > '<RUN_START_TIMESTAMP_UTC>'   -- fill in from the workflow run's start time
group by store
order by store;
```
- [ ] Per-store counts are **tens to low hundreds**, not ~900+ for any one store (that was the RCA's headline defect pattern: "916 logged, 147 real" / a whole store's names overflowing one `.in()` chunk). Compare this against the pipeline log's own "Created N new X products" line for the same store — they should now match (S-8's DB-confirmed-count fix), not just the sent count.

**Log-line / workflow checks (not SQL — read the GitHub Actions run log for the Monday `pipeline.yml` run):**
- [ ] Write-tail duration line (`write tail: Nms (resolveTaxonomy → resolveProducts → activeCountsByWindow → storeDeals → deactivateStaleForStores → deactivateExpiredDeals → logPipelineRun)`) — order matches the pinned test (`run-pipeline.test.ts:656-668`), no `writeEnrichment` step appears (WP-1e retirement), and the duration is not anomalously long (no new byte-budget-chunking retry storm).
- [ ] Zero occurrences of `SQLSTATE 21000` ("ON CONFLICT DO UPDATE command cannot affect row a second time") anywhere in the run log — this was M-2's exact failure signature before the fix; `grep -i "21000\|cannot affect row a second time" <run-log>` should return nothing.
- [ ] Zero occurrences of a PostgREST URL-too-length / `414`/oversized-`.in()` error — `grep -iE "URI Too Long|414|url.{0,10}too.{0,10}long" <run-log>` should return nothing. This was M-1's exact failure signature (the classification-cache precedent cited in the review).
- [ ] "Created N new coop products" (or any store) log line is in the tens-to-low-hundreds range, not ~900+ — cross-check against query 6 above; the two numbers should now agree (S-8).

**Check 4: delivered as a checklist above** — exact SQL provided for the coordinator to run read-only after Monday's run; no SQL was executed against production beyond the small baseline-capture queries in Check 1.

---

## Summary

| # | Check | Result |
|---|---|---|
| 1 | Live Supabase baseline captured (images per store, LIDL labelling, rappen) | **PASS** |
| 2 | `dealToRow` output matches production row shape, all 7 retailers | **PASS** |
| 3 | web-next reads (`supabase-provider.ts`) — no column left unwritten | **PASS** |
| 4 | Next-real-run checklist with exact read-only SQL | **Delivered** |

**Overall: PASS.** No DB writes, no push/merge, no workflow triggers were made. All Supabase queries were small, bounded (`Range: 0-0`, `count=exact`, or a single `limit=1` sample), read-only, and used the anon key only. The one open gap this QA could not close is that LIDL Plus member-price labelling has never fired in live production data yet (Check 1), so Check 4's LIDL query is the first real-world confirmation still owed.

# basketch — session summary

**Date:** 2026-04-26
**Outcome:** Major architecture decision session — diagnosed 5 categorization defects, ran full team review (pm-coach, vp-product, designer, architect ×3, architect-challenger, tech-lead), refined product goal, locked a simplified 9-table data model that fits zero-cost constraints. **No code shipped today** — pure architecture/strategy. Live site still on commit `d92300e` from 2026-04-25 (HR10 v2 client-side filter fix).

---

## What triggered this session

User flagged 5 visible categorization defects on https://basketch.vercel.app:
1. Canned tomatoes (Longobardi 12er-pack, gehackte tomaten 6×800g) appearing in "Fresh › Vegetables Fruits"
2. Wine (Cabernet Sauvignon) appearing in "Fish"
3. Cat food (Almo Nassfutter Thunfisch & Huhn) appearing in "Fish"
4. Batteries (Energizer, Duracell, Varta) + thermometer in "Home Cleaning"
5. "Paper Goods" sub-cat duplicating its parent name

Plus naming inconsistency ("Vegetables Fruits" filter vs "Vegetables" header).

---

## Refined product goal (saved to memory: `project_basketch_goal.md`)

**Canonical one-liner:** A persistent shopping list that re-evaluates the cheapest store for each item every week, outputs a grouped shareable list by store, AND proactively surfaces one-off deals worth adding ("Worth picking up this week").

**Two-part weekly output:**
1. **Regular list** — items user persistently tracks; routed to cheapest store this week; re-evaluated weekly; forwardable to partner.
2. **Worth picking up** — strong one-off deals (e.g. batteries 50% off) on items the user has bought before / favourited / browsed. User adds or ignores.

**Three real-world complexities the model must handle:**
- Variants (milk: fat%, origin, shelf-life, size)
- Store-specific brands (M-Classic vs Coop QP vs Aldi Milsani)
- Cross-store availability (batteries on deal at Migros, not Coop/Lidl — UI must distinguish)

---

## Agents run (chronological)

| Agent | Verdict |
|---|---|
| **architect** (Plan agent, round 1) | Proposed Migros adoption hybrid (Option D — 15 L1 + 91 L2 visible, 4 levels in DB) |
| **PM (generic)** | Backed Option D, flagged Swiss shopper mental-model challenge |
| **vp-product** (via general-purpose) | **Rejected Option D as proposed** → revised to D' (keep current v3.2 UI, store 4 Migros levels invisibly in DB) |
| **pm-coach** (round 1) | Fired 6 of 8 triggers — taxonomy debate is wrong question. Recommended Option C/E (don't restructure UI, fix data) |
| **designer** | Picked Option E. Rail isn't broken, data is. 5 specific filter UI fixes needed (kill `humaniseSlug`, 44px targets, etc.) |
| **pm-coach** (round 2, Phase 1) | Fired triggers, prioritised milk > store-brands > cross-availability — but user rejected this phasing |
| **architect** (round 2, Phase 1) | Proposed 3-layer model: Concept → SKU → Deal + concept_resolver + user_interest |
| **architect-challenger** | Found 5 MUST-FIX gaps (regular_price source, parent_slug tree wrong, missing user_interest schema, sku_alias/last_seen_at/LLM cache holes, is_active misuse) + 21 fix-laters |
| **architect** (round 3 — incorporated 5 must-fixes) | 7-table model with all fixes |
| **architect** (round 4 — folded ALL deferred items) | Bloated to 17 tables — bundle deals, regional, equivalence, off-deal crawler, multi-currency, UUID PKs, materialised view, etc. |
| **tech-lead** | GO with 3 stack changes: monthly partitioning (pg_partman), move daily scrapes off GH Actions, Vercel AI Gateway. **But — required Supabase Pro ($25/mo) + worker ($5/mo) + LLM (~$25/mo).** |
| **architect** (round 5 — FINAL SIMPLIFIED) | After user said "no penny" + "3 months retention" + user challenged price_history/inventory: **9 tables**, ~28 MB storage, fits Supabase free tier. |

---

## Key user decisions (in order made)

1. **Solo project — no real users yet.** Don't apply launch-date pressure. (memory: `feedback_no_fake_launch_pressure.md`)
2. **Goal unchanged from PRD** — PRD describes journeys (browse, recurring); goal is the canonical sentence above. (memory: `project_basketch_goal.md`)
3. **Solve all 3 complexities holistically — no phasing** ("milk first, batteries later" is a crappy idea). (memory: `feedback_solve_holistically_not_phased.md`)
4. **Build everything in one model — no v1/v2.**
5. **Zero paid services.** "I don't want to pay any penny." (memory: `feedback_basketch_zero_paid_services.md`)
6. **3-month retention** (not 18).
7. **Weekly scrape cadence** (not daily — matches user's weekly use).
8. **Approved simplified 9-table model** (architect's round 5).

---

## Final locked data model (9 tables + 1 materialised view)

**Lookups (3):** `store`, `region`, `concept_family`
**Core 3-layer (4):** `concept`, `sku`, `sku_alias`, `deals`
**User-side (1):** `user_interest`
**Resolver (1):** `concept_resolver`
**Operations (1):** `pipeline_run`
**Materialised view (1):** `concept_cheapest_now`

**Storage at 3-month retention:** ~28 MB (fits Supabase free 500 MB with 17× headroom).

**Key design points:**
- **No tree** — flat concepts, `family_slug` FK groups siblings
- Variant attrs as flat columns (`fat_pct`, `volume_ml`, `shelf_life`, `origin`, `is_organic`, dietary flags, allergens[])
- `sku.last_deal_seen_at` replaces dropped `sku_inventory` table — shows "Coop last on deal 3 wks ago"
- `sku.regular_price` updated when source provides — replaces dropped `sku_price_history`
- Bundle pricing on `deals` (`bundle_quantity`, `bundle_unit_price`, `bundle_total_price`)
- Multi-region for Migros (Aare/Genève/Zurich/Ticino)
- Multi-currency ready (CHF default but column-based)
- Worth-picking-up uses fixed 30%+ discount threshold (not per-category percentile — simplified)
- LLM fallback DROPPED — rules-only resolver, unmatched SKUs go to triage queue (~10-15% expected)
- Weekly cron only (no daily) — fits GitHub Actions free 2,000 min/mo

**How the 5 defects are structurally prevented:**
- No more "fallback bucket" alias — each concept has explicit `family_slug`
- Resolver rules use `priority` — pet-food brands fire before generic "thunfisch" keyword
- Format-aware rules — packaging signals (can/jar/multipack) part of resolution
- Unmatched SKUs go to triage queue, never silently misplaced
- Sub-cat list derived from real concept data — can't duplicate parent name

---

## UX impact

- **Existing UX (v3.2 IA: 3 Types → 11 Categories → sub-cat bands) preserved** — no breaking changes
- **3 NEW UX surfaces designer will add** in next phase:
  1. Variant picker ("I want milk → pick fat%/size/organic")
  2. Cross-store availability indicator ("last seen at Coop 3 wks ago")
  3. "Worth picking up this week" section

---

## What's pending / next steps

1. **Designer** — design 3 new UX surfaces (variant picker, availability indicator, Worth-picking-up section). Existing UX stays.
2. **Design-challenger** — red-team the new UX
3. **Tech-lead** — finalize the 3 zero-cost stack changes (no paid services, no LLM, weekly GH Actions cron)
4. **Builder** — implement the 9-table schema + new UX
5. **Deploy** — migrate from current schema to v3.0

---

## Key file paths (deliverables this session)

- **Visual of Migros taxonomy** (L1-L4 expandable HTML): `/Users/kiran/ClaudeCode/Claude Cowork output/migros-taxonomy-visual.html`
- **Visual of new data model** (4 layers + concrete milk example): `/Users/kiran/ClaudeCode/Claude Cowork output/basketch-data-model-visual.html`
- **Migros taxonomy source** (input from Claude Cowork): `/Users/kiran/ClaudeCode/Claude Cowork output/migros-categories.json` (1,123 nodes, 4 levels)
- **PRD (canonical):** `/Users/kiran/ClaudeCode/basketch/docs/prd.md` + `prd-v3.2-amendment.md`
- **Current shared types:** `/Users/kiran/ClaudeCode/basketch/shared/types.ts`
- **Current schema:** `/Users/kiran/ClaudeCode/basketch/supabase/migrations/`
- **Current categorization rules** (to be replaced): `/Users/kiran/ClaudeCode/basketch/shared/category-rules.ts`, `/Users/kiran/ClaudeCode/basketch/pipeline/categorize.ts`, `/Users/kiran/ClaudeCode/basketch/pipeline/product-group-assign.ts`

---

## Memory updates (saved this session)

| File | Type |
|---|---|
| `feedback_no_fake_launch_pressure.md` | feedback |
| `project_basketch_goal.md` (refined to include Worth-picking-up) | project |
| `feedback_solve_holistically_not_phased.md` | feedback |
| `feedback_basketch_zero_paid_services.md` | feedback |

---

## Live state (unchanged from yesterday)

| | |
|---|---|
| 🌐 Live site | https://basketch.vercel.app |
| 🌿 Branch | `redesign` (ahead of `main`) |
| 📄 Latest commit | `d92300e` — HR10 client-side filter fix (2026-04-25) |
| 🏗️ Vercel project | `dommalapatikks-projects/basketch` |
| 🔐 Vercel Authentication | DISABLED (publicly accessible) |

**Yesterday's UI patches (HR9-13, HR10 v2) are still the latest deployed code.** Today's data-model decisions have NOT been implemented yet — they're spec only, awaiting designer + builder.

---

**To resume work:** read this file + the data-model visual HTML, then continue with: designer agent for variant-pick UX + Worth-picking-up surface design.

-- Migration: concept_cheapest_now and worth_picking_up_candidates expose
-- price_basis/loyalty_programme AND min_quantity, so the home page can label
-- a member-only or multi-buy price the same way the main deals list already
-- does (WP-W4 follow-up).
--
-- ⚠️ SUPERSEDES 20260916_mv_validity_window.sql — DO NOT APPLY THAT FILE
-- AFTER THIS ONE. Confirmed by the code reviewer: this migration is a
-- STRICT SUPERSET of 20260916_mv_validity_window.sql — same full-window
-- WHERE clause, same valid_from/valid_to columns, same two indexes, same
-- BEGIN/COMMIT wrapper — it just adds three more payload columns to the
-- same two CREATE statements. Applying 20260916_mv_validity_window.sql
-- AFTER this one would DROP + recreate both views WITHOUT price_basis,
-- loyalty_programme or min_quantity, silently reintroducing the exact
-- unlabelled-price defect both this migration and WP-W4 exist to close —
-- Postgres gives no warning when a DROP + CREATE cycle narrows a view's
-- columns. Safe order: 20260916_quantity_requirement.sql (WP-C4, adds
-- deals.min_quantity — a prerequisite, see below) → this file, ONLY →
-- `NOTIFY pgrst, 'reload schema';` → the grant/PostgREST checks below →
-- deploy. 20260916_mv_validity_window.sql should be treated as already
-- folded into this one and never run on its own again.
--
-- BACKGROUND
-- server/data/worth-picking-up.ts (both the personal MV path and the
-- cold-start path) is the home page's "Worth picking up" section. Neither
-- read path ever selected `price_basis`/`loyalty_programme`, so a Lidl Plus
-- (or any member-only) price could render there with no label at all — the
-- exact CLAUDE.md rule ("always label member-only prices") the main deals
-- list already enforces via server/data/supabase-provider.ts's mapRow. QA
-- confirmed the live cold-start set is 100% Coop open-price today, so that
-- gap was not visible yet.
--
-- Code review of the first version of this migration (422bd51) found the
-- IDENTICAL gap for `min_quantity` (WP-C4, D2, TP-7a): the personal path
-- takes the minimum `sale_price` per concept from `concept_cheapest_now`
-- with no multi-buy exclusion or label, and cold-start reads `deals`
-- directly without selecting the column at all — so a Migros "ab N Stück"
-- price would render BARE on the home page the first week WP-C4's pipeline
-- lands, the same Art. 3(1)(e) UWG failure this whole package exists to
-- prevent. Fixed the same way: the value is LABELLED where shown
-- (formatMinQuantityLabel, reusing lib/domain/quantity-requirement.ts's
-- isMultiBuy), not excluded from the home page's picks — the better match
-- for D2's own "listed but does not vote" ruling, which is about the
-- CATEGORY VERDICT and the "Cheapest" tag, neither of which this section
-- computes; "Worth picking up" is a personalised suggestion list, not a
-- comparison claim, so there is nothing here for a multi-buy price to
-- unfairly "win" the way it could on the deals page.
--
-- WHY BOTH VIEWS, NOT JUST worth_picking_up_candidates
-- `worth_picking_up_candidates` does not join `deals` directly — it joins
-- `concept_cheapest_now` (on `deal_id`), which is itself the view that reads
-- `deals`. Every column has to be threaded through both, the same shape
-- `valid_from`/`valid_to` were threaded through originally.
--
-- concept_cheapest_now also drives Surface 2 (the freshness strip) — adding
-- columns there is a strictly additive, wider-reaching change than this
-- migration's own motivating bug, but it is the only place the values can
-- come from, and nothing existing reads the new columns until this same
-- change's web-side follow-up does.
--
-- WHY DROP + RECREATE, NOT ALTER
-- PostgreSQL has no `ALTER MATERIALIZED VIEW ... AS`. Ordered DROP
-- (dependent view first) / CREATE, same as always.
--
-- WHY NULLABLE payload columns, not NOT NULL
-- `deals.price_basis` is `NOT NULL DEFAULT 'everyone'` at the source, and
-- `deals.min_quantity` is nullable with a `>= 2` CHECK
-- (20260916_quantity_requirement.sql), but these materialised-view columns
-- simply pass both through — no default or constraint is re-asserted here,
-- so an unexpected NULL (a schema drift the view did not anticipate)
-- surfaces as NULL rather than being silently coerced by the view itself.
-- The web read path (server/data/worth-picking-up.ts) is where that
-- reading is decided, via the same `createPriceBasis`/`isMultiBuy` the main
-- deals list already uses, so there is one definition of "how do we read
-- this", not two.
--
-- PREREQUISITE: deals.min_quantity must already exist
-- `d.min_quantity` below requires 20260916_quantity_requirement.sql (WP-C4)
-- to have been applied first — that migration adds the column to `deals`.
-- Applying this file before that one fails outright (`column d.min_quantity
-- does not exist`), which is a loud, immediate failure — safer than the
-- silent narrowing risk of running things in the wrong order the other way.
--
-- SAFETY
-- Additive only. Every DROP is `IF EXISTS`, every CREATE is unconditional
-- because the DROP immediately above it already guarantees a clean slate.
-- Neither view is a source of truth — both are pure derivations, so
-- re-running this file is a no-op beyond losing the cached `computed_at`
-- (replaced by the next scheduled REFRESH regardless).
--
-- REVIEWER / PM — run AFTER applying, in this order:
--
-- 1. RELOAD POSTGREST'S SCHEMA CACHE. A DROP + CREATE cycle on a
--    materialised view is not always picked up automatically:
--      NOTIFY pgrst, 'reload schema';
--
-- 2. GRANTS SURVIVED, THROUGH POSTGREST, NOT JUST PSQL. Materialised views
--    have no RLS; access has always relied on the anon role's default
--    SELECT privilege on the public schema, which a DROP + CREATE cycle can
--    in principle lose. Check with the ANON key, through PostgREST:
--      curl "$SUPABASE_URL/rest/v1/concept_cheapest_now?select=price_basis,min_quantity&limit=1" -H "apikey: $ANON_KEY"
--      curl "$SUPABASE_URL/rest/v1/worth_picking_up_candidates?select=price_basis,loyalty_programme,min_quantity&limit=1" -H "apikey: $ANON_KEY"
--    A 400/404 here can mean either a missing grant OR a stale PostgREST
--    schema cache — try step 1 first (non-destructive) before assuming a
--    grant is missing. If it still 400s, restore it as an admin/service-role
--    connection:
--      GRANT SELECT ON concept_cheapest_now, worth_picking_up_candidates TO anon, authenticated;
--
-- 3. THE INDEXES SURVIVED. `SELECT indexname FROM pg_indexes WHERE
--    tablename IN ('concept_cheapest_now', 'worth_picking_up_candidates');`
--    — confirm both unique/plain indexes this migration recreates exist; a
--    typo would not fail loudly.
--
-- 4. ROW CONTENTS, NOT JUST COUNTS. For a concept you know has a member-only
--    or multi-buy deal, confirm `price_basis`/`min_quantity` actually carry
--    the expected value — a join or column-order mistake can pass a row
--    count check while carrying the wrong value.

BEGIN;

-- ============================================================
-- 1. Drop both views, dependant first.
-- ============================================================

DROP MATERIALIZED VIEW IF EXISTS worth_picking_up_candidates;
DROP MATERIALIZED VIEW IF EXISTS concept_cheapest_now;

-- ============================================================
-- 2. concept_cheapest_now — adds price_basis, loyalty_programme,
--    min_quantity. No `IF NOT EXISTS` — the unconditional DROP above
--    already guarantees the view does not exist at this point.
-- ============================================================

CREATE MATERIALIZED VIEW concept_cheapest_now AS
SELECT DISTINCT ON (s.concept_id, s.region_slug)
  s.concept_id,
  s.region_slug,
  s.store_slug          AS cheapest_store,
  s.id                  AS sku_id,
  d.id                  AS deal_id,
  d.sale_price          AS deal_price,
  d.original_price      AS deal_regular_price,
  d.discount_percent,
  d.valid_from,
  d.valid_to,
  d.price_basis,
  d.loyalty_programme,
  d.min_quantity,
  NOW()                 AS computed_at
FROM sku s
JOIN deals d ON d.sku_id = s.id
WHERE d.valid_from <= CURRENT_DATE
  AND d.valid_to >= CURRENT_DATE
  AND d.is_active = true
ORDER BY s.concept_id, s.region_slug, d.sale_price ASC;

CREATE UNIQUE INDEX concept_cheapest_now_pk
  ON concept_cheapest_now (concept_id, region_slug);

-- ============================================================
-- 3. worth_picking_up_candidates — threads price_basis, loyalty_programme,
--    min_quantity through from concept_cheapest_now, same as valid_from/
--    valid_to were.
-- ============================================================

CREATE MATERIALIZED VIEW worth_picking_up_candidates AS
SELECT
  ui.user_email,
  ui.concept_id,
  ccn.cheapest_store    AS deal_store,
  ccn.deal_id,
  ccn.deal_price,
  ccn.deal_regular_price,
  ccn.discount_percent,
  ccn.valid_from,
  ccn.valid_to,
  ccn.price_basis,
  ccn.loyalty_programme,
  ccn.min_quantity,
  ui.signal             AS interest_signal,
  ui.added_at           AS interest_added_at,
  EXP(-EXTRACT(EPOCH FROM (NOW() - ui.added_at)) / (86400.0 * 30.0)) AS interest_weight,
  EXP(-EXTRACT(EPOCH FROM (NOW() - ui.added_at)) / (86400.0 * 30.0)) * ccn.discount_percent AS score,
  NOW()                 AS computed_at
FROM user_interest ui
JOIN concept_cheapest_now ccn ON ccn.concept_id = ui.concept_id
WHERE ui.dismissed_at IS NULL
  AND ui.added_at >= NOW() - INTERVAL '90 days'
  AND ccn.discount_percent >= 30
ORDER BY ui.user_email, score DESC;

CREATE INDEX worth_picking_up_user_score_idx
  ON worth_picking_up_candidates (user_email, score DESC);

-- ============================================================
-- 4. Grants — a DROP + CREATE cycle can lose a hand-applied privilege that
--    is not tracked in any migration (matviews have no RLS). Re-asserting
--    it here removes the "hope the reviewer runs the checklist by hand"
--    step for this one, load-bearing grant; PostgREST returns a 400/404 to
--    every anon request against either view without it.
-- ============================================================

GRANT SELECT ON concept_cheapest_now, worth_picking_up_candidates TO anon, authenticated;

-- ============================================================
-- 5. Comments (DROP removes them; re-applied here, text updated).
-- ============================================================

COMMENT ON MATERIALIZED VIEW concept_cheapest_now IS
  'Per (concept, region), the cheapest deal IN EFFECT (valid_from <= today <= valid_to). Carries price_basis/loyalty_programme/min_quantity through from deals so a member-only or multi-buy price is never shown unlabelled. Refreshed at end of every pipeline_run; a materialised view freezes CURRENT_DATE at refresh time, so web read paths must still re-apply isInEffect for staleness between refreshes.';
COMMENT ON MATERIALIZED VIEW worth_picking_up_candidates IS
  'Per-user pre-scored Surface 3 candidates. discount >= 30% AND interest_weight (90d exp decay) AND not dismissed. Carries valid_from/valid_to, price_basis/loyalty_programme and min_quantity through from concept_cheapest_now so the web read path can re-check isInEffect and label a member-only or multi-buy price.';

COMMIT;

-- ============================================================
-- 6. Schema cache reload — run OUTSIDE the transaction above (NOTIFY takes
--    effect immediately regardless, but keeping it out of BEGIN/COMMIT
--    makes it unambiguous this is a signal to PostgREST, not a DDL step
--    that could be rolled back with the rest).
-- ============================================================

NOTIFY pgrst, 'reload schema';

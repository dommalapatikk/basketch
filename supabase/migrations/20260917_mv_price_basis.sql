-- Migration: concept_cheapest_now and worth_picking_up_candidates expose
-- price_basis/loyalty_programme, so the home page can label a member-only
-- price the same way the main deals list already does (WP-W4 follow-up).
--
-- BACKGROUND
-- server/data/worth-picking-up.ts (both the personal MV path and the
-- cold-start path) is the home page's "Worth picking up" section. Neither
-- read path ever selected `price_basis`/`loyalty_programme`, so a Lidl Plus
-- (or any member-only) price could render there with no label at all — the
-- exact CLAUDE.md rule ("always label member-only prices") the main deals
-- list already enforces via server/data/supabase-provider.ts's mapRow. QA
-- confirmed the live cold-start set is 100% Coop open-price today, so the
-- gap is not currently visible — it surfaces the first week a member-only
-- deal qualifies (>= 30% discount, in effect). Fixed on the read side in
-- the same change as this migration, which is what MAKES the fix possible:
-- `worth_picking_up_candidates` cannot expose a column `deals` carries but
-- neither materialised view selects.
--
-- WHY BOTH VIEWS, NOT JUST worth_picking_up_candidates
-- `worth_picking_up_candidates` does not join `deals` directly — it joins
-- `concept_cheapest_now` (on `deal_id`), which is itself the view that reads
-- `deals`. The column has to be threaded through both, the same shape
-- `valid_from`/`valid_to` were threaded through by 20260916_mv_validity_
-- window.sql for the identical reason.
--
-- concept_cheapest_now also drives Surface 2 (the freshness strip) — adding
-- two columns there is a strictly additive, wider-reaching change than this
-- migration's own motivating bug, but it is the only place the value can
-- come from, and nothing existing reads these two new columns until this
-- same change's web-side follow-up does.
--
-- WHY DROP + RECREATE, NOT ALTER
-- PostgreSQL has no `ALTER MATERIALIZED VIEW ... AS`. Same ordered DROP
-- (dependent view first) / CREATE pattern as 20260916_mv_validity_window.sql
-- — see that file for the full reasoning (BEGIN/COMMIT, grants, index
-- survival, PostgREST schema cache) which applies identically here and is
-- not repeated in full below.
--
-- WHY NULLABLE payload columns, not NOT NULL
-- `deals.price_basis` is `NOT NULL DEFAULT 'everyone'` at the source, but
-- these two materialised-view columns simply pass it through — no default
-- is asserted here, so an unexpected NULL (a schema drift the view did not
-- anticipate) surfaces as NULL rather than being silently coerced to
-- 'everyone' by the view itself. The web read path
-- (server/data/worth-picking-up.ts) is where that reading is decided, via
-- the same `createPriceBasis` used by the main deals list, so there is one
-- definition of "how do we read this", not two.
--
-- SAFETY
-- Additive only, same idempotency shape as 20260916_mv_validity_window.sql:
-- every DROP is `IF EXISTS`, every CREATE is unconditional because the DROP
-- immediately above it already guarantees a clean slate. Neither view is a
-- source of truth — both are pure derivations, so re-running this file is a
-- no-op beyond losing the cached `computed_at` (replaced by the next
-- scheduled REFRESH regardless).
--
-- REVIEWER / PM — same post-apply checks as 20260916_mv_validity_window.sql
-- §"REVIEWER / PM" (grants through PostgREST, not just psql; index survival;
-- row CONTENTS not just counts) — not repeated here, still apply verbatim.
-- One check specific to this migration:
--   curl "$SUPABASE_URL/rest/v1/worth_picking_up_candidates?select=price_basis,loyalty_programme&limit=1" -H "apikey: $ANON_KEY"
--   — confirms both the grant survived AND the new columns are reachable
--   through PostgREST, not only through a superuser psql connection.

BEGIN;

-- ============================================================
-- 1. Drop both views, dependant first.
-- ============================================================

DROP MATERIALIZED VIEW IF EXISTS worth_picking_up_candidates;
DROP MATERIALIZED VIEW IF EXISTS concept_cheapest_now;

-- ============================================================
-- 2. concept_cheapest_now — adds price_basis, loyalty_programme.
--    No `IF NOT EXISTS` — same reasoning as 20260916_mv_validity_window.sql.
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
-- 3. worth_picking_up_candidates — threads price_basis, loyalty_programme
--    through from concept_cheapest_now, same as valid_from/valid_to were.
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
-- 4. Comments (DROP removes them; re-applied here, text updated).
-- ============================================================

COMMENT ON MATERIALIZED VIEW concept_cheapest_now IS
  'Per (concept, region), the cheapest deal IN EFFECT (valid_from <= today <= valid_to). Carries price_basis/loyalty_programme through from deals so a member-only price is never shown unlabelled. Refreshed at end of every pipeline_run; a materialised view freezes CURRENT_DATE at refresh time, so web read paths must still re-apply isInEffect for staleness between refreshes.';
COMMENT ON MATERIALIZED VIEW worth_picking_up_candidates IS
  'Per-user pre-scored Surface 3 candidates. discount >= 30% AND interest_weight (90d exp decay) AND not dismissed. Carries valid_from/valid_to and price_basis/loyalty_programme through from concept_cheapest_now so the web read path can re-check isInEffect and label a member-only price.';

COMMIT;

-- Migration: concept_cheapest_now and worth_picking_up_candidates honour the
-- FULL validity window, not just its end bound (#10, WP-W3).
--
-- ⚠️ SUPERSEDED by 20260917_mv_price_basis.sql — DO NOT APPLY THIS FILE
-- AFTER THAT ONE. 20260917_mv_price_basis.sql is a strict superset of this
-- migration (same WHERE clause, same columns, same two indexes) plus
-- price_basis/loyalty_programme/min_quantity. If both are unapplied,
-- 20260917_mv_price_basis.sql already covers everything below — apply it
-- directly and skip this file. If this file was already applied and
-- 20260917_mv_price_basis.sql has not been yet, apply 20260917 next, never
-- this file again: re-running THIS migration after that one would DROP +
-- recreate both views WITHOUT the newer columns, silently reintroducing an
-- unlabelled member-only/multi-buy price on the home page.
--
-- BACKGROUND
-- docs/rca/2026-09-15-final-plan.md §1.3: concept_cheapest_now filtered only
-- on `d.valid_to >= CURRENT_DATE`, so a deal whose validity window had not
-- yet opened (a flyer fetched 1-2 weeks ahead of its own start date) could
-- still be served as "the cheapest deal right now" — this view drives
-- Surface 2's freshness strip and, via worth_picking_up_candidates, Surface
-- 3's "Worth picking up". WP-W2 already fixed the equivalent bug on the main
-- site read path with `isInEffect` (Zurich date,
-- web-next/src/lib/domain/validity.ts). This migration applies the matching
-- fix to the SQL side, and exposes `valid_from` so the web read path
-- (worth-picking-up.ts) can re-check it per request.
--
-- WHY THE WEB STILL RE-CHECKS AFTER THIS MIGRATION
-- A materialised view freezes CURRENT_DATE at REFRESH time, not at read
-- time. REFRESH MATERIALIZED VIEW runs once, at the end of every pipeline
-- run (pipeline/v3-cutover.ts populateV3Layer, step 6) — roughly weekly.
-- Between refreshes, even this corrected WHERE clause goes stale: a deal
-- that has expired since the last refresh, or one that had not started at
-- refresh time but has since started, is not re-evaluated until the next
-- REFRESH. `valid_from`/`valid_to` are exposed here specifically so
-- worth-picking-up.ts can re-apply `isInEffect` against the request's own
-- Zurich `today` — see docs/decisions/2026-09-15-in-effect-vs-upcoming.md
-- "Open" section, which names this migration.
--
-- WHY DROP + RECREATE, NOT ALTER
-- PostgreSQL has no `ALTER MATERIALIZED VIEW ... AS`. Both views must be
-- dropped and recreated. worth_picking_up_candidates JOINs onto
-- concept_cheapest_now, so it is dropped first (an explicit, ordered DROP
-- list here documents exactly what gets recreated below, rather than
-- relying on CASCADE to take a dependent view with it implicitly).
--
-- SAFETY
-- Neither view is a source of truth — both are pure derivations from
-- `sku` / `deals` / `user_interest`. Dropping and recreating them loses only
-- the cached `computed_at` snapshot, which the next scheduled REFRESH
-- (already run at the end of every pipeline run) replaces regardless.
-- Idempotent: safe to re-run — every statement is `DROP ... IF EXISTS`
-- (the `CREATE` statements' idempotency comes entirely from that; see the
-- `IF NOT EXISTS` note above the CREATE statements below).
--
-- WHY BEGIN/COMMIT
-- Running this file statement-by-statement in the Supabase SQL editor
-- auto-commits each one individually — there is no single implicit
-- transaction wrapping the whole file the way there is in `psql -f` or the
-- Supabase CLI's migration runner. Without an explicit transaction, a
-- failure between the two DROPs and the two CREATEs (a typo, a lock
-- timeout) would leave the database with NEITHER view — Surface 2 and
-- Surface 3 both down — until someone reruns the rest by hand. Wrapping the
-- whole file in one transaction means either both views end up recreated,
-- correctly, or neither DROP takes effect at all.
--
-- REVIEWER / PM — checks to run AFTER applying (this migration is NOT
-- applied by this change; see the PM instructions in the work package
-- report):
--
-- 1. GRANTS, THROUGH POSTGREST, NOT JUST PSQL. Materialised views have no
--    RLS (Postgres does not support RLS on matviews); access to both has
--    always relied on the anon role's default SELECT privilege on the
--    public schema, which is not tracked in any migration. A DROP + CREATE
--    cycle can in principle lose a privilege that was granted by hand. Do
--    not only check with `psql` (a superuser/service-role connection can
--    read past a missing anon grant without noticing) — check with the
--    ANON key, through PostgREST, the same way the app does:
--      curl "$SUPABASE_URL/rest/v1/concept_cheapest_now?limit=1" -H "apikey: $ANON_KEY"
--      curl "$SUPABASE_URL/rest/v1/worth_picking_up_candidates?limit=1" -H "apikey: $ANON_KEY"
--    A 400/404 here can mean either a missing grant OR a stale PostgREST
--    schema cache (PostgREST caches the schema and does not always notice a
--    DROP + CREATE cycle on its own). Try the schema reload FIRST, since
--    it is non-destructive and free, before assuming a grant is missing:
--      NOTIFY pgrst, 'reload schema';
--    If the REST call still 400s after that, the grant itself is missing —
--    restore it (as an admin/service-role connection), the same shape
--    Supabase's own default schema privilege grants:
--      GRANT SELECT ON concept_cheapest_now, worth_picking_up_candidates TO anon, authenticated;
--
-- 2. THE INDEX SURVIVED. `\d concept_cheapest_now_pk` (or
--    `SELECT indexname FROM pg_indexes WHERE tablename = 'concept_cheapest_now';`)
--    — confirm the unique index this migration recreates actually exists;
--    a typo in the CREATE UNIQUE INDEX statement would not fail loudly
--    (`worth_picking_up_candidates` does not depend on it), it would just
--    silently leave `concept_cheapest_now` without the index Surface 2's
--    query planner expects.
--
-- 3. ROW CONTENTS CHANGE, NOT JUST ROW COUNTS. Comparing row counts
--    before/after is not enough — for a concept where the previous
--    (wrong) filter let a not-yet-started deal win the `DISTINCT ON`
--    cheapest-price tiebreak, the total row count for that concept does
--    not change (still exactly one row per concept/region), but WHICH
--    deal that row now points to does. Spot-check a concept you know had a
--    future-dated deal live before this migration and confirm
--    `concept_cheapest_now.deal_id` now names a different, currently
--    in-effect deal — not just that the row count matches.
--
-- 4. A ZERO ROW COUNT MAY BE CORRECT, NOT A REGRESSION. If the pipeline is
--    mid-incident and only future-dated flyers exist for a store right now
--    (the exact RCA #10 scenario this WP exists to fix — see
--    docs/rca/2026-09-15-final-plan.md §1.3, "ALDI 0 of 127 ... in effect"),
--    `concept_cheapest_now` correctly having zero rows for that store's
--    concepts is the fix working as intended, not a bug in this migration.
--    Cross-check against `SELECT store, count(*) FROM deals WHERE is_active
--    AND valid_from <= CURRENT_DATE AND valid_to >= CURRENT_DATE GROUP BY
--    store;` before concluding the view is wrong.

BEGIN;

-- ============================================================
-- 1. Drop both views, dependant first.
-- ============================================================

DROP MATERIALIZED VIEW IF EXISTS worth_picking_up_candidates;
DROP MATERIALIZED VIEW IF EXISTS concept_cheapest_now;

-- ============================================================
-- 2. concept_cheapest_now — exposes valid_from; filters on the full window.
--    No `IF NOT EXISTS` here: the unconditional DROP above already
--    guarantees the view does not exist at this point, so `IF NOT EXISTS`
--    on the CREATE would be a dead clause that can never trigger — and,
--    worse, reads as if IT were what makes this migration idempotent, when
--    that is entirely the DROP ... IF EXISTS's job (see SAFETY above).
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
  NOW()                 AS computed_at
FROM sku s
JOIN deals d ON d.sku_id = s.id
WHERE d.valid_from <= CURRENT_DATE
  AND d.valid_to >= CURRENT_DATE
  AND d.is_active = true
ORDER BY s.concept_id, s.region_slug, d.sale_price ASC;

-- No `IF NOT EXISTS`: dropping the view above drops its indexes with it —
-- same reasoning as the CREATE MATERIALIZED VIEW statements.
CREATE UNIQUE INDEX concept_cheapest_now_pk
  ON concept_cheapest_now (concept_id, region_slug);

-- ============================================================
-- 3. worth_picking_up_candidates — same selection/scoring logic as before;
--    now also carries valid_from/valid_to through from concept_cheapest_now
--    so the web read path can re-apply isInEffect. No `IF NOT EXISTS` —
--    same reasoning as concept_cheapest_now above.
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

-- No `IF NOT EXISTS`: same reasoning as concept_cheapest_now_pk above.
CREATE INDEX worth_picking_up_user_score_idx
  ON worth_picking_up_candidates (user_email, score DESC);

-- ============================================================
-- 4. Comments (DROP removes them; re-applied here, text updated).
-- ============================================================

COMMENT ON MATERIALIZED VIEW concept_cheapest_now IS
  'Per (concept, region), the cheapest deal IN EFFECT (valid_from <= today <= valid_to). Refreshed at end of every pipeline_run; a materialised view freezes CURRENT_DATE at refresh time, so web read paths must still re-apply isInEffect for staleness between refreshes.';
COMMENT ON MATERIALIZED VIEW worth_picking_up_candidates IS
  'Per-user pre-scored Surface 3 candidates. discount >= 30% AND interest_weight (90d exp decay) AND not dismissed. Carries valid_from/valid_to through from concept_cheapest_now so the web read path can re-check isInEffect.';

COMMIT;

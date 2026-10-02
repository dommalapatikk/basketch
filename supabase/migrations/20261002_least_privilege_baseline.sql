-- Migration: least-privilege baseline for the public roles (anon, authenticated).
--
-- WHAT THIS DECLARES
-- Until now the access model of the public schema lived partly in migrations
-- and partly in hand-applied settings and platform defaults. This migration
-- states it in one place, so a database rebuilt from this folder ends up with
-- the same access model as production:
--
--   catalogue data (deals, products, product_groups, starter_packs)
--       -> RLS on, public SELECT policy, no public write
--   retired / internal relations (favourites, user_interest, pipeline_runs,
--   worth_picking_up_candidates)
--       -> service role only
--   every other base table in public
--       -> RLS on (no policy = service role only)
--   every relation in public
--       -> no INSERT / UPDATE / DELETE / TRUNCATE / REFERENCES / TRIGGER for
--          PUBLIC, anon or authenticated. The anon key only ever reads.
--   functions
--       -> the legacy favourites RPCs (used only by the retired Vite
--          frontend) and exec_refresh_mv are not executable by the public
--          roles; new functions are not executable by them by default
--          (section 7) — a migration that adds an RPC for the frontend must
--          GRANT EXECUTE explicitly.
--
-- WHAT THE LIVE SITE NEEDS
--   web-next reads exactly one relation with the anon key: deals (SELECT).
--   It calls no RPC. The pipeline uses the service role, which bypasses RLS
--   and keeps all of its grants — nothing here revokes from service_role.
--
-- IDEMPOTENT: every step is guarded (to_regclass / to_regprocedure /
-- DROP ... IF EXISTS / loops over what actually exists). Re-running it is a
-- no-op. It is also the file to re-apply if any OLDER migration is ever
-- re-run, because several of those re-grant privileges this file removes
-- (see the header of each, and supabase/migrations/README.md).
--
-- ATOMIC: sections 1-6 run in one transaction. Section 7 runs after COMMIT.
--
-- VERIFY: run supabase/checks/anon-privileges.sql afterwards. Every row must
-- be PASS.

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Retire the legacy favourites RPC grants.
--    Loops over pg_proc so every overload present is covered, not only the
--    signatures this repository knows about.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'create_favorite',
        'get_favorite',
        'update_favorite_email',
        'get_favorite_items',
        'add_favorite_item',
        'add_favorite_items_batch',
        'remove_favorite_item',
        'lookup_favorite_by_email'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    RAISE NOTICE 'revoked EXECUTE from PUBLIC/anon/authenticated: %', fn;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 2. exec_refresh_mv is a pipeline-only function (called with the service
--    role). REVOKE ... FROM PUBLIC does not remove the direct grants that
--    Supabase's default privileges give anon/authenticated, so name them.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.exec_refresh_mv(text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.exec_refresh_mv(text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.exec_refresh_mv(text) TO service_role;
  END IF;
END $$;

-- 2b. Report (not revoke) any other SECURITY DEFINER function in public that
--     anon can still execute. supabase/checks/anon-privileges.sql fails on
--     these; each one is a deliberate decision, not a blanket revoke.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    RAISE NOTICE 'anon-executable SECURITY DEFINER function (review): %', r.fn;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 3. Retired / internal relations -> service role only.
--    favorites, favorite_items : retired feature (frontend archived)
--    user_interest             : not used by any shipped code path
--    worth_picking_up_candidates (matview): matviews have no RLS, so the
--                                grant is the only control; web-next does
--                                not read it.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t text;
  pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY['favorites', 'favorite_items', 'user_interest'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      -- Drop every policy that applies to public/anon/authenticated
      -- (policy names vary across older setup scripts and migrations).
      FOR pol IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = t
          AND (roles && ARRAY['public', 'anon', 'authenticated']::name[])
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
        RAISE NOTICE 'dropped policy % on %', pol.policyname, t;
      END LOOP;
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    END IF;
  END LOOP;

  IF to_regclass('public.worth_picking_up_candidates') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.worth_picking_up_candidates FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 4. Catalogue tables — RLS on, public SELECT, no public write.
--    deals is the only one the live site reads; products / product_groups /
--    starter_packs keep the public read they already had.
--    The new policy is created BEFORE the legacy-named one is dropped, in the
--    same transaction, so read access is never interrupted.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t text;
  legacy text;
BEGIN
  FOREACH t IN ARRAY ARRAY['deals', 'products', 'product_groups', 'starter_packs'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_public_read', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)',
        t || '_public_read', t);

      -- Legacy policy name from docs/supabase-setup.sql / shared/001 — now
      -- redundant with <table>_public_read.
      legacy := 'Public read ' || t;
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', legacy, t);

      EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon, authenticated', t);
      EXECUTE format(
        'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    END IF;
  END LOOP;
END $$;

-- pipeline_runs: legacy run log. Public read, if any, goes through the
-- pipeline_runs_public view (owner-rights view that omits internal columns).
DO $$
BEGIN
  IF to_regclass('public.pipeline_runs') IS NOT NULL THEN
    ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public read pipeline_runs" ON public.pipeline_runs;
    REVOKE ALL ON TABLE public.pipeline_runs FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 5. Sweep — any other base table in public with RLS off gets it turned on
--    (no policy => service role only). Each one is reported by NOTICE.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
    RAISE NOTICE 'RLS enabled by sweep (no policy => service role only): %', r.relname;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 6. Defence in depth — the anon key never writes anything in basketch.
--    Remove every write privilege from the public roles on every relation in
--    public, so "RLS accidentally off" is never also "writable".
--    (ALL TABLES IN SCHEMA covers tables, views and materialised views.)
--    SELECT grants are left alone except where sections 3-4 set them.
-- ---------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;

COMMIT;

-- Ask PostgREST to pick up the new grants (non-destructive).
NOTIFY pgrst, 'reload schema';


-- =====================================================================
-- 7. Fail-closed default for new functions. Runs after COMMIT, on its own.
--    A function created by postgres in a later migration is NOT executable
--    by anon/authenticated unless that migration GRANTs it explicitly. If a
--    new RPC the frontend needs returns a permission error, the missing
--    explicit GRANT is the fix — that is the intended behaviour.
-- =====================================================================

-- PUBLIC's EXECUTE is a global default, so it is revoked without IN SCHEMA.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
-- Supabase's own per-schema defaults for the public roles.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

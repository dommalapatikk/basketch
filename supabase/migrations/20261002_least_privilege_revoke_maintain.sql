-- 20261002_least_privilege_revoke_maintain.sql
--
-- The public roles only ever READ. On PostgreSQL 17+ Supabase's defaults also
-- give anon and authenticated MAINTAIN (VACUUM, ANALYZE, REINDEX, REFRESH
-- MATERIALIZED VIEW, LOCK TABLE) on every table, view and materialised view
-- in public. None of that is reading, so it is removed from every existing
-- relation and from the defaults for new ones. The pipeline is unaffected: it
-- refreshes materialised views as the service role.
--
-- MAINTAIN does not exist before PostgreSQL 17 (REVOKE MAINTAIN is a syntax
-- error there), so the statements run only on 17+; older servers have
-- nothing to revoke.
--
-- Decided by the PM 2026-10-02; applied to production the same day and
-- checked with supabase/checks/anon-privileges.sql (rows A-9 and A-10).
--
-- Idempotent.

DO $$
BEGIN
  IF current_setting('server_version_num')::int >= 170000 THEN
    EXECUTE 'REVOKE MAINTAIN ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE MAINTAIN ON TABLES FROM anon, authenticated';
  END IF;
END $$;

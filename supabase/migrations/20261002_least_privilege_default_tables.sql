-- 20261002_least_privilege_default_tables.sql
--
-- Fail-closed defaults for NEW tables and sequences in public, completing the
-- function defaults set in 20261002_least_privilege_baseline.sql §7.
--
-- WHY
--   Supabase's per-schema default privileges give anon and authenticated full
--   write access to every table and sequence postgres creates in public. The
--   baseline revoked those privileges from every object that existed when it
--   ran, but a table added later would still be born writable by the anon key,
--   guarded only by RLS. After this migration a new table is readable at most,
--   and only once its own migration enables RLS and adds a SELECT policy.
--
-- WHAT IT DOES NOT DO
--   Existing objects are untouched (the baseline already covers them).
--   SELECT stays in the defaults: a table the site reads still needs its own
--   RLS SELECT policy, and RLS without a policy denies everything.
--
-- Applied to production 2026-10-02 (approved by the PM), then checked with
-- supabase/checks/anon-privileges.sql — row A-9 covers this file.
--
-- Idempotent. Runs outside a transaction like the baseline's §7.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE USAGE, UPDATE ON SEQUENCES FROM anon, authenticated;

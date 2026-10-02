-- anon-privileges.sql — access-model invariants for the public schema.
--
-- READ-ONLY. One SELECT, one row per invariant:
--   check_id | invariant | expected | actual | result (PASS / FAIL)
--
-- WHEN TO RUN
--   After applying ANY migration (or any hand-run SQL) to a Supabase project,
--   and after rebuilding a database from supabase/migrations/. Paste it into
--   the Supabase SQL editor and run it. Every row must be PASS.
--
-- WHAT A FAIL MEANS
--   The access model declared in 20261002_least_privilege_baseline.sql has
--   drifted. Re-apply that migration (it is idempotent), then re-run this
--   check. If a FAIL persists, a new object needs an explicit decision:
--     - a new table the site must read -> add an explicit SELECT policy and
--       GRANT SELECT in its own migration;
--     - a new RPC the site must call -> it must not be SECURITY DEFINER
--       unless reviewed, and needs an explicit GRANT EXECUTE.
--
-- THE MODEL BEING CHECKED
--   - The anon key only ever READS. It holds no write privilege anywhere,
--     at table or column level.
--   - Every base table in public has RLS enabled.
--   - No SECURITY DEFINER function in public is executable by anon.
--   - New functions are not executable by the public roles by default.
--   - New tables and sequences are not writable by the public roles by
--     default (20261002_least_privilege_default_tables.sql).
--   - anon can read deals (the one relation the live site needs).
--   - Service-only relations are not readable by anon.
--   - The pipeline (service role) can still write.

WITH
definer_fns AS (
  SELECT p.oid, p.oid::regprocedure AS sig
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef
    -- functions owned by an installed extension are the extension's concern
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
),
rels AS (
  SELECT c.oid, c.relname, c.relkind, c.relrowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
),
-- has_any_column_privilege is true for a table-level privilege OR a
-- privilege on any single column, so a column-level grant cannot hide.
-- (DELETE / TRUNCATE / TRIGGER exist only at table level.)
anon_write_rels AS (
  SELECT relname FROM rels
  WHERE has_any_column_privilege('anon', oid, 'INSERT')
     OR has_any_column_privilege('anon', oid, 'UPDATE')
     OR has_any_column_privilege('anon', oid, 'REFERENCES')
     OR has_table_privilege('anon', oid, 'DELETE')
     OR has_table_privilege('anon', oid, 'TRUNCATE')
     OR has_table_privilege('anon', oid, 'TRIGGER')
),
authenticated_write_rels AS (
  SELECT relname FROM rels
  WHERE has_any_column_privilege('authenticated', oid, 'INSERT')
     OR has_any_column_privilege('authenticated', oid, 'UPDATE')
     OR has_any_column_privilege('authenticated', oid, 'REFERENCES')
     OR has_table_privilege('authenticated', oid, 'DELETE')
     OR has_table_privilege('authenticated', oid, 'TRUNCATE')
     OR has_table_privilege('authenticated', oid, 'TRIGGER')
),
public_write_policies AS (
  SELECT tablename, policyname
  FROM pg_policies
  WHERE schemaname = 'public'
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
),
anon_select_policy AS (
  SELECT DISTINCT tablename
  FROM pg_policies
  WHERE schemaname = 'public'
    AND cmd IN ('SELECT', 'ALL')
    AND roles && ARRAY['public', 'anon']::name[]
),
service_only AS (
  SELECT r.relname, r.oid
  FROM rels r
  WHERE r.relname IN ('favorites', 'favorite_items', 'user_interest',
                      'worth_picking_up_candidates', 'pipeline_runs')
),
-- Default privileges are inspected for role postgres only: the role that runs
-- migrations from the SQL editor and the Supabase CLI. Objects created by any
-- other role (e.g. supabase_admin) follow that role's defaults and are outside
-- A-7 / A-8; A-1 still catches a resulting SECURITY DEFINER function.
fn_defaults AS (
  SELECT d.defaclnamespace, d.defaclacl
  FROM pg_default_acl d
  JOIN pg_roles r ON r.oid = d.defaclrole
  WHERE r.rolname = 'postgres' AND d.defaclobjtype = 'f'
),
-- Write privileges that new tables ('r') and sequences ('S') created by
-- postgres would hand to PUBLIC/anon/authenticated, from the global defaults
-- (namespace 0) or the public schema's own. Built-in defaults grant nothing
-- to these roles, so no row at all is also a pass.
default_write_grants AS (
  SELECT d.defaclobjtype::text || ':' || COALESCE(g.rolname::text, 'PUBLIC') || ':' || a.privilege_type AS grant_text
  FROM pg_default_acl d
  JOIN pg_roles r ON r.oid = d.defaclrole
  CROSS JOIN LATERAL aclexplode(d.defaclacl) a
  LEFT JOIN pg_roles g ON g.oid = a.grantee
  WHERE r.rolname = 'postgres'
    AND d.defaclnamespace IN (0, 'public'::regnamespace)
    AND (a.grantee = 0 OR g.rolname IN ('anon', 'authenticated'))
    AND ((d.defaclobjtype = 'r' AND a.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
      OR (d.defaclobjtype = 'S' AND a.privilege_type IN ('USAGE', 'UPDATE')))
),
checks(check_id, invariant, expected, actual, ok) AS (

  SELECT 'A-1', 'SECURITY DEFINER functions in public executable by anon', '(none)',
         COALESCE((SELECT string_agg(sig::text, ', ') FROM definer_fns
                   WHERE has_function_privilege('anon', oid, 'EXECUTE')), '(none)'),
         NOT EXISTS (SELECT 1 FROM definer_fns WHERE has_function_privilege('anon', oid, 'EXECUTE'))

  UNION ALL
  SELECT 'A-2', 'public base tables with RLS disabled', '(none)',
         COALESCE((SELECT string_agg(relname, ', ' ORDER BY relname) FROM rels
                   WHERE relkind IN ('r', 'p') AND NOT relrowsecurity), '(none)'),
         NOT EXISTS (SELECT 1 FROM rels WHERE relkind IN ('r', 'p') AND NOT relrowsecurity)

  UNION ALL
  SELECT 'A-3', 'public relations where anon holds INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER (table or column)', '(none)',
         COALESCE((SELECT string_agg(relname, ', ' ORDER BY relname) FROM anon_write_rels), '(none)'),
         NOT EXISTS (SELECT 1 FROM anon_write_rels)

  UNION ALL
  SELECT 'A-4', 'public relations where authenticated holds INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER (table or column)', '(none)',
         COALESCE((SELECT string_agg(relname, ', ' ORDER BY relname) FROM authenticated_write_rels), '(none)'),
         NOT EXISTS (SELECT 1 FROM authenticated_write_rels)

  UNION ALL
  SELECT 'A-5', 'write policies applying to public/anon/authenticated', '(none)',
         COALESCE((SELECT string_agg(tablename || '.' || policyname, ', ') FROM public_write_policies), '(none)'),
         NOT EXISTS (SELECT 1 FROM public_write_policies)

  UNION ALL
  SELECT 'A-6', 'service-only relations readable by anon', '(none)',
         COALESCE((SELECT string_agg(relname, ', ' ORDER BY relname) FROM service_only
                   WHERE has_any_column_privilege('anon', oid, 'SELECT')), '(none)'),
         NOT EXISTS (SELECT 1 FROM service_only WHERE has_any_column_privilege('anon', oid, 'SELECT'))

  UNION ALL
  SELECT 'A-7', 'new functions (owner postgres) executable by PUBLIC by default', 'false',
         (NOT EXISTS (SELECT 1 FROM fn_defaults
                      WHERE defaclnamespace = 0
                        AND NOT EXISTS (SELECT 1 FROM aclexplode(defaclacl) a
                                        WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')))::text,
         -- No global row at all means the built-in default applies: PUBLIC may EXECUTE.
         EXISTS (SELECT 1 FROM fn_defaults
                 WHERE defaclnamespace = 0
                   AND NOT EXISTS (SELECT 1 FROM aclexplode(defaclacl) a
                                   WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'))

  UNION ALL
  SELECT 'A-8', 'new functions in public executable by PUBLIC/anon/authenticated by default (per-schema)', 'false',
         EXISTS (SELECT 1 FROM fn_defaults f, aclexplode(f.defaclacl) a
                 WHERE f.defaclnamespace = 'public'::regnamespace
                   AND a.privilege_type = 'EXECUTE'
                   AND (a.grantee = 0  -- 0 = PUBLIC
                        OR a.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon', 'authenticated'))))::text,
         NOT EXISTS (SELECT 1 FROM fn_defaults f, aclexplode(f.defaclacl) a
                     WHERE f.defaclnamespace = 'public'::regnamespace
                       AND a.privilege_type = 'EXECUTE'
                       AND (a.grantee = 0  -- 0 = PUBLIC
                        OR a.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon', 'authenticated'))))

  UNION ALL
  SELECT 'A-9', 'new tables/sequences writable by PUBLIC/anon/authenticated by default (r:=table, S:=sequence)', '(none)',
         COALESCE((SELECT string_agg(grant_text, ', ' ORDER BY grant_text) FROM default_write_grants), '(none)'),
         NOT EXISTS (SELECT 1 FROM default_write_grants)

  -- ---------- the site and the pipeline still work ----------
  UNION ALL
  SELECT 'S-1', 'anon can read deals (SELECT grant + RLS SELECT policy)', 'true',
         COALESCE((SELECT (has_table_privilege('anon', oid, 'SELECT')
                           AND relrowsecurity
                           AND EXISTS (SELECT 1 FROM anon_select_policy WHERE tablename = 'deals'))::text
                   FROM rels WHERE relname = 'deals'), 'absent'),
         COALESCE((SELECT has_table_privilege('anon', oid, 'SELECT')
                          AND relrowsecurity
                          AND EXISTS (SELECT 1 FROM anon_select_policy WHERE tablename = 'deals')
                   FROM rels WHERE relname = 'deals'), false)

  UNION ALL
  SELECT 'S-2', 'service_role has BYPASSRLS', 'true',
         COALESCE((SELECT rolbypassrls::text FROM pg_roles WHERE rolname = 'service_role'), 'absent'),
         COALESCE((SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role'), false)

  UNION ALL
  SELECT 'S-3', 'service_role can INSERT and UPDATE deals and products', 'true',
         (has_table_privilege('service_role', 'public.deals', 'INSERT')
          AND has_table_privilege('service_role', 'public.deals', 'UPDATE')
          AND has_table_privilege('service_role', 'public.products', 'INSERT')
          AND has_table_privilege('service_role', 'public.products', 'UPDATE'))::text,
         has_table_privilege('service_role', 'public.deals', 'INSERT')
          AND has_table_privilege('service_role', 'public.deals', 'UPDATE')
          AND has_table_privilege('service_role', 'public.products', 'INSERT')
          AND has_table_privilege('service_role', 'public.products', 'UPDATE')

  UNION ALL
  SELECT 'S-4', 'service_role can execute exec_refresh_mv (if present)', 'true or absent',
         COALESCE((SELECT has_function_privilege('service_role', to_regprocedure('public.exec_refresh_mv(text)'), 'EXECUTE')::text
                   WHERE to_regprocedure('public.exec_refresh_mv(text)') IS NOT NULL), 'absent'),
         to_regprocedure('public.exec_refresh_mv(text)') IS NULL
           OR has_function_privilege('service_role', to_regprocedure('public.exec_refresh_mv(text)'), 'EXECUTE')
)
SELECT check_id, invariant, expected, actual,
       CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result
FROM checks
ORDER BY check_id;

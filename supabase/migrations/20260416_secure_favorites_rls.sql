-- Migration: Secure favorites + favorite_items via SECURITY DEFINER RPCs
-- Revokes direct table access from anon, routes all operations through functions
-- that require the favorite UUID (the access token) as a parameter.

-- ============================================================
-- 1. DROP EXISTING PERMISSIVE POLICIES
-- ============================================================

DROP POLICY IF EXISTS "Public insert favorites" ON favorites;
DROP POLICY IF EXISTS "Read own favorites by id" ON favorites;
DROP POLICY IF EXISTS "Read favorites by id only" ON favorites;
DROP POLICY IF EXISTS "Update own favorites by id" ON favorites;

DROP POLICY IF EXISTS "Public read favorite_items" ON favorite_items;
DROP POLICY IF EXISTS "Public insert favorite_items" ON favorite_items;
DROP POLICY IF EXISTS "Public delete favorite_items" ON favorite_items;

-- Create deny-all policies (service role bypasses RLS, so pipeline/admin still works)
-- No policies = anon cannot SELECT/INSERT/UPDATE/DELETE on these tables.

-- ============================================================
-- 2. FAVORITES RPCs (SECURITY DEFINER — run as table owner)
-- ============================================================

-- Create a new favorite list. Returns the full row.
CREATE OR REPLACE FUNCTION create_favorite(p_email TEXT DEFAULT NULL)
RETURNS favorites
LANGUAGE sql
SECURITY DEFINER
VOLATILE
AS $$
  INSERT INTO favorites (email) VALUES (p_email)
  RETURNING *;
$$;

GRANT EXECUTE ON FUNCTION create_favorite(TEXT) TO anon;

-- Fetch a favorite by its UUID (the access token).
CREATE OR REPLACE FUNCTION get_favorite(p_id UUID)
RETURNS favorites
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT * FROM favorites WHERE id = p_id LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_favorite(UUID) TO anon;

-- Update the recovery email on a favorite (must know the UUID).
CREATE OR REPLACE FUNCTION update_favorite_email(p_id UUID, p_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
AS $$
BEGIN
  UPDATE favorites SET email = p_email WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Favorite not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION update_favorite_email(UUID, TEXT) TO anon;

-- ============================================================
-- 3. FAVORITE ITEMS RPCs
-- ============================================================

-- Fetch all items for a favorite (must know the favorite UUID).
CREATE OR REPLACE FUNCTION get_favorite_items(p_favorite_id UUID)
RETURNS SETOF favorite_items
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT * FROM favorite_items
  WHERE favorite_id = p_favorite_id
  ORDER BY created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION get_favorite_items(UUID) TO anon;

-- Add a single item to a favorite. Returns the inserted row.
CREATE OR REPLACE FUNCTION add_favorite_item(
  p_favorite_id UUID,
  p_keyword TEXT,
  p_label TEXT,
  p_category TEXT,
  p_exclude_terms TEXT[] DEFAULT NULL,
  p_prefer_terms TEXT[] DEFAULT NULL,
  p_product_group_id TEXT DEFAULT NULL
)
RETURNS favorite_items
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
AS $$
DECLARE
  result favorite_items;
BEGIN
  -- Verify the favorite exists (caller must know the UUID)
  IF NOT EXISTS (SELECT 1 FROM favorites WHERE id = p_favorite_id) THEN
    RAISE EXCEPTION 'Favorite not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO favorite_items (favorite_id, keyword, label, category, exclude_terms, prefer_terms, product_group_id)
  VALUES (p_favorite_id, p_keyword, p_label, p_category, p_exclude_terms, p_prefer_terms, p_product_group_id)
  RETURNING * INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION add_favorite_item(UUID, TEXT, TEXT, TEXT, TEXT[], TEXT[], TEXT) TO anon;

-- Add multiple items at once (for starter pack import). Returns all inserted rows.
CREATE OR REPLACE FUNCTION add_favorite_items_batch(
  p_favorite_id UUID,
  p_items JSONB
)
RETURNS SETOF favorite_items
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
AS $$
BEGIN
  -- Verify the favorite exists
  IF NOT EXISTS (SELECT 1 FROM favorites WHERE id = p_favorite_id) THEN
    RAISE EXCEPTION 'Favorite not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  INSERT INTO favorite_items (favorite_id, keyword, label, category, exclude_terms, prefer_terms, product_group_id)
  SELECT
    p_favorite_id,
    item->>'keyword',
    item->>'label',
    item->>'category',
    CASE WHEN item->'excludeTerms' IS NOT NULL AND item->'excludeTerms' != 'null'::jsonb
         THEN ARRAY(SELECT jsonb_array_elements_text(item->'excludeTerms'))
         ELSE NULL END,
    CASE WHEN item->'preferTerms' IS NOT NULL AND item->'preferTerms' != 'null'::jsonb
         THEN ARRAY(SELECT jsonb_array_elements_text(item->'preferTerms'))
         ELSE NULL END,
    NULLIF(item->>'productGroupId', '')
  FROM jsonb_array_elements(p_items) AS item
  ON CONFLICT (favorite_id, keyword) DO NOTHING
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION add_favorite_items_batch(UUID, JSONB) TO anon;

-- Remove a single item. Must know both the favorite UUID and item UUID.
-- This prevents anonymous deletion of arbitrary items.
CREATE OR REPLACE FUNCTION remove_favorite_item(p_favorite_id UUID, p_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
AS $$
BEGIN
  DELETE FROM favorite_items
  WHERE id = p_item_id AND favorite_id = p_favorite_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found or does not belong to this favorite' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION remove_favorite_item(UUID, UUID) TO anon;

-- ============================================================
-- 4. HARDEN EMAIL LOOKUP RPC
-- ============================================================

-- Replace the old lookup function. The new version:
-- - Still returns UUID on match (needed for recovery flow)
-- - Uses plpgsql to ensure constant-time execution (no early return on miss)
-- - Adds a pg_sleep to slow down brute-force attempts
CREATE OR REPLACE FUNCTION lookup_favorite_by_email(lookup_email TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  result_id UUID;
BEGIN
  SELECT id INTO result_id FROM favorites WHERE email = lookup_email LIMIT 1;
  -- Constant-time: always perform the same work regardless of hit/miss
  PERFORM pg_sleep(0.1);
  RETURN result_id;
END;
$$;

-- ============================================================
-- 5. RESTRICT pipeline_runs to hide error_log from anon
-- ============================================================

-- Drop the old wide-open policy
DROP POLICY IF EXISTS "Public read pipeline_runs" ON pipeline_runs;

-- New policy: anon can read pipeline_runs but not the error_log column.
-- Since RLS is row-level not column-level, we use a view instead.
-- Note: pipeline_runs uses store_results JSONB (not legacy migros_*/coop_* columns).
CREATE OR REPLACE VIEW pipeline_runs_public AS
  SELECT id, run_at, store_results, total_stored, duration_ms
  FROM pipeline_runs;

GRANT SELECT ON pipeline_runs_public TO anon;

-- Re-add a restrictive policy: anon can read rows but error_log is hidden via the view.
-- Direct table access blocked (no policy = denied for anon).

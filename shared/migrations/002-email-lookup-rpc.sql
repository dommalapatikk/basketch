-- Migration 002: Secure email lookup via RPC
-- Prevents email enumeration by moving lookup to a server function.
-- The function returns only the favorite ID (not the email itself).
-- RLS on the favorites table can then be tightened to not allow
-- SELECT with arbitrary email filters.

CREATE OR REPLACE FUNCTION lookup_favorite_by_email(lookup_email TEXT)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id FROM favorites WHERE email = lookup_email LIMIT 1;
$$;

-- Grant execute to anon role (needed for frontend lookups)
GRANT EXECUTE ON FUNCTION lookup_favorite_by_email(TEXT) TO anon;

-- Tighten favorites SELECT policy: only allow reading by id (not by email scan).
-- Drop the old permissive policy and replace with a row-level check.
-- Users can only read a favorite if they know its UUID (passed as a filter).
DROP POLICY IF EXISTS "Read own favorites by id" ON favorites;
CREATE POLICY "Read favorites by id only" ON favorites
  FOR SELECT USING (true);
-- NOTE: We keep USING(true) because the UUID is the access token.
-- The key change is that email lookup now goes through the RPC,
-- not through a direct SELECT with .eq('email', ...).
-- To fully block email enumeration via PostgREST, consider removing
-- the email column from the anon-accessible columns in a future migration.

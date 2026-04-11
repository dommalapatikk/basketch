-- Migration 007: Fix wrong product-group assignments
-- Products assigned BEFORE migration 005 (which added exclude_keywords)
-- were never cleaned up. This migration:
-- 1. Clears product_group for products that violate their group's exclude_keywords
-- 2. Re-runs the backfill using search_keywords + exclude_keywords correctly

BEGIN;

-- ============================================================
-- 0. EXTEND EXCLUDE KEYWORDS where needed
-- ============================================================

-- Milk: also exclude praline/kägi products (e.g., "kägi praliné des alpes milk")
UPDATE product_groups SET
  exclude_keywords = exclude_keywords || ARRAY['praline', 'praliné', 'kägi', 'pralin', 'alpes']
WHERE id = 'milk-whole-1l';

-- ============================================================
-- 1. CLEAR WRONG ASSIGNMENTS
-- Remove product_group from products whose source_name contains
-- any of the group's exclude_keywords (case-insensitive)
-- ============================================================

UPDATE products p
SET product_group = NULL, product_form = 'raw'
FROM product_groups pg
WHERE p.product_group = pg.id
  AND EXISTS (
    SELECT 1 FROM unnest(pg.exclude_keywords) ek
    WHERE LOWER(p.source_name) LIKE '%' || LOWER(ek) || '%'
  );

-- ============================================================
-- 2. RE-ASSIGN using search_keywords + exclude_keywords
-- For products with no group, try to match them to the right group.
-- Uses word-boundary-aware matching on search_keywords.
-- ============================================================

-- Step 2a: Assign products to groups where a search_keyword matches
-- as a substring in the product name, AND no exclude_keyword matches.
-- Use DISTINCT ON to pick the first matching group per product.

UPDATE products p
SET product_group = matched.group_id,
    product_form = matched.pf
FROM (
  SELECT DISTINCT ON (p2.id)
    p2.id AS product_id,
    pg.id AS group_id,
    pg.product_form AS pf
  FROM products p2
  CROSS JOIN product_groups pg
  WHERE p2.product_group IS NULL
    AND EXISTS (
      SELECT 1 FROM unnest(pg.search_keywords) kw
      WHERE LOWER(p2.source_name) LIKE '%' || LOWER(kw) || '%'
    )
    AND NOT EXISTS (
      SELECT 1 FROM unnest(pg.exclude_keywords) ek
      WHERE ek <> '' AND LOWER(p2.source_name) LIKE '%' || LOWER(ek) || '%'
    )
  ORDER BY p2.id, pg.id
) matched
WHERE p.id = matched.product_id;

COMMIT;

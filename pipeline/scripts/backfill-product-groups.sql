-- Backfill: assign product_group to unclassified products
-- Uses product_groups.search_keywords and exclude_keywords to match

-- Step 1: Assign products to groups using search_keywords with word boundary matching
-- AND reject products that match any exclude_keyword
UPDATE products p
SET
  product_group = matched.group_id,
  product_form = matched.product_form
FROM (
  SELECT DISTINCT ON (p2.id)
    p2.id as product_id,
    pg.id as group_id,
    pg.product_form
  FROM products p2
  CROSS JOIN product_groups pg
  WHERE p2.product_group IS NULL
    -- At least one search keyword must match (word boundary aware)
    AND EXISTS (
      SELECT 1 FROM unnest(pg.search_keywords) kw
      WHERE p2.source_name ~* ('\m' || kw || '\M')
         OR p2.source_name ~* ('^' || kw)
         OR p2.source_name ~* (kw || '$')
    )
    -- No exclude keyword must match
    AND NOT EXISTS (
      SELECT 1 FROM unnest(pg.exclude_keywords) ek
      WHERE ek != '' AND p2.source_name ~* ek
    )
  -- Prefer more specific matches (longer keyword match = more specific)
  ORDER BY p2.id,
    (SELECT max(length(kw)) FROM unnest(pg.search_keywords) kw
     WHERE p2.source_name ~* ('\m' || kw || '\M')
        OR p2.source_name ~* ('^' || kw)) DESC
) matched
WHERE p.id = matched.product_id;

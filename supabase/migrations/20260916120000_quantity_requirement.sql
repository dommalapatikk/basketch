-- Migration: deals.min_quantity — the QuantityRequirement value object,
-- persisted (WP-C4, Tech Lead ruling D2, PM decision TP-7a).
--
-- BACKGROUND
-- docs/rca/2026-09-15-final-plan.md "D2": Migros prints an "ab N Stück"
-- ("from N items") price on about a third of a flyer's anchors. WP-C1
-- already parsed and counted these but withheld every one of them from
-- publishing, because there was nowhere honest to record "this price is
-- conditional on quantity" — publishing it bare would be the Art. 3(1)(e)
-- UWG failure this project exists to avoid. PM decision TP-7a: publish these
-- WITH a visible "from N items" label; unlabelled is not an option.
--
-- This column is what makes that label possible on the read side. The
-- pipeline-side work that populates it (`collection/domain/quantity-
-- requirement.ts`, the Migros adapter) is WP-C4; the web-side label and
-- verdict exclusion are WP-W4, a SEPARATE package, not landed here.
--
-- WHY A SEPARATE COLUMN, NOT A VARIANT OF price_basis
-- `price_basis` answers WHO may pay a price (everyone | a loyalty member).
-- `min_quantity` answers HOW MANY must be bought. They are independent facts
-- — "a Lidl Plus price, from 2 items" needs both to be true at once, which a
-- single unified column could not represent. See D2 in the RCA for the full
-- ruling.
--
-- WHY NULLABLE, NOT A DEFAULT OF 1
-- NULL means "the single-item price — no quantity condition was printed".
-- Defaulting to 1 would claim the retailer printed a stated minimum of one
-- item, which is not a real Migros form and is not what the domain records
-- (`QuantityRequirement` is `single | minimum(n>=2)` — there is no
-- `minimum(1)`, enforced in the constructor). A NULL is the honest
-- representation of "no condition was printed", the same reasoning already
-- applied to `original_price`/`discount_percent` (the ALDI rule) and to
-- `category` (D3, "we do not know" needs its own NULL, never a guess).
--
-- ============================================================
-- ⚠️ DELIBERATELY NOT DONE HERE: the identity constraint
-- ============================================================
-- `deals` has a live uniqueness rule on (store, product_name, valid_from) —
-- referenced throughout the codebase as `unique_deal` and used as the
-- `onConflict` target of every upsert (`pipeline/store.ts`,
-- `pipeline/storage/infrastructure/supabase-deal-store.ts`). That triple does
-- NOT include quantity. So the FIRST week a single product genuinely carries
-- both an everyone-price and an "ab N Stück" price (the KW36 fixture this
-- WP was built against does not — verified: none of its five "ab 2 Stück"
-- product names collide with any of its twelve single-item ones, so this is
-- not yet observed, only foreseeable), those two rows will collide:
--   - `pipeline/store.ts`'s own in-memory dedupe (keyed on the SAME triple)
--     silently keeps only one of the two BEFORE either reaches the database.
--   - Even if that in-memory dedupe were widened to key on quantity too, the
--     database's own upsert `onConflict` target could not distinguish them
--     either — Postgres either rejects the batch (23505 / 21000, "cannot
--     affect row a second time") if both land in one statement, or silently
--     overwrites one with the other if they land in different batches.
--
-- This migration adds ONLY the column, deliberately, for two reasons:
--   1. `ON CONFLICT (store, product_name, valid_from)` in `store.ts` and
--      `supabase-deal-store.ts` — BOTH lane-P/lane-C files this work package
--      does not own — would need to change in the SAME breath as any
--      constraint change, or every upsert on this table fails outright with
--      "there is no unique or exclusion constraint matching the ON CONFLICT
--      specification". Landing a constraint change here, alone, would break
--      the live write path the moment this migration is applied.
--   2. A UNIQUE constraint's NULL handling is a trap for exactly this
--      column: by default, Postgres treats NULL <> NULL for uniqueness
--      purposes, so simply adding `min_quantity` to the existing constraint
--      would NOT make ordinary (NULL) offers collide with each other the
--      way they must — every re-run of an ordinary week would start
--      INSERTING duplicate rows instead of updating the existing one,
--      breaking "idempotent writes via UPSERT" (CLAUDE.md) for the ~90%+ of
--      offers that are NOT multi-buy. A correct fix needs either
--      `UNIQUE NULLS NOT DISTINCT` (Postgres 15+) or a unique index on
--      `(store, product_name, valid_from, COALESCE(min_quantity, 0))` —
--      and Postgres requires `ON CONFLICT` to name the SAME expression list
--      as the index it targets, so the `onConflict` string in both call
--      sites would need to change to match, not just the constraint.
--
-- The coordinated fix (constraint + both onConflict call sites + the
-- in-memory dedupe key in `store.ts`, all in one change, reviewed together)
-- is real follow-up work, not a "wait indefinitely" — flagged here for the
-- Tech Lead as the next decision point once a real week actually prints both
-- forms for one product. Until it lands, review this migration's own
-- section 3 below (`min_quantity_conflict_idx`, informational only) before
-- assuming the risk is theoretical.
--
-- ============================================================
-- SAFETY
-- ============================================================
-- Additive only. Nothing is dropped, nothing renamed. Every statement is
-- idempotent (IF NOT EXISTS), so re-running this file is a no-op.

-- ============================================================
-- 1. THE COLUMN
-- ============================================================

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS min_quantity SMALLINT;

ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_min_quantity_at_least_two;
ALTER TABLE deals ADD CONSTRAINT deals_min_quantity_at_least_two
  CHECK (min_quantity IS NULL OR min_quantity >= 2);

COMMENT ON COLUMN deals.min_quantity IS
  'How many items must be bought for sale_price to apply (WP-C4, "ab N Stück"). NULL = the single-item price, the ordinary case. A conditional price must always be shown with its "from N items" label — never bare (Art. 3(1)(e) UWG, the same rule already applied to a member-only price). Read-side label and verdict exclusion land in WP-W4, not this migration.';

-- ============================================================
-- 2. INDEX — filtering/reporting only, NOT a uniqueness fix
-- ============================================================
-- Lets a query cheaply find "this week's multi-buy offers" (a funnel-style
-- report, a QA spot-check) without a sequential scan. Deliberately a plain
-- partial index, not part of any uniqueness rule — see the section above.

CREATE INDEX IF NOT EXISTS deals_min_quantity_idx
  ON deals (min_quantity) WHERE min_quantity IS NOT NULL;

-- ============================================================
-- 3. INFORMATIONAL ONLY — NOT APPLIED, NOT a constraint
-- ============================================================
-- Left here as the shape of the coordinated fix described above, for
-- whoever picks up that follow-up, so the exact expression does not need to
-- be rediscovered. This index is NOT created by this migration (no
-- CREATE UNIQUE INDEX statement follows) and `store.ts` / `supabase-deal-
-- store.ts` still target the plain 3-column constraint until that follow-up
-- lands and updates both call sites in the same change:
--
--   CREATE UNIQUE INDEX deals_identity_with_quantity_idx
--     ON deals (store, product_name, valid_from, COALESCE(min_quantity, 0));
--
--   -- and both call sites become:
--   .upsert(batch, { onConflict: 'store,product_name,valid_from,min_quantity' })
--   -- NOTE: onConflict must name the SAME expression the index uses; a
--   -- literal 'min_quantity' column reference will NOT match an index built
--   -- on COALESCE(min_quantity, 0) — Postgres matches ON CONFLICT targets by
--   -- expression, not by "close enough". This exact wording needs verifying
--   -- against the PostgREST/Supabase client's upsert() signature (does it
--   -- accept an expression list, or only bare column names?) before it is
--   -- built, which is exactly why it is not being built in this migration.

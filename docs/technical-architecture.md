# Technical Architecture: basketch

**Author:** Architect Agent
**Date:** 9 April 2026
**Updated:** 10 April 2026
**Version:** 1.1
**Status:** Draft
**Inputs:** PRD v1.0, Use Cases v1.2, Architecture Decisions, Roadmap, Phase 0 data source validation
**Changes:** Updated for favorites-first pivot + product search

---

## 1. System Overview

```
              WEEKLY PIPELINE (Wednesday 21:00 UTC / 22:00 CET)
              + Verification fetch (Thursday 06:00 UTC)
              =================================================

 +------------------+     +-------------------+     +------------------+
 | Migros Source    |     | Coop Source        |     | Categorizer      |
 | (TypeScript)     |     | (Python)           |     | (TypeScript)     |
 |                  |     |                    |     |                  |
 | migros-api-      |     | requests +         |     | Keyword rules    |
 | wrapper (npm)    |     | BeautifulSoup      |     | map products to  |
 | Guest OAuth2     |     | aktionis.ch/       |     | Fresh / Long-    |
 | POST promotions  |     | vendors/coop       |     | life / Non-food  |
 +--------+---------+     +--------+-----------+     +--------+---------+
          |                         |                          |
          v                         v                          v
 +--------+---------+     +--------+-----------+     +--------+---------+
 | Normalized JSON  |     | Normalized JSON    |     | Categorized JSON |
 | (UnifiedDeal[])  |     | (UnifiedDeal[])    |     | (Deal[])         |
 +--------+---------+     +--------+-----------+     +--------+---------+
          |                         |                          |
          +------------+------------+--------------------------+
                       |
                       v
              +--------+---------+
              | Storage Module   |        DATA PATH A: Pipeline
              | (TypeScript)     |        Fills deals table weekly
              |                  |
              | Upsert to        |
              | Supabase via     |
              | @supabase/       |
              | supabase-js      |
              +--------+---------+
                       |
                       v
              +--------+------------------+
              | Supabase                  |
              | (PostgreSQL)              |
              |                           |
              | deals table               |
              | pipeline_runs             |
              | starter_packs             |
              | favorites                 |
              | favorite_items            |
              +--------+------------------+
                       ^
                       | Supabase JS client
                       | (read deals, read/write favorites)
                       |
              +--------+------------------+
              | Vercel (React SPA)        |
              |                           |
              | FIRST VISIT (Onboarding): |
              |  1. TemplatePicker        |
              |     ("How do you cook?")  |
              |  2. FavoritesEditor       |
              |     (remove + search)     |
              |  3. ComparisonView        |
              |     (which are on sale?)  |
              |  4. EmailCapture          |
              |     (save for next week)  |
              |                           |    DATA PATH B: User
              | RETURN VISIT:             |    Creates/retrieves
              |  1. EmailLookup           |    favorites via frontend
              |  2. ComparisonView        |
              |  3. Shop!                 |
              +--------+------------------+
                       ^
                       |
                  User (mobile browser)
```

### Deployment Model

| Component | Runs on | Trigger |
|-----------|---------|---------|
| Migros source | GitHub Actions (Node.js 20) | Cron: Wednesday 21:00 UTC |
| Coop source | GitHub Actions (Python 3.12) | Cron: Wednesday 21:00 UTC |
| Categorizer + Storage | GitHub Actions (Node.js 20) | After both sources complete |
| Verification fetch | GitHub Actions (Node.js 20 + Python 3.12) | Cron: Thursday 06:00 UTC |
| Supabase | Supabase cloud (free tier) | Always on |
| Frontend | Vercel (free tier, global CDN) | Auto-deploy on push to main |

### Two Data Paths

The system has two independent data flows:

| Path | What | Who triggers | Frequency |
|------|------|-------------|-----------|
| **A: Pipeline** | Fetches deals from Migros + Coop, categorizes, upserts to `deals` table | GitHub Actions cron | Weekly (Wednesday night + Thursday morning verification) |
| **B: User favorites** | User selects starter pack, customizes with search, saves with email | Frontend (user interaction) | On demand |

Path A fills the `deals` table. Path B fills the `favorites` and `favorite_items` tables. The comparison view joins them: for each favorite keyword, find matching active deals.

### Mixed-Language Decision

The pipeline uses two languages because the data sources require it:

- **TypeScript (Node.js):** Required for Migros because `migros-api-wrapper` is an npm package with no Python equivalent. It handles Cloudflare bypass via TLS 1.3 + Firefox User-Agent.
- **Python:** Best choice for Coop because `requests` + `BeautifulSoup` is the simplest way to scrape server-rendered HTML from aktionis.ch.

The orchestrator runs both in a single GitHub Actions workflow using two jobs (one Node.js, one Python) that output normalized JSON. A third Node.js job reads both outputs, categorizes, and writes to Supabase.

---

## 2. Module Design

### 2.1 Pipeline: Migros Source

| Attribute | Detail |
|-----------|--------|
| **Responsibility** | Fetch current Migros promotions and output normalized deal JSON |
| **Language** | TypeScript (Node.js 20) |
| **Key dependency** | `migros-api-wrapper` (npm v1.1.37) |
| **Interface** | `fetchMigrosDeals(): Promise<UnifiedDeal[]>` |
| **Input** | None (uses guest OAuth2 — no credentials needed) |
| **Output** | Array of `UnifiedDeal` objects written to `migros-deals.json` (GitHub Actions artifact) |
| **Error handling** | If API returns empty or throws, log error and output empty array. Pipeline continues with Coop only. |
| **Testing** | Integration test: call the real API, assert response shape matches `UnifiedDeal`. Mock test: verify normalization logic with fixture data. |

**API call pattern:**
```typescript
// POST /product-display/public/web/v2/products/promotion/search
// Body: { period: "CURRENT" }
// Paginate via from/until parameters until items[] is empty
```

### 2.2 Pipeline: Coop Source

| Attribute | Detail |
|-----------|--------|
| **Responsibility** | Scrape current Coop promotions from aktionis.ch and output normalized deal JSON |
| **Language** | Python 3.12 |
| **Key dependencies** | `requests`, `beautifulsoup4` |
| **Interface** | `fetch_coop_deals() -> list[UnifiedDeal]` |
| **Input** | None |
| **Output** | Array of `UnifiedDeal` dicts written to `coop-deals.json` (GitHub Actions artifact) |
| **Error handling** | If aktionis.ch returns non-200 or HTML structure changes, log error and output empty array. Pipeline continues with Migros only. |
| **Testing** | Integration test: fetch page 1, assert at least 1 deal parsed. Mock test: parse a saved HTML fixture, verify extraction logic. |

**Scraping pattern:**
```python
# GET aktionis.ch/vendors/coop/1, /vendors/coop/2, etc.
# Parse product cards from server-rendered HTML
# Optionally fetch detail pages for schema.org JSON-LD (richer data)
# Stop when page returns 0 products
```

### 2.3 Pipeline: Categorizer

| Attribute | Detail |
|-----------|--------|
| **Responsibility** | Map each `UnifiedDeal` to one of three categories: `fresh`, `long-life`, `non-food` |
| **Language** | TypeScript |
| **Interface** | `categorizeDeal(deal: UnifiedDeal): Category` |
| **Input** | `UnifiedDeal` (with `sourceCategory` and `productName` fields) |
| **Output** | `Deal` (same as `UnifiedDeal` + `category` field) |
| **Logic** | Keyword matching against product name and source category. See mapping rules in use-cases.md UC-4. Default: `long-life` (safest bucket). |
| **Dependencies** | `category-rules.ts` — a flat array of `{ keywords: string[], category: Category }` objects, checked in order. |
| **Testing** | Unit test: pass known product names, assert correct category. Edge case test: unknown product defaults to `long-life`. |

**Category rules structure:**
```typescript
const CATEGORY_RULES: CategoryRule[] = [
  { keywords: ['gemüse', 'frucht', 'milch', 'fleisch', 'brot', 'eier', 'salat', 'joghurt', 'käse', 'butter'], category: 'fresh' },
  { keywords: ['waschmittel', 'reinigung', 'pflege', 'hygiene', 'haushalt', 'papier', 'shampoo', 'seife'], category: 'non-food' },
  // Everything else falls through to 'long-life' default
];
```

### 2.4 Pipeline: Storage

| Attribute | Detail |
|-----------|--------|
| **Responsibility** | Write categorized deals to Supabase. Mark old deals as inactive. Log pipeline run. |
| **Language** | TypeScript |
| **Key dependency** | `@supabase/supabase-js` |
| **Interface** | `storeDeal(deals: Deal[]): Promise<void>` and `logPipelineRun(run: PipelineRun): Promise<void>` |
| **Input** | Array of `Deal` objects (already categorized) |
| **Output** | Rows in `deals` and `pipeline_runs` tables |
| **Upsert logic** | Match on `store + product_name + valid_from`. If exists, update prices/discount. If new, insert. |
| **discount_percent guarantee** | Before storing, if `discount_percent` is null but `original_price` and `sale_price` are both present, calculate it: `Math.round((1 - salePrice / originalPrice) * 100)`. `discount_percent` is only allowed to be null when `original_price` is null. |
| **Name normalization** | Before upsert, normalize product names: lowercase, collapse whitespace, standardize unit abbreviations (e.g., "1.5 L" to "1.5l", "500 G" to "500g"). This prevents duplicate rows from minor formatting differences between pipeline runs. |
| **Expiry logic** | Before inserting new deals, set `is_active = false` on all deals where `valid_to < now()`. |
| **Testing** | Integration test against Supabase (use a test project or mock). Unit test: verify upsert conflict key construction. |

### 2.5 Pipeline: Orchestrator

| Attribute | Detail |
|-----------|--------|
| **Responsibility** | Run the full pipeline end-to-end. Coordinate Migros fetch, Coop fetch, categorization, and storage. Handle partial failures. |
| **Implementation** | GitHub Actions workflow (YAML), not application code. Each source is a separate job. Categorization + storage is a third job that depends on the first two. |
| **Error handling** | If Migros job fails, Coop job still runs (and vice versa). The storage job runs if at least one source succeeded. |
| **Logging** | Each job logs to GitHub Actions console. The storage job writes a `pipeline_runs` row with source statuses and deal counts. |
| **Testing** | Manual trigger via `workflow_dispatch`. Verify deals appear in Supabase after run. |
| **JSON validation** | `run.ts` must validate the JSON from the Python Coop scraper against the `UnifiedDeal` schema before processing. If any field is missing or has the wrong type, log the invalid entry and skip it rather than crashing the pipeline. This is the trust boundary between the Python and TypeScript halves. |

**Workflow structure:**
```yaml
jobs:
  fetch-migros:      # Node.js 20, uploads migros-deals.json artifact
  fetch-coop:        # Python 3.12, uploads coop-deals.json artifact
  process-and-store: # Node.js 20, downloads both artifacts, categorizes, upserts
    needs: [fetch-migros, fetch-coop]
    if: always()     # Runs even if one source failed
```

### 2.6 Frontend: Data Layer

| Attribute | Detail |
|-----------|--------|
| **Responsibility** | Fetch deal data from Supabase for the frontend. Provide typed query functions. Manage favorites and search. |
| **Language** | TypeScript |
| **Key dependency** | `@supabase/supabase-js` |
| **Interface** | `getActiveDeals(): Promise<Deal[]>`, `getDealsByCategory(category: Category): Promise<Deal[]>`, `getLatestPipelineRun(): Promise<PipelineRun>` |
| **Caching** | React Query (`@tanstack/react-query`) with `staleTime: 1 hour`. Data changes once per week — aggressive caching is correct. |
| **Testing** | Mock Supabase client, verify query construction. E2E: verify data renders on page. |

**Additional query functions (favorites-first pivot):**

| Function | Returns | Description |
|----------|---------|-------------|
| `getStarterPacks(): Promise<StarterPack[]>` | Active starter packs ordered by sort_order | Feeds the TemplatePicker |
| `searchProducts(query: string): Promise<string[]>` | Distinct product names matching the query | Used by FavoritesEditor search bar |
| `saveFavorites(items: FavoriteItem[], email?: string): Promise<Favorite>` | Saved favorite record | Creates favorites + favorite_items rows |
| `getFavoritesByEmail(email: string): Promise<Favorite & { items: FavoriteItem[] }>` | Favorite with items | Used by returning users to retrieve their list |
| `getComparisonForFavorites(favoriteId: string): Promise<FavoriteComparison[]>` | Matched favorites with deals | Joins favorite keywords against active deals |

### 2.7 Frontend: Verdict

| Attribute | Detail |
|-----------|--------|
| **Responsibility** | Calculate and display the weekly verdict banner. |
| **Language** | TypeScript (React component) |
| **Interface** | `<VerdictBanner deals={Deal[]} />` |
| **Logic** | For each category, calculate a score per store: `(0.4 * dealCountShare) + (0.6 * avgDiscountShare)`. Winner is the store with the higher score. If within 5%, declare a tie. |
| **Output** | Banner text: "This week: Migros for Fresh, Coop for Non-food" (or variations for ties, missing data) |
| **Edge cases** | One store missing: "Only [store] deals available". Both missing: "Deals may be outdated — last updated [date]". |
| **Testing** | Unit test: pass fixture deals, assert verdict text. Test tie case, single-store case, empty case. |

### 2.8 Frontend: Deal Cards

| Attribute | Detail |
|-----------|--------|
| **Responsibility** | Display deal listings grouped by category, sorted by discount. |
| **Language** | TypeScript (React components) |
| **Components** | `<CategorySection>`, `<DealCard>`, `<StoreBadge>` |
| **Interface** | `<CategorySection category="fresh" deals={Deal[]} />` |
| **Sorting** | Deals sorted by `discount_percent` descending within each category. |
| **Truncation** | Show top 10 deals per store per category. "Show all N deals" button expands. |
| **Testing** | Snapshot test for card layout. Unit test for sort logic. |

### 2.9 Shared: Types

| Attribute | Detail |
|-----------|--------|
| **Responsibility** | Single source of truth for all data types used by pipeline and frontend. |
| **Language** | TypeScript |
| **Location** | `shared/types.ts` |
| **Consumed by** | Pipeline modules (Migros source, categorizer, storage) and frontend (data layer, components). Imported via `@shared/types` path alias. |

### 2.10 Frontend: Onboarding Flow

| Attribute | Detail |
|-----------|--------|
| **Responsibility** | Guide first-time users through template selection, customization (remove/add via search), and email save |
| **Language** | TypeScript (React components) |
| **Components** | `TemplatePicker`, `FavoritesEditor`, `ProductSearch`, `EmailCapture` |

**Component details:**

| Component | Role |
|-----------|------|
| `TemplatePicker` | Shows starter pack options. Prompt: "How do you cook?" Options: Swiss Basics, Indian Kitchen, Mediterranean, General. Each loads a pre-defined list of grocery keywords. |
| `FavoritesEditor` | Shows the pre-loaded items from the selected starter pack with remove buttons + a search bar to add new items. Users customize until their list feels right. |
| `ProductSearch` | Searches the `deals` database for matching products. Partial/fuzzy match on `product_name`. Uses Supabase `ilike` or full-text search. Returns distinct product names for the user to add. |
| `EmailCapture` | Appears AFTER showing the comparison view (Phil Carter Psych Framework: front-load value, back-load data collection). Simple email input: "Save your list for next week?" Optional — user can skip. |

**Search implementation:**
- Matches against `deals.product_name` using Supabase `ilike('%keyword%')`
- Deduplicates by product_name (same product may appear in multiple weeks)
- Returns top 20 matches, ordered by relevance (exact match first, then partial)
- Start with `ilike`; add `pg_trgm` extension + GIN index if performance degrades

### 2.11 Frontend: Comparison View

| Attribute | Detail |
|-----------|--------|
| **Responsibility** | Show personalized comparison — which favorites are on sale this week, split by store |
| **Language** | TypeScript (React components) |
| **Components** | `ComparisonView`, `SplitList`, `FavoriteMatchCard` |

**Grouping logic:**
- "Buy at Migros" — favorites where Migros has a better deal (or only Migros has it)
- "Buy at Coop" — favorites where Coop has a better deal (or only Coop has it)
- "No deals this week" — favorites with no matching active deals at either store

**Card display:** Each matched item shows product name, deal price, savings (discount %), and store badge.

**Availability:** The comparison view is used in two contexts:
1. First visit — shown after template selection and customization (before email capture)
2. Return visit — shown after email lookup retrieves saved favorites

### 2.12 Frontend: Email Lookup

| Attribute | Detail |
|-----------|--------|
| **Responsibility** | Allow returning users to retrieve their saved favorites by email |
| **Language** | TypeScript (React component) |
| **Component** | `EmailLookup` |

**Behavior:**
- Simple email input on the home page for returning users
- Retrieves favorites by email from Supabase: `favorites` joined with `favorite_items`
- If found: navigates to ComparisonView with the user's favorites
- If not found: "No favorites found. Set up your list?" with a link to onboarding
- No password, no auth — email is just a lookup key (acceptable for MVP because there is no sensitive data, only product keywords)

---

## 3. Data Architecture

### 3.1 Table: `deals`

```sql
CREATE TABLE deals (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store         TEXT NOT NULL CHECK (store IN ('migros', 'coop')),
  product_name  TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN ('fresh', 'long-life', 'non-food')),
  original_price DECIMAL(10, 2),
  sale_price    DECIMAL(10, 2) NOT NULL,
  discount_percent INTEGER,
  valid_from    DATE NOT NULL,
  valid_to      DATE,
  image_url     TEXT,
  source_category TEXT,
  source_url    TEXT,
  is_active     BOOLEAN DEFAULT true,
  fetched_at    TIMESTAMPTZ DEFAULT now(),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT unique_deal UNIQUE (store, product_name, valid_from)
);
```

**Auto-update `updated_at` on row changes:**

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER deals_updated_at
  BEFORE UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

### 3.2 Table: `pipeline_runs`

```sql
CREATE TABLE pipeline_runs (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_at          TIMESTAMPTZ DEFAULT now(),
  migros_status   TEXT CHECK (migros_status IN ('success', 'failed', 'skipped')),
  migros_count    INTEGER DEFAULT 0,
  coop_status     TEXT CHECK (coop_status IN ('success', 'failed', 'skipped')),
  coop_count      INTEGER DEFAULT 0,
  total_stored    INTEGER DEFAULT 0,
  duration_ms     INTEGER,
  error_log       TEXT
);
```

### 3.3 Table: `starter_packs`

Read-only reference table, seeded by pipeline/admin. Contains pre-defined grocery lists for onboarding.

```sql
CREATE TABLE starter_packs (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  description TEXT,
  items       JSONB NOT NULL DEFAULT '[]',
  sort_order  INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

`items` is a JSONB array of objects:
```json
[
  {"keyword": "milch", "label": "Milk", "category": "fresh"},
  {"keyword": "reis", "label": "Rice", "category": "long-life"},
  {"keyword": "waschmittel", "label": "Laundry Detergent", "category": "non-food"}
]
```

### 3.4 Table: `favorites`

User's saved favorite list. Email is nullable — user can browse without saving. Email is added later when they choose to save.

```sql
CREATE TABLE favorites (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_favorites_email ON favorites (email) WHERE email IS NOT NULL;
```

### 3.5 Table: `favorite_items`

Individual items within a user's favorites list.

```sql
CREATE TABLE favorite_items (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  favorite_id UUID NOT NULL REFERENCES favorites(id) ON DELETE CASCADE,
  keyword     TEXT NOT NULL,
  label       TEXT NOT NULL,
  category    TEXT NOT NULL CHECK (category IN ('fresh', 'long-life', 'non-food')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_favorite_item UNIQUE (favorite_id, keyword)
);

CREATE INDEX idx_favorite_items_favorite_id ON favorite_items (favorite_id);
```

### 3.6 Indexes

```sql
-- Primary query: active deals for current week, grouped by category and store
CREATE INDEX idx_deals_active_category ON deals (is_active, category, store)
  WHERE is_active = true;

-- Expiry management: find deals past their valid_to date
CREATE INDEX idx_deals_valid_to ON deals (valid_to)
  WHERE is_active = true;

-- Upsert conflict resolution
-- (covered by UNIQUE constraint on store, product_name, valid_from)

-- Product search: partial match on product_name for favorites search
-- Start with ilike (no index needed for small tables).
-- If slow, add pg_trgm extension + GIN index:
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX idx_deals_product_name_trgm ON deals USING GIN (product_name gin_trgm_ops);

-- Starter packs: sort by sort_order (small table, no index needed)

-- Favorites email lookup
-- (covered by UNIQUE INDEX idx_favorites_email above)

-- Favorite items by favorite_id
-- (covered by CREATE INDEX idx_favorite_items_favorite_id above)

-- Favorite items unique constraint
-- (covered by CONSTRAINT unique_favorite_item above)
```

### 3.7 Row-Level Security

```sql
-- Enable RLS on all tables
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE starter_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorite_items ENABLE ROW LEVEL SECURITY;

-- Public read access (no login required)
CREATE POLICY "Public read deals" ON deals
  FOR SELECT USING (true);

CREATE POLICY "Public read pipeline_runs" ON pipeline_runs
  FOR SELECT USING (true);

CREATE POLICY "Public read starter_packs" ON starter_packs
  FOR SELECT USING (true);

-- Favorites: read/write via anon key
-- No auth for MVP. Users manage their own favorites.
-- Acceptable because there is no sensitive data (just product keywords + optional email).
CREATE POLICY "Public read favorites" ON favorites
  FOR SELECT USING (true);

CREATE POLICY "Public insert favorites" ON favorites
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Public update favorites" ON favorites
  FOR UPDATE USING (true);

CREATE POLICY "Public read favorite_items" ON favorite_items
  FOR SELECT USING (true);

CREATE POLICY "Public insert favorite_items" ON favorite_items
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Public delete favorite_items" ON favorite_items
  FOR DELETE USING (true);

-- Write access to deals and pipeline_runs only via service role key (used by pipeline)
-- No INSERT/UPDATE/DELETE policies for anon key on deals or pipeline_runs

-- Write access to starter_packs only via service role key (seeded by admin)
-- No INSERT/UPDATE/DELETE policies for anon key on starter_packs
```

### 3.8 Data Lifecycle

| Event | Action |
|-------|--------|
| Pipeline runs (Wednesday night + Thursday morning verification) | Upsert new deals. Mark deals with `valid_to < now()` as `is_active = false`. |
| Frontend queries (deals) | Filter `WHERE is_active = true`. Only show current deals. |
| Frontend queries (favorites) | Retrieve by email. No expiry — favorites persist indefinitely. |
| User creates favorites | Insert into `favorites` + `favorite_items`. Email added later via update. |
| User modifies favorites | Add/remove rows in `favorite_items`. Update `favorites.updated_at`. |
| Data retention | Keep expired deals indefinitely (supports future archive/history pages for SEO + broader product catalog for search). No deletion. |
| Free tier limit | 500MB / 50K rows. Deals: ~300/week = ~15K rows/year. Starter packs: ~5 rows. Favorites: ~50 rows (friends). Favorite items: ~1000 rows. Total well within 50K limit for 3+ years. |

---

## 4. Folder Structure

```
basketch/
├── .github/
│   └── workflows/
│       └── pipeline.yml            # Weekly cron workflow
│
├── pipeline/                       # Data pipeline (TypeScript + Python)
│   ├── migros/                     # Migros source (TypeScript)
│   │   ├── fetch.ts                # fetchMigrosDeals()
│   │   ├── normalize.ts            # Raw API response → UnifiedDeal[]
│   │   ├── fetch.test.ts
│   │   └── fixtures/               # Saved API responses for testing
│   │       └── migros-response.json
│   │
│   ├── coop/                       # Coop source (Python)
│   │   ├── fetch.py                # fetch_coop_deals()
│   │   ├── normalize.py            # Raw HTML → UnifiedDeal dicts
│   │   ├── test_fetch.py
│   │   ├── fixtures/               # Saved HTML pages for testing
│   │   │   └── coop-page-1.html
│   │   └── requirements.txt        # requests, beautifulsoup4
│   │
│   ├── categorize.ts               # categorizeDeal()
│   ├── categorize.test.ts
│   ├── store.ts                    # storeDeal(), logPipelineRun()
│   ├── store.test.ts
│   ├── run.ts                      # Entry point: read JSON artifacts → categorize → store
│   ├── package.json                # Pipeline dependencies (supabase-js, migros-api-wrapper, etc.)
│   └── tsconfig.json
│
├── web/                            # Frontend (React + Vite)
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── lib/
│   │   │   ├── supabase.ts         # Supabase client init
│   │   │   ├── queries.ts          # getActiveDeals(), getDealsByCategory(), getStarterPacks(), searchProducts(), saveFavorites(), getFavoritesByEmail(), getComparisonForFavorites()
│   │   │   ├── verdict.ts          # calculateVerdict()
│   │   │   └── favorites.ts        # Favorites matching logic (join keywords against deals)
│   │   ├── components/
│   │   │   ├── ui/                 # shadcn/ui components
│   │   │   ├── VerdictBanner.tsx
│   │   │   ├── CategorySection.tsx
│   │   │   ├── DealCard.tsx
│   │   │   ├── StoreBadge.tsx
│   │   │   ├── DataWarning.tsx     # "Deals may be outdated" banner
│   │   │   ├── TemplatePicker.tsx  # Starter pack selection ("How do you cook?")
│   │   │   ├── FavoritesEditor.tsx # Remove items + search to add
│   │   │   ├── ProductSearch.tsx   # Search deals database for products
│   │   │   ├── ComparisonView.tsx  # Split shopping list by store
│   │   │   ├── SplitList.tsx       # "Buy at Migros" / "Buy at Coop" / "No deals"
│   │   │   ├── FavoriteMatchCard.tsx # Single matched item card
│   │   │   ├── EmailCapture.tsx    # Save email after seeing value
│   │   │   └── EmailLookup.tsx     # Returning user email input
│   │   ├── pages/
│   │   │   ├── Home.tsx            # Email lookup for returning users + link to onboarding
│   │   │   ├── Onboarding.tsx      # Template → customize → compare → save email
│   │   │   ├── Compare.tsx         # Comparison view for saved favorites
│   │   │   └── About.tsx
│   │   └── index.css               # Tailwind imports
│   ├── public/
│   │   └── favicon.svg
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── tsconfig.json
│   └── package.json                # Frontend dependencies (react, vite, tanstack, etc.)
│
├── shared/                         # Shared types (consumed by pipeline + frontend)
│   ├── types.ts                    # Deal, Category, Store, UnifiedDeal, PipelineRun, StarterPack, Favorite, FavoriteItem, FavoriteComparison
│   └── category-rules.ts           # Keyword-to-category mapping rules
│
├── docs/                           # PM documentation
│   ├── prd.md
│   ├── use-cases.md
│   ├── architecture.md             # PM-level architecture decisions
│   ├── roadmap.md
│   └── technical-architecture.md   # This document
│
├── .env.example                    # Template for required env vars
├── package.json                    # Root scripts only (no workspaces)
├── tsconfig.base.json              # Shared TS config
└── README.md
```

### Monorepo Decision

**Decision:** Single repo with a flat folder structure (no npm workspaces). TypeScript path aliases resolve shared imports. Python (Coop scraper) lives alongside but is managed separately with `pip` + `requirements.txt`.

**Why:** Everything in one repo means one CI/CD workflow, one PR per feature, and easy cross-referencing. A flat structure avoids the complexity of npm workspaces for a project with only two TypeScript packages. The Python module is isolated in its own directory with its own dependencies.

**Shared imports:** `pipeline/` and `web/` both import from `shared/` using TypeScript path aliases configured in `tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "paths": {
      "@shared/*": ["./shared/*"]
    }
  }
}
```
Each sub-project's `tsconfig.json` extends `tsconfig.base.json`.

**Package management:**
- TypeScript: Each directory (`pipeline/`, `web/`) has its own `package.json`. The root `package.json` contains convenience scripts only (no `"workspaces"` field).
- Python: `pip install -r requirements.txt` in the `pipeline/coop/` directory
- No monorepo tool (Turborepo, Nx) needed — two packages is not complex enough to justify it

---

## 5. Technology Decisions

### 5.1 Pipeline Language: Mixed (TypeScript + Python)

| Attribute | Detail |
|-----------|--------|
| **Decision** | TypeScript for Migros source + categorizer + storage. Python for Coop source. |
| **Why** | `migros-api-wrapper` is npm-only (TLS 1.3 + Cloudflare bypass). Coop scraping is simplest with `requests` + `BeautifulSoup`. |
| **Trade-off** | Two runtimes in CI. Slightly more complex workflow YAML. |
| **Alternative rejected** | All-Python (no Migros wrapper — would need to reverse-engineer Cloudflare bypass). All-TypeScript (Cheerio works but BeautifulSoup is more battle-tested for scraping). |

### 5.2 Frontend State Management: React Query

| Attribute | Detail |
|-----------|--------|
| **Decision** | `@tanstack/react-query` for data fetching and caching. |
| **Why** | Built-in caching, stale-while-revalidate, loading/error states. Data changes weekly — aggressive caching is the correct strategy. |
| **Trade-off** | One more dependency (~13KB gzipped). Worth it for the developer experience. |
| **Alternative rejected** | SWR (similar but smaller community). Plain `fetch` + `useState` (too much boilerplate for loading/error/cache). |

### 5.3 CSS: Tailwind + shadcn/ui

| Attribute | Detail |
|-----------|--------|
| **Decision** | Tailwind CSS for utility styling. shadcn/ui for pre-built components (cards, badges, buttons). |
| **Why** | Confirmed in PM architecture decisions. Consistent design with minimal custom CSS. |
| **Trade-off** | Tailwind class strings can be verbose. Acceptable — this is how modern React projects work. |
| **Component pattern** | Copy shadcn/ui components into `src/components/ui/`. Compose them in app-level components (`VerdictBanner`, `DealCard`). |

### 5.4 Testing: Vitest

| Attribute | Detail |
|-----------|--------|
| **Decision** | Vitest for all TypeScript tests (pipeline + frontend). Pytest for Python tests. |
| **Why** | Vitest shares Vite's config and is faster than Jest. Native ESM support. Same assertion API as Jest. |
| **Trade-off** | Less community support than Jest. Not a problem for this project size. |
| **Alternative rejected** | Jest (slower, more config overhead with ESM). |

### 5.5 CI/CD: GitHub Actions

| Attribute | Detail |
|-----------|--------|
| **Decision** | GitHub Actions for pipeline cron and CI checks. |
| **Why** | Free for public repos. Supports both Node.js and Python. Cron scheduling built in. |
| **Trade-off** | Cron timing is approximate (GitHub may delay up to 15 minutes). Acceptable — nobody is watching at exactly 21:00. |

### 5.6 Environment Variables and Secrets

| Attribute | Detail |
|-----------|--------|
| **Decision** | Secrets stored in GitHub Actions secrets. Frontend uses Vite's `VITE_` prefix for public env vars. |
| **Secrets needed** | `SUPABASE_URL` (public, safe to expose), `SUPABASE_ANON_KEY` (public, read-only via RLS), `SUPABASE_SERVICE_ROLE_KEY` (secret, pipeline-only — never exposed to frontend). |
| **Local dev** | `.env` file (gitignored). `.env.example` checked in with placeholder values. |

### 5.7 Error Handling and Logging

| Attribute | Detail |
|-----------|--------|
| **Decision** | Console logging in pipeline (GitHub Actions captures it). No external logging service. |
| **Why** | GitHub Actions retains logs for 90 days on free tier. Enough for debugging. |
| **Pipeline errors** | Each source logs success/failure independently. The `pipeline_runs` table records status per source. Frontend reads this to show data freshness warnings. |
| **Frontend errors** | React error boundaries at the page level. If Supabase is unreachable, show cached data (React Query) with "Data may be outdated" banner. |

### 5.8 Caching Strategy

| Layer | Strategy |
|-------|----------|
| **CDN (Vercel)** | Static assets cached at edge. HTML served with short `max-age` (Vercel default). |
| **React Query** | `staleTime: 3600000` (1 hour). Data changes weekly — no need to refetch on every page load. |
| **Repeat-visit performance** | Repeat-visit performance relies on Vercel CDN + browser HTTP cache + React Query client-side data cache (`staleTime: 1 hour`). No service worker in MVP. Service worker deferred to Phase 3 (PWA) for offline access. |
| **Supabase** | No caching layer needed. Supabase handles ~50 concurrent reads easily on free tier. |

### 5.9 SEO-Friendly URLs

| Attribute | Detail |
|-----------|--------|
| **Decision** | Use React Router for client-side routing with Vercel's SPA fallback. Implement meta tags and Open Graph per page. For Phase 2+, migrate to a framework with SSR/SSG (or pre-render key pages). |
| **Why** | MVP is a simple SPA. SEO pages (weekly archive, categories) are Phase 2+ and will need server-side rendering or static generation for proper indexing. |
| **URL structure (future-ready)** | `/` (home), `/onboarding` (new user flow), `/compare` (comparison view), `/woche/:weekId` (weekly verdict), `/kategorie/:category`, `/archiv/:month`, `/about` |
| **Trade-off** | SPA without SSR has limited SEO. Acceptable for MVP (traffic comes from friends, not search). When SEO becomes critical, add pre-rendering or migrate to Next.js/Astro. |
| **Migration path** | The data layer (React Query + Supabase) and components are framework-agnostic. Moving from Vite SPA to Next.js or Astro requires changing the routing/rendering layer, not the components or data logic. |
| **Migration trigger** | If organic search traffic is a goal by Week 8, begin migration to Astro (static-first, ships zero JS by default) at the start of Phase 2. Astro supports React components directly, so existing components carry over with minimal changes. |

---

## 6. API Contracts

### 6.1 TypeScript Interfaces

```typescript
// shared/types.ts

export type Store = 'migros' | 'coop';
export type Category = 'fresh' | 'long-life' | 'non-food';

/**
 * Raw deal from a source, before categorization.
 * Both Migros (TS) and Coop (Python) normalize to this shape.
 */
export interface UnifiedDeal {
  store: Store;
  productName: string;
  originalPrice: number | null;  // null if source doesn't provide it
  salePrice: number;
  discountPercent: number | null; // null only when originalPrice is null; otherwise calculated by storage module
  validFrom: string;             // ISO date string: "2026-04-09"
  validTo: string | null;
  imageUrl: string | null;
  sourceCategory: string | null; // Original category from source
  sourceUrl: string | null;      // Link to deal on source site
}

/**
 * Categorized deal, ready for storage.
 */
export interface Deal extends UnifiedDeal {
  category: Category;
}

/**
 * Deal as stored in Supabase (snake_case column names).
 */
export interface DealRow {
  id: string;
  store: Store;
  product_name: string;
  category: Category;
  original_price: number | null;
  sale_price: number;
  discount_percent: number | null;
  valid_from: string;
  valid_to: string | null;
  image_url: string | null;
  source_category: string | null;
  source_url: string | null;
  is_active: boolean;
  fetched_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Pipeline run log entry.
 */
export interface PipelineRun {
  id: string;
  run_at: string;
  migros_status: 'success' | 'failed' | 'skipped';
  migros_count: number;
  coop_status: 'success' | 'failed' | 'skipped';
  coop_count: number;
  total_stored: number;
  duration_ms: number;
  error_log: string | null;
}

/**
 * Verdict per category.
 */
export interface CategoryVerdict {
  category: Category;
  winner: Store | 'tie';
  migrosScore: number;  // 0-100
  coopScore: number;    // 0-100
  migrosDeals: number;  // deal count
  coopDeals: number;
  migrosAvgDiscount: number;
  coopAvgDiscount: number;
}

/**
 * Full weekly verdict.
 */
export interface WeeklyVerdict {
  weekOf: string;           // ISO date of the Thursday
  categories: CategoryVerdict[];
  dataFreshness: 'current' | 'stale' | 'partial';
  lastUpdated: string;
}

/**
 * Starter pack — pre-defined grocery list for onboarding.
 */
export interface StarterPack {
  id: string;
  name: string;
  label: string;
  description: string | null;
  items: StarterPackItem[];
  sortOrder: number;
  isActive: boolean;
}

/**
 * Single item within a starter pack.
 */
export interface StarterPackItem {
  keyword: string;
  label: string;
  category: Category;
}

/**
 * User's saved favorites list.
 */
export interface Favorite {
  id: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Single item within a user's favorites list.
 */
export interface FavoriteItem {
  id: string;
  favoriteId: string;
  keyword: string;
  label: string;
  category: Category;
  createdAt: string;
}

/**
 * Comparison result: a favorite item matched against active deals.
 */
export interface FavoriteComparison {
  favorite: FavoriteItem;
  migrosDeal: DealRow | null;
  coopDeal: DealRow | null;
  recommendation: 'migros' | 'coop' | 'both' | 'none';
}
```

### 6.2 Coop Source Output Format (Python)

The Python Coop scraper writes a JSON file matching the `UnifiedDeal` shape. Field names use camelCase to match the TypeScript interface:

```json
[
  {
    "store": "coop",
    "productName": "Persil Gel 2x 1.5L",
    "originalPrice": 29.90,
    "salePrice": 17.90,
    "discountPercent": 40,
    "validFrom": "2026-04-09",
    "validTo": "2026-04-15",
    "imageUrl": "https://storage.cpstatic.ch/...",
    "sourceCategory": "Haushalt",
    "sourceUrl": "https://aktionis.ch/products/..."
  }
]
```

### 6.3 Supabase Query Patterns

```typescript
// Get all active deals for current week
// Date safety: also filter by valid_to >= today to guard against stale is_active flags
const today = new Date().toISOString().split('T')[0];
const { data: deals } = await supabase
  .from('deals')
  .select('*')
  .eq('is_active', true)
  .gte('valid_to', today)
  .order('discount_percent', { ascending: false });

// Get deals by category
const { data: freshDeals } = await supabase
  .from('deals')
  .select('*')
  .eq('is_active', true)
  .eq('category', 'fresh')
  .order('discount_percent', { ascending: false });

// Get latest pipeline run (for freshness indicator)
const { data: latestRun } = await supabase
  .from('pipeline_runs')
  .select('*')
  .order('run_at', { ascending: false })
  .limit(1)
  .single();

// Upsert deals (pipeline — uses service_role key)
const { error } = await supabase
  .from('deals')
  .upsert(deals, {
    onConflict: 'store,product_name,valid_from',
    ignoreDuplicates: false,
  });

// Get active starter packs (frontend — anon key)
const { data: packs } = await supabase
  .from('starter_packs')
  .select('*')
  .eq('is_active', true)
  .order('sort_order');

// Search products by keyword (frontend — anon key)
// Deduplicate by product_name (same product may appear in multiple weeks)
const { data: products } = await supabase
  .from('deals')
  .select('product_name, store, category')
  .eq('is_active', true)
  .ilike('product_name', `%${keyword}%`)
  .limit(20);
// Then deduplicate: [...new Set(products.map(p => p.product_name))]

// Save favorites (frontend — anon key)
// Step 1: Insert favorites row
const { data: favorite } = await supabase
  .from('favorites')
  .insert({ email: null })
  .select()
  .single();
// Step 2: Insert favorite_items rows
const { error } = await supabase
  .from('favorite_items')
  .insert(items.map(item => ({
    favorite_id: favorite.id,
    keyword: item.keyword,
    label: item.label,
    category: item.category,
  })));
// Step 3 (optional): Update email when user saves
const { error } = await supabase
  .from('favorites')
  .update({ email, updated_at: new Date().toISOString() })
  .eq('id', favorite.id);

// Get favorites by email (frontend — anon key, returning users)
const { data: favorite } = await supabase
  .from('favorites')
  .select('*, favorite_items(*)')
  .eq('email', email)
  .single();

// Match favorites with deals (frontend — anon key)
// For each favorite_item.keyword, find matching active deals
const { data: matches } = await supabase
  .from('deals')
  .select('*')
  .eq('is_active', true)
  .ilike('product_name', `%${keyword}%`);
```

---

## 7. Infrastructure

### 7.1 GitHub Actions Workflow

```yaml
# .github/workflows/pipeline.yml
name: Weekly Deal Pipeline

on:
  schedule:
    - cron: '0 21 * * 3'   # Primary: Wednesday 21:00 UTC (22:00 CET winter / 23:00 CEST summer)
    - cron: '0 6 * * 4'    # Verification: Thursday 06:00 UTC — catch late updates before peak shopping
  workflow_dispatch:        # Manual trigger for testing

env:
  SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
  SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}

jobs:
  fetch-migros:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: cd pipeline && npm ci
      - run: npx tsx pipeline/migros/fetch.ts
      - uses: actions/upload-artifact@v4
        with:
          name: migros-deals
          path: migros-deals.json
        if: always()

  fetch-coop:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install -r pipeline/coop/requirements.txt
      - run: python pipeline/coop/fetch.py
      - uses: actions/upload-artifact@v4
        with:
          name: coop-deals
          path: coop-deals.json
        if: always()

  process-and-store:
    needs: [fetch-migros, fetch-coop]
    if: always() && (needs.fetch-migros.result == 'success' || needs.fetch-coop.result == 'success')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: cd pipeline && npm ci
      - uses: actions/download-artifact@v4
        with:
          path: artifacts/
      - run: >
          npx tsx pipeline/run.ts
          --migros-file=artifacts/migros-deals/migros-deals.json
          --coop-file=artifacts/coop-deals/coop-deals.json
          --migros-status=${{ needs.fetch-migros.result }}
          --coop-status=${{ needs.fetch-coop.result }}
      - name: Keep Supabase alive
        run: |
          npx tsx -e "
            import { createClient } from '@supabase/supabase-js';
            const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
            const { data } = await sb.from('pipeline_runs').select('id').limit(1);
            console.log('Keep-alive ping OK:', data?.length, 'row(s)');
          "
```

> **Why Wednesday 21:00 UTC?** Both Migros and Coop publish their weekly deals on Wednesday evening (validated April 2026). Running the primary fetch at 21:00 UTC (22:00 CET) catches most publications. The Thursday 06:00 UTC verification fetch catches any late updates before peak shopping time.

> **Why the keep-alive step?** Supabase free-tier projects auto-pause after 1 week of inactivity. The weekly pipeline run itself counts as activity, but adding an explicit SELECT at the end guarantees the project stays warm even if the upsert step is skipped due to empty data.

### 7.2 Vercel Configuration

```json
// vercel.json (in web/)
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

**Deployment:** Connect GitHub repo to Vercel. Set root directory to `web/`. Auto-deploy on push to `main`. Preview deploys on PRs.

### 7.3 Supabase Project Setup

1. Create project on supabase.com (free tier)
2. Run the SQL from Section 3 (tables for deals, pipeline_runs, starter_packs, favorites, favorite_items + indexes + RLS policies)
3. Seed starter packs (run the SQL seed script from `shared/starter-packs-seed.sql` in Supabase dashboard)
4. Copy `SUPABASE_URL` and `SUPABASE_ANON_KEY` to `.env` (frontend)
5. Copy `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to GitHub Actions secrets (pipeline)

### 7.4 Environment Variables

| Variable | Used by | Secret? | Source |
|----------|---------|---------|--------|
| `SUPABASE_URL` | Pipeline + Frontend | No | Supabase dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | Pipeline only | Yes | Supabase dashboard → Settings → API |
| `VITE_SUPABASE_URL` | Frontend only | No | Same as `SUPABASE_URL`, prefixed for Vite |
| `VITE_SUPABASE_ANON_KEY` | Frontend only | No | Supabase dashboard → Settings → API |

### 7.5 Monitoring and Alerting

| What | How | Cost |
|------|-----|------|
| Pipeline failure | GitHub Actions sends email on workflow failure (built-in) | Free |
| Data freshness | Frontend checks `pipeline_runs.run_at`. If > 8 days old, show warning banner. | Free |
| Uptime | Vercel provides basic uptime monitoring on free tier | Free |
| Error tracking | No external service in MVP. Add Sentry (free tier, 5K events/month) if needed later. | Free |

---

## 8. Development Workflow

### 8.1 Local Development

**Prerequisites:** Node.js 20+, Python 3.12+, npm 10+

```bash
# Clone and install
git clone <repo-url> && cd basketch
cd pipeline && npm install && cd ..            # Pipeline TS dependencies
cd web && npm install && cd ..                 # Frontend dependencies
pip install -r pipeline/coop/requirements.txt  # Python deps

# Set up environment
cp .env.example .env                           # Fill in Supabase credentials

# Run frontend
cd web && npm run dev                          # Vite dev server at localhost:5173

# Run pipeline (locally)
npx tsx pipeline/migros/fetch.ts               # Outputs migros-deals.json
python pipeline/coop/fetch.py                  # Outputs coop-deals.json
npx tsx pipeline/run.ts \
  --migros-file=migros-deals.json \
  --coop-file=coop-deals.json                  # Categorize + store in Supabase

# Run tests
cd pipeline && npx vitest                      # Vitest (pipeline tests)
cd web && npx vitest                           # Vitest (frontend tests)
cd pipeline/coop && python -m pytest           # Pytest (Coop scraper)
```

### 8.2 Deployment

| Action | Trigger |
|--------|---------|
| Frontend deploy | Push to `main` (Vercel auto-deploy) |
| Pipeline run | Wednesday 21:00 UTC + Thursday 06:00 UTC (GitHub Actions cron) or manual `workflow_dispatch` |
| Database changes | Manual SQL in Supabase dashboard (no migration tool needed at this scale) |
| Seed starter packs | Run `shared/starter-packs-seed.sql` manually in Supabase SQL editor |

### 8.3 Branch Strategy

**Decision:** Trunk-based development. Push to `main`. No long-lived feature branches.

**Why:** Solo developer, portfolio project. Feature branches add overhead with no review benefit.

---

## 9. Build Order

Each module can be built and verified independently before moving to the next. This is the recommended order:

### Step 1: Shared Types + Supabase Setup
**Build:** `shared/types.ts` (including StarterPack, Favorite, FavoriteItem, FavoriteComparison types), `shared/category-rules.ts`, Supabase tables (deals, pipeline_runs, starter_packs, favorites, favorite_items), indexes, RLS policies. Seed starter packs via SQL.
**Verify:** TypeScript compiles. SQL runs without errors in Supabase. Starter packs are queryable.
**Why first:** Everything else depends on the type definitions and database schema.

### Step 2: Migros Source
**Build:** `pipeline/migros/fetch.ts`, `normalize.ts`
**Verify:** Run locally, outputs `migros-deals.json` with valid `UnifiedDeal[]` data. Write a test with fixture data.
**Why second:** It uses the npm wrapper which is the more constrained dependency — verify it works early.

### Step 3: Coop Source
**Build:** `pipeline/coop/fetch.py`, `normalize.py`
**Verify:** Run locally, outputs `coop-deals.json` with valid deal data matching the `UnifiedDeal` JSON shape. Write a test with saved HTML fixture.
**Why third:** Independent of Migros. Can be built in parallel if desired.

### Step 4: Categorizer + Storage
**Build:** `pipeline/categorize.ts`, `store.ts`, `run.ts`
**Verify:** Feed the JSON files from Steps 2-3 into `run.ts`. Check Supabase: deals appear with correct categories. Run categorizer tests against known product names.
**Why fourth:** Depends on the output format from Steps 2-3 and the Supabase schema from Step 1.

### Step 5: GitHub Actions Workflow
**Build:** `.github/workflows/pipeline.yml`
**Verify:** Trigger manually via `workflow_dispatch`. Confirm deals appear in Supabase. Check that partial failure (one source down) still stores the other source's deals. Verify cron is set to Wednesday 21:00 UTC + Thursday 06:00 UTC verification.
**Why fifth:** Orchestrates Steps 2-4. All modules must work individually first.

### Step 6: Frontend Data Layer
**Build:** `web/src/lib/supabase.ts`, `queries.ts` (including favorites queries and search), `verdict.ts`, `favorites.ts` (matching logic)
**Verify:** Write unit tests for `calculateVerdict()`. Manually call `getActiveDeals()`, `getStarterPacks()`, `searchProducts()` and confirm data returns from Supabase.
**Why sixth:** Depends on data being in Supabase (from Step 4/5).

### Step 7: Frontend: Onboarding Flow
**Build:** `TemplatePicker.tsx`, `FavoritesEditor.tsx`, `ProductSearch.tsx`, `EmailCapture.tsx`, `Onboarding.tsx` page
**Verify:** Template picker shows starter packs. Selecting one loads items into editor. Search finds matching products. Email capture saves favorites to Supabase. Full flow works end-to-end.
**Why seventh:** Depends on the data layer (Step 6) and starter packs being seeded (Step 1).

### Step 8: Frontend: Comparison View
**Build:** `ComparisonView.tsx`, `SplitList.tsx`, `FavoriteMatchCard.tsx`, `Compare.tsx` page
**Verify:** Comparison correctly splits items into "Buy at Migros" / "Buy at Coop" / "No deals this week". Cards show correct prices and savings. Works with both onboarding flow and returning user flow.
**Why eighth:** Depends on favorites + deals data being in place.

### Step 9: Frontend: Home + Navigation
**Build:** `EmailLookup.tsx`, update `Home.tsx` (email lookup for returning users + link to onboarding), routing setup for `/`, `/onboarding`, `/compare`
**Verify:** Returning user can enter email and see their comparison. New user is directed to onboarding. Navigation between pages works.
**Why ninth:** Ties together the onboarding flow (Step 7) and comparison view (Step 8).

### Step 10: Deploy
**Build:** Vercel project setup, connect repo, configure env vars.
**Verify:** Visit the deployed URL. Confirm onboarding flow works. Confirm returning user flow works. Run Lighthouse audit (target: Performance > 90).
**Why last:** Everything must work locally before deploying.

---

## 10. Open Technical Questions

| # | Question | Impact | When to resolve |
|---|----------|--------|-----------------|
| 1 | How does `migros-api-wrapper` handle pagination? Does `from/until` refer to item index or date? | Affects Migros fetch completeness | Step 2 (during Migros source build) |
| 2 | Does aktionis.ch paginate beyond page 10? Is there a last-page indicator? | Affects Coop fetch completeness | Step 3 (during Coop source build) |
| 3 | Can the GitHub Actions `process-and-store` job reliably download artifacts from failed upstream jobs? | Affects partial-failure handling | Step 5 (during workflow build) |
| 4 | What is the exact category taxonomy from each source? Do Migros and Coop use consistent category names? | Affects categorizer accuracy | Steps 2-3 (examine real API/HTML responses) |
| 5 | Should the Vite SPA use hash routing (`/#/about`) or history routing (`/about`) for Vercel? | Affects URL structure and SEO readiness | Step 7 (use history mode + Vercel rewrites) |
| 6 | When to migrate from Vite SPA to Next.js/Astro for SSR/SSG? | Affects SEO growth engine | After MVP — decide based on whether organic search traffic is a priority |
| 7 | How to handle search performance with `ilike` on a potentially large deals table? | Affects product search UX | Start with `ilike` (sufficient for ~15K rows). If slow, add `pg_trgm` extension + GIN index on `product_name`. |
| 8 | Should search also match products from previous weeks (expired deals)? | Affects product catalog breadth for favorites | Yes — broader product catalog for favorites. Users want to track items even if not on sale this week. Consider searching all deals (not just `is_active = true`) for the search function, while comparison only matches active deals. |
| 9 | How to seed starter packs? SQL seed script or admin endpoint? | Affects initial data setup | Recommend: SQL seed file in `shared/` directory (`starter-packs-seed.sql`), run manually in Supabase SQL editor. Admin endpoint is overkill for 4-5 static packs. |

---

## Self-Check

- [x] Every module has a clear single responsibility
- [x] Each module can be tested independently (fixtures, mocks, isolated entry points)
- [x] Folder structure is navigable — someone new can find any module in seconds
- [x] No circular dependencies — data flows one direction: sources → categorizer → storage → Supabase → frontend
- [x] Right-sized — no ORM, no migration framework, no monorepo tooling, no logging service
- [x] SEO-friendly URLs are supported via React Router with a clear migration path to SSR when needed
- [x] All environment variables and secrets are accounted for (Section 7.4)
- [x] Build order ensures each step is independently verifiable before the next begins
- [x] Mixed-language pipeline is handled cleanly via GitHub Actions artifacts (JSON files as the contract between TypeScript and Python)
- [x] Two data paths (pipeline + user favorites) are clearly separated with well-defined join points
- [x] Favorites tables have appropriate RLS policies (public read/write for MVP, no sensitive data)
- [x] Free tier calculations updated to include starter_packs, favorites, and favorite_items tables
- [x] Pipeline timing updated to Wednesday 21:00 UTC with Thursday 06:00 UTC verification
- [x] Onboarding flow front-loads value (comparison) before asking for data (email) — Phil Carter Psych Framework

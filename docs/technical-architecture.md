# Technical Architecture: basketch

**Version:** 2.0 (revised after architecture review, 2 October 2026)
**Date:** 2 October 2026
**Status:** Describes the system as built and live at https://basketch.vercel.app (production branch `main`, merge commit `e159e4b`, 2026-09-28)
**Supersedes:** v1.1 (10 April 2026) of this file. `docs/technical-architecture-v2.md` (v2.1, 12 April 2026) is historical. The changes since v1.1 are summarised in Appendix A.
**Method:** Every statement below is taken from the code or a dated project document, and file paths are cited inline. Anything not confirmed is marked *(unverified)*. Internal codes used in project records (WP-, AP-, D-, P-) are explained in Appendix B.

---

## 1. Summary (one page)

**The problem.** Swiss shoppers spread their weekly groceries across several retailers, but each retailer publishes its promotions separately. Product context is in `docs/prd.md`.

**What basketch does.** It collects this week's grocery promotions from seven Swiss retailers (Migros, Coop, LIDL, ALDI, Denner, SPAR, Volg). It classifies each promotion into a shared category taxonomy and publishes the result on a mobile-first website. Visitors can see which store leads each category this week, browse and filter every deal, build a shopping list, and share that list by link. There is no login and no app.

**How it is built.**

```
 Retailers' published channels         GitHub Actions (Mon/Tue/Thu)           Supabase (Postgres)        Vercel
 ─────────────────────────────        ──────────────────────────────         ───────────────────        ──────────────────────
 Denner API · Volg HTML ·     ──►     Pipeline (TypeScript + one Python  ──►  deals, products,     ──►   Next.js 16 site
 SPAR/ALDI PDFs · LIDL JSON ·         OCR step)                               classification cache,      (server-rendered,
 Migros flyer images (OCR) ·          collect → validate → classify →         run history                cached per Zurich day)
 Coop via aktionis.ch                 store → refresh site                                                 ▲
                                                                                                           │ visitors (phone)
```

**Design choices that matter.**

1. **Domain-driven collection.** A single `Offer` aggregate guards the price rules in its constructor. For example, ALDI never gets an invented discount, and a LIDL member price must name its programme. Each retailer adapter is an anti-corruption layer: retailer field names never get past it. See §5.1.
2. **Honest failure.** Sources return a result instead of throwing, and an empty result counts as a failure. One retailer failing never stops the others. When the classifier is unsure about a product, the product is marked uncertain rather than guessed. See §5.1–5.2.
3. **Correct for today in Zurich.** A deal counts as "in effect" by the Zurich calendar date. The deals cache is keyed by that date, so a page cannot carry yesterday's set past midnight. See §8.
4. **Legal rules the code follows.** No technical protection measure is circumvented. Price comparisons show validity windows and label member-only prices. Flyer images are referenced and cropped in the browser. This is a description of the rules, not legal advice. See §12.
5. **Runs on its own.** Scheduled runs, an in-process deadline with one retry, a dead-man ping, and keep-alive jobs. Since 28 September 2026 it has run without manual intervention. See §9.
6. **Cost.** Hosting, the database, CI and the main classification model all run on free tiers. One paid API, the classification judge on OpenRouter, is capped at USD 5 per month and switches itself off if that cap cannot be confirmed. See §14.

**Scale.** About 1,500 deals are in effect at any time (1,537 on 2026-09-28, `docs/prd.md`). It is built by one developer for 10–50 users.

---

## 2. System context (C4 level 1)

```
                        ┌──────────────────────────────┐
   Shopper (mobile) ───►│          basketch            │◄─── Owner: GitHub, Supabase and Vercel
   share recipients     │  basketch.vercel.app + deal  │     dashboards; e-mail alert from
                        │  pipeline                    │     healthchecks.io
                        └──────┬──────────────┬────────┘
                               │ reads public │ calls
                               ▼              ▼
     Retailer channels (7, see §12)     Google Gemini API (free tier)  — classification
     aktionis.ch (Coop only)            OpenRouter (capped)            — judge model
                                        healthchecks.io                — dead-man switch
```

| Actor / system | Relationship |
|---|---|
| Shopper | Uses the website on a phone. Nothing about the shopper is sent to a server. The list is kept in browser storage (`web-next/src/stores/list-store.ts`, zustand `persist`) |
| Share recipient | Opens `/list?items=…`. The list is rebuilt from this week's data (`web-next/src/app/[locale]/list/page.tsx`, `lib/share-url.ts`) |
| Retailer channels | Read during pipeline runs with an identifying User-Agent, `basketch/1.0 (+https://basketch.vercel.app; …)`, e.g. `collection/infrastructure/volg/volg-html-source.ts` |
| Gemini | Tier-1 classifier, reflector and attribute enricher (`pipeline/composition.ts`) |
| OpenRouter | Tier-2 judge (`openai/gpt-5-nano`), with a spend cap (`pipeline/composition.ts`, `transformation/domain/spend.ts`) |
| healthchecks.io | Receives a ping carrying the exit code at the end of every run (`pipeline/run.ts`, `observability/healthcheck-ping.ts`) |

---

## 3. Goals, non-goals, constraints

**Goals**
- Show this week's promotions from all seven retailers, correct for today's Zurich date.
- Compare stores at category level ("who leads Fresh this week"), and let visitors build and share a list.
- Run with no human in the loop, and fail loudly rather than silently.

**Non-goals (current)**
- No user accounts and no server-side personal data.
- No per-item cheapest-store routing. The category comparison stays for now (PM decision, `docs/decisions/2026-09-25-pm-decisions.md`).
- No regional pricing. Research found that prices are national and only the assortment varies (`docs/data-source-research-2026-09-07.md`, Part 4b).
- No identity for the same product across retailers yet. Products are resolved per store (see §15).

**Constraints**
- Free tiers for all infrastructure. One paid API, capped, approved by the PM (`CLAUDE.md`, "Legal Constraints"; `docs/rca/2026-09-15-final-plan.md`).
- Never circumvent a technical protection measure (`CLAUDE.md`, "Legal Constraints").
- The Supabase service-role key never reaches the frontend.
- A flat repository with no npm workspaces. `pipeline/`, `web-next/` and `shared/` each have their own `package.json`.

---

## 4. Containers (C4 level 2)

| Container | Technology | Runs on | Responsibility |
|---|---|---|---|
| **Deal pipeline** (`pipeline/`) | Node 20, TypeScript (`tsx`), LangGraph for the classification graph, Python 3.12 for Migros OCR (`rapidocr-onnxruntime`), poppler `pdftotext` for PDF flyers | GitHub Actions, `.github/workflows/pipeline.yml` | Collect, validate, classify and store offers, then refresh the site |
| **Database** | Supabase Postgres (free tier) | Supabase | Deals, products, classification cache, run history |
| **Website** (`web-next/`) | Next.js 16.2.4, React 19.2.4, Tailwind 4, next-intl 4, zustand, Radix/vaul sheets, `@tanstack/react-virtual` (`web-next/package.json`) | Vercel (Hobby) | Server-render deal data; filtering, list and sharing; OG card image; revalidation endpoint |
| **Shared kernel** (`shared/`) | TypeScript | Imported by relative path | Domain types, the `BROWSE_CATEGORIES` taxonomy, category rules, product-name normalisation (`shared/types.ts`, `shared/category-rules.ts`) |
| **CI** | GitHub Actions, `.github/workflows/ci.yml` (Node 24) | GitHub | Type-check and test all three packages; build the website; run Playwright and axe |

**Connections**
- **Pipeline → Supabase:** writes with the service-role key, held as a GitHub secret.
- **Website → Supabase:** reads with the public anon key. Queries run only in the server data layer (`web-next/src/server/data/`); components never call Supabase directly. Database access policies are being consolidated into the migrations folder (§7).
- **Pipeline → Website:** at the end of a run, `POST /api/revalidate` with a bearer secret (`web-next/src/app/api/revalidate/route.ts`, `pipeline/observability/revalidate-webhook.ts`).

---

## 5. Key components (C4 level 3)

### 5.1 Collection module (`pipeline/collection/`)

The design is in `docs/collection-module-design.md` (approved 2026-09-08). The layers are defined by import direction:

```
collection/
  domain/          Offer (aggregate root), Money, Discount, ValidityPeriod, PriceBasis,
                   ProductImage/CropRegion, QuantityRequirement, Edition, IsoWeek,
                   the OfferSource port, Result      → imports no infrastructure
  application/     collect-offers (orchestrator), telemetry port
  infrastructure/  one adapter per retailer (each with its own __fixtures__/ of captured
                   responses), pdf/ helpers, telemetry/, live-sources.ts (wiring)
```

**Invariants enforced in the `Offer` constructor** (`CLAUDE.md`, "Domain-Driven Design"):

```
salePrice > 0
originalPrice === null  ⟺  discountPercent === null      ← the ALDI rule
originalPrice !== null  →   originalPrice > salePrice
validTo >= validFrom
ProductImage is exactly one of SourceUrl | CropRegion
PriceBasis.MemberOnly must name its programme            ← the LIDL rule
```

Several of these rules are repeated as database `CHECK` constraints (`supabase/migrations/20260911_offer_fields.sql`).

**Adapters.** Each one implements the `OfferSource` port and is the anti-corruption layer for its retailer.

| Retailer | Adapter | Mechanism | Images today |
|---|---|---|---|
| Denner | `denner/denner-api-source.ts` | Denner's public promotion JSON endpoint, paginated. Its own category labels also serve to score the classifier | Retailer image URL |
| Volg | `volg/volg-html-source.ts` | The weekly promotions HTML page: three sections with different validity windows, dates without a year | Retailer image URL (often expired, §15) |
| Coop | `coop/coop-aktionis-source.ts` | aktionis.ch Coop listing pages (reason in §12) | Image URL from the listing |
| SPAR | `spar/spar-flyer-source.ts` | Weekly flyer PDF read with `pdftotext -bbox`; each field's role is inferred from font height | Not shown yet |
| ALDI | `aldi/aldi-flyer-source.ts` | Publitas catalogue `data.json` → flyer PDF. There is usually no reference price, so no discount is invented | Not shown yet |
| LIDL | `lidl/lidl-flyer-source.ts` | Flyer JSON, cross-checked against the PDF so a Lidl Plus member price is never published as a normal price | Retailer image URL |
| Migros | `migros/migros-flyer-source.ts` + `migros/ocr.py` | The weekly flyer page images on Issuu, read with OCR (`rapidocr-onnxruntime`, CPU, free) | Flyer crop |

**Error handling** (`collection/application/collect-offers.ts`)
- An adapter returns either `Ok(offers, warnings)` or `Failed(reason)`. The reason is one of `source-unavailable`, `source-changed`, `below-expected-yield`, `partially-parsed`.
- If an adapter throws anyway, the error is contained and reported as a failure. A per-source timeout (default 120 s) cuts off a source that hangs.
- **Empty is not success.** Zero offers is reported as `source-changed`. A yield far below what the source normally returns is `below-expected-yield`.
- When one source fails, the run is `degraded`, not `failed`.

**Editions.** Each adapter works out which publication ("edition") it is fetching (`collection/domain/edition.ts`; ADR `docs/decisions/2026-09-17-publication-editions.md`). A ledger that skips an edition already collected is planned but not built (§15).

### 5.2 Transformation, i.e. classification (`pipeline/transformation/`)

It uses the same domain / application / infrastructure layering. The layering is enforced by tests (`pipeline/architecture.test.ts`, `collection/domain/architecture.test.ts`) rather than a lint rule, because `pipeline/` has no linter.

- **Cache first.** `product_classification_cache` is keyed by the normalised product name plus the taxonomy, prompt and schema versions. Lookups are chunked by encoded size in bytes, not by key count (`shared-kernel/chunk-by-encoded-size.ts`). That fix came from an earlier outage.
- **The classification graph** (`transformation/application/classify-graph.ts`, LangGraph):
  1. **Tier 1:** Gemini Flash-Lite classifies products in batches of 25 (`composition.ts`; the models are in `transformation/domain/model-registry.ts`).
  2. **Judge:** `openai/gpt-5-nano` via OpenRouter reviews the answer. It can only rate trust; it never sets a category.
  3. **Reflector:** the same Gemini model revisits disputed items.
  4. **Uncertain:** a product that has a category the judge disputed ends as uncertain. It is published with the category label withheld and does not count towards verdicts. A product with no classification at all (rate limit, provider down, truncated response, or not reached before the deadline) is held back: not published this run, and counted as `heldBack` (`transformation/application/classify-deals.ts`).
- **Why the judge is the trigger.** Escalation is driven by the judge, not by the model's own confidence. In a measurement on 291 Denner products the model was often confidently wrong (header of `classify-graph.ts`).
- **Quota and spend guards.**
  - Each (provider, model) pair has one `ModelGate`, and everything that calls that model shares its rate limit (ADR `docs/decisions/2026-09-16-model-gate.md`).
  - The judge's `SpendLedger` reserves the worst-case cost before each call.
  - At the start of a run the pipeline reads the OpenRouter key's provider-side credit limit. If the limit cannot be read, or no limit is set, the run continues **without the judge** (`composition.ts#resolveJudgeSpendCeiling`).
- **Attributes.** Optional per-category attributes (fat %, pack details) come from the same Gemini gate. Enrichment can never cost a product its category (ADR `docs/decisions/2026-09-17-attributes-version.md`).

### 5.3 Storage step (`pipeline/store.ts`, `pipeline/storage/`, `pipeline/product-resolve.ts`)

- Each `Offer` is mapped to a row at the module boundary (`storage/domain/offer-to-unified.ts`).
- Product identity is resolved per store, by an upsert on `(store, source_name)` backed by a unique index (`supabase/migrations/20260925000000_products_store_source_name_unique.sql`).
- Deals are upserted.
- A **stale sweep** then withdraws a store's old deals, but only if that store refreshed at least half of its live set in this run (`MIN_REFRESH_SHARE = 0.5`, `storage/domain/stale-sweep.ts`).
- Expired deals are deactivated.
- A run record and a metrics snapshot for the alert rules are written to `pipeline_runs` (`supabase/migrations/20260917130000_pipeline_run_metrics.sql`).
- An earlier concept/SKU "catalogue" step was retired on 2026-09-25 because nothing read its output. Its tables were kept so the change is reversible (comment in `run-pipeline.ts`; `docs/rca/2026-09-25-tech-lead-cross-review-and-plan.md` §10). An architecture test guards against new writes to that layer.

### 5.4 Website (`web-next/src/`)

| Area | Files | Notes |
|---|---|---|
| Routes | `app/[locale]/page.tsx` (home, category verdicts), `deals/` (browse and filter), `list/` (entry point for shared lists), `about/`; `app/card/route.tsx` (OG image); `app/api/revalidate/route.ts`; `sitemap.ts`, `robots.ts`, `manifest.ts` | Locales are `de` (default) and `en`, with `localePrefix: 'as-needed'` (`i18n/routing.ts`). FR and IT are deferred (`docs/adr-M0-decisions.md`) |
| Request proxy | `proxy.ts` (Next 16's name for middleware) | next-intl routing; rewrites `/<locale>/card` to `/card` |
| Server data layer | `server/data/snapshot.ts` (the only cached step), `supabase-provider.ts` (anti-corruption layer from database rows to the domain), `filter-deals.ts` | Pages through `deals` 1,000 rows at a time with `.eq('is_active', true).gte('valid_to', today)` |
| Domain rules (shared by server and client) | `lib/domain/validity.ts` (`todayInZurich`, `isInEffect`), `votes-in-verdict.ts`, `price-basis.ts`, `quantity-requirement.ts`, `crop-region.ts` | One "listed but does not vote" rule: uncertain, member-only, not-yet-started and multi-buy deals are shown with a label, but they never decide a verdict or carry the "Cheapest" tag |
| Verdict | `server/verdict/algorithm.ts` | For each category, every store's average discount over its voting deals. A store wins if it leads the runner-up by ≥ 2 percentage points and has ≥ 5 deals (`lib/category-rules.ts`). Otherwise the category is tied |
| List and sharing | `stores/list-store.ts` (localStorage), `lib/share-url.ts`, `lib/share-target.ts` | A shared list is rebuilt from deal IDs against this week's data. IDs that no longer exist are dropped |
| Images | `components/ui/product-image.tsx`, `next.config.ts` | Retailer image URLs are rendered with `next/image`, with an allow-list of hosts. Flyer crops are a plain `<img>` of the retailer's page positioned with CSS. Image handling is under review (§15) |
| Observability | `lib/observability.ts` | Placeholder only (§15) |

---

## 6. Data flow: retailer to website

**One scheduled run** (`pipeline/run.ts` → `run-pipeline.ts#runPipeline`):

1. **Collect.** `collectOffers` runs all seven adapters, each with its own timeout, and builds validated `Offer`s. It writes NDJSON telemetry to stdout.
2. **Normalise.** Product names are normalised the same way the upsert key is (`shared/types.ts#normalizeProductName`).
3. **Grocery filter.** Non-grocery items are dropped and counted (`grocery-filter.ts`).
4. **Metadata.** Brand, quantity and organic flags are extracted (`product-metadata.ts`).
5. **Classify.** Cache → tier 1 → judge → reflector → classified, uncertain, or held back (no classification yet, not published). Classification stops at the run deadline (§9).
6. **Taxonomy.** The browse category slug is resolved through `taxonomy_alias` (`resolve-taxonomy.ts`).
7. **Resolve products** per store.
8. **Write.** Deals are upserted, then the guarded stale sweep runs, then expired deals are deactivated.
9. **Record.** The run is logged in `pipeline_runs`, and the alert rules are evaluated (`transformation/domain/alerts.ts`). Alerts appear as GitHub annotations and in the job summary.
10. **Refresh.** The pipeline calls `POST /api/revalidate`, and the site expires its `deals` cache tag immediately (`revalidateTag(tag, { expire: 0 })`).
11. **Ping.** A dead-man ping carrying the exit code goes to healthchecks.io (`run.ts`).

**One visitor request:**

1. `proxy.ts` resolves the locale.
2. The static page shell is served.
3. Inside a `<Suspense>` hole, `getWeeklySnapshot()` runs at request time.
4. It calls `getDealRowsForDay({ today })`, which is cached per Zurich date.
5. Counts, verdicts and sections are computed and the page renders.

---

## 7. Data model

Migrations live in `supabase/migrations/`. They start from `00000000000000_baseline.sql`, are applied in filename order through the Supabase SQL editor (`supabase/migrations/README.md`), and the latest is `20260925000000_products_store_source_name_unique.sql`.

**Tables used by the live system**

| Table | Written by | Read by | Purpose |
|---|---|---|---|
| `deals` | pipeline | website | One row per promotion (column list below) |
| `products` | pipeline | pipeline | Product identity per store; unique on `(store, source_name)` |
| `product_groups` | seed data | pipeline | Product grouping used during resolution (`product-resolve.ts`) |
| `product_classification_cache` | pipeline | pipeline | Memo and audit trail of which model decided what, at which tier, under which prompt version |
| `pipeline_runs` | pipeline | pipeline | Run history and the `metrics` JSON; the previous run is read for regression alerts |
| `taxonomy_alias`, `taxonomy_category` (+ `taxonomy_subcategory`, `taxonomy_type`) | seed data | pipeline | Map a sub-category to `deals.category_slug` |
| `pipeline_unknown_tags` | pipeline | owner | Sub-categories with no alias |

Key `deals` columns:
- **Identity and category:** `store`, `product_name`, `category` (the top-level group: fresh / long-life / non-food, shown as "Household"), `category_slug`, `sub_category`.
- **Price:** `sale_price`, `original_price`, `discount_percent` (NOT NULL).
- **Validity:** `valid_from`, `valid_to`.
- **Conditions:** `price_basis` + `loyalty_programme`, `min_quantity`.
- **Image:** `image_url` **or** `page_image_url` + `crop_x/y/w/h` (fractions 0–1).
- **Other:** `source_url`, `is_uncertain`, `attributes`, `is_active`, `product_id`.

**Dormant objects.** Tables from earlier product iterations are still in the schema but are not used by the live site or the pipeline:
- the April 2026 concept layer (`20260427_v3_concept_layer.sql`);
- the retired v1 favourites and starter-pack features.

They are scheduled for review.

**Schema housekeeping.** The production database and a database rebuilt from this repository are not yet identical. Some constraints and access policies exist in production but are not declared in the migrations folder. Consolidating them into migrations is an open item (§15).

---

## 8. Caching and rendering

Next.js 16 runs with `cacheComponents: true` (`web-next/next.config.ts`).

| Layer | What happens | Source |
|---|---|---|
| Page shell | Prerendered statically. It contains no deal data | `app/[locale]/page.tsx` (`HomeBody` inside `<Suspense>`); `/deals` and `/list` use the same pattern |
| Deal data | `getWeeklySnapshot()` calls `await connection()`, so it runs at request time | `server/data/snapshot.ts` |
| Data cache | `getDealRowsForDay({ today })` uses `'use cache'`, `cacheTag('deals', 'deals:<date>')` and `cacheLife({ revalidate: 900, expire: 3600 })`. The Zurich date is passed as an **argument**, so it is part of the cache key | `server/data/snapshot.ts`; ADR `docs/decisions/2026-09-27-deals-cache-keyed-by-zurich-date.md` |
| Derived values | Counts, verdicts and sections are recomputed on every request from (deals, today). They are cheap, and they are never cached | `snapshot.ts` |
| Pipeline refresh | `revalidateTag('deals', { expire: 0 })` expires every day's cache entry at once | `app/api/revalidate/route.ts` |
| Browser guard | `MidnightGuard` watches the browser clock. When the Zurich day changes in a tab left open, it offers a reload button | `components/shared/MidnightGuard.tsx` |
| Unknown URLs | `experimental.globalNotFound` returns a real 404 instead of an error page | ADR `docs/adr-002-404-handling-under-cache-components.md` |

A test enforces that no `'use cache'` function reads the clock (`server/data/deals-freshness-architecture.test.ts`).

---

## 9. Operations

**Schedule** (`.github/workflows/pipeline.yml`)
- Three cron entries: Monday, Tuesday and Thursday at 05:00 UTC. GitHub often starts scheduled runs late.
- Every run collects from all seven retailers.
- `concurrency: deal-pipeline` queues an overlapping run instead of running two side by side.
- Manual dispatch is available.

**Deadline and retry**
- `run.ts` saves every classification it finishes. When the in-process deadline is reached (`RUN_DEADLINE_MS` = 28 min, `transformation/domain/resilience.ts`), it exits with code **75**.
- `nick-fields/retry` retries **only** exit 75. There are at most 2 attempts, each with a 60-minute hang backstop. Each attempt collects again.
- The second attempt sets `PIPELINE_FINAL_ATTEMPT=1` and publishes whatever it has.
- Bugs and critical alerts exit 1 and are deliberately not retried.
- `config.test.ts` checks that the timing budget fits inside the workflow timeout.

**Safeguards for unattended running**

| Safeguard | Mechanism | Source |
|---|---|---|
| Dead-man switch | A healthchecks.io ping carrying the exit code at the end of every run. If no ping arrives, the owner gets an e-mail | `run.ts`, `observability/healthcheck-ping.ts` |
| Database keep-alive | The `keep-alive` job pings Supabase on every run so the free project is not paused | `pipeline.yml` |
| Schedule keep-alive | The `workflow-keepalive` job re-enables `pipeline.yml` through the GitHub REST API on every run, to keep the schedule active while the project is maintained (GitHub disables scheduled workflows in inactive public repositories). It runs with `continue-on-error` and only the `actions: write` scope | `pipeline.yml`; `docs/rca/2026-09-28-tech-lead-pipeline-keepalive.md` |
| Least privilege | The workflow's default permission is `contents: read` | `pipeline.yml` |

**Known risk in the schedule keep-alive.** GitHub does not document whether the re-enable call resets its inactivity timer. A similar third-party keep-alive action has been disabled by GitHub in the past (RCA above). Both keep-alive jobs live inside the same workflow, so if GitHub disables it, the Supabase ping stops as well. The backstop is the healthchecks.io e-mail followed by re-enabling the workflow manually. A manual check is scheduled.

**Telemetry.** OpenTelemetry was left out on purpose: running a collector would cost money (`docs/collection-module-design.md`). Instead the pipeline produces:
- NDJSON on stdout, every line tagged with `runId`, kept in GitHub's logs;
- a markdown summary per run in `$GITHUB_STEP_SUMMARY` (`observability/github-step-summary.ts`);
- a run record and metrics snapshot in `pipeline_runs`.

The alert rules (`transformation/domain/alerts.ts`) are:
- `pipeline-stale`
- `run-halted`
- `classifier-regression`
- `classifier-drift`
- `source-shape-changed`
- `uncertainty-spike`
- `invalid-category-spike`
- `cache-hit-rate-low`
- `run-slow`
- `spend-near-ceiling`
- `spend-unguarded`

A rule that cannot be evaluated reports `instrument-missing` instead of staying silent.

**Failure modes**

| Dependency fails | What happens |
|---|---|
| A retailer source changes shape or is down | That source is reported as failed (`source-changed`, `source-unavailable`), the other six are published, and the stale sweep leaves that store's existing deals alone |
| Gemini rate limit or daily quota | Products already in the classification cache are published. Products the model could not classify this run are held back (not published) and counted as `heldBack`. The retry's final attempt publishes whatever has been classified (`classify-deals.ts`) |
| OpenRouter limit unreadable or not set | The run continues without the judge (`spend-unguarded` alert) |
| Run exceeds its deadline | Exit 75, one retry, and the final attempt publishes what it has |
| Supabase error during a website read | The page shows an empty or degraded state (`isDegraded`). The result can stay cached for up to the 15-minute revalidation window (§15) |
| Supabase paused or down during a run | Exit 75 and one retry. If it is still unreachable, the run fails and healthchecks.io reports a non-zero exit |
| GitHub disables the schedule | No runs and no keep-alive ping. The healthchecks.io e-mail is the backstop |
| Vercel unavailable | The site is down. Nothing monitors the website itself (§15) |

**Deploys.** Vercel builds `main`, and `basketch.vercel.app` follows production. Rollback uses Vercel's previous deployment.

---

## 10. Security and privacy

- **Secrets** are kept in GitHub Actions secrets and Vercel environment variables, never in the repository.
  - Pipeline: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WEB_REVALIDATE_URL`, `WEB_REVALIDATE_SECRET`, `GOOGLE_AI_API_KEY`, `OPENROUTER_API_KEY`, `HEALTHCHECK_PING_URL`.
  - Website: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `REVALIDATE_SECRET`.
- **The service-role key never reaches the frontend.** The website reads with the public anon key from its server data layer only. Database access policies are being consolidated into migrations (§7).
- **The revalidation endpoint** requires `Authorization: Bearer <secret>`. It returns 401 without it, and 500 if no secret is configured.
- **No accounts and no personal data in the product.** The shopping list stays in the visitor's browser. The site has no analytics integration in code; the observability module is a placeholder. Whether Vercel's own dashboard analytics is switched on has not been checked. Parsers must drop personal data such as reviews, usernames and staff names when parsing (`CLAUDE.md`, "Legal Constraints").

---

## 11. Testing approach

Development is test-driven (`CLAUDE.md`, "Test-Driven Development"):

1. **Domain first.** Value objects and the `Offer` invariants are pure and use no mocks.
2. **Port contract.** One shared suite that every adapter must pass (`collection/infrastructure/port-contract.test.ts`).
3. **Real responses.** Each adapter is tested offline against captured real responses stored in its `__fixtures__/` folder.
4. **Named regressions.** Each regression test is named after the real defect it prevents. Fixes are proven by mutation: reintroduce the bug, watch the test fail, restore the fix.
5. **Architecture tests.** These make the layering and freshness rules executable (`pipeline/architecture.test.ts`, `collection/domain/architecture.test.ts`, `web-next/src/server/data/deals-freshness-architecture.test.ts`).

**Counts measured by running each suite on 2 October 2026**

| Suite | Command | Result |
|---|---|---|
| Pipeline (TypeScript) | `cd pipeline && npx vitest run` | 74 files, **1,524 passed** |
| Shared kernel | `cd shared && npx vitest run` | 6 files, **129 passed**, including 3 deliberate expected-failure markers |
| Website | `cd web-next && npx vitest run` | 49 files, **492 passed**. 2 date-dependent tests currently fail because their fixture date has passed; a fix is scheduled |
| Migros OCR (Python) | `pipeline/collection/infrastructure/migros/test_ocr.py` | 13 test functions; not part of CI |
| End-to-end | `web-next/e2e/` (Playwright + axe) | Defined in CI, where it runs after the website unit tests pass. Not run for this document |

CI (`.github/workflows/ci.yml`) does the following:
- type-checks the pipeline and the website;
- runs all three vitest suites;
- builds the website and runs Playwright, but only after the website unit tests pass.

Biome lint is warn-only.

---

## 12. Data sources and legal position

*This section describes the rules the project has adopted. It is not legal advice.* The rules are defined in `CLAUDE.md`, "Legal Constraints". The underlying research is in `docs/data-source-research-2026-09-07.md`.

1. **No circumvention.** No technical protection measure is circumvented. When an honestly identified client is refused, the project treats that as a refusal and uses an openly published channel instead.
2. **Migros.** basketch does not fetch the migros.ch paths that its robots.txt disallows. Migros offers are read from the weekly flyer Migros publishes on Issuu (`migros-flyer-source.ts`). An earlier direct integration is retired (`pipeline/archive/migros/`).
3. **Coop.** Coop's own published flyer covers only a small share of its weekly promotions: roughly 11–24% across the measurements (research Part 4c; `docs/design/2026-09-26-architect-coop-direct-source.md`). aktionis.ch lists about 1,000 Coop promotions a week. The project therefore reads Coop offers from aktionis.ch. Coop's own flyer is the documented fallback (decision of 2026-09-26, `docs/decisions/2026-09-25-pm-decisions.md`).
4. **Correct price comparisons.** In practice this means:
   - every deal shows its validity window;
   - expired deals are removed by Zurich date;
   - member-only prices are labelled and never decide a verdict;
   - deals that have not started yet are labelled "from <date>";
   - the site does not claim to list every promotion.
5. **Images.**
   - Flyer crops are stored only as coordinates (`page_image_url` + fractions). The visitor's browser loads the retailer's page image and crops it with CSS.
   - Where a retailer publishes its own product image URL, that image is displayed through `next/image`.
   - Image handling is under review.
6. **Request volume.**
   - Each scheduled run (Monday, Tuesday, Thursday) fetches each source once, and the one retry fetches again.
   - Requests carry an identifying User-Agent.
   - Paged requests to the same retailer are spaced by a 1.2-second default gap (`live-sources.ts`).
   - A planned per-publication ledger would reduce collection to one fetch per published edition (§15).

---

## 13. Key decisions (ADRs)

| Decision | Record |
|---|---|
| Frontend foundation (Next.js App Router, next-intl, deferrals) | `docs/adr-M0-decisions.md` |
| Collection module: DDD, TDD, per-retailer sources, crop-in-browser flyer images, free local OCR | `docs/collection-module-design.md` |
| One quota gate per (provider, model) | `docs/decisions/2026-09-16-model-gate.md` |
| `QuantityRequirement` kept separate from `PriceBasis` | `docs/decisions/2026-09-16-quantity-requirement.md` |
| In-effect vs upcoming validity rule | `docs/decisions/2026-09-15-in-effect-vs-upcoming.md` (its caching part is superseded) |
| Deals cache keyed by the Zurich date | `docs/decisions/2026-09-27-deals-cache-keyed-by-zurich-date.md` |
| Per-retailer publication editions | `docs/decisions/2026-09-17-publication-editions.md` |
| `attributes_version` for enrichment completeness | `docs/decisions/2026-09-17-attributes-version.md` |
| 404 handling under Cache Components | `docs/adr-002-404-handling-under-cache-components.md` |
| Category regroup (status: **Proposed**) | `docs/adr-001-category-regroup.md` |
| Reliability and cost plan, including the USD 5/month judge cap | `docs/rca/2026-09-15-final-plan.md` |
| Product decisions | `docs/decisions/2026-09-17-pm-taxonomy-decisions.md`, `docs/decisions/2026-09-25-pm-decisions.md` |

Incident analyses and cross-reviews are in `docs/rca/`.

---

## 14. Cost and free-tier limits

| Service | Plan | Monthly cost |
|---|---|---|
| Vercel | Hobby (intended for non-commercial use) | CHF 0 |
| Supabase | Free (500 MB) | CHF 0 |
| GitHub Actions | Free (public repository) | CHF 0 |
| Google Gemini (classifier, reflector, enricher) | Free tier; the Google project has no billing account (`CLAUDE.md`) | CHF 0 |
| healthchecks.io | *Plan not recorded in the repository (unverified)* | expected CHF 0 |
| OpenRouter (judge, `openai/gpt-5-nano`) | Paid, **capped at USD 5/month** three ways: a provider-side credit limit (monthly or non-resetting), the in-code `SpendLedger`, and an explicit `max_tokens` on every call | ≤ USD 5 |

**Limits that apply first.** Website traffic is not the constraint, because deal data is cached per day. These are:
- **Gemini free tier:** 15 requests per minute and 1,000 requests per day (`pipeline.yml` comment, `model-registry.ts`).
- **Vercel Hobby image optimisation:** the quota is counted per source image. About 1,500 deals turn over each week, so catalogue churn drives this number, not visitors. *The current Hobby quota has not been checked against actual usage.*
- **Website read cap:** the data layer reads at most 10 pages of 1,000 rows (`MAX_PAGES = 10`, `supabase-provider.ts`). Anything beyond 10,000 active deals would be silently cut off.
- **Supabase 500 MB:** the `deals` table keeps history, and there is no retention policy yet.

---

## 15. Known limits and open items

**Data coverage and quality**
- **Pictures.**
  - ALDI and SPAR pictures are not shown yet.
  - Volg image URLs often stop working within a day of collection.
  - Image handling for retailers is under review (`docs/rca/2026-09-25-architect-missing-images.md`).
- **No product identity across retailers.** Products are resolved per store. "Only at" claims are therefore made per sub-category, never per product (`filter-deals.ts#onlyStoreSubCategories`).
- **"Cheapest" and list wording.**
  - The "Cheapest" tag currently goes to the deal with the largest eligible discount in a sub-category. Changing it to the lowest comparable unit price is approved but not built.
  - The list header "Your N items split best across # stores" is also flagged for rewording until per-item routing exists (`docs/prd.md` §13).
- **Taxonomy divergence.** The `BROWSE_CATEGORIES` list in code and the taxonomy tables in the database differ, so many deals have no `category_slug`. A fix has been designed and cross-reviewed (`docs/rca/2026-09-17-*-taxonomy-divergence.md`). *Shipping status after 2026-09-18 is not confirmed.*
- **Migros product names.** A fix that keeps the full printed titles is built and approved, but parked until a decision on where to store certification labels.
- **Coop count gap.** An early test collected 924 Coop offers, against about 1,006 counted by hand. The gap is unexplained (`docs/collection-module-design.md`).

**Operations**
- **Collection frequency.** Every run collects all seven sources: up to three times a week, plus a retry. A planned fetch ledger, and a split between collection and classification, would reduce this to one fetch per published edition. Neither is built.
- **Cached empty result.** If Supabase returns an error during a website read, the degraded empty result can be cached for up to 15 minutes before it is retried.
- **Website observability.**
  - Frontend error reporting and analytics are placeholders. Errors routed through the observability module are not recorded in production; only uncaught errors and direct server logs reach Vercel's logs.
  - Uptime monitoring covers only the pipeline, not the website.
- **Timing constants.** The write phase grows with deal volume, and the timing constants are due to be re-measured (`docs/rca/2026-09-25-tech-lead-max-chunk-ms.md`).
- **Image-coverage alert.** None exists yet. The agreed behaviour is to warn and still publish.
- **Schedule keep-alive.** It depends on undocumented GitHub behaviour (§9).

**Engineering hygiene**
- Two date-dependent website tests currently fail. While they do, CI skips the website build and Playwright jobs, which depend on them.
- Biome lint is warn-only. The Python OCR tests are not in CI.
- The pipeline runs on Node 20, while CI tests it on Node 24.
- Schema consolidation and the review of dormant tables are pending (§7).

**Parked product work** (built or specified, not live):
- a separate page for shared lists (`docs/design/2026-09-27-shared-list-view-spec.md`);
- a contact form;
- a daily Volg refresh.

---

## Appendix A. What changed since v1.1

v1.1 described a planned two-store (Migros + Coop) site built with React + Vite, Python scrapers and a favourites-first flow.

| Area | v1.1 (April 2026) | v2.0 (live, October 2026) |
|---|---|---|
| Retailers | Migros, Coop | **Seven:** Migros, Coop, LIDL, ALDI, Denner, SPAR, Volg |
| Data source | Python scrapers | TypeScript **collection module** (DDD), one adapter per retailer: six read from the retailer's own published channels, Coop via aktionis.ch |
| Categorisation | Keyword rules | Model-based classifier (Gemini free tier) with a judge model, a classification cache and an "uncertain" state |
| Frontend | React + Vite SPA | **Next.js 16** App Router, React 19, Tailwind 4, next-intl (DE/EN), Cache Components. The Vite app is archived in `archive/web-vite/` |
| User model | Server-side favourites and starter packs | No accounts. A browser-local shopping list, shared by URL. The favourites and starter-pack features are retired |
| Product images | None | Retailer image URLs, or flyer crops in the browser |
| Operations | Manual | Runs on its own: cron three times a week, in-process deadline with retry, dead-man ping, keep-alive jobs |
| Method | n/a | Domain-driven design and test-driven development. Incidents get a written root-cause analysis and a cross-review (`docs/rca/`) |

## Appendix B. Internal codes used in project records

| Code | Meaning |
|---|---|
| WP-… | A work package (a unit of build work), e.g. WP-J2 = the planned fetch ledger |
| AP-…, TP-…, D1–D5 (no hyphen) | A numbered ruling in the 2026-09-15 reliability plan (`docs/rca/2026-09-15-final-plan.md`), e.g. AP-8 = the USD 5/month judge cap |
| D-1…, P-… (with a hyphen) | A numbered product-owner decision (`docs/decisions/2026-09-25-pm-decisions.md`) |
| ADR | Architecture Decision Record |

## Sources

- **Code:** `pipeline/run.ts`, `pipeline/run-pipeline.ts`, `pipeline/composition.ts`, `pipeline/collection/**`, `pipeline/transformation/**`, `pipeline/storage/**`, `pipeline/observability/**`, `web-next/next.config.ts`, `web-next/package.json`, `web-next/src/**`, `supabase/migrations/*.sql`, `.github/workflows/pipeline.yml`, `.github/workflows/ci.yml`.
- **Documents:** `CLAUDE.md`, `docs/prd.md`, `docs/collection-module-design.md`, `docs/data-source-research-2026-09-07.md`, `docs/design/2026-09-26-architect-coop-direct-source.md`, `docs/decisions/*`, `docs/adr-*.md`, `docs/rca/*` (2026-09-15 to 2026-09-28).

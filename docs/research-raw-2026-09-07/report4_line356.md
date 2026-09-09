<task-notification>
<task-id>aab8dcfe2648d077f</task-id>
<tool-use-id>toolu_01UcsuwGYrVV9MxNQS8bknuY</tool-use-id>
<output-file>/private/tmp/claude-501/-Users-kiran/5a310252-d722-41cb-89a0-d9350e2b8434/tasks/aab8dcfe2648d077f.output</output-file>
<status>completed</status>
<summary>Agent "Survey Swiss store data sources" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>All verified. Here are the findings.

## Headline: two independent wins

**1. aktionis.ch DOES have category-filtered pages — but not the pattern you guessed.**

`/vendors/&lt;store&gt;/q/&lt;Category&gt;` → **404**. Vendor+category cannot be combined. But `/q/&lt;Category&gt;` alone → **200**, and those pages are **cross-vendor** and carry the vendor logo (`div.card-merchant &gt; img[alt]`) plus the same `data-upox-id` join key that already appears on your vendor pages. Card markup is identical to what `parse_deal_card` already handles. Pagination works (`/q/&lt;Cat&gt;/2`, verified distinct IDs).

I crawled all 39 categories (139 page fetches, ~2 min) and joined against full vendor crawls:

| Vendor (aktionis slug) | Deals | With category | Coverage |
|---|---|---|---|
| migros | 115 | 115 | **100%** |
| coop | 931 | 823 | 88.4% |
| coop-megastore | 80 | 80 | **100%** |
| denner | 264 | 264 | **100%** |
| lidl | 174 | 146 | 83.9% |
| spar | 22 | 22 | **100%** |
| volg | 11 | 11 | **100%** |
| **aldi-suisse** | **0** | 0 | **not carried at all** |
| **Total** | **1597** | **1461** | **91.5%** |

The full vendor list is only 8 slugs — `coop, coop-megastore, denner, lidl, migros, otto-s, spar, volg`. **Aldi Suisse is absent from aktionis entirely.**

Caveats: it's aktionis' 39-label taxonomy, not the retailer's own; and 1633 of 2147 deals sit in multiple categories (`Bio`, `Vegetarisch-Vegan`, `Nahrungsmittel` are cross-cutting), so you need a priority rule to pick one primary label.

**2. Migros direct returns its real taxonomy — and 10x more deals than aktionis.**

`migros-api-wrapper` is alive: **v1.1.37, published 2026-03-02**. Its "bypass" is a TLS trick (`minVersion: TLSv1.3`); plain curl gets a 403 "maintenance" wall, TLS-1.3-pinned requests get 200. Verified live end-to-end:

- Guest token: `GET /authentication/public/v1/api/guest` → `leshopch` response header. 200.
- Promo search: `POST /product-display/public/web/v2/products/promotion/search` → 200, week `2026-09-03 → 2026-09-09`.
- **Category is a first-class queryable facet**: 16 top-level categories with IDs, filterable via `filters: {"category": ["7494731"]}`.
- `POST /product-display/public/v4/product-cards` returns a **4-level `breadcrumb`** per item — exactly the field you wanted:

```
Milchprodukte, Eier &amp; frische Fertiggerichte → Milch, Butter &amp; Eier → Milch &amp; Milchgetränke → Milchgetränke
```

**Trap worth knowing:** the unfiltered promo search reports only `numberOfItems: 111`. Iterating the 16 category IDs yields **1168** — facet counts matched actuals exactly on all 16. So you must loop categories; the unfiltered call silently under-returns by 90%. Against 115 deals on aktionis, that's a **10x volume increase** for Migros alone.

## Per-retailer summary

| Retailer | Official API | Unofficial API | Own category? | Bot protection | Difficulty |
|---|---|---|---|---|---|
| **Migros** | No | `migros-api-wrapper` v1.1.37 (2026-03-02), verified working | **Yes** — 4-level `breadcrumb` + queryable category facet | TLS-fingerprint wall; defeated by TLS 1.3 pinning | **Easy** |
| **Coop / Megastore** | No | `WanderingMike/coop-scraper`, last commit 2022-08-12, almost certainly dead | Not via any found source | **DataDome** — 403 on everything incl. `robots.txt`; DataDome published a Coop case study | **Hard** |
| **Lidl CH** | No | `/p/api/gridboxes/CH/de` → 200, has `"category"` field; `EvickaStudio/lidl-discounts` (2026-05-08) | **Yes**, but sample returned a fixed 25-item grid — pulling *this week's* set still needs reverse-engineering | Myracloud, no blocking | **Medium** |
| **Aldi Suisse** | No | None CH-specific | Unknown (UI shows categories; couldn't reach JSON) | **Akamai** — 403 on every URL incl. `robots.txt`; allow-lists AI crawlers, blocks curl | **Hard** |
| **Denner** | Portal 2.0 spec on GitHub (`detailnet/denner-portal-api-spec`) but needs App-ID/Key | `app-api.denner.ch` anonymous JWT, via `nicktcode/swissgroceries-mcp` (pushed 2026-06-07) | **No** in free API. Workaround: 19 category-filtered URLs like `/de/aktionen/getraenke~c1144372` (verified 200) | nginx, none | **Medium** |
| **Spar CH** | No | None found | **No** — TYPO3, only `WebPage` JSON-LD, no Product schema | Apache, none | **Hard** |
| **Volg** | No | volg.ch promos are a **static PDF** (`Volg_Wochenaktionen_KW37.pdf`) | N/A | none | **Not feasible** direct |

**Volg correction:** the subagent flagged volgshop.ch's WooCommerce API (`/wp-json/wc/store/v1/products`) as an Easy win. It does return a beautiful 3-level `categories` array — but I checked `?on_sale=true` and it returns **`x-wp-total: 0`**. Volgshop is a *catalog*, not a promo feed. It's still valuable as a **category-lookup table** to enrich Volg (and possibly other) items by product name, just not as a deal source.

## Ranked recommendation

1. **Do the aktionis `/q/&lt;Category&gt;` enrichment pass first.** ~139 extra fetches gets you 91.5% category coverage across 7 of 8 retailers, joined on the `data-upox-id` you already parse. No new bot problems, no new parser — this is a small addition to `pipeline/aktionis/fetch.py`, not a rewrite. Highest value per unit of work by a wide margin.
2. **Migros direct.** You already have `migros-api-wrapper` in the stack and `pipeline/migros/` doesn't exist yet. Real Migros taxonomy plus 10x the deals. Loop the 16 category IDs; don't trust the unfiltered call.
3. **Denner** via the 19 category-filtered promo URLs — no WAF, straightforward, and it's your #2 vendor by deal count (264).
4. **Lidl** — the `gridboxes` endpoint has a `category` field but the weekly-offer query mechanics are unsolved. aktionis already gives you 84%; only worth it to close that gap.
5. **Aldi Suisse** — the only retailer with *no* aktionis fallback, but Akamai makes direct access hard. If Aldi matters to the product, a headless browser is the realistic route. Otherwise deprioritise.
6. **Coop and Spar — don't go direct.** Coop's DataDome would need paid unblocking, which conflicts with the zero-paid-services constraint. aktionis already gives Coop 88% and Spar 100%.

One thing worth your call before I'd act on this: the aktionis route gives you *aktionis'* taxonomy, while going direct gives each retailer's own. Those won't align, so mixing them means a mapping layer. If per-item cheapest-store routing is the goal, a single consistent taxonomy across vendors may actually serve you better than each retailer's native labels — which would argue for leaning harder on option 1 and treating Migros-direct mainly as a volume play.</result>
<usage><subagent_tokens>96946</subagent_tokens><tool_uses>66</tool_uses><duration_ms>941547</duration_ms></usage>
</task-notification>
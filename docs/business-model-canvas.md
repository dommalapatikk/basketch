# basketch — Business Model Canvas

| Field | Value |
|---|---|
| **Author** | Kiran Dommalapati |
| **Date** | 2 October 2026 |
| **Version** | 2.0 |
| **Status** | Describes the product as live on 2 October 2026. Consistent with PRD v4.0 (`docs/prd.md`). Changes from v1.0 are in Appendix A. |
| **Product** | basketch: weekly grocery promotions from seven Swiss supermarkets, compared |
| **Scope** | National (Switzerland). Personal, non-commercial project. Unattended operation since 2026-09-28. |

---

## Canvas summary

```
+------------------------------+------------------------------+------------------------------+
| 8. KEY PARTNERS              | 7. KEY ACTIVITIES            | 2. VALUE PROPOSITION         |
|                              |                              |                              |
| - Retailers' public sites /  | - Collect promotions         | "This week's promotions from |
|   flyers (6 of 7, no formal  |   3x per week, 7 retailers   |  7 Swiss supermarkets, in    |
|   agreement)                 | - AI categorisation + check  |  one place."                 |
| - aktionis.ch (Coop only)    | - Enforce price-accuracy     |                              |
| - Issuu / Publitas / iPaper  |   rules (UWG)                | - Store-by-category verdict  |
|   (flyer hosts)              | - Keep it running unattended | - All deals by sub-category  |
| - Google Gemini (free tier)  |                              | - Pick deals -> list grouped |
| - OpenRouter (capped USD 5)  +------------------------------+   by store, with totals      |
| - GitHub, Supabase, Vercel,  | 6. KEY RESOURCES             | - Share by WhatsApp/email/   |
|   healthchecks.io            |                              |   link                       |
|                              | - Collection pipeline (7     | - No app, no account         |
|                              |   adapters) + own taxonomy   | - Labelled conditions        |
|                              | - Legal research (Swiss law) |   (multi-buy, start dates)   |
|                              | - PM / engineering docs      |                              |
+------------------------------+------------------------------+------------------------------+
| 4. CUSTOMER RELATIONSHIPS    | 3. CHANNELS                  | 1. CUSTOMER SEGMENTS         |
|                              |                              |                              |
| - Self-service, no support   | - Direct link (friends)      | Hypothesis, not validated:   |
| - No account; list stays     | - Shared list / verdict via  | weekly grocery shoppers in   |
|   in the browser             |   WhatsApp, email, link      | Switzerland who will visit   |
| - Reason to return: deals    | - SEO pages: planned in v1,  | more than one store for a    |
|   change every week          |   not built                  | promotion. Plus the person   |
|                              | - None measured              | who receives a shared list.  |
+------------------------------+------------------------------+------------------------------+
| 9. COST STRUCTURE                                           | 5. REVENUE STREAMS           |
|                                                             |                              |
| Free tiers + OpenRouter capped at USD 5/month.              | None. Non-commercial.        |
| Main investment: the owner's own time.                      | Monetisation not decided.    |
+-------------------------------------------------------------+------------------------------+
```

---

## 1. Customer segments

**Primary (hypothesis carried over from PRD v3.1, not validated):** people in Switzerland who shop for groceries weekly and are willing to visit more than one supermarket when the promotions justify it. They use a phone browser and do not want an app or an account. The illustrative persona is "Weekend Shopper Sarah" (PRD §4).

**Secondary (implied by the share feature, not researched):** the person who receives a shared list and does the shopping.

**Scale:** a small audience of friends and acquaintances. The system is sized for 10–50 users (`CLAUDE.md`). No user numbers exist.

**Not served (carried over from v1.0, still true of the product):**
- shoppers loyal to one store (no comparison needed);
- coupon and loyalty-point optimisers (coupons and loyalty prices are not collected).

The v1.0 secondary persona "Marco, deal hunter" and the Bern location are removed: no research supports them, and the product no longer has a region.

---

## 2. Value proposition

**What basketch does today** (PRD §5):

| Value | How it is delivered |
|---|---|
| One place instead of seven | Current promotions from Migros, Coop, LIDL, ALDI, Denner, SPAR and Volg, collected three times a week |
| A quick read of the week | Home page names the store with the highest average discount in Fresh, Long-life and Household, or says "Tied" |
| Browse by what you need | All deals by sub-category, filterable by type, category and store, with search |
| A list to shop from | Visitor adds deals; basketch groups them by store with a total per store and an estimated overall total |
| Easy to hand on | Share the list or the weekly verdict by WhatsApp, email or link |
| Low friction | No app, no account, no login; German and English |
| Prices you can check | Validity dates, source links, and labels for multi-buy and not-yet-started prices; these never decide a winner. Member-only labelling is built, but no live source produces such a price today (Lidl Plus pages are excluded rather than labelled). |

**In one factual sentence** (competitive analysis v2.0, §4.4): a free web page that shows this week's promotions from seven Swiss supermarkets side by side, compares them by category, and lets you build a shopping list grouped by store with an estimated total that you can share; no app and no account. This makes no claim of uniqueness: Rappn's pages describe overlapping features (see Differentiation).

**What it does not do:**
- It does not compare regular shelf prices.
- It does not choose the cheapest store for an item. The visitor picks each deal.
- Its "Cheapest" tag currently marks the biggest discount in a sub-category, not the lowest price. A fix is decided (P-7) but not built.
- It does not list every promotion: coverage depends on what each source publishes.

**Long-term goal (owner's statement, not built):** route each item to its cheapest store across all seven retailers and produce a forwardable list grouped by store. PM decision P-8 (2026-09-25) defers this: "Keep today's category comparison. Do not build routing now." See PRD §3.

---

## 3. Channels

| Channel | Mechanism | Status |
|---|---|---|
| Friends / word of mouth | Direct link to basketch.vercel.app | Available. Reach not measured. |
| WhatsApp / email sharing | Share list or weekly verdict. A share image is generated for previews. | Live. Usage not tracked. |
| SEO weekly verdict pages | Planned in v1.0 | Not built. The site has a sitemap and robots file only. |
| Share-a-list as a growth loop | Planned in v1.0 ("Phase 3") | Sharing exists. Its effect on growth is unknown. |

All channels cost nothing. v1.0's reach estimates (10–15, 20–50, 100–500) are removed: they were estimates and have never been measured.

---

## 4. Customer relationships

| Type | Mechanism |
|---|---|
| Self-service | No support. The About page explains sources and rules. |
| No identity | No account and no email. The list is stored only in the visitor's browser (`localStorage`). |
| Weekly reason to return | Promotions change every week; data is refreshed Monday, Tuesday and Thursday. |
| Trust through transparency | Data sources named per retailer, freshness date shown, warning banner if data is more than 9 days old, uncertain categories marked. |
| Contact | About page names `hello@basketch.app`, which P-9 says is not used. A contact form is decided but not built (PRD §13, question 7). |

v1.0's "email as identifier", "Thursday email alert" and "WhatsApp community group" are not live and are removed.

---

## 5. Revenue streams

**None.** basketch is a personal, non-commercial project and is presented as a PM case study.

No monetisation has been decided. v1.0 listed hypothetical streams (affiliate, premium, sponsored placements, data insights) "for completeness only". They remain hypothetical and are not repeated here as options. Note for any future discussion: the legal research flags that being non-commercial is no protection under UWG (`docs/data-source-research-2026-09-07.md`, Part 4). Accuracy duties apply either way.

---

## 6. Key resources

| Resource | Detail |
|---|---|
| Collection pipeline | Seven retailer adapters (JSON, HTML, PDF text, OCR on flyer images) feeding one `Offer` model with enforced rules (for example, no invented discount, member prices must name their programme). Built test-first. |
| Own category list | One taxonomy in `shared/types.ts`, three top-level groups. Products are classified by AI against it. |
| Price-accuracy rules | Rules for in-effect dates, member-only, multi-buy and unverified category, applied to the verdict, the "Cheapest" tag and shared messages (PRD §6) |
| Legal research | Swiss copyright, unfair competition, data protection, case law, and per-retailer terms (`docs/data-source-research-2026-09-07.md`) |
| Tech stack | Next.js 16 on Vercel; TypeScript + Python pipeline on GitHub Actions; Supabase (Postgres) |
| Documentation | PRD, architecture, ADRs, a dated PM decision log, RCAs, use cases (`docs/`) |
| Owner's time | One person: product, design direction and decisions, working with a team of AI agents |

v1.0's "starter pack templates" resource is retired.

---

## 7. Key activities

| Activity | Frequency | Detail |
|---|---|---|
| Collect promotions | Mon, Tue, Thu (scheduled 05:00 UTC; GitHub often starts hours late) | All seven retailers each run |
| Categorise | Each run, new products only (answers are cached) | Gemini classifies; an OpenRouter model checks; results the checker disputes, or the classifier is not confident about, are marked "Category unverified" |
| Publish | End of each run | Upsert to Supabase, deactivate expired deals, tell the site to refresh |
| Keep it running | Every run, plus a manual check | Keep-alive job against GitHub's 60-day inactivity rule; external heartbeat; check due 2026-11-26 (`docs/rca/2026-09-28-tech-lead-pipeline-keepalive.md`) |
| Product decisions and fixes | When the owner resumes | Parked and not-started items in PRD §9 |

v1.0's weekly "SEO content generation" and "PMF survey at week 8" have not happened and are removed from the activity list. The PMF survey threshold remains one of the kill criteria in PRD §10; no survey has been run.

---

## 8. Key partners

No formal agreements with any party. All dependencies are public data or standard free-tier / pay-as-you-go terms.

| Partner | Role | Dependency | If lost |
|---|---|---|---|
| Denner, Volg, LIDL, ALDI, SPAR, Migros (public sites and flyers) | Source of promotions for six retailers | High per retailer | That retailer missing until its source is replaced |
| Issuu, Publitas, iPaper, Schwarz leaflets service | Platforms hosting the retailers' flyers | Medium | Same as above |
| aktionis.ch | Source for Coop only (P-12). 62% of collected offers by volume (week 39). | High for Coop | Fall back to Coop's own flyer, which covers roughly 11–24% of offers |
| Google (Gemini, free tier) | Product classification | High | Runs held back or degraded until replaced |
| OpenRouter (OpenAI model) | Checks classifications (every product on normal runs, a sample on a cold start, skipped once the run's budget is spent); capped at USD 5/month | Medium | Run continues without the checker |
| GitHub Actions | Scheduled pipeline, CI | High | Schedule stops |
| Supabase (free) | Database | High | Move to another Postgres host |
| Vercel (Hobby) | Hosting | High | Move to another Next.js host |
| healthchecks.io | Alerts if no run happens | Low | Silent failures go unnoticed longer |

---

## 9. Cost structure

| Item | Cost | Note |
|---|---|---|
| GitHub Actions, Supabase, Vercel Hobby, Gemini, healthchecks.io | Free tiers | Gemini project must have no billing account (`CLAUDE.md`) |
| OpenRouter (classification checker) | Up to USD 5 per month | Approved 2026-09-15. Enforced by the provider's monthly limit, a spend ledger and per-call token limits. |
| Domain | None | basketch.vercel.app |
| Owner's time | Not costed | The main investment |

Rule (`CLAUDE.md`): adding a paid service or raising the cap is a PM decision recorded in an ADR. A paid proxy to get around blocks is excluded on legal grounds, not budget.

---

## Differentiation and competition

Source: `docs/competitive-analysis.md` v2.0 (2 October 2026). That analysis is a desk review of 13 tools (6 Swiss, 7 international); no competitor app was installed or tested. Competitor cells state what the competitors' own pages say; "n/v" means not verified.

| | basketch | Rappn | Aktionis | Profital | Bring! | Preisrunter (CH) |
|---|---|---|---|---|---|---|
| Live in Switzerland | Yes | Yes | Yes | Yes | Yes | No (pre-launch) |
| Retailers | 7 (Migros, Coop, LIDL, ALDI, Denner, SPAR, Volg) | 7 (Migros, Coop, Aldi, Lidl, Denner, Aligro, Otto's) | 8 listed (incl. SPAR, Volg, Otto's) | 100+ (brochures) | via Profital | 5 named, "and many more" |
| Compares offers across stores | Yes | Yes | Lists offers; no comparison found | No | No | n/v |
| Shopping list | In browser, grouped by store, estimated total | Shared, synced | Watchlist | Bookmarks | Core product | n/v |
| Per-item cheapest-store routing | No (P-8) | Its page says the list shows where to buy cheapest; n/v | No | No | No | n/v |
| Account required | No | No, for comparison (web and app) | No, for browsing | n/v | n/v | n/a |
| Native app | No | iOS, Android, plus web | No (discontinued 2021) | iOS, Android | iOS, Android | n/v |
| Languages | DE, EN | DE, FR, IT, EN | n/v | n/v | n/v | n/v |
| Price alerts | No | Yes | Yes (email) | Push about offers | n/v | n/v |

**Position against Rappn, the closest competitor** (competitive analysis v2.0, §4.2):
- **Where they differ:**
  - basketch's retailer set includes SPAR and Volg; Rappn's includes Aligro and Otto's.
  - basketch has explicit price-label rules (§6 of the PRD).
  - The About page describes each retailer's data source.
  - basketch offers a category comparison.
  - basketch keeps the list only in the browser, with no account.
- **Whether these differences matter to users has not been tested.**
- **Where Rappn is ahead:** native apps, four languages, price alerts, a loyalty-card wallet and receipt scanning.
- **Not verified:** whether Rappn routes items to the cheapest store.
- **Retailer set:** Aktionis also lists SPAR and Volg, so the retailer set differs from Rappn only.

**Competitive risks** (v2.0, §5.2):
- Rappn overlaps in scope, is actively published, and has more features and platforms.
- Preisrunter may launch in Switzerland; no date has been announced.
- Bring! and Profital have large user bases and an offers section inside the list app.

The positioning choice in response is an open question (below).

---

## Key assumptions to validate

None of these has been tested with users. No usage data exists.

| # | Assumption | Risk | How it could be tested | Status |
|---|---|---|---|---|
| 1 | People actually split their shopping across several stores | High (riskiest) | Interviews; share of lists covering 2+ stores | Untested |
| 2 | A category verdict helps decisions more than per-item routing would | High (bears on P-8) | User test comparing both | Untested |
| 3 | People return weekly | High | Return visits (needs measurement, PRD §13, question 10) | Untested |
| 4 | Coverage is good enough to trust | High | Hand-check against flyers. Known gaps: Migros OCR yield, Lidl Plus pages dropped, missing pictures. | Partly known (PRD §7.4) |
| 5 | Shared lists reach and help the person who shops | Medium | Ask recipients | Untested |
| 6 | basketch's differences from Rappn (retailer set, price labels, source transparency, no account) matter to shoppers | High | Ask users who know both | Untested |
| 7 | Savings are meaningful (v1.0 claimed CHF 20–40/month) | Medium | Compute from real lists | Untested. Claim removed from the value proposition. |

Measurement status: PRD §10 (no usage metrics exist). The v1.0 assumptions about starter packs, email identity and the Bern region no longer apply and are removed.

---

## Open product questions

1. **Segment.** Who is basketch for, now that it runs unattended?
2. **Core value.** Should the category verdict remain the core value, or should routing be built (P-8)?
3. **Positioning.** Why would a shopper choose basketch over Rappn, and is the retailer set worth competing on?
4. **Revenue.** Remain non-commercial permanently, or leave monetisation open?
5. **Measurement.** Without analytics, none of the channel or assumption tests above can run. Should any be enabled?

---

## Appendix A. What changed since v1.0 (10 April 2026)

- **Scope:** "MVP, Bern only" is retired. Prices are national, so basketch reads one edition per retailer (PRD §4).
- **Value proposition** now matches what is live: a category comparison, the full deals list, and a list the visitor builds and shares, grouped by store. v1.0 promised personalised favourites, 45-second starter-pack setup and "CHF 20–40/month savings". None of these is live, and the savings figure was never measured.
- **Key partners and resources:** six retailers' own public channels, aktionis.ch for Coop only, and two AI providers. v1.0 listed "aktionis.ch for all 7 stores".
- **Cost:** free tiers plus one paid service capped at USD 5 per month (approved 2026-09-15). v1.0 said CHF 0.
- **Customer relationship:** no email identity. The list lives in the visitor's browser.
- **Channels and assumptions:** every reach figure and success threshold from v1.0 is marked as unmeasured. No user, traffic or revenue data exists.
- **Tech stack:** Next.js on Vercel. React + Vite is retired.

---

*Part of the basketch PM case study. Updated when the product or a decision changes.*

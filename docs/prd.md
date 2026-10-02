# Product Requirements Document: basketch

**Author:** Kiran Dommalapati
**Version:** 4.0
**Date:** 2 October 2026
**Status:** Describes the product as live on 2 October 2026. Changes from v3.1 are listed in Appendix A.
**Live site:** https://basketch.vercel.app (German by default, English at `/en`)
**Companion documents:** [Use cases v3.0](use-cases.md) · [Technical architecture v2.0](technical-architecture.md) · [Competitive analysis v2.0](competitive-analysis.md) · [Business model canvas v2.0](business-model-canvas.md)

---

## 1. Summary

basketch compares the current weekly grocery promotions of seven Swiss supermarkets: Migros, Coop, LIDL, ALDI, Denner, SPAR and Volg.

- The **home page** names, for each of three product groups (Fresh, Long-life, Household), the store with the highest average discount this week.
- The **deals page** lists every collected promotion by sub-category.
- A visitor adds individual deals to a **list**. basketch groups the list by store with a total per store, and the visitor can send it by WhatsApp, email or link.

There is no account and no login. The list stays in the visitor's browser.

basketch is a personal project, built and run by one person. It runs on free infrastructure plus one paid AI service capped at USD 5 per month, and it has run unattended since 28 September 2026.

---

## 2. Problem

People who shop at more than one Swiss supermarket cannot easily see which store has the better promotions this week for what they intend to buy. Each retailer publishes its offers in a different place and format: a website, a PDF flyer, or a page-flip flyer on a third-party platform. Comparing them by hand takes time, so most people default to one store and miss deals elsewhere.

basketch compares **promotions, not regular shelf prices**:
- Promotions change every week and cannot be predicted. Regular prices are fairly stable, and shoppers learn them.
- A promotion is what makes someone change store for an item.
- Regular shelf prices are not available for most retailers from the sources basketch can use. For Coop, the only usable source (aktionis.ch) lists promotions only.

---

## 3. Goal and current positioning

**Long-term goal (not built).** For each item a shopper wants, route it to the store where it is cheapest across the seven retailers. Turn the result into a shopping list grouped by store that can be forwarded. The goal is a per-item answer, not a single "which store wins" verdict per category.

**What ships today** is weekly deals from seven retailers, a home page that compares stores by category, and a list the visitor builds from deals. The list is grouped by store with an estimated total and can be shared.

| Part of the goal | Today |
|---|---|
| Promotions from all seven retailers in one place | Live. Coverage per retailer is incomplete (§7.4). |
| Per-item cheapest store | Not built. The visitor picks each deal, and so the store. Decision P-8 (25 Sep 2026): keep the category comparison, do not build routing now. |
| "Cheapest" label | Shown on deal cards. Today it marks the **biggest % discount** in a sub-category, not the lowest price. Decision P-7 (25 Sep 2026) is that it must mean the lowest price per kg, litre or piece among comparable offers. Not built. |
| List grouped by store, forwardable | Live, with known gaps when a shared link is opened (§5.6). |
| Category verdict | Live on the home page. |

---

## 4. Target user

**Primary user (working assumption from v3.1, not validated):** someone in Switzerland who shops for groceries weekly and is willing to visit more than one supermarket when the promotions justify it. They use a phone browser and do not want to install an app or create an account. The illustrative persona is "Weekend Shopper Sarah", who shops once or twice a week, usually on Saturday.

**Secondary user (implied by the share feature, not researched):** the person who receives the list and does the shopping.

**Scale:** a small audience of friends and acquaintances. The system is sized for 10–50 users (`CLAUDE.md`). No user numbers exist (§10).

**Region:** national. Research found no regional price differences at Migros or Coop: the price of an offer is the same everywhere, and only the selection of offers varies slightly by region (`docs/data-source-research-2026-09-07.md`, Part 4b). basketch therefore reads one edition per retailer; for Migros, the Zurich edition.

---

## 5. What is live (2 October 2026)

Sources: code in `web-next/src/` and `docs/use-cases.md` v3.0. Where this section cites the "data-source fact sheet", it means `docs/design/2026-09-25-data-source-facts.md`, which was verified against production code and a live run.

### 5.1 Home (`/`, `/en`)

- **Verdict hero and three category cards** (Fresh, Long-life, Household). Each card names the winning store, or says "Tied", "Only store" or "No data". Rules are in §6.1.
- **Freshness banner.** Shown if the newest data is more than 9 days old, or if the database read failed.
- **Share this week's verdict** by WhatsApp, email or copy. A share image is generated at `/card`.
- **"How it works" strip.** Weekly discounts from 7 retailers, then an AI-assigned category check, then category winners by average % off.
- **Midnight guard** (home and deals). If a tab stays open past midnight Zurich time, it offers a refresh, so expired deals are not mistaken for current ones.

### 5.2 Deals (`/deals`)

- **What is listed.** Every collected promotion that is in effect today or announced, grouped by sub-category.
- **Filters.** Type (Fresh / Long-life / Household), category, sub-category, storage (fresh, chilled, frozen, ambient) and store, plus text search.
- **Order and tags.** Within each sub-category, deals are ordered biggest discount first (P-10). The top qualifying deal (§6.2) carries the "Cheapest" tag; see §3 for what that tag means today. Offers from other stores follow under "Other stores". "Only at {store}" appears when no other store has a deal in that sub-category.
- **Each card shows:**
  - the sale price;
  - the original price and discount, where one was printed;
  - the price per unit, where known;
  - the validity dates;
  - labels where they apply: "From {date}" (not yet started), "From N items" (multi-buy), "Category unverified".
- **Product link.** The product name links to where the price came from:
  - Denner and LIDL: a product page;
  - Volg: its weekly-offers page;
  - Migros, ALDI and SPAR: the flyer;
  - Coop: aktionis.ch.

### 5.3 My list (drawer on every page) and sharing

- **Adding.** "Add to list" on any deal card. The list is saved in the visitor's browser (`localStorage`); nothing is sent to a server.
- **"Where to buy".** Items grouped by store, with a total per store and an estimated overall total (the sum of sale prices).
- **Expired items.** They stay visible and are marked "Expired", but are left out of totals and shared messages.
- **Sharing.** By WhatsApp, email (`mailto:`) or copied link. The shared text gives each store's item count and total, and names multi-buy and not-yet-started conditions (`web-next/src/lib/share.ts`). Gap D-3: a recipient who opens the link loses the multi-buy condition (§5.6).
- **Opening a shared link** (`/list?items=…`). The items that are still current are loaded into the recipient's list and the drawer opens. Items no longer in this week's data are dropped.

### 5.4 About (`/about`)

The About page covers how it works, the data source for each retailer, what is compared (promotions, not shelf prices), privacy (no account, no tracking cookies, list stored only in the browser) and a "not affiliated with any store" note.

### 5.5 Other

- **404 page.** A simple page in German or English with two buttons (P-11, P-15).
- **No accounts.** No login, no account, no email collected on any live page.
- **No analytics.** `web-next/src/lib/observability.ts` does nothing and no analytics package is installed. The live HTML carries no Vercel Insights or other tracking script (data-source fact sheet §4a).

### 5.6 Known gaps in the live product

These are confirmed in code (`docs/use-cases.md` §7). Numbering follows use cases v3.0.

| # | Gap |
|---|---|
| D-1 | Deals with no printed original price are stored with a 0% discount and still count towards the category verdict (`pipeline/categorize.ts`). The effect on verdicts has not been measured. |
| D-2 | The home page category cards open an unfiltered `/deals`: the link sends a parameter the deals page does not read. |
| D-3 | A shared link drops the "From N items" condition, so the recipient sees an open price. |
| D-4 | Opening a shared link overwrites the recipient's own list. Decision P-14 says a shared list must never replace or merge; the separate view is designed but not built (§9). |
| D-5 | A shared link with no current items empties the recipient's list. |
| D-9 | The About page still shows a contact email address that decision P-9 says is not used. |
| D-11 | Two labels say more than the logic does: "Cheapest" means biggest discount (§3), and the list summary "Your N items split best across # stores" describes deals the visitor chose, grouped by store. |

The full list, including smaller copy and error-page issues, is in `docs/use-cases.md` §7.

---

## 6. Product rules

These rules are enforced in code. Most exist because of Art. 3(1)(e) of the Swiss Unfair Competition Act (UWG): a price comparison must rest on facts that are objectively correct and can be checked (`docs/data-source-research-2026-09-07.md`, Part 4).

### 6.1 Category verdict

Code: `web-next/src/server/verdict/algorithm.ts`, `web-next/src/lib/category-rules.ts`.

- For each group (Fresh, Long-life, Household), a store's score is the **average discount %** of its qualifying deals in that group.
- A store wins only if it leads the next store by **at least 2 percentage points** and has **at least 5 qualifying deals**. The minimum deal count stops one large discount on one obscure item from deciding a whole group.
- Otherwise the result is "Tied". One store with deals gives "Only store"; no deals gives "No data".
- This is not a basket price comparison, and it does not use regular shelf prices.

### 6.2 Which deals count ("listed but does not vote")

A deal is **shown**, but does not count towards the verdict and cannot carry the "Cheapest" tag, if any of these is true (`web-next/src/lib/domain/votes-in-verdict.ts`):
- it is not yet in effect;
- its price is member-only;
- its price applies only when buying several ("from N items");
- its category is unverified.

A deal is **in effect** when its start date ≤ today ≤ its end date, using the Zurich calendar date (`docs/decisions/2026-09-15-in-effect-vs-upcoming.md`). Expired deals are hidden.

### 6.3 Prices and discounts

- **No printed original price, no calculated discount.** The collection model does not calculate a discount when the source prints no original price (the "ALDI rule", enforced in the `Offer` model). See gap D-1 for how such deals are currently stored.
- **Printed discounts are checked.** A printed discount is kept only if it matches the printed prices within ±1.5 percentage points, or within the retailer's shelf-price rounding step. Otherwise the offer is rejected (`pipeline/collection/domain/discount.ts`).
- **Unreadable prices are dropped.** Prices that cannot be read reliably from PDF or image text are dropped, never guessed.
- **Member-only prices.** The model requires a member-only price to name its programme, and the site and the shared text label such prices. No live source currently produces one. LIDL flyer pages that mention Lidl Plus are excluded entirely (`lidl-flyer-source.ts`). Coop Supercard and Migros Cumulus prices are not detected.

### 6.4 Honest copy

- The site must not suggest it lists every promotion.
- It must not claim automatic per-item routing.
- It quotes no categorisation accuracy figure (§7.3).

---

## 7. Data

### 7.1 Sources (in production since 11 September 2026)

| Retailer | Source | How it is read |
|---|---|---|
| Denner | denner.ch (the data its own site uses) | JSON |
| Volg | volg.ch weekly-offers page | HTML |
| LIDL | LIDL's public weekly flyer | JSON, plus the flyer PDF for the Lidl Plus check |
| ALDI | ALDI's public weekly flyer (Publitas) | PDF text and page coordinates |
| SPAR | SPAR's public weekly flyer (iPaper) | PDF text |
| Migros | Migros' public weekly flyer on Issuu, Zurich edition | Page images read by free OCR on the build server, then discarded |
| Coop | **aktionis.ch**, a public Swiss deal site | HTML listings |

**Why Coop is the exception.** coop.ch blocks automated access with DataDome, and basketch never works around a technical block. Coop's own flyer carries only about 11–24% of what aktionis.ch lists, depending on the measurement (`docs/collection-module-design.md`; `docs/design/2026-09-26-architect-coop-direct-source.md`). Decision P-12 (26 Sep 2026) keeps Coop on aktionis.ch, with Coop's flyer as the fallback. By volume, Coop is the largest source: 62% of offers collected in week 39 (1,018 of 1,650; data-source fact sheet §1).

**Legal position (summary, not legal advice).** Source: `docs/data-source-research-2026-09-07.md`, Part 4.
- Price facts are not protected by Swiss copyright, and Switzerland has no database right.
- The real exposure is publishing comparisons that are not accurate (UWG Art. 3(1)(e)).
- Swiss product photos are protected even without originality (Copyright Act, URG, Art. 2 para. 3bis).
- basketch does not circumvent blocks, respects robots.txt, keeps its requests to each retailer few, and identifies itself with an honest user agent.

### 7.2 Schedule and freshness

- **Runs.** Automated runs on Monday, Tuesday and Thursday, scheduled at 05:00 UTC (`.github/workflows/pipeline.yml`). GitHub often starts scheduled jobs hours late. Each run collects all seven retailers.
- **Site refresh.** When a run finishes, it tells the site to refresh its cached data. The "updated" date shown on the site is when the pipeline last wrote data, not when a retailer published.
- **Unattended operation.** An external heartbeat (healthchecks.io) alerts if no run happens. A keep-alive job stops GitHub from disabling the schedule after 60 days without a commit (`pipeline.yml`; `docs/rca/2026-09-28-tech-lead-pipeline-keepalive.md`).

### 7.3 Categorisation

- **Category list.** basketch's own category list (`shared/types.ts`), with three top-level groups: Fresh, Long-life and Household.
- **Classifier.** Google Gemini (free tier) classifies each product from its name.
- **Checker.** A second model, OpenAI gpt-5-nano via OpenRouter (the one paid service, capped at USD 5 per month), checks the answers. It checks every product on normal runs. On a cold start, with many new products, it checks a sample. Once the run's escalation budget is spent, it is skipped (`pipeline/transformation/application/classify-deals.ts`, `classify-graph.ts`).
- **"Category unverified".** Shown when the checker disputes an answer or the classifier is not confident (`classify-deals.ts`). Such deals do not count towards the verdict (§6.2).
- **Caching and hold-back.** Each product's answer is cached, so it is classified only once. Products a run does not reach in time are held back and published in the next run.
- **Filtering.** Non-grocery own brands (for example LIDL's Parkside) are filtered out, and tobacco is never shown.
- **Accuracy.** A one-off benchmark on 291 Denner products (10 Sep 2026) found the classifier wrong on 16. The checker caught 25% of those errors and raised no false alarms (`classify-graph.ts`). The benchmark does not re-run automatically, so the site quotes no current figure.

### 7.4 Known data limitations

- **Coverage is incomplete.** Each source covers only what it publishes: flyer only for SPAR, ALDI, LIDL and Migros, and aktionis.ch for Coop. Migros OCR yields relatively few offers (week 39: 55 stored); multi-buy offers are held back when the quantity cannot be read. App coupons, loyalty-card coupons and in-store-only deals are not collected.
- **Product pictures** vary by retailer:

  | Retailer | Status |
  |---|---|
  | Migros | Cropped from the flyer page by coordinates; the visitor's browser loads the page image from the retailer's host. |
  | ALDI | Designed the same way, but the pictures have never loaded (the wrong source file is read). A fix is approved (D-1 in `docs/decisions/2026-09-25-pm-decisions.md`), not started. |
  | Denner, Coop, LIDL, Volg | Photos served through the site's image optimisation (decision D-6). Volg's photo links break within about a day; a daily refresh is approved (D-2), not started. |
  | SPAR | No pictures; approach decided (D-3), not started. |

- **Migros product names** are sometimes cut short by OCR. A fix is parked (§9).
- **Scale (one run, for orientation only).** Week 39: 1,650 offers collected, 1,562 stored. 1,537 deals were in effect on 28 September 2026, counted after that day's deploy.

---

## 8. Non-functional requirements

| Requirement | Rule | Status |
|---|---|---|
| Mobile-first | Works in a phone browser, no app needed | Live |
| Accessibility | WCAG 2.1 AA: 44 px touch targets, visible focus rings, semantic HTML, no information conveyed by colour alone | Requirement; end-to-end tests include axe checks (`web-next/e2e/`) |
| Store identity | Each store has a brand colour, used only as a dot, pill or thin rail, never as a background, and always with a text label | Live |
| Languages | German (default) and English. French and Italian files exist but are not routed. | Live |
| Data freshness | Last-updated date shown; banner if data is older than 9 days | Live |
| Price accuracy | The rules in §6 | Live, with gaps D-1 and D-3 |
| No login | No accounts; the list lives in the browser | Live |
| Privacy | No tracking cookies (only a language-preference cookie), no analytics, no personal data stored | Live |
| Cost | Free tiers (GitHub Actions, Supabase, Vercel Hobby, Gemini) plus OpenRouter capped at USD 5 per month. The cap is enforced three ways: a provider limit, a spend ledger and per-call token limits. Adding a paid service is a recorded PM decision. | Live |
| Availability | Best effort; unattended since 28 Sep 2026 | Live |
| Load time | Under 2 s on 4G (v3.1 target) | Not measured |

---

## 9. Status: shipped, parked, not started, retired

Sources: `docs/decisions/2026-09-25-pm-decisions.md` and `docs/use-cases.md` §4.

**Shipped**
- Seven-retailer collection: six direct from the retailer, Coop via aktionis.ch. AI classification with a checker and a spend cap.
- Home verdict, deals page, list with per-store totals and sharing, About page, 404 page.
- Expired deals can no longer appear as current (P-17, P-19): the cache is keyed by the Zurich date, and the home page is rendered per request.
- Correct plurals and wording in German and English, updated data-source copy, and the removal of the "Worth a look" section (P-16).
- Pipeline keep-alive and heartbeat.

**Parked (built or designed, not live)**
- **Full Migros product names.** Built and approved in review. It waits on a product decision about certification labels (IP-SUISSE, AOP, Fairtrade): store them in a field, keep them in the name, or accept losing them (§13).
- **Shared list as its own page** (P-14, use case UC-18). Specified and challenged in design review with no findings. Not built. It would close gaps D-4 and D-5.
- **Variant picker, per-store availability strip and "Notify me" email form** (UC-17). The components exist but no page renders them, and the email form has nothing behind it to send or store.

**Not started**
- "Cheapest" means lowest price per kg, litre or piece (P-7, UC-15).
- Per-item cheapest-store routing (deferred by P-8, UC-16).
- Pictures for ALDI, Volg (daily refresh) and SPAR (D-1 to D-3 in the decision log).
- A contact form to replace the email address on the About page (P-9, UC-14).
- Further pipeline work packages, a database index migration, and heartbeat alert tuning.

**Retired from v3.1 and the v3.2 amendment**
- Starter packs and onboarding.
- Saved favourites and the per-item compare page (`/compare/:id`).
- Email as a lookup key, and the "email me when deals appear" opt-in.
- The region setting and the Bern-only scope.
- Planned email notifications.
- "Worth a look" suggestions.
- The 40/60 verdict formula.
- "Regular price" rows in the price ladder (no regular-price data exists).

---

## 10. Measurement

**No usage metrics exist.** No analytics are installed (§5.5), no user research has been run on the live product, and there are no user, traffic or revenue figures. This matches use cases v3.0. The v3.1 targets (activation, W4 retention, weekly returning visitors, PMF survey) are therefore not carried forward as KPIs; they are listed in Appendix A as not measured.

**What is observed**

| Measure | Source |
|---|---|
| Pipeline run success | GitHub Actions run history. Runs on 28 Sep, 29 Sep and 1 Oct 2026, all unattended, all succeeded. |
| Deals in effect | Database and live site: 1,537 on 28 Sep 2026 (counted after that day's deploy) |

**Kill criteria kept from v3.1.** These were committed to in advance. Most depend on user feedback, and none has been collected yet.

| Signal | Threshold | Action |
|---|---|---|
| Verdict trust | 3 or more users say the verdict felt wrong | Revisit the formula before adding features |
| Pipeline reliability | 2 or more consecutive weeks of failed runs | Fix infrastructure before adding features |
| Store false negatives | 3 or more users report a deal basketch missed | Check that source's coverage; fix the pipeline or the copy |
| Friends' retention | Fewer than 3 of 10 friends return in week 2 | Investigate whether it is the product or the habit |
| PMF survey | Under 20% "very disappointed" | Rethink the core comparison |

---

## 11. Out of scope

- Regular shelf-price comparison.
- Loyalty-card integration and coupon collection.
- Price history, barcode scanning, native app, reviews, recipes.
- Accounts, server-side saved lists, email notifications.
- A regional price dimension (prices are national; see §4).
- Any data collection that requires circumventing a block.

Per-item routing is not out of scope. It is the long-term goal, deferred by P-8 (§3).

---

## 12. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| A price label that says more than the data supports ("Cheapest", gap D-11) | Present today | High: trust, and UWG Art. 3(1)(e) | P-7 decided, not built. The §6.2 rules keep non-qualifying deals out of the verdict and the tag. |
| **Rappn** covers the same core question (where is it cheaper this week) for 7 Swiss chains, free and without an account, with shared lists and more features and platforms | Present today | Medium for positioning; low for a personal project | None planned. Differences and overlaps are documented in `docs/competitive-analysis.md` v2.0, §4.2. |
| Preisrunter, a grocery price-comparison app from Austria and Germany, launches in Switzerland | Unknown (pre-launch page, no date) | Medium for positioning | Watch |
| aktionis.ch becomes unavailable (Coop, 62% of offers) | Low to medium | High for Coop coverage | Coop flyer recorded as the fallback (P-12) |
| A retailer changes its flyer or site format | Medium | Medium: one store missing or wrong | Each source returns a result instead of failing the whole run. An unusually low yield counts as a failure, not a success. Tests use real captured responses. |
| A free-tier off-switch silently stops the system | Medium | High | Keep-alive job and external heartbeat (§7.2) |
| The paid AI checker exceeds its budget | Low | Low | USD 5 monthly cap, enforced three ways. The run continues without the checker if the budget cannot be read. |
| AI miscategorises products | Medium | Medium | Checker model; disputed or low-confidence results are marked and excluded from the verdict |
| Product photo copyright (URG Art. 2 para. 3bis) | Low to medium | Medium | Flyer crops are loaded from the retailer's host. The PM accepted optimised photos for four retailers (D-6). |

---

## 13. Open product questions

1. **Goal and P-8.** The long-term goal is per-item routing; P-8 keeps the category comparison for now. When should that decision be revisited, and what would trigger it?
2. **Home page role.** Should the category verdict remain the headline of the home page?
3. **Positioning against Rappn.** Why would a shopper choose basketch over Rappn, and is the retailer set (SPAR, Volg) worth competing on? (`docs/competitive-analysis.md` §6)
4. **List summary wording.** Should the list header be reworded until routing exists (D-11)?
5. **Deals without an original price.** Should they be excluded from the verdict, as member-only deals are (D-1)?
6. **Shared links.** Build the separate shared-list page now, or guard the current behaviour first (D-4, D-5)?
7. **Contact.** Remove the About page address until the contact form exists (D-9, P-9)?
8. **Migros labels.** Store certification labels in their own field, keep them in the name, or accept losing them?
9. **Variant picker and "Notify me"** (UC-17). Keep the parked components, or retire them?
10. **Measurement.** Add privacy-preserving, cookieless analytics, run a small user test, or go without a usage signal?
11. **Target user.** Who is basketch for now that it runs unattended?

---

## 14. Key decisions

| Id | Date | Decision | Why (as recorded) | Source |
|---|---|---|---|---|
| — | 9 Sep 2026 | Coop via aktionis.ch | coop.ch is blocked by DataDome; Coop's flyer is a measured ~11% subset | `docs/collection-module-design.md` |
| — | 15 Sep 2026 | OpenRouter checker approved, capped at USD 5 per month | Approved by the PM as the only paid service, with the cap enforced three ways | `CLAUDE.md` (Legal Constraints) |
| PM-1 | 17 Sep 2026 | General merchandise grouped under one category, not promoted to top level | basketch is a grocery comparison; equal weighting would change what the product appears to be | `docs/decisions/2026-09-17-pm-taxonomy-decisions.md` |
| D-4 | 25 Sep 2026 | Image-coverage alert warns but still publishes | Fresh deals go live; the alert names the store | `docs/decisions/2026-09-25-pm-decisions.md` |
| P-7 | 25 Sep 2026 | "Cheapest" must mean the lowest price | Make the label true | same |
| P-8 | 25 Sep 2026 | Keep the category comparison; do not build routing now | — | same |
| P-9 | 25 Sep 2026 | Contact form instead of a public email address | The owner's address stays in a secret setting, never in the page or the repository; must stay on free tiers | same |
| P-10 | 25 Sep 2026 | Biggest discount first within a section | Simplest for the shopper to read | same |
| P-12 | 26 Sep 2026 | Stay on aktionis.ch for Coop | Coop's own flyer is about a 20% subset | same |
| P-14 | 25 Sep 2026 | A shared list opens as its own view, never merges | The recipient's own list is never replaced or merged | same |
| P-17 | 27 Sep 2026 | Deals cache keyed by the Zurich date; no scheduled jobs | Expired deals were shown after midnight | same; `docs/decisions/2026-09-27-deals-cache-keyed-by-zurich-date.md` |

---

## Appendix A. What changed since v3.1 (21 April 2026)

v3.1 and the v3.2 amendment (22 April 2026) described a planned product that was not built in that form. v4.0 describes what is live.

- **Data sources.** v3.1: all seven retailers from aktionis.ch. Now: six direct from the retailer since 11 September 2026; Coop on aktionis.ch by decision (§7.1).
- **Verdict.** v3.1: 40% deal count + 60% discount depth, 5% tie threshold. Now: average discount, 2-point lead, at least 5 qualifying deals (§6.1).
- **Categorisation.** v3.1: keyword rules. Now: an AI classifier and checker against basketch's own category list (§7.3).
- **Price-accuracy rules** are now product requirements (§6).
- **Languages.** v3.1: English only. Now: German (default) and English.
- **Cost.** v3.1: CHF 0. Now: free tiers plus one service capped at USD 5 per month, approved 15 September 2026.
- **Retired features** are listed once, in §9.
- **From the v3.2 amendment, kept:**
  - every sub-category view shows all stores with a deal;
  - it compares the best promotion per store, not the same product;
  - sub-category is an explicit filter;
  - brand colour is never a background.
- **Metrics.** The v3.1 targets are not measured, because no analytics are installed:
  - activation (5+ favourites, 30%);
  - weekly comparison rate (50%);
  - W4 retention (40%);
  - weekly returning visitors (20+);
  - PMF survey (40% "very disappointed");
  - time to decision (under 30 s);
  - email subscribers.

  Targets tied to retired features no longer apply.

# PM Coach Review: PRD v1.0 + Use Cases v1.2 (Specs V2 Update)

**Reviewer:** Senior PM Coach (Strategy Advisor)
**Date:** 12 April 2026
**Documents reviewed:** `docs/prd.md` (v1.0), `docs/use-cases.md` (v1.2)
**Focus:** 10 new requirements added to PRD + updated use cases

---

## Overall Assessment: STRONG WITH 4 FLAGS

The V2 update is materially better than what you had before. The verdict formula, display states, data freshness visibility, and URL-first return path are all decisions that would have caused real problems if left unresolved during build. You resolved them before writing code. That is high-agency PM work (Shreyas).

However, I have 4 flags that need resolution before build starts.

---

## CHALLENGES

### C1: 8 Starter Packs Is Over-Scoped for MVP

**Situation:** PRD specifies 8 starter packs, each with 15-16 items, covering segments from Swiss Basics to Fitness & Protein.

**Behavior:** You are building for 10-50 users (friends network in Bern). You are treating segment coverage like you are launching to 10,000 users. 5 of the 8 packs target segments that represent 5-15% of your user base each. That means 1-2 people per pack at your scale.

**Impact:** Each starter pack requires: (a) product research for 15-16 items, (b) keyword mapping to both Migros and Coop catalogs, (c) testing that the keywords actually match real deals, (d) UI space on the selection screen. That is 8x the work for a feature where 70%+ of your MVP users will pick Swiss Basics or Familientisch.

**Framework:** Julie Zhuo's subtraction test -- "What can we remove and have it work just as well?" Remove 5 packs and the product works identically for 80% of your initial users.

**Recommendation:** Ship 3 packs for MVP: Swiss Basics (default), Familientisch, and Studentenküche. These cover your actual Bern friend network. Add a "Custom" option where users can search and build from scratch. Add the other 5 packs in Phase 2 based on actual user requests. If someone asks "where is the Indian Kitchen pack?" -- that is demand signal. If nobody asks, you saved 40 hours of product research.

**Severity:** Medium. Not a blocker, but this is the clearest case of building for imagined users instead of real ones.

---

### C2: The Data Model Is Over-Engineered for MVP

**Situation:** PRD Section 6 specifies three new tables: `products` (with brand extraction, quantity parsing, organic detection, product_group_id), `product_groups` (cross-store matching), and an expanded `deals` table with sub_category.

**Behavior:** The `products` and `product_groups` tables serve a use case that does not exist in MVP. Product-level cross-store matching ("is M-Budget milk the same as Prix Garantie milk?") is a Phase 2+ problem. You said so yourself in the PM Coach agent definition under Product Matching Strategist: "Category comparison (MVP) -- simple, no matching needed."

**Impact:** You are building infrastructure for product-level matching before you have validated that category-level comparison is even useful. If users do not care about the category verdict (your MVP bet), the product matching layer is wasted work. Worse, the metadata extraction pipeline (brand, quantity, unit, organic) adds complexity to the weekly pipeline that could delay M0.

**Framework:** Teresa Torres -- "How do we know users want this?" You do not. You are stacking assumptions: (1) users want category comparison, (2) they also want product-level matching, (3) the matching needs to be pre-computed in a `product_groups` table. Validate assumption 1 before building for assumption 3.

**Recommendation:**
- MVP schema: `deals` (flat, one row per deal per week) + `baskets` + `basket_items`. That is it.
- `basket_items` should store product keywords (not product_group_id) for MVP. Matching favorites to deals is a text search problem, not a relational join problem, at this scale.
- Defer `products`, `product_groups`, and all metadata extraction (brand, quantity, organic) to Phase 2.
- Add the richer schema when you have evidence that users want product-level comparison.

**Severity:** High. This directly impacts M0 delivery timeline (Week 1-2). Pipeline complexity is the number one risk to shipping on schedule.

---

### C3: Verdict Formula Needs a "Show Your Work" Clause

**Situation:** PRD defines verdict as 40% deal count + 60% average discount depth, with a 5% tie threshold.

**Behavior:** The formula is reasonable. The problem is that users will not trust a verdict they cannot verify. If basketch says "Migros wins for Fresh" but Sarah sees 3 great Coop deals and only 1 mediocre Migros deal with a high discount, she will think the verdict is wrong. She has no way to understand why.

**Impact:** A verdict that feels wrong erodes trust faster than no verdict at all. The 60% weighting on discount depth means a single 50% off Migros deal can outweigh five 15% off Coop deals. That is mathematically correct but experientially wrong for a shopper who buys 5 items.

**Framework:** Don Norman -- "What does the user think this does?" Sarah thinks the verdict means "which store is better for me this week." The formula answers "which store has deeper discounts on average." These are not the same question when deal counts are lopsided.

**Recommendation:**
- Add a one-line explanation under the verdict: "Based on 12 Migros deals (avg 28% off) vs 8 Coop deals (avg 22% off)." This takes 30 minutes to build and eliminates the trust gap.
- Consider adding a minimum deal count threshold: if a category has fewer than 3 deals from a store, show "Not enough data" instead of a verdict. A verdict based on 1 deal is noise, not signal.
- The 40/60 weighting is fine as a starting point. But define the iteration trigger: if 3+ users say "the verdict felt wrong," revisit the formula.

**Severity:** Medium. Not a blocker, but ship the explanation with the verdict. Do not ship a black-box verdict.

---

### C4: UC-2 Main Flow Still Shows Email-First, Contradicting URL-First Decision

**Situation:** PRD Section 3 (US-4) and the Information Architecture both state URL-first return path. UC-6 is explicitly about bookmark/direct URL as primary return.

**Behavior:** UC-2 (View Weekly Comparison) Main Flow step 1-2 says: "Opens basketch -> Shows email entry -> Enters email address -> Retrieves favorites." This describes email-first, not URL-first. The return visit flow should start with "Opens bookmark" not "Opens basketch and enters email."

**Impact:** If a builder reads UC-2 literally, they will build the return visit flow around email lookup. This contradicts the architectural decision. The user journey map (Section 4) correctly shows "Open bookmark or saved link" for return visits, but UC-2 does not match.

**Recommendation:** Rewrite UC-2 Main Flow to reflect URL-first:
- Step 1: Opens saved bookmark (`/compare/:favoriteId`)
- Step 2: System shows updated comparison with this week's deals
- Step 3-6: Same as current

Move the email lookup flow entirely to UC-8 (which already exists for this purpose). UC-2 should not mention email at all.

**Severity:** Medium. Inconsistency between PRD decision and use case specification. Must fix before build to avoid confusion.

---

## APPROVALS

### A1: Verdict Display States -- Well Designed

The 5 states (normal, tie, stale, partial, no data) cover every realistic scenario. The "no data = don't show banner" decision is correct -- a blank verdict is better than a wrong one. The 7-day stale threshold with amber warning gives users the information to decide for themselves. This is edge case thinking that separates a good product from a mediocre one (Proactive Trigger #5: Edge Case Avoidance -- you passed).

### A2: URL-First Return Path -- Right Call

Email lookup as fallback rather than primary is correct. Bookmarkable URLs have zero friction, work across devices, and do not require the user to remember which email they used. This also removes the need for email verification in MVP -- a significant scope reduction. Shreyas would call the email verification you did not build an Overhead task avoided. Good.

### A3: Deals Browsing as Phase 2 -- Correct Phasing

The `/deals` page is a browsing experience. Your MVP bet is on personalized comparison, not browsing. Shipping both would split user attention and make it unclear what basketch is. Phase 2 is the right place for this. You can also use Phase 1 analytics to see if users even want to browse -- if they do not click "see all deals" links (which you could add as a teaser), do not build it.

### A4: WCAG 2.1 AA as NFR -- Right Level of Ambition

Accessibility from day one is correct for a Swiss product. The specific criteria (4.5:1 contrast, 44px touch targets, keyboard navigation, screen reader support) are concrete enough to test against. The "no information by color alone" clause directly addresses the store-color strategy -- good catch.

### A5: OG Meta Tags for WhatsApp -- Growth-Critical, Correctly Prioritized

WhatsApp is the primary sharing channel in Switzerland. Without OG tags, shared links are bare URLs that nobody taps. This is a 2-hour implementation that unlocks your entire organic growth channel. Must-have, not nice-to-have. Correctly placed.

### A6: Store Identity Through Color -- Smart Brand Decision

Migros orange and Coop red are already how Swiss residents identify these stores. Using their actual brand colors creates instant recognition. The constraint that "all other UI colors are neutral" prevents the interface from looking like a Christmas tree. This is a design decision that will make the product feel Swiss and trustworthy.

### A7: 404/Error Pages -- MVP-Appropriate

Often forgotten, always noticed. An invalid comparison UUID showing a friendly message instead of a blank screen is the difference between "this product is broken" and "let me try again." Correctly scoped: simple message + link home. No over-engineering.

---

## GAPS

### G1: No Kill Criteria Defined

**Framework:** Annie Duke -- "What evidence would make us stop building this?"

The PRD has success metrics and PMF measurement, but no explicit kill criteria. You need to define, before build starts, what would make you stop or pivot.

**Proposed kill criteria:**

| Signal | Threshold | Action |
|--------|-----------|--------|
| M0 data quality | < 70% of deals correctly categorized after keyword rules | Pause frontend, fix pipeline first |
| M2 friends beta | < 3 out of 10 friends return in week 2 | Investigate -- is it the product or the habit? |
| M3 PMF survey | < 20% "Very Disappointed" | Pivot: either the comparison is not useful, or the favorites matching is wrong |
| Verdict trust | 3+ users say "the verdict felt wrong" | Revisit formula before iterating on features |
| Pipeline reliability | 2+ consecutive weeks of failed fetches | Fix infrastructure before adding features |

### G2: No Acceptance Criteria for Onboarding Flow Timing

UC-1 says "setup under 60 seconds" but there is no measurement plan for this. How will you measure it? Stopwatch during user testing? Analytics event from first tap to comparison view? Define the instrumentation now or you will not know if you hit the target.

**Recommendation:** Add two analytics events: `onboarding_started` (user taps a starter pack) and `comparison_first_viewed` (comparison page loads for a new basket). The delta is your setup time metric.

### G3: Missing UC-9 Definition

The traceability table references UC-9 (Email Notifications, Phase 3) but there is no UC-9 section in the use cases document. UC-8 goes straight to UC-10. This is a documentation gap -- not a scope issue (it is Phase 3), but the spec should either include a stub or note it as deferred.

### G4: No Fallback for Native Share API

UC-7 says "the native share API is invoked (on supported devices)." The Web Share API is not supported on desktop Firefox or older Android browsers. The acceptance criteria mention "or copies as fallback" in UC-6, but UC-7 does not specify the fallback behavior when native share is unavailable.

**Recommendation:** UC-7 should specify: "On devices without Web Share API support, show a 'Copy Link' button as fallback."

### G5: Basket Size Limits Not Specified

What happens if a user adds 50 favorites? 100? The starter packs have 15-16 items, but there is no upper bound on how many items a user can add via search. At some point, the comparison page becomes unusable (100 items, most with no deals). Define a soft cap (e.g., 30 items with a "your list is getting long" nudge) or explicitly state "no limit" as a conscious decision.

---

## RECOMMENDATIONS

### R1: Scope the MVP Build to 6 Weeks, Not 8

Your milestones show M0-M4 spanning 9 weeks. With the data model simplification I recommended (C2), M0 drops from 2 weeks to 1 week. With 3 starter packs instead of 8 (C1), content preparation drops from days to hours. This gives you a buffer for the things that always take longer than expected: CSS on mobile, edge case handling, pipeline debugging.

### R2: Add a "Verdict Explanation" Line Item to M1

Per Challenge C3, do not ship a black-box verdict. Add a single line of work to M1: "Show deal count + avg discount under verdict banner." This is a 30-minute implementation that prevents the #1 trust issue.

### R3: Define Your "Week 1 Dashboard"

What will you look at every Thursday after launch to know if things are working? Define 5 numbers you check weekly:

1. Pipeline success (both sources fetched? deal count reasonable?)
2. Unique visitors this week
3. Returning visitors (bookmark opens)
4. Onboarding completions (new baskets created)
5. Average favorites per basket

If you do not define what to look at, you will not look at anything. Metric blindness (Proactive Trigger #4).

### R4: Fix UC-2 Before Builder Starts

The inconsistency flagged in C4 must be resolved before any builder reads the use cases. A builder will implement what the UC says, not what the PRD decided. Rewrite UC-2 Main Flow to match the URL-first decision. This takes 10 minutes and prevents a wrong implementation that takes hours to redo.

---

## DECISION LOG

| # | Decision | Status | PM Action Required |
|---|----------|--------|-------------------|
| C1 | Reduce starter packs from 8 to 3 for MVP | Challenge -- PM decides | Accept, reject, or modify |
| C2 | Simplify data model (drop products/product_groups for MVP) | Challenge -- PM decides | Accept, reject, or modify |
| C3 | Add verdict explanation line + minimum deal threshold | Challenge -- PM decides | Accept, reject, or modify |
| C4 | Fix UC-2 main flow to match URL-first decision | Inconsistency -- must fix | Rewrite UC-2 before build |
| G1 | Define kill criteria | Gap -- needs addition | Add to PRD Section 8 or use-cases |
| G2 | Add onboarding timing instrumentation | Gap -- needs addition | Add analytics events to UC-1 |
| G3 | Add UC-9 stub or note | Gap -- minor | Add placeholder |
| G4 | Add share API fallback to UC-7 | Gap -- needs addition | Add to UC-7 acceptance criteria |
| G5 | Define basket size limit or explicitly defer | Gap -- needs decision | Decide and document |

---

## SUMMARY VERDICT

**Ship readiness:** 7/10. The specs are thorough and well-reasoned. The 4 challenges are all fixable within a day. The most important action is C2 (simplify data model) because it directly impacts how long M0 takes. If M0 slips, everything slips.

**What Shreyas would say:** "You are operating at the right altitude -- these are execution-level decisions, not strategy debates. But you are carrying Overhead scope (8 packs, product_groups table) that does not serve the 30-second verdict. Cut it."

**What Teresa Torres would say:** "You have strong assumptions about what users want (category comparison, starter packs, verdict). You have a plan to validate them (friends beta, PMF survey). Good. But you have not defined what you would learn if those assumptions are wrong. Add kill criteria."

**What Lenny would say:** "The urgency is right. The focus on personal favorites over generic deal browsing is the correct bet. Ship it."

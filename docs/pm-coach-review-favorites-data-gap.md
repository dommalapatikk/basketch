# PM Coach Review: Favorites Feature Data Asymmetry

**Author:** Senior PM Coach (Strategy Advisor)
**Date:** 12 April 2026
**Status:** Advisory — all decisions belong to the PM

---

## The Problem, Stated Clearly

When Sarah adds "milk" to her favorites:

- **Migros:** We can search the full catalog. We know whether milk is on promotion or not. We can say "on sale" or "not on sale" with confidence.
- **Coop:** We only have promotional items (via aktionis.ch). If Coop milk is not on sale, it simply does not exist in our data. We cannot distinguish "not on sale" from "we don't know."

The UI shows the same thing for both cases: silence from Coop. That silence is honest in one case and misleading in the other.

---

## 1. Is This Fatal or Manageable?

**Manageable. Not fatal. But only if you handle it honestly.**

Here is my reasoning:

**Cagan V/U/F/V test:**

| Dimension | Assessment |
|-----------|------------|
| **Valuable** | Yes — the favorites feature solves a real job: "which of MY items are on promotion this week." Even with asymmetric data, the feature delivers value when items ARE on promotion at either store. |
| **Usable** | At risk — if users misread silence as "not on sale at Coop" when it actually means "we don't know," the feature erodes trust. Usability depends on how the gap is communicated. |
| **Feasible** | Yes — technically fine, the data is what it is. |
| **Viable** | Yes for a 10-50 user product. Would need to be resolved for scale. |

**Teresa Torres assumption test:**

The favorites feature stacks two assumptions:

1. **"Users will add items and check weekly"** — this is the habit assumption. Testable. Reasonable.
2. **"The comparison across stores is fair and trustworthy"** — this is the trust assumption. This is where the data gap bites.

Assumption #2 is a leap-of-faith assumption. If users lose trust in the comparison, the entire feature collapses — not just the Coop side, but the Migros side too. Because once a user thinks "this might be incomplete," they stop trusting ANY result from basketch.

**Shreyas LNO classification:**

Handling this data gap correctly is a **Leverage task**. Getting it right costs almost nothing (it is a UI copy decision). Getting it wrong poisons the core product. The ratio of impact-to-effort is enormous.

**Verdict: Manageable, but the UI handling is the highest-leverage decision in the favorites feature.**

---

## 2. How Should the UI Communicate This?

Let me evaluate each option honestly.

### Option A: "No Coop promotion found"
**Problem:** Implies we searched Coop's full catalog and found nothing. We did not. We searched only items currently on promotion. This is a lie of omission.
**Verdict: Reject.** It sounds thorough when it is not.

### Option B: "Not on sale at Coop this week"
**Problem:** States as fact something we cannot verify. If Coop milk IS on sale but aktionis.ch has not listed it yet (lag, error, niche product), we have made a false claim.
**Verdict: Reject.** Stating certainty where none exists is exactly how you lose Swiss users. Swiss consumers respect honesty; they punish overstatement.

### Option C: Show nothing (current approach — silence)
**Problem:** The user sees "Milk — on sale at Migros (-25%)" and nothing from Coop. They assume: Coop has no deal. Maybe true, maybe not. The product has made a claim by omission.
**Verdict: Reject for favorites.** Silence works fine on the /deals browsing page (where users expect to see only what IS on promotion). But on the /compare page, where the whole point is "show me both stores," silence from one store is ambiguous and misleading.

### Option D: "Coop: check in store"
**Problem:** Honest but useless. It says nothing. Why does the user need basketch if the answer is "go check yourself"?
**Verdict: Reject.** This is abdication dressed as transparency.

### Option E (my recommendation): Two-tier system based on what we actually know

**Tier 1 — Coop product has appeared in our data before (exists in products table):**

> "Not on promotion at Coop this week"

This is truthful. We KNOW this Coop product exists (we have seen it promoted before). We KNOW it is not in this week's promotions (we checked aktionis.ch). Both claims are verifiable.

**Tier 2 — Coop product has NEVER appeared in our data:**

> "Coop status unknown — we track promotions only"

Or shorter: "No Coop data yet"

This is also truthful. We have never seen this product at Coop. We literally do not know. We say so.

**Why this works:**

1. **It matches what we actually know.** Tier 1 is a confident statement backed by data. Tier 2 is an honest admission backed by nothing — and says so.
2. **It builds trust through precision.** When the user sees "Not on promotion at Coop this week," they know basketch has checked. When they see "No Coop data yet," they know basketch is being honest about its limits. Both are trustworthy signals.
3. **It gets better over time.** As the products table accumulates Coop products, more items move from Tier 2 to Tier 1. The user sees the product improving.
4. **It is simple to implement.** One query: does this product_keyword or product_group_id have ANY Coop product in the products table? Yes = Tier 1 copy. No = Tier 2 copy.

**Implementation detail:** On the /compare/:favoriteId page, each favorite item should show one of four states:

| State | Migros | Coop | Display |
|-------|--------|------|---------|
| Both on sale | Sale price + discount | Sale price + discount | Best case. Show both. |
| Migros only | Sale price + discount | Known product, no deal | "Not on promotion at Coop this week" |
| Migros only | Sale price + discount | Unknown product | "No Coop data yet" |
| Coop only | Not on sale (we know) | Sale price + discount | "Not on promotion at Migros this week" |
| Neither on sale | Not on sale (we know) | Known product, no deal | "No promotions this week" |
| Neither on sale | Not on sale (we know) | Unknown product | "Not on promotion at Migros. Coop: no data yet." |

Note the asymmetry: Migros ALWAYS gets a confident statement (we have full catalog access). Coop gets a confident statement only when we have historical data.

---

## 3. Does This Change the Value of the Favorites Feature?

**It reduces value at launch but not fatally. And value increases every week the pipeline runs.**

Here is the honest math:

- **Week 1 of basketch:** The products table has zero Coop products (pipeline has never run). Every Coop lookup returns "No Coop data yet." The favorites feature is essentially a Migros-only promotion checker with honest gaps for Coop.
- **Week 4:** After 4 weeks, the products table has accumulated perhaps 200-400 unique Coop products (aktionis.ch lists ~200+ deals per week, many repeating). Common staples like milk, chicken, pasta have almost certainly appeared. Most starter pack items move to Tier 1.
- **Week 12:** Most everyday grocery items have appeared in Coop promotions at least once. The "No Coop data yet" state becomes rare for normal favorites.
- **Week 26+:** Essentially complete for the product categories people actually buy regularly. The data gap becomes a non-issue for most users.

**The value curve:**

```
Value to user
     ^
     |                          _______________
     |                    _____/
     |               ____/
     |          ____/
     |     ____/
     |    /
     |___/
     +---------------------------------> Weeks of pipeline running
     W1    W4    W8    W12   W26
```

**Shreyas framing:** The favorites feature is a **growing asset, not a static feature.** Every week it runs, it gets more valuable. This is actually a strength if positioned correctly — but a weakness if you promise full coverage from day one.

**Teresa Torres opportunity framing:** The real opportunity here is not "compare two stores perfectly from day one." The opportunity is "know where your regular items are on sale, with coverage improving every week." Frame it as a living system, not a finished comparison.

---

## 4. Does the Problem Get Better Naturally?

**Yes. Substantially. But with a ceiling.**

The products table accumulates Coop products as they appear in weekly promotions. This means:

**What improves:**
- Popular staples (milk, bread, chicken, cheese, pasta, eggs) appear in Coop promotions frequently — probably within the first 2-4 weeks. These are exactly the items people add to favorites.
- Seasonal items accumulate over a full year (berries in summer, raclette cheese in winter).
- Non-food household items (detergent, toilet paper, cleaning products) cycle through promotions regularly.

**What does NOT improve:**
- Niche products that Coop rarely promotes (specialty items, regional products).
- Brand-new products that have never been on sale.
- The "regular price" gap — we will never know Coop's non-promotional price for items not currently on sale.

**The natural accumulation rate:**

| Timeframe | Est. unique Coop products in DB | Coverage for typical favorites list |
|-----------|--------------------------------|-------------------------------------|
| Week 1 | 0 (first run) + 150-250 from first scrape | ~40-60% of a 15-item list |
| Week 4 | 400-600 | ~70-80% |
| Week 12 | 800-1200 | ~85-90% |
| Week 26 | 1500-2000 | ~90-95% |
| Week 52 | 2000-3000 | ~95%+ for everyday items |

**Key insight:** The first scrape itself already covers a significant chunk. Coop promotions typically include 150-250 items per week, and they skew heavily toward exactly the staple categories people put in favorites. Week 1 is not zero coverage — it is the coverage of one week's Coop promotions.

**Recommendation:** Run the pipeline at least 2-3 times before the friends beta launch. Do not launch the favorites feature with zero Coop history. Even 2-3 weeks of accumulated data dramatically changes the experience.

---

## 5. Should Favorites Be Limited to Known Products?

**No. But the UI should distinguish clearly between "known" and "unknown" products.**

Here is why limiting to known products is wrong:

1. **It punishes Coop.** If you only allow favorites for products that have appeared in promotions, you can add ANY Migros product (full catalog) but only previously-promoted Coop products. The feature becomes structurally biased toward Migros. Users who shop primarily at Coop feel underserved.

2. **It creates a confusing search experience.** User searches "Windeln" (diapers). Migros results appear (full catalog). No Coop results. User thinks Coop does not sell diapers. Wrong — Coop just has not had a diaper promotion since basketch launched.

3. **It prevents the accumulation that solves the problem.** If a user adds "Windeln" to favorites and Coop runs a diaper promotion in week 3, basketch should catch it. But if you blocked the user from adding it because "no Coop data exists," you have prevented the very discovery that makes the feature better.

**The right approach:** Let users add anything. Show honest status per store. Let the data catch up to the user's intent.

**One exception worth considering:** The search/add flow could show a subtle indicator next to each result:

- "Milk" → shows Migros results + Coop results (from historical promotions) → user picks one → both stores tracked
- "Niche product X" → shows only Migros results → user adds it → Migros tracked, Coop shows "No data yet"

This is informational, not restrictive. The user still has full control.

---

## 6. Should Starter Packs Be Validated Against Promotional Data?

**Yes. This is a Leverage task. Do it.**

Here is why this matters:

The starter packs are the user's FIRST experience with the favorites feature. If Sarah picks "Swiss Basics" (16 items) and sees:

- 4 items on sale at Migros
- 2 items on sale at Coop
- 10 items showing "No Coop data yet"

Her first impression is: "This tool does not work for Coop." She will not come back in week 4 when the data has improved. **First impressions are permanent.**

**What to validate:**

1. **Run the pipeline 2-3 times before beta launch.** This is the single most important pre-launch task for favorites.

2. **After running, check each starter pack item against the products table:**

   For each keyword in each starter pack:
   - Does at least one Migros product exist? (It should — full catalog.)
   - Does at least one Coop product exist in historical data? (Check products table.)
   - If a Coop product does NOT exist for a starter pack keyword, flag it.

3. **Reorder starter pack items so that items with BOTH-store coverage appear first.** The user's first scroll should show matched items from both stores, not a wall of "No Coop data yet."

4. **Consider a "confidence score" per starter pack:**

   > "Swiss Basics: 14 of 16 items tracked at both stores"

   This sets expectations honestly. The user knows 2 items have incomplete data before they even see the comparison.

5. **For the beta launch specifically:** If more than 3 items in a starter pack have zero Coop data, consider swapping those items for ones that DO have Coop history. The starter pack should showcase the feature at its best, not its worst.

**What NOT to do:**
- Do not remove items from packs permanently just because Coop has not promoted them yet. The packs are designed around shopping habits, not data availability. But for launch, put the best foot forward.
- Do not show only items with both-store data — that defeats the purpose of honest communication.

---

## 7. Pre-Mortem: What Could Kill the Favorites Feature?

Running a quick Shreyas-style pre-mortem:

| Failure mode | Likelihood | How it kills the feature | Prevention |
|--------------|------------|--------------------------|------------|
| Users see too many "No Coop data yet" messages on first use | HIGH (at launch) | First impression: "This only works for Migros." They leave and do not return. | Run pipeline 2-3x before launch. Validate starter packs. |
| Users misunderstand silence as "not on sale" | MEDIUM | They make shopping decisions based on incomplete data. Trust breaks when they discover a Coop deal basketch missed. | Implement the two-tier communication system (Section 2). |
| The two-tier system feels too complicated | LOW | Users tune out status messages and just look at prices. | Keep the copy extremely short. One line. No explanations needed. |
| Coop promotions do not cover staple items frequently enough | LOW (staples cycle fast) | The "No data yet" state persists for common items. | Monitor accumulation rate. Adjust starter packs if needed. |
| Users compare basketch to competitors that show all deals | MEDIUM | "Aktionis.ch shows everything, basketch only shows my 15 items with gaps." | The value is personalization + comparison, not completeness. Make sure the comparison works well for items that DO have data. |

---

## 8. Recommendations Summary

Ranked by leverage (impact-to-effort ratio):

| # | Recommendation | Effort | Impact | LNO |
|---|---------------|--------|--------|-----|
| 1 | Run the pipeline 2-3 weeks before beta launch to accumulate Coop product history | Low (just run the cron job) | Critical — changes the entire first-use experience | **Leverage** |
| 2 | Implement two-tier Coop status messages ("Not on promotion" vs "No data yet") | Low (one DB query + copy) | High — trust mechanism | **Leverage** |
| 3 | Validate starter pack items against actual product data before launch | Low (one script) | High — first impression management | **Leverage** |
| 4 | Reorder favorites results: both-store matches first, single-store after | Low (sort order) | Medium — visual impact | Neutral |
| 5 | Show per-pack coverage indicator during onboarding | Medium (UI work) | Medium — expectation setting | Neutral |
| 6 | Add a small footer on /compare page: "Coop coverage improves each week as more items go on promotion" | Trivial (one line of copy) | Low-Medium — manages long-term expectations | Neutral |

**Items 1-3 should be non-negotiable for the beta launch.** They are all low-effort, high-impact, and directly address the trust risk.

---

## 9. The Honest Frame

Here is how I would describe the favorites feature to a user, with full honesty:

> **"basketch checks this week's Migros and Coop promotions against your favorites list. For Migros, we can confirm whether each item is on sale or not. For Coop, we catch every promotion listed on aktionis.ch — but if a Coop product has never been promoted since we started tracking, we will tell you we do not have data yet rather than guess."**

This is the kind of copy that would go on an /about page, not in the UI itself. But it is the mental model you want users to have. The UI implementation (two-tier messages) communicates the same thing implicitly, without a paragraph of explanation.

---

## 10. Kill Criteria for This Specific Risk

Per the Annie Duke framework — define in advance what would make you act:

| Signal | Threshold | Action |
|--------|-----------|--------|
| Users report "Coop data seems incomplete" | 2+ users in first 2 weeks | Verify Coop scraping is working. If data is correct, improve the UI messaging. If data is wrong, fix pipeline. |
| More than 50% of starter pack items show "No Coop data yet" at launch | Check before launch | Delay favorites launch by 1-2 weeks to accumulate more data. Or launch /deals first, favorites second. |
| Users ignore favorites and only use /deals browsing | 80%+ traffic to /deals vs /compare after week 4 | The favorites concept may not resonate. Consider making /deals the primary experience and favorites a secondary add-on. |
| Coop product accumulation rate is slower than expected (<100 new products/month after month 1) | Check at week 8 | Investigate: is aktionis.ch coverage declining? Are promotions seasonal? Consider supplementary data sources. |

---

*This review addresses a specific product risk. All decisions remain with the PM. The recommendations are advisory — push back on anything that does not feel right, and we will debate it with frameworks.*

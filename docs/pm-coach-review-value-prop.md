# PM Coach Review: Value Proposition vs Data Reality

**Reviewer:** Senior PM Coach (Strategy Advisor)
**Date:** 12 April 2026
**Status:** Review — requires PM decisions
**Scope:** Data asymmetry between Migros and Coop, and its impact on the value proposition, verdict, and user trust

---

## Executive Summary

The PRD promises something the data cannot deliver. The problem statement says "which of MY products are cheaper where this week" — but basketch cannot answer that question. It can only answer "which of MY products are ON PROMOTION this week, and at which store." These are fundamentally different questions, and conflating them will erode trust with Swiss users on first use.

This is not a minor copy issue. It is a structural misalignment between the product's promise and its capability. Fixing it changes the problem statement, the verdict framing, the user journey copy, and — potentially — makes the product MORE valuable, not less.

---

## 1. The Data Reality (No Sugarcoating)

| Capability | Migros | Coop | Can basketch deliver it? |
|-----------|--------|------|--------------------------|
| Full product catalog | Yes (migros-api-wrapper) | No | No — asymmetric |
| Regular/shelf prices | Yes (available via API) | No (aktionis.ch has promotions only) | No — one-sided |
| Promotional/sale prices | Yes | Yes (aktionis.ch) | Yes — both stores |
| Discount depth (% off) | Yes | Yes | Yes — both stores |
| "Which store is cheaper for milk?" | Would need regular prices from both | Missing Coop regular prices | **No** |
| "Which store has milk on sale?" | Yes | Yes | **Yes** |
| "Which store has deeper/more promotions in Fresh?" | Yes | Yes | **Yes** |

**The honest boundary:** basketch can compare PROMOTIONS across both stores. It cannot compare PRICES across both stores. The word "cheaper" implies price comparison. The data only supports promotion comparison.

---

## 2. Challenge: The Current Value Proposition Is Misleading

### What the PRD currently says (direct quotes):

- Problem statement: "which of MY products are cheaper where this week"
- User journey: "Buy these at Migros (cheaper): milk, bread"
- Verdict: "This week: Migros for Fresh, Coop for Household"
- Savings summary: "Migros CHF 12.50 (3 items) | Coop CHF 8.40 (2 items)"
- Sarah's frustration: "I never know which one is actually better this week"
- Anti-persona exclusion: "Price-obsessed optimizer"

### Why this is wrong:

1. **"Cheaper" is a price claim.** If Sarah's milk is CHF 1.95 at Migros (regular) and CHF 2.10 at Coop (regular, but unknown to us), saying "Buy at Migros — cheaper" is a claim we cannot verify. We only know Migros has milk on PROMOTION this week.

2. **The verdict "Migros wins for Fresh" means "Migros has more/deeper promotions on fresh items."** That is useful information — but it is NOT the same as "Migros is cheaper for fresh items." Coop might have lower regular prices on fresh items every week. We do not know.

3. **"Buy these at Migros / Buy these at Coop" implies a price-optimized split list.** In reality, it is a "these items are on promotion at this store" split list. A user might follow the split and still pay more than buying everything at one store.

4. **Swiss consumers will catch this immediately.** Switzerland is a high-trust, high-skepticism market. If someone sees "cheaper" and then checks and finds Coop's regular price was lower than Migros's promotion price, basketch loses credibility permanently. One broken promise = never return.

**Framework (Teresa Torres — Assumption Mapping):** The entire product is built on the assumption that "on promotion = cheaper." That assumption is unvalidated and likely false in many cases. This is a foundational assumption that must be addressed before launch, not after.

---

## 3. The Reframed Value Proposition

### What basketch CAN honestly promise:

> **"See which of your regular items are on promotion this week at Migros and Coop — before you leave the house."**

Or more concisely:

> **"Your weekly promotions, compared. Migros vs Coop."**

### The honest JTBD reframe:

| Current (misleading) | Reframed (honest) |
|----------------------|-------------------|
| "Which of MY products are cheaper where" | "Which of MY products are on sale where" |
| "Buy these at Migros (cheaper)" | "On sale at Migros this week" |
| "Migros wins for Fresh" | "More fresh promotions at Migros this week" |
| "Savings: CHF 12.50" | "Promotions on your items: 3 at Migros, 2 at Coop" |
| "Which store is better this week?" | "Where are the promotions this week?" |
| "Where should I shop?" | "What's on sale before I shop?" |

### Why this reframe is BETTER, not worse:

**Framework (Shreyas Doshi — Three Levels of Product Work):**

At the vision level, the question is: what recurring decision does basketch help with? The answer is not "which store is cheapest" (that requires data we do not have). The answer is: **"What promotions exist on items I actually buy, before I decide where to shop?"**

This is arguably MORE useful than a price comparison tool because:

1. **Promotions are time-sensitive.** Regular prices are stable. You can learn regular prices through experience. You CANNOT learn this week's promotions without checking. That is the information asymmetry basketch resolves.

2. **Promotions drive the weekly decision.** Nobody switches stores because Migros milk is 5 Rappen cheaper every week. People switch stores because Coop has 40% off chicken THIS WEEK. The promotion is the trigger for the store decision.

3. **It matches the actual shopping behaviour.** Sarah does not calculate whether Migros is 2% cheaper overall. Sarah wants to know: "Is anything I buy on a good deal this week? Where?" That is what basketch delivers.

4. **It is a clean, defensible promise.** No asterisks. No "based on available data." No footnotes. "Here are this week's promotions on your items" is a statement that is 100% verifiable by the user.

---

## 4. Impact on the Verdict

### Current verdict: "Migros wins for Fresh"

**Problem:** "Wins" implies a comprehensive comparison. It is not. It means "Migros has more and/or deeper promotions on fresh items this week." That is a narrower, but still useful, claim.

### Recommended verdict reframe:

| Current | Recommended | Why |
|---------|-------------|-----|
| "This week: Migros for Fresh" | "More fresh deals at Migros this week" | Says what it means. No implied price comparison. |
| "Migros wins for Fresh" | "Fresh promotions: Migros leads (12 deals, avg 28% off)" | Transparent. User can evaluate. |
| "It's a tie" | "Similar promotions this week" | Accurate framing. |
| "Go to Migros for vegetables, Coop for household" | "More vegetable deals at Migros, more household deals at Coop" | Directive without price claim. |

### Should the verdict still exist? Yes.

The verdict is still valuable because it answers: "If I want to prioritize promotions on fresh items, which store has more this week?" That is a real, useful question. The verdict just needs to be framed as a promotion comparison, not a price comparison.

**Framework (Cagan — V/U/F/V):**
- **Valuable?** Yes — knowing where promotions are concentrated saves time and money.
- **Usable?** Yes — if framed honestly.
- **Feasible?** Yes — the data supports it.
- **Viable?** Only if the promise matches the delivery. Currently it does not. After reframing, it does.

---

## 5. Specific PRD Changes Required

### 5.1 Problem Statement (Section 1)

**Current:** "...but 'which of MY products are cheaper where this week.'"

**Should be:** "...but 'which of MY products are on sale this week, and where.'"

The entire problem statement paragraph needs a scrub. Replace every instance of "cheaper" with "on sale" or "on promotion." Replace "better deals" (which implies price comparison) with "more promotions" or "stronger promotions."

### 5.2 User Stories

**US-2 current:** "see which of MY favorite items are on sale this week and at which store, so I know where to buy each item."

US-2 is actually already close to correct — it says "on sale." But the surrounding context (verdict, split list) implies price optimization. The user story needs a clarifying note: the split list is based on promotions, not on lowest price.

**US-9 current:** "a simple weekly verdict ('Go to Migros for vegetables, Coop for household')"

**Should be:** "a simple weekly verdict ('More vegetable promotions at Migros, more household deals at Coop')" — or similar non-price-claim language.

### 5.3 Verdict Calculation (Section 3)

The formula (40% deal count + 60% avg discount depth) is fine — it IS a promotions comparison formula. But the label needs to change. Do not call the output a "winner." Call it "promotion leader" or simply state the facts: "12 deals, avg 28% off."

### 5.4 User Journey Copy (Use Cases doc, Section 4)

**Current:** "Buy these at Migros (cheaper): milk, bread"

**Should be:** "On sale at Migros: milk, bread" — or "Migros promotions: milk (-30%), bread (-20%)"

The word "cheaper" must be removed from the entire product. Every instance.

### 5.5 Savings Summary

**Current:** "Savings summary: Migros CHF 12.50 (3 items) | Coop CHF 8.40 (2 items)"

**Recommended:** "Promotion savings: Migros CHF 12.50 off regular (3 items) | Coop CHF 8.40 off regular (2 items)"

Or even better: frame it as "X items on sale" rather than CHF amounts, since the CHF savings are relative to each store's own regular price (which is promotional math, not cross-store comparison).

### 5.6 North Star Metric (Section 8 of PRD)

**Current:** "Personalized comparisons viewed"

This metric is still valid — but the description says "showing you which of YOUR items are on sale where," which is correct. No change needed to the metric itself, just ensure the surrounding language is consistent.

### 5.7 Out of Scope (Section 9 of PRD)

**Current:** "Full regular-price comparison (V1 is deal-only; regular prices depend on data source availability)"

This is already there but buried. It should be elevated. Consider adding a "Data Limitations" section to the PRD (between Section 6 and Section 7) that explicitly states what basketch does and does not compare.

### 5.8 Risk Register (Section 10 of PRD)

There is already a risk entry: "Regular (non-deal) prices unavailable for Coop and Migros." This is good. But the mitigation says "Frame value as 'which of MY items are on sale where'" — which is the right answer, but the rest of the PRD has not been updated to reflect this framing. The risk was identified but not fully acted on.

---

## 6. The Swiss Trust Question

Swiss consumers operate on a trust-first basis. Migros and Coop have earned decades of trust through consistency and transparency. basketch is an unknown entity.

**What builds trust:**
- Saying exactly what you do: "We compare weekly promotions from Migros and Coop"
- Showing your sources: "Data from migros-api-wrapper and aktionis.ch"
- Being transparent about limitations: "We show promotions, not regular prices"
- The verdict explanation line (already in the PRD) — keep this, it is essential

**What destroys trust:**
- Saying "cheaper" when you mean "on promotion"
- Implying a price comparison when you can only compare promotions
- A verdict that says "Migros wins" when it means "Migros has more deals"
- A savings estimate (CHF 12.50) that a user cannot verify against actual prices

**Framework (Lenny Rachitsky — Problem Statement quality):** A great problem statement is honest about its boundaries. "We help you find promotions on your items" is a tight, honest problem. "We help you find the cheapest store" is a promise the product cannot keep.

**The Swiss way:** Say less. Mean it. "Wochenaktionen im Vergleich" (weekly promotions compared) is more Swiss than "Der gunstigste Einkauf" (the cheapest shopping). Swiss consumers respect precision. They distrust superlatives.

---

## 7. Is This a Risk or a Feature?

**My assessment: This is a feature disguised as a limitation.**

Here is why:

1. **Nobody needs a tool for regular prices.** Regular prices change slowly. You learn them. You know Migros milk is CHF 1.80. A tool that tells you something you already know has low recurring value.

2. **Everyone needs a tool for promotions.** Promotions change EVERY WEEK. They are unpredictable. You cannot learn them — you must check them. This is exactly the kind of information asymmetry that creates utility for a tool.

3. **Promotions are the trigger for store-switching.** The weekly decision "Migros or Coop?" is driven by "who has the good deals?" not "who is 3% cheaper on average?" The promotion comparison IS the valuable comparison for weekly shopping decisions.

4. **The comparison is fair.** Both data sources (migros-api-wrapper and aktionis.ch) provide promotional data. The comparison is apples-to-apples: Migros promotions vs Coop promotions. No asterisks needed.

5. **It simplifies the product.** A price comparison tool needs comprehensive catalog data, regular prices, unit price normalisation, and constant validation. A promotion comparison tool needs weekly deal feeds — which you already have. The scope is cleaner, the promise is tighter, the product is more focused.

**Framework (Shreyas Doshi — High Agency PM):** A high-agency PM does not apologise for constraints. They reframe constraints as design choices. "We compare promotions, not regular prices" is not a limitation — it is a product decision that keeps the tool focused on the information that changes weekly and drives the shopping decision.

---

## 8. Decisions Required from PM

I am raising 6 challenges. Each needs a resolution before the PRD is updated.

| # | Challenge | My Recommendation | Options |
|---|-----------|-------------------|---------|
| C1 | Remove all "cheaper" language from PRD and use cases | **Accept** — replace with "on sale" / "on promotion" | Accept / Reject with reasoning |
| C2 | Reframe the verdict from "wins" to "leads in promotions" | **Accept** — "More fresh deals at Migros this week" | Accept / Alternative wording / Reject |
| C3 | Remove CHF savings estimates from user journey (e.g., "Migros CHF 12.50") | **Consider** — these imply price optimization. Replace with "3 items on sale at Migros" or keep with "promotion savings" qualifier | Remove / Requalify / Keep |
| C4 | Add a "Data Scope" section to the PRD stating what basketch compares and what it does not | **Accept** — transparency builds trust, especially for a portfolio project where the PM process is the deliverable | Accept / Reject |
| C5 | Reframe the split list from "Buy at Migros (cheaper)" to "On sale at Migros" | **Accept** — direct language change | Accept / Alternative wording |
| C6 | Position "promotions comparison" as a deliberate product choice, not a limitation | **Accept** — update the product goal from "which store is cheaper" to "which of your items are on promotion, and where" | Accept / Reject |

---

## 9. Suggested Product Goal (Rewritten)

### Current:
> Help a Bern-based shopper see which of THEIR regular products are on sale this week at Migros or Coop — personalized, not generic.

This is actually almost right — it says "on sale." But the rest of the docs contradict it with "cheaper" language.

### Recommended:
> Help a Bern-based shopper see which of their regular products are on promotion this week at Migros or Coop — and where the strongest deals are. Setup in under 60 seconds, weekly check in under 30 seconds.

### Recommended tagline for the product:
> **"Your weekly promotions, compared."**

Or for the Swiss market:
> **"Migros und Coop Aktionen — auf einen Blick."** (Migros and Coop promotions — at a glance.)

---

## 10. Pre-Mortem: What Happens If We Do NOT Fix This

**Framework (Shreyas Doshi / Annie Duke — Pre-Mortem):**

Imagine it is Week 6. Ten friends have been using basketch. Three of them message you:

> "Hey Kiran, it said 'Buy milk at Migros — cheaper' but Coop's regular price was actually lower. Is the data wrong?"

At that point:
- You have to explain the data limitation retroactively
- Trust is damaged — they question every other recommendation
- The Sean Ellis "Very Disappointed" number drops because users feel misled
- You spend Week 7 rewriting copy instead of iterating on features

This is entirely preventable by being honest from Day 1.

**Kill criteria connection:** The PRD already has "3+ users say 'the verdict felt wrong' = revisit formula." A misleading value proposition would trigger this kill criterion not because the formula is wrong, but because the framing is wrong. That is a worse outcome — the product works correctly but communicates incorrectly.

---

## Summary

The data limitation is real. The product is still valuable. The fix is language, not architecture. Change "cheaper" to "on promotion." Change "wins" to "leads in deals." Change "savings" to "items on sale." Be Swiss about it — precise, honest, no hype.

The product becomes stronger for it. A promotions comparison tool that is honest about what it does will earn more trust than a price comparison tool that overpromises.

**Next step:** PM decides on C1-C6 above. Then I can help rewrite the specific sections.

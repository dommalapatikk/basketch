# PM Coach Challenge: Multi-Store Expansion Spec
## basketch — pm-spec-multi-store.md

**Coach:** Senior PM Coach Agent
**Date:** 14 April 2026
**Spec reviewed:** `docs/pm-spec-multi-store.md` v1.0
**Format:** Each finding is Confirmed / Weakened / Needs Discussion, with reasoning and recommendation.

---

## Overview

The spec is well-structured and the core instinct is correct: LIDL and ALDI almost certainly have better promotions than Migros and Coop on many grocery categories, and the infrastructure cost to add them is genuinely low. That is a real, non-trivial opportunity. The challenge below is not about whether to expand — it is about which stores, how the UI handles scale, and one critical UX decision that is being deferred when it should be made now.

---

## Finding 1: SPAR and Volg — Weakened

**Verdict: Weakened**

**The spec's position:** Include Volg and SPAR in MVP with "reduced confidence," flagging that deal volume may be low. Rationale: rural relevance (Volg) and urban convenience relevance (SPAR).

**The challenge:**

This is an L/N/O question. Adding SPAR and Volg is framed as low-cost because the infrastructure already exists. That is true at the pipeline layer. But it is not true at the product layer.

Every store added to the comparison increases:
- The number of store colors a user must learn
- The number of entries in the shopping list section
- The cognitive load of the verdict banner
- The probability of a "0 deals found" entry confusing users

SPAR's core product is convenience — premium pricing, proximity, open late. It is not a deal destination. A user with a favorites list of milk, bread, butter, and yogurt will see SPAR appear in their comparison with zero or one match, every single week. That is not "low deal volume is a display problem." That is noise eroding trust in the recommendation.

Volg is more defensible — it is genuinely the only store for some rural users — but "some rural users" is not the same as the majority of the beta cohort, which is almost certainly urban (Zurich, Basel, Geneva) given the product's digital-first nature and English-only UI.

**Lenny's activation lens:** Will adding SPAR and Volg improve activation or retention for the median user? Almost certainly not. The median user is urban. SPAR appears with zero deals. Volg appears with zero deals. The user's shopping list says "Buy at ALDI (3 items), Buy at Migros (2 items), Buy at Coop (1 item), [SPAR: nothing], [Volg: nothing]." The user does not feel the product is better. They feel it is busier.

**Recommendation:**

Move SPAR and Volg to V2. Ship the core expansion with the five stores that will actually drive the activation insight: Coop, Migros, LIDL, ALDI, Denner. After 4 weeks of real usage data, add SPAR and/or Volg if users report missing them (which they will, if they are the rural segment). This is a demand-triggered gate — the spec already identified it as the right model for OTTO'S. Apply the same logic to SPAR and Volg.

The five-store comparison (Coop, Migros, LIDL, ALDI, Denner) is a complete, compelling product. Seven is two stores past that point.

---

## Finding 2: Coop Megastore Merge — Confirmed, but the Complexity Cost is Understated

**Verdict: Confirmed (the decision), with a flag on implementation cost**

**The spec's position:** Scrape both `/vendors/coop` and `/vendors/coop-megastore`, deduplicate by product name + price before upsert. Store value remains `coop`.

**The challenge:**

The product decision is correct. Swiss shoppers do not distinguish Coop from Coop Megastore. Showing two "Coop" entries would be confusing and the deduplication logic is the right call.

But the spec underestimates what "deduplicate by product name + price" actually requires in practice.

Product names on aktionis.ch are not normalized. "Migros Vollfett-Joghurt 180g" and "Joghurt Vollfett Migros 180g" are the same product. If Coop and Coop Megastore list the same item with slightly different label text (which is common in real scraper output), the deduplication will fail silently and the user will see the same deal twice with the "coop" store tag.

The spec notes this in Section 8 (risks) but rates the likelihood "Medium" and the impact "Low." The impact is not low. A duplicate deal in the user's shopping list ("Buy at Coop: milk, milk") is a trust-destroying UX failure, not a minor data anomaly.

**Recommendation:**

Keep the merge decision. But in the pipeline spec, strengthen the deduplication key: normalize product name (lowercase, collapse whitespace, strip brand prefix/suffix, standardize units) before matching, and add `valid_from` as a third key. Log the deduplicated count per run. Add a test fixture with a known Coop/Coop Megastore overlap so the dedup logic is regression-tested before launch.

If deduplication proves unreliable after testing: skip Coop Megastore entirely. The Coop scraper already exists and is tested. Coop Megastore is an incremental add, not a core requirement. Do not ship a complex dedup system that has not been validated against real data.

---

## Finding 3: "Maximize Savings" vs "Minimize Trips" — Needs Discussion

**Verdict: Needs Discussion — this must be resolved before building /compare**

**The spec's position:** Open Question #5 — "Should the shopping list default to minimize stores or maximize savings?" Current assumption: maximize savings. Revisit if users complain about 5 stores.

**The challenge:**

This is the most important unresolved question in the spec, and it should not be an open question at implementation time. It is a Jobs-to-be-Done question.

What job is the user hiring basketch for?

There are two distinct jobs:
- **Job A: "Help me save the most money possible this week."** This user will go to 5 stores if the savings justify it. They want the cheapest store per item, no concessions.
- **Job B: "Help me plan my weekly shop efficiently — I do not want to go to more than 2 stores."** This user wants the best deal within the constraint of not adding new destinations. They already go to Migros and Coop. They want to know if ALDI is worth a detour this week, not a permanent routing change.

These two jobs produce fundamentally different UX:

- Job A: Show the cheapest store per item, regardless of how many stores that requires. The shopping list might route to 5 stores. That is the correct output for this user.
- Job B: Show the best deal the user can get by visiting at most 2 (or N) stores. Optimize total savings across the constrained set. If ALDI saves CHF 3 total across all items but requires a separate trip, flag it as a "bonus stop" — optional, not primary.

The spec currently assumes Job A (maximize savings) but the UI decision (Section 5b) implicitly assumes Job B — it shows a shopping list grouped by store and a "Nothing on promotion" collapsed section that implies the user will act on the full list. A Job A user seeing "Buy at ALDI (1 item: milk, saves CHF 0.30)" will rationally skip ALDI. The routing list breaks down at low savings-per-stop levels.

**Shreyas Doshi's LNO lens:** Resolving this question before building is Leverage. Building the wrong UX and redesigning after user feedback is Overhead. This decision takes 30 minutes to make. Undoing a built UI takes a sprint.

**Recommendation:**

Make the decision now. Suggested answer: target Job B, with a "bonus stop" pattern.

- Primary routing: Show the best deal the user can get at the 1-2 stores where they get the most value. This is the default shopping list.
- Bonus stop: If visiting one additional store would save more than a threshold (suggested: CHF 3+), surface it as "Bonus stop: ALDI — saves CHF 4.20 on 2 items." User can tap to add it to their routing list.
- The threshold is a product decision. CHF 3 is a starting point — it should be reviewed with real data.

This respects both jobs: the savings-maximizer can always add the bonus stop; the efficiency-maximizer is not routed to 5 stores by default.

---

## Finding 4: 7-Store Shopping List — Weakened

**Verdict: Weakened**

**The spec's position:** Shopping list grouped by store. All stores with at least one deal are shown. Items with no deal appear in a collapsed "Nothing on sale" section.

**The challenge:**

The spec sets no threshold for when a store entry is worth showing in the shopping list. "At least one item on deal" is the bar. That bar is too low.

Consider a realistic user with 15 favorites. After multi-store expansion, the shopping list might look like:

- Buy at ALDI (3 items): milk, butter, yogurt
- Buy at Migros (3 items): bread, chicken, pasta sauce
- Buy at Coop (2 items): coffee, olive oil
- Buy at LIDL (1 item): orange juice
- Buy at Denner (1 item): wine
- Buy at SPAR (1 item): cheese
- Nothing on promotion (4 items): ...

That is six store entries plus a collapsed section. The user is being asked to plan 6 stops to save money on groceries. This is not a shopping plan. It is a logistics problem.

**Lenny's activation lens:** The user's first comparison result is the make-or-break moment for activation. If the first result they see is a 6-stop routing list, the product feels overwhelming rather than helpful. "Which of MY items are on sale this week, and at which store?" is the USP. The answer should be a focused recommendation, not an exhaustive routing plan.

**Recommendation:**

Apply a minimum threshold for showing a store in the shopping list. Suggested rule: only show a store if it has 2 or more items on deal (or if the savings at that store exceed CHF 3). A store with one item on deal at CHF 0.30 off should not generate a routing entry — it should appear in the per-item best-deal view (Section 5b item 1), but not in the grouped shopping list.

This also resolves part of Finding 3. If the threshold is CHF 3 per store, the shopping list becomes naturally efficient — only stores that justify a trip appear.

Show the full per-item recommendation view (all stores, all deals) for users who want to dig deeper. The shopping list is for planning, not for exhaustive comparison.

---

## Finding 5: The Verdict Banner at 7 Stores — Weakened

**Verdict: Weakened**

**The spec's position:** "This week: Best fresh deals at ALDI — Best household deals at Coop — Best long-life deals at Migros"

**The challenge:**

The current two-store verdict ("More fresh deals at Migros, more household deals at Coop") is already a compression of complex data into one sentence. It works because the user only needs to hold two stores in mind.

The proposed 7-store format names three winners, one per category. At first glance, this seems like a clean extension of the same pattern. It is not.

The problem is that the verdict now requires the user to synthesize a multi-store routing decision from a banner they read in under 3 seconds. "Best fresh deals at ALDI, best household deals at Coop, best long-life deals at Migros" tells the user they should visit three different stores. That is the opposite of a clear weekly recommendation.

The spec anticipates this and offers an escape: "If one store dominates: LIDL leads on fresh, Coop leads on household." But that only helps when there is a dominant winner. With 7 stores in play, category-level winners will be fragmented most weeks. The verdict banner will routinely produce a 3-store sentence.

There is also a statistical fragility problem. With 7 stores and 3 categories, the 40%/60% formula will frequently produce winners that are separated by small margins. "ALDI leads on fresh" might mean ALDI has 4 deals at 22% avg discount vs Migros with 3 deals at 21% avg discount. The banner implies a meaningful differentiation that does not exist.

**Recommendation:**

Decouple the verdict banner from the per-category winner logic. Instead, use a single-sentence format that highlights the headline finding:

- "ALDI has the deepest deals this week — 6 fresh items at 30% off avg."
- "Strong week for discounters: ALDI and LIDL lead in fresh and long-life."
- "Migros and ALDI are tied on fresh this week. Coop leads on household."

These are written as editorial judgments, not formula outputs. They are more readable and more honest about uncertainty. They do not imply the user needs to visit 3 stores.

The per-category breakdown (which store leads each category, with deal count + avg discount) belongs one level deeper — in the Wordle card or a tappable expansion, not the primary banner. The banner should be one idea, strongly stated.

---

## Finding 6: LNO Assessment — The Build Effort Distribution

**Verdict: Needs Discussion**

**The spec's position:** The pipeline changes (5 new scrapers) are framed as low-cost because the infrastructure exists. The UI changes are treated as contained extensions of existing patterns.

**The challenge:**

Using Shreyas Doshi's LNO framework:

| Work Item | Classification | Reasoning |
|-----------|---------------|-----------|
| Add LIDL, ALDI, Denner scrapers | **L (Leverage)** | Directly unlocks the core value proposition. These three stores are where the best deals are. High user impact per engineering hour. |
| Coop Megastore deduplication | **N (Neutral)** | Required for correctness, adds no user value on its own. Do it, but do not over-engineer it. |
| Add SPAR, Volg scrapers | **O (Overhead)** | Low deal volume, low user impact for the median user, adds UI complexity. Likely not worth the cost in V1. |
| Per-item cheapest deal (Decision 4) | **L (Leverage)** | The core UX improvement. Users can now act on a specific recommendation, not a category summary. High value. |
| Multi-store shopping list (Decision 5) | **N (Neutral)** | The grouped list is useful, but only if the minimize-stores vs maximize-savings question is resolved first. Without resolution, there is a risk of building the wrong version. |
| 7-store verdict banner | **O (Overhead)** | As written, it adds complexity for marginal clarity gain. Reframe as editorial output, not formula output. |
| Store colors and identity for 7 stores | **N (Neutral)** | Required for launch, but zero user value on its own. Do it once, do it right, do not iterate on it. |
| Onboarding copy update | **N (Neutral)** | Necessary hygiene. Low effort. |

**Recommendation:**

The team's energy should concentrate on the two Leverage items: LIDL/ALDI/Denner scrapers and per-item cheapest deal recommendation. Everything else is either Neutral (do it, do not over-invest) or Overhead (reconsider). The spec treats all scope items with roughly equal weight. That is the risk: SPAR/Volg and the 7-store verdict banner receive the same engineering attention as the items that actually drive user value.

---

## Summary Table

| Finding | Area | Verdict | Action Required |
|---------|------|---------|----------------|
| 1 | SPAR and Volg inclusion | Weakened | Move to V2. Ship 5-store MVP (Coop, Migros, LIDL, ALDI, Denner). |
| 2 | Coop Megastore merge | Confirmed | Keep decision, but strengthen dedup key and add regression test. |
| 3 | Maximize savings vs minimize trips | Needs Discussion | Resolve before building /compare. Recommended: Job B with "bonus stop" pattern at CHF 3+ threshold. |
| 4 | 7-store shopping list threshold | Weakened | Set a minimum threshold (2+ items or CHF 3+ savings) before a store appears in the routing list. |
| 5 | Verdict banner at 7 stores | Weakened | Rewrite as editorial one-liner, not formula output. Per-category breakdown goes one level deeper. |
| 6 | LNO build effort distribution | Needs Discussion | Concentrate effort on LIDL/ALDI/Denner scrapers and per-item recommendation. Deprioritize SPAR/Volg and 7-store verdict banner. |

---

## One Unresolved Question the Spec Should Add

The spec lists 5 open questions. There is a sixth that should be added:

**Open Question #6: What is the minimum savings threshold that makes a store worth routing to?**

This is not an engineering question. It is a product question, and it drives the shopping list UX, the verdict banner, and the activation story. Without a number, the spec cannot be called complete. Suggested starting point for discussion: CHF 3 per store per week. This is the question that resolves Finding 3 and Finding 4 together.

---

*Challenge complete. All findings are positions for discussion, not mandates. The PM decides.*

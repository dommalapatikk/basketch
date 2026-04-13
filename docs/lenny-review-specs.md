# Lenny's Review: basketch PRD & Use Cases

**Reviewer:** Lenny Rachitsky (simulated review in the style of Lenny's Newsletter / Podcast)
**Date:** 12 April 2026
**Documents reviewed:** PRD v2.0, Use Cases v2.0, Competitive Analysis v1.0, Value Prop Pivot Review, Data Capability Analysis

---

## What's Strong (celebrate the wins)

I'm going to be honest: this is some of the best PM documentation I've seen from a solo builder. Let me tell you why.

### 1. The value prop pivot was a masterclass in intellectual honesty

Most PMs I interview — including PMs at Series B companies — would have shipped the "cheaper" framing and dealt with the fallout later. You caught it before launch. You wrote a full analysis of why "cheaper" was a lie your data could not support, and you reframed to "on promotion" — which is actually a *stronger* promise because it is verifiable.

This is what Shreyas Doshi calls "high-agency PM work." You did not apologize for a constraint. You reframed it as a product decision. The reasoning — that promotions are unpredictable (high tool value) while regular prices are stable (low tool value) — is genuinely sharp. I would use this as an example in a newsletter about honest product framing.

### 2. The problem statement is specific, real, and grounded

"Swiss residents who shop at both Migros and Coop have no easy way to know which store has the best promotions this week for the items they actually buy."

That is a tight problem statement. It names the user (Swiss dual-store shoppers), the gap (no easy way to compare weekly promotions), and the differentiator (for items *they* actually buy). Compare this to the typical startup pitch: "We help people save money on groceries." Yours is ten times more specific. I would feature this in a newsletter about problem statement quality.

The line "The problem is not 'which deals exist' but 'which of MY products are on promotion this week, and where'" — that is the insight that separates a real PM from someone filling in a template. You identified the *actual* job, not the surface-level category.

### 3. The "What basketch is NOT" section is rare and valuable

Almost nobody writes this. You explicitly state: "basketch does not compare regular shelf prices across stores. It compares weekly promotions only." That takes guts. Most PMs expand scope to sound impressive. You contracted scope to be honest. This is what Marty Cagan means when he says "fall in love with the problem, not the solution." You fell in love with the promotion comparison problem and said no to the price comparison problem.

### 4. Kill criteria are pre-committed and specific

The Annie Duke-style kill criteria table — "< 3 out of 10 friends return in week 2: investigate," "< 20% Very Disappointed: pivot," "3+ users say the verdict felt wrong: revisit formula" — this is exactly what I teach PMs to do. You pre-committed to specific signals that would make you stop. Most PMs skip this because it feels like planning for failure. It is actually planning for learning.

### 5. The competitive analysis is legitimately thorough

You covered 15+ competitors across 5 markets. You built a feature comparison matrix. You identified *why* Profital/Bring! may be structurally prevented from building your product (their B2B ad model conflicts with transparent cross-store comparison). That is strategic thinking, not just feature-listing.

The positioning matrix — personal vs. generic, focused vs. broad — with basketch alone in the "personal + focused" quadrant is clean and defensible. It reminds me of how Linear positioned against Jira: not more features, but a fundamentally different starting point.

### 6. The use cases have edge cases

UC-1 covers what happens when no deals match, when one store's data is missing, when the pipeline failed for both stores, and when a user leaves before entering email. UC-2 has six edge cases including "price data missing or CHF 0" and "data older than 7 days." This is the level of spec completeness that separates a PM who has shipped from one who has only written docs. Real products have edge cases. Your specs acknowledge them.

### 7. Starter pack onboarding solves the cold-start problem

This is smart. The biggest killer of personalization products is the setup friction. You solved it by pre-loading 15-16 items via a template, which means the user's first action is *removing* things they do not buy — psychologically much easier than adding from scratch. Per Nir Eyal's Hook Model, you reduced the "action" cost to near zero. The 5 packs (Swiss Basics, Indian Kitchen, Mediterranean, Studentenkueche, Familientisch) show cultural awareness. Good.

---

## What Needs Work (be specific)

### 1. The growth engine does not hold up under scrutiny

You describe three growth channels: SEO, word-of-mouth, and a share-a-list viral loop. Let me push on each:

**SEO:** You are targeting German keywords ("Migros Angebote diese Woche," "Coop Aktionen Bern") but your UI is in English. That is a fundamental mismatch. A German-speaking user who searches "Migros Aktionen" and lands on an English page will bounce. Either the SEO strategy needs to target English keywords (much lower volume in Switzerland) or the UI needs German support from day one. You cannot have a German SEO strategy with an English product. This is the biggest gap in the entire spec.

Also: aktionis.ch has 94K monthly visits and 20 years of domain authority. Rappn covers 5 stores. Profital has Swiss Post's SEO muscle. Competing for "Migros deals" keywords against these incumbents is not realistic at CHF 0/month with a new domain. I would deprioritize SEO entirely for Phase 1 and focus purely on the WhatsApp channel.

**Word-of-mouth:** 10 friends in Bern is honest and realistic. But be careful — friends are polite. They will use it once because you asked. The real signal is whether they use it in week 3 without a reminder from you. Your W4 retention metric captures this, which is good.

**Share-a-list viral loop:** The concept is sound (Sarah shares her list URL, friend opens it pre-loaded, activates in 30 seconds). But this is a Phase 3 feature in the spec. You are describing it as a growth engine for a feature that does not exist yet. Growth plans should be built on what ships, not what is planned.

### 2. The English UI is a strategic risk you are not naming

You acknowledge "English UI (V1). German product names from source data." But Switzerland is a German-speaking market for this product. Your target users in Bern speak German. Product names from the data sources are in German. The persona "Sarah" shops at German-language stores.

An English UI for a German-language market is a friction point you are treating as a minor detail. For a portfolio project it is fine. For a real product aimed at Swiss households, it is a non-trivial barrier to adoption. At minimum, this should be in the risk register with a clear trigger: "If 3+ users request German UI, prioritize it."

### 3. The North Star metric needs a denominator

"Personalized comparisons viewed" is a good metric, but it is an absolute number without context. Is 20 comparisons viewed in a week good? Is 200? Without a denominator (e.g., "personalized comparisons viewed / total baskets created"), you cannot distinguish between "lots of people checking" and "the same 3 people checking a lot." Consider: "% of active baskets that viewed a comparison this week." That gives you retention-like signal in a single metric.

### 4. The verdict formula is specified but not validated

You defined 40% deal count + 60% average discount depth, with a 5% tie threshold. But this is a hypothesis, not a validated formula. What if Migros has 2 deals at 50% off and Coop has 15 deals at 10% off? The formula would give Migros the win for that category, but a user might feel Coop "won" because more of their items were on sale. The formula optimizes for depth; your users might optimize for breadth.

Your kill criterion handles this: "3+ users say the verdict felt wrong: revisit formula." But I would add a validation step before launch: run the formula against 4 weeks of historical data and show the results to 3 friends. Ask: "Does this feel right?" This is fast, free, and prevents a trust issue on week 1.

### 5. The dual return path (URL + email) adds complexity for 10 users

Having both a bookmarkable URL and email lookup as "equally primary" return paths means building and maintaining two retrieval mechanisms. For 10-50 users, this is overengineered. I would ship URL-only first. If users lose their bookmarks (which you will hear about quickly with 10 friends), add email lookup later. The PRD even notes that email lookup is for "users who clear browsers or switch devices" — that is a real but second-order problem for a friends beta.

### 6. Use cases UC-6, UC-7, UC-8 overlap and could be consolidated

UC-6 (return via URL), UC-7 (share comparison), and UC-8 (return via email) are three use cases that describe variations of "accessing or sharing a comparison page." The core flow is the same: load `/compare/:favoriteId`. The variation is how you get there. Consider collapsing these into one use case with alternate entry points. The current structure feels padded.

---

## The Hard Question

Here is the thing you are probably avoiding, and I say this with respect because I think the rest of your work is strong:

**Is this product for you, or is it for users?**

You describe the target as "10-50 users initially (friends and word of mouth)" and call it a portfolio project in the risk register: "value is in the PM process, not user count." You also describe it as a real product with SEO strategy, viral loops, and PMF measurement.

These two framings are in tension. If it is a portfolio project, ship the simplest thing that demonstrates PM rigor and stop. The docs you have already written do that. If it is a real product, the English UI, the 2-store limitation, and the zero-budget growth constraint are things you need to solve, not just document.

Right now, the PRD reads like a portfolio project wearing real-product clothes. The SEO section, the international competitive analysis, the growth engine — these are what a PM writes when they want the document to look like a real product. But the actual product scope (2 stores, 10 friends, English UI for German speakers, zero budget) says portfolio project.

My challenge: **pick one and commit.** If portfolio: cut the growth section and the SEO strategy. They do not serve the portfolio goal, and they create expectations you will not meet. If real product: ship in German, commit to user research beyond friends, and build a realistic acquisition channel.

The best version of this project is probably: **a real product for a tiny audience, documented like a portfolio project.** Build it for yourself and 10 friends. Make it genuinely useful to those 10 people. Document every decision. That is more impressive than a growth strategy you will never execute.

---

## The Lenny Test

If this PM applied to present at a product conference, would these specs get them in?

**Almost.**

What gets them in:
- The value prop pivot analysis is conference-worthy on its own. "We caught a misleading promise before launch and reframed it as a stronger, honest promise" — that is a talk I would attend.
- The kill criteria with pre-committed thresholds is a best practice most PMs at funded companies do not follow. This is genuinely impressive.
- The competitive analysis is more thorough than what I see from Series A companies with dedicated strategy teams.
- The data capability analysis — documenting exactly what each source returns, field by field — is a level of technical rigor that earns credibility.

What would make it a definitive yes:
- **Show me the data.** Run the pipeline for 4 weeks. Show the verdicts it produced. Show whether they were accurate. Show what broke. A conference audience wants to see the product working, not just the spec.
- **Show me user reactions.** Run the Sean Ellis survey with 10 friends. Show the results. Even if it is 3 out of 10 "Very Disappointed," that is real data. A PM who shows real PMF data — even disappointing data — from a side project is more impressive than one who shows perfect specs.
- **Show me a decision you reversed.** You made the value prop pivot, which is great. But that was a pre-launch correction. Show me a decision you made post-launch that changed based on user feedback. That is where PM skill really lives.

**Current verdict: B+ specs. A- potential.** The gap is execution evidence.

---

## Three Things I'd Do Differently

### 1. Ship German UI from day one

This is a Swiss German product for Swiss German users with Swiss German product names from Swiss German data sources. An English UI is a portfolio-project decision, not a user-serving decision. If you are serious about 10 friends in Bern using this weekly, ship it in German. Keep the code and docs in English. Make the user-facing text German. This is a one-time effort that removes ongoing friction for every user, every week.

### 2. Kill the SEO strategy and go all-in on WhatsApp

For 10-50 users in Bern, SEO is irrelevant. Your actual growth channel is WhatsApp. Build the OG meta tags (which you already spec'd — good), make the share experience beautiful, and focus on making the shared link so useful that people forward it. One viral WhatsApp message in a Bern expat group will do more than 12 months of SEO against aktionis.ch's 20-year-old domain.

Specifically: design the "weekly verdict" as a screenshot-friendly card. Something Sarah can screenshot and post in her family WhatsApp group. Think about how Wordle grew — it was a shareable result card. Your verdict banner ("More fresh deals at Migros, more household deals at Coop this week") is your Wordle card. Make it beautiful, make it branded, make it screenshottable.

### 3. Validate the verdict before you ship the full product

The verdict is the core of the product. It is the "aha moment." Before building the full onboarding flow, starter packs, email lookup, and favorites system — take 4 weeks of deal data and generate 4 verdicts. Send them to 5 friends on Thursday evening via WhatsApp message (not even a website — just a formatted text message). Ask: "Was this useful? Did it change what you did on Saturday?"

If 3 out of 5 say yes, build the product. If 0 out of 5 care, you just saved yourself 6 weeks of development.

This is what Teresa Torres calls "assumption testing" and what I call "the smallest possible experiment." You have documented the pipeline. Run it manually. Generate the output. Test the core value prop with zero frontend code. The PRD is ready. The question is whether the *insight* is ready.

---

## Final Verdict

This is strong PM work. Genuinely strong. The value prop pivot, the kill criteria, the competitive analysis, the edge case coverage, the data transparency — these are all above the bar I see from PMs at funded startups.

The main weakness is the tension between "portfolio project" and "real product." The specs are written for a real product, but the constraints (English UI, zero budget, 10 friends) are for a portfolio project. That is fine — but own it. The most impressive portfolio projects are honest about their scope and then execute beautifully within that scope.

If I were advising you on my podcast, I would say: **Ship the verdict first. The rest is infrastructure around an insight.** If the insight is right — that Swiss shoppers want a weekly promotion comparison for their regular items — the product will pull you toward building it. If the insight is wrong, no amount of spec quality will save it.

The specs are ready. Go build. Then come back and show me the data.

**Rating: 8/10 on specs quality. Pending on execution.**

For reference, most PRDs I review on the podcast from funded companies score 5-6. You are ahead of the curve on documentation. Now close the gap on shipping.

---

*"The best product spec in the world is worth nothing until a user touches the product." — Lenny Rachitsky*

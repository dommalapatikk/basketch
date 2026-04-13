# Lenny's Review: The Favorites Feature and Data Asymmetry

**Reviewer:** Lenny Rachitsky (simulated review in the style of Lenny's Newsletter / Podcast)
**Date:** 12 April 2026
**Context:** Follow-up to the full PRD review. This review addresses whether the favorites feature is viable given the Migros/Coop data asymmetry.

---

## The Short Answer

The favorites feature is not broken. But it is limping on one leg. And the question you should really be asking is not "can I fix the limp?" but "should I lead with a feature that limps?"

Let me walk through each of your questions.

---

## 1. Does the favorites feature still make sense with this data limitation?

It is not fundamentally broken, but it has a trust problem you cannot spec your way out of.

Here is the issue in plain terms. When Sarah adds "milk" to her favorites:

- **Migros:** basketch can say "milk is on sale (-25%)" or "milk is not on sale this week." Both are definitive. The user trusts the tool.
- **Coop:** basketch can say "milk is on sale (-30%)" or... nothing. Silence. And silence could mean "not on sale" or "we literally have no idea."

This is not a minor UX edge case. This is the core product experience for half of your stores. Every week, for every item on a user's favorites list, the Coop column has a credibility gap. The user cannot distinguish between "no deal" and "no data."

You are smart enough to know this. Your data capability analysis documents it precisely (Gap 3: "Coop products can only be matched if they have appeared in a promotion at some point"). But documenting a problem is not the same as solving it.

**The trust math works like this:** If Sarah has 15 favorites and Coop happens to have 3 of them on sale, basketch correctly shows those 3. But for the other 12, the "no deals this week" label is only verifiably true for Migros. For Coop, it might be true, or it might be that the product has never appeared in a Coop promotion and therefore does not exist in your database. Sarah does not know. And the moment she discovers that Coop DID have her yogurt on sale but basketch did not show it -- because the product was not in the Coop catalog -- trust is gone.

**Is this fatal?** No. But only if you are brutally transparent about it. More on that in my recommendation.

---

## 2. Have you seen other products handle similar data asymmetry?

Yes. This pattern -- where one data source is rich and the other is sparse -- shows up more often than people think. The good products handle it honestly. The bad ones hide it and lose trust.

### Spotify Discover Weekly (asymmetric listening data)

Spotify's recommendation engine works brilliantly for mainstream genres and terribly for niche ones. If you listen to Bollywood film soundtracks or Swiss German dialect rap, the recommendations are often wrong because the training data is thin. Spotify does not pretend the recommendations are equally good for all genres. The product just works better for some users than others, and over time, the data fills in as more users with niche tastes join.

The parallel to basketch: your Coop data is the "niche genre." It will get better over time as more promotions are indexed. But right now it is sparse, and the product works better on the Migros side.

### Google Flights (asymmetric airline data)

Not all airlines share the same level of pricing data with Google. Some airlines (Southwest, historically) did not appear at all. Google's approach: show what they have, and when data is incomplete, show a clear disclaimer. They do not pretend to have complete information. The product is still enormously useful despite being incomplete.

### Zillow Zestimate (asymmetric property data)

Zillow's home valuations are famously more accurate in some markets than others, because some counties publish detailed transaction data and others do not. Zillow shows a "confidence score" alongside every Zestimate. Low data = wider confidence range = honest signal to the user.

**The pattern across all three:** Do not hide the gap. Signal the confidence level. Let the user calibrate their trust.

### What this means for basketch

You need a confidence signal on the Coop side. Not a paragraph of explanation. Not a footnote. Something visual and immediate. Something like:

- Migros: "Not on sale this week" (definitive, full confidence)
- Coop: "No promotion found" (subtly different -- signals that absence of evidence is not evidence of absence)

Or even simpler: a small indicator next to Coop items that says "Coop deals only -- not all products tracked." One line. Permanent. Honest.

---

## 3. Is the favorites feature actually the right core -- or should basketch lead with the verdict/deals browsing?

This is the most important question you asked, and I think you already sense the answer.

**Lead with the verdict. Make favorites secondary.**

Here is why. Let me compare the two features on the dimensions that matter for a new product:

| Dimension | Verdict / Deals Browsing | Favorites Comparison |
|-----------|------------------------|---------------------|
| **Data confidence** | High for both stores (both sources provide promotional data) | Asymmetric (Migros full catalog, Coop promotions only) |
| **Setup friction** | Zero -- works on first visit, no account, no list | Requires setup (even with starter packs, it is still a step) |
| **Time to value** | Instant -- open the page, see the verdict in 5 seconds | 60 seconds setup + comparison view |
| **Shareability** | Very high -- the Wordle card works for everyone | Low -- my favorites are personal, not shareable |
| **Weekly habit potential** | High -- "What's the verdict this week?" is a ritual question | Medium -- "Are any of my items on sale?" is useful but less ritualistic |
| **Data asymmetry risk** | None -- verdict is based on deals that exist in both sources | High -- favorites matching depends on product catalog completeness |

The verdict and deals browsing work with symmetric data. The favorites feature relies on the asymmetric data. That alone should tell you where to put your weight.

Think about how the best consumer products launch. They lead with the thing that works for everyone on day one, and then layer on personalization once the habit is formed.

- **Duolingo** did not start by asking "what language do you want to learn?" on a blank screen. It started with a placement test that immediately showed you your level -- instant value, zero setup. The personalized daily practice came after the habit was established.
- **Wordle** did not ask you to create a word list. It gave you one puzzle. Same puzzle for everyone. The "aha moment" was instant and shared. Personalization (tracking your streak, your stats) came after.
- **Notion** did not start by asking "what kind of workspace do you want?" It showed you templates. Browsable. Immediate. Personalization came after you started using one.

Your verdict is your Wordle puzzle. It works for everyone. It requires zero setup. It is shareable. It updates weekly. It creates a reason to come back.

Your favorites feature is your streak tracker -- meaningful after the habit exists, but not the thing that creates the habit.

---

## 4. The Wordle card works at category level. Favorites work at item level. Which is the real "aha moment"?

The category-level verdict is the "aha moment." The item-level favorites comparison is the "retention moment." These are different things, and you need to get the order right.

**The aha moment** is the first time the user thinks: "Oh, this is useful." It needs to happen fast, require nothing from the user, and be surprising or delightful.

"More fresh deals at Migros, more household deals at Coop this week" -- that is an aha moment. Sarah has never seen this information presented this way. She did not have to do anything to get it. It changes her Saturday plan in 5 seconds.

**The retention moment** is the first time the user thinks: "This is useful *for me specifically*." It requires the user to invest (set up favorites), and the payoff is personalized.

"3 of your 15 items are on sale at Coop this week" -- that is a retention moment. It is more valuable per user, but it requires setup, it has the data asymmetry problem, and it only works after the user has already decided basketch is worth investing in.

The classic mistake is to lead with the retention feature because it sounds more impressive ("personalized!"). But if the user never reaches the aha moment, they never set up favorites.

**Spotify got this right.** The aha moment is pressing play and hearing music instantly (Browse, Top Charts -- generic, works for everyone). The retention moment is Discover Weekly (personalized, requires listening history). Nobody signs up for Spotify because of Discover Weekly. They stay because of it.

Your architecture should match:

1. **Home page: verdict + deals browsing** (the aha moment, zero setup, works for everyone)
2. **After 2-3 return visits:** prompt to set up favorites ("Want to track your specific items?")
3. **Favorites comparison** becomes the retention hook for committed users

This also neatly sidesteps the data asymmetry problem for your first impression. The verdict uses deals that exist in both databases. The data gap only matters when you get to item-level matching -- and by then, the user already trusts the product.

---

## 5. What would I tell this PM to do?

Five specific things. In order.

### A. Restructure the information architecture: verdict first, favorites second

Your current IA puts onboarding (favorites setup) as the first-visit flow. Flip it.

**Current flow:** Land on home page -> "Set up your favorites" -> starter pack -> comparison -> save

**Recommended flow:** Land on home page -> see the verdict + deals -> browse categories -> (optionally) "Track your items" -> favorites setup -> personalized comparison

The home page should be useful on the first visit with zero setup. The verdict banner, the three category cards, the deals browsing -- all of this works without favorites. Favorites become a power-user feature, not a prerequisite.

This is what your PRD already describes in the Information Architecture section -- the home page HAS the verdict and category cards. But your use cases (UC-1) frame the first visit as "Set Up Favorites." Reframe UC-1 as "Browse This Week's Deals" and make favorites setup UC-1b or even UC-3.

### B. Be transparent about the Coop data limitation -- but do not over-explain

Add one permanent, subtle indicator to the Coop side of any favorites comparison:

> "Coop: showing promotions found this week. Not all Coop products are tracked."

Do not hide it. Do not write a paragraph. Do not use a tooltip. One line, always visible, small text. This is the Zillow confidence-score approach. Users who notice it will appreciate the honesty. Users who do not notice it will not be harmed.

For the verdict and deals browsing pages, this disclaimer is unnecessary -- those pages show deals that exist, which is symmetric and complete.

### C. Rename the "no deal" state for Coop items in favorites

This is small but critical. In UC-2, when a favorite has no matching deal, the spec says: "items with no deal show 'no deal this week' (not hidden)."

For Migros, "no deal this week" is accurate. You searched the full catalog and confirmed there is no promotion.

For Coop, "no deal this week" might be wrong. You did not search the full catalog -- you only checked if the item appeared in this week's promotions list.

Change the Coop label to: **"No promotion found"** or **"Not in this week's promotions."** Subtly different. Technically accurate. Does not claim certainty you do not have.

### D. Track the "false negative" rate and set a kill criterion

Add a kill criterion specifically for the data asymmetry:

> "If 3+ users report that Coop had a deal on one of their favorites that basketch missed, investigate Coop product coverage and consider whether favorites matching should be Migros-only until Coop catalog coverage improves."

This gives you a pre-committed decision point. You are not guessing whether the asymmetry matters -- you are measuring it.

### E. Ship the verdict first, measure, then decide on favorites

This echoes what I said in my original review: "Ship the verdict first. The rest is infrastructure around an insight."

But now I am being more specific. Here is the phasing I would recommend:

| Phase | What ships | Data asymmetry exposure |
|-------|-----------|----------------------|
| **Phase 1 (Week 1-4)** | Verdict banner + deals browsing by category + Wordle card sharing | None -- uses symmetric data only |
| **Phase 2 (Week 5-8)** | Favorites setup + personalized comparison (with Coop transparency label) | Contained -- user sees the label, trust is preserved |
| **Phase 3 (Week 9+)** | Email notifications, share-a-list | Only if Phase 2 retention proves favorites are valued |

This is not about delaying favorites forever. It is about leading with your strongest foot. The verdict works perfectly with the data you have. Favorites work imperfectly. Ship the perfect thing first, build trust, then ship the imperfect thing with the trust buffer you have earned.

---

## The Bigger Picture

Here is what I think is actually happening, and I say this with genuine respect for your PM instincts:

You fell in love with the favorites feature because it is the "personalized" differentiator. It is the thing that makes basketch different from aktionis.ch and Rappn. Without favorites, basketch is "just another deals page." With favorites, it is "YOUR deals page."

That instinct is correct strategically. Personalization IS the moat. But a moat does not help if the castle is not built yet.

The verdict is the castle. It is the reason someone visits the first time, the second time, the third time. It is shareable. It is instant. It works with your data today. Once people are visiting weekly for the verdict, THEN you say: "Want to see which of YOUR items are on sale?" That is when favorites becomes powerful -- because the user already trusts the data, already has the habit, and is ready to invest in personalization.

Notion did not start as "your personalized workspace." It started as "beautiful templates you can use right now." The personalization came after the first value delivery.

Build the Wordle card. Make it beautiful. Make it the reason people visit. Then, and only then, ask them to set up their favorites list.

---

## Revised Rating

In my original review, I gave the specs 8/10. That still holds. But if you restructure to lead with the verdict and make favorites a Phase 2 feature, I would upgrade the product strategy to 9/10. You would be doing something most PMs at funded companies fail to do: sequencing features by data confidence rather than by how impressive they sound in a pitch.

That is the kind of decision that gets you hired.

---

*"The best products ship the thing that works perfectly before shipping the thing that works mostly." -- Lenny Rachitsky*

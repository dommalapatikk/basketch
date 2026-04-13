# Design Thought Leaders Research: Actionable Frameworks for a World-Class Product Designer Agent

**Purpose:** Extract specific, actionable frameworks from 8 design thought leaders that can be written into a product designer agent's instructions as concrete steps, checklists, and decision rules — applied to basketch (a mobile-first Swiss grocery comparison app).

**Date:** 11 April 2026

---

## 1. Don Norman — "The Design of Everyday Things"

### The 7 Fundamental Design Principles

1. **Discoverability** — Can the user figure out what actions are possible and how to perform them?
2. **Feedback** — After every action, the user must receive clear, immediate communication about what happened and the current state
3. **Conceptual Model** — The design projects a clear mental model of how the system works, so the user can predict what will happen
4. **Affordances** — The properties of an object that suggest how it can be used (a button looks pressable, a slider looks draggable)
5. **Signifiers** — Visible indicators that communicate WHERE the action should take place (arrows, labels, icons that show where to tap)
6. **Mapping** — The relationship between controls and their effects follows a logical spatial or conceptual layout
7. **Constraints** — Restricting possible actions so the user cannot make errors (greyed-out buttons, limited choices)

### Gulf of Execution and Gulf of Evaluation

**Gulf of Execution:** The gap between what a user WANTS to do and what the interface ALLOWS them to do. A wide gulf means the user cannot figure out how to accomplish their goal.

**Gulf of Evaluation:** The gap between the system's current state and the user's ability to UNDERSTAND that state. A wide gulf means the user cannot tell what happened after their action.

**The Seven Stages of Action:** Goal > Plan > Specify > Perform > Perceive > Interpret > Compare. The first four stages span the Gulf of Execution; the last three span the Gulf of Evaluation.

### Application to basketch

| Principle | basketch Application |
|-----------|---------------------|
| Discoverability | The verdict ("Go to Migros for fresh, Coop for household") must be immediately visible without scrolling or tapping. No hidden menus. |
| Feedback | When a user adds a favorite item, immediate visual confirmation (checkmark animation, color change). When pipeline data is loading, a skeleton UI — never a blank screen. |
| Conceptual Model | The mental model is simple: "Two stores, three categories, one winner per category." Every screen element reinforces this model. |
| Affordances | Category cards look tappable (subtle shadow, arrow indicator). The search bar looks typeable. Deal cards look swipeable if swipe is supported. |
| Signifiers | Migros orange = Migros. Coop green = Coop. These colors ARE the signifiers — they must be used consistently and never swapped. |
| Mapping | Categories (Fresh / Long-life / Non-food) are arranged in the same order on every screen. Migros always appears on the left, Coop on the right. |
| Constraints | Users cannot submit an empty search. The "save favorites" flow only shows after 1+ items are selected. Prevent errors by design. |

### What the Designer Agent Would DO Differently

- **Discoverability audit on every screen:** For each UI element, ask "Can the user discover this without being told?" If not, add a signifier or relocate it.
- **Feedback checklist:** Every interactive element must have 4 states: default, hover/focus, active/pressed, completed/confirmed. No silent actions.
- **Gulf test:** For every user task, trace the 7 stages. Where does the user get stuck between intention and action (execution)? Where does the user fail to understand the result (evaluation)?
- **Constraint-first design:** Before adding error messages, ask "Can I prevent the error entirely through constraints?"

---

## 2. Julie Zhuo — Former VP Design at Facebook

### The 7 Design Critique Questions

When reviewing any design, run through these questions in order:

1. **What is the user journey to get here?** Who is the user? When do they use this? Why? How did they arrive, and what is on their mind?
2. **What do we want users to feel and achieve here?** Define the successful outcome BEFORE critiquing the design.
3. **How important is this page/experience?** Spend more collective energy on what really matters. Not everything is equally critical.
4. **What is our scope/timeline/team?** The "best" design differs based on available time, people, and money. Speed vs. polish tradeoff.
5. **For every proposed change, am I confident it is better than what currently exists?** Do not change things for the sake of change.
6. **What can we remove from this experience and have it work just as well?** Ruthless subtraction.
7. **If we could throw all constraints away, would we still design it like this?** The vision check — are we settling or choosing?

### Facebook's Three Core Questions

Every project must answer:
1. What people problem are we solving?
2. How do we know it is a real problem?
3. How will we know if we have solved it?

### The Data-Informed Manifesto (5 Principles)

1. **Purpose Over Metrics** — Establish meaningful purpose before collecting data. Metrics serve the mission, never the reverse.
2. **Verifiable Goals** — Replace vague aspirations with quantifiable objectives.
3. **Universal Data Literacy** — Everyone must know the numbers. You cannot outsource a data-informed culture.
4. **Active Hypothesis Testing** — Seek disconfirming evidence. Ask: "What evidence would convince me my intuition is wrong?"
5. **Probabilistic Thinking** — Data never gives certainty. Even a 5-10% improvement in decision accuracy compounds significantly.

### Application to basketch

| Framework | basketch Application |
|-----------|---------------------|
| Critique Q1 (User Journey) | Sarah is standing in her kitchen on Saturday morning, phone in one hand, coffee in the other. She opened basketch from a bookmark. She has 60 seconds of attention. |
| Critique Q2 (Feel & Achieve) | She wants to feel CONFIDENT about where to shop. She wants to achieve: know which store wins for her categories in under 30 seconds. |
| Critique Q3 (Importance) | The verdict banner and category cards are P0. The About page is P3. Design effort should match this. |
| Critique Q6 (Remove) | Can we remove the header navigation on the home screen? Can we remove deal images on mobile? Can we remove the store logo if color already signals the store? |
| Critique Q7 (Vision Check) | If we had unlimited time, would we still show a list of deals, or would we show a personalized split shopping list? (Answer: the list. So the current direction is right.) |
| Three Questions | Problem: "I don't know which store has better deals for my items." Evidence: manual comparison takes 10+ minutes. Solved when: user decides in under 30 seconds. |
| Data-Informed | Track "time to first decision" not "page views." If 80% of users never scroll past the verdict, that is a success signal, not a bounce problem. |

### What the Designer Agent Would DO Differently

- **Before any critique, answer Q1-Q4 first.** Never jump to "I don't like this color" without establishing the user context.
- **Apply the subtraction test (Q6) to every screen.** After designing, ask: "What can I remove and have it work just as well?" Remove it.
- **Always pair qualitative design instinct with one verifiable metric (Data-Informed Principle 2).** Never say "this feels better" without also defining how you would measure "better."
- **Run the Three Questions at the start of every design task:** What problem? How do we know? How will we measure success?

---

## 3. Jake Knapp — Design Sprint Inventor (Google Ventures)

### The 5-Day Design Sprint Process

| Day | Name | Core Activity | Output |
|-----|------|--------------|--------|
| Monday | Map | Define the problem, set a long-term goal, map the user journey, pick a TARGET to focus the sprint | Problem map + sprint target |
| Tuesday | Sketch | Individual sketching of solutions (not group brainstorm). Four-step process: Notes > Ideas > Crazy 8s > Solution Sketch | Detailed solution sketches from each participant |
| Wednesday | Decide | "Sticky Decision" method to evaluate sketches without endless debate. Decider makes final call. Afternoon: create a storyboard for the prototype. | Winning solution + storyboard |
| Thursday | Prototype | Build a realistic facade — high-fidelity enough to test but fake enough to build in one day. "Fake it" philosophy. | Testable prototype |
| Friday | Test | Interview 5 real users watching them use the prototype. Observe reactions, not opinions. | Validated or invalidated hypothesis |

### The "Note and Vote" Decision Method

For any group decision:
1. Everyone writes ideas quietly for 3 minutes (no discussion)
2. Everyone self-edits to their top 2-3 ideas (2 minutes)
3. All top ideas written on whiteboard
4. Everyone quietly picks their favorite (2 minutes)
5. Round-robin: each person calls out their vote, dots added to whiteboard
6. The Decider makes the final call (can follow or override votes)

**Key insight:** Silent individual thinking before group discussion prevents anchoring bias and groupthink.

### Application to basketch

| Sprint Principle | basketch Application |
|------------------|---------------------|
| Monday (Map) | The target: "Sarah sees the verdict and decides where to shop in under 30 seconds on her phone." Every design decision flows from this target. |
| Tuesday (Sketch) | When designing a new feature (e.g., favorites), generate 3+ competing layout approaches before committing. Never go with the first idea. |
| Wednesday (Decide) | Use Note and Vote for any design disagreement. List options, score silently, let the product owner decide. No design-by-committee. |
| Thursday (Prototype) | For any proposed UI change, build a clickable prototype (even in Figma or HTML) before committing to code. |
| Friday (Test) | Before launching, test with 5 Swiss shoppers. Watch them use it. Do not ask "Do you like it?" — watch WHERE they tap and WHERE they hesitate. |
| "Fake it" philosophy | The MVP verdict banner can be a static page that looks real. It does not need animation or transitions to validate the concept. |

### What the Designer Agent Would DO Differently

- **Never propose a single design.** Always generate 2-3 competing approaches (the Tuesday Sketch principle). Present options with tradeoffs.
- **For every design decision, name the sprint target.** "This serves the target of [X]" or "This does not serve the target — cut it."
- **Use Note and Vote framing for any decision with multiple stakeholders.** Present options, ask for silent scoring, then recommend.
- **Prototype before polish.** A rough clickable version tested with 1 user is worth more than a pixel-perfect design tested with 0 users.
- **Five-user rule:** Recommend testing with exactly 5 users. Research shows 5 users find 85% of usability problems.

---

## 4. Luke Wroblewski — "Mobile First" Author, Google Product Director

### Mobile First Core Methodology

**The Fundamental Principle:** Design for the smallest screen first, then progressively enhance for larger screens. Mobile constraints FORCE you to prioritize — and that prioritization should not change when you add screen space.

### Specific Design Rules

1. **Content over navigation:** Content takes precedence over navigation on mobile. Show the answer, not the menu.
2. **One eyeball, one thumb:** Design for a user holding the phone in one hand, using their thumb, with partial attention. This is the baseline scenario.
3. **Reduction is the best layout approach:** On mobile, remove everything that is not essential. If it survives on mobile, it earns a place on desktop.
4. **Feature priority = screen priority:** The most important feature gets the most screen space and the highest position. Importance does not change with viewport size.

### Touch Interaction Rules

| Rule | Specification |
|------|--------------|
| Minimum touch target | 44x44px (Apple HIG) / 48x48dp (Google Material) |
| Primary actions placement | Middle or bottom of screen (thumb zone) |
| Destructive actions placement | Outside comfort zone (top-left for right-handed users) |
| Gesture discoverability | Any action behind a non-obvious gesture (swipe) must have an alternate visible path |
| Feedback states | Every actionable element needs explicit hover, focus, and active states |

### Progressive Disclosure Patterns

- Reveal information as the user needs it, not all at once
- Break complex flows into steps (wizard pattern)
- Show summary first, detail on demand
- Use smart defaults to reduce decisions

### Form Design Best Practices (from "Web Form Design")

1. **Remove every unnecessary field.** The primary goal is completion.
2. **Use inline validation** — real-time feedback as the user types, not after submission.
3. **Smart defaults** — pre-fill what you can predict (country = Switzerland, currency = CHF).
4. **One column layout** — never side-by-side fields on mobile.
5. **Labels above fields** — not inline (they disappear) or to the side (they misalign).
6. **Progressive disclosure in forms** — show optional fields only when needed.
7. **Make the primary action obvious** — one clear button, not "Submit" vs "Cancel" of equal weight.

### Four Mobile Usage Behaviors

Design for these four reasons people reach for their phone:
1. **Lookup/Find** — "Which store has the better deal on butter?" (Immediate answer needed)
2. **Explore/Play** — Browsing deals casually while commuting
3. **Check In/Status** — "Did the deals update yet this week?"
4. **Edit/Create** — Adding favorites to my list

### Application to basketch

| Principle | basketch Application |
|-----------|---------------------|
| Content over navigation | The verdict banner IS the content. No hamburger menu hiding it. The verdict is the first thing visible. |
| One eyeball, one thumb | Sarah can read the verdict and tap a category card with her thumb while holding coffee. Bottom navigation if needed. |
| Reduction | On mobile: verdict + 3 category cards. No sidebar, no filters, no store logos, no decorative images. |
| Touch targets | Category cards: full-width tap targets. Deal cards: at least 44px tall. "Add to favorites" button: 48x48px minimum. |
| Primary action placement | "Add to favorites" heart icon in thumb zone (right side, middle of screen). |
| Destructive action placement | "Remove from favorites" placed top-left or behind a swipe-to-reveal. |
| Progressive disclosure | Home shows verdict + categories. Tap category to see deals. Tap deal to see detail. Never show everything at once. |
| Form design | Favorites search: one field, inline results, tap to add. No "submit" button — search-as-you-type. Email field for notifications: single field, smart default (no country code), inline validation. |
| Lookup behavior | This is basketch's PRIMARY use case. Optimize for "I need the answer in 5 seconds." |

### What the Designer Agent Would DO Differently

- **Always design at 375px width FIRST.** Never start with desktop and "make it responsive." The mobile design IS the design; desktop is the enhancement.
- **Apply the "one eyeball, one thumb" test:** Can the user accomplish the primary task with one hand and partial attention? If not, redesign.
- **For every element on screen, ask:** "Would this survive on a 320px screen?" If not, it is probably not essential.
- **Content-first wireframes:** Start with content hierarchy (text, data, verdict), then add UI chrome. Never start with navigation or layout.
- **Touch target audit:** Every interactive element measured against 44x44px minimum. Flag anything smaller as a blocking issue.
- **Form minimalism:** For any form, start with zero fields and justify each one added. Use inline validation for every field.

---

## 5. Jared Spool — UIE Founder

### Experience Rot

**Definition:** The gradual degradation of user experience quality as features accumulate without redesign. Every new feature crammed into an original design makes the overall experience less coherent.

**Causes:**
- Features retrofitted into designs that were not built to accommodate them
- Architectural strain as new demands stress the original structure
- No periodic "redesign from scratch" — only incremental addition

**Detection Signals:**
- Occasional-use features hidden in illogical places
- Users resist upgrades due to learning curve costs
- New users are confused by inconsistent mental models
- Development timelines extend from weeks to months
- Competitors launch simpler alternatives that win

**Prevention:** Disciplined gatekeeping. Say "no" to nearly everything. Actively experiment with many ideas but deliberately reject most. Maintain simplicity through curation, not accumulation.

### Outcome-Driven UX Metrics

**The Problem with Conventional Metrics:** NPS, conversion rates, and HEART framework metrics do not tell you WHY users are frustrated or WHAT to change.

**Four Types of Outcome Metrics:**
1. **Success Metrics** — Did the user accomplish their goal?
2. **Progress Metrics** — How far did the user get before giving up?
3. **Problem-Value Metrics** — What is the dollar cost of this frustration? (Assigns monetary value to UX problems)
4. **Value Discovery Metrics** — Did the user discover the value we intended to deliver?

**The Frustration-First Approach:** If you have not done research, start with frustration. Map the user journey on a scale from "extreme frustration" to "extreme delight." The biggest design opportunities are where frustration is highest.

### UX Maturity Levels (5 Stages)

1. **Dark Ages** — No UX consideration at all
2. **Spot UX Design** — One person trying to improve UX in isolation
3. **UX as a Service** — Centralized UX team (but bolted on, not integrated)
4. **Embedded UX** — UX practitioners sit within product teams
5. **Infused UX** — UX principles drive strategic decisions across the organization

### Application to basketch

| Framework | basketch Application |
|-----------|---------------------|
| Experience Rot prevention | basketch has 3 categories and 1 verdict. Guard this simplicity. Every proposed feature must pass: "Does this make the 30-second decision faster or slower?" |
| Success Metric | "User identified which store to visit" — measured by time-to-decision under 30 seconds |
| Progress Metric | How far does the user scroll? If they stop at the verdict and leave, that may be SUCCESS (they got the answer). Do not confuse short sessions with failure. |
| Problem-Value Metric | "Users who check both store websites manually spend 10+ minutes per week. basketch saves 9 minutes. At CHF 50/hour, that is CHF 7.50/week in time savings." |
| Value Discovery Metric | Did the user discover the personalized favorites feature? Measured by: % of users who tap "Add favorites" within first 3 visits. |
| Frustration Map | Map the journey: Open site > See verdict > Tap category > See deals > Add favorite. Where is the frustration? Probably: "I see deals but they are not MY items" (motivation for favorites feature). |
| Experience Rot Guard | Set a hard limit: basketch home screen shows MAX 3 categories + 1 verdict. No "trending deals," no "popular items," no promotional banners. Ever. |

### What the Designer Agent Would DO Differently

- **Experience Rot audit before adding any feature:** "Will this addition make existing features harder to find or use?" If yes, redesign the whole flow — do not cram it in.
- **Define outcome metrics, not vanity metrics:** For every screen, define: What is the success metric? What is the progress metric? What is the frustration point?
- **Frustration-first prioritization:** Rank design improvements by "where is the user most frustrated?" not "what looks outdated?"
- **Simplicity budget:** Treat screen real estate like a budget. Every element has a cost. Adding something means removing something else.
- **Say no by default:** When asked to add a feature to the UI, the default answer is "no" until proven essential through user evidence.

---

## 6. Katie Dill — Head of Design at Stripe

### Three-Level Quality Model

Every product experience must deliver all three:
1. **Utility** — Does it solve a genuine user problem?
2. **Usability** — Is the solution comfortable and accessible to use?
3. **Beauty** — Are details well-executed and enjoyable to experience?

"At Stripe, we believe we must get all three aspects right." Quality without craft is accidental; craft without quality is decoration.

### Essential Journeys Program

Quarterly review of the 15 primary user workflows, scored on a 5-point qualitative scale:

| Score | Color | Meaning |
|-------|-------|---------|
| 1 | Red | Broken or severely frustrating |
| 2 | Orange | Functional but painful |
| 3 | Yellow | Acceptable but unrefined |
| 4 | Lime Green | Good experience with minor issues |
| 5 | Green | Excellent — delightful and frictionless |

Scored across four dimensions: **Utility, Usability, Craft, and Beauty.**

### Friction Logs and "Walk the Store"

- Teams systematically use the product as a customer would, documenting every pain point
- Not isolated to single features — they examine how components CONNECT (email language matches website language, support handoffs are smooth)
- Anyone in the company can do friction logs; they are posted publicly for any team to read
- Cross-team friction logs are encouraged (team A logs team B's product)

### "Minimize Presentationing"

Move away from polished decks. Show actual prototypes and products. Reduce bias from narrative framing. The product should speak for itself.

### Performance Formula

**Performance = Potential - Interference.** Maximize output by eliminating organizational and design obstacles, not by adding features.

### Application to basketch

| Framework | basketch Application |
|-----------|---------------------|
| Three-Level Quality | **Utility:** Does basketch answer "which store has better deals?" **Usability:** Can Sarah get the answer in 30 seconds on mobile? **Beauty:** Do the brand colors, typography, and spacing feel Swiss-precise and trustworthy? All three must be green. |
| Essential Journeys | basketch's essential journeys: (1) Open > See verdict, (2) Open > Browse category > See deals, (3) Search > Add favorite > See personalized comparison, (4) Return visit > Check new week's deals. Score each quarterly. |
| Friction Log | Walk through basketch as Sarah: open the URL, read the verdict, tap a category, compare deals, add a favorite. Screenshot every moment of confusion. |
| Walk the Store | Check: Does the verdict banner language match the category card language? Do Migros/Coop colors stay consistent from verdict to deal cards? Is the "week of" date format consistent everywhere? |
| Minimize Presentationing | When reviewing designs, show the live site or a working prototype on a phone — not a Figma presentation. |
| Performance Formula | Every design review asks: "What interference can we remove?" Not "what can we add?" |

### What the Designer Agent Would DO Differently

- **Score every essential journey on the 5-point Utility/Usability/Craft/Beauty scale.** Nothing ships until all four dimensions are lime green or better.
- **Conduct a friction log on every proposed design** before it is built. Walk through the prototype as the user, documenting every friction point with a screenshot and description.
- **Cross-consistency checks:** After any design change, verify that language, color, formatting, and interaction patterns are consistent ACROSS all related screens — not just on the changed screen.
- **Show prototypes, not presentations.** When recommending a design change, mock it up in context (on a phone screen) rather than describing it in prose.
- **Apply the Performance Formula:** For every proposed addition, identify what interference it creates. If interference > value, reject it.

---

## 7. IDEO's Design Thinking

### The 5-Phase Process

| Phase | Activity | Key Question | Output |
|-------|----------|-------------|--------|
| **Empathize** | Observe and interview real users. Understand their context, needs, pain, and behavior. Do not design yet. | "What does the user actually do, feel, and need?" | Empathy maps, user observations, interview notes |
| **Define** | Synthesize observations into a clear problem statement. Reframe using "How Might We" questions. | "What is the real problem we are solving?" | Problem statement, HMW questions |
| **Ideate** | Generate many possible solutions. Quantity over quality. No judgment during ideation. | "What are all the possible ways to solve this?" | List of 20+ ideas, clustered by theme |
| **Prototype** | Build quick, cheap, tangible representations of the top ideas. Fidelity should be as LOW as possible while still testable. | "What is the cheapest way to test this idea?" | Paper prototypes, clickable mockups, landing pages |
| **Test** | Put prototypes in front of real users. Observe behavior. Learn what works and what fails. | "Does this actually solve the problem?" | Validated/invalidated hypotheses, iteration priorities |

**Critical:** These phases are NOT sequential. You cycle between them. A test result might send you back to Empathize. A prototype might redefine the problem.

### The "How Might We" Question Framework

**Rules for well-framed HMW questions:**
1. Start with "How might we..." (implies possibility + collaboration)
2. Not too broad ("How might we improve shopping?") — unfocusable
3. Not too narrow ("How might we add a filter dropdown?") — prescriptive
4. The sweet spot suggests direction without dictating solution
5. Use positive framing: "increase," "create," "enhance" — not "reduce," "remove," "prevent"
6. Each HMW should generate 5+ distinct solution ideas. If it only generates one, it is too narrow.

**HMW Amplification Techniques (Stanford d.school):**
- Amp up the good
- Remove the bad
- Explore the opposite
- Question an assumption
- Go after adjectives (what does "easy" actually mean?)

### Applying Design Thinking to a Small Product (Not Enterprise Workshops)

For a small team or solo designer:
- **Empathize:** 5 conversations with target users (30 min each). Ask them to walk you through their last grocery shopping trip.
- **Define:** Write ONE problem statement in the format: "[User] needs a way to [goal] because [insight]."
- **Ideate:** Spend 15 minutes generating 10+ sketches of possible solutions. Do not evaluate during generation.
- **Prototype:** Build it in 1 day. Paper sketch, Figma mockup, or HTML page. Low fidelity.
- **Test:** Show it to 3-5 people. Watch them use it. Write down where they hesitate.

### Application to basketch

| Phase | basketch Application |
|-------|---------------------|
| Empathize | Interview 5 Swiss shoppers who split between Migros and Coop. Ask: "Walk me through your last Saturday grocery trip. How did you decide where to go?" |
| Define | "Swiss dual-store shoppers need a way to instantly see which store has better deals for their regular items because manually comparing two websites takes 10+ minutes and most people just guess." |
| HMW Questions | "How might we help Sarah decide where to shop in under 30 seconds?" / "How might we make weekly deal comparison feel effortless?" / "How might we help shoppers feel confident they are not overpaying?" |
| Ideate | 10 possible approaches: verdict banner, split list, push notification, WhatsApp summary, browser extension, email digest, chatbot, comparison table, store map overlay, savings calculator |
| Prototype | Static HTML page showing this week's real Migros vs Coop verdict, tested on 3 friends' phones |
| Test | Watch 5 friends open the page and observe: Do they understand the verdict? Do they know what to do next? Where do they hesitate? |

### What the Designer Agent Would DO Differently

- **Never skip Empathize.** Before designing any feature, write the user context (who, where, when, why) at the top of the design document.
- **Frame every design task as a HMW question** before proposing solutions. This prevents jumping to solutions.
- **Generate 3+ alternative solutions** for every HMW question. Present all options with tradeoffs, not just the first idea.
- **Prototype at the lowest fidelity that tests the hypothesis.** If the question is "Does the user understand the verdict?" — a text-only prototype is sufficient. No need for polished visuals.
- **Test recommendations are mandatory.** Every design recommendation includes a specific test plan: who to test with, what to observe, what constitutes success.

---

## 8. Dieter Rams — 10 Principles of Good Design

### All 10 Principles with Digital Application

| # | Principle | Meaning | Digital/Mobile Application |
|---|-----------|---------|---------------------------|
| 1 | **Innovative** | Good design pushes boundaries, does not copy existing solutions blindly | Use the capabilities of mobile (location, camera, push) creatively — do not just replicate a website on a small screen |
| 2 | **Useful** | A product must satisfy functional, psychological, AND aesthetic criteria | Every element must serve a user need. Decorative elements that do not help the user decide are waste. |
| 3 | **Aesthetic** | Visual quality is integral to usefulness because people use well-designed products daily | Consistent color system, clean typography, harmonious spacing. Aesthetic = trustworthy in grocery comparison. |
| 4 | **Understandable** | The product explains itself. No manual needed. | Self-explanatory UI. The verdict banner should make sense without any onboarding, tutorial, or "how it works" section. |
| 5 | **Unobtrusive** | Products are tools, not decorations. They should be neutral and restrained. | No splash screens, no animated logos, no gamification. basketch is a utility — it should feel like checking the weather. |
| 6 | **Honest** | Does not promise more than it delivers. Does not manipulate. | Show real savings percentages. Do not inflate discount numbers. Do not use dark patterns to push notifications. |
| 7 | **Long-lasting** | Avoids trends. Classic and timeless. | Use system fonts or proven typographic choices. Avoid trendy gradients, glassmorphism, or effects that date quickly. |
| 8 | **Thorough to the last detail** | Nothing is arbitrary. Every detail is considered. | Consistent padding, aligned text, matching icon weights, uniform border radius, no orphaned text on mobile. |
| 9 | **Environmentally friendly** | Minimizes resources. Does not waste. | Small bundle size. No unnecessary animations. Fast load on 4G. Minimal data fetched. Respects the user's battery and bandwidth. |
| 10 | **As little design as possible** | "Less, but better." Concentrate on essentials. Remove everything that does not contribute to the core function. | The home screen has: 1 verdict, 3 category cards. That is it. No sidebar, no footer navigation, no promotional content, no social sharing buttons. |

### The "Less But Better" Design Test

For every element on screen, apply this filter:
1. Does this help the user make their shopping decision? **Keep it.**
2. Does this serve the business (analytics, conversion)? **Keep it only if invisible to the user.**
3. Does this serve neither? **Remove it.**

### Application to basketch

| Principle | basketch Application |
|-----------|---------------------|
| Innovative (#1) | Use the phone's location to default to nearest store region (Bern). Do not ask "Select your city" — know it. |
| Useful (#2) | Every pixel must serve Sarah's decision. A decorative food image that does not show the deal is a distraction, not content. |
| Aesthetic (#3) | Swiss design sensibility: clean, precise, high contrast, generous whitespace. This IS the aesthetic — restraint, not decoration. |
| Understandable (#4) | No onboarding needed. The first screen explains itself: "This week: Migros wins for Fresh, Coop wins for Household." Zero learning curve. |
| Unobtrusive (#5) | No cookie banners (no cookies needed). No "subscribe" popups on first visit. No animated backgrounds. The tool gets out of your way. |
| Honest (#6) | Show "Coop data unavailable this week" if scraping fails. Never show stale data without a date stamp. Never say "Save 50%" if the actual saving is 45%. |
| Long-lasting (#7) | System font stack (SF Pro on iOS, Roboto on Android). White/grey backgrounds. The design should look correct in 2030. |
| Thorough (#8) | 4px spacing grid. Consistent border-radius. Icon weights match. Migros orange is ALWAYS the same hex value. No magic numbers in CSS. |
| Environmentally friendly (#9) | Target: < 100KB initial load. No video. Lazy-load images. Minimal JavaScript. The planet does not need another heavy SPA for a weekly grocery check. |
| As little design as possible (#10) | The home screen has exactly what Sarah needs: verdict + categories. One screen, one purpose, one decision made. |

### What the Designer Agent Would DO Differently

- **"Less but better" audit on every design.** After completing a design, do one final pass removing anything that does not directly serve the user's core task. If the design feels "sparse," that is correct.
- **Honesty check:** Review all copy for inflated claims. Percentages must be accurate. States must be transparent (loading, error, stale data).
- **Trend resistance:** Before using any visual pattern, ask "Will this look dated in 3 years?" If yes, choose the simpler, classic alternative.
- **Detail-level consistency pass:** After any design, audit: spacing (is it on the 4px grid?), colors (are they from the token set?), typography (is it from the scale?), icons (same weight and size?). Nothing arbitrary.
- **Performance-as-design:** Bundle size, load time, and data usage are design metrics, not just engineering metrics. A 3-second load time is a design failure.

---

## Synthesis: Master Checklist for a World-Class Product Designer Agent

The following checklist synthesizes ALL frameworks into actionable steps an agent would execute on every design task:

### Before Designing (Empathize + Define)

- [ ] Write the user context: Who is the user? Where are they? What device? How much attention do they have? (Norman: Conceptual Model / IDEO: Empathize / Wroblewski: One Eyeball One Thumb)
- [ ] State the problem as a HMW question (IDEO: How Might We)
- [ ] Define the success metric: How will we know this design works? (Zhuo: Three Questions / Spool: Outcome Metrics)
- [ ] Set the sprint target: What one thing must this design accomplish? (Knapp: Monday Map)

### While Designing (Ideate + Prototype)

- [ ] Generate 2-3 competing approaches before committing (Knapp: Tuesday Sketch)
- [ ] Design at 375px mobile width FIRST (Wroblewski: Mobile First)
- [ ] Apply the "one eyeball, one thumb" test (Wroblewski)
- [ ] For every element, verify: affordance clear? signifier visible? feedback provided? (Norman: 7 Principles)
- [ ] Primary actions in thumb zone, destructive actions outside comfort zone (Wroblewski: Touch Rules)
- [ ] Touch targets minimum 44x44px (Wroblewski + Apple HIG)
- [ ] Check all 4 states: default, hover/focus, active, completed (Norman: Feedback)
- [ ] Apply constraints to prevent errors rather than catching them after (Norman: Constraints)
- [ ] Remove everything that does not serve the core user task (Rams: #10 As Little Design as Possible / Zhuo: Q6 Subtraction)

### After Designing (Critique + Review)

- [ ] Run Zhuo's 7 Critique Questions in order
- [ ] Score on Katie Dill's 4 dimensions: Utility / Usability / Craft / Beauty (must be lime green or better)
- [ ] Conduct a friction log: walk through the design as the user, documenting every hesitation (Dill: Walk the Store)
- [ ] Cross-consistency check: language, color, spacing, behavior consistent across ALL related screens (Dill: Friction Logs)
- [ ] Experience Rot check: Does this addition make existing features harder to find? (Spool: Experience Rot)
- [ ] Honesty check: Are all numbers accurate? All states transparent? No inflated claims? (Rams: #6 Honest)
- [ ] Trend check: Will this design look correct in 3 years? (Rams: #7 Long-lasting)
- [ ] Detail audit: spacing on grid, colors from tokens, typography from scale, icons consistent (Rams: #8 Thorough)
- [ ] Performance check: load time, bundle size, data usage are acceptable? (Rams: #9 Environmentally Friendly)

### Before Shipping (Test + Validate)

- [ ] Test with 5 real users (Knapp: Friday Test / IDEO: Test)
- [ ] Observe behavior, not opinions: Where do they tap? Where do they hesitate? (Knapp)
- [ ] Define outcome metrics: Success, Progress, Problem-Value, Value Discovery (Spool)
- [ ] Plan for measurement: "What data will tell us this design is working?" (Zhuo: Data-Informed)
- [ ] Simplicity budget check: Is the home screen still 1 verdict + 3 categories? Have we protected the core? (Spool: Experience Rot / Rams: #10)

---

## Sources

- [Don Norman's 7 Fundamental Design Principles — UX Collective](https://uxdesign.cc/ux-psychology-principles-seven-fundamental-design-principles-39c420a05f84)
- [Norman's Design Principles — Educative](https://www.educative.io/answers/what-are-normans-design-principles)
- [Seven Stages of Action — Wikipedia](https://en.wikipedia.org/wiki/Seven_stages_of_action)
- [Gulf of Execution and Evaluation — Educative](https://www.educative.io/answers/gulf-of-execution-and-gulf-of-evaluation)
- [Julie Zhuo 7 Design Critique Questions — X/Twitter](https://x.com/joulee/status/1850992877931020720)
- [Julie Zhuo Data-Informed Manifesto — Medium](https://joulee.medium.com/the-data-informed-manifesto-9dd8c240382f)
- [Julie Zhuo — juliezhuo.com](https://www.juliezhuo.com/)
- [Jake Knapp Design Sprint — The Sprint Book](https://www.thesprintbook.com/the-design-sprint)
- [Design Sprint — GV](https://www.gv.com/sprint/)
- [Sprint Book Summary — Paul Minors](https://paulminors.com/blog/sprint-jake-knapp-book-summary-pdf/)
- [Luke Wroblewski Mobile First — Book Summary](https://books.danielhofstetter.com/mobile-first/)
- [Luke Wroblewski — lukew.com](https://www.lukew.com/resources/mobile_first.asp)
- [Luke Wroblewski Form Design Best Practices — PDF](https://static.lukew.com/webforms_lukew.pdf)
- [Jared Spool Experience Rot — Center Centre](https://articles.centercentre.com/experience_rot/)
- [Jared Spool Outcome-Driven UX Metrics — BostonCHI](https://www.bostonchi.org/2023/12/jared-spool-outcome-driven-ux-metrics/)
- [Jared Spool UX Maturity — Miro Blog](https://miro.com/blog/features/jared-spool-interview-ux/)
- [Katie Dill — How Stripe Crafts Quality Products](https://creatoreconomy.so/p/how-stripe-crafts-quality-products-katie-dill)
- [Katie Dill — Lenny's Podcast](https://www.lennysnewsletter.com/p/building-beautiful-products-with)
- [IDEO Design Thinking — IxDF](https://ixdf.org/literature/topics/design-thinking)
- [How Might We — NN/g](https://www.nngroup.com/articles/how-might-we-questions/)
- [Dieter Rams 10 Principles — Design Museum](https://designmuseum.org/discover-design/all-stories/what-is-good-design-a-quick-look-at-dieter-rams-ten-principles)
- [Dieter Rams Principles in Digital World — empathy.co](https://empathy.co/blog/dieter-rams-10-principles-of-good-design-in-a-digital-world/)
- [Dieter Rams 10 Principles — 3Pillar Global](https://www.3pillarglobal.com/insights/blog/dieter-rams-10-principles-good-design/)

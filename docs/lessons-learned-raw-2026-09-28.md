# basketch — Lessons Learned (Raw), 2026-09-28

**Purpose:** reusable, evidence-backed lessons from the basketch project (Swiss grocery-deal comparison app) for the PM to carry into a new insurance-tech project.

**Method:** seven parallel research passes over `docs/` (PRD, roadmap, architecture, RCAs, decisions, QA, reviews, research), `session-summary.md`, `HANDOVER.md`, `CLAUDE.md`, and `git log --oneline` (300 most recent commits) for basketch (`/Users/kiran/ClaudeCode/basketch`). Each lesson cites the specific file (and section/line where available) it was drawn from. Anything not directly read/verified is marked **(inferred)**.

**Status:** this is the **raw** pass — 88 lessons across 7 sections, more than the 40-70 aim, deliberately left unpruned so the PM can select/merge before promoting to a curated version. Some lessons recur across sections because the same incident is instructive from more than one angle (e.g., a data/domain angle, a framework/tooling angle, and a testing angle) — this is intentional, not duplication of identical content.

| # | Section | Lessons |
|---|---|---|
| 1 | Product | 12 |
| 2 | Research | 12 |
| 3 | Data & domain | 12 |
| 4 | Engineering | 14 |
| 5 | Design & UX | 12 |
| 6 | Tools & frameworks | 12 |
| 7 | Ways of working | 14 |
| | **Total** | **88** |

---

## 1. Product

### 1. A pre-committed kill-criteria table is high-value PM discipline — keep it in every project
- Evidence: `docs/prd.md:434-447` — Annie Duke-style kill criteria table (e.g. "PMF survey <20% Very Disappointed → pivot," "3+ users say the verdict felt wrong → revisit formula"). Independently praised in `docs/lenny-review-specs.md:13,33` ("a masterclass in intellectual honesty... most PMs skip this because it feels like planning for failure").
- Do next time: Write kill criteria (signal, threshold, action) into the PRD before build starts, not after. For insurance-tech, define specific thresholds for trust/accuracy signals (e.g. "3+ users say a quote/estimate felt wrong → revisit the pricing/matching formula") before writing code.

### 2. Catching a misleading value proposition pre-launch is cheap; catching it post-launch is a trust failure
- Evidence: `docs/pm-coach-review-value-prop.md:1-18` — PRD claimed basketch tells users "which of MY products are cheaper," but the data (aktionis.ch) only supports "which are on promotion." The reviewer calls this "a structural misalignment between the product's promise and its capability," not a copy issue.
- Do next time: Before writing user-facing copy/promises, run a "data reality check": for every claim in the value prop, verify the underlying data source can actually prove it. In insurance-tech, don't claim "you'll get the best rate" if the model only has partial carrier coverage — claim what the data can prove.

### 3. Resolve strategic UX/JTBD questions before building, not as an "open question" at implementation time
- Evidence: `docs/pm-unified-journey-brief.md` Finding 3 — "Maximize Savings" vs "Minimize Trips" was left as an open question in the spec while the UI implicitly assumed one answer; reviewer invoked Shreyas Doshi's LNO lens: "Resolving this question before building is Leverage. Building the wrong UX and redesigning after user feedback is Overhead. This decision takes 30 minutes to make. Undoing a built UI takes a sprint."
- Do next time: Force explicit JTBD framing (Job A vs Job B) into a PM decision record before UI work starts. For insurance-tech: decide upfront whether the product optimizes for "lowest total premium" vs "fewest policy changes/switches" — these produce different UX, just like basketch's per-item routing vs per-store trip minimization.

### 4. The PM explicitly rejected building per-item cheapest-store routing in favor of keeping the existing category-level comparison — despite it being flagged as the more "correct" JTBD answer
- Evidence: `docs/decisions/2026-09-25-pm-decisions.md` P-8: "Build per-item cheapest-store routing, or keep the category comparison → **Keep today's category comparison. Do not build routing now.**" This runs counter to the earlier PM-coach recommendation (`docs/pm-unified-journey-brief.md`) to target per-item/"Job B" routing.
- Do next time: When a PM decision contradicts an earlier analysis-backed recommendation, record the reasoning (cost/effort, uncertainty, or timing) alongside the decision — the raw record here doesn't capture *why* P-8 chose to defer routing, which will make it hard to revisit later. For insurance-tech, log the "why" behind every scope-reduction decision, not just the "what."

### 5. Coarse product/category grouping (by ingredient, not by "what the customer actually buys") caused false matches at every layer
- Evidence: `docs/product-matching-improvement-proposal.md:10-30` — root cause diagnosis: `chicken-breast` keyword `poulet` also matches `pouletflugeli` (wings); no "product form/preparation state" concept meant tomato puree matched fresh tomatoes, ready meals matched raw potatoes.
- Do next time: Model domain concepts (form/state/preparation, not just category) as first-class attributes from day one — retrofitting this after users hit false matches is expensive. For insurance-tech: model policy "state" (draft/bound/renewal/lapsed) and "type variant" explicitly, don't rely on keyword/name matching for identity.
- (partially inferred: proposal was written but its full build/acceptance status wasn't confirmed in the files read — treat the diagnosis as verified, the "always model this" generalization as inferred guidance.)

### 6. Two independently-seeded taxonomies (code constant vs DB table) diverged silently for 5 months and corrupted 42.5% of records before being caught
- Evidence: `session-summary.md:183-198` — `BROWSE_CATEGORIES` (22 categories, ~90 sub-categories, used by the classifier) and DB `taxonomy_category`/`taxonomy_alias` (17+28 rows, seeded 2026-04-25, never touched since) had only 7 names in common; 11,206 of 26,371 deals (42.5%) ended up with no category.
- Do next time: Never let two systems independently own the same vocabulary. Pick one source of truth (code constant, generated into DB, or vice versa) and enforce it with a test that fails on drift — not a one-time seed. For insurance-tech: coverage/product-type taxonomies used by both a rating engine and a database must be generated from one file, checked by CI.

### 7. Schema drift between the live database and the schema derivable from the repo went undetected until it nearly caused a failed migration
- Evidence: `session-summary.md:207-212` — `deals_category_slug_fkey` existed live in production but was absent from a DB rebuilt from the repo; a migration script's `ADD COLUMN ... REFERENCES` was silently a no-op because an earlier migration already added the column without the FK. "Any design validated against the repo schema was validated against a schema production does not have."
- Do next time: Periodically diff the live production schema against what migrations would produce from a clean rebuild (e.g., `pg_dump --schema-only` on both) rather than trusting migration history is authoritative.

### 8. A PRD "still open" question about the category taxonomy foreshadowed the divergence bug found 5+ months later
- Evidence: `docs/prd.md:508` (§12 "Still Open" #3): "How do we accurately categorize products into the 3 buckets? (Store category taxonomies from aktionis.ch may not match ours) — To resolve during M0" — this question was never marked resolved, and the taxonomy divergence RCA (`session-summary.md` §5) surfaced the same unresolved risk on 2026-09-17.
- Do next time: Track "Still Open" PRD questions to explicit closure with a date and owner; an open question left dangling for months is a leading indicator of exactly the defect class it names. Triage open PRD questions at each milestone, don't let them go stale.

### 9. Multiple independent expert reviews (PM coach, "Lenny" reviewer) before build materially improved the spec — worth the token cost
- Evidence: `docs/lenny-review-specs.md`, `docs/pm-coach-review-specs-v2.md`, `docs/pm-coach-review-value-prop.md`, `docs/pm-coach-challenge-multi-store.md`, `docs/pm-coach-review-favorites-data-gap.md` — five separate structured critiques of the same PRD/spec, each surfacing distinct, concrete flaws (missing kill criteria, value-prop/data mismatch, JTBD ambiguity, data-gap UX risk) before a single line of feature code shipped.
- Do next time: Budget for 2-3 rounds of adversarial PM/spec review (different lenses: growth, data-honesty, UX-edge-cases) before build in the new project — but timebox them; watch for diminishing returns if the same issues keep resurfacing across reviews.

### 10. A UX decision correctly favored simplicity/trust (email-as-lookup-key, no magic link) after identifying the real threat model was near-zero
- Evidence: `docs/prd-v3.2-amendment.md:136-151` (§7.1-7.2) — the team removed a magic-link email round-trip in favor of direct email-as-lookup-key, explicitly reasoning through the threat model ("no payment info, no PII beyond email... the correct threat model is casual curiosity, not account security") and disclosing the tradeoff to users in-product.
- Do next time: For each auth/lookup mechanism, explicitly write out the threat model (what's actually at risk) before defaulting to "best practice" security patterns that add friction the risk doesn't justify. For insurance-tech, the threat model is very different (PII, financial data) — do NOT copy this low-friction pattern; it only applies given basketch's near-zero-sensitivity data.

### 11. Non-core "nice to have" features were built early (starter packs, "Worth a look" section) and later explicitly retired once real usage didn't justify them
- Evidence: git log — `217f69b Expand starter packs to 8...`, later `1de0796 fix(web): remove the starter-pack promise — no such feature exists` and `53a3185 merge: WP-11 — remove the homepage 'Worth a look' section (PM decision 2026-09-25)`. The kill-criteria table itself flagged this risk in advance: `docs/prd.md:445` "Onboarding drop-off >60% before selecting a starter pack → Redesign onboarding — templates may not resonate."
- Do next time: Treat onboarding templates/curated sections as experiments with an explicit removal trigger from day one (as the kill-criteria table did), so retiring them later is a planned event, not a scramble. For insurance-tech, avoid building speculative "helper" features (e.g. pre-built coverage bundles) before validating the core comparison/matching loop works.

### 12. A PM decision explicitly kept a mislabeled feature name divergent from its actual behavior until called out, then fixed the logic rather than the label
- Evidence: `docs/decisions/2026-09-25-pm-decisions.md` P-7: "The 'Cheapest' tag actually means biggest % discount → **Make it true: 'Cheapest' must mean the lowest price.** Keep the label; change the logic." This is the same trust issue class as lesson #2 (value prop vs data reality), recurring at the UI-label level.
- Do next time: Audit UI labels against their actual computed logic as a standing QA checklist item, not just once at launch — the same "label says X, code computes Y" defect class recurred at multiple altitudes (value prop, verdict formula, individual tags) across this project's life.

---

## 2. Research

### 1. A single root-cause research pass is worth more than 10-15 blind fixes
- Evidence: `docs/data-source-research-2026-09-07.md` lines 1-30 — after "~10-15 attempted fixes" on categorisation, one research session found the actual bug in one line: `pipeline/aktionis/normalize.py:336` hardcoded `"sourceCategory": None`, so tier-2 category matching never fired.
- Do next time: when a defect resists 2-3 targeted fixes, stop patching symptoms and commission one focused root-cause research pass across the full data path before writing more code.

### 2. Deep data-source research (8 agents, ~900k tokens) found a 10x volume increase hiding behind a silent under-return bug
- Evidence: `docs/data-source-research-2026-09-07.md` line 70 — Migros's unfiltered promo API reported `numberOfItems: 111` but iterating all 16 category facets yielded 1168. "The unfiltered call silently under-returns by 90%."
- Do next time: for any new data source, test aggregate/unfiltered endpoints against per-segment enumeration before trusting a total count.

### 3. Research must be recorded with real HTTP evidence, not summarized claims
- Evidence: `docs/data-source-research-2026-09-07.md` header — "all HTTP status codes below are real responses received that day," with per-retailer robots.txt bodies, response codes, byte sizes quoted verbatim (line 76-80 Coop's DataDome 403).
- Do next time: require every data-source research doc to cite the literal request/response, not a paraphrase.

### 4. Competitive analysis correctly identified the one differentiated question ("which of MY products are cheaper where" vs "what deals exist"), and this framing held through the whole project
- Evidence: `docs/competitive-analysis.md` lines 1-9 — Executive Summary distinguishes basketch as "person-first" vs. "deal-first" competitors; flags Rappn as "High" threat.
- Do next time: do the same framing exercise up front for insurance-tech — name the one question competitors don't answer, use it as the scope north star.

### 5. UX research on world-class analogues produced specific, cite-able patterns rather than generic advice
- Evidence: `docs/research-unified-journey.md` findings 1.1-2.3 — e.g. Baymard's quantity-selector benchmark, NN/G's warning against transient "added" state, each with a named source and a concrete "basketch adaptation."
- Do next time: keep the format — name the app, name the pattern, name the research body, translate to the new product's constraint.

### 6. Legal research found the real exposure was the opposite of the intuitive one — publication accuracy, not data acquisition
- Evidence: `docs/data-source-research-2026-09-07.md` lines 270-282 — "the risk is not where intuition puts it... The real exposure is publication, not acquisition — Art. 3(1)(e) UWG," citing a case lost partly on expired-listing claims.
- Do next time: commission research to find where regulators/case law actually enforced, not where instinct points.

### 7. Product photos carried a settled per-se legal risk distinct from factual data, driving an architecture decision (crop-in-browser, never re-host)
- Evidence: `docs/data-source-research-2026-09-07.md` line 292; `docs/collection-module-design.md` lines 21, 164-166 — "Swiss product photos are protected per se... Option B — store coordinates, crop in the browser. Never copy the photo."
- Do next time: when legal research finds a settled binary rule, bake it into a domain-model invariant, not a comment or checklist.

### 8. Case-law research distinguished binding precedent from weak authority, changing the operative rule
- Evidence: `docs/data-source-research-2026-09-07.md` lines 307-320 — BGE 131 III 384 (2005) and the 2023 Ryanair rulings treated as controlling; KGer Freiburg 2016 flagged as "weak authority: cantonal, first instance, defendant defaulted entirely."
- Do next time: tag each precedent with court level and procedural posture — don't treat all citations as equally authoritative.

### 9. Bot protection/robots.txt findings directly determined technical architecture; "getting past a block" was the legal red line
- Evidence: `docs/data-source-research-2026-09-07.md` lines 72, 76-80, 90-95, 410 — Migros's TLS-1.3-pinning bypass named "circumvention of a technical protection measure" and rejected; rule adopted: "If an honest bot is blocked, that is a refusal — accept it" (codified in `CLAUDE.md` § Legal Constraints).
- Do next time: research bot-protection posture per data provider before building an adapter, and adopt a hard team rule against circumvention before writing code.

### 10. A live-competitor check was used to sanity-check an internal theory rather than trusting an inference
- Evidence: `docs/data-source-research-2026-09-07.md` lines 425-471 — "the user challenged an earlier inference of mine and was right," followed by 4 independent checks before concluding regional pricing doesn't exist, only availability varies.
- Do next time: test inferred assumptions against live competitor behavior as one of several independent verification methods before they enter the data model.

### 11. Research explicitly recorded open questions and named unknowns instead of implying completeness
- Evidence: `docs/data-source-research-2026-09-07.md` lines 621-656 ("Open decisions," "Known unknowns") and line 639 "Outstanding user action: Open coop.ch/de/termsAndConditions in a normal browser and report what it says."
- Do next time: require every research doc to end with a "known unknowns" section and route human-only actions back to the PM explicitly.

### 12. A structured competitor/market enforcement check established a real-world risk ceiling before writing collection code
- Evidence: `docs/data-source-research-2026-09-07.md` lines 378-400 — "Enforcement record: None... no Swiss price-tracking project shut down under retailer pressure," cross-checked against comparis.ch and rappn.ch's operating posture.
- Do next time: before assuming an approach is too risky or too safe, research how live competitors in the same regulatory environment actually operate and whether anyone was enforced against.

---

## 3. Data & domain

### 1. Retailer data capability varies enormously — design the MVP around the weakest source, not the richest
- Evidence: `docs/data-capability-analysis.md` §2-3 — Migros API returns full catalogue search, regular AND promo prices, and category breadcrumbs; Coop (via aktionis.ch) returns promo-only prices with no regular price, no category, no full catalogue (§7 "Gap 1/2/3").
- Do next time: before scoping V1, build a per-source capability matrix (fields, coverage, refresh cadence) and frame the product around what the *weakest* mandatory data source can support, not the richest — basketch had to reframe from "cheaper store overall" to "deals this week" because of this gap.

### 2. Manual, curated matching beats fuzzy/AI matching for small-scale cross-entity linking
- Evidence: `docs/product-data-architecture.md` §3 "Why Not Fuzzy String Matching" and "Why Not AI/LLM-Based Matching" — German compound words break edit-distance scoring, and AI matching was rejected on cost (~600 calls/week on a CHF 0 budget), latency, and non-determinism; ~35 manually curated product groups covered the needed cases.
- Do next time: for insurance-tech, don't reach for embeddings/LLM entity-resolution before checking if the domain has a small enough universe (a few dozen products/plans/covers) for a hand-curated mapping table — it's cheaper, deterministic, and reviewable in a PR.

### 3. A shared vocabulary with more than one consumer must be generated from one source, never hand-copied
- Evidence: `docs/rca/2026-09-17-architect-taxonomy-divergence.md` §1.3 found the category taxonomy copied **five times** (code constant, two DB tables, two frontend files), four of which "failed open" (silently returned null/fallback on an unknown value); the root cause was the pipeline discarding the classifier's validated category and re-deriving it from a weaker, hand-maintained lookup table (§2.1).
- Do next time: the moment a taxonomy/enum has 2+ independent consumers (code + DB + UI), generate the dependents from one canonical source and assert byte-equality in CI — never let a second copy be hand-edited "to keep in sync."

### 4. A count tripwire does not catch a missing dependent — assert relationships, not cardinalities
- Evidence: `docs/rca/2026-09-17-tech-lead-taxonomy-divergence.md` §0.4 and "Compass principles" #3 — `shared/types.test.ts` had a test asserting "22 browse categories, 76 sub-categories" that passed at the exact commit that broke 48% of live deals, because it checked the count changed deliberately, not that every dependent (DB seed, frontend labels) was updated too.
- Do next time: when a constant changes shape, write a cross-artifact test (e.g., "every enum value has a translation key" / "every category in code exists in the DB") rather than a same-file cardinality assertion.

### 5. A nullable foreign key is an invariant any row can opt out of — and opting out looks like success
- Evidence: `docs/rca/2026-09-17-architect-taxonomy-divergence.md` §2.1 root-cause #4: "a nullable FK is an invariant any row may opt out of by writing NULL... 48% of the catalogue opted out in a single run" and the run still logged success.
- Do next time: when a field represents "must resolve to a known reference," don't let the column be nullable by default — decide up front whether missing-classification should hard-fail the row/batch or degrade visibly, and enforce it with a DB constraint (not just application code) so Postgres — not a habit — is the guard.

### 6. "Empty is not success" must extend from data collection into classification/enrichment, with a measured threshold, not a bare log line
- Evidence: `docs/rca/2026-09-17-tech-lead-taxonomy-divergence.md` §5 — an unmapped-category warning fired every run for 6 days unnoticed because it was "a `console.warn` inside a 60-minute log" with no threshold ("some unmapped tags reads the same at 1% and at 48%"); fix was two alerts (`taxonomy-unmapped` warning at >2%, `taxonomy-coverage-collapse` critical at >20% or a >20pt drop) verified against the actual incident's numbers.
- Do next time: every "degraded but not zero" pipeline outcome (partial classification, partial enrichment) needs a numeric threshold-based alert that is proven to fire on the real historical incident before being trusted, not a log line someone is expected to read.

### 7. Keyword/substring categorization rules need explicit exclusion lists, or common substrings silently miscategorize
- Evidence: `docs/arch-data-quality.md` §2 Root cause 3 — Denner's "meridol **mund**spülung **zahnfleisch**schutz" (mouthwash) was tagged `sub_category = 'meat'` because "fleisch" appears inside "zahnfleisch"; similarly "milch" in "milchschokolade" and "erdbeer" in "actimel joghurtdrink erdbeere" caused false category/product-group matches.
- Do next time: every keyword-based classification rule (in any new domain — e.g., insurance product-name parsing) needs a paired `mustNotMatch` exclusion list from day one, tested against real production strings, not just the positive keyword list.

### 8. "No match is better than a wrong match" — don't lower matching thresholds to boost coverage numbers
- Evidence: `docs/arch-data-quality.md` §5 "What NOT to Do" — token-based fuzzy matching was explicitly rejected because loosening the threshold to catch more cross-store product matches produced false positives faster than true positives (e.g., matching strawberries to blueberries in an over-broad "berries" group); "users lose trust in the tool when they see obviously wrong comparisons."
- Do next time: treat match/coverage percentage as a vanity metric secondary to precision; if a data feature (price comparison, coverage matching) surfaces a wrong pairing, it's worse than showing nothing — validate every threshold change against real production names before shipping.

### 9. A test's normalizer can hide the exact defect it's supposed to catch
- Evidence: `docs/rca/2026-09-26-tech-lead-migros-name-truncation.md` §3 — the ground-truth test's `normalize()` function stripped accents, lowercased, and **deleted every space**, so truncated/wrongly-joined product names like "Migros Kalbs geschnetzeltes" (should be "Kalbsgeschnetzeltes") still matched the keyword-substring judge and passed for months; 31 of 91 published names were wrong while the test suite was green.
- Do next time: when writing a "does the output look right" test, prefer exact string/value equality (hand-verified against source truth) over fuzzy/normalized comparison — a lenient assertion is often lenient enough to certify the bug.

### 10. Encode "was this ever answered" as a versioned outcome, not a timestamp or a bare empty value
- Evidence: `docs/decisions/2026-09-17-attributes-version.md` — an earlier design set `attributes_enriched_at` on every enrichment *attempt*, which meant a rate-limited (429'd) call was marked "done" and never retried; the fix used `EnrichmentOutcome = stated | statedNothing | failed` with an `attributes_version` column that only advances on a genuine answer, distinguishing "asked and got nothing" from "asked and was refused" from "never asked."
- Do next time: for any enrichment/classification pipeline, model the three-way outcome (answered-with-data / answered-with-nothing / failed-to-answer) explicitly in the data model — collapsing them into one nullable field creates either infinite re-asking or false "done" states.

### 11. Validity/expiry is a function of (row, current date) — never bake "today" into a cache key or static shell
- Evidence: `docs/rca/2026-09-27-tech-lead-stale-expired-deals.md` §3 — the homepage's ISR shell computed `today` *inside* a cached function with no date in the cache key, so a page built at 23:50 on day D was still validly served (per its key) at any time after midnight D+1; expired Volg deals (`valid_to` day D) were shown live because "the read that should remove expired rows ran with yesterday's `today`."
- Do next time: any date/"is this active now" computation that feeds a cache must take the date as an explicit cache-key input (read at request time, e.g., via `connection()`), never computed inside the cached function body — this is the general pattern for any time-boxed eligibility (e.g., insurance policy effective/expiry dates) behind a cache.

### 12. Model rate/quota limits are scoped to (provider, model), not to your code's call sites — share the gate
- Evidence: `docs/decisions/2026-09-16-model-gate.md` Context — three separate pipeline components (classifier, judge/reflector, enricher) each called the same Gemini model with their own independent rate limiters; because Google's free-tier quota (15 req/min) is scoped to the (project, model) pair, not to any one caller, a backfill burst got "255 of ~250 requests refused with 429" while the pipeline logged success.
- Do next time: when multiple code paths call the same external rate-limited API/model, build one shared quota gate keyed by (provider, model) at the composition root and inject it everywhere — per-caller limiters silently under-count total load the moment a second caller is added.

---

## 4. Engineering

### 1. A type-check command that exits clean can still have verified nothing
- Evidence: `CLAUDE.md` warns explicitly: running `npx tsc` from the repo root (no root `node_modules`, flat layout) "downloads an unrelated package that prints 'This is not the tsc command you are looking for'... A reviewer who runs the root command and sees no errors has verified nothing." Commit `68393f9 fix(docs): the documented type-check command verified nothing`.
- Do next time: For any multi-package repo without workspaces, pin the exact type-check invocation (folder + binary) in the root CLAUDE/README, and never pipe through `tail`/anything that swallows exit codes (`${PIPESTATUS[0]}`).

### 2. Tests can pass while asserting zero things ("coverage theatre")
- Evidence: `docs/rca/2026-09-15-tech-lead-items-6-9.md:591` — `if (!isOk(r)) return` pattern let a test "pass with zero assertions executed"; HANDOVER.md §4 names 10 recurring "reports success while doing nothing" defects, several caught only after live incidents, e.g. a test asserting `naturalKey` against itself, and a "no offer lacks a destination" test that passed vacuously because `.some()` on `[]` is `false`.
- Do next time: Ban early-return guard clauses inside test bodies; require every test to assert on a mutation (see #3). Add a lint/review checklist item: "does this test fail if the code is deleted?"

### 3. Every guard must be mutation-tested, not just written
- Evidence: HANDOVER.md §4: "Every new guard must be mutation-tested. Reintroduce the defect, confirm red, restore. A guard that has never failed is not yet a guard." `docs/rca/2026-09-16-ddd-tdd-audit.md` §3 shows this actually practiced: `stale-sweep.test.ts:93-105` was written specifically because the headline test at `:78` was found to survive the mutation it was named for.
- Do next time: Bake "mutation check" into the Definition of Done for every guard/invariant test — revert the fix, confirm red, then restore. Document the near-miss in the test file's comment (this repo did this well — copy the pattern).

### 4. A test can pass in production paths that can never execute (dead alert logic)
- Evidence: `docs/rca/2026-09-16-ddd-tdd-audit.md` §3, "Tests that would pass with the defect restored": `run-pipeline.test.ts:311-324` only goes green because it injects a fake clock 9 days apart; in production `now()` defaults to `Date.now`, so `pipeline-stale` can never fire, and 6 of 7 critical-alert fields (`benchmarkMacroF1: null`, `previous: null`, etc.) are hardcoded literals — "`shouldFailRun` cannot return `true` in production."
- Do next time: For any alerting/circuit-breaker logic, add a composition-root test that exercises the REAL clock/wiring, not just the unit with a scripted double. Explicitly test "can this condition ever be true given how it's actually constructed."

### 5. "A correct unit that nothing wires up" is the dominant defect class in this codebase
- Evidence: The DDD/TDD audit (`docs/rca/2026-09-16-ddd-tdd-audit.md` §4) found 4 closed instances plus 11 more still in the tree (dead `hasPublishedData`, dead `benchmark.ts`, dead `similar-products.ts`, dead `KNOWN_LIMITS`, `run.ts` skipping the dead-man ping on the throw path) — roughly "600 lines of tested, correct, unreachable code," two of them on the observability path itself.
- Do next time: Track "constructed by nothing" as its own review category, separate from "has no test." Grep for zero call-sites on every new domain/application function before merge; require the composition root to prove wiring, not just a unit test.

### 6. Architecture fences (import-direction guards) must cover every domain-shaped directory, and must self-guard against being pinned stale
- Evidence: `docs/rca/2026-09-16-ddd-tdd-audit.md` §1.1 — `architecture.test.ts:27,69` hardcodes `DOMAIN_DIRS.length === 2`, but `storage/domain/` (holding the most destructive logic, `sweepPlan`) and `observability/` were created later and never added, so they sit "outside the fence" though currently clean. Three separate hand-rolled architecture tests exist with three different directory lists, and nothing checks their union covers the whole tree.
- Do next time: When adding an architecture/layering test, make the directory list an assertion that fails loudly when a new top-level domain folder appears untracked (e.g., diff against `find */domain -maxdepth 0`), not a magic-number count that has to be remembered.

### 7. An invariant stated only in a doc comment is not an invariant if the type is unbranded
- Evidence: `docs/rca/2026-09-16-ddd-tdd-audit.md` §2.2 — `ModelCallPolicy`'s factory rule ("built only by `createModelCallPolicy`... must hold everywhere") is a plain structural type; `model-probe.ts:39-48` hand-assembles one with `requestsPerMinute: 60` (vs. the registry's real 15/min), and a test at `composition.test.ts:88` documents the resulting quota violation as expected rather than failing on it — silently defeating the "one shared quota gate per model" architecture.
- Do next time: For any value that must only be constructed via one factory, brand the type (nominal typing) or re-validate at every consumption point, not just at the one intended construction site — and treat "the same value can be hand-assembled elsewhere" as a code-review blocker.

### 8. Bound request/data size by real-world bytes, never by item/key count
- Evidence: HANDOVER.md §3 — the five-run pipeline outage: cache lookups were chunked by `LOOKUP_CHUNK = 200` keys, but Swiss product names with `ü`, `%`, `&` percent-encode to 3-6 bytes each, so "chunks" of equal key-count differed by kilobytes and blew postgrest-js's 8000-char URL limit — ~600 cached products were silently re-sent to Gemini, blowing the 45-minute budget. Fixed in `chunkByEncodedSize()` (commit `69a03fa`).
- Do next time: Any batching/chunking logic touching user-generated or non-ASCII text must bound by encoded byte size (with a count backstop), never assume ASCII-equivalence between "N items" and "N units of transport capacity."

### 9. Guard thresholds must be expressed in real-world units (products, deals), not internal artifacts (chunks) — otherwise tuning one constant silently flips a guard's meaning
- Evidence: HANDOVER.md §3 fix step 3 — `MAX_UNREADABLE_SHARE` (0.25 of chunks) was replaced with `MAX_UNREADABLE_KEYS` (200 products) because smaller chunks turned the same 3 failures from a correctly-tripping 3/8=0.38 into a silently-degrading 3/30=0.10. "A guard whose meaning flips when you tune an unrelated constant is not a guard." Also HANDOVER §5 codifies this as a standing rule, citing `MIN_REFRESH_SHARE` in `stale-sweep.ts` as the model to follow.
- Do next time: Express every safety threshold in the domain's real unit of harm (rows deleted, products lost) computed from an absolute count, and add a test that varies an unrelated implementation constant (batch/chunk size) to prove the guard's trip point doesn't move.

### 10. "An error returned is not an error handled" — silent `if (isOk(x))` with no `else` is a recurring cold-start-disguising bug
- Evidence: HANDOVER.md §4 item #10 (rated "most instructive"): `if (isOk(lookup))` with no else branch meant a real cache error was discarded and silently treated as a cache miss, faking a cold start — "The cache fix was correct and completely inert, because the caller discarded the error." Codified as a standing rule in HANDOVER §5.
- Do next time: Lint or code-review rule: every `Result`/`Either`-checking `if` must have a paired failure branch that does something observable (log, alert, propagate) — never a bare success-path check.

### 11. A single fatal log line can hide behind a louder, misleading one — don't diagnose from the loudest error
- Evidence: HANDOVER.md §3 "Wrong #1" — the log was dominated by `429 RESOURCE_EXHAUSTED` noise, but every rate-limited chunk actually completed; the only truly fatal line was `Timeout of 2700000ms hit`, buried underneath. "Nearly traded away classification accuracy to fit a constraint that wasn't the problem."
- Do next time: When triaging a pipeline failure, explicitly identify which log line correlates with the actual failure (exit code / stack trace), not the most frequent or alarming-looking one, before proposing a fix.

### 12. A synthetic reproduction that doesn't match production's client library, table, host, and data shape can wrongly rule out a hypothesis
- Evidence: HANDOVER.md §3 "Wrong #3" — a probe using `urllib` (not the actual `undici`/postgrest-js client), ASCII-only synthetic keys, a different table, run from a laptop, returned HTTP 200 at 18,492 chars and was used to declare "URL length" disproven — it wasn't. Root cause was in fact URL/byte length via a different, unmocked code path.
- Do next time: Any "let's test this hypothesis with a quick script" must replicate the real client library, real table/endpoint, real environment (e.g., CI runner not laptop), and real data shape — otherwise treat the result as inconclusive, not disproof.

### 13. Read the third-party library's source (not its docs) when it silently swallows the real error
- Evidence: HANDOVER.md §3 — postgrest-js's `PostgrestBuilder.ts:367-424` catches network errors and returns them as always-identical `"TypeError: fetch failed"` messages, discarding `.details`/`.hint` (which named the exact root cause) unless the caller explicitly reads those fields. This caused 4 of 5 outage runs to produce "identical, uninformative logs."
- Do next time: When an error message is suspiciously generic/repeated across failures, grep the dependency's own source for how it constructs that message before writing a fifth diagnostic script — check for `.details`/`.cause`/`.hint`-style fields being silently dropped.

### 14. Per-minute rate limits and per-day limits are not interchangeable — a misclassified limit can abandon most of a batch
- Evidence: HANDOVER.md §4 item #6 ("Per-MINUTE rate limit read as per-DAY → runs abandoned 7 of 8 chunks"), fixed in commit `1052809 fix(resilience): a per-minute rate limit is not a daily one`; separately, `docs/rca/2026-09-15-tech-lead-items-6-9.md` documents a related quota-scope bug where only one of three Gemini callers (classifier) had a rate limiter, so the enricher burst uncontrolled and caused 350-365 429s per run with 82.6% of live deals missing attributes.
- Do next time: When integrating a metered API, verify the limit's time window empirically (test against the documented reset cadence, not an assumption) and centralize the quota gate per (provider, model) shared by every caller of that model — not one gate per code path.

---

## 5. Design & UX

### 1. Design tokens drift out of sync across docs unless one file is the enforced source of truth
- Evidence: `docs/design-challenge-v2.md` line 267 says CLAUDE.md and design-system v1.0 still listed Migros #FF6600 and Coop #E10A0A after the spec had moved to #e65100 and #007a3d. `docs/design-review-round2.md` ("New Issue B") has the same finding.
- Do next time: Make one machine-readable token file the only source of truth. Add a CI grep that fails when a doc or code file has a hex value that isn't in it.

### 2. Opacity is not an accessible way to show a second state, so always compute the resulting contrast
- Evidence: `docs/design-challenge-v2.md` line 228: the Tier-2 status used #666 at 0.7 opacity, which is about #999 on white, about 2.8:1, and fails WCAG AA 4.5:1. Line 144 of the same doc had earlier praised that same opacity as "good".
- Do next time: Ban opacity-based de-emphasis of text. Every muted state gets its own token, with its contrast ratio recorded in the spec.

### 3. Set 44px touch targets explicitly with min-height/min-width, never through padding plus font-size
- Evidence: `docs/design-review.md` §3.3: `Input.tsx` with `py-2.5` + `text-sm` came to about 40px. `docs/ux-review.md` issue 4.4: `text-[0.7rem]` (11.2px) labels were below the 12px floor. (Section numbers were not re-checked.)
- Do next time: Put `min-h-[44px]` in the base button, input and icon-button components from the first commit. Lint against arbitrary Tailwind bracket values.

### 4. Never point a meaning token (error, success) at a brand token
- Evidence: `docs/design-review-round2.md` lines 65 and 82: `.error-msg` used `var(--color-coop)`. When Coop's colour moved from red #E10A0A to green #007a3d, every error message became green.
- Do next time: Name tokens by what they mean. Keep carrier or brand colours separate from status colours, even when the values happen to match today.

### 5. A first contrast fix that barely passes gets reopened, so measure the rendered colours and leave a margin
- Evidence: commit `2a6dbb7` set the WhatsApp button to #128C7E, claiming 4.5:1. Commit `15d8801` (same day) found it was really 4.13:1 and darkened it to #075E54 (8.4:1).
- Do next time: Measure contrast on the real background colour with a calculator. Aim clearly above 4.5:1.

### 6. `position: sticky` breaks inside a virtualised list that uses transforms
- Evidence: commit `3c3ad78` added react-virtual. In `ca577f1` the sticky header was sitting inside a transform-translated row, which gives a different containing block. The fix kept `lg:sticky` on desktop only. `4de60bb` then removed sticky on desktop too, because it "drifted below content on desktop too".
- Do next time: When a list is virtualised, make the sticky header its own layer outside the transformed rows. Test by actually scrolling a production build.

### 7. Plural bugs appear on every surface that shows a count, so fix the pattern once (ICU plus a lint), not one string at a time
- Evidence: `docs/design/2026-09-27-shared-list-expiry-and-plurals.md` lists the same bug in 7+ keys. The fixes landed one by one: `3bd9c3b`, `655f091` ("NaN deals" at 1,000+), `9e749b4` ("0 months ago"), `e560a18`. Then `0d16c5c` replaced a regex guard with a parser-based lint.
- Do next time: Use ICU `{count, plural}` for every string with a count from day one. Pass numbers, not formatted strings. Add a parser-based CI lint. This covers DE/FR/IT insurance copy too.

### 8. An independent design review with a fixed checklist catches defects the author missed
- Evidence: `docs/design-challenge-v2.md` produced the v2.1 corrective spec (all 20 findings accepted, per the `docs/design-spec-v2.md` changelog). `docs/design-3-new-surfaces-challenge.md` line 12 found that the spec named `Sheet` (desktop only) where mobile needs `Vaul`, and that the FR/IT copy was missing entirely, even though the app ships en/de/fr/it.
- Do next time: Every UI spec gets a second, adversarial reviewer before build. The checklist covers 320px mobile, all states, accessibility, and every shipped language.

### 9. Stress-test mobile at 320px, not 375px
- Evidence: `docs/design-3-new-surfaces-challenge.md` M3 (line 42): the 7-cell strip needs 7×44 + 6×4 = 332px, so it overflows at 320px. The fallback was a stack of 364px per item, which pushed the verdict about four screens down. M4: at under 360px a destructive "Hide forever" button sits where the thumb lands for the next card. (M4 was not re-checked.)
- Do next time: Make 320px the minimum width in every wireframe review. Check where destructive buttons sit relative to the next card.

### 10. Plan a useful result for "no exact match" instead of an empty or broken state
- Evidence: `docs/ux-mylist-category-redesign.md` §1: custom items like "BIO Onion" showed "No price data" and the list looked broken. The fix was to show all deals in the item's category.
- Do next time: In any matching feature (for example, matching a policy to a user's needs), treat "no exact match" as a normal case that falls back to a wider, still useful result.

### 11. Never show a comparison between things measured in different units
- Evidence: `docs/v4-design-architecture.md` §1: a "Water" row compared a 6×1.5L pack (about CHF 0.29/L) with a single glass bottle (about CHF 1.30/L) and showed a +5.20 difference. The fix made pack size and format real data fields, compared CHF per unit, and showed no difference when formats differ.
- Do next time: Build "only compare like with like" (same cover, same deductible, per-unit price) into the data model and the component contract, not only into the wording.

### 12. For sharing on WhatsApp, a self-contained image card spreads better than a link preview
- Evidence: `docs/whatsapp-sharing-guide.md` §4-6 compares a Wordle-style card, readable at a glance with no tap, against a link preview built from OG tags. `docs/lenny-review-favorites.md` recommends leading with the shareable verdict, which needs no setup.
- Do next time: If a feature is meant to spread through chat apps, design a branded image that stays readable after compression as a deliverable in its own right. OG tags alone are not the sharing feature.

---

## 6. Tools & frameworks

### 1. Next.js 16 Cache Components: `cacheLife({expire})` bounds the in-memory `use cache` entry, not the durable Vercel ISR page copy — a stale prerendered shell can outlive "expire" indefinitely
- Evidence: `docs/rca/2026-09-27-tech-lead-stale-expired-deals.md` §3.3 — homepage served 2026-09-26 data on 2026-09-27 because ISR is stale-while-revalidate and "only fires on traffic"; `expire: 3600` was believed to bound staleness to 1h but didn't.
- Do next time: never bake a time-sensitive value (today's date, a validity window) into a statically-shelled page. Pass the "as-of" value as an explicit function argument so it is part of the cache key (`connection()` + per-request child component) — this makes staleness structurally impossible.

### 2. A day-boundary bug is invisible unless a test crosses midnight
- Evidence: `docs/rca/2026-09-27-tech-lead-stale-expired-deals.md` §5 — "No test (unit or e2e) crosses a Zurich midnight"; the source-regex test asserting `expire <= 3600` "encodes the false premise" and passed while the defect was live.
- Do next time: for policy effective-date/renewal-date logic, write a test that advances the clock across the actual boundary (midnight, month-end, policy anniversary) and asserts old data is excluded.

### 3. GitHub Actions scheduled workflows are auto-disabled after 60 days without a repo commit — a silent failure mode with no built-in alert
- Evidence: `docs/component-2-agent-design.md` (~line 889/910); reconfirmed `docs/rca/2026-09-27-tech-lead-stale-expired-deals.md` (lines 86/126) and `docs/design/2026-09-25-architect-pm-decisions-design.md` (line 172). Directly verified in these docs (not just inferred).
- Do next time: never rely on GH Actions cron alone for correctness-critical jobs on a low-commit-frequency project. Add an external heartbeat (basketch used `HEALTHCHECK_PING_URL`) and prefer request/event-triggered correctness over cron-dependent correctness.

### 4. GitHub Actions' `timeout_minutes` on a retry step is per-attempt, not per-job/workflow — "60 minutes" can silently mean 2x that in wall-clock
- Evidence: `docs/rca/2026-09-25-sre-post-monday-runs.md` §3/Q2 — with `max_attempts: 2` a run took 1h19m-1h38m while GitHub reported "success," no step exceeding its own timeout.
- Do next time: document/test worst-case wall-clock (attempts x per-attempt timeout + setup), and set an outer `jobs.<job>.timeout-minutes` backstop.

### 5. A hand-measured timing constant that duplicates something derivable from config goes stale silently when the config changes
- Evidence: `docs/rca/2026-09-25-tech-lead-max-chunk-ms.md` TL;DR — `MAX_CHUNK_MS` (19.5 min) was hand-copied from judge-phase timing; a later rate-limit change made it 2x too high while `WRITE_TAIL_MS` drifted low simultaneously — a passing config test only "by coincidence."
- Do next time: derive timing/capacity budgets algebraically from source config at computation time, not as hand-maintained constants; if empirical, comment which run/config version it was measured against.

### 6. Supabase/PostgREST has an ~8,000-char URL length limit on `.in()` filters, and the client library silently catches the resulting network-shaped error rather than throwing it
- Evidence: `HANDOVER.md` §3 — postgrest-js `PostgrestBuilder.ts:367,422-424` "CATCHES; does not throw," always reporting `TypeError: fetch failed` and discarding `.details`/`.hint` (which name the exact fix); `urlLengthLimit ?? 8000`.
- Do next time: bound Supabase batch lookups by encoded byte size, not item count (non-ASCII text costs 3-6 bytes/char); always log `.details`/`.hint`, never just `.message`.

### 7. Supabase free tier (500MB, 2,000 GH Actions min/mo, 60 connections) had wide headroom — the real constraint was Vercel Hobby's 10-second function timeout
- Evidence: `docs/tech-stack-v3-validation.md` §1-3 — storage ~120MB (4.2x headroom), pipeline ~290 min/mo (6.9x headroom); §2 flags a multi-JOIN query at 6-9s against the 10s Hobby limit. `docs/tech-feasibility-review.md` §Risk2 confirms Supabase free tier "not a constraint... at any foreseeable scale."
- Do next time: profile the platform's function/request timeout early, not just DB storage/API quotas — materialized views computed at pipeline-write-time are the standard escape hatch.

### 8. Supabase free-tier auto-pause after 1 week of inactivity requires a deliberate keep-alive job
- Evidence: `docs/tech-stack-v3-validation.md` §7 risk 1 — "DB pauses after 1 week of inactivity. Already mitigated by the keep-alive job in pipeline.yml."
- Do next time: add a scheduled keep-alive ping from day one on any Supabase free-tier project with low traffic.

### 9. Gemini/OpenRouter cost control required a single shared rate/circuit gate per (provider, model) because the provider's quota scope didn't match the code's original per-caller scope
- Evidence: `docs/decisions/2026-09-16-model-gate.md` — a backfill fired ~250 requests in 20s, 255 refused with 429, logged as "0 tokens" with no severity; root cause was three separate callers of the same Gemini model each with their own (or no) limiter, vs. Google's (project, model)-scoped quota. Fix: one `ModelGate` per (provider, model), required at the single HTTP choke point, enforced by a build-failing test.
- Do next time: build exactly one shared rate/circuit/retry gate per (provider, model) at the composition root; read the provider's actual retry-after value (header or body field) rather than guessing a fixed backoff.

### 10. A hard USD spend cap needs both a provider-side setting (correct reset cadence) and an app-side ledger that reserves cost before the call
- Evidence: `CLAUDE.md` "Legal Constraints" — OpenRouter capped at $5/month via (1) key credit limit with confirmed monthly (not daily) reset — "a daily $5 cap would permit ~USD 150/month," (2) `SpendLedger` reserving worst-case cost pre-call, (3) explicit `max_tokens` on every paid call.
- Do next time: verify the provider dashboard's reset cadence explicitly, implement pre-call spend reservation (not just post-call accounting), always pass an explicit token ceiling on paid calls.

### 11. A "free" OCR model can be systematically wrong for an untrained language, discoverable only via benchmark against real captured data — and version-pinning drift can mean dev and CI run different engines
- Evidence: `docs/rca/2026-09-25-tech-lead-migros-ocr.md` §1/§2/§4 — `rapidocr-onnxruntime` ships a Chinese-trained recognizer that drops spaces/strips umlauts on German; swapping to `rapidocr==3.9.2` (PP-OCRv6) fixed fused-word names 12→0 and umlaut names 0→18. Separately: `requirements.txt`'s `>=1.2.3` let local (Python 3.14) and CI (Python 3.12) silently resolve two different OCR engine versions.
- Do next time: pin exact ML/OCR dependency versions (not `>=`) when dev/CI may resolve different Python versions; benchmark a free OCR/LLM model against real target-language sample data before integrating.

### 12. Playwright/biome/vitest were used correctly, but "green" required matching discipline — three separate test suites and a documented type-check gotcha
- Evidence: `HANDOVER.md` §9 — three separate suites (pipeline, shared, web-next npm test) plus `npx playwright test` (46 incl. axe), explicitly flagged "easy to forget" (shared suite runs in neither of the others); `CLAUDE.md` lines 137-145 — `npx tsc` from repo root silently runs the wrong binary and prints zero errors while the codebase can be red across a dozen files.
- Do next time: document exact per-package type-check/test commands with an explicit warning against naive root-level invocations; treat "which of N suites does this change touch" as a mandatory checklist item before declaring verified.

---

## 7. Ways of working

### 1. A 19-agent role-based "org chart" (not a workflow-automation layer) worked, but only when Claude Code was launched from the project root
- Evidence: `CLAUDE.md` "Agent Invocation Guide" (19 agents in `.claude/agents/`, table of role/model/purpose); `HANDOVER.md` §7 "Why your 19 agents stopped working" — agents only register when launched from `basketch/`, not a subfolder; a session started in `basketch/web-next/` made all 19 invisible ("Agent type 'architect' not found").
- Do next time: for the insurance project, document the launch-directory requirement in the first line of CLAUDE.md, and keep a duplicate `.claude/agents/` at any subfolder likely to be used as a launch root (as basketch did for `web-next/`). Treat "agent not found" as an environment symptom, not a missing-agent bug.

### 2. When the native agent registry isn't available, agents can be run as general-purpose subagents told to read the role file first — a documented fallback, not an emergency improvisation
- Evidence: `session-summary.md` (top section): "the session started outside the project, so project agents were run as general-purpose subagents told to read `.claude/agents/<name>.md` first, on that file's model."
- Do next time: write this fallback procedure into CLAUDE.md explicitly (which file to read, which model to force) so any coordinator can restore the org chart without losing role fidelity mid-session.

### 3. Every unit of work went through a single closed-loop review protocol with only three exits (accept, escalate, discard)
- Evidence: `CLAUDE.md` "Universal Resolution Loop" — Creator produces → Reviewer reviews → per finding: accept-and-fix, disagree-and-escalate-to-PM, or both-agree-to-discard; "Zero open findings before proceeding to the next phase"; "Re-reviews check ONLY the fixed items."
- Do next time: adopt the same three-exit loop verbatim. The "re-review only fixed items" rule kept review cost bounded across many WP cycles (git log shows WP-P3, WP-C1, WP-C3 etc. each with a code-review round then a "round 2" fixing only flagged items).

### 4. Technical vs. product disagreements were routed to different deciders by rule, not by whoever was loudest
- Evidence: `CLAUDE.md`: "Tech Lead decides technical disagreements... PM decides product disagreements... When Tech Lead and PM disagree, PM has final call (product owner)."
- Do next time: define this routing rule on day one (compliance/actuarial lead vs. product owner) so agents don't stall waiting for the wrong authority or silently resolve a product question themselves.

### 5. Independent RCA by two roles (Architect + Tech Lead), then a mandatory cross-review before any fix, repeatedly caught blockers a single investigator missed
- Evidence: `session-summary.md` §"taxonomy divergence" — cross-review caught that a planned `DELETE FROM taxonomy_category` would hard-fail on an FK violation, and that a cleanup "estimated at under 50 rows" was actually 11,206 of 26,371 (224x off); "Both sides conceded in writing." Same pattern in `docs/rca/2026-09-25-tech-lead-cross-review-and-plan.md` and `docs/rca/2026-09-25-architect-cross-review.md`.
- Do next time: for any nontrivial fix (schema change, financial calc, compliance rule), require two independent investigators to produce separate RCA docs and force a written cross-review before build starts.

### 6. A dedicated audit agent doing a read-only DDD/TDD compliance pass found architectural leaks per-PR review had missed
- Evidence: `docs/rca/2026-09-16-ddd-tdd-audit.md` — found the domain-purity architecture test only fenced 2 of 4 domain-shaped directories (`storage/domain`, `observability/` unguarded), that WP-P5 itself violated the invariants-in-constructors rule it was meant to enforce, and "eleven more" instances of the "unit nothing wires up" defect class beyond the four already fixed.
- Do next time: schedule periodic (not just per-PR) architecture-compliance audits — per-PR review has a blind spot for rules never enforced to begin with.

### 7. A recurring defect class — "a correct unit that nothing wires up" — was named and tracked, making it detectable across ten unrelated incidents
- Evidence: `HANDOVER.md` §4 "The recurring defect class — ten instances" (cache saved once, sweep keyed on fetch not write success, enrichment matched zero rows and reported success, etc.); closing line: "the recurring shape in this codebase is a correct unit that nothing wires up. Always test through the composition root, not only the unit."
- Do next time: maintain a living "defect taxonomy" doc from week one; check new bugs against named prior classes before treating them as novel.

### 8. Coverage theatre was systematically hunted for by name, and several tests found that could pass with the bug still live
- Evidence: `session-summary.md` §"Three tests that could not fail" — an unknown-locale test whose fallback output equaled its lookup output regardless of code path; `HANDOVER.md` §4 "Coverage theatre found" — a test asserting `category === 'dairy'` encoded the very defect it should catch; a "no offer lacks a destination" test passed vacuously (`.some()` on `[]` is `false`).
- Do next time: require mutation testing (reintroduce the bug, confirm red, revert) as a gate for new regression tests — "A guard that has never failed is not yet a guard."

### 9. Cost/spend discipline for the one paid dependency (OpenRouter judge, USD 5/month cap) was enforced three independent ways
- Evidence: `CLAUDE.md` "Legal Constraints" — (1) provider-side monthly credit limit, auto top-up off, read at run start; (2) `SpendLedger` (`transformation/domain/spend.ts`) reserves worst-case cost before a call, settles after; (3) explicit `max_tokens` on every paid call; unknown allowance → run continues without the judge (AP-10).
- Do next time: replicate the three-layer pattern for any paid LLM/API dependency, and make "unknown budget state" fail safe (skip the step), not fail open.

### 10. Adding a paid service, or raising a cap, was reserved as a PM decision recorded in an ADR — engineers could not silently expand spend
- Evidence: `CLAUDE.md`: "Adding a paid service, or raising the cap, is a PM decision recorded in an ADR." Confirmed followed: `session-summary.md` §3 — 41 held commits were only pushed after "the PM confirmed the OpenRouter USD 5 monthly cap was set."
- Do next time: gate spend-affecting changes behind a written owner decision + ADR before merge, not after.

### 11. PM decisions were captured as a dated, numbered decision log per day, each entry tied to the specific open question it resolves
- Evidence: `docs/decisions/2026-09-25-pm-decisions.md` — 18 entries (D-1..D-6, P-7..P-18), each with id, question (with source-doc reference), and the PM's decision close to verbatim (e.g. P-9 on the contact-form email). Same convention in `docs/decisions/2026-09-17-pm-taxonomy-decisions.md`.
- Do next time: use the same per-day numbered decision-log convention; always cite which upstream RCA/design doc question each id answers, and quote the owner's own words.

### 12. When a session started mid-cross-review, work was explicitly paused with zero code changes and nothing committed
- Evidence: `session-summary.md` §"PAUSED mid-cross-review" (2026-09-25) — "no code changed, nothing committed or pushed... Work paused by the PM to free tokens for another project," with the exact resume point recorded.
- Do next time: interrupt multi-agent builds at a phase boundary (before Builder, not mid-fix) and write down the exact resume step.

### 13. Subagent stalls were handled by the coordinator finishing steps directly and re-verifying, rather than blocking the pipeline
- Evidence: `session-summary.md`: "subagents stalled repeatedly (service-side); coordinator finished several steps directly and verified everything." (inferred: no detail on which steps or stall root cause)
- Do next time: document explicitly which steps bypassed normal role division when a coordinator substitutes for a stalled agent, so QA knows what wasn't independently built.

### 14. A deliberate comparison against two external agent frameworks (Osmani skills, GSD) was done to import identified gaps, not to justify the existing setup
- Evidence: `docs/agent-skills-comparison.md` and `docs/gsd-comparison.md` enumerate "what GSD/Osmani has that basketch doesn't" — fresh-200K-context-per-plan to avoid context rot, wave-based parallel execution, formal STATE.md/HANDOFF.json session persistence, atomic per-task commits — as concrete adoption candidates.
- Do next time: budget an early comparison pass against 1-2 external agent/workflow frameworks and list gaps to adopt; basketch flagged context-rot management and structured session handoff as gaps it never actually closed — consider adopting those directly instead of rediscovering the need mid-project.

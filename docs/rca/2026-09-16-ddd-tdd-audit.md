# DDD / TDD discipline audit — everything merged 2026-09-16

**Auditor:** Solution Architect agent · **Date:** 2026-09-16 · **Mode:** read-only, no code changed.
**Scope:** the thirteen work packages merged today (P1, W2, C1, P2, W3, C2, P3, P4, P6a, C3, P5, #3, #4),
plus C4 (built, unmerged, `worktree-agent-a4bcf43deba09aa1d`) and W4 (in progress).
**Method:** file-level reading against `CLAUDE.md` §DDD / §TDD and `docs/rca/2026-09-15-final-plan.md`
(rulings D1–D6, T1–T2, and the per-WP TDD plans). No code was executed; mutation claims below are
reasoned from the source, and each one names the file and line a reader can check.

---

## 0. Verdict in one paragraph

The **domain purity** rule holds in practice but is enforced over only half the domain. The
**invariants-in-constructors** rule holds for every value object that was in scope before today, and is
**broken by WP-P5 itself** — the one new policy type it introduced states its factory rule in a doc
comment and is then hand-assembled 80 lines away, in the same work package. The **test-first** evidence
is genuinely strong: five of the six packages I mutation-reasoned would go red if the fix were reverted,
and in two places the builder wrote a *second* test specifically to isolate a clause the headline test
could not catch. The **"correct unit nothing wires up"** class was **not closed** — four instances were
fixed today and I found **eleven more still in the tree**, one of which (the alert layer) means WP-P3
shipped an exit path that cannot fire in production while a green test says it can. The **layering is two
designs stitched together**, and the seam has already cost something real: WP-W3 carried half of WP-W2's
rule to the second read surface and left the member-price half behind, which is a live CLAUDE.md §Legal
breach on the landing page today.

---

## 1. Is the domain still pure?

### 1.1 What the architecture tests actually enforce

`pipeline/collection/domain/architecture.test.ts` is a good test. It checks no-infrastructure-import,
no-application-import, no node builtin, no third-party package, no `fetch(`, no `createClient(`, a
retailer-vocabulary blocklist, and it guards itself against vacuity
(`:67-70`, `expect(domainFiles.length).toBeGreaterThan(8)`).

**But its fence covers two of four domain-shaped directories, and pins that number.**

```
architecture.test.ts:27   DOMAIN_DIRS = [collection/domain, transformation/domain]
architecture.test.ts:69   expect(DOMAIN_DIRS.length).toBe(2)   // collection + transformation
```

Not covered:

| Directory | What lives there | Touched today |
|---|---|---|
| `pipeline/storage/domain/` | `stale-sweep.ts`, `product-key.ts`, `deal-row.ts`, `offer-to-unified.ts` | **all four** (P1, P2, C2, C4) |
| `pipeline/observability/` | `healthcheck-ping.ts`, `revalidate-webhook.ts` | P3 |

The file's own comment (`:24-26`) says a new domain directory "must be added here — otherwise it silently
escapes enforcement, which is how transformation/domain went unchecked when it was first created." That
is exactly what happened again: `storage/domain` was created, four files were added to it today, and
nobody added it to the list. The `toBe(2)` assertion means adding it is a deliberate act, not an
accident — which is better than nothing, but today the result is that **the directory that holds the
most destructive logic in the pipeline (`sweepPlan`) is outside the fence.**

`web-next/src/lib/domain/architecture.test.ts` is scoped to `src/lib/domain` only (`:18`). That is the
right scope for what it claims, and it adds a rule the pipeline version lacks — no relative escapes out
of the domain folder (`:76-85`). Good.

**No live violation exists.** I read every file in `storage/domain`: `stale-sweep.ts` and
`product-key.ts` import nothing at all; `deal-row.ts` and `offer-to-unified.ts` import only
`collection/domain/*`. The gap is in the guard, not in the code — for now.

### 1.2 File-by-file placement verdict for today's new domain files

| File | Belongs where it sits? | Evidence |
|---|---|---|
| `collection/domain/quantity-requirement.ts` (C4, unmerged) | **Yes, with one exception.** Pure, `Result`-returning, n≥2 in the constructor (`:37-42`). | **`describeQuantityRequirement` (`:49-51`) does not belong.** It returns a hardcoded English string `from ${count} items` on a site that ships en/de/fr/it, and **has no caller anywhere in the worktree.** Presentation in the domain, and dead. Delete or move before C4 merges. |
| `storage/domain/product-key.ts` (P2) | **Yes, and for a named reason.** Its header (`:1-7`) says it was extracted from `store.ts` precisely so the application layer could import it without transitively constructing the real Supabase client at module load. That is the correct DDD motivation, stated correctly. | `run-pipeline.ts:44` imports it; `store.ts:10` does too. |
| `storage/domain/stale-sweep.ts` `sweepPlan` (P1) | **Yes.** Pure, no I/O, takes counts in and returns a plan. Folding the store-level and window-level decisions into one function (`:9-17`) is the right consistency-boundary argument. | Fed from `run-pipeline.ts:439-443`; turned into a query by `store.ts:212-233`. |
| `storage/domain/stale-sweep.ts` `rowsToSweep` (P1) | **No — this is test scaffolding in production code.** `:231-260` is explicitly "a pure fake that APPLIES a plan — for outcome-based tests". It hand-mirrors the four-clause predicate `store.ts:212-222` sends to Postgres. | Two definitions of the same predicate that nothing forces to agree. If `sweepStoreWindows` gains or loses a clause, `rowsToSweep` still passes. Move it into `stale-sweep.test.ts`, or derive both from one shared predicate. |
| `transformation/domain/resilience.ts` `ModelCallPolicy` pieces (P5) | **Yes as a location** — pure decisions, adapter waits (`:17`). | See §2.2: the type itself is unenforceable. |
| `transformation/domain/model-registry.ts` `createModelCallPolicy` (P5) | **Yes as a location, no as an invariant.** See §2.2. | `:172-176` states the rule; `model-probe.ts:40-47` breaks it. |
| `web-next/src/lib/domain/validity.ts` (W2) | **Yes, and it is the best-argued file merged today.** `todayInZurich` is the only function touching the clock; `isInEffect`/`startsAfterToday` take `today` as a string and stay pure (`:22-25`). The `formatToParts` choice is justified rather than assumed (`:39-49`). | — |
| `web-next/src/lib/domain/votes-in-verdict.ts` (W2) | **Yes.** Structural `Votable` type instead of `Deal` (`:5-15`) keeps `lib/domain` dependency-free, which is what makes the same predicate legal in a client component. One rule, two call sites (`algorithm.ts:23`, `filter-deals.ts:298`). | This is the single best piece of DDD in the set. |

---

## 2. Are the invariants in constructors, or in callers?

### 2.1 The six CLAUDE.md invariants — all enforced at construction

| Invariant | Where | Bypassable by a caller? |
|---|---|---|
| `salePrice > 0` | `offer.ts:68` | No |
| ALDI rule (`originalPrice === null ⟺ discount === null`) | `offer.ts:78-80`, and `discount = null` is the only reachable value when `originalPrice === null` (`:82-106`) | No |
| `originalPrice > salePrice` | `offer.ts:85-89` | No |
| `validTo >= validFrom` | `validity-period.ts:31` | No |
| `ProductImage` exactly one of SourceUrl \| CropRegion | `product-image.ts` (union type) | No |
| LIDL rule (member price names its programme) | `price-basis.ts:22-24` **and re-checked at the aggregate** `offer.ts:112-114` | No — and the belt-and-braces re-check is the right pattern |

`printedDiscount`'s `priceStepRappen` (C2) is validated at construction with a domain-owned ceiling:
`discount.ts:59-63` rejects a non-integer, ≤0, or >`MAX_PRICE_STEP_RAPPEN` (10). The union
`PrintedDiscount | DerivedDiscount` (`:29-42`) makes "a derived discount carrying a rounding grid"
**unrepresentable** rather than merely checked — that is the correct DDD move, and the comment says so
honestly (`:39-41`).

`minimumQuantity(n≥2)` (C4): enforced in `quantity-requirement.ts:38-40`, **and re-enforced at the
aggregate** in `offer.ts:132-135` of the worktree, with a comment explaining why the second check exists.
This is exactly right, and it matters for §2.2 — the team demonstrably knows the technique.

### 2.2 FINDING — `ModelCallPolicy`'s invariant is prose, and WP-P5 breaks it in WP-P5

`transformation/domain/model-registry.ts:172-176` states:

> Built only by `createModelCallPolicy`, never assembled by hand at a call site — **the invariant below
> must hold everywhere a policy exists, not just where someone remembered to check it.**

`ModelCallPolicy` (`:178-185`) is a plain structural type. Nothing stops an object literal. And eighty
lines away, in the same work package:

```
pipeline/transformation/infrastructure/model-probe.ts:39-48
function probeGate(spec: ModelSpec): ModelGate {
  return createModelGate({
    modelId: spec.id,
    provider: spec.provider,
    requestsPerMinute: 60,        // ← a number that exists in no registry entry
    requestsPerDay: null,         // ← the model's real cap is 1000
    maxInFlight: 1,
    retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 },
  })
}
```

Two consequences, and the second is the one that matters:

1. `createModelCallPolicy`'s validation never ran on this policy. `60` happens to pass `> 0`; the point
   is nobody checked.
2. **WP-P5's central architectural claim is now false.** `model-http.ts:30-33` says making the gate
   required "turns *every caller of a model shares that model's quota* into a property of the code, not a
   habit." The probe calls the **same** `(google, gemini-3.5-flash-lite)` pair the production gate limits
   to 15 req/min, through a **different** gate that believes it may do 60/min with no daily cap. Google's
   quota is per (project, model). The property does not hold.

And the test **documents the exception instead of failing on it**:

```
pipeline/composition.test.ts:88
expect(fetchCalls).toBe(15) // 14 model calls + 1 startup probe (its own, separate gate)
```

Blast radius today is one call per run, so this is not a live outage. It is a **discipline** finding, and
a high-ranked one, because (a) the very next `postJson` call site will copy `probeGate`, and (b) C4 shows
the correct fix was already in the team's hands the same day: make the type unforgeable (a branded field
only `createModelCallPolicy` can set), or re-enforce inside `createModelGate` the way `createOffer`
re-enforces `minimumQuantity`.

### 2.3 `isInEffect` / `votesInVerdict` — enforced, with one soft edge

Both are pure predicates, not constructors, so "bypassable" means "is there a read path that does not
call them". I traced every one:

- `server/verdict/algorithm.ts:23` — `votesInVerdict` ✅
- `server/data/filter-deals.ts:298` (`pickPrimary`, the "Cheapest" tag) — `votesInVerdict` ✅
- `server/data/filter-deals.ts:224` (`onlyStoreSubCategories`) and `:266` (`onlyStoreBadgeStore`) —
  `isInEffect` only, **deliberately**: the "Only at X" claim is about availability, not about who may pay.
  The reasoning is written out at `:242-257` and is sound.
- `server/data/supabase-provider.ts:164` — `todayInZurich()` ✅
- `components/list/ItemNote.tsx:28`, `app/[locale]/deals/DealsClient.tsx:147,154`,
  `components/list/ListDrawer.tsx:194`, `lib/share.ts:55,80` — all through the domain ✅
- **`server/data/worth-picking-up.ts` — `isInEffect` yes (`:68`), `PriceBasis` NO.** See §5.2. This is
  the bypass.

Soft edge: `votesInVerdict` takes `Votable.priceBasis: PriceBasis` (non-optional) but calls
`isMemberOnly`, which accepts `undefined` and reads it as "not member-only"
(`price-basis.ts:66-68`). `createPriceBasis`'s "claims less" rule (`:30-41`) is right for *display* and
wrong for *voting*: an unknown basis should not be allowed to decide a category winner. Low severity —
the CHECK constraint means it should not arrive — but it is the one place the two rules disagree.

---

## 3. Was it really test-first, and do the tests bind?

I cannot see authorship order, so I judged by three observable proxies: (a) does a test exist named after
the real defect, (b) would reverting the fix turn it red, (c) did the builder write a *second* test to
isolate a clause the first one could not reach — which is very hard to produce except by actually running
the mutation.

### Sample 1 — WP-P1, sweep scoped to the publication window · **BINDS, with a caught subtlety**

Named test: `stale-sweep.test.ts:78`, *"a next-week flyer does not deactivate this weeks deals"*.

**Reverting the range clause alone would NOT turn that test red.** Reasoned: delete the range bound in
`candidateWindows` (`stale-sweep.ts:172-182`) so every live window becomes a candidate. For the fixture
(written 17.9:70, 21.9:57; live 08.9:143, 17.9:70, 21.9:57), `08.9` then falls to clause (b) and needs
`rangeShareOk`: written-in-range 127 vs live-in-range 270 → 0.47 < `MIN_REFRESH_SHARE` 0.5 → **false** →
08.9 still not swept → **green**. The headline test is protected by the *share* clause, not the *range*
clause it is named for.

The builder found this. The very next test, `:93-105`, is constructed precisely to isolate it — written
17.9:100, live {08.9:10, 17.9:100}, so the aggregate share is a healthy 100/110 and *only* the range
clause can exclude 08.9. Delete the range bound and **that** test goes red. Its comment says so in as
many words. That is real mutation testing, not a claim of it.

Also verified: the real Postgres query is asserted, not only the in-memory mirror —
`store.test.ts:267-272` pins `.gte`, `.lte` and `.in` on `valid_from` and asserts `'2026-09-08'` appears
in none of them.

### Sample 2 — WP-P3 + WP-P4, deadline / exit codes / legacy retirement · **BINDS, exceptionally**

`config.test.ts` is the strongest test file in the repo. It is honest about its own past failures
(`:9-13`: a reviewer deleted `retry_on_exit_code`, `new_command_on_retry` and `PIPELINE_FINAL_ATTEMPT`
and both tests then in existence stayed green), and every load-bearing key now has its own
**line-anchored** assertion (`:147-156` explains why an unanchored regex matched the file's own prose).
`:199-219` asserts the real inequality
`RUN_DEADLINE_MS + MAX_CHUNK_MS + WRITE_TAIL_MS + SAFETY_MARGIN_MS ≤ timeout_minutes`, and says outright
that the trivially-true `RUN_DEADLINE_MS < timeoutMs` version "would have passed the whole time the old
35-minute deadline was unsafe — the exact coverage-theatre shape HANDOVER §4 warns about."
`:143-145` closes the one remaining hole: `RUN_TIMEOUT_MS` is now compared to the real YAML.

Mutation: set `timeout_minutes: 45` → `:133` and `:143` and `:200` all red. Restore the aktionis artifact
read → `:186-191` red. Both bind.

### Sample 3 — WP-P5, ModelGate shared quota · **BINDS through the composition root**

`composition.test.ts:41-97` builds the **real** adapters via `createProductionDeps`, fires 5 classifier +
1 reflector + 8 enricher calls (14, one over `floor(15 × 0.9) = 13`), and asserts exactly one `sleep`
happened. Mutation: give the enricher its own gate → three independent `RateState`s, none reaches 13,
`sleeps` is empty → red. It also asserts `runLog.some(m => m.includes('waiting'))`, which is the F1 fix
(the gate's log wired to the run's logger) — revert `buildGate`'s `{ log, ...overrides }`
(`composition.ts:120`) to `overrides` alone and that assertion goes red. This is the "test through the
composition root" discipline the plan asked for, delivered.

**But see §2.2** — the same test's line 88 records the probe's separate gate as expected behaviour.

### Sample 4 — WP-P6a, caching uncertain outcomes · **BINDS**

`classify-deals.test.ts:184-206` runs the same product twice against one `createInMemoryCache` with a
counting judge, asserting `judgeCalls` stays 1 and run 2 reports `cacheHits: 1`. Mutation: drop
`uncertainWithClassification` from `toCache` (`classify-deals.ts:216-242`) → run 2 is a miss, judge fires
again → red on two assertions. The companion at `:208` pins the exclusion (a provider-failure
`uncertain` carries `classification: null` and must not be memoised). Both halves of the Tech Lead's D4
scope are bound.

### Sample 5 — WP-C2, per-retailer rappen grid · **BINDS, and closes a hole a reviewer opened**

`price-step-property.test.ts` exists *because* a reviewer mutated Denner 1→5, Volg 5→1, Spar 5→25 and
Migros 5→50 and "left all 1,156 tests green" (`:3-5`). It now parses each adapter's committed fixture and
asserts every real sale/original price is an exact multiple of the declared step. Mutation: widen any
`*_PRICE_STEP_RAPPEN` past the retailer's real granularity → off-grid prices listed in francs → red.

**Gap:** ALDI and LIDL are absent from the property test. Both declare the constant
(`aldi-flyer-source.ts:57`, `lidl-flyer-source.ts:70`) and neither calls `printedDiscount` today, which
the files document. So the constants are **declared and read by nothing**, and unverified. The day
someone wires ALDI's printed badge, the property test will not cover it. Add two `it.skip`-with-a-reason
lines, or delete the constants until they are used.

### Sample 6 — WP-W2/W3, validity in the web · **UNIT TESTS BIND; THE END-TO-END PROOF DOES NOT**

Unit level is good. `validity.test.ts` covers both DST transitions (`:47-48`) and the 00:30-Zurich case
(`:20-25`); mutation to `toISOString().slice(0,10)` goes red, **and** `no-utc-date-derivation.test.ts`
catches the source-level revert independently. `algorithm.test.ts:173-179` and
`votes-in-verdict.test.ts` bind the integration. `worth-picking-up.test.ts:104` even names the vacuity
trap in its own comment.

**The end-to-end level does not bind, and W2/W3 made that worse.** All nine
`test.skip(count === 0, …)` / `test.skip(status >= 400, …)` assertions the plan flagged as a standing
weakness are still present: `web-next/e2e/v2-acceptance.spec.ts:53, 96, 161, 197, 227, 242, 258, 323,
375`. The plan said, before W2 merged: *"WP-W2/W3 make this likelier to bite, because their whole purpose
is that fewer deals qualify."* W2 and W3 merged; the ticket did not. **The only test that proves the live
site renders anything turns green by skipping in exactly the scenario the two packages just made more
likely.** A run that reports "46 passed / 14 skipped" is not evidence.

### Tests that would pass with the defect restored — one, and it is serious

**`run-pipeline.test.ts:311-324`, "produces alert-failed when a critical alert fires".**

The test passes only because it injects `statefulClock([1_000, 1_000 + 9 days])` — a `now()` that returns
two values nine days apart on two successive calls. In production `evaluateAlertsStep`'s `now` defaults
to `Date.now` (`run-pipeline.ts:521`), so `snapshot.finishedAtMs` and `nowMs` are microseconds apart and
`pipeline-stale` (`alerts.ts:84`) can never fire. Every other critical rule is keyed on a field
`run-pipeline.ts:526-537` hardcodes:

```
invalidCategoryRejected: 0       →  warning-only rule, cannot be critical
benchmarkMacroF1: null           →  classifier-regression unreachable (alerts.ts:104)
publishedDataCoverage: {}        →  source-shape-changed unreachable (alerts.ts:124)
halted: null                     →  run-halted unreachable (alerts.ts:94)
previous: null (line 542)        →  every comparison rule unreachable
```

So **`shouldFailRun` cannot return `true` in production**, `finishRun` can never return
`'alert-failed'`, and `exitCodeFor`'s mapping of it to exit 1 (`run-pipeline.ts:160-162`) is dead code.
AP-7 — "critical alerts fail the run immediately (no report-only week)" — is **not delivered**, and a
green test in the package that was supposed to deliver it says otherwise.

To the builder's credit, the comment at `run-pipeline.ts:516-520` and the test comment at `:314-317` both
state this plainly and point at WP-P7. It is honestly documented. It is still a test that passes while
the condition it names cannot occur, which is the precise shape HANDOVER §4 calls coverage theatre.

---

## 4. Did "a correct unit that nothing wires up" get closed, or moved?

Four instances were closed today, and I verified each:

| Caught today | Now |
|---|---|
| sweep guard reading at most 1,000 rows | **Closed properly.** `store.ts:383-426` paginates with `{ count: 'exact' }` and treats a page/total mismatch as *unreadable*, not as "that's all there is" (`:417-423`). The reasoning at `:355-379` about a server-side `db-max-rows` below 1,000 is the right paranoia. |
| `degraded` written and read by nothing | **Closed at the domain/application seam.** `collect-offers.ts:140-142` flips `trace.status`; `json-telemetry.ts:49,67,105,121` surfaces it. **Partially open downstream** — see #6 below. |
| the gate's log never wired | **Closed.** `composition.ts:119-121`, asserted at `composition.test.ts:96`. |
| the alert snapshot fed literals | **Open.** Six of seven fields are still literals. See §3. |

**Eleven more instances are still in the tree.** Ranked by what the next defect will cost.

1. **The whole alert layer is inert** (§3). `run-pipeline.ts:526-542`. Cost: the next silent-success
   regression is invisible in exactly the way the project's founding failure was, and the run will report
   exit 0.

2. **`createJsonTelemetry` is built, tested (~170 lines of tests including the `$GITHUB_STEP_SUMMARY`
   markdown renderer) and constructed by nothing.** `run-pipeline.ts:251` calls
   `collectOffers(deps.sources(...), week, { timeoutMs: 600_000 })` — no `telemetry`, so
   `collect-offers.ts:106` falls back to `noopTelemetry`. Production instead uses `logCollectionTrace`
   (`run-pipeline.ts:205-214`), which prints `ok` for a **degraded** source and never names which one.
   So WP-C3's guard fires, sets the flag, flips the aggregate status — and the operator sees
   `ok  coop  920 offers` with a bare `· degraded` on the summary line and no way to tell which retailer.
   Cost: the aktionis-markup-change scenario the guard exists for is detected and unattributable.

3. **`hasPublishedData` (`source-attributes.ts:202`) has no production caller — and it is precisely what
   `publishedDataCoverage: {}` needs.** Three correct units — the per-offer predicate, the
   `source-shape-changed` alert (`alerts.ts:124-134`), and the snapshot field — exist, are tested, and
   the wire between them is a literal `{}`. Cost: "a source can change shape while offer counts stay
   perfectly healthy" (the failure `alerts.ts:11-12` names) is undetectable.

4. **`benchmark.ts` in full — `macroF1` (`:66`), `scoreBenchmark` (`:137`) — no production caller**,
   while `alerts.ts:104` keys `classifier-regression` on `benchmarkMacroF1`. AP-6 deliberately leaves the
   metric `not-measured`, so this is a *sanctioned* gap; it still means the second of two critical alerts
   is structurally unreachable and the module is carrying its own test suite for nothing.

5. **`similar-products.ts` in full** — `tokenise`, `brandToken`, `similarity`, `buildIndex`,
   `MIN_SIMILARITY`, `findSimilar`, `renderExamples` (`:39-147`). No production caller anywhere. ~150
   lines plus a test file. Nothing references it from `classification-prompt.ts` either.

6. **`withinLatencyBudget` (`resilience.ts:432`) and `KNOWN_LIMITS` (`:185`) — no production caller.**
   `KNOWN_LIMITS` is worse than dead: `model-registry.ts:31-37` says its `requestsPerMinute` is "the same
   figure as `resilience.ts`'s `KNOWN_LIMITS` — this is the one place it turns into a gate." Two copies
   of the same measured number, one of them read by nobody, nothing forcing them to agree.

7. **`isActiveOn` / `hasExpiredOn` (`validity-period.ts:36,40`) — no production caller.** The pipeline
   has had an "in effect" predicate on its own `ValidityPeriod` value object the whole time. RCA §1.3
   why#5 identified that the sweep "decides *which stores*, never *which rows*", and WP-P1's fix decides
   which rows using **raw `YYYY-MM-DD` string comparison** (`stale-sweep.ts:179`) rather than the domain
   predicate that already exists. Two definitions of "in effect" in the pipeline, plus a third in the
   web. Cost: the next date rule gets written a fourth time.

8. **`run.ts:51-54` exits 1 without pinging the dead-man switch**, contradicting the comment it sits
   below (`:38`: "the dead-man ping fires on every exit — success or not"). A thrown error skips
   `pingHealthcheck` entirely, so healthchecks.io reads a *crashed* run as merely *late* for the whole
   grace period. `run.ts` has no test file. Cost: AP-5's whole point — noticing a run that did not
   happen — is defeated by the failure mode most likely to make it not happen.

9. **`ALDI_PRICE_STEP_RAPPEN` / `LIDL_PRICE_STEP_RAPPEN` declared, read by nothing**, and outside the
   WP-C2 property test (§3, sample 5).

10. **`rowsToSweep` (`stale-sweep.ts:250`) — production code with only test callers**, duplicating the
    Postgres predicate (§1.2).

11. **Unused value-object helpers**: `addMoney`, `isCheaperThan`, `equalsMoney`, `formatMoney`
    (`money.ts:45-60`), `formatDiscount` (`discount.ts:127`), `describePriceBasis` (`price-basis.ts:33`),
    `isDisplayable` (`classification.ts:113`), `evaluatePromptChange` (`run-plan.ts:178`).
    Plus `web-next/src/server/data/concepts.ts` — imported by nothing (pre-existing; `filter-deals.ts:205`
    explains the concept layer is unpopulated).

**Answer to the question: the class was reduced, not closed.** Today's reviews were genuinely effective —
they caught four live instances and the fixes are sound. But the tree still contains roughly 600 lines of
tested, correct, unreachable code, and two of those units (the alert snapshot, `hasPublishedData`) sit on
the *observability* path, which is the one place where being unwired is undetectable by definition.

---

## 5. Is the layering coherent, or two designs stitched together?

**Two designs, and the seam is now visible in five places.** After P5 and P2 they agree on *dependency
direction* but not on *what a module is*.

### 5.1 The five seams

**Seam 1 — four domain directories, one fence, one flat legacy layer with no name.**
Collection and transformation are DDD-by-import-direction and guarded. `storage/domain` and
`observability/` are DDD-shaped and unguarded (§1.1). And `pipeline/*.ts` — `store.ts`, `categorize.ts`,
`product-resolve.ts`, `resolve-taxonomy.ts`, `v3-cutover.ts`, `grocery-filter.ts`, `product-metadata.ts`,
`supabase-client.ts` — is an unlabelled flat layer that is *de facto* infrastructure (`store.ts` builds a
Supabase client at module load) but is not called that anywhere. P2 worked around it correctly
(`product-key.ts` extracted so `run-pipeline.ts` imports no Supabase; `run-pipeline.ts:41` imports only
*types* from `./store`), but the workaround is invisible: nothing stops the next application-layer import
from pulling in a live client.

**Seam 2 — two observability designs in one pipeline.** Collection has a `Telemetry` **port**
(`application/telemetry.ts`) with a JSON **adapter** (`infrastructure/telemetry/json-telemetry.ts`) and a
`noopTelemetry` default. Transformation has no port at all — it threads a `log: (m: string) => void`
callback through `ClassifyDealsDeps.log`. Both are defensible; having both, with the good one unwired
(§4 #2), is not. WP-P7 has to pick one.

**Seam 3 — three definitions of "today", one of them still UTC, in the module the RCA was about.**

```
web-next/src/lib/domain/validity.ts:50   Intl en-CA + formatToParts, Europe/Zurich   ← the canonical one
pipeline/store.ts:177                     Intl sv-SE format, Europe/Zurich            ← deactivateExpiredDeals
pipeline/store.ts:385                     new Date().toISOString().slice(0, 10)       ← UTC. Feeds activeCountsByWindow
```

`store.ts:385` is the exact line `no-utc-date-derivation.test.ts` exists to forbid — but that guard's
`GUARDED_DIRS` (`:18`) is `web-next/src/server` and `web-next/src/lib` only. It does not cover
`web-next/src/app`, `src/components` or `src/stores` (all of which read dates), and it does not cover the
pipeline at all. **Severity: low, because it errs safe** — a UTC `today` is ≤ the Zurich one, so
`.gte('valid_to', today)` counts *more* rows as live, which makes the share guard *more* restrictive.
But it is the same root cause the RCA named, left live, in the file the RCA was about, two hours of every
day.

**Seam 4 — the transformation domain imports the collection domain.**
`resilience.ts:19-20` and `model-registry.ts:17-18` import `../../collection/domain/result`. That is a
shared-kernel relationship and it is fine, but it is not declared anywhere: `result.ts` sits inside the
*collection* module's domain while serving both. If collection is ever extracted, this breaks silently.
One line in `CLAUDE.md` naming `collection/domain/result.ts` as the shared kernel would close it.

**Seam 5 — `model-http.test.ts`'s "no direct fetch" fence covers `transformation/infrastructure` only**
(`:266`, `INFRASTRUCTURE = join(import.meta.dirname, '.')`). That is the correct scope for its claim, but
it means the repo has three separate hand-rolled architecture tests
(`collection/domain/architecture.test.ts`, `model-http.test.ts`, `web-next/.../architecture.test.ts`) with
three different directory lists and three different `sourceFiles` implementations. Each guards the guard
against vacuity — good — but nothing guards that the *union* of the three covers the whole tree. It
doesn't.

### 5.2 The seam has already cost something — and it is live right now

**WP-W3 carried one of W2's two rules to the second read surface.**

WP-W2 established, and CLAUDE.md:223 now states, that a deal must clear **two** rules before it may
decide anything: in-effect, and member-price-labelled. `server/data/supabase-provider.ts` applies both —
`todayInZurich()` at `:164`, `createPriceBasis(row.price_basis, row.loyalty_programme)` at `:90`.

`server/data/worth-picking-up.ts` — the "Worth picking up" module on the landing page — applies **only
the first**. I checked both of its read paths:

- Personal path: `.select('concept_id, deal_store, deal_id, deal_price, deal_regular_price,
  discount_percent, valid_from, valid_to, interest_signal, interest_added_at')` (`:105-107`). No
  `price_basis`, no `loyalty_programme`.
- Cold-start path: `ColdStartRow` (`:172-185`) — same omission.
- `grep -n 'price_basis\|loyalty' worth-picking-up.ts` → **no matches**.
- `grep -rn 'priceBasis\|price_basis\|loyalty' web-next/src/components/landing/` → **no matches**.

So a **Lidl Plus member price can render on the basketch home page with no member label.** CLAUDE.md
§Legal makes this binding — *"always label member-only prices (Lidl Plus, Supercard, Cumulus)"* — and
`price-basis.ts:9-10` names it as the Art. 3(1)(e) UWG exposure the whole value object exists to prevent.
The ACL (`createPriceBasis`) exists, is correct, is well tested, and one of the two read paths into the
site does not call it. **This is the defect class, in the newest code, on the most-visited surface.**

It is fixable in one line of `select` plus one label, and it should be W4's first commit, not W4's last.

### 5.3 Does the incoherence matter for P6, P7, P8, P9, J1, J2, J3?

| Package | Blocked or endangered by which seam |
|---|---|
| **P6** (judge concurrency) | Seam 5 is fine here — `maxInFlight` is the declared seam and `model-gate.ts:31-33` names it. **But §2.2 bites**: P6 raises `JUDGE_CHAIN[0].maxInFlight` to 4, and `probeGate` will still fabricate its own. Fix `ModelCallPolicy` **before** P6, it is a 10-line change. |
| **P7** (run journal + alerts) | **Most endangered.** It must resolve seam 2 (which telemetry design wins), fix all six literals in `evaluateAlertsStep`, wire `hasPublishedData` → `publishedDataCoverage`, and decide whether `createJsonTelemetry` is the renderer or is deleted. If P7 ships without turning `shouldFailRun` reachable, AP-7 remains undelivered for a second package in a row. |
| **P8** (spend guard) | Depends on `ModelCallPolicy` gaining a spend field. Ship the branded-type fix with P8 at the latest — `model-gate.ts:35-40` already names this as the seam. |
| **P9** (enrichment completion) | Clean. `classification-cache.ts` and `classify-deals.ts` are internally consistent, and `needsEnrichment` is properly wired (`classify-deals.ts:406`). |
| **J1/J2** (editions, fetch ledger) | **Seam 1 bites.** `editionFor` and `decideFetch` are new domain files going into `collection/domain` (guarded ✅), but the ledger's in-memory adapter plus a shared contract test will want a home, and `storage/domain` is the precedent — which is outside the fence. Add `storage/domain` to `DOMAIN_DIRS` before J1, not after. |
| **J3** (collect/transform split + daily cron) | **Seam 1 is a real risk.** J3 serialises `Offer[]` to an artifact and rebuilds it through `createOffer` in a separate job. If any non-domain field leaks into that serialisation, the ACL is bypassed at the module boundary. The one thing that would make this safe — a test asserting nothing constructs an `Offer` except `createOffer` — does not exist (§2.2, same root cause). |

---

## 6. What is not good enough — ranked by cost when the next defect lands

| # | Finding | Cost | Fix size |
|---|---|---|---|
| 1 | **The alert layer is inert; WP-P3 shipped an unreachable exit path with a green test.** `run-pipeline.ts:526-542`; `run-pipeline.test.ts:311-324`. AP-7 undelivered. | The next silent-success regression reports exit 0 and nobody hears about it — the founding failure, repeated. | P7 (already scoped) — but state in P7's ADR that AP-7 was *not* delivered by P3. |
| 2 | **Member prices are unlabelled on the landing page.** `worth-picking-up.ts:105-107, 172-185` never read `price_basis`. Live now. | CLAUDE.md §Legal breach; Art. 3(1)(e) UWG. | One `select` + one label. Do it first in W4. |
| 3 | **`ModelCallPolicy`'s factory rule is prose and is already broken by `probeGate`.** `model-registry.ts:172-176` vs `model-probe.ts:40-47`. P5's "shared quota" property does not hold. | The next `postJson` caller copies `probeGate`; the P8 spend gate inherits an unvalidated policy. | Brand the type, or re-validate inside `createModelGate`. ~10 lines. Before P6. |
| 4 | **Nine e2e assertions still skip on an empty page**, immediately after two packages whose purpose is to make the page emptier. `v2-acceptance.spec.ts:53,96,161,197,227,242,258,323,375`. | A site rendering zero cards produces a green CI run. The one end-to-end proof is unfalsifiable exactly when it matters. | Replace `test.skip(count === 0)` with `expect(count).toBeGreaterThan(N)`. Half a day. |
| 5 | **`storage/domain` (P1's and C4's home) is outside the architecture fence**, and the fence pins itself at 2 directories. `architecture.test.ts:27,69`. | J1/J2's ledger and edition code will land there next and inherit no guard. | Add the directory, bump the count. 2 lines. |
| 6 | **`createJsonTelemetry` is fully built, fully tested, constructed by nothing**; production uses a logger that prints `ok` for a degraded source. `run-pipeline.ts:251`, `collect-offers.ts:106`. | The WP-C3 guard fires and the operator cannot tell which retailer degraded. | Pass a telemetry instance from `composition.ts`, or delete the adapter. P7's call. |
| 7 | **~600 lines of tested, correct, unreachable domain code** (§4 items 3–7, 9–11), including `hasPublishedData` — the exact input the `source-shape-changed` alert needs. | Every one is a future reader's false confidence, and two of them sit on the observability path where being unwired is undetectable. | Wire `hasPublishedData` (P7). Delete `similar-products.ts`, `withinLatencyBudget`, `KNOWN_LIMITS`, the unused Money/Discount helpers. Read-before-delete rule applies. |
| 8 | **`run.ts`'s catch path skips the dead-man ping.** `run.ts:51-54` vs the comment at `:38`. No test on `run.ts`. | A crashed run reads as "late", not "failed", for the whole healthchecks.io grace period. | 3 lines, plus the first `run.test.ts`. |
| 9 | **Three definitions of "today", one still UTC in the sweep's input** (`store.ts:385`), and the guard that forbids it covers neither the pipeline nor `web-next/src/app|components|stores`. | Errs fail-safe today, so low — but it is the RCA's own root cause, left live in the RCA's own file. | Use the Zurich helper; widen `GUARDED_DIRS`; add a pipeline copy of the guard. |
| 10 | **`rowsToSweep` is a hand-written mirror of a Postgres predicate, living in production code.** `stale-sweep.ts:231-260` vs `store.ts:212-222`. | The mirror keeps passing after the real query changes. | Move to the test file, or derive both from one predicate. |
| 11 | **C4 must not merge before W4.** Nothing on `main` reads `min_quantity` (verified: zero matches in `web-next/src`). `describeQuantityRequirement` (worktree `:49`) is dead English-only presentation in the domain. | A conditional Migros price published bare is the exact Art. 3(1)(e) failure `quantity-requirement.ts:17-21` says the module exists to prevent. | Merge C4+W4 together, or land W4's label first. Delete `describeQuantityRequirement`. |

---

## 7. What is genuinely good — so the PM can calibrate

This is not a failing audit, and saying so precisely matters as much as the findings.

- **Every one of the six CLAUDE.md invariants is enforced at construction**, and two of them
  (`Discount`'s union, `PriceBasis`'s union) are enforced by making the bad state *unrepresentable*
  rather than merely rejected. That is a level above what the method asks for.
- **`stale-sweep.test.ts:93-105` and `config.test.ts:199-219` are proof that mutation testing actually
  happened.** Both exist only because the headline test was found to survive the mutation it was named
  for. You cannot fake that artefact.
- **`config.test.ts` and `price-step-property.test.ts` both document the reviewer mutation that created
  them**, in the file, with the count of tests that stayed green. That is the right way to record a
  near-miss.
- **`composition.test.ts:41-97` is a genuine composition-root test** — real adapters, real wiring, a
  scripted clock, counting requests. WP-P2's stated purpose was to create that seam and it delivered.
- **`activeCountsByWindow`'s pagination fix** (`store.ts:355-423`) reasons past the obvious fix to the
  server-side `db-max-rows` case, and treats "we don't know" as unreadable rather than empty. That is the
  `MIN_REFRESH_SHARE` lesson correctly generalised.
- **`votes-in-verdict.ts`** is the cleanest expression of a domain rule in the repo: one predicate, two
  call sites, a structural input type chosen so it stays client-safe, and the reasoning written down.
- **C4's double enforcement** (`quantity-requirement.ts:38` *and* worktree `offer.ts:132`) is exactly the
  fix finding #3 needs, written by the same team on the same day.

---

## 8. Recommended order before the next package starts

1. `worth-picking-up.ts` — read `price_basis`/`loyalty_programme`, construct through `createPriceBasis`,
   render the label. **Legal. Today.**
2. Brand `ModelCallPolicy`; fix `probeGate`; add the test *"no ModelCallPolicy is assembled outside
   `createModelCallPolicy`"*. **Before P6.**
3. Add `storage/domain` to `architecture.test.ts`'s `DOMAIN_DIRS`. **Before J1.**
4. Replace the nine `test.skip` e2e guards with minimum-count assertions. **Before the next deploy.**
5. `run.ts` — ping the healthcheck on the throw path; add `run.test.ts`.
6. P7 takes: the six alert literals, `hasPublishedData` → `publishedDataCoverage`, the telemetry
   decision, and an explicit ADR line recording that **AP-7 was not delivered by P3**.
7. Sweep the dead units in §4 (read-before-delete).
8. Merge C4 and W4 together, never C4 alone.

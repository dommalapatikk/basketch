# ADR: `ModelGate` — one quota gate per (provider, model)

**Status:** Accepted
**Date:** 2026-09-16
**Decides:** `docs/rca/2026-09-15-final-plan.md` WP-P5, ruling **D1** (gate placement and the
transport/quota vs content boundary), amending `docs/rca/2026-09-15-tech-lead-items-6-9.md` §6.4's
"application-level `withQuota`" proposal per `docs/rca/2026-09-15-architect-review-of-tech-lead.md`
§A.
**Lands in:** WP-P5

---

## Context

Measured on run `34833209176` (2026-09-14): a backfill of 1,107 products that owed attributes
fired ~250 requests in 20 seconds and got **255 of them refused with 429**. `backfilled 0/100
(0 tokens)` logged as if nothing had gone wrong — a warning with no severity, the same defect
class as HANDOVER.md §4's "an operation reporting success while doing nothing."

Google's Gemini free tier enforces `GenerateRequestsPerMinutePerProjectPerModel-FreeTier`: **15
requests per minute, scoped to the (project, model) pair**, not to any one caller. Three parts of
this pipeline called that same model:

- **The classifier** (`gemini-classifier.ts`), rate-limited by a decorator,
  `resilientClassifier` (`resilient-classifier.ts`), with rate/retry/circuit state private to
  that one wrapped instance.
- **The reflector** (`gemini-judge.ts`'s `createGeminiReflector`), calling `postJson` directly —
  no limiter at all.
- **The enricher** (`gemini-enricher.ts`), also calling `postJson` directly — no limiter, and no
  retry: a single 429 was logged and the whole sub-category batch was skipped (`continue`).

**The quota's scope is (project, model). The old limiter's scope was one port instance.** Nothing
forced the two to match, and the day a second and third caller of the same model were added,
Google counted every request from all three against one bucket while only one of the three ever
paced itself.

A second, related defect: `decideRetry` capped every provider `Retry-After`/`retryDelay`
instruction at `policy.maxDelayMs` (30s), including Google's own **57-second** instruction
measured live on this run. Waiting 30s and asking again bought nothing — the bucket was not due
to refill for another 27 seconds — which directly contradicted this codebase's own documented
rule: *"the provider's own instruction always wins over our guess"* (`resilience.ts`). A third:
OpenRouter's retry instruction is carried **only** in its `Retry-After` HTTP header, never in the
response body, and `postJson` discarded every response header — so for OpenRouter that rule could
never be honoured at all.

## Decision

**One `ModelGate` per (provider, model) pair, built once by the composition root and injected as
a REQUIRED argument of `postJson`.**

### Why `postJson`, not the port

The Tech Lead's original RCA (`2026-09-15-tech-lead-items-6-9.md` §6.4) proposed an
application-level `withQuota(gate, call)` wrapping the `Classifier` **port**. The architect's
review (`2026-09-15-architect-review-of-tech-lead.md` §A.1) showed why that reproduces the exact
defect it is meant to fix: **one `enrich()` port call makes 20–36 HTTP calls inside the adapter**
(`gemini-enricher.ts`, one per sub-category batch). A gate wrapping the port would see one call
where Google sees up to 36 — the same scope mismatch between "what the limiter counts" and "what
the provider counts," at a different layer.

`postJson` (`model-http.ts`) is already the single choke point every model call passes through —
it carries the timeout (`REQUEST_TIMEOUT_MS`), and `model-http.test.ts` already fails the build if
any infrastructure file calls `fetch` directly. Making `gate` a required argument there, the same
way the timeout is not optional, turns **"every model call shares its model's quota" into a
property of the code**, not a habit any one adapter has to remember. A runtime guard
(`postJson` throws if `gate` is omitted, independent of the TypeScript type) backs this even
against a caller that bypasses the type checker.

### The transport/quota vs content boundary

`ModelGate` owns **transport and quota** concerns only:

- rate (pacing to 90% of the published per-minute limit, via the existing pure `checkRate`)
- retry (via the existing pure `decideRetry`/`classifyFailure`)
- the provider's own `Retry-After` header or `retryDelay` body field
- the circuit breaker (five consecutive failures opens it for the rest of the run)
- an in-flight limit (`maxInFlight`)

It **never** inspects a response body for content — truncation, an unparseable answer, missing
indices. Those stay in each adapter (`gemini-classifier.ts` reads `finishReason`;
`gemini-enricher.ts` and `gemini-judge.ts` parse their own JSON shapes), because the gate would
otherwise need to understand every provider's response shape to do its job, which is exactly the
kind of coupling DDD's anti-corruption-layer rule exists to prevent. This boundary is a direct
ruling from the Tech Lead (`2026-09-15-final-plan.md` D1) and is unchanged by this ADR — it is
recorded here because it is now enforced in code, not only in review.

### Layering

```
domain (pure, no I/O)
  resilience.ts       — classifyFailure, decideRetry, checkRate, the circuit breaker
                         (unchanged mechanisms; PROVIDER_WAIT_CEILING_MS is new, see below)
  model-registry.ts   — ModelSpec gains requestsPerMinute + maxInFlight;
                         ModelCallPolicy + createModelCallPolicy(spec) build and
                         validate the values a gate needs from a spec

infrastructure
  model-gate.ts        — createModelGate(policy, deps?): ModelGate. The ONE stateful
                          executor: holds the rate window, the circuit and the
                          in-flight semaphore for one (provider, model) pair, and
                          drives the retry loop that resilientClassifier used to own.
  model-http.ts         — postJson(options): gate is REQUIRED. Runs one HTTP
                           attempt per call the gate makes; parses BOTH retry
                           signals (OpenRouter's Retry-After header, Google's
                           retryDelay in the body) into a structured
                           ModelHttpError { status, retryAfterMs }.
  gemini-classifier.ts,
  gemini-enricher.ts,
  gemini-judge.ts
  (judge + reflector),
  model-probe.ts        — each now requires `gate: ModelGate` and passes it to
                           postJson. No adapter parses status/retryDelay out of
                           a string any more — that is now a typed field on the
                           thrown error.
  resilient-classifier.ts — rate/retry/circuit retired. What remains is
                             guardClassifier: a Classifier that throws must
                             still come back as an Err. Nothing to do with quota.

composition root (composition.ts)
  Builds ONE ModelGate per (provider, model) actually in play this run — one
  for the chosen tier-1 Gemini model, one for the chosen OpenRouter judge
  model — and injects the SAME gate instance into every adapter that calls
  that model. The classifier, the reflector and the enricher all receive the
  identical tier-1 gate object; nothing constructs a second one.
```

Domain stays pure: `resilience.ts` and `model-registry.ts` import nothing from infrastructure.
`model-gate.ts` is the one stateful (sleeping, mutable) piece, and it lives in infrastructure —
consistent with this repo's existing rule, stated in `resilience.ts`'s own header: *"No sleeping
inside the domain: this module DECIDES, the adapter waits."*

### `ModelCallPolicy` and `PROVIDER_WAIT_CEILING_MS`

`ModelSpec` (`model-registry.ts`) gained two fields: `requestsPerMinute` and `maxInFlight`.
`createModelCallPolicy(spec)` builds a `ModelCallPolicy` from a spec and refuses one with a
non-positive rate or a `maxInFlight < 1` — an invariant enforced at construction, not by a caller
remembering to check, per CLAUDE.md's DDD rules. Every entry in `TIER1_CHAIN` and `JUDGE_CHAIN` is
covered by a test asserting it builds a valid policy.

`resilience.ts` gained `PROVIDER_WAIT_CEILING_MS = 90_000`. `decideRetry`'s existing rule —
`Math.min(retryAfterMs, policy.maxDelayMs)` — now uses this separate, longer ceiling specifically
for `rate-limited-short` failures, leaving every other failure kind's cap (`policy.maxDelayMs`,
30s) unchanged. This is a minimal, targeted change to a single `if` branch, not a new retry
system: the 57s measured live on 2026-09-14 now survives untouched (57 < 90), while a provider
lying about an hour-long wait is still bounded.

### Why Gemini's `maxInFlight` is 1

Every existing caller of the Gemini model — the classifier's chunk loop, the reflector inside the
judge graph node, the enricher's in-chunk and backfill calls — already runs **sequentially**
(`classify-graph.ts`'s judge/reflect nodes `await` one item at a time; `classify-deals.ts`'s
backfill loop runs after the classification loop, in the same synchronous control flow).
`maxInFlight: 1` keeps that true **by construction** rather than by accident, and it is what makes
the semaphore inside `model-gate.ts` a meaningful backstop rather than a formality: if a future
change ever dispatched two Gemini calls concurrently (a bug, not a feature, today), the gate would
serialize them instead of doubling the effective rate against Google's bucket.

## Why probes get their own gate, not the shared production one

`model-probe.ts` calls each candidate model **once**, with the explicit goal of failing fast (its
own header: *"fail in the first ten seconds, not forty minutes"*). Routing a probe through the
production gate would let a probe's failure retry using the production retry policy (up to three
attempts with real delays), which contradicts that goal and would slow every model-probe test that
exercises a failure path. `model-probe.ts` therefore builds a small, ad hoc, single-use
`ModelGate` per candidate spec (`probeGate`), with `retry.maxAttempts: 1` and a permissive rate —
correct because a probe is inherently a single call, never a sustained caller sharing a bucket
with anything else. This is a deliberate, narrow exception to "one gate per (provider, model)":
probing and production classification are different call sites with different failure semantics,
and the exception is documented at its one call site rather than folded silently into the shared
policy.

## Alternatives considered

**A. A token-bucket service, a queue, or a separate worker process.**
Rejected as over-engineering (CLAUDE.md: "one developer, 10–50 users, free tier"). One gate object
holding the existing pure policy functions is enough for 15 requests/minute.

**B. Reservation as a parameter on each port method (`Judge.judge(request, answer, reservation)`).**
This was the architect's own original item-5 design for spend (superseded in
`2026-09-15-architect-review-of-tech-lead.md` §A.2). With the gate required at `postJson`, a
reservation (WP-P8) moves *inside* the gate instead, so port signatures — `Classifier.classify`,
`Judge.judge`, `Reflector.reflect`, `Enricher.enrich` — never change shape for a concern that has
nothing to do with what those ports mean domain-wise.

**C. Keep the rate/retry/circuit logic on `resilientClassifier` and add separate, matching
decorators for the reflector and the enricher.**
Rejected — this was tried in spirit already (each caller had, or could have had, its own
decorator) and is exactly the bug: three decorators cannot share state unless something forces
them to use the *same instance*, and nothing did. A gate keyed by (provider, model) and built once
by the composition root is the only design where sharing is structural rather than a convention
three separate files have to remember to follow.

## Consequences

**Easier**
- "Every caller of a model shares that model's quota" is now checked by a test that fails the
  build (`model-http.test.ts`'s "no model call can be made without a gate") rather than relied on
  by convention.
- The provider's own retry instruction is read once, in one place (`model-http.ts`), as a
  structured field — no adapter or decorator regexes a message string it did not construct.
- `resilient-classifier.ts` shrank to a single-purpose port-contract guard; the rate/retry/circuit
  it used to own is now exercised, and covered, once, in `model-gate.test.ts`, instead of being
  implicitly re-tested (or not) by every caller that happened to wrap it.

**Harder / accepted**
- Every `GeminiDeps`, `EnricherDeps`, `JudgeDeps` and `ReflectorDeps` now requires a `gate` field.
  Tests that inject their own `fetchJson`/`ask` (bypassing `postJson` entirely) still need to
  satisfy the type, so a shared `createNoopGate()` test helper
  (`pipeline/test-support/gate.ts`) exists purely to keep those tests from having to construct a
  real `ModelCallPolicy` for behaviour they are not testing.
- `postJson`'s retry loop now lives inside the injected `ModelGate.request`, which calls `attempt`
  (one HTTP round-trip) more than once. A caller that wants "exactly one attempt, no matter what"
  (the probe) must build a gate that says so explicitly, rather than relying on `postJson` itself
  having no retry concept at all.

## Seams for WP-P6 and WP-P8

- **WP-P6 (judge concurrency).** Raise `JUDGE_CHAIN`'s entry's `maxInFlight` from 1 to the Tech
  Lead's bounded N (4) in `model-registry.ts`. `model-gate.ts`'s semaphore already admits up to
  `policy.maxInFlight` concurrent `attempt()` calls — nothing else changes. The architect's
  condition (`2026-09-15-architect-review-of-tech-lead.md` §A.4.1: "reserve at dispatch, not after
  the call") is naturally satisfied because the gate's rate/circuit state is already the single
  source of truth every concurrent caller reads and updates, not a value threaded through a
  sequential loop.
- **WP-P8 (spend).** Add a `SpendLedger` step around `attempt()` inside `ModelGate.request` — the
  same acquire → attempt → release shape the rate and in-flight checks already use. The
  `ModelHttpError` a failed attempt throws already carries `status`, which the spend policy needs
  to distinguish "no charge" (a network failure, `status: null`) from "charged, then refused" (a
  paid call that still consumed budget, e.g. `status: 402`). `ModelCallPolicy` gains an optional
  `spend` field (price, `maxOutputTokens`) that is `undefined` for free-tier Gemini and required
  for paid OpenRouter judge calls once P8 lands.

## Open

- `resilience.ts`'s `MAX_CHUNK_MS` comment already anticipates WP-P6 shrinking chunk duration once
  judge concurrency lands; that re-derivation is P6's job, not this one's.
- The reflector's silent catch (`gemini-judge.ts`) now logs on every failure, closing RCA item
  6.2 step 4's evidence gap (whether the reflector's own 429s were draining the shared bucket just
  before enrichment). The next live run's logs are the diagnostic this ADR set up, not something
  this change can prove offline. The judge's equivalent silent catch was fixed for the same reason
  and the same defect class, though the RCA named only the reflector explicitly — flagged here in
  case that scope addition needs separate sign-off.

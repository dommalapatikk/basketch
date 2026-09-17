# ADR: `attributes_version` — a version, not a timestamp

**Status:** Accepted
**Date:** 2026-09-17
**Decides:** `docs/rca/2026-09-15-tech-lead-items-6-9.md` item 6, ruling **D3**
(`docs/rca/2026-09-15-final-plan.md`), which REPLACED the Tech Lead's own original
`attributes_enriched_at` design with the Architect's `attributes_version` — recorded here because it
is now enforced in code, not only in review.
**Lands in:** WP-P9.

---

## Context

Measured on run `34833209176` (2026-09-14) and `34718508157` (2026-09-12): the enrichment backfill
succeeded on 0 of 255 and 1 of 277 calls, both 429'd almost entirely. `backfilled 0/100` logged as
if nothing had gone wrong. On the live site, 82.6% of deals carry no attributes at all and 94.9%
carry no `storage` value, which is why the Frozen/Chilled filter (kept visible per PM decision TP-6,
on the understanding that WP-P9 makes it fill) shows almost nothing.

WP-P5's shared `ModelGate` (`docs/decisions/2026-09-16-model-gate.md`) already fixes the *rate* half
of this — every caller of the tier-1 Gemini model now shares one paced, retried, circuit-broken
quota, so a backfill can no longer burst ~250 requests in 20 seconds. That leaves two structural
defects the gate does not touch, both in how a RESULT is recorded once a call succeeds or fails:

1. **"Enriched, nothing stated" could not be recorded.** `gemini-enricher.ts` dropped an empty
   result as "not worth storing" (comment: *"it says nothing a missing row does not already say"*),
   and `needsEnrichment` treated `attributes = '{}'` as still owed. A product whose name honestly
   states nothing — D3's example, `"Emmi Milch 1L"`, which states no fat percentage under the
   never-infer rule — was therefore **re-requested every run, forever**. The owed set had a floor no
   amount of quota could ever clear, because clearing it required an answer the code had nowhere to
   write down.
2. **A rate-limited attempt looked identical to a genuinely-empty one.** Both left `attributes =
   '{}'`. There was no way to tell "we asked and nothing was there" from "we asked and Google said
   no" from "we never asked at all" — three different facts, one bit of information.

## Decision

**A `SMALLINT NULL` column, `attributes_version`, stored ALONGSIDE the row — not a timestamp, and
not a change to the cache key's own `schemaVersion`.**

```ts
export type EnrichmentOutcome =
  | { readonly kind: 'stated'; readonly attributes: Record<string, unknown> }
  | { readonly kind: 'statedNothing' }
  | { readonly kind: 'failed'; readonly reason: string; readonly rateLimited: boolean }

export function attributesVersionFor(outcome: EnrichmentOutcome): number | null {
  return outcome.kind === 'failed' ? null : CURRENT_ATTRIBUTE_SCHEMA_VERSION
}
```

`needsEnrichment` reads `attributesVersion !== CURRENT_ATTRIBUTE_SCHEMA_VERSION`, not `attributes`
emptiness. Only `stated` and `statedNothing` — both genuine ANSWERS — may set the version; `failed`,
whatever its reason, always leaves it `null`.

### Why a version, not `attributes_enriched_at` (the design this replaces)

The Tech Lead's first draft of this fix (§6.4 of the item-6 RCA) proposed a timestamp:
`attributes_enriched_at TIMESTAMPTZ NULL`, set whenever enrichment "ran" for a row. The Architect's
review found the failure this invites: **a 429'd batch still "ran"**. If the timestamp is set on
every attempt regardless of outcome, a rate-limited product is marked done and never asked again —
trading "re-ask forever" (the original defect) for "never ask" (worse, because it is silent and
looks identical to success in every log line and every query). If instead the timestamp is set only
on a SUCCESSFUL attempt, it can express "resolved" vs "not yet resolved" but nothing else — which is
no more expressive than a boolean, and in particular cannot express the schema-evolution case below
without re-deriving it from `attributes` (fragile: an old row and a genuinely-empty new row are both
`{}`).

A version does everything a timestamp can (distinguish resolved from unresolved) and one thing a
timestamp cannot: **it can be compared against a CURRENT value, so a schema change can invalidate
exactly the rows that need it, without inventing a new column for every future schema bump.**

### Why not bump the cache key's `schemaVersion` instead

`CachedClassification.classification`'s cache key already carries a `schemaVersion`
(`transformation/domain/classification-cache.ts`, `CURRENT_VERSIONS`). Bumping ANY version in that
key invalidates every existing row **by construction** — that is deliberate for the key's own
purpose (HANDOVER.md §5: *"never bump taxonomyVersion / promptVersion / schemaVersion casually"*),
because a stale row there is a stale CATEGORY. But a new attribute field (say, `spf` added to
`personal-care`) does not make any existing CATEGORY wrong — it only makes the existing ATTRIBUTES
incomplete. Reusing `schemaVersion` for this would force a full classification cold start (every
product re-sent to the tier-1 classifier and the judge) to fix metadata alone — exactly the kind of
disproportionate blast radius WP-P3's `RUN_DEADLINE_MS` arithmetic and the free-tier quota cannot
absorb casually. `attributes_version` is a second, independent axis for exactly this reason: it
expresses "enriched under schema 1, now schema 2" without touching classification at all.

### The `rateLimited` field on `failed`

`EnrichmentOutcome`'s `failed` variant carries `reason: string` (D3's literal shape) plus one
boolean, `rateLimited`, set by the adapter from the SAME `classifyFailure` the shared gate already
uses (`resilience.ts`) — not by the application layer regexing a message string. This is what makes
`stats.enrichment.rateLimited` a distinct, counted bucket from `stats.enrichment.failed` at large,
without leaking a Gemini-specific detail (a 429, `RESOURCE_EXHAUSTED`, Google's `retryDelay`) past
the enricher's own anti-corruption boundary.

## Consequences

**Easier**
- `needsEnrichment` is now a total, honest predicate: a product is owed a look until something that
  counts as an ANSWER resolves it. There is no floor a genuinely-answered product can never clear.
- A rate-limited product is distinguishable from a resolved one in the data itself, not only in a log
  line that scrolled past three weeks ago.
- A future attribute-schema change is a metadata-only cost (bump `CURRENT_ATTRIBUTE_SCHEMA_VERSION`
  in `shared/attribute-schemas.ts`), never a classification cold start.

**Harder / accepted**
- Every row written before this migration reads `attributes_version IS NULL` — "still owed" —
  regardless of whether it already carries real attributes. The migration's one-time backfill (§2 of
  the SQL file) mitigates the common case: any row that ALREADY carries non-empty `attributes` is
  marked resolved under version 1 immediately, so the next run's quota goes to the 82.6% that have
  nothing, not to re-confirming answers already on the table. Rows that are genuinely empty
  (`attributes = '{}'`) cannot be told apart from "never asked" by this migration any better than the
  code it replaces could — they are asked once more, and from then on the new code records which
  case it was, permanently.
- `EnrichmentOutcome` is a real per-item shape the enricher must produce for every item it was asked
  about (previously: an absent map entry could mean anything). Every existing enricher test and
  every `classify-deals.ts` fake enricher in this codebase had to be rewritten to the new shape —
  a one-time mechanical cost, paid in this WP.

## Expected throughput and coverage — honest numbers, not a promise

An earlier draft of this ADR (and the builder's own handback report) projected attribute coverage
climbing from 17.4% into "the 70–95%+ range" after one run. That was an unfounded best case, not an
estimate grounded in the run's own measured constants — corrected here per WP-P9 code review.

**Throughput, worked from what was actually measured.** The backfill's own pacing is bounded by the
shared `ModelGate` (WP-P5) at ~90% of Google's free-tier 15 requests/minute — call it 13–14/min. The
729-request, 1,107-product backfill measured on run `34833209176` averaged **~4.4 products per
request** (`gemini-enricher.ts` groups by sub-category before batching 15, so a run touching many
sub-categories in one backfill spends far more requests than `owed / 15` would suggest). That gives a
realistic steady-state throughput of roughly **13 × 4.4 ≈ 57–66 products/minute**, not the naive
"15/min × 15-per-batch" ceiling.

**The time budget is much smaller than the 28-minute `RUN_DEADLINE_MS` suggests.** On BOTH runs cited
above, classification (tier-1 batches, the judge, reflection) alone consumed **~16 of the 28
minutes** before the backfill loop even started. That leaves roughly **12 minutes** of backfill
window on a typical warm run, not 28. At ~66 products/minute, 12 minutes is **~790 products** — the
Tech Lead's own arithmetic, and the honest best case for one run against an owed set that was
measured at 1,107–1,132 and growing. **A run with an unusually large owed set (a bad week, a burst of
new products, or classification itself running long) gives the backfill less time than this, not
more — in the worst case, effectively zero, which is exactly what the new deadline-aware backfill
(MUST-FIX 3) now reports honestly via `deadlineHit` instead of silently.**

**Resolved-coverage and Storage-facet fill are two DIFFERENT curves, and conflating them was the
error in the original projection.** `statedNothing` is a full, permanent resolution — it sets
`attributes_version` and the product is never asked again — but it produces **no attribute at all**.
Under the never-infer rule, D3's own example (`"Emmi Milch 1L"`) resolves permanently while
contributing **nothing** to the Frozen/Chilled filter. So:

- **Resolved-coverage** (the share of products with `attributes_version` set, i.e. no longer owed)
  should climb quickly and monotonically — every run that makes progress keeps that progress, which
  is the entire point of this WP, and is not bounded by how much real data retailers happen to print.
- **Storage-facet fill** (the share of products carrying a `storage` value specifically — currently
  94.9% empty) is bounded by how often Swiss retailers actually PRINT a storage instruction on the
  product name, which this WP does nothing to change and has no measured ceiling for. It should rise
  from its current near-zero baseline, but **give it no promised number** — the first real
  post-migration run is the only way to measure it, and SRE/QA should treat it as a distinct metric
  from resolved-coverage in whatever dashboard or alert eventually reads `stats.enrichment`.

## Alternatives considered

**A. `attributes_enriched_at TIMESTAMPTZ NULL`.** Rejected — see "Why not a timestamp" above. This is
the design D3 explicitly replaced.

**B. A sentinel key inside the `attributes` jsonb** (e.g. `{ "__resolved": true }`). Rejected in the
original item-6 RCA (§6.4): it would leak into `visibleAttributes` on the frontend, which renders
whatever keys the jsonb carries, and "was this ever real product data" would become a filtering rule
every future reader of `attributes` has to remember.

**C. Re-deriving "resolved" from `attributes` emptiness, permanently.** This is the status quo this
ADR replaces, and it is the entire defect: it cannot represent `statedNothing` as distinct from
"never asked", so the owed set never drains.

## Migration

`supabase/migrations/20260917153000_attributes_version.sql` — additive (`ADD COLUMN IF NOT EXISTS`),
nothing dropped, safe to re-run. Includes the one-time backfill described above. **Written, not
applied** — the PM applies migrations by hand via the Supabase SQL editor (see
`supabase/migrations/README.md`).

## Deployment order — binding, no exceptions

**This migration MUST be applied BEFORE the code that reads and writes `attributes_version` is
deployed.** An earlier version of this ADR and the builder's own handback report both claimed the
opposite — that deploy order did not matter because a missing column "degrades correctly to owed" —
and that claim was **false**. Corrected here by the WP-P9 code review (MUST-FIX 2).

**Why it is false.** `supabase-classification-cache.ts` names `attributes_version` in two places that
are NOT optional and NOT behind any column-exists check:

- `:298`, the `.select(...)` column list every lookup sends.
- `:418`, the row every `save(...)` upsert writes.

If the code runs against a database that has not yet run this migration, PostgREST does not have the
column and returns a schema-level error (`42703 undefined column` / `PGRST204`) on **every** call to
either method — not an occasional row-level failure, a deterministic one, identical on every chunk,
every run, until the migration lands. Two independent failure modes follow, and this codebase's own
existing rules make BOTH of them worse than a loud crash, not better:

1. **Every write silently discards the run's classifications.** `save()`'s own rule (this file's
   header, unchanged by this WP): *"a failed WRITE degrades to a miss, always."* That rule exists so
   one bad chunk does not fail an otherwise-healthy run — but it does not distinguish "one chunk
   failed" from "every chunk will fail, forever, for a structural reason." With the column missing,
   `save()` returns `ok(0)` on every call, `persistChunk` logs `cached 0 of N classifications`, and
   the run proceeds as if nothing were wrong. The deals table itself is unaffected this run (`Deal`
   rows are built from the in-memory classification, not read back from the cache) — but NOTHING is
   memoised. Every product is reclassified from zero on the very next run, indefinitely, which is
   exactly the free-tier-quota-exhausting cold start this whole codebase's `RUN_DEADLINE_MS`
   machinery exists to avoid (HANDOVER.md §3).
2. **The lookup is retried, then very likely fails the whole run.** `readChunk` retries ANY select
   error up to `LOOKUP_ATTEMPTS` (3) before giving up — it does not distinguish a transient network
   blip from a deterministic schema error, so a missing column costs three full round-trips per
   chunk before that chunk is marked unreadable. Because the failure is structural, every chunk fails
   identically, which trips the `totalOutage` guard (`unreadableChunks === chunks`) regardless of how
   small the run is — and that makes `lookup` return `err(...)`, which `classifyDeals` turns into a
   thrown `ClassificationCacheUnreadableError`. That is the SAFER of the two outcomes (the run refuses
   to proceed rather than pretending to succeed), but it still means the run fails outright, every
   attempt, until the migration is applied.

**Either failure mode is unacceptable in production, and the correct fix is deployment order, not
code.** The `?? null` fallback in `rowToCached` (`:267`) only covers a column that EXISTS and holds
SQL `NULL` — the state every ALREADY-migrated row from before this ADR is in. It does nothing for a
column that does not exist in the schema PostgREST knows about at all, because the query never
reaches that fallback — it fails before a row is ever produced.

**Nothing else in this WP depends on the migration.** Every other change (the domain type
`EnrichmentOutcome`, `attributesVersionFor`, `needsEnrichment`'s new predicate, the enricher's
per-item outcome shape) is pure, in-memory TypeScript with no Supabase dependency — those are safe to
deploy at any time. The dependency on migration-before-code is confined entirely to
`supabase-classification-cache.ts`'s two call sites named above.

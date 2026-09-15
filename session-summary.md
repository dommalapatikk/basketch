# basketch — session summary

**Last updated:** 2026-09-15
**Live:** https://basketch.vercel.app · **1,523 deals** across 7 retailers · pipeline green

---

## Current state — all green

| Thing | State |
|---|---|
| Pipeline | **success** (run 34833209176) |
| Live deals | 1,523 (was 1,213) |
| Dead links on site | **0** |
| Cache hit rate | **75%** (1198/1598) — was 46% |
| Tests | pipeline 1,068 · shared 86 · web-next 182 · e2e 46 |
| `basketch.vercel.app` | auto-follows production deploys (no manual aliasing) |

Every retailer now links OUT to a real destination:

| Retailer | Product links point to |
|---|---|
| Denner, LIDL, Volg | per-product retailer pages |
| Migros | `issuu.com` weekly flyer |
| ALDI | `catalog.aldi-suisse.ch` catalogue |
| SPAR | `angebote.spar.ch` flyer |
| Coop | `aktionis.ch` — **correct, not stale** (see below) |

---

## ⚠️ Read this before "fixing" aktionis.ch

`coop-aktionis-source.ts` **is** the current Coop collector. Coop's own site is
behind DataDome, and CLAUDE.md forbids circumventing technical protection
measures. So aktionis.ch links are the honest provenance of Coop prices, not
leftover legacy data. Do not "fix" them.

---

## The five-run pipeline outage, and the three wrong diagnoses

The `Categorize & Store Deals` step failed five consecutive runs. All eight
collectors succeeded every time. Worth recording because **three diagnoses were
wrong**, and the reason each was wrong is the lesson.

### Wrong #1 — "it's the Gemini rate limit"
The log showed `429 RESOURCE_EXHAUSTED`, limit 15/min. But every chunk that ran
**completed and saved**; the backoff worked. The only fatal line was
`Timeout of 2700000ms hit`. The rate limit made it slow, it never made it fail.
Nearly traded away classification accuracy to fit a limit that wasn't the problem.

### Wrong #2 — "it's the 45-minute step timeout"
Closer, but the timeout is correctly sized. `pipeline.yml` says warm runs take
~2 minutes. This *was* a warm run. The real question was why a warm run behaved
like a cold start.

### Wrong #3 — "URL length, disproven"
Measured a synthetic 400-key request at 18,492 chars → HTTP 200, and declared
length ruled out. **The probe was invalid**: ASCII-only synthetic keys, through
`urllib` not undici, against a different table, from a laptop. Nothing like a
real chunk of Swiss product names from a GitHub runner.

### The actual root cause

```
[WARN] classification cache lookup: TypeError: fetch failed   ×3
[transform] cache: 742/1598 hits        ← 46%, should be ~75%
```

Lookups went out in chunks of `LOOKUP_CHUNK = 200` **keys**. But `cacheKeyFor`
returns the raw lowercased product name, and Swiss names carry `ü`, `%`, `&`
and spaces that percent-encode to 3–6 bytes each. So two chunks of "200 keys"
differ by kilobytes — and the three that failed, every time, were the three
holding the longest names. ~600 cached products were reported as uncached and
re-sent to Gemini at 15 req/min, which is what blew the 45-minute budget.

**A network blip silently impersonated a cold start.**

### Why it took five runs: we were blind, by our own hand

Verified in `pipeline/node_modules/@supabase/postgrest-js/src/PostgrestBuilder.ts`:

```
:367  res = res.catch((fetchError) => {...})   ← CATCHES, does not throw
:422    message: `${fetchError?.name}: ${fetchError?.message}`   ← always "TypeError: fetch failed"
:423    details: errorDetails    ← the real cause
:424    hint: hint               ← the remedy
:141  this.urlLengthLimit = builder.urlLengthLimit ?? 8000
:415  "If filtering with large arrays (e.g., .in('id', [200+ IDs])),
       consider using an RPC function instead."
```

postgrest-js **returns** network errors rather than throwing. Our `catch` never
fired, and we logged `.message` only — discarding `.details` and `.hint`. Four
runs produced identical, uninformative logs. The library literally names our
call shape in its hint.

**The lesson: read the library source, not its documentation, on failure #1.**

---

## Standing rules (hard-won — do not regress)

- **`deals.category` takes the TOP-LEVEL group**, never the browse category.
  Use `topCategoryFor`. The column names suggest the reverse.
- **Anything matching a row BY NAME must use `normalizeProductName`** — it is
  part of the upsert key.
- **Request size must be bounded by BYTES, not counts**, wherever user data
  enters a URL. `chunkByEncodedSize`.
- **A guard must be expressed in a real-world unit.** `MAX_UNREADABLE_SHARE`
  (0.25 of *chunks*) would have silently broken the moment chunks got smaller:
  the same 3 failures go from 3/8 = 0.38 (fails, right) to ~3/30 = 0.10
  (degrades silently, the original bug). Now `MAX_UNREADABLE_KEYS = 200`
  *products*, calibrated from the budget: 200 ≈ 13 min (fits), 440 ≈ 30 min
  (what killed it).
- **An error returned is not an error handled.** `classify-deals.ts` had
  `if (isOk(lookup))` with no `else`, so the cache fix alone would have been
  inert. Recurring shape here: *a correct unit nothing wires up.*
- **Never assert a hypothesis disproven from a probe that doesn't match
  production** — same client library, same table, same host.
- **Do not bump `taxonomyVersion`/`promptVersion`/`schemaVersion`** casually;
  any bump discards every cached row and forces a cold start.

---

## Known issues / next steps

1. **Retry re-fetches everything.** `pipeline.yml:216` — each attempt re-runs
   collection before reaching the transform, so attempt 2 re-fetches all seven
   retailers. **Breaches CLAUDE.md's "one fetch per store per week".** Fix:
   split into two steps so only categorise+store retries. Also
   `retry_wait_seconds: 300` → `60`; five idle minutes buys nothing.
2. **Alerting layer is dead.** 7 of 9 rules fed hardcoded literals;
   `shouldFailRun` can never return true; `process.exit(1)` unreachable.
3. **Cold-start CTA copy mismatch.** `WorthPickingUp.tsx` says "Pick a starter
   pack"; there is no starter-pack route, so it points at `/deals`. **PM
   decision needed:** change the copy, or build the feature.
4. **Migros yields few deals** (OCR-limited).
5. **Enrichment 429s** are non-fatal but leave attributes sparse; enrichment
   only fills on warm runs.
6. **Coop ACL truncation** — 19.3% of cache keys end in `...`.
7. **`OPENAI_API_KEY`** in the archived `.env` backup may still be live —
   rotate or confirm.
8. **CLAUDE.md:162 "Zero paid services" is stale** — OpenRouter is a paid
   deliberate PM decision. Caused a wrong agent finding once.

---

## Project agents — why they stopped working

All 19 live in `basketch/.claude/agents/`. They **only register when Claude Code
is launched from `basketch/`**, not from a subfolder. A session started in
`basketch/web-next/` sees none of them, and `Agent type 'architect' not found`
is the symptom. Copies now also exist in `web-next/.claude/agents/` so either
launch directory works — but the registry is built at startup, so a **restart is
required**; copying mid-session does nothing.

## Never commit

`.env.bak-20260910`, `transcript-backup.jsonl` — gitignored, contain API keys.

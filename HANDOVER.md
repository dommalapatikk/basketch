# basketch — full handover

**Written:** 2026-09-15 · **Status: everything green**
**Live:** https://basketch.vercel.app — 1,523 deals, 7 retailers, 0 dead links

Read this after `/clear`. It is written to be self-contained: you should not
need the chat history to pick the work back up.

---

## 0. How to resume (do this first)

```bash
# ⚠️ Launch from basketch/, NOT basketch/web-next/ — see §7
cd /Users/kiran/ClaudeCode/basketch
claude
```

Then: *"Read HANDOVER.md and CLAUDE.md, then continue."*

Health check, any time:

```bash
gh run list --workflow=pipeline.yml --limit=3     # pipeline
gh run list --workflow=ci.yml --limit=3           # tests
curl -s https://basketch.vercel.app/de/deals | grep -c 'href="#"'   # must be 0
```

---

## 1. Where things stand

| Thing | State | Notes |
|---|---|---|
| Pipeline | ✅ success | run 34833209176 |
| Live deals | **1,523** | was 1,213 |
| Cache hit rate | **75%** (1198/1598) | was 46% while broken |
| Dead links | **0** | was 103 + 4 controls |
| `basketch.vercel.app` | auto-follows deploys | no manual aliasing any more |
| pipeline tests | 1,068 pass | |
| shared tests | 86 pass (+3 expected-fail) | separate suite, easy to forget |
| web-next tests | 182 pass | |
| e2e (Playwright + axe) | 46 pass | was 44 pass + 2 fail |

**Product links now resolve for every retailer:**

| Retailer | Destination | Why |
|---|---|---|
| Denner, LIDL, Volg | per-product pages | retailer publishes them |
| Migros | `issuu.com` flyer | no per-product page exists |
| ALDI | `catalog.aldi-suisse.ch` | no per-product page exists |
| SPAR | `angebote.spar.ch` flyer | no per-product page exists |
| Coop | `aktionis.ch` | **correct — see §2** |

---

## 2. ⚠️ Three traps that look like bugs and are not

**1. `aktionis.ch` links on Coop deals are NOT stale legacy data.**
`coop-aktionis-source.ts` *is* the current Coop collector. Coop's own site sits
behind DataDome, and CLAUDE.md forbids circumventing technical protection
measures. aktionis.ch is the honest provenance of those prices. Do not "fix" it.

**2. Migros/ALDI/SPAR pointing at a flyer rather than a product page is
deliberate.** Those retailers publish no per-product URL. A flyer link is the
provenance of the price and lets a visitor verify it — which Art. 3(1)(e) UWG
effectively requires. `VolgHtmlSource` set this precedent.

**3. `deals.category` holds the TOP-LEVEL group, not the browse category.**
The column names suggest the reverse. Use `topCategoryFor` (`shared/types.ts`).
A test once asserted `toBe('dairy')` and thereby *encoded* the bug.

---

## 3. The five-run pipeline outage — full post-mortem

`Categorize & Store Deals` failed five consecutive runs. All eight collectors
succeeded every time. Recorded in full because **three diagnoses were wrong**,
and why each was wrong matters more than the fix.

### ❌ Wrong #1 — "it's the Gemini rate limit"

The log showed `429 RESOURCE_EXHAUSTED`, `quotaValue: 15`. But every chunk that
ran **completed and saved** — the backoff worked. The only fatal line was
`Timeout of 2700000ms hit`. The rate limit made it slow; it never made it fail.

> Nearly traded away classification accuracy to fit a constraint that wasn't
> the problem. **Read which line is actually fatal before believing the loudest
> error in the log.**

### ❌ Wrong #2 — "it's the 45-minute step timeout"

Closer, but the timeout is correctly sized. `pipeline.yml` states warm runs take
~2 minutes, and this *was* a warm run (1,214 cached entries). The real question
was why a warm run behaved like a cold start.

### ❌ Wrong #3 — "URL length, disproven"

Measured a synthetic 400-key request at 18,492 chars → HTTP 200, declared length
ruled out. **The probe was invalid:** ASCII-only synthetic keys, via `urllib`
not undici, against a different table, from a laptop. Nothing like a real chunk
of Swiss product names sent from a GitHub runner.

> **Never declare a hypothesis disproven from a probe that doesn't match
> production** — same client library, same table, same host, same data shape.

### ✅ The actual root cause

```
[WARN] classification cache lookup: TypeError: fetch failed   ×3   (same 3 of 8, every run)
[transform] cache: 742/1598 hits        ← 46%, should be ~75%
```

Lookups were chunked by `LOOKUP_CHUNK = 200` **keys**. But `cacheKeyFor`
returns the raw lowercased product name, and Swiss names carry `ü`, `%`, `&`
and spaces that percent-encode to **3–6 bytes each**. So two chunks of "200
keys" differ by kilobytes — and the three that failed every time were the three
holding the longest names.

~600 cached products were reported as uncached and re-sent to Gemini at 15
requests/minute. That is what blew the 45-minute budget.

**A network-shaped error was impersonating a cold start.**

### Why it took five runs: we were blind by our own hand

Verified in `pipeline/node_modules/@supabase/postgrest-js/src/PostgrestBuilder.ts`:

```
:367  res = res.catch((fetchError) => {...})     ← CATCHES; does not throw
:422    message: `${name}: ${message}`           ← always "TypeError: fetch failed"
:423    details: errorDetails                    ← the real cause lives here
:424    hint: hint                               ← and the remedy here
:141  this.urlLengthLimit = builder.urlLengthLimit ?? 8000
:415  "If filtering with large arrays (e.g., .in('id', [200+ IDs])),
       consider using an RPC function instead."
```

postgrest-js **returns** network errors instead of throwing, so our `catch`
never fired and we logged `.message` only — discarding `.details` and `.hint`.
Four runs produced identical, uninformative logs. The library names our exact
call shape in its own hint text.

> **Read the library's source, not its docs, on failure #1 — not failure #5.**

### The fix (`69a03fa`)

1. `chunkByEncodedSize()` — chunks bounded by **encoded bytes** (5,000, under
   the library's 8,000), with a 150-key backstop. Request size stops being a
   function of data we don't control.
2. Log `error.details` + `error.hint` + chunk index + encoded byte size.
3. `MAX_UNREADABLE_SHARE` (0.25 of *chunks*) → `MAX_UNREADABLE_KEYS` (200
   *products*). **My own guard was about to break silently:** smaller chunks
   turn the same 3 failures from 3/8 = 0.38 (fails, correct) into ~3/30 = 0.10
   (degrades silently — the original bug). A guard whose meaning flips when you
   tune an unrelated constant is not a guard.
   Calibrated from the budget at 15 req/min against a 45-min step:
   200 products ≈ 13 min (fits) · 440 ≈ 30 min (what killed it).
4. Total-outage condition: every chunk unreadable fails regardless of size.

**Result:** `cache: 1198/1598 hits` (75%), `Upserted 1547 of 1596 deals`,
`revalidate webhook ok`.

---

## 4. The recurring defect class — ten instances

Every one has the same shape: **an operation reporting success while doing
nothing.** If something is mysteriously wrong, look for this first.

| # | Defect | How it presented |
|---|---|---|
| 1 | Cache saved once at the very end | `cache: 0/1650 hits` on every retry |
| 2 | Sweep keyed on fetch success, not write success | would have emptied the site |
| 3 | Browse category written to `deals.category` | `Upserted 0 of 922` |
| 4 | Enrichment keyed on raw name, storage writes normalised | `enriched 1618/1620`, zero rows changed |
| 5 | Sweep fed an intent count | 2 Migros rows licensed deleting 168 |
| 6 | Per-MINUTE rate limit read as per-DAY | runs abandoned 7 of 8 chunks |
| 7 | Duplicate `cache_key` in one upsert → Postgres 21000 | whole 100-row statement rejected |
| 8 | `href="#"` on flyer-sourced products | clicking a product reloaded basketch |
| 9 | Chunking by key count, not bytes | 3 of 8 lookups failed silently (§3) |
| 10 | `if (isOk(lookup))` with **no else** | cache error → silent cold start |

**#10 is the most instructive.** The cache fix was correct *and completely
inert*, because the caller discarded the error. The recurring shape in this
codebase is **a correct unit that nothing wires up.** Always test through the
composition root, not only the unit.

### Coverage theatre found (tests passing while the bug was live)

- A test asserting `category === 'dairy'` — the defect itself (#3).
- A `retryDelay` test using a hand-written string that passes at 200 chars.
- A test named *"produces a key both halves agree on"* comparing `naturalKey`
  against **itself** while #4 was in production.
- `createInMemoryCache` is a `Map` keyed on `cacheKey`, which silently absorbed
  duplicates — which is why the whole suite missed #7.
- My own *"no offer lacks a destination"* test passed **vacuously**: a
  below-yield run returns a failure carrying no offers, and `.some()` on `[]`
  is `false`.

> **Every new guard must be mutation-tested.** Reintroduce the defect,
> confirm red, restore. A guard that has never failed is not yet a guard.

---

## 5. Standing rules — do not regress

- **`deals.category` = top-level group.** Use `topCategoryFor`.
- **Anything matching a row BY NAME uses `normalizeProductName`** — it is part
  of the upsert key. One definition, in the shared kernel.
- **Bound request size in BYTES** wherever user data enters a URL.
- **Express guards in real-world units** (products, deals), never in internal
  artefacts (chunks). See `MIN_REFRESH_SHARE` in `stale-sweep.ts` for the model.
- **An error returned is not an error handled.** No silent `if (isOk(x))`
  without an `else`.
- **A share of a live set must be refreshed before sweeping** —
  `MIN_REFRESH_SHARE = 0.5`. Two deals do not license withdrawing 168.
- **Never bump `taxonomyVersion` / `promptVersion` / `schemaVersion` casually** —
  any bump invalidates every cached row and forces a cold start.
- **Never allowlist a pattern granting arbitrary code execution** in
  `.claude/settings.json`.
- **A control that cannot navigate is a disabled `<button>`, not a dimmed
  link.** Never `href="#"`; `no-dead-links.test.ts` enforces this repo-wide.
- **Never assign `href` inside a click handler** — middle-click, ⌘-click and
  "Copy link address" don't fire `onClick`.

---

## 6. Commits this session

```
3de9193  docs: session summary — pipeline green, five-run outage post-mortem
69a03fa  fix(pipeline): bound the cache lookup by encoded BYTES, not by key count   ← the fix
b21d2b6  diag(pipeline): surface the real cause of "TypeError: fetch failed"
5d15fc5  fix(pipeline): a transient cache-lookup failure no longer fakes a cold start
0b40d86  feat(pipeline): Migros, ALDI and SPAR offers link to the flyer they came from
4b0b5a5  fix(web): share controls carry a real href, not one assigned on click
035d274  docs: record the seven silent failures and the cold-start fix
2fb111c  fix(web): no dead links for flyer-sourced products
8dc5d6f  fix(transform): the cache write was rejected wholesale by Postgres 21000
1052809  fix(resilience): a per-minute rate limit is not a daily one
561f2fb  fix(storage): round discount_percent — one fractional value failed a batch of 100
753c108  fix(pipeline): a store must refresh half its live set before sweeping the rest
973ba80  fix(transform): classify in a stable order so deferral is not a lottery
8ff46b7  test: assertions that could pass with zero assertions executed
```

### Key files touched

```
pipeline/transformation/infrastructure/supabase/supabase-classification-cache.ts   §3 fix
pipeline/transformation/application/classify-deals.ts                              §4 #10
pipeline/storage/domain/stale-sweep.ts                                             MIN_REFRESH_SHARE
pipeline/collection/infrastructure/{migros,aldi,spar}/*-flyer-source.ts            flyer URLs
pipeline/collection/infrastructure/live-sources.ts                                 wiring
web-next/src/lib/share-target.ts                                                   share destinations
web-next/src/lib/use-origin.ts                                                     hydration-safe origin
web-next/src/lib/no-dead-links.test.ts                                             repo-wide guard
web-next/src/components/{deals/BottomBar,list/ListDrawer,landing/WorthPickingUp}.tsx
web-next/e2e/v2-acceptance.spec.ts                                                 tag-agnostic locators
```

---

## 7. ⚠️ Why your 19 agents stopped working

They live in `basketch/.claude/agents/` and **only register when Claude Code is
launched from `basketch/`** — not from a subfolder. This session started in
`basketch/web-next/`, so all 19 were invisible and every call returned:

```
Agent type 'architect' not found. Available agents: claude, general-purpose, ...
```

Copies now also exist in `web-next/.claude/agents/`, so either launch directory
works. **But the registry is built at startup — copying mid-session does
nothing. A restart is required.**

```bash
cd /Users/kiran/ClaudeCode/basketch && claude    # ← launch from here
```

---

## 8. Open items

| # | Item | Priority |
|---|---|---|
| 1 | **Retry re-fetches every retailer.** `pipeline.yml:216` re-runs collection before the transform, so attempt 2 re-fetches all seven. **Breaches CLAUDE.md's "one fetch per store per week."** Split into two steps; also `retry_wait_seconds: 300` → `60`. | **high** |
| 2 | **Alerting layer is dead.** 7 of 9 rules fed hardcoded literals; `shouldFailRun` can never return true; `process.exit(1)` unreachable. | **high** |
| 3 | **Cold-start CTA copy mismatch.** `WorthPickingUp.tsx` says "Pick a starter pack"; no such route exists, so it points at `/deals`. **PM decision: change the copy, or build the feature?** | **needs you** |
| 4 | `OPENAI_API_KEY` in the archived `.env` backup may still be live — rotate or confirm. | **needs you** |
| 5 | CLAUDE.md:162 "Zero paid services" is stale — OpenRouter is a deliberate paid decision. Caused one wrong agent finding. | medium |
| 6 | Enrichment 429s are non-fatal but leave attributes sparse; only fills on warm runs. | medium |
| 7 | Migros yields few deals (OCR-limited). | medium |
| 8 | Coop ACL truncation — 19.3% of cache keys end in `...`. | low |
| 9 | `batchSize: 25 → 100` (4× throughput), deferred pending explicit `maxOutputTokens`. | low |

---

## 9. Commands

```bash
# tests — THREE separate suites, all must pass
cd pipeline  && npm test      # 1068
cd shared    && npx vitest run # 86 (+3 expected-fail) — neither other suite runs these
cd web-next  && npm test      # 182
cd web-next  && npx playwright test   # 46, incl. axe accessibility

# type-check
npx tsc --noEmit -p pipeline/tsconfig.json
npx tsc --noEmit -p web-next/tsconfig.json

# pipeline
gh workflow run pipeline.yml -f collection_mode=live
gh run list --workflow=pipeline.yml --limit=3
gh run view <id> --log-failed

# deploy — basketch.vercel.app now auto-follows production; no manual alias
```

## 10. Never commit

`.env.bak-20260910`, `transcript-backup.jsonl` — gitignored, contain live API keys.

// run-pipeline.test.ts — the test seam `run.ts` never had.
//
// HANDOVER.md §4: every recurring defect in this codebase is "a correct unit
// that nothing wires up." That happened because `main()` in run.ts was a
// 700-line unexported function — nothing could build it with a fake source, a
// fake cache or a fake judge and watch what came out. These tests go through
// `runPipeline` (or `finishRun` directly for the exit-mapping baseline),
// never only a hand-built fake in isolation.
//
// NO SUPABASE MOCK: this file imports only `run-pipeline.ts` (application
// layer) and hand-built fakes. Code review of WP-P2 (F1) found that
// `run-pipeline.ts` transitively constructed a real Supabase client at import
// time via `./store` — proved by this file needing `vi.mock('@supabase/supabase-js')`
// just to load. That import is now `../shared/types` (normalizeProductName)
// and `storage/domain/product-key.ts` (productLookupKey), both pure. The
// composition-root tests that legitimately DO need Supabase construction
// (because that is composition.ts's whole job) live in composition.test.ts,
// with the mock — the same pattern store.test.ts already uses for
// infrastructure-layer tests.

import fs from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

import { createOffer } from './collection/domain/offer'
import { createMoney } from './collection/domain/money'
import { collected } from './collection/domain/offer-source'
import type { OfferSource } from './collection/domain/offer-source'
import { err, ok, unwrap } from './collection/domain/result'
import { createValidityPeriod } from './collection/domain/validity-period'
import type { ClassificationCache } from './transformation/domain/classification-cache'
import { createInMemoryCache } from './transformation/domain/classification-cache'
import { createClassification, createConfidence } from './transformation/domain/classification'
import type { ClassificationOutcome, Classifier } from './transformation/domain/classifier'
import { RUN_DEADLINE_MS, WRITE_TAIL_MS } from './transformation/domain/resilience'
import type { StoreSweepPlan } from './storage/domain/stale-sweep'
import { statefulClock } from './test-support/clock'
import type { ClassificationDeps, PipelineDeps, PipelineOutcome, StorageDeps } from './run-pipeline'
import { exitCodeFor, finishRun, runPipeline } from './run-pipeline'
import type { JudgeSpendInfo, RunHistory } from './transformation/application/run-snapshot'
import type { UsdMicros } from './transformation/domain/spend'
import type { Deal } from '../shared/types'

const WEEK = unwrap(createValidityPeriod('2026-09-03', '2026-09-09'))

const classification = (category: string, subCategory: string) =>
  unwrap(createClassification({ category, subCategory, confidence: unwrap(createConfidence(0.95)), tier: 1, model: 'test' }))

/** Always answers the same category — deterministic, no network, no cache dependence. */
const classifierAnswering = (category: string, subCategory: string): Classifier => ({
  name: 'test-classifier',
  tier: 1,
  batchSize: 25,
  async classify(batch) {
    return ok(batch.map((request): ClassificationOutcome => ({ ok: true, request, classification: classification(category, subCategory) })))
  },
})

/** Records every call, in order, and every deal `storeDeals` actually received. `overrides` replaces individual methods for one test's scenario (e.g. a storage shortfall). */
function fakeStorage(overrides: Partial<StorageDeps> = {}): StorageDeps & { readonly calls: string[]; readonly storedDeals: Deal[] } {
  const calls: string[] = []
  const storedDeals: Deal[] = []

  const defaults: StorageDeps = {
    async loadAliases() {
      calls.push('loadAliases')
      return new Map()
    },
    async reportUnknownTags() {
      calls.push('reportUnknownTags')
    },
    async resolveProducts(deals, store) {
      calls.push('resolveProducts')
      const out = new Map<string, { productId: string }>()
      for (const deal of deals) out.set(deal.productName, { productId: `${store}:${deal.productName}` })
      return out
    },
    async activeCountsByWindow() {
      calls.push('activeCountsByWindow')
      return { ok: true, counts: new Map() }
    },
    async storeDeals(deals) {
      calls.push('storeDeals')
      storedDeals.push(...deals)
      const byStore = new Map<string, number>()
      const writtenByWindow = new Map<string, Map<string, number>>()
      for (const deal of deals) {
        byStore.set(deal.store, (byStore.get(deal.store) ?? 0) + 1)
        const forStore = writtenByWindow.get(deal.store) ?? new Map<string, number>()
        forStore.set(deal.validFrom, (forStore.get(deal.validFrom) ?? 0) + 1)
        writtenByWindow.set(deal.store, forStore)
      }
      return { attempted: deals.length, total: deals.length, collapsed: 0, byStore, writtenByWindow }
    },
    async writeEnrichment(items) {
      calls.push('writeEnrichment')
      return items.length
    },
    async populateV3Layer() {
      calls.push('populateV3Layer')
      return { concepts_resolved: 0, skus_upserted: 0, deals_linked: 0 }
    },
    async deactivateStaleForStores() {
      calls.push('deactivateStaleForStores')
      return 0
    },
    async deactivateExpiredDeals() {
      calls.push('deactivateExpiredDeals')
      return 0
    },
    async logPipelineRun() {
      calls.push('logPipelineRun')
    },
  }

  return { calls, storedDeals, ...defaults, ...overrides }
}

/** No judge configured — `guarded: true` because nothing paid was ever possible (no key). */
const noJudgeSpend: JudgeSpendInfo = { guarded: true, spendSnapshot: () => null }

function fakeClassificationDeps(overrides: Partial<ClassificationDeps> = {}): ClassificationDeps {
  return {
    cache: createInMemoryCache(),
    tier1: classifierAnswering('dairy', 'dairy'),
    judge: null,
    reflector: null,
    enricher: null,
    judgeSpend: noJudgeSpend,
    ...overrides,
  }
}

/** In-memory RunHistory — no previous run by default, `saved` records every snapshot `save` ever received. */
function fakeRunHistory(overrides: Partial<RunHistory> = {}): RunHistory & { readonly saved: unknown[] } {
  const saved: unknown[] = []
  return {
    saved,
    lastSuccessful: async () => ok(null),
    save: async (snapshot) => {
      saved.push(snapshot)
      return ok(undefined)
    },
    ...overrides,
  }
}

type FakeDeps = PipelineDeps & { readonly storage: ReturnType<typeof fakeStorage> }

function fakeDeps(overrides: Partial<Omit<PipelineDeps, 'storage'>> = {}, storage = fakeStorage()): FakeDeps {
  return {
    sources: () => [],
    createClassificationDeps: async () => fakeClassificationDeps(),
    runHistory: fakeRunHistory(),
    revalidate: async () => {},
    writeStepSummary: async () => {},
    ...overrides,
    storage,
  }
}

const dennerOfferSource = (productName: string): OfferSource => ({
  retailer: 'denner',
  expectedMinimumOffers: 1,
  async fetchOffers() {
    return collected('denner', [
      unwrap(
        createOffer({
          retailer: 'denner',
          productName,
          salePrice: unwrap(createMoney(1.5)),
          originalPrice: unwrap(createMoney(2)),
          validity: WEEK,
        }),
      ),
    ])
  },
})

const baseOptions = {
  now: new Date('2026-09-08T00:00:00Z'),
  runId: 'test-run',
  // Most tests here are single, non-retried runs — WP-P3's deadline tests
  // override this explicitly.
  isFinalAttempt: true,
}

/** N offers with distinct names, enough to span more than one classify-deals.ts CHUNK_SIZE (100). */
const manyOffersSource = (n: number): OfferSource => ({
  retailer: 'denner',
  expectedMinimumOffers: 1,
  async fetchOffers() {
    return collected(
      'denner',
      Array.from({ length: n }, (_, i) =>
        unwrap(
          createOffer({
            retailer: 'denner',
            productName: `Produkt Deadline ${i}`,
            salePrice: unwrap(createMoney(1.5)),
            originalPrice: unwrap(createMoney(2)),
            validity: WEEK,
          }),
        ),
      ),
    )
  },
})

describe('a full run through the composition root stores what the fake sources returned — run.ts had zero tests', () => {
  it('writes the deal the fake source produced, through classification, taxonomy and storage', async () => {
    const deps = fakeDeps({ sources: () => [dennerOfferSource('Bio Vollmilch 1l')] })

    const outcome = await runPipeline(deps, baseOptions)

    expect(outcome.status).toBe('ok')
    expect(deps.storage.storedDeals).toHaveLength(1)
    expect(deps.storage.storedDeals[0]?.store).toBe('denner')
    expect(deps.storage.storedDeals[0]?.productName).toBe('bio vollmilch 1l')
    expect(deps.storage.storedDeals[0]?.subCategory).toBe('dairy')
  })

  it('never touches storage when every source collects nothing — no data is a stop, not an empty write', async () => {
    const deps = fakeDeps({ sources: () => [] })

    const outcome = await runPipeline(deps, baseOptions)

    expect(outcome.status).toBe('no-data')
    expect(deps.storage.calls).toEqual([])
  })
})

// WP-P4 (RCA 2026-09-15, AP-3): the legacy aktionis matrix job — 8 slugs, 3
// attempts, 300s waits, run 124 times since 2026-09-11 — is retired. It used
// to write `*-deals.json`, which `off`/`shadow` mode read via
// `readLegacyDealFiles`. Live mode now supplies collection unconditionally;
// nothing in this module touches the filesystem any more.
describe('a live run reads no *-deals.json — the legacy artifact read is retired (WP-P4)', () => {
  it('never calls fs.readdirSync while collecting — that is the call readLegacyDealFiles used to make', async () => {
    const readdirSpy = vi.spyOn(fs, 'readdirSync')
    const deps = fakeDeps({ sources: () => [dennerOfferSource('Bio Vollmilch 1l')] })

    try {
      const outcome = await runPipeline(deps, baseOptions)
      expect(outcome.status).toBe('ok')
      expect(readdirSpy).not.toHaveBeenCalled()
    } finally {
      readdirSpy.mockRestore()
    }
  })
})

describe('live counts are read BEFORE storeDeals — a post-write count makes the sweep guard permissive', () => {
  it('calls activeCountsByWindow before storeDeals, every run', async () => {
    const deps = fakeDeps({ sources: () => [dennerOfferSource('Bio Vollmilch 1l')] })

    await runPipeline(deps, baseOptions)

    const countsIndex = deps.storage.calls.indexOf('activeCountsByWindow')
    const storeIndex = deps.storage.calls.indexOf('storeDeals')
    expect(countsIndex).toBeGreaterThanOrEqual(0)
    expect(storeIndex).toBeGreaterThan(countsIndex)
  })
})

// ── F3: lock today's PipelineOutcome contract before WP-P3 rewrites the exit
// mapping. `run.ts` itself has no test — it unconditionally calls `shell()`
// as a module-load side effect, so importing it would run the pipeline for
// real. Testing `finishRun` (the function that DECIDES the outcome) and
// `runPipeline`'s 'no-data'/'ok' paths above covers the same contract without
// restructuring the shell.
//
// ⚠️ WP-P3 (RCA T1) DELIBERATELY CHANGED THIS CONTRACT, and this block with
// it: `finishRun` now calls `revalidate()` before EVERY status that reports on
// THIS attempt's data (ok, alert-failed, storage-shortfall) — not only "ok" —
// because `storeDeals` has already run by the time any of the three is
// decided, so the site's cache is stale against Supabase regardless of which
// one comes back. Only `deadline-hit` on a non-final attempt skips it, because
// that status is not a terminal report: a retry follows within
// `retry_wait_seconds` and revalidates when IT finishes. See the block below,
// "the exit-code split (WP-P3)".
describe('the PipelineOutcome contract every exit-code mapping depends on', () => {
  it('produces "ok" and calls revalidate — the only status a non-zero exit is not mapped from', async () => {
    const revalidate = spy()
    const deps = fakeDeps({ revalidate: revalidate.fn })
    const outcome = await finishRun(deps, {
      runId: 'r',
      stats: statsOf(10),
      resolvedLength: 10,
      storedCount: 10,
      durationMs: 1,
      isFinalAttempt: true,
      ...noSnapshotInputs,
    })

    expect(outcome).toEqual({ status: 'ok', storedCount: 10 })
    // Asserted, not assumed (code review N1): without this, deleting the
    // revalidate call from the success path entirely left all six tests
    // green — and moving that call is exactly WP-P3's job.
    expect(revalidate.calls).toBe(1)
  })

  // Both failure conditions at once (code review N2): a stale clock AND 1 of
  // 10 stored. Today the alert check runs first, so 'alert-failed' wins. The
  // fixtures above never make both true, so nothing pinned that precedence —
  // and WP-P3 reorders this very sequence.
  it('reports the alert, not the shortfall, when both conditions are true', async () => {
    const revalidate = spy()
    const deps = fakeDeps({ revalidate: revalidate.fn })
    const staleClock = statefulClock([1_000, 1_000 + 9 * 24 * 60 * 60 * 1000])

    const outcome = await finishRun(deps, {
      runId: 'r',
      stats: statsOf(10),
      resolvedLength: 10,
      storedCount: 1,
      durationMs: 1,
      isFinalAttempt: true,
      now: staleClock,
      ...noSnapshotInputs,
    })

    expect(outcome).toEqual({ status: 'alert-failed' })
    // WP-P3: data was already written this attempt, so the stale site cache
    // must still be busted even though the run is reported as a failure.
    expect(revalidate.calls).toBe(1)
  })

  it('produces "storage-shortfall" when stored deals fall below 80% of resolved — and still revalidates (WP-P3)', async () => {
    const revalidate = spy()
    const deps = fakeDeps({ revalidate: revalidate.fn })

    const outcome = await finishRun(deps, {
      runId: 'r',
      stats: statsOf(10),
      resolvedLength: 10,
      storedCount: 1,
      durationMs: 1,
      isFinalAttempt: true,
      ...noSnapshotInputs,
    })

    expect(outcome).toEqual({ status: 'storage-shortfall' })
    expect(exitCodeFor(outcome)).toBe(1)
    // THE WP-P3 FIX ITSELF: today's behaviour wrote data and then skipped
    // revalidation, leaving the site cache stale against rows already in
    // Supabase. A storage-ratio failure is still reported (exit 1, not
    // retried) — but the cache must reflect what was actually written.
    expect(revalidate.calls).toBe(1)
  })

  it('produces "alert-failed" when a critical alert fires — and still revalidates (WP-P3)', async () => {
    const revalidate = spy()
    const deps = fakeDeps({ revalidate: revalidate.fn })
    // WP-P3 pinned this against `pipeline-stale` specifically because, at
    // the time, it was the ONLY critical alert `finishRun` could reach at
    // all — every other RunSnapshot field was a hardcoded literal
    // (`invalidCategoryRejected: 0`, `benchmarkMacroF1: null`, `halted: null`,
    // `publishedDataCoverage: {}`, `previous: null`), so `run-halted`,
    // `classifier-regression` and `source-shape-changed` were unreachable —
    // see the RCA this WP-P3 comment referenced, and `evaluateAlertsStep`'s
    // own header before WP-P7. That premise no longer holds: `buildRunSnapshot`
    // (WP-P7) makes every one of those fields real, so `run-halted` is now
    // ALSO independently reachable — see "alerts fed real outputs..." below.
    // A stale-run clock still exercises `pipeline-stale` specifically,
    // deliberately, so this test keeps pinning the exit-mapping contract
    // (revalidate-before-exit) rather than re-testing which alert fires.
    const staleClock = statefulClock([1_000, 1_000 + 9 * 24 * 60 * 60 * 1000])

    const outcome = await finishRun(deps, {
      runId: 'r',
      stats: statsOf(10),
      resolvedLength: 10,
      storedCount: 10,
      durationMs: 1,
      isFinalAttempt: true,
      now: staleClock,
      ...noSnapshotInputs,
    })

    expect(outcome).toEqual({ status: 'alert-failed' })
    expect(exitCodeFor(outcome)).toBe(1)
    expect(revalidate.calls).toBe(1)
  })
})

describe('the exit-code split (WP-P3 / RCA T1) — 0 success, 75 retry-worthy, 1 never retried', () => {
  it('maps every PipelineOutcome status to exactly the code pipeline.yml is configured to act on', () => {
    const cases: readonly [PipelineOutcome, 0 | 75 | 1][] = [
      [{ status: 'ok', storedCount: 1 }, 0],
      [{ status: 'deadline-hit' }, 75],
      [{ status: 'cache-unreadable' }, 75],
      [{ status: 'alert-failed' }, 1],
      [{ status: 'storage-shortfall' }, 1],
      [{ status: 'no-data' }, 1],
    ]
    for (const [outcome, expected] of cases) expect(exitCodeFor(outcome)).toBe(expected)
  })

  // F9 (code review of the first WP-P3 submission): the script below is
  // consumed POSITIONALLY, in the exact order `runPipeline` → `runTransform`
  // → `classifyDeals` call `clock()`. Every value is named for the call it
  // stands for, in call order, so a reviewer can check the mapping directly
  // against the production code instead of counting blindly. If this ever
  // throws "statefulClock exhausted", a NEW `clock()` call was added upstream
  // — name it here, do not silently pad the array.
  function deadlineHitClockScript(t0: number): readonly number[] {
    const startTimeMs = t0 // 1. runPipeline: `const startTime = clock()`
    const beforeChunk1WithinDeadline = t0 // 2. classify-deals: deadline check before chunk 1 (100 products) — still inside RUN_DEADLINE_MS
    const beforeChunk2PastDeadline = t0 + RUN_DEADLINE_MS + 60_000 // 3. classify-deals: deadline check before chunk 2 (the remaining 50) — past it
    // From here on, the exact wall-clock value no longer matters to what
    // these tests assert — only that the clock answers this many more
    // reads. Reusing the past-deadline timestamp keeps `durationMs` (and,
    // for the final-attempt test, STALE_RUN_MS's delta) at zero rather than
    // leaving it to chance.
    const afterDeadline = beforeChunk2PastDeadline
    return [
      startTimeMs,
      beforeChunk1WithinDeadline,
      beforeChunk2PastDeadline,
      afterDeadline, // 4. runTransform: `writeTailStart = clock()`
      afterDeadline, // 5. runTransform: `durationMs = clock() - startTime`
      afterDeadline, // 6. runTransform: `writeTailMs = clock() - writeTailStart`
    ]
  }

  it('attempt 1 at its deadline persists what it classified and exits 75 — with retry_on_exit_code set a timeout is never retried (nick-fields index.ts:96-98,116-120,147)', async () => {
    const revalidate = spy()
    let loggedDurationMs: number | null = null
    const storage = fakeStorage({
      async logPipelineRun(input) {
        loggedDurationMs = input.duration_ms
      },
    })
    const deps = fakeDeps({ sources: () => [manyOffersSource(150)], revalidate: revalidate.fn }, storage)
    const t0 = 1_700_000_000_000
    const clock = statefulClock(deadlineHitClockScript(t0))

    const outcome = await runPipeline(deps, { ...baseOptions, isFinalAttempt: false, clock })

    expect(outcome).toEqual({ status: 'deadline-hit' })
    expect(exitCodeFor(outcome)).toBe(75)
    // "Persists what it has": the chunk that finished before the deadline was
    // written, not discarded.
    expect(deps.storage.storedDeals).toHaveLength(100)
    // F7 (code review of the first WP-P3 submission): `durationMs` must come
    // from the INJECTED clock, not `Date.now()` — this run's whole scripted
    // timeline spans well under an hour (RUN_DEADLINE_MS + a few minutes).
    // `Date.now() - t0` against a fixed 2023 epoch would be billions of ms,
    // which happened to pass silently before because nothing asserted it.
    expect(loggedDurationMs).not.toBeNull()
    expect(loggedDurationMs!).toBeLessThan(2 * 60 * 60_000)
    // F3 (code review of the first WP-P3 submission): attempt 2 is not
    // guaranteed to ever revalidate — it can be killed, throw, or come back
    // `cache-unreadable` (which never reaches `finishRun` at all). The rows
    // attempt 1 already wrote must not wait on that.
    expect(revalidate.calls).toBe(1)
  })

  it('the final attempt at its deadline publishes what it has and exits 0 with run-deferred', async () => {
    // Two more calls than `deadlineHitClockScript`: `finishRun`, reached this
    // time because `isFinalAttempt` is true, evaluates alerts — `now()` for
    // `finishedAtMs`, then again for `evaluateAlerts`'s `nowMs`.
    const t0 = 1_700_000_000_000
    const script = [...deadlineHitClockScript(t0), t0 + RUN_DEADLINE_MS + 60_000, t0 + RUN_DEADLINE_MS + 60_000]
    const deps = fakeDeps({ sources: () => [manyOffersSource(150)] })
    const clock = statefulClock(script)
    const warnings: string[] = []
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      warnings.push(args.map(String).join(' '))
    })

    try {
      const outcome = await runPipeline(deps, { ...baseOptions, isFinalAttempt: true, clock })

      expect(outcome.status).toBe('ok')
      expect(exitCodeFor(outcome)).toBe(0)
      expect(deps.storage.storedDeals).toHaveLength(100)
      expect(warnings.some((w) => /run-deferred/.test(w))).toBe(true)
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('a deadline-hit attempt never licenses a sweep it has not earned (F5) — a thin write does not deactivate 900 good rows on the strength of 100 new ones', async () => {
    // The deadline breaks the loop after chunk 1 (100 of 200 classified and
    // WRITTEN), exactly as in `deadlineHitClockScript`, but this store
    // already has 1000 rows live for the SAME window — 100/1000 = 0.10, far
    // below `MIN_REFRESH_SHARE` (0.5, `stale-sweep.ts`). HANDOVER §4 #5: a
    // guard fed a count of intent, not outcome, licensed sweeping 168 good
    // rows off 2 written ones. This pins that the deadline path — a NEW way
    // to produce a thin write — cannot do the same.
    let capturedPlan: Map<string, StoreSweepPlan> | null = null
    const storage = fakeStorage({
      async activeCountsByWindow() {
        return { ok: true, counts: new Map([['denner', new Map([['2026-09-03', 1000]])]]) }
      },
      async deactivateStaleForStores(_runStartedAt, plan) {
        capturedPlan = plan
        return 0
      },
    })
    const deps = fakeDeps({ sources: () => [manyOffersSource(200)] }, storage)
    const t0 = 1_700_000_000_000
    // 200 products is 2 chunks (100 each); the same two-call deadline script
    // as `deadlineHitClockScript` covers it unchanged — only the offer count
    // (200, not 150) and the live count (1000, via the override above) differ.
    const clock = statefulClock(deadlineHitClockScript(t0))

    await runPipeline(deps, { ...baseOptions, isFinalAttempt: false, clock })

    expect(storage.storedDeals).toHaveLength(100)
    expect(capturedPlan!.get('denner')?.windows.has('2026-09-03')).not.toBe(true)
  })

  it('an unreadable classification cache exits 75 — nothing was written, so nothing needs revalidating', async () => {
    const unreadableCache: ClassificationCache = {
      lookup: async () => err('7 of 8 lookup chunks could not be read'),
      save: async () => ok(0),
    }
    const revalidate = spy()
    const storage = fakeStorage()
    const deps = fakeDeps(
      {
        sources: () => [dennerOfferSource('Bio Vollmilch 1l')],
        createClassificationDeps: async () => ({ ...fakeClassificationDeps(), cache: unreadableCache }),
        revalidate: revalidate.fn,
      },
      storage,
    )

    const outcome = await runPipeline(deps, baseOptions)

    expect(outcome).toEqual({ status: 'cache-unreadable' })
    expect(exitCodeFor(outcome)).toBe(75)
    expect(storage.calls).toEqual([])
    expect(revalidate.calls).toBe(0)
  })
})

describe('the write tail is monitored, not just trusted (N4, code review round 2)', () => {
  it('warns when the write tail takes longer than WRITE_TAIL_MS — the constant scales with deal count and erodes silently', async () => {
    // Named per call, in order, the same discipline as `deadlineHitClockScript`
    // (F9): 1. runPipeline's startTime. 2. classify-deals' one deadline check
    // (1 offer is 1 chunk — still comfortably inside RUN_DEADLINE_MS).
    // 3. writeTailStart. 4. durationMs. 5. writeTailMs — jumped far enough
    // past `writeTailStart` to exceed WRITE_TAIL_MS. 6-7. finishRun's alert
    // evaluation (finishedAtMs, then evaluateAlerts's nowMs) — same fixed
    // value as call 5, so the huge duration reads as zero elapsed time
    // AFTER the run finished, and no stale-run alert fires by accident.
    const t0 = 1_700_000_000_000
    const afterWriteTail = t0 + WRITE_TAIL_MS + 60_000
    const clock = statefulClock([t0, t0, t0, afterWriteTail, afterWriteTail, afterWriteTail, afterWriteTail])
    const deps = fakeDeps({ sources: () => [dennerOfferSource('Bio Vollmilch 1l')] })
    const warnings: string[] = []
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      warnings.push(args.map(String).join(' '))
    })

    try {
      const outcome = await runPipeline(deps, { ...baseOptions, clock })
      expect(outcome.status).toBe('ok')
      expect(warnings.some((w) => w.includes('WRITE_TAIL_MS'))).toBe(true)
    } finally {
      warnSpy.mockRestore()
    }
  })
})

// WP-P7 (RCA 2026-09-15, item 2): the composition-root tests the architect's
// own TDD plan asked for — each one would have caught the reported defect
// where a unit test in isolation could not.
describe('alerts fed real outputs, not literals, through the whole composition root (WP-P7)', () => {
  it('a run that stored 400 deals is not "✅ no alerts" — benchmarkMacroF1 is not wired, and now says so (run 34652857097)', async () => {
    const logs: string[] = []
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '))
    })
    const deps = fakeDeps({ sources: () => [manyOffersSource(400)] })

    try {
      const outcome = await runPipeline(deps, baseOptions)

      expect(outcome.status).toBe('ok')
      expect(deps.storage.storedDeals).toHaveLength(400)
      const alertsLine = logs.find((l) => l.includes('[pipeline] [INFO] alerts:'))
      expect(alertsLine).toBeDefined()
      // Before WP-P7, `benchmarkMacroF1: null` made `evaluateAlerts` skip the
      // regression rule silently — a stored run with real data still logged
      // "✅ no alerts", identical to a run where every instrument was healthy.
      expect(alertsLine).not.toContain('✅ no alerts')
      expect(alertsLine).toContain('instrument-missing')
    } finally {
      logSpy.mockRestore()
    }
  })

  it('a collapsed duplicate is not a failed write — "48 failed" were collapses', async () => {
    const revalidate = spy()
    const storage = fakeStorage({
      async storeDeals(deals) {
        // 100 resolved deals; 48 collapse into duplicate conflict keys
        // BEFORE anything reaches Postgres (storeDeals' own in-memory
        // dedupe) — only 52 could ever have been sent, and all 52 landed.
        // The OLD arithmetic (resolvedLength - storedCount = 48 "failed")
        // would read this as 52% storage — below the 80% threshold — and
        // fail the run on a write that never happened.
        return { attempted: deals.length, total: 52, collapsed: 48, byStore: new Map(), writtenByWindow: new Map() }
      },
    })
    const deps = fakeDeps({ sources: () => [manyOffersSource(100)], revalidate: revalidate.fn }, storage)

    const outcome = await runPipeline(deps, baseOptions)

    expect(outcome.status).toBe('ok')
    expect(revalidate.calls).toBe(1)
  })

  it('a budget-exhausting run exits 1, still revalidates, and 1 is not the retryable code', async () => {
    const revalidate = spy()
    // batchSize: 1 makes every PRODUCT its own tier1 call — the fastest way
    // to reach FREE_TIER_BUDGET.maxCalls (500, guardrails.ts) without a paid
    // judge. 600 products, cold start (COLD_START_LIMIT 800), 6 chunks of
    // 100: chunk 6 finds the budget already spent and halts.
    const oneCallPerProduct: Classifier = {
      name: 'one-by-one',
      tier: 1,
      batchSize: 1,
      async classify(batch) {
        return ok(batch.map((request): ClassificationOutcome => ({ ok: true, request, classification: classification('dairy', 'dairy') })))
      },
    }
    const deps = fakeDeps({
      sources: () => [manyOffersSource(600)],
      createClassificationDeps: async () => fakeClassificationDeps({ tier1: oneCallPerProduct }),
      revalidate: revalidate.fn,
    })

    const outcome = await runPipeline(deps, baseOptions)

    // run-halted is a CRITICAL alert (alerts.ts) once RunSnapshot.halted
    // carries the real reason — before WP-P7 it was a hardcoded `null` and
    // this alert could never fire in production.
    expect(outcome).toEqual({ status: 'alert-failed' })
    expect(exitCodeFor(outcome)).toBe(1)
    // 1 is deterministic — never retried. 75 (EX_TEMPFAIL) is the retryable
    // code, reserved for transient infrastructure failures.
    expect(exitCodeFor(outcome)).not.toBe(75)
    expect(revalidate.calls).toBe(1)
  })

  it('compares against the last successful run — previous was hardcoded null, so cache-hit-rate-low could never fire', async () => {
    // Any snapshot works here — the rule only needs a non-null `previous`
    // to leave its own gate. This run's own cache is empty (0 hits of 200),
    // well below the 50% threshold.
    const previousSnapshot = { runId: 'earlier', finishedAtMs: 0, totalProducts: 1, classified: 1, uncertain: 0, rejected: 0, invalidCategoryRejected: 0, cacheHits: 95, cacheMisses: 5, tokensUsed: 0, usdMicrosSpent: 0 as UsdMicros, spendNearCeiling: false, spendUnguarded: false, durationMs: 1, benchmarkMacroF1: { kind: 'not-measured' as const, reason: 'x' }, publishedDataCoverage: {}, halted: null }
    const runHistory = fakeRunHistory({ lastSuccessful: async () => ok(previousSnapshot) })
    const logs: string[] = []
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '))
    })
    const deps = fakeDeps({ sources: () => [manyOffersSource(200)], runHistory })

    try {
      await runPipeline(deps, baseOptions)
      const alertsLine = logs.find((l) => l.includes('[pipeline] [INFO] alerts:'))
      expect(alertsLine).toContain('cache-hit-rate-low')
    } finally {
      logSpy.mockRestore()
    }
  })

  it('with no previous run, says it could not compare the cache hit rate — never silent about it', async () => {
    const logs: string[] = []
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '))
    })
    const deps = fakeDeps({ sources: () => [manyOffersSource(200)] }) // default fakeRunHistory: lastSuccessful() => ok(null)

    try {
      await runPipeline(deps, baseOptions)
      const alertsLine = logs.find((l) => l.includes('[pipeline] [INFO] alerts:'))
      // Never the OLD silent shape (`previous !== null` gate meant "no
      // history" and "measured and fine" produced the identical empty list).
      expect(alertsLine).not.toContain('cache-hit-rate-low')
      expect(alertsLine).toContain('cache-hit-rate comparison could not be evaluated')
    } finally {
      logSpy.mockRestore()
    }
  })

  it('saves this run\'s snapshot to run history — nothing ever did, so "previous" never had an end condition', async () => {
    const runHistory = fakeRunHistory()
    const deps = fakeDeps({ sources: () => [dennerOfferSource('Bio Vollmilch 1l')], runHistory })

    await runPipeline(deps, baseOptions)

    expect(runHistory.saved).toHaveLength(1)
  })
})

/** A minimal `ClassifyDealsResult['stats']` shape — only `total`/`cacheHits` are read by the alert snapshot. */
function statsOf(total: number): Parameters<typeof finishRun>[1]['stats'] {
  return {
    total,
    cacheHits: 0,
    classified: total,
    uncertain: 0,
    rejected: 0,
    blocked: 0,
    heldBack: 0,
    heldBackByFailure: {},
    judgeUnavailable: 0,
    deferred: 0,
    isColdStart: false,
    deadlineHit: false,
    halted: null,
    tokensUsed: 0,
  }
}

/** The WP-P7 fields every direct `finishRun` call now needs — a run with no offers and no judge spend. */
const noSnapshotInputs = { collapsed: 0, collectedOffers: [], judgeSpend: noJudgeSpend }

function spy(): { fn: () => Promise<void>; calls: number } {
  const state = { calls: 0 }
  return { fn: async () => { state.calls += 1 }, get calls() { return state.calls } }
}

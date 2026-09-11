import { describe, expect, it } from 'vitest'

import { createMoney } from '../domain/money'
import { createOffer } from '../domain/offer'
import type { CollectionResult, OfferSource } from '../domain/offer-source'
import { collected, collectionFailed } from '../domain/offer-source'
import { unwrap } from '../domain/result'
import { createValidityPeriod } from '../domain/validity-period'
import { collectOffers } from './collect-offers'
import { type Clock, createInMemoryTelemetry, toPipelineRunRecord } from './telemetry'

const WEEK_ID = '2026-W37'
const WEEK = unwrap(createValidityPeriod('2026-09-03', '2026-09-09'))

const offer = (retailer: 'denner' | 'coop' | 'lidl' | 'aldi', name: string, price = 1.95) =>
  unwrap(
    createOffer({
      retailer,
      productName: name,
      salePrice: unwrap(createMoney(price)),
      originalPrice: unwrap(createMoney(price + 1)),
      validity: WEEK,
    }),
  )

/** Deterministic clock: every reading advances by a fixed step. */
function fakeClock(stepMs = 10): Clock {
  let t = 1_000
  return {
    now: () => {
      t += stepMs
      return t
    },
    isoNow: () => '2026-09-08T05:00:00.000Z',
  }
}

const sourceReturning = (retailer: 'denner' | 'coop' | 'lidl' | 'aldi', result: CollectionResult): OfferSource => ({
  retailer,
  expectedMinimumOffers: 1,
  fetchOffers: async () => result,
})

const opts = () => ({ clock: fakeClock(), newRunId: () => 'run_test', telemetry: createInMemoryTelemetry() })

describe('collectOffers — happy path', () => {
  it('collects from every source and reports ok', async () => {
    const o = await collectOffers(
      [
        sourceReturning('denner', collected('denner', [offer('denner', 'Schweinsnierstück')])),
        sourceReturning('coop', collected('coop', [offer('coop', 'Naturafarm Speck')])),
      ],
      WEEK_ID,
      opts(),
    )
    expect(o.offers).toHaveLength(2)
    expect(o.trace.status).toBe('ok')
    expect(o.trace.totalOffers).toBe(2)
  })

  it('de-duplicates across the whole run', async () => {
    const dup = offer('denner', 'Danone Activia Joghurt')
    const o = await collectOffers([sourceReturning('denner', collected('denner', [dup, dup]))], WEEK_ID, opts())
    expect(o.offers).toHaveLength(1)
  })
})

describe('collectOffers — one source failing never stops the others', () => {
  it('keeps the good offers and marks the run degraded', async () => {
    const o = await collectOffers(
      [
        sourceReturning('denner', collected('denner', [offer('denner', 'A')])),
        sourceReturning('coop', collectionFailed('coop', 'source-unavailable', 'HTTP 503')),
      ],
      WEEK_ID,
      opts(),
    )
    expect(o.offers).toHaveLength(1)
    expect(o.trace.status).toBe('degraded')
    expect(o.trace.sources.find((s) => s.retailer === 'coop')?.failureReason).toBe('source-unavailable')
  })

  it('reports failed only when every source failed', async () => {
    const o = await collectOffers(
      [
        sourceReturning('denner', collectionFailed('denner', 'source-changed', 'parsed 0')),
        sourceReturning('coop', collectionFailed('coop', 'source-unavailable', 'HTTP 503')),
      ],
      WEEK_ID,
      opts(),
    )
    expect(o.offers).toHaveLength(0)
    expect(o.trace.status).toBe('failed')
  })
})

describe('collectOffers — containment of adapter defects', () => {
  it('contains an adapter that throws instead of returning a result', async () => {
    // Adapters are contractually forbidden from throwing. When one does anyway,
    // the run must survive it.
    const broken: OfferSource = {
      retailer: 'lidl',
      expectedMinimumOffers: 1,
      fetchOffers: async () => {
        throw new Error('Cannot read properties of undefined')
      },
    }
    const o = await collectOffers(
      [broken, sourceReturning('denner', collected('denner', [offer('denner', 'A')]))],
      WEEK_ID,
      opts(),
    )
    expect(o.offers).toHaveLength(1)
    const lidl = o.trace.sources.find((s) => s.retailer === 'lidl')
    expect(lidl?.status).toBe('failed')
    expect(lidl?.failureReason).toBe('source-unavailable')
    expect(lidl?.detail).toContain('adapter threw')
  })

  it('contains a non-Error throw', async () => {
    const weird: OfferSource = {
      retailer: 'aldi',
      expectedMinimumOffers: 1,
      fetchOffers: async () => {
        throw 'string thrown'
      },
    }
    const o = await collectOffers([weird], WEEK_ID, opts())
    expect(o.trace.sources[0]?.detail).toContain('string thrown')
  })

  it('cuts off a source that hangs', async () => {
    const hanging: OfferSource = {
      retailer: 'coop',
      expectedMinimumOffers: 1,
      fetchOffers: () => new Promise(() => {}), // never settles
    }
    const o = await collectOffers(
      [hanging, sourceReturning('denner', collected('denner', [offer('denner', 'A')]))],
      WEEK_ID,
      { ...opts(), timeoutMs: 20 },
    )
    expect(o.offers).toHaveLength(1)
    expect(o.trace.sources.find((s) => s.retailer === 'coop')?.detail).toContain('timed out')
  })
})

describe('collectOffers — tracing', () => {
  it('emits one span per source, with counts and duration', async () => {
    const telemetry = createInMemoryTelemetry()
    await collectOffers(
      [
        sourceReturning('denner', collected('denner', [offer('denner', 'A'), offer('denner', 'B')])),
        sourceReturning('coop', collectionFailed('coop', 'below-expected-yield', 'parsed 3, expected 100')),
      ],
      WEEK_ID,
      { clock: fakeClock(), newRunId: () => 'run_test', telemetry },
    )
    expect(telemetry.spans).toHaveLength(2)
    expect(telemetry.spans[0]?.offerCount).toBe(2)
    expect(telemetry.spans[0]?.durationMs).toBeGreaterThan(0)
    expect(telemetry.spans[1]?.failureReason).toBe('below-expected-yield')
    expect(telemetry.traces).toHaveLength(1)
    expect(telemetry.traces[0]?.runId).toBe('run_test')
  })

  it('carries parse warnings into the span so dropped items are visible', async () => {
    const telemetry = createInMemoryTelemetry()
    await collectOffers(
      [
        sourceReturning(
          'coop',
          collected('coop', [offer('coop', 'A')], [{ message: 'no price found', item: 'page 12 tile 3' }]),
        ),
      ],
      WEEK_ID,
      { clock: fakeClock(), newRunId: () => 'run_test', telemetry },
    )
    expect(telemetry.spans[0]?.warningCount).toBe(1)
    expect(telemetry.spans[0]?.warnings[0]).toBe('page 12 tile 3: no price found')
  })

  it('maps a trace onto the existing pipeline_runs shape', async () => {
    const o = await collectOffers(
      [
        sourceReturning('denner', collected('denner', [offer('denner', 'A')])),
        sourceReturning('coop', collectionFailed('coop', 'source-changed', 'parsed 0 offers')),
      ],
      WEEK_ID,
      opts(),
    )
    const record = toPipelineRunRecord(o.trace)
    expect(record.store_results).toEqual({
      denner: { status: 'ok', count: 1 },
      coop: { status: 'source-changed', count: 0 },
    })
    expect(record.total_stored).toBe(1)
    expect(record.error_log).toContain('[coop] source-changed')
  })

  it('leaves error_log null on a clean run', async () => {
    const o = await collectOffers([sourceReturning('denner', collected('denner', [offer('denner', 'A')]))], WEEK_ID, opts())
    expect(toPipelineRunRecord(o.trace).error_log).toBeNull()
  })
})

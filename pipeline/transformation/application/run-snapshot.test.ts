import { describe, expect, it } from 'vitest'
import { createMoney } from '../../collection/domain/money'
import { createOffer } from '../../collection/domain/offer'
import { publishedQuantity } from '../../collection/domain/source-attributes'
import { createValidityPeriod } from '../../collection/domain/validity-period'
import { unwrap } from '../../collection/domain/result'
import type { UsdMicros } from '../domain/spend'
import type { ClassifyDealsResult } from './classify-deals'
import { type JudgeSpendInfo, buildRunSnapshot } from './run-snapshot'

const WEEK = unwrap(createValidityPeriod('2026-09-03', '2026-09-09'))

const dennerOffer = (name: string, withPublishedData: boolean) =>
  unwrap(
    createOffer({
      retailer: 'denner',
      productName: name,
      salePrice: unwrap(createMoney(1.5)),
      originalPrice: unwrap(createMoney(2)),
      validity: WEEK,
      sourceAttributes: withPublishedData
        ? { quantity: unwrap(publishedQuantity(900, 'g')), packSize: null, unitPrice: null, labels: [], container: null, descriptor: null, wine: null }
        : undefined,
    }),
  )

const baseStats: ClassifyDealsResult['stats'] = {
  total: 100,
  cacheHits: 80,
  classified: 90,
  uncertain: 5,
  rejected: 1,
  blocked: 0,
  heldBack: 4,
  heldBackByFailure: {},
  judgeUnavailable: 0,
  deferred: 0,
  isColdStart: false,
  deadlineHit: false,
  halted: null,
  tokensUsed: 0,
}

const noJudge: JudgeSpendInfo = { guarded: true, spendSnapshot: () => null }

const baseInputs = {
  runId: 'run-1',
  finishedAtMs: 1_700_000_000_000,
  durationMs: 120_000,
  stats: baseStats,
  collectedOffers: [],
  judgeSpend: noJudge,
}

describe('buildRunSnapshot carries real output values, not literals (WP-P7)', () => {
  it('carries the halt reason out of the stats — run.ts hardcoded halted: null', () => {
    const snapshot = buildRunSnapshot({ ...baseInputs, stats: { ...baseStats, halted: 'call budget exhausted: 500/500' } })
    expect(snapshot.halted).toBe('call budget exhausted: 500/500')
  })

  it('reports invalid-category rejections from heldBackByFailure — the graph used to drop the reason', () => {
    const snapshot = buildRunSnapshot({
      ...baseInputs,
      stats: { ...baseStats, heldBackByFailure: { 'invalid-category': 7, 'no-answer': 2 } },
    })
    expect(snapshot.invalidCategoryRejected).toBe(7)
  })

  it('reports zero invalid-category rejections when the breakdown carries none — never undefined', () => {
    const snapshot = buildRunSnapshot(baseInputs)
    expect(snapshot.invalidCategoryRejected).toBe(0)
  })

  it('carries the real accumulated token spend out of stats', () => {
    const snapshot = buildRunSnapshot({ ...baseInputs, stats: { ...baseStats, tokensUsed: 42_000 } })
    expect(snapshot.tokensUsed).toBe(42_000)
  })

  it('computes published-data coverage from the collected offers — run.ts passed {}', () => {
    const offers = [dennerOffer('A', true), dennerOffer('B', true), dennerOffer('C', false)]
    const snapshot = buildRunSnapshot({ ...baseInputs, collectedOffers: offers })
    expect(snapshot.publishedDataCoverage.denner).toBeCloseTo(2 / 3)
  })

  it('a retailer this run never collected is absent from coverage, not zero — "not due" is not "shape changed"', () => {
    const snapshot = buildRunSnapshot({ ...baseInputs, collectedOffers: [dennerOffer('A', true)] })
    expect(snapshot.publishedDataCoverage.aldi).toBeUndefined()
    expect('aldi' in snapshot.publishedDataCoverage).toBe(false)
  })

  it('benchmarkMacroF1 stays not-measured — AP-6 has not been decided by the PM', () => {
    const snapshot = buildRunSnapshot(baseInputs)
    expect(snapshot.benchmarkMacroF1.kind).toBe('not-measured')
  })

  it('carries usdMicrosSpent from the judge\'s own ledger, never a literal zero when it actually spent', () => {
    const spentSnapshot: JudgeSpendInfo = {
      guarded: true,
      spendSnapshot: () => ({ spentMicros: 500_000 as UsdMicros, ceilingMicros: 5_000_000 as UsdMicros }),
    }
    const snapshot = buildRunSnapshot({ ...baseInputs, judgeSpend: spentSnapshot })
    expect(snapshot.usdMicrosSpent).toBe(500_000)
  })

  it('reports spendNearCeiling once spend crosses SPEND_CEILING_WARN_SHARE of the ceiling', () => {
    const near: JudgeSpendInfo = {
      guarded: true,
      spendSnapshot: () => ({ spentMicros: 4_500_000 as UsdMicros, ceilingMicros: 5_000_000 as UsdMicros }),
    }
    const snapshot = buildRunSnapshot({ ...baseInputs, judgeSpend: near })
    expect(snapshot.spendNearCeiling).toBe(true)
  })

  it('does not report spendNearCeiling comfortably under the threshold', () => {
    const comfortable: JudgeSpendInfo = {
      guarded: true,
      spendSnapshot: () => ({ spentMicros: 100_000 as UsdMicros, ceilingMicros: 5_000_000 as UsdMicros }),
    }
    const snapshot = buildRunSnapshot({ ...baseInputs, judgeSpend: comfortable })
    expect(snapshot.spendNearCeiling).toBe(false)
  })

  it('never reports spendNearCeiling when no judge ran at all — nothing to compare against a ceiling', () => {
    const snapshot = buildRunSnapshot(baseInputs)
    expect(snapshot.spendNearCeiling).toBe(false)
    expect(snapshot.usdMicrosSpent).toBe(0)
  })

  it('reports spendUnguarded exactly when judgeSpend.guarded is false — AP-10', () => {
    const unguarded: JudgeSpendInfo = { guarded: false, spendSnapshot: () => null }
    const snapshot = buildRunSnapshot({ ...baseInputs, judgeSpend: unguarded })
    expect(snapshot.spendUnguarded).toBe(true)
  })

  it('does not report spendUnguarded when the account is guarded', () => {
    const snapshot = buildRunSnapshot(baseInputs)
    expect(snapshot.spendUnguarded).toBe(false)
  })
})

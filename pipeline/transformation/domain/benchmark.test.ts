import { describe, expect, it } from 'vitest'
import { macroF1, scoreBenchmark } from './benchmark'
import type { BenchmarkRow, Prediction } from './benchmark'

const row = (name: string, category: string, provenance: 'denner' | 'derived' = 'denner'): BenchmarkRow => ({
  productName: name,
  descriptor: null,
  category,
  subCategory: 'x',
  provenance,
})

const pred = (name: string, category: string): Prediction => ({ productName: name, category, subCategory: 'x' })

describe('macroF1 — why overall accuracy is not enough', () => {
  it('is 1 when every class is perfect', () => {
    const truth = [row('a', 'dairy'), row('b', 'bakery')]
    const preds = [pred('a', 'dairy'), pred('b', 'bakery')]
    expect(macroF1(truth, preds)).toBe(1)
  })

  it('is 0 when nothing is right', () => {
    const truth = [row('a', 'dairy'), row('b', 'bakery')]
    const preds = [pred('a', 'bakery'), pred('b', 'dairy')]
    expect(macroF1(truth, preds)).toBe(0)
  })

  it('punishes ignoring a rare class, where overall accuracy would not', () => {
    // 9 drinks, 1 bakery. A model that always says "drinks" scores 90% overall
    // accuracy — and is useless. Macro-F1 must expose that.
    const truth = [...Array(9)].map((_, i) => row(`d${i}`, 'drinks')).concat(row('b', 'bakery'))
    const lazy = truth.map((t) => pred(t.productName, 'drinks'))

    const overall = truth.filter((t, i) => t.category === lazy[i]?.category).length / truth.length
    expect(overall).toBeCloseTo(0.9)

    // drinks: tp=9 fp=1 fn=0 → precision .9, recall 1 → F1 .947
    // bakery: tp=0 fp=0 fn=1 → F1 0
    // macro = (.947 + 0) / 2 = .474
    // Note it lands BELOW .5: misfiling the bakery item also costs drinks its
    // precision, so laziness is punished twice. That is the point.
    expect(macroF1(truth, lazy)).toBeCloseTo(0.474, 2)
  })

  it('counts a class the model invents against precision', () => {
    const truth = [row('a', 'dairy'), row('b', 'dairy')]
    const preds = [pred('a', 'dairy'), pred('b', 'bakery')]
    // dairy: precision 1, recall 0.5 → F1 0.667. bakery: precision 0 → F1 0.
    expect(macroF1(truth, preds)).toBeCloseTo(0.333, 2)
  })

  it('returns 0 for an empty prediction set rather than dividing by zero', () => {
    expect(macroF1([row('a', 'dairy')], [])).toBe(0)
  })
})

describe('scoreBenchmark — provenance is never mixed', () => {
  const truth = [
    row('milk', 'dairy', 'denner'),
    row('bread', 'bakery', 'denner'),
    row('pesto', 'pantry-canned', 'derived'),
    row('penne', 'pasta-rice-cereals', 'derived'),
  ]

  it('reports denner-only and combined scores separately', () => {
    const preds = [
      pred('milk', 'dairy'), // denner ✓
      pred('bread', 'bakery'), // denner ✓
      pred('pesto', 'snacks-sweets'), // derived ✗
      pred('penne', 'pasta-rice-cereals'), // derived ✓
    ]
    const s = scoreBenchmark(truth, preds)

    expect(s.denner.total).toBe(2)
    expect(s.denner.correct).toBe(2)
    expect(s.derived.total).toBe(2)
    expect(s.derived.correct).toBe(1)
    expect(s.combined.total).toBe(4)
    expect(s.combined.correct).toBe(3)
  })

  it('keeps the honest denner-only score untouched by our own labels', () => {
    // Every derived label wrong; the Denner score must not move.
    const preds = [
      pred('milk', 'dairy'),
      pred('bread', 'bakery'),
      pred('pesto', 'home'),
      pred('penne', 'home'),
    ]
    const s = scoreBenchmark(truth, preds)
    expect(s.denner.accuracy).toBe(1)
    expect(s.derived.accuracy).toBe(0)
  })

  it('reports per-category accuracy so a weak class is visible', () => {
    const preds = [
      pred('milk', 'dairy'),
      pred('bread', 'dairy'), // wrong
      pred('pesto', 'pantry-canned'),
      pred('penne', 'pasta-rice-cereals'),
    ]
    const s = scoreBenchmark(truth, preds)
    expect(s.combined.perCategory['bakery']).toBe(0)
    expect(s.combined.perCategory['dairy']).toBe(1)
  })

  it('counts a missing prediction as wrong, never as absent', () => {
    // Silently dropping an item must not flatter the score.
    const s = scoreBenchmark(truth, [pred('milk', 'dairy')])
    expect(s.combined.total).toBe(4)
    expect(s.combined.correct).toBe(1)
    expect(s.combined.missing).toBe(3)
  })
})

describe('the real benchmark file', () => {
  it('loads, and covers the two categories that used to have none', async () => {
    const data = (await import('../__benchmark__/denner-2026-W37.json', { with: { type: 'json' } })).default as {
      rows: BenchmarkRow[]
      counts: Record<string, number>
    }
    const cats = new Set(data.rows.map((r) => r.category))
    expect(cats.has('pantry-canned')).toBe(true)
    expect(cats.has('pasta-rice-cereals')).toBe(true)
  })

  it('labels every row — nothing is "Other" (D1)', async () => {
    const data = (await import('../__benchmark__/denner-2026-W37.json', { with: { type: 'json' } })).default as {
      rows: BenchmarkRow[]
    }
    const unlabelled = data.rows.filter((r) => !r.category || !r.subCategory)
    expect(unlabelled).toEqual([])
  })

  it('tags every row with a provenance we can separate', async () => {
    const data = (await import('../__benchmark__/denner-2026-W37.json', { with: { type: 'json' } })).default as {
      rows: BenchmarkRow[]
    }
    for (const r of data.rows) {
      expect(['denner', 'derived']).toContain(r.provenance)
    }
  })
})

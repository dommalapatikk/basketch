import { describe, expect, it } from 'vitest'

import { rowsToSweep, sweepPlan, writtenCountsByWindow } from './stale-sweep'
import type { CountsByWindow, FakeDealRow } from './stale-sweep'

describe('writtenCountsByWindow — what this run actually wrote, per store, per window', () => {
  it('counts rows per store per valid_from', () => {
    const counts = writtenCountsByWindow([
      { store: 'aldi', validFrom: '2026-09-17' },
      { store: 'aldi', validFrom: '2026-09-17' },
      { store: 'aldi', validFrom: '2026-09-21' },
      { store: 'lidl', validFrom: '2026-09-17' },
    ])
    expect(counts.get('aldi')).toEqual(new Map([['2026-09-17', 2], ['2026-09-21', 1]]))
    expect(counts.get('lidl')).toEqual(new Map([['2026-09-17', 1]]))
  })

  it('returns an empty map for no written rows', () => {
    expect(writtenCountsByWindow([])).toEqual(new Map())
  })
})

/** Builds a `CountsByWindow` from a plain object, for readable fixtures. */
function counts(byStore: Record<string, Record<string, number>>): CountsByWindow {
  return new Map(Object.entries(byStore).map(([store, windows]) => [store, new Map(Object.entries(windows))]))
}

describe('sweepPlan — which stores, and which of their windows, may be swept', () => {
  /**
   * ITEM #10, 2026-09-15 (F1/F3/F4). `sweepPlan` replaces two guards that
   * used to disagree with each other: a store-level "did it write a
   * plausible share" gate (`storesSafeToSweep`, retired) and a row-level
   * `updated_at` cutoff with no idea which publication a row belonged to.
   * Folding both into one function means there is exactly one place this
   * decision is made, and it cannot be fed two different answers.
   */

  it('never considers a store whose collection failed, however much it wrote', () => {
    const plan = sweepPlan({
      collectionSucceeded: ['coop'],
      writtenByWindow: counts({ coop: { '2026-09-08': 980 }, migros: { '2026-09-08': 34 } }),
      liveByWindow: counts({}),
    })
    expect(plan.has('migros')).toBe(false)
    expect(plan.has('coop')).toBe(true)
  })

  it('omits a store that collected but wrote nothing this run', () => {
    const plan = sweepPlan({
      collectionSucceeded: ['coop', 'migros'],
      writtenByWindow: counts({ coop: { '2026-09-08': 980 } }),
      liveByWindow: counts({}),
    })
    expect(plan.has('migros')).toBe(false)
  })

  it('sweeps a store that has nothing live yet — a first run has nothing to protect', () => {
    const plan = sweepPlan({
      collectionSucceeded: ['spar'],
      writtenByWindow: counts({ spar: { '2026-09-17': 2 } }),
      liveByWindow: counts({}),
    })
    expect(plan.get('spar')?.windows).toEqual(new Set(['2026-09-17']))
  })

  it('an unreadable live count sweeps nothing, for any store', () => {
    // F1: activeCountsByWindow returns null (never an empty map) on a read
    // error. Feeding that through must produce an empty plan, not one that
    // treats "we don't know" as "nothing is live".
    const plan = sweepPlan({
      collectionSucceeded: ['coop', 'aldi', 'lidl'],
      writtenByWindow: counts({ coop: { '2026-09-08': 980 }, aldi: { '2026-09-17': 127 } }),
      liveByWindow: null,
    })
    expect(plan.size).toBe(0)
  })

  it('a next-week flyer does not deactivate this weeks deals — the range excludes a disjoint earlier window', () => {
    // Run 34833209176: ALDI's write covers only 17.9–21.9. This week's
    // window (08.9) is outside that range and must never appear as
    // sweepable, whatever its live count — no share math is needed to
    // protect it, the range excludes it by construction.
    const plan = sweepPlan({
      collectionSucceeded: ['aldi'],
      writtenByWindow: counts({ aldi: { '2026-09-17': 70, '2026-09-21': 57 } }),
      liveByWindow: counts({ aldi: { '2026-09-08': 143, '2026-09-17': 70, '2026-09-21': 57 } }),
    })
    expect(plan.get('aldi')?.range).toEqual({ min: '2026-09-17', max: '2026-09-21' })
    expect(plan.get('aldi')?.windows.has('2026-09-08')).toBe(false)
    expect(plan.get('aldi')?.windows).toEqual(new Set(['2026-09-17', '2026-09-21']))
  })

  it('a disjoint window outside the range is excluded even when the aggregate share alone would allow it', () => {
    // Isolates the RANGE clause from the SHARE clause: 17.9 was written in
    // full (100 of 100 live) — a healthy aggregate that, on share math
    // alone, would also license sweeping the small, untouched, disjoint
    // 08.9 window. The range must exclude 08.9 by construction, before any
    // share arithmetic runs on it at all.
    const plan = sweepPlan({
      collectionSucceeded: ['aldi'],
      writtenByWindow: counts({ aldi: { '2026-09-17': 100 } }),
      liveByWindow: counts({ aldi: { '2026-09-08': 10, '2026-09-17': 100 } }),
    })
    expect(plan.get('aldi')?.windows.has('2026-09-08')).toBe(false)
  })

  it('a thin window beside a healthy one is not swept', () => {
    // aldi wrote both 17.9 (healthy: 70 of a live 70) and 21.9 (thin: 2 of a
    // live 57). Clause (a) judges each window on ITS OWN live count — the
    // healthy sibling must not carry the thin one across the line.
    const plan = sweepPlan({
      collectionSucceeded: ['aldi'],
      writtenByWindow: counts({ aldi: { '2026-09-17': 70, '2026-09-21': 2 } }),
      liveByWindow: counts({ aldi: { '2026-09-17': 70, '2026-09-21': 57 } }),
    })
    expect(plan.get('aldi')?.windows.has('2026-09-17')).toBe(true)
    expect(plan.get('aldi')?.windows.has('2026-09-21')).toBe(false)
  })

  it('a Coop card whose start date moved is swept', () => {
    // 08.9 and 10.9 ARE written this run — 300 of a live 320 (clause (a),
    // healthy) and 20 into a fresh window (clause (a), trivially fine,
    // nothing live yet). 09.9 is the OLD date: five cards that used to carry
    // a 09.9 start date and now appear (this run) dated 08.9 or 10.9
    // instead — their start date MOVED. 09.9 itself is never written this
    // run, so it has no per-window number of its own; clause (b) judges it
    // on the WHOLE range's share (320 written of 325 live ≈ 98%, healthy),
    // which is what lets the old date be swept without ever being
    // individually re-written.
    const plan = sweepPlan({
      collectionSucceeded: ['coop'],
      writtenByWindow: counts({ coop: { '2026-09-08': 300, '2026-09-10': 20 } }),
      liveByWindow: counts({ coop: { '2026-09-08': 320, '2026-09-09': 5, '2026-09-10': 0 } }),
    })
    expect(plan.get('coop')?.windows.has('2026-09-09')).toBe(true) // the old, moved-off date — clause (b)
    expect(plan.get('coop')?.windows.has('2026-09-08')).toBe(true) // written in full — clause (a)
  })

  it("a Coop card's untouched date is not swept when the whole range's share is poor, even beside two healthy written windows", () => {
    // 08.9 and 10.9 each individually pass clause (a) (100 of a live 100 —
    // fully refreshed). But a huge untouched 09.9 (1000 live, 0 written)
    // sits between them, dragging the WHOLE-RANGE share to 200/1200 ≈ 17% —
    // clause (b) must refuse 09.9, even though its written neighbours look
    // perfectly healthy on their own.
    const plan = sweepPlan({
      collectionSucceeded: ['coop'],
      writtenByWindow: counts({ coop: { '2026-09-08': 100, '2026-09-10': 100 } }),
      liveByWindow: counts({ coop: { '2026-09-08': 100, '2026-09-09': 1000, '2026-09-10': 100 } }),
    })
    expect(plan.get('coop')?.windows.has('2026-09-08')).toBe(true)
    expect(plan.get('coop')?.windows.has('2026-09-10')).toBe(true)
    expect(plan.get('coop')?.windows.has('2026-09-09')).toBe(false)
  })

  it('a store past row 1000 is not blocked from a plan — large live counts are summed, not truncated', () => {
    // sweepPlan itself does no pagination (that is activeCountsByWindow's
    // job, store.ts) — this asserts the plan's arithmetic is correct for a
    // realistic large count, so a truncation bug upstream is the only way
    // this could ever misfire.
    const plan = sweepPlan({
      collectionSucceeded: ['coop'],
      writtenByWindow: counts({ coop: { '2026-09-08': 1500 } }),
      liveByWindow: counts({ coop: { '2026-09-08': 1500 } }),
    })
    expect(plan.get('coop')?.windows).toEqual(new Set(['2026-09-08']))
  })

  /**
   * NOT a replay of the real 14.9 incident (item #10) — ALDI's and LIDL's
   * actual next-week windows held 0 live rows before that write, a first
   * publication, so the RANGE clause alone already protects them (see "a
   * next-week flyer does not deactivate..." above), no share math needed.
   *
   * This is a deliberately constructed, realistic-scale stress test of the
   * PER-WINDOW share clause (a) instead: a retry into a window an EARLIER
   * attempt this same run-window had already substantially populated — say
   * ALDI's and LIDL's 17.9 pages, fetched once, then re-fetched after a
   * partial failure and only partly re-parsed. Re-writing a thin fraction of
   * an already-healthy window must not license sweeping the rest of it, at a
   * scale bigger than the small fixtures above (hundreds of rows, seven
   * stores). ALDI writes 127 of a live 270 (≈47%), LIDL 74 of 154 (≈48%) —
   * both below MIN_REFRESH_SHARE and blocked. SPAR, which re-wrote its
   * window in full, is the control and must still be swept.
   */
  it('a thin write into an already-populated window is blocked', () => {
    const liveByWindow = counts({
      aldi: { '2026-09-17': 270 },
      lidl: { '2026-09-17': 154 },
      spar: { '2026-09-17': 76 },
      coop: { '2026-09-08': 450 },
      denner: { '2026-09-08': 210 },
      migros: { '2026-09-08': 280 },
      volg: { '2026-09-16': 83 },
    })

    const plan = sweepPlan({
      collectionSucceeded: ['aldi', 'lidl', 'spar'],
      writtenByWindow: counts({
        aldi: { '2026-09-17': 127 },
        lidl: { '2026-09-17': 74 },
        spar: { '2026-09-17': 76 }, // spar refreshed fully — the control case
      }),
      liveByWindow,
    })

    expect(plan.get('aldi')?.windows.has('2026-09-17')).toBe(false)
    expect(plan.get('lidl')?.windows.has('2026-09-17')).toBe(false)
    expect(plan.get('spar')?.windows.has('2026-09-17')).toBe(true)
  })
})

describe('rowsToSweep — applying a plan to a fake table, asserting the outcome', () => {
  /**
   * F7. Not just "the query was scoped correctly" but "these specific rows
   * stayed active and these specific rows were deactivated" — a small fake
   * that applies the exact predicate `store.ts` sends to Postgres.
   */
  const cutoff = '2026-09-15T05:00:00.000Z'

  function thisWeekRows(count: number): FakeDealRow[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `this-week-${i}`,
      store: 'aldi',
      validFrom: '2026-09-08',
      updatedAt: '2026-09-08T06:00:00.000Z', // old — but outside any written window
      isActive: true,
    }))
  }

  it("this week's 143 ALDI rows stay active; next-week rows not re-written in a written window are swept", () => {
    const plan = sweepPlan({
      collectionSucceeded: ['aldi'],
      writtenByWindow: counts({ aldi: { '2026-09-17': 70, '2026-09-21': 57 } }),
      liveByWindow: counts({
        aldi: { '2026-09-08': 143, '2026-09-17': 71, '2026-09-21': 57 },
      }),
    })

    const rows: FakeDealRow[] = [
      ...thisWeekRows(143),
      // Next week, 17.9: 70 re-written this run (fresh updated_at), 1 that
      // vanished from the flyer (old updated_at — a real withdrawal).
      ...Array.from({ length: 70 }, (_, i) => ({
        id: `next-week-rewritten-${i}`,
        store: 'aldi',
        validFrom: '2026-09-17',
        updatedAt: cutoff, // written AT this run's start or after
        isActive: true,
      })),
      {
        id: 'next-week-vanished',
        store: 'aldi',
        validFrom: '2026-09-17',
        updatedAt: '2026-09-14T09:00:00.000Z',
        isActive: true,
      },
    ]

    const swept = rowsToSweep(rows, plan, cutoff)

    expect(swept).toEqual(['next-week-vanished'])
    const sweptSet = new Set(swept)
    for (const row of thisWeekRows(143)) expect(sweptSet.has(row.id)).toBe(false)
  })

  it('never sweeps an inactive row twice, or a row of a store with no plan', () => {
    const plan = sweepPlan({
      collectionSucceeded: ['aldi'],
      writtenByWindow: counts({ aldi: { '2026-09-17': 10 } }),
      liveByWindow: counts({ aldi: { '2026-09-17': 10 } }),
    })
    const rows: FakeDealRow[] = [
      { id: 'already-off', store: 'aldi', validFrom: '2026-09-17', updatedAt: '2026-09-01T00:00:00.000Z', isActive: false },
      { id: 'no-plan-store', store: 'volg', validFrom: '2026-09-17', updatedAt: '2026-09-01T00:00:00.000Z', isActive: true },
    ]
    expect(rowsToSweep(rows, plan, cutoff)).toEqual([])
  })
})

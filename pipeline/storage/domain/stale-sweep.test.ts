import { describe, expect, it } from 'vitest'

import { storesSafeToSweep } from './stale-sweep'

/**
 * The guard on the most destructive operation in the pipeline.
 *
 * `deactivateStaleForStores` sets is_active = false on every deal for a store
 * that this run did not refresh. That is correct ONLY if the run actually
 * refreshed that store — otherwise "not refreshed" means "we failed", not
 * "the retailer stopped selling it", and the sweep empties the aisle.
 *
 * The 2026-09-11 live cutover is the case this exists for: all seven
 * retailers collected (1,670 offers), then every classification call timed
 * out, so nothing was stored. Collection had "succeeded" for all seven, so the
 * sweep would have deactivated every deal on the site. It only survived
 * because a 15-minute step timeout fired first.
 */
describe('storesSafeToSweep', () => {
  it('sweeps a store that was refreshed this run', () => {
    const safe = storesSafeToSweep({
      collectionSucceeded: ['coop'],
      storedByStore: new Map([['coop', 980]]),
    })
    expect(safe).toEqual(['coop'])
  })

  it('REFUSES to sweep a store that stored nothing', () => {
    // Collection worked, storage did not. Every existing deal for this store
    // would look stale, and all of them would be switched off.
    const safe = storesSafeToSweep({
      collectionSucceeded: ['coop', 'migros'],
      storedByStore: new Map([['coop', 980]]),
    })
    expect(safe).toEqual(['coop'])
  })

  it('refuses every store when the run stored nothing at all', () => {
    // The exact shape of the failed live cutover.
    const safe = storesSafeToSweep({
      collectionSucceeded: ['coop', 'migros', 'lidl', 'aldi', 'denner', 'spar', 'volg'],
      storedByStore: new Map(),
    })
    expect(safe).toEqual([])
  })

  it('never sweeps a store whose collection failed, however much was stored', () => {
    // Failure-safe: a store that did not fetch keeps its last-known data.
    const safe = storesSafeToSweep({
      collectionSucceeded: ['coop'],
      storedByStore: new Map([
        ['coop', 980],
        ['migros', 34],
      ]),
    })
    expect(safe).toEqual(['coop'])
  })

  it('treats an explicit zero the same as absent', () => {
    const safe = storesSafeToSweep({
      collectionSucceeded: ['coop'],
      storedByStore: new Map([['coop', 0]]),
    })
    expect(safe).toEqual([])
  })

  it('returns nothing when no store collected', () => {
    expect(storesSafeToSweep({ collectionSucceeded: [], storedByStore: new Map() })).toEqual([])
  })

  it('keeps the caller order so the log reads predictably', () => {
    const safe = storesSafeToSweep({
      collectionSucceeded: ['coop', 'migros', 'volg'],
      storedByStore: new Map([
        ['volg', 25],
        ['coop', 980],
        ['migros', 34],
      ]),
    })
    expect(safe).toEqual(['coop', 'migros', 'volg'])
  })
})

describe('the count must come from the writer, not from the input', () => {
  /**
   * DEFECT #5, found 2026-09-11 by two independent reviews of the #2 fix.
   *
   * `storesSafeToSweep` was correct. It was fed the wrong number: run.ts passed
   * `countByStore(resolved)` — the deals HANDED TO the writer — so a run where
   * every row was rejected by the database still reported seven stores with
   * hundreds of deals each.
   *
   * Replay the real 2026-09-11 failure against that: storeDeals returns 0
   * because every row violated deals_category_check, `resolved` still holds 922
   * entries across seven stores, so every store looks sweepable and
   * deactivateStaleForStores switches off every deal on a public site.
   *
   * The fix for #2 moved the invariant into this module and then handed it an
   * intent count. A guard fed a lie is not a guard.
   */
  it('refuses a store the writer rejected, even though collection succeeded', async () => {
    // 922 rows handed over, 0 accepted — the exact shape of the failure.
    const safe = storesSafeToSweep({
      collectionSucceeded: ['coop', 'denner', 'migros', 'lidl', 'aldi', 'spar', 'volg'],
      storedByStore: new Map(), // what the DATABASE accepted
    })
    expect(safe).toEqual([])
  })

  it('sweeps only the stores whose rows actually landed', async () => {
    // The realistic partial case: Coop and Denner wrote, the rest did not.
    const safe = storesSafeToSweep({
      collectionSucceeded: ['coop', 'denner', 'migros', 'lidl'],
      storedByStore: new Map([
        ['coop', 316],
        ['denner', 107],
      ]),
    })
    expect(safe).toEqual(['coop', 'denner'])
  })
})

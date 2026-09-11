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

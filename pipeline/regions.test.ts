// Sanity: regions data + helpers.

import { describe, it, expect } from 'vitest'

import { ALL_CANTONS, CANTONS, STORE_CANTONS, isValidCanton, storesInCanton } from '../shared/regions'

describe('regions data', () => {
  it('has 26 Swiss cantons', () => {
    expect(CANTONS).toHaveLength(26)
    expect(ALL_CANTONS).toHaveLength(26)
  })

  it('STORE_CANTONS has an entry for every known store', () => {
    const stores = Object.keys(STORE_CANTONS)
    expect(stores).toHaveLength(7)
    for (const cantons of Object.values(STORE_CANTONS)) {
      expect(cantons.length).toBeGreaterThan(0)
    }
  })
})

describe('isValidCanton', () => {
  it('recognises known canton codes', () => {
    expect(isValidCanton('BE')).toBe(true)
    expect(isValidCanton('ZH')).toBe(true)
  })
  it('rejects unknown or falsy values', () => {
    expect(isValidCanton('XX')).toBe(false)
    expect(isValidCanton(null)).toBe(false)
    expect(isValidCanton('')).toBe(false)
  })
})

describe('storesInCanton', () => {
  it('returns all stores for "all"', () => {
    expect(storesInCanton('all')).toHaveLength(7)
  })

  it('keeps Migros/Coop/Denner in every canton', () => {
    for (const canton of ALL_CANTONS) {
      const stores = storesInCanton(canton)
      expect(stores).toContain('migros')
      expect(stores).toContain('coop')
      expect(stores).toContain('denner')
    }
  })

  it('returns a reasonable subset for small cantons (UR, OW, NW, AR, AI)', () => {
    for (const c of ['UR', 'OW', 'NW', 'AR', 'AI'] as const) {
      const stores = storesInCanton(c)
      expect(stores.length).toBeGreaterThan(0)
      expect(stores.length).toBeLessThanOrEqual(7)
    }
  })
})

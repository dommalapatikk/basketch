import { describe, expect, it } from 'vitest'

import {
  activeFilterCount,
  DEFAULT_FILTERS,
  isFiltersDefault,
  parseFilters,
  serializeFilters,
} from './filters'

describe('the storage parameter', () => {
  // The Frozen browse tile is this filter saved, so the URL has to carry it —
  // a tile that cannot be linked to is not a browse entry point.
  it('round-trips through the URL', () => {
    const parsed = parseFilters({ storage: 'frozen' })
    expect(parsed.storage).toBe('frozen')
    expect(serializeFilters(parsed)).toBe('?storage=frozen')
  })

  it('accepts every state the database allows', () => {
    for (const s of ['fresh', 'chilled', 'frozen', 'ambient']) {
      expect(parseFilters({ storage: s }).storage).toBe(s)
    }
  })

  it('falls back to no filter on a value it does not recognise', () => {
    // A hand-edited URL shows everything rather than nothing. Matching the
    // German word a retailer prints would otherwise empty the page.
    expect(parseFilters({ storage: 'tiefkuehl' }).storage).toBeNull()
    expect(parseFilters({ storage: '' }).storage).toBeNull()
  })

  it('is absent from a default URL', () => {
    expect(serializeFilters(DEFAULT_FILTERS)).toBe('')
    expect(isFiltersDefault(DEFAULT_FILTERS)).toBe(true)
  })

  it('stops the filter set being default once set', () => {
    const f = { ...DEFAULT_FILTERS, storage: 'frozen' as const }
    expect(isFiltersDefault(f)).toBe(false)
    expect(activeFilterCount(f)).toBe(1)
  })

  it('composes with the other dimensions rather than replacing them', () => {
    // "Frozen vegetables" has to be reachable — storage is orthogonal to
    // category, which is the whole point of ADR-001.
    const f = parseFilters({ type: 'fresh', cat: 'vegetables', storage: 'frozen' })
    expect(f).toMatchObject({ type: 'fresh', category: 'vegetables', storage: 'frozen' })
    expect(serializeFilters(f)).toBe('?type=fresh&cat=vegetables&storage=frozen')
    expect(activeFilterCount(f)).toBe(3)
  })

  it('survives a round-trip alongside stores and search', () => {
    const f = parseFilters({ storage: 'chilled', stores: 'coop,migros', q: 'milch' })
    const again = parseFilters(
      Object.fromEntries(new URLSearchParams(serializeFilters(f).slice(1))),
    )
    expect(again).toEqual(f)
  })
})

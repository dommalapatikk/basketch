import { describe, expect, it } from 'vitest'

import { parseStorageState, STORAGE_STATES } from './storage-state'

/**
 * One place that decides what a storage state is.
 *
 * Before this existed the same question was answered in three: a type guard in
 * shared/types.ts, a second copy inside supabase-provider.mapRow, and a third
 * as a Set in lib/filters.ts. Three answers to one question is three chances
 * for them to disagree, and the database CHECK constraint is the only one of
 * them that actually stops a bad value.
 */
describe('parseStorageState', () => {
  it('accepts every value the database CHECK constraint allows', () => {
    for (const s of ['fresh', 'chilled', 'frozen', 'ambient']) {
      expect(parseStorageState(s)).toBe(s)
    }
  })

  it('exposes the same list the constraint holds, in a stable order', () => {
    expect([...STORAGE_STATES]).toEqual(['fresh', 'chilled', 'frozen', 'ambient'])
  })

  it('returns null for the German words a retailer actually prints', () => {
    // The model can return 'tiefkühl'; the column stores 'frozen'. Translating
    // here would be inventing data — the enrich step is where that mapping
    // belongs, and it either produced a valid value or it produced nothing.
    expect(parseStorageState('tiefkühl')).toBeNull()
    expect(parseStorageState('gekühlt')).toBeNull()
  })

  it('returns null for absent values rather than defaulting to ambient', () => {
    // "Not stated" is not "ambient". A deal with no storage answers no storage
    // question, and guessing would put fresh fish in the ambient aisle.
    expect(parseStorageState(null)).toBeNull()
    expect(parseStorageState(undefined)).toBeNull()
    expect(parseStorageState('')).toBeNull()
  })

  it('returns null for non-strings without throwing', () => {
    expect(parseStorageState(42)).toBeNull()
    expect(parseStorageState({})).toBeNull()
    expect(parseStorageState(['frozen'])).toBeNull()
  })

  it('does not silently accept a near-miss', () => {
    expect(parseStorageState('Frozen')).toBeNull()
    expect(parseStorageState(' frozen ')).toBeNull()
  })
})

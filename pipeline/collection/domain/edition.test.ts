import { describe, expect, it } from 'vitest'

import { edition, formatEdition } from './edition'
import { createIsoWeek } from './iso-week'
import { unwrap } from './result'

const W37 = unwrap(createIsoWeek('2026-W37'))

describe('edition', () => {
  it('names the retailer and the publication together', () => {
    const e = edition('migros', W37)
    expect(e).toEqual({ retailer: 'migros', publication: W37 })
  })

  it('two editions of the same retailer and week are equal by value', () => {
    expect(edition('lidl', W37)).toEqual(edition('lidl', W37))
  })

  it('formats as retailer:publication for logs and error messages', () => {
    expect(formatEdition(edition('aldi', W37))).toBe('aldi:2026-W37')
  })
})

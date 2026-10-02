import { describe, expect, it } from 'vitest'

import { uniqueStrings } from './unique-strings'

describe('uniqueStrings', () => {
  it('removes duplicates', () => {
    expect(uniqueStrings(['Schweiz', 'Italien', 'Schweiz'])).toEqual(['Italien', 'Schweiz'])
  })

  // Regression: S2871 — the default .sort() orders by UTF-16 code unit, which put
  // 'Ägypten', 'Österreich' and 'Übersee' after 'Zypern' in the origin chip row.
  it('orders umlaut labels the German way (Ä with A, Ö with O, Ü with U)', () => {
    const result = uniqueStrings([
      'Zypern',
      'Österreich',
      'Ägypten',
      'Albanien',
      'Übersee',
      'Ungarn',
    ])
    expect(result).toEqual(['Ägypten', 'Albanien', 'Österreich', 'Übersee', 'Ungarn', 'Zypern'])
  })
})

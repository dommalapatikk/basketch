// Port contract — one shared suite every collection adapter must pass.
//
// CLAUDE.md § Test-Driven Development: "Port contract test — one shared suite
// every adapter must pass." This is that suite for the display-truncation
// guard (WP-C3 / HANDOVER item 8): whatever an adapter's own parser does, no
// offer it produces may carry a name a visitor would see cut off mid-word.
//
// Runs each adapter's own pure parse function against its own committed
// fixture — offline, fast, deterministic (CLAUDE.md § TDD step 3) — the same
// fixtures and reference dates each adapter's own unit tests already use.
//
// Coop uses the April 51-card fixture, not the 6-card one: it is the fixture
// with real truncated cards in it, so this is the suite that would have gone
// red on the pre-WP-C3 adapter (mutation: reintroduce h3-only reading in
// coop-aktionis-source.ts and this file fails, Coop only).

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { isDisplayTruncated } from '../../../shared/types'
import type { Offer } from '../domain/offer'
import { unwrap } from '../domain/result'
import { createValidityPeriod } from '../domain/validity-period'
import { parseFlyer as parseAldiFlyer } from './aldi/aldi-flyer-source'
import { parsePage as parseCoopPage } from './coop/coop-aktionis-source'
import { parseResponse as parseDennerResponse } from './denner/denner-api-source'
import { parseFlyer as parseLidlFlyer } from './lidl/lidl-flyer-source'
import { type OcrPage, parseFlyer as parseMigrosFlyer } from './migros/migros-flyer-source'
import { parseBboxXml } from './pdf/pdf-words'
import { parseFlyer as parseSparFlyer } from './spar/spar-flyer-source'
import { parsePage as parseVolgPage } from './volg/volg-html-source'

const fixture = (retailer: string, name: string) =>
  readFileSync(join(__dirname, retailer, '__fixtures__', name), 'utf8')

const WEEK = unwrap(createValidityPeriod('2026-09-03', '2026-09-09'))
const REFERENCE = new Date('2026-09-09T00:00:00Z')
const FALLBACK = unwrap(createValidityPeriod('2026-09-10', '2026-09-16'))

/** Every adapter's offers, parsed from its own committed fixture. Pure — no I/O. */
function offersByRetailer(): { retailer: string; offers: readonly Offer[] }[] {
  const dennerFixture = JSON.parse(fixture('denner', 'weekly-special-page1.json'))
  const aldiPages = parseBboxXml(fixture('aldi', 'catalog-kw37-pages3-6.xml'))
  const sparPages = parseBboxXml(fixture('spar', 'flyer-kw37-pages1-3.xml'))
  const lidlFlyer = JSON.parse(fixture('lidl', 'flyer-kw37.json'))
  const lidlPdfText = fixture('lidl', 'flyer-kw37-pages.txt')
  const migrosPages: OcrPage[] = JSON.parse(fixture('migros', 'ocr-kw36-zh-pages2-5.json'))

  return [
    { retailer: 'denner', offers: parseDennerResponse(dennerFixture, WEEK).offers },
    { retailer: 'volg', offers: parseVolgPage(fixture('volg', 'wochenaktionen.html'), REFERENCE).offers },
    { retailer: 'aldi', offers: parseAldiFlyer(aldiPages, REFERENCE, null).offers },
    { retailer: 'spar', offers: parseSparFlyer(sparPages, FALLBACK).offers },
    { retailer: 'lidl', offers: parseLidlFlyer(lidlFlyer, lidlPdfText).offers },
    { retailer: 'migros', offers: parseMigrosFlyer(migrosPages, REFERENCE, null).offers },
    // The April 51-card fixture, not the 6-card one — it is the one with 18
    // real truncated cards, so it is the fixture this guard is FOR.
    { retailer: 'coop', offers: parseCoopPage(fixture('coop', 'coop-page-1-april-51cards.html')).offers },
  ]
}

describe('port contract — no adapter emits a display-truncated name', () => {
  const suites = offersByRetailer()

  it('finds offers to check in every adapter fixture — guards against a silently empty suite', () => {
    expect(suites.length).toBe(7)
    for (const { retailer, offers } of suites) {
      expect(offers.length, `${retailer} produced zero offers from its own fixture`).toBeGreaterThan(0)
    }
  })

  it.each(suites.map(({ retailer, offers }) => [retailer, offers] as const))('%s', (retailer, offers) => {
    const truncated = offers.filter((o) => isDisplayTruncated(o.productName)).map((o) => o.productName)
    expect(truncated, `${retailer} emitted a display-truncated name`).toEqual([])
  })
})

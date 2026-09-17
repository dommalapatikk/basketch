import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { isDisplayTruncated } from '../../../../shared/types'
import { collectOffers } from '../../application/collect-offers'
import { edition } from '../../domain/edition'
import { createIsoWeek } from '../../domain/iso-week'
import { dedupeOffers, offerKey } from '../../domain/offer'
import { unwrap } from '../../domain/result'
import {
  createCoopAktionisSource,
  mapCardToOffer,
  parseCardDate,
  parseCards,
  parseDiscountPercent,
  parsePage,
  parsePrice,
} from './coop-aktionis-source'

const EDITION_37 = edition('coop', unwrap(createIsoWeek('2026-W37')))

const FIXTURE = readFileSync(join(__dirname, '__fixtures__/vendors-coop-page1.html'), 'utf8')
// The full 51-card April capture, copied from pipeline/aktionis/fixtures/coop-page-1.html
// before WP-P4 deletes that legacy folder — this is the only copy of it in
// the repo. 18 of its 51 cards are truncated by aktionis, including two real
// Soave vintages and four real L'Oréal shades (HANDOVER item 8).
const APRIL_FIXTURE = readFileSync(join(__dirname, '__fixtures__/coop-page-1-april-51cards.html'), 'utf8')

describe('parsePrice', () => {
  it('reads aktionis prices', () => {
    expect(parsePrice('4.45')).toBe(4.45)
    expect(parsePrice('101.70')).toBe(101.7)
  })

  it('reads whole-franc shorthand', () => {
    expect(parsePrice('10.–')).toBe(10)
  })

  it('returns null when absent', () => {
    expect(parsePrice(null)).toBeNull()
    expect(parsePrice('gratis')).toBeNull()
  })
})

describe('parseDiscountPercent', () => {
  it('reads the badge', () => {
    expect(parseDiscountPercent('55%')).toBe(55)
    expect(parseDiscountPercent('53%')).toBe(53)
  })

  it('returns null without a percentage', () => {
    expect(parseDiscountPercent('AKTION')).toBeNull()
    expect(parseDiscountPercent(null)).toBeNull()
  })
})

describe('parseCardDate — full year is printed, nothing inferred', () => {
  it('reads a same-week window', () => {
    expect(parseCardDate('07.09.2026 - 09.09.2026')).toEqual({ from: '2026-09-07', to: '2026-09-09' })
  })

  it('reads a long-running campaign window', () => {
    // Household lines run for weeks; the end date is what matters for expiry.
    expect(parseCardDate('27.08.2026 - 09.09.2026')).toEqual({ from: '2026-08-27', to: '2026-09-09' })
  })

  it('accepts an en-dash separator', () => {
    expect(parseCardDate('03.09.2026 – 09.09.2026')).toEqual({ from: '2026-09-03', to: '2026-09-09' })
  })

  it('returns null on anything else', () => {
    expect(parseCardDate('noch 3 Tage')).toBeNull()
    expect(parseCardDate(null)).toBeNull()
  })
})

describe('parsePage — against the real captured page', () => {
  const { offers, warnings } = parsePage(FIXTURE)

  it('extracts every card with no warnings', () => {
    expect(parseCards(FIXTURE).length).toBeGreaterThan(0)
    expect(offers.length).toBe(parseCards(FIXTURE).length)
    expect(warnings).toEqual([])
  })

  it('reads a card exactly', () => {
    const o = offers.find((x) => x.productName.startsWith('Lindt Matcha'))
    expect(o?.salePrice.rappen).toBe(445)
    expect(o?.originalPrice?.rappen).toBe(995)
    expect(o?.discount?.percent).toBe(55)
    expect(o?.discount?.provenance).toBe('printed')
    expect(o?.validity).toEqual({ from: '2026-09-07', to: '2026-09-09' })
  })

  it('carries per-deal validity windows, not one shared week', () => {
    // Real aktionis data has campaigns starting on different dates but ending
    // together. Flattening them to one window would misstate when an offer began.
    const froms = new Set(offers.map((o) => o.validity.from))
    expect(froms.size).toBeGreaterThan(1)
    expect(new Set(offers.map((o) => o.validity.to))).toEqual(new Set(['2026-09-09']))
  })

  it('hotlinks the image rather than copying it', () => {
    const o = offers.find((x) => x.productName.startsWith('Lindt Matcha'))
    expect(o?.image?.kind).toBe('source-url')
    if (o?.image?.kind === 'source-url') expect(o.image.url).toContain('storage.cpstatic.ch')
  })

  it('builds an absolute source URL', () => {
    expect(offers.every((o) => o.sourceUrl?.startsWith('https://www.aktionis.ch/deals/'))).toBe(true)
  })

  it('leaves sourceCategory null — aktionis labels are not Coop’s own', () => {
    // aktionis publishes a 39-label taxonomy, but it is a third party's
    // labelling. Passing it as sourceCategory would misrepresent provenance.
    expect(offers.every((o) => o.sourceCategory === null)).toBe(true)
  })

  it('keeps both Soave Classico vintages (2024, 2025) — aktionis truncates them to one title', () => {
    // REPLACES the old "de-duplicates the repeated cards aktionis actually
    // serves" test, which asserted the defect: it called two real vintages
    // (aktionis ids 1566602 and 1566601) "duplicate rows" because aktionis
    // truncates both h3s to the identical
    // "Soave Classico DOC Rocca Alata Cantina di Soave 6x 75cl...". They are
    // not duplicates — losing the vintage must not also lose the offer.
    const soave = offers.filter((o) => o.productName.startsWith('Soave Classico'))
    expect(soave).toHaveLength(2)
    expect(new Set(soave.map((o) => o.productName))).toEqual(
      new Set([
        'Soave Classico DOC Rocca Alata Cantina di Soave 6x 75cl (2025)',
        'Soave Classico DOC Rocca Alata Cantina di Soave 6x 75cl (2024)',
      ]),
    )
    expect(soave.every((o) => !isDisplayTruncated(o.productName))).toBe(true)
    expect(dedupeOffers(offers)).toHaveLength(offers.length)
  })

  it('every printed discount is consistent with its prices', () => {
    for (const o of offers) {
      if (!o.originalPrice || !o.discount) continue
      const actual = ((o.originalPrice.rappen - o.salePrice.rappen) / o.originalPrice.rappen) * 100
      expect(Math.abs(actual - o.discount.percent)).toBeLessThanOrEqual(1.5)
    }
  })
})

describe('parsePage — against the April 51-card capture (WP-C3 / HANDOVER item 8)', () => {
  // Copied from pipeline/aktionis/fixtures/coop-page-1.html before WP-P4
  // deletes that legacy folder. 18 of its 51 cards are truncated by aktionis.
  const { offers, warnings } = parsePage(APRIL_FIXTURE)

  it('finds truncated cards to test against — guards against a silently empty fixture', () => {
    // If this ever drops to 0, the fixture (or the h3 regex) has changed and
    // every test below would pass vacuously.
    const truncatedCards = parseCards(APRIL_FIXTURE).filter((c) => {
      const m = c.match(/class="card-title[^"]*"[^>]*>([\s\S]*?)<\/h3>/)
      return m?.[1] ? isDisplayTruncated(m[1].replace(/\s+/g, ' ').trim()) : false
    })
    expect(truncatedCards.length).toBe(18)
  })

  it("four L'Oréal shades stay four offers", () => {
    const lipsticks = offers.filter((o) => o.productName.startsWith("L'Oréal Paris Lippenstift"))
    expect(lipsticks).toHaveLength(4)
    expect(new Set(lipsticks.map((o) => o.productName))).toEqual(
      new Set([
        "L'Oréal Paris Lippenstift Brilliant Signature Plump-in-Gloss 400 I Maximize",
        "L'Oréal Paris Lippenstift Brilliant Signature Plump-in-Gloss 404 I Assert",
        "L'Oréal Paris Lippenstift Brilliant Signature Plump-in-Gloss 408 I Accentuate",
        "L'Oréal Paris Lippenstift Brilliant Signature Plump-in-Gloss 412 I Heighten",
      ]),
    )
    expect(lipsticks.every((o) => !isDisplayTruncated(o.productName))).toBe(true)
    expect(new Set(lipsticks.map((o) => offerKey(o))).size).toBe(4)
  })

  it('the aktionis appended descriptor never reaches the name, the descriptor, or the classifier (TP-8)', () => {
    // aktionis appends " – <type>, <country> (<volume>)" to every wine's
    // title. TP-8: identity only — the vintage stays, the descriptor is
    // dropped, never stored, never displayed, never handed to the classifier.
    const wines = offers.filter((o) => /\(20\d\d\)$/.test(o.productName))
    expect(wines.length).toBeGreaterThan(0)
    for (const o of wines) {
      expect(o.productName).not.toContain(' – ')
      expect(o.productName).not.toMatch(/Weisswein|Rotwein|Roséwein|Schaumwein/)
      // The only place a retailer's own free-text line can travel forward —
      // and aktionis' descriptor is not Coop's own, so it must never land here.
      expect(o.sourceAttributes.descriptor).toBeNull()
    }
    // The vintage — real product identity — survives.
    expect(offers.some((o) => o.productName.endsWith('(2024)'))).toBe(true)
    expect(offers.some((o) => o.productName.endsWith('(2023)'))).toBe(true)
  })

  it('resolves every truncated card via the title cross-check — none falls back to the h3 on real data', () => {
    // If aktionis' markup ever changes, this is where it would show up: a
    // "does not extend" warning appearing on real, uncorrupted data.
    const fallbackWarnings = warnings.filter((w) => w.message.includes('does not extend'))
    expect(fallbackWarnings).toEqual([])
  })

  it('no offer emitted from the April fixture carries a display-truncated name', () => {
    expect(offers.filter((o) => isDisplayTruncated(o.productName))).toEqual([])
  })
})

describe('resolving the full name — the title cross-check (WP-C3 / HANDOVER item 8)', () => {
  it('falls back to the h3 with a warning when the title attribute does not extend it', () => {
    // A synthetic mutated card: aktionis truncates the h3 as usual, but the
    // title attribute has been rewritten to something that does NOT start
    // with the truncated prefix — simulating aktionis changing its markup.
    const card =
      '<div data-upox-id="1">' +
      '<a href="/deals/mystery" title="Mehr Infos über Ein völlig anderer Name">' +
      '<h3 class="card-title">Langer Produktname der abgeschnitten wird...</h3>' +
      '</a>' +
      '<span class="card-date">07.09.2026 - 09.09.2026</span>' +
      '<span class="price-new">1.00</span>' +
      '</div>'
    const r = mapCardToOffer(card)
    expect('offer' in r).toBe(true)
    if ('offer' in r) {
      expect(r.offer.productName).toBe('Langer Produktname der abgeschnitten wird...')
      expect(isDisplayTruncated(r.offer.productName)).toBe(true)
      expect(r.warning).toContain('does not extend')
    }
  })

  it('uses the title when it genuinely extends the truncated h3', () => {
    const card =
      '<div data-upox-id="1">' +
      '<a href="/deals/real" title="Mehr Infos über Langer Produktname der abgeschnitten wird komplett">' +
      '<h3 class="card-title">Langer Produktname der abgeschnitten wird...</h3>' +
      '</a>' +
      '<span class="card-date">07.09.2026 - 09.09.2026</span>' +
      '<span class="price-new">1.00</span>' +
      '</div>'
    const r = mapCardToOffer(card)
    expect('offer' in r).toBe(true)
    if ('offer' in r) {
      expect(r.offer.productName).toBe('Langer Produktname der abgeschnitten wird komplett')
      expect(r.warning).toBeUndefined()
    }
  })

  it('a name containing an en dash keeps its full name — the dash is not always aktionis’ own descriptor (code review F1)', () => {
    // "Bio Rüebli – Schweiz" is not truncated, so it never reaches the
    // cross-check at all — it goes straight through stripAktionisDescriptor.
    // Before the shape guard, indexOf(' – ') alone would have cut this to
    // "Bio Rüebli" permanently, with no warning: display truncation by a
    // different route than the h3 one this file exists to fix.
    const card =
      '<div data-upox-id="1">' +
      '<a href="/deals/bio-rueebli" title="Mehr Infos über Bio Rüebli – Schweiz">' +
      '<h3 class="card-title">Bio Rüebli – Schweiz</h3>' +
      '</a>' +
      '<span class="card-date">07.09.2026 - 09.09.2026</span>' +
      '<span class="price-new">1.00</span>' +
      '</div>'
    const r = mapCardToOffer(card)
    expect('offer' in r).toBe(true)
    if ('offer' in r) {
      expect(r.offer.productName).toBe('Bio Rüebli – Schweiz')
      expect(r.warning).toContain("does not match aktionis' descriptor shape")
    }
  })

  // Code review N3: every descriptor in both fixtures ends in a litre volume,
  // so narrowing the unit class to `l` passed all 1,216 tests. These lock the
  // other units aktionis actually uses, and N1's em dash, so a future tighten
  // of either has to be deliberate.
  it.each([
    ['g', 'Bio Basilikum Pesto – Sauce, Italien (250g)', 'Bio Basilikum Pesto'],
    ['cl', 'Rioja DOCa Reserva – Rotwein, Spanien (50cl)', 'Rioja DOCa Reserva'],
    ['an em dash', 'Prosecco DOC Treviso — Schaumwein, Italien (0.75l)', 'Prosecco DOC Treviso'],
  ])('strips a descriptor ending in %s (code review N1, N3)', (_unit, title, expected) => {
    const card =
      '<div data-upox-id="1">' +
      `<a href="/deals/x" title="Mehr Infos über ${title}">` +
      `<h3 class="card-title">${title}</h3>` +
      '</a>' +
      '<span class="card-date">07.09.2026 - 09.09.2026</span>' +
      '<span class="price-new">1.00</span>' +
      '</div>'
    const r = mapCardToOffer(card)
    expect('offer' in r).toBe(true)
    if ('offer' in r) {
      expect(r.offer.productName).toBe(expected)
      expect(r.warning).toBeUndefined()
    }
  })
})

describe('mapCardToOffer — defensive', () => {
  it('warns on a card with no title', () => {
    expect('warning' in mapCardToOffer('<div data-upox-id="1"></div>')).toBe(true)
  })

  it('warns when the validity window is missing', () => {
    const card = '<div data-upox-id="1"><h3 class="card-title">X</h3><span class="price-new">1.00</span></div>'
    const r = mapCardToOffer(card)
    expect('warning' in r).toBe(true)
    if ('warning' in r) expect(r.warning).toContain('validity')
  })
})

describe('createCoopAktionisSource + collectOffers — the composition-level check', () => {
  // Deliberately uses createCoopAktionisSource directly (the exact function
  // live-sources.ts's createLiveSources wires for Coop) together with
  // collectOffers (the exact application-layer function run.ts calls),
  // rather than the full seven-retailer createLiveSources factory: the
  // other six retailers' transport plumbing is irrelevant to this defect,
  // and createLiveSources hard-codes Coop's real 300-offer yield floor,
  // which the 6-card fixture could never clear.
  it('createCoopAktionisSource + collectOffers over the Coop fixture keeps 6 of 6 cards', async () => {
    const source = createCoopAktionisSource({
      fetchPage: async (p) => (p === 1 ? FIXTURE : ''),
      expectedMinimumOffers: 1,
    })
    const outcome = await collectOffers([source], unwrap(createIsoWeek('2026-W37')))
    expect(outcome.offers).toHaveLength(parseCards(FIXTURE).length)
    expect(outcome.offers).toHaveLength(6)
    // The pre-WP-C3 defect, end to end: the two Soave vintages must both
    // survive collection, not just the adapter's own parsePage.
    const soave = outcome.offers.filter((o) => o.productName.startsWith('Soave Classico'))
    expect(soave).toHaveLength(2)
  })
})

describe('createCoopAktionisSource', () => {
  const source = (fetchPage: (p: number) => Promise<string>, min = 1, maxPages = 5) =>
    createCoopAktionisSource({ fetchPage, expectedMinimumOffers: min, maxPages })

  it('stops when a page repeats ids, not when the widget runs out of links', async () => {
    // The pagination widget shows only 6 links though ~20 pages exist, so the
    // adapter walks until it sees nothing new.
    let calls = 0
    const r = await source(async () => {
      calls++
      return FIXTURE
    }).fetchOffers(EDITION_37)
    expect(calls).toBe(2) // page 2 repeats page 1's ids -> stop
    expect(r.ok).toBe(true)
  })

  it('accumulates across pages with distinct ids', async () => {
    const pageTwo = FIXTURE.replace(/data-upox-id="(\d+)"/g, (_m, id) => `data-upox-id="9${id}"`)
    const r = await source(async (p) => (p === 1 ? FIXTURE : p === 2 ? pageTwo : '')).fetchOffers(EDITION_37)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.offers.length).toBe(parseCards(FIXTURE).length * 2)
  })

  it('fails the source when page 1 is unreachable', async () => {
    const r = await source(async () => {
      throw new Error('HTTP 503')
    }).fetchOffers(EDITION_37)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('source-unavailable')
  })

  it('keeps earlier pages and warns when a later page fails', async () => {
    const pageTwo = FIXTURE.replace(/data-upox-id="(\d+)"/g, (_m, id) => `data-upox-id="9${id}"`)
    const r = await source(async (p) => {
      if (p === 1) return FIXTURE
      if (p === 2) return pageTwo
      throw new Error('HTTP 500')
    }).fetchOffers(EDITION_37)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.warnings.some((w) => w.message.includes('page 3 failed'))).toBe(true)
  })

  it('reports below-expected-yield rather than a quiet short run', async () => {
    const r = await source(async () => FIXTURE, 300).fetchOffers(EDITION_37)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('below-expected-yield')
  })

  it('reports source-changed when the markup no longer matches', async () => {
    const r = await source(async () => '<html><body>redesigned</body></html>').fetchOffers(EDITION_37)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('source-changed')
  })

  it('never throws on malformed input', async () => {
    for (const junk of ['', '<div data-upox-id="1">', '<<<>>>']) {
      const r = await source(async () => junk).fetchOffers(EDITION_37)
      expect(r.ok).toBe(false)
    }
  })

  it('editionFor is the plain ISO week — aktionis.ch/vendors/coop has no week-numbered URL', () => {
    const s = source(async () => FIXTURE)
    expect(s.editionFor(new Date('2026-09-14'))).toEqual({ retailer: 'coop', publication: '2026-W38' })
  })
})

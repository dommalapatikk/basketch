import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { createValidityPeriod } from '../../domain/validity-period'
import {
  type OcrItem,
  type OcrPage,
  createMigrosFlyerSource,
  findValidity,
  formatFunnel,
  issuuDocUrl,
  migrosYieldReason,
  parseFlyer,
  parseValidityLine,
  toFrancs,
} from './migros-flyer-source'

const PAGES: OcrPage[] = JSON.parse(
  readFileSync(join(__dirname, '__fixtures__/ocr-kw36-zh-pages2-5.json'), 'utf8'),
)
const REFERENCE = new Date('2026-09-09T00:00:00Z')

describe('issuuDocUrl', () => {
  it('builds the regional flyer URL', () => {
    expect(issuuDocUrl(36, 2026)).toBe('https://issuu.com/m-magazin/docs/migros-wochenflyer-36-2026-d-zh')
    expect(issuuDocUrl(36, 2026, 'os')).toContain('-d-os')
  })
})

// ---------------------------------------------------------------------------
// toFrancs — pure, unit-tested first (Torvalds: data structures before code)
// ---------------------------------------------------------------------------

describe('toFrancs', () => {
  it('reads a plain decimal price', () => {
    expect(toFrancs('4.50')).toBe(4.5)
    expect(toFrancs('4,50')).toBe(4.5)
  })

  it('"statt 14.--" is 14.00 — Swiss whole-franc notation', () => {
    // Real anchor from the fixture (page 5, Optigal Poulet-Oberschenkel,
    // sale 9.35). The OLD anchor regex never matched this line at all, so
    // the offer was not even warned about — it silently vanished (RCA item 7,
    // "anchor regex" row: 1 of 18 lost this way).
    expect(toFrancs('14.--')).toBe(14)
    expect(toFrancs('9.-')).toBe(9)
  })

  it('"-.94" is 0.94 — Migros omits the leading zero under one franc', () => {
    expect(toFrancs('-.94')).toBe(0.94)
  })

  it('returns null for text that is not a price', () => {
    expect(toFrancs('statt')).toBeNull()
    expect(toFrancs('06\'6')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// findValidity — prefers "Angebote gelten" over any other vom...bis... match
// ---------------------------------------------------------------------------

describe('parseValidityLine — OCR reads this line reliably', () => {
  it('reads the printed window', () => {
    expect(parseValidityLine('Angebote gelten vom 3.9. bis 9.9.2026, solange Vorrat.', REFERENCE)).toEqual({
      from: '2026-09-03',
      to: '2026-09-09',
    })
  })

  it('falls back to the reference year when none is printed', () => {
    expect(parseValidityLine('gelten vom 3.9. bis 9.9.', REFERENCE)?.from).toBe('2026-09-03')
  })

  it('returns null on unrelated text', () => {
    expect(parseValidityLine('MIGROS MEGA DEAL', REFERENCE)).toBeNull()
  })
})

describe('findValidity — against real captured OCR', () => {
  it('finds the window somewhere in the flyer', () => {
    expect(findValidity(PAGES, REFERENCE)).toEqual({ from: '2026-09-03', to: '2026-09-09' })
  })
})

/**
 * SYNTHETIC FIXTURE, built from real token shapes captured in
 * ocr-kw36-zh-pages2-5.json (same page dimensions, same box format, the same
 * "gültig vom …" and "Angebote gelten vom …" wording OCR actually reads).
 *
 * WHY SYNTHETIC: the committed fixture (KW36, pages 2-5) does not contain a
 * tile-level "gültig vom … bis …" line at all — every anchor on those four
 * pages shares the one flyer-wide window. The live regression this guards
 * against (RCA item 7: "gultig vom10.9.bis13.9.2026" published as a product
 * NAME, and every offer carrying the flyer's 3.9-9.9 window including one
 * that expired 13.9) needs a page that HAS a per-tile override, so this is
 * hand-built rather than pretend-derived from data that does not contain it.
 *
 * Layout: two tiles, side by side, same shape as every real row in the
 * fixture (price above statt, name to the right at the same height). The
 * LEFT tile is a weekend-only item with its OWN "gültig vom 10.9. bis
 * 13.9.2026" line. The RIGHT tile is an ordinary item with no override. The
 * flyer-wide "Angebote gelten …" line sits on a SECOND, LATER page — on
 * purpose, so a naive "first vom...bis... match anywhere" would return the
 * WEEKEND window as the flyer-wide default. It must not.
 */
const box = (x0: number, y0: number, x1: number, y1: number): OcrItem['box'] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
]
const item = (text: string, x0: number, y0: number, x1: number, y1: number): OcrItem => ({
  text,
  box: box(x0, y0, x1, y1),
})

const WEEKEND_PAGES: OcrPage[] = [
  {
    pageNumber: 1,
    width: 2199,
    height: 2997,
    items: [
      // Left tile: a weekend-only offer with its own validity override.
      item('2.50', 112, 949, 324, 1024),
      item('Wochenend Sandwich', 362, 946, 700, 980),
      item('statt 3.50', 143, 1040, 292, 1070),
      item('gultig vom10.9.bis13.9.2026', 90, 1080, 650, 1110),
      // Right tile: an ordinary offer, no override of its own.
      item('4.20', 1150, 949, 1354, 1024),
      item('Bergkase', 1390, 946, 1600, 980),
      item('statt 5.90', 1170, 1040, 1320, 1070),
    ],
  },
  {
    pageNumber: 2,
    width: 2199,
    height: 2997,
    items: [
      // The flyer-wide window — deliberately on a LATER page than the
      // weekend line above.
      item('Angebote gelten vom 3.9. bis 9.9.2026, solange Vorrat.', 1439, 2885, 2106, 2911),
    ],
  },
]

describe('a weekend line on page 2 does not become the flyer-wide window', () => {
  it('findValidity prefers "Angebote gelten" over an earlier per-tile override', () => {
    // OLD behaviour (single-pass, first vom...bis... match anywhere) would
    // return {from: '2026-09-10', to: '2026-09-13'} here, because page 1's
    // "gultig vom10.9.bis13.9.2026" is scanned before page 2 is even reached.
    expect(findValidity(WEEKEND_PAGES, REFERENCE)).toEqual({ from: '2026-09-03', to: '2026-09-09' })
  })
})

describe('a weekend offer "gültig vom 10.9. bis 13.9." keeps its own window', () => {
  // Replaces the OLD test at :72-74, which asserted
  // "offers.every(o => o.validity === the flyer window)" — the defect itself.
  // A weekend-only offer must NOT inherit the flyer-wide window; an ordinary
  // sibling on the same page, with no override of its own, still should.
  const { offers } = parseFlyer(WEEKEND_PAGES, REFERENCE, null)

  it('gives the weekend item its own printed window — it would otherwise still be "live" on 15.9', () => {
    const sandwich = offers.find((o) => o.productName.includes('Sandwich'))
    expect(sandwich?.validity).toEqual({ from: '2026-09-10', to: '2026-09-13' })
  })

  it('leaves the ordinary sibling on the flyer-wide window', () => {
    const bergkase = offers.find((o) => o.productName === 'Bergkase')
    expect(bergkase?.validity).toEqual({ from: '2026-09-03', to: '2026-09-09' })
  })
})

// ---------------------------------------------------------------------------
// Golden master — HAND-VERIFIED (name, sale, statt) triples for the committed
// fixture. Each triple below was verified by reading the OCR tokens and their
// pixel coordinates directly (see the worked derivation in the WP-C1 build
// notes): for every "statt" anchor, the anchor's half of the page (left of
// x=1099.5 or right of it) was taken as its tile, the nearest price-shaped
// token ABOVE the anchor within that tile as the sale price, and the
// non-descriptor line vertically closest to that sale price as the name.
//
// Two triples carry a documented CAVEAT rather than being excluded: Migros
// prints some names across two OCR lines ("Migros" / "Kalbsplätzli",
// "Delikatess-" / "Fleischkäse,IP-SUiSSE"), and this parser takes one line.
// That is a known, separate limitation (an incomplete but still
// correctly-scoped name) — not the cross-tile mis-pairing defect this WP
// fixes, so it is verified as "this is what the algorithm deterministically
// produces", not guessed.
// ---------------------------------------------------------------------------

type GoldenTriple = { name: string; sale: number; statt: number }

const GOLDEN_MASTER: GoldenTriple[] = [
  // page 2 — the one non-multi-buy anchor on the page.
  { name: 'Kartoffeln Patatli', sale: 1.4, statt: 2.1 },
  // page 4
  { name: 'Schweins-Nierstuck-', sale: 1.9, statt: 2.85 }, // OCR reads "ü" as "u"
  { name: 'MigrosSpiesse', sale: 2.85, statt: 4.3 },
  { name: 'Delikatess-', sale: 1.15, statt: 1.75 }, // caveat: 2-line name, see header
  { name: 'Rinds-Entrecotes', sale: 5.25, statt: 7.9 },
  { name: 'Migros', sale: 3.75, statt: 5.6 }, // caveat: 2-line name ("Migros" / "Kalbsplätzli")
  // page 5
  { name: 'Schweinsfilet,', sale: 3.8, statt: 5.7 },
  { name: 'OptigalPouletgeschnetzeltes', sale: 2.2, statt: 3.35 },
  { name: 'Schweinsbraten vom Hals,', sale: 1.5, statt: 2.25 },
  { name: 'Migros Poulet Nuggets', sale: 4.85, statt: 7.3 },
  { name: 'Optigal PouletOberschenkel', sale: 9.35, statt: 14.0 }, // whole-franc "statt 14.--"
]

describe('golden master — KW36 pp. 2-5 yield exactly these (name, sale, statt) triples', () => {
  const { offers } = parseFlyer(PAGES, REFERENCE, null)

  it('accepts exactly the 11 hand-verified offers, nothing more, nothing fewer', () => {
    const actual = offers
      .map((o) => ({ name: o.productName, sale: o.salePrice.rappen / 100, statt: (o.originalPrice?.rappen ?? 0) / 100 }))
      .sort((a, b) => a.name.localeCompare(b.name))
    const expected = [...GOLDEN_MASTER].sort((a, b) => a.name.localeCompare(b.name))
    expect(actual).toEqual(expected)
  })
})

describe('the sale price is the nearest above its statt line, not the tallest in the column', () => {
  const { offers } = parseFlyer(PAGES, REFERENCE, null)

  it('Migros Spiesse: statt 4.30 pairs with 2.85 (47px away), not 1.90 (690px away, 2px taller)', () => {
    const spiesse = offers.find((o) => o.productName === 'MigrosSpiesse')
    expect(spiesse?.salePrice.rappen).toBe(285)
    expect(spiesse?.originalPrice?.rappen).toBe(430)
  })

  it('the Kalbsplätzli tile: statt 5.60 pairs with 3.75 (52px away), not 1.90 (a different row, tied height)', () => {
    const kalbsplatzli = offers.find((o) => o.productName === 'Migros')
    expect(kalbsplatzli?.salePrice.rappen).toBe(375)
    expect(kalbsplatzli?.originalPrice?.rappen).toBe(560)
  })

  it('Rinds-Entrecotes: statt 7.90 pairs with 5.25 (51px away), not 1.15 (a different row entirely)', () => {
    const entrecotes = offers.find((o) => o.productName === 'Rinds-Entrecotes')
    expect(entrecotes?.salePrice.rappen).toBe(525)
    expect(entrecotes?.originalPrice?.rappen).toBe(790)
  })
})

describe("a name comes from the offer's own tile", () => {
  const { offers } = parseFlyer(PAGES, REFERENCE, null)

  it('"Schweinsbraten vom Hals" 1.50 statt 2.25, not "OptigalPouletgeschnetzeltes"', () => {
    // Without a right bound, "longest line in the vertical band" reaches
    // clean across the page gutter into the RIGHT tile's own (longer,
    // correctly-scoped-for-ITS-anchor) name.
    const schweinsbraten = offers.find((o) => o.productName === 'Schweinsbraten vom Hals,')
    expect(schweinsbraten).toBeDefined()
    expect(schweinsbraten?.salePrice.rappen).toBe(150)
    expect(schweinsbraten?.originalPrice?.rappen).toBe(225)
    expect(offers.some((o) => o.productName === 'OptigalPouletgeschnetzeltes' && o.salePrice.rappen === 150)).toBe(
      false,
    )
  })

  it('"OptigalPouletgeschnetzeltes" stays the RIGHT tile\'s own offer, 2.20 statt 3.35', () => {
    const optigal = offers.find((o) => o.productName === 'OptigalPouletgeschnetzeltes')
    expect(optigal?.salePrice.rappen).toBe(220)
    expect(optigal?.originalPrice?.rappen).toBe(335)
  })
})

describe('"statt 14.--" is 14.00 — Swiss whole-franc notation', () => {
  it('Optigal Poulet-Oberschenkel: sale 9.35, statt 14.00', () => {
    const { offers } = parseFlyer(PAGES, REFERENCE, null)
    const oberschenkel = offers.find((o) => o.productName === 'Optigal PouletOberschenkel')
    expect(oberschenkel?.salePrice.rappen).toBe(935)
    expect(oberschenkel?.originalPrice?.rappen).toBe(1400)
  })
})

// ---------------------------------------------------------------------------
// Multi-buy: parsed, counted, never published (PARSE ONLY per WP-C1 scope;
// publishing waits for QuantityRequirement, WP-C4, PM decision TP-7a).
// ---------------------------------------------------------------------------

describe('inline "X statt Y" (the "ab 2 Stück" multi-buy form)', () => {
  const { offers, warnings, funnel } = parseFlyer(PAGES, REFERENCE, null)

  it('is recognised and parsed, not reported as an unreadable display price', () => {
    const multiBuyWarnings = warnings.filter((w) => w.message.startsWith('multi-buy:'))
    expect(multiBuyWarnings.length).toBe(5)
    // Spot-check one: Zwetschgen, "3.02statt 4.50" — parsed correctly, not
    // just detected.
    expect(multiBuyWarnings.some((w) => w.message.includes('3.02 statt 4.50'))).toBe(true)
  })

  it('is never published as a bare offer', () => {
    expect(offers.some((o) => o.productName.includes('Zwetschgen'))).toBe(false)
    expect(offers.some((o) => o.productName.includes('Trauben'))).toBe(false)
  })

  it('is counted in the funnel as multi-buy, not folded into "accepted" or "rejected"', () => {
    expect(funnel.multiBuy).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// Funnel — the counts that were previously discarded entirely (RCA 7.2e).
// ---------------------------------------------------------------------------

describe('funnel counts — anchors, accepted, and every rejection reason', () => {
  it('accounts for all 18 anchors on the committed fixture', () => {
    const { funnel } = parseFlyer(PAGES, REFERENCE, null)
    expect(funnel.anchors).toBe(18)
    expect(funnel.accepted).toBe(11)
    expect(funnel.multiBuy).toBe(5)
    expect(funnel.noDisplayPrice).toBe(1) // Eierschwämme, "06'6" for 9.90
    expect(funnel.invariantRejected).toBe(1) // "1.20 statt 1.85", printed 33%, true 35.1% (WP-C2 territory)
    expect(funnel.unreadablePrice).toBe(0)
    expect(funnel.noName).toBe(0)
    const total =
      funnel.accepted + funnel.multiBuy + funnel.noDisplayPrice + funnel.invariantRejected + funnel.unreadablePrice + funnel.noName
    expect(total).toBe(funnel.anchors)
  })

  it('formats a one-line summary that a run log can carry', () => {
    const { funnel } = parseFlyer(PAGES, REFERENCE, null)
    expect(formatFunnel(funnel)).toBe(
      'funnel: 18 anchors -> 11 accepted, 5 multi-buy (not published), 0 unreadable statt, ' +
        '1 no display price, 0 no name, 1 discount-inconsistent',
    )
  })
})

// ---------------------------------------------------------------------------
// The 50%-of-anchors yield guard (real units, not chunks — HANDOVER §5)
// ---------------------------------------------------------------------------

describe('migrosYieldReason', () => {
  it('a run converting well under half its anchors is below expected yield', () => {
    // Page 2 alone: 6 anchors, 1 accepted (~17%) — five are multi-buy, held
    // back on purpose, but a "well, they were parsed" excuse does not change
    // how few PUBLISHABLE offers came out of eighteen detected anchors.
    expect(migrosYieldReason(1, 6)).toBe('below-expected-yield')
  })

  it('the historical pre-fix conversion rate (~22-29%, RCA item 7) is below expected yield', () => {
    expect(migrosYieldReason(4, 18)).toBe('below-expected-yield')
    expect(migrosYieldReason(5, 18)).toBe('below-expected-yield')
  })

  it('the fixed parser\'s 61% (11 of 18) on the committed fixture passes', () => {
    expect(migrosYieldReason(11, 18)).toBeNull()
  })

  it('zero anchors is not a yield failure by itself — a different guard handles empty', () => {
    expect(migrosYieldReason(0, 0)).toBeNull()
  })
})

describe('createMigrosFlyerSource — the ratio guard fires through the port', () => {
  it('fails below-expected-yield even though the absolute floor is cleared', () => {
    // Page 2 alone clears an expectedMinimumOffers of 1 (one accepted offer),
    // but only converts 1 of 6 anchors (~17%). Removing the ratio guard and
    // keeping only the absolute floor would make this pass — that is exactly
    // the mutation this test exists to catch.
    // page 2 alone carries no "vom...bis..." line of its own (that text lives
    // on pages 3 and 5), so a fallback window is supplied — otherwise the
    // run would fail on "no validity line found" before the ratio guard is
    // even reached, which would test the wrong thing.
    const fallback = createValidityPeriod('2026-09-03', '2026-09-09')
    const [page2] = PAGES
    const source = createMigrosFlyerSource({
      loadPages: async () => [page2!],
      reference: REFERENCE,
      expectedMinimumOffers: 1,
      fallbackValidity: fallback.ok ? fallback.value : null,
    })
    return source.fetchOffers('2026-W36').then((r) => {
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('below-expected-yield')
    })
  })
})

// ---------------------------------------------------------------------------
// Pre-existing behaviour, preserved
// ---------------------------------------------------------------------------

describe('parseFlyer — against real captured OCR', () => {
  const { offers, warnings } = parseFlyer(PAGES, REFERENCE, null)

  it('extracts offers', () => {
    expect(offers.length).toBeGreaterThan(0)
  })

  it('every offer has a verified price pair — never a derived one', () => {
    for (const o of offers) {
      expect(o.originalPrice).not.toBeNull()
      expect(o.originalPrice!.rappen).toBeGreaterThan(o.salePrice.rappen)
      expect(o.salePrice.rappen).toBeGreaterThan(0)
    }
  })

  it('DROPS an offer when OCR mangles the display price rather than deriving it', () => {
    // OCR returns tokens like "06'6" for 9.90. statt x (1 - discount) would give
    // 9.95 against a real shelf price of 9.90 — wrong by 5 rappen, published as
    // fact. Art. 3(1)(e) UWG makes that the expensive kind of mistake.
    const dropped = warnings.filter((w) => w.message.includes('dropped rather than derived'))
    expect(dropped.length).toBe(1)
  })

  it('every accepted real-fixture offer gets the flyer-wide window — none carries its own override', () => {
    // Distinct from the OLD :72-74 test, which asserted this UNCONDITIONALLY
    // (the defect). It happens to still be true for every offer on THIS
    // fixture because none of the 11 accepted tiles carries a "gültig vom"
    // line of its own — see the synthetic-fixture tests above for the case
    // where that is NOT true.
    expect(offers.every((o) => o.validity.from === '2026-09-03' && o.validity.to === '2026-09-09')).toBe(true)
  })

  it('keeps printed discounts consistent with the price pair', () => {
    for (const o of offers) {
      if (!o.discount || !o.originalPrice) continue
      const actual = ((o.originalPrice.rappen - o.salePrice.rappen) / o.originalPrice.rappen) * 100
      expect(Math.abs(actual - o.discount.percent)).toBeLessThanOrEqual(1.5)
    }
  })

  it('produces CropRegions inside the unit square', () => {
    const withImages = parseFlyer(PAGES, REFERENCE, null, (n) => `https://image.isu.pub/rev/jpg/page_${n}.jpg`)
    const cropped = withImages.offers.filter((o) => o.image?.kind === 'crop-region')
    expect(cropped.length).toBeGreaterThan(0)
    for (const o of cropped) {
      if (o.image?.kind !== 'crop-region') continue
      const r = o.image.region
      expect(r.x).toBeGreaterThanOrEqual(0)
      expect(r.y).toBeGreaterThanOrEqual(0)
      expect(r.x + r.width).toBeLessThanOrEqual(1.000001)
      expect(r.y + r.height).toBeLessThanOrEqual(1.000001)
    }
  })

  it('never emits an empty product name', () => {
    expect(offers.every((o) => o.productName.trim().length > 0)).toBe(true)
  })

  it('leaves sourceCategory null for now', () => {
    // Migros is the ONLY retailer printing real category headings
    // ("Brot & Backwaren"). Associating them to products needs heading
    // detection that is not built yet — see the module header.
    expect(offers.every((o) => o.sourceCategory === null)).toBe(true)
  })
})

describe('createMigrosFlyerSource', () => {
  const source = (over: Partial<Parameters<typeof createMigrosFlyerSource>[0]> = {}) =>
    createMigrosFlyerSource({
      loadPages: async () => PAGES,
      reference: REFERENCE,
      expectedMinimumOffers: 1,
      ...over,
    })

  it('collects from captured OCR', async () => {
    const r = await source().fetchOffers('2026-W36')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.offers.length).toBe(11)
  })

  it('reports source-unavailable when pages cannot be loaded', async () => {
    const r = await source({
      loadPages: async () => {
        throw new Error('issuu 404')
      },
    }).fetchOffers('2026-W36')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('source-unavailable')
  })

  it('reports below-expected-yield when OCR degrades', async () => {
    // The yield floor is the guard against a silently bad OCR run.
    const r = await source({ expectedMinimumOffers: 500 }).fetchOffers('2026-W36')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('below-expected-yield')
  })

  it('reports source-changed when OCR returns nothing', async () => {
    const r = await source({ loadPages: async () => [] }).fetchOffers('2026-W36')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('source-changed')
  })

  it('never throws on malformed OCR output', async () => {
    const junk = [{ pageNumber: 1, width: 0, height: 0, items: [{ text: '', box: [] }] }] as OcrPage[]
    const r = await source({ loadPages: async () => junk }).fetchOffers('2026-W36')
    expect(r.ok).toBe(false)
  })
})

/**
 * WHY A FLYER-LEVEL sourceUrl AND NOT null, 2026-09-12.
 *
 * This retailer publishes no per-product page, so sourceUrl was null. On the
 * site that made the card unclickable — and before that, when the card still
 * rendered `<a href="#">`, clicking a Migros product reloaded basketch.
 * That was the reported bug: "migros and aldi product urls goes to basketch
 * url not to companies link".
 *
 * Pointing at the flyer THIS OFFER WAS READ FROM is the honest destination.
 * It is the actual provenance of the price, it lets a visitor verify the
 * claim — which Art. 3(1)(e) UWG effectively requires of a price comparison —
 * and it is the same thing VolgHtmlSource already does with its page URL.
 *
 * Not a store homepage: a homepage does not evidence this week's price.
 */

describe('every offer points at the flyer it was read from', () => {
  const FLYER = issuuDocUrl(37, 2026)

  it('sets sourceUrl to the issuu flyer when one is supplied', () => {
    const { offers } = parseFlyer(PAGES, REFERENCE, null, undefined, FLYER)
    expect(offers.length).toBeGreaterThan(0)
    expect(offers.every((o) => o.sourceUrl === FLYER)).toBe(true)
  })

  it('leaves sourceUrl null when no flyer url is supplied', () => {
    const { offers } = parseFlyer(PAGES, REFERENCE, null)
    expect(offers.every((o) => o.sourceUrl === null)).toBe(true)
  })
})

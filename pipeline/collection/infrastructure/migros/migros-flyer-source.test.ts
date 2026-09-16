import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { isMinimumQuantity } from '../../domain/quantity-requirement'
import { createValidityPeriod } from '../../domain/validity-period'
import {
  type OcrItem,
  type OcrPage,
  createMigrosFlyerSource,
  findValidity,
  formatFunnel,
  issuuDocUrl,
  joinNameParts,
  migrosYieldReason,
  parseFlyer,
  parseMultiBuyQuantity,
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

describe('findValidity parses the "Angebote gelten" ITEM, not the whole page joined together', () => {
  // Found while testing the validity-intersection fix (code review
  // 2026-09-16): the OLD pass 1 tested EACH PAGE's fully joined text for
  // "/Angebote gelten/i", then ran parseValidityLine's un-anchored regex
  // against that SAME joined string. If a per-tile "gültig vom …" override
  // sits earlier in item order than the footer on the SAME page, the regex
  // finds the OVERRIDE's dates first and misreports them as the flyer-wide
  // window — even though the page DOES also carry a correct "Angebote
  // gelten" line. Real captures put the whole sentence in ONE OCR item, so
  // parsing per-item (not per-page) is both correct and sufficient.
  it('an earlier per-tile override on the same page does not corrupt the flyer-wide window', () => {
    const page: OcrPage = {
      pageNumber: 1,
      width: 2199,
      height: 2997,
      items: [
        item('gultig vom3.9.bis30.9.2026', 90, 1080, 650, 1110),
        item('Angebote gelten vom 10.9. bis 16.9.2026, solange Vorrat.', 1439, 2885, 2106, 2911),
      ],
    }
    expect(findValidity([page], REFERENCE)).toEqual({ from: '2026-09-10', to: '2026-09-16' })
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

/** Builds a ValidityPeriod for test fixtures, failing loudly on a bad literal. */
function window(from: string, to: string) {
  const r = createValidityPeriod(from, to)
  if (!r.ok) throw new Error(r.error)
  return r.value
}

// The REAL live window from the RCA (run 34718508157/34833209176): every
// Migros deal that week carried validFrom 2026-09-10, validTo 2026-09-16.
// The weekend-only defect was a 10.9-13.9 override — a SUBSET of that week,
// not a disjoint range. An earlier draft of this fixture used a flyer window
// (3.9-9.9) the override did not even overlap, which the new intersection
// rule (finding 3, code review 2026-09-16) correctly rejects — so the
// fixture is now the actual live shape of the bug.
const FLYER_WEEK = window('2026-09-10', '2026-09-16')

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
      item('Angebote gelten vom 10.9. bis 16.9.2026, solange Vorrat.', 1439, 2885, 2106, 2911),
    ],
  },
]

describe('a weekend line on page 2 does not become the flyer-wide window', () => {
  it('findValidity prefers "Angebote gelten" over an earlier per-tile override', () => {
    // OLD behaviour (single-pass, first vom...bis... match anywhere) would
    // return {from: '2026-09-10', to: '2026-09-13'} here, because page 1's
    // "gultig vom10.9.bis13.9.2026" is scanned before page 2 is even reached.
    expect(findValidity(WEEKEND_PAGES, REFERENCE)).toEqual(FLYER_WEEK)
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
    expect(bergkase?.validity).toEqual(FLYER_WEEK)
  })
})

// ---------------------------------------------------------------------------
// Per-offer validity — the four fixes from code review (2026-09-16):
//   1. the search band starts at the SALE PRICE's own top, not the statt
//      line's, so an override sitting right after the name/price (before a
//      descriptor line) is still found;
//   2. detection is not anchored to "…vom…" — ANY "gültig" mention is a
//      candidate, so a line missing "vom" or with the words reversed is
//      DETECTED (and then rejected for failing to parse), not skipped;
//   3. a detected-but-unparseable override REJECTS the anchor, never falls
//      back to the flyer-wide window silently;
//   4. an override is intersected with the flyer's own window, never
//      published wider than the flyer that carries it.
// ---------------------------------------------------------------------------

/**
 * One left-tile offer: a genuinely well-formed price pairing (sale 2.50
 * statt 3.50, 16px gap, well inside every `isPlausibleSaleFor` bound), with a
 * caller-supplied override line at a caller-chosen box — so each test below
 * isolates ONE validity behaviour without also risking the price-pairing
 * guards it does not intend to exercise.
 *
 * Carries its OWN real "Angebote gelten" footer (right tile, matching every
 * real Migros page) rather than relying on `parseFlyer`'s `fallbackValidity`
 * parameter — `findValidity`'s second pass matches ANY "vom … bis …" text on
 * the page, including the override line itself, so a single-page fixture
 * with no footer would let the override text silently BECOME the flyer-wide
 * window it is supposed to be tested against.
 */
function oneOfferPage(overrideText: string, overrideBox: readonly [number, number, number, number]): OcrPage {
  return {
    pageNumber: 1,
    width: 2199,
    height: 2997,
    items: [
      item('2.50', 112, 949, 324, 1024),
      item('Sonderangebot', 362, 946, 700, 980),
      item(overrideText, ...overrideBox),
      item('statt 3.50', 143, 1040, 292, 1070),
      item('Angebote gelten vom 10.9. bis 16.9.2026, solange Vorrat.', 1439, 2885, 2106, 2911),
    ],
  }
}

describe('the validity-override band starts at the sale price, not the statt line', () => {
  it('finds an override sitting well above the statt line — the OLD statt-anchored band missed it', () => {
    // Override at y0=900, printed above the name/price row entirely.
    //   OLD band top = stattBox.y0(1040) - 0.02*height ≈ 1040 - 60 = 980 → MISSES 900.
    //   NEW band top = saleBox.y0(949)  - 0.02*height ≈ 949  - 60 = 889 → CATCHES 900.
    const page = oneOfferPage('gultig vom10.9.bis13.9.2026', [112, 900, 700, 930])
    const { offers } = parseFlyer([page], REFERENCE, null)
    const offer = offers.find((o) => o.productName === 'Sonderangebot')
    expect(offer?.validity).toEqual({ from: '2026-09-10', to: '2026-09-13' })
  })
})

describe('a "gültig" line that fails to parse REJECTS the anchor, never falls back silently', () => {
  it('"gultig bis6.9." (no "vom" at all) rejects the offer, does not publish it under the flyer window', () => {
    const page = oneOfferPage('gultig bis6.9.', [90, 1080, 400, 1110])
    const { offers, funnel, warnings } = parseFlyer([page], REFERENCE, null)
    expect(offers.some((o) => o.productName === 'Sonderangebot')).toBe(false)
    expect(funnel.invalidValidity).toBe(1)
    expect(warnings.some((w) => w.message.includes('could not be parsed'))).toBe(true)
  })

  it('an override with no overlap at all with the flyer window rejects the offer', () => {
    // Flyer runs 10.9-16.9; this line claims 1.9-5.9, entirely before it —
    // a printed date that cannot honestly describe a price on THIS flyer.
    const page = oneOfferPage('gultig vom1.9.bis5.9.2026', [90, 1080, 650, 1110])
    const { offers, funnel } = parseFlyer([page], REFERENCE, null)
    expect(offers.some((o) => o.productName === 'Sonderangebot')).toBe(false)
    expect(funnel.invalidValidity).toBe(1)
  })
})

describe('an override wider than the flyer is clipped to the flyer window, never published beyond it', () => {
  it('"gültig vom 3.9. bis 30.9." on a flyer that runs 10.9-16.9 publishes 10.9-16.9, not 3.9-30.9', () => {
    const page = oneOfferPage('gultig vom3.9.bis30.9.2026', [90, 1080, 650, 1110])
    const { offers } = parseFlyer([page], REFERENCE, null)
    const offer = offers.find((o) => o.productName === 'Sonderangebot')
    expect(offer?.validity).toEqual(FLYER_WEEK)
  })
})

// ---------------------------------------------------------------------------
// A "gültig" line is only a validity-OVERRIDE candidate when it also carries
// a date (re-review 2026-09-16, N1). Ordinary Swiss flyer copy —
// "gültig solange Vorrat", "nur gültig mit Cumulus" — mentions "gültig" with
// no date at all. Before this fix it would have been found, failed to parse
// (correctly — it states no window), and REJECTED an otherwise-valid offer
// for text that was never trying to be a validity line. The reject guarantee
// for a date-bearing line that still fails to parse (N1's other half, and
// finding 3 from the previous round) must not be weakened by this fix.
// ---------------------------------------------------------------------------

describe('a "gültig" line with no date is not a validity override', () => {
  it('"gültig solange Vorrat" is not a validity override — the offer is published on the flyer window', () => {
    const page = oneOfferPage('gultig solange Vorrat', [90, 1080, 650, 1110])
    const { offers, funnel } = parseFlyer([page], REFERENCE, null)
    const offer = offers.find((o) => o.productName === 'Sonderangebot')
    expect(offer).toBeDefined()
    expect(offer?.validity).toEqual(FLYER_WEEK)
    expect(funnel.invalidValidity).toBe(0)
  })

  it('"nur gültig mit Cumulus" (no date) is not a validity override either', () => {
    const page = oneOfferPage('nur gultig mit Cumulus', [90, 1080, 650, 1110])
    const { offers, funnel } = parseFlyer([page], REFERENCE, null)
    expect(offers.some((o) => o.productName === 'Sonderangebot')).toBe(true)
    expect(funnel.invalidValidity).toBe(0)
  })

  it('a date-bearing "gültig" line that will not parse still rejects the anchor', () => {
    // The guarantee the date-shape requirement must NOT weaken: this line
    // carries a date (6.9.) but no "vom", so it cannot state a real window —
    // and unlike the no-date cases above, THIS one must still reject rather
    // than publish under the flyer window.
    const page = oneOfferPage('gultig bis6.9.', [90, 1080, 650, 1110])
    const { offers, funnel } = parseFlyer([page], REFERENCE, null)
    expect(offers.some((o) => o.productName === 'Sonderangebot')).toBe(false)
    expect(funnel.invalidValidity).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Golden master — HAND-VERIFIED (name, sale, statt) triples for the committed
// fixture. Each triple below was verified by reading the OCR tokens and their
// pixel coordinates directly (see the worked derivation in the WP-C1 build
// notes): for every "statt" anchor, the anchor's half of the page (left of
// x=1099.5 or right of it) was taken as its tile, the nearest PLAUSIBLE
// price-shaped token ABOVE the anchor within that tile as the sale price
// (x-aligned, close above, and display-sized — see `isPlausibleSaleFor`), and
// the non-descriptor line vertically closest to that sale price as the name.
//
// RE-DERIVED 2026-09-16 (code review): three names were WRONG in the first
// cut, and locking them into the golden master was itself the
// "test-encodes-the-defect" trap (HANDOVER §4). Re-verified by reading the
// vertical gap between each primary OCR line and the line directly below it,
// x-aligned within the fixture's precision:
//   - "Schweins-Nierstuck-" (page 4, left, statt 2.85) is followed 10px below
//     by "steaksmariniert," at the same x0 (1735 vs 1734) — one hyphenated
//     word wrapped onto two OCR lines.
//   - "Delikatess-" (page 4, left, statt 1.75) is followed 3px below by
//     "Fleischkase,IP-SUiSSE" at the same x0 (362 vs 363) — same pattern, the
//     quality-programme suffix after the comma is not part of the name.
//   - "Migros" alone (page 4, right, statt 5.60) is followed 3px below by
//     "Kalbsplatzli" at the same x0 (1390 vs 1390) — Migros's own brand
//     prefix, printed on its own line, is not a complete product name.
//
// RE-JOINED 2026-09-16, second review round (N2): the joining SEPARATOR
// depends on the continuation's case, per `joinNameParts`. "Delikatess-" +
// "Fleischkase" (continuation capitalised) keeps the hyphen, no space:
// "Delikatess-Fleischkase" — the flyer's own convention for a printed
// compound elsewhere in this fixture ("Schweins-Geschnetzeltes", never
// wrapped). "Schweins-Nierstuck-" + "steaksmariniert" (continuation
// LOWERCASE) drops the hyphen and inserts a space instead:
// "Schweins-Nierstuck steaksmariniert" — read as "Schweins-Nierstück
// steaks, mariniert" (kidney-piece steaks, MARINATED — a quality adjective
// describing the cut, not a mid-word break), never the run-together
// "Schweins-Nierstuck-steaksmariniert" the first cut produced. "Migros" +
// "Kalbsplatzli" has no trailing hyphen to begin with (the bare-brand-word
// case), so it is unaffected: "Migros Kalbsplatzli".
// All three joins were confirmed by running the actual parser against the
// fixture (not just derived by eye) — see `joinNameParts` and its dedicated
// tests below.
// ---------------------------------------------------------------------------

type GoldenTriple = { name: string; sale: number; statt: number; quantity?: number }

const GOLDEN_MASTER: GoldenTriple[] = [
  // page 2 — the one non-multi-buy anchor on the page.
  { name: 'Kartoffeln Patatli', sale: 1.4, statt: 2.1 },
  // page 2 — the five multi-buy anchors (WP-C4): each reads "ab 2 Stück" and
  // is now published with QuantityRequirement.minimum(2), hand-verified
  // against the OCR item positions in ocr-kw36-zh-pages2-5.json.
  { name: 'Zwetschgen', sale: 3.02, statt: 4.5, quantity: 2 },
  { name: 'Trauben weiss und gemischt,kernlos', sale: 1.17, statt: 1.75, quantity: 2 },
  { name: 'Extra Himbeeren', sale: 4.66, statt: 6.95, quantity: 2 },
  { name: 'Migros Bio Bohnen', sale: 2.88, statt: 4.3, quantity: 2 },
  { name: 'Extra Kiwi Gold', sale: 0.94, statt: 1.4, quantity: 2 },
  // page 3 — WP-C2: "1.20 statt 1.85" printed 33% (true 35.1%) is 4 rappen off
  // Migros's own 5-rappen shelf-price grid (round(185*0.67)=124, sale=120),
  // and was wrongly rejected as a mis-pair before the rappen-grid fix.
  { name: 'Schweins-Geschnetzeltes,', sale: 1.2, statt: 1.85 },
  // page 4
  { name: 'Schweins-Nierstuck steaksmariniert', sale: 1.9, statt: 2.85 }, // OCR reads "ü" as "u"; lowercase continuation -> hyphen dropped, see header
  { name: 'MigrosSpiesse', sale: 2.85, statt: 4.3 },
  { name: 'Delikatess-Fleischkase', sale: 1.15, statt: 1.75 }, // uppercase continuation -> hyphen kept, see header
  { name: 'Rinds-Entrecotes', sale: 5.25, statt: 7.9 },
  { name: 'Migros Kalbsplatzli', sale: 3.75, statt: 5.6 }, // no trailing hyphen to begin with, see header
  // page 5
  { name: 'Schweinsfilet,', sale: 3.8, statt: 5.7 },
  { name: 'OptigalPouletgeschnetzeltes', sale: 2.2, statt: 3.35 },
  { name: 'Schweinsbraten vom Hals,', sale: 1.5, statt: 2.25 },
  { name: 'Migros Poulet Nuggets', sale: 4.85, statt: 7.3 },
  { name: 'Optigal PouletOberschenkel', sale: 9.35, statt: 14.0 }, // whole-franc "statt 14.--"
]

describe('golden master — KW36 pp. 2-5 yield exactly these (name, sale, statt, quantity) triples', () => {
  const { offers } = parseFlyer(PAGES, REFERENCE, null)

  it('accepts exactly the 17 hand-verified offers (12 single-item + 5 "ab 2 Stück"), nothing more, nothing fewer', () => {
    const actual = offers
      .map((o) => ({
        name: o.productName,
        sale: o.salePrice.rappen / 100,
        statt: (o.originalPrice?.rappen ?? 0) / 100,
        ...(isMinimumQuantity(o.quantityRequirement) ? { quantity: o.quantityRequirement.count } : {}),
      }))
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
    const kalbsplatzli = offers.find((o) => o.productName === 'Migros Kalbsplatzli')
    expect(kalbsplatzli?.salePrice.rappen).toBe(375)
    expect(kalbsplatzli?.originalPrice?.rappen).toBe(560)
  })

  it('Rinds-Entrecotes: statt 7.90 pairs with 5.25 (51px away), not 1.15 (a different row entirely)', () => {
    const entrecotes = offers.find((o) => o.productName === 'Rinds-Entrecotes')
    expect(entrecotes?.salePrice.rappen).toBe(525)
    expect(entrecotes?.originalPrice?.rappen).toBe(790)
  })
})

// ---------------------------------------------------------------------------
// A candidate price must be PLAUSIBLY the anchor's own display price — tile
// membership alone is not enough (code review 2026-09-16). Reproduced by the
// reviewer against the pre-fix code: dropping a genuine display price let the
// statt fall back to whatever same-height price was nearest in a wide
// x-band, in a different row or even a different tile. Each guard below is
// isolated to its own synthetic case, plus one reproduction against the REAL
// fixture with a genuine price removed.
// ---------------------------------------------------------------------------

const FLYER_WEEK_LITERAL = { from: '2026-09-03', to: '2026-09-09' }

describe('a mangled or missing display price is dropped, never silently paired with a distant same-tile price', () => {
  it("removing MigrosSpiesse's real 2.85 (page 4) drops the offer — it does not fall back to 1.90 from a different row", () => {
    // Exact reproduction of the code review's finding: "dropping '2.85' on
    // p4 publishes 'Schweins-Nierstuck- 1.90 statt 4.30 (55.8%)'" against the
    // pre-guard code. With the plausibility checks, 1.90 is 690px away and
    // x-aligned but far outside the 3%-of-height vertical bound, so it is no
    // longer a candidate at all.
    const page4 = PAGES.find((p) => p.pageNumber === 4)!
    const withoutRealPrice: OcrPage = { ...page4, items: page4.items.filter((i) => i.text.trim() !== '2.85') }
    const { offers, funnel, warnings } = parseFlyer([withoutRealPrice], REFERENCE, FLYER_WEEK_LITERAL)

    expect(offers.some((o) => o.productName === 'MigrosSpiesse')).toBe(false)
    expect(offers.some((o) => o.salePrice.rappen === 190 && o.originalPrice?.rappen === 430)).toBe(false)
    expect(funnel.noDisplayPrice).toBe(1)
    expect(warnings.some((w) => w.message.includes('statt 4.30'))).toBe(true)
  })
})

describe("a text-sized price-shaped token is rejected — a display price is at least 1.8x a statt line's height", () => {
  it('a short "0.58"-style token, x-aligned and close, is not mistaken for the display price', () => {
    const page: OcrPage = {
      pageNumber: 1,
      width: 2199,
      height: 2997,
      items: [
        item('statt5.70', 143, 1040, 292, 1070), // statt height 30
        item('TestProduct', 362, 946, 700, 980),
        item('0.58', 150, 995, 280, 1020), // height 25 — text-sized, x-aligned, close above
      ],
    }
    const { offers, funnel } = parseFlyer([page], REFERENCE, FLYER_WEEK_LITERAL)
    expect(offers).toHaveLength(0)
    expect(funnel.noDisplayPrice).toBe(1)
  })
})

describe('an x-misaligned candidate is rejected even when tall and vertically close', () => {
  it('a candidate 705px off-centre (a different column) is not paired, however close vertically', () => {
    const page: OcrPage = {
      pageNumber: 1,
      width: 2199,
      height: 2997,
      items: [
        item('statt4.30', 1168, 2102, 1321, 2135),
        item('TestProduct2', 1390, 2012, 1700, 2047),
        item('9.99', 1850, 2012, 2050, 2088), // display-sized, 14px gap, but 705px off-centre
      ],
    }
    const { offers, funnel } = parseFlyer([page], REFERENCE, FLYER_WEEK_LITERAL)
    expect(offers).toHaveLength(0)
    expect(funnel.noDisplayPrice).toBe(1)
  })
})

describe('a vertically-distant candidate is rejected even when tall and x-aligned', () => {
  it('a candidate 1754px above (a different row entirely) is not paired', () => {
    const page: OcrPage = {
      pageNumber: 1,
      width: 2199,
      height: 2997,
      items: [
        item('statt7.90', 142, 2778, 291, 2810),
        item('TestProduct3', 363, 2687, 635, 2716),
        item('3.80', 112, 949, 324, 1024), // display-sized, x-aligned, but 1754px away
      ],
    }
    const { offers, funnel } = parseFlyer([page], REFERENCE, FLYER_WEEK_LITERAL)
    expect(offers).toHaveLength(0)
    expect(funnel.noDisplayPrice).toBe(1)
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

// ---------------------------------------------------------------------------
// joinNameParts — pure, unit-tested first (N2, re-review 2026-09-16).
// ---------------------------------------------------------------------------

describe('joinNameParts', () => {
  it('keeps the hyphen, no space, when the continuation is capitalised (a printed compound)', () => {
    expect(joinNameParts('Delikatess-', 'Fleischkase')).toBe('Delikatess-Fleischkase')
  })

  it('drops the hyphen and inserts a space when the continuation is lowercase (a separate word)', () => {
    expect(joinNameParts('Schweins-Nierstuck-', 'steaksmariniert')).toBe('Schweins-Nierstuck steaksmariniert')
  })

  it('joins with a space when the primary has no trailing hyphen at all (a bare brand word)', () => {
    expect(joinNameParts('Migros', 'Kalbsplatzli')).toBe('Migros Kalbsplatzli')
  })
})

describe('a name split across two OCR lines is joined, not truncated to the first line', () => {
  // The HANDOVER "test encodes the defect" trap: the first cut of this golden
  // master locked in "Migros", "Delikatess-" and "Schweins-Nierstuck-" as
  // correct, when each is really the FIRST of two OCR lines. A single-line
  // name here is too generic for product identity (many "Migros X" products
  // exist) and worse for classification than the joined name.
  const { offers } = parseFlyer(PAGES, REFERENCE, null)

  it('"Migros" + "Kalbsplatzli" (3px gap, same x0) joins to "Migros Kalbsplatzli"', () => {
    expect(offers.some((o) => o.productName === 'Migros')).toBe(false)
    expect(offers.some((o) => o.productName === 'Migros Kalbsplatzli')).toBe(true)
  })

  it('"Delikatess-" + "Fleischkase,IP-SUiSSE" joins across the hyphen, dropping the quality-badge suffix', () => {
    expect(offers.some((o) => o.productName === 'Delikatess-')).toBe(false)
    expect(offers.some((o) => o.productName === 'Delikatess-Fleischkase')).toBe(true)
  })

  it('"Schweins-Nierstuck-" + lowercase "steaksmariniert," drops the hyphen and adds a space', () => {
    // N2 (re-review 2026-09-16): a lowercase continuation is never a
    // capitalised compound continuation — it reads as a separate qualifying
    // word ("...steaks, mariniert" = marinated), so the wrap-hyphen is
    // dropped rather than glued directly onto it.
    expect(offers.some((o) => o.productName === 'Schweins-Nierstuck-')).toBe(false)
    expect(offers.some((o) => o.productName === 'Schweins-Nierstuck-steaksmariniert')).toBe(false)
    expect(offers.some((o) => o.productName === 'Schweins-Nierstuck steaksmariniert')).toBe(true)
  })

  it('a complete one-line name is never joined with an unrelated line below it', () => {
    // "Kartoffeln Patatli" has "Schweiz,Schale,600 g," 12px below it at the
    // same x0 — if joining ever triggered on proximity alone (not on the
    // primary line LOOKING incomplete), this would wrongly become "Kartoffeln
    // Patatli Schweiz".
    const patatli = offers.find((o) => o.productName.startsWith('Kartoffeln'))
    expect(patatli?.productName).toBe('Kartoffeln Patatli')
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
// Multi-buy: PUBLISHED, labelled "from N items" (WP-C4, PM decision TP-7a).
// WP-C1 only parsed and counted these; this WP is what makes them
// publishable, the moment a quantity can be read honestly from a nearby
// "ab N Stück" label.
// ---------------------------------------------------------------------------

describe('parseMultiBuyQuantity — N is read from the label, never hardcoded', () => {
  it('reads "ab 2 Stück" as 2 — the only value the committed fixture actually prints', () => {
    expect(parseMultiBuyQuantity('ab 2 Stuck')).toBe(2)
  })

  it('reads a different printed quantity if one is ever printed — "ab 3 Stück" is 3, not 2', () => {
    expect(parseMultiBuyQuantity('ab 3 Stück')).toBe(3)
  })

  it('reads the glued OCR form "ab2Stuck" the same way', () => {
    expect(parseMultiBuyQuantity('ab2Stuck')).toBe(2)
  })

  it('returns null, never a guessed number, when no label text is given', () => {
    expect(parseMultiBuyQuantity('')).toBeNull()
    expect(parseMultiBuyQuantity('irrelevant text')).toBeNull()
  })
})

describe('inline "X statt Y" (the "ab 2 Stück" multi-buy form) is published as minimum(2), never bare', () => {
  const { offers, funnel } = parseFlyer(PAGES, REFERENCE, null)

  it('"ab 2 Stück 3.02 statt 4.50" is published as minimum(2), never bare', () => {
    const zwetschgen = offers.find((o) => o.productName === 'Zwetschgen')
    expect(zwetschgen).toBeDefined()
    expect(zwetschgen?.salePrice.rappen).toBe(302)
    expect(zwetschgen?.originalPrice?.rappen).toBe(450)
    expect(zwetschgen?.quantityRequirement).toEqual({ kind: 'minimum', count: 2 })
  })

  it('publishes all five real multi-buy anchors on the committed fixture, each labelled "from 2 items"', () => {
    for (const name of ['Zwetschgen', 'Trauben weiss und gemischt,kernlos', 'Extra Himbeeren', 'Migros Bio Bohnen', 'Extra Kiwi Gold']) {
      const offer = offers.find((o) => o.productName === name)
      expect(offer, `expected ${name} to be published`).toBeDefined()
      expect(isMinimumQuantity(offer!.quantityRequirement)).toBe(true)
      if (isMinimumQuantity(offer!.quantityRequirement)) expect(offer!.quantityRequirement.count).toBe(2)
    }
  })

  it('the funnel counts all five as accepted AND as multi-buy — a subset, not a withheld count', () => {
    expect(funnel.multiBuy).toBe(5)
    expect(funnel.multiBuyUnquantified).toBe(0)
    expect(funnel.accepted).toBeGreaterThanOrEqual(5)
  })

  it("the funnel's multiBuy count reconciles with what is actually emitted", () => {
    const publishedMultiBuy = offers.filter((o) => isMinimumQuantity(o.quantityRequirement)).length
    expect(publishedMultiBuy).toBe(funnel.multiBuy)
  })
})

describe('multi-buy is still detected when OCR SPLITS the inline price into two tokens', () => {
  // The UWG-relevant finding from code review: the inline-token check alone
  // ("2.88statt4.30" glued together) misses the real live case where OCR
  // reads the price and the statt line as TWO SEPARATE tokens
  // ("2.88 statt 4.30, (100 g=0.58)" split into "2.88" and "statt 4.30, ...").
  // Once split, the statt is a STANDALONE line satisfying every
  // `isPlausibleSaleFor` bound against the nearby "2.88" — it would
  // otherwise publish as an ordinary, UNLABELLED everyone-price. The
  // "ab N Stück" label printed above the badge is the second, independent
  // signal that catches this regardless of how OCR tokenised the price, and
  // (WP-C4) supplies the quantity that makes it publishable as "from 2 items"
  // instead.
  it('an "ab 2 Stück" label above a split price+statt pair publishes it labelled, not bare', () => {
    const page: OcrPage = {
      pageNumber: 1,
      width: 2199,
      height: 2997,
      items: [
        item('ab 2 Stuck', 150, 1650, 290, 1680),
        item('2.88', 112, 1780, 324, 1855),
        item('TestSplitProduct', 362, 1780, 700, 1815),
        item('statt 4.30', 143, 1870, 292, 1900), // standalone — NOT the inline-glued form
      ],
    }
    const { offers, funnel } = parseFlyer([page], REFERENCE, FLYER_WEEK_LITERAL)
    const offer = offers.find((o) => o.productName === 'TestSplitProduct')
    expect(offer).toBeDefined()
    expect(offer?.salePrice.rappen).toBe(288)
    expect(offer?.originalPrice?.rappen).toBe(430)
    expect(offer?.quantityRequirement).toEqual({ kind: 'minimum', count: 2 })
    expect(funnel.multiBuy).toBe(1)
    expect(funnel.multiBuyUnquantified).toBe(0)
  })
})

describe('a multi-buy-shaped anchor with NO readable quantity is withheld, never guessed (TP-7a)', () => {
  it('an inline price with no locatable "ab N Stück" label anywhere in the tile is withheld', () => {
    const page: OcrPage = {
      pageNumber: 1,
      width: 2199,
      height: 2997,
      items: [
        item('UnlabelledProduct', 362, 946, 700, 980),
        item('2.88statt4.30', 143, 1040, 400, 1070), // inline form, but no "ab N Stück" anywhere on the page
      ],
    }
    const { offers, funnel, warnings } = parseFlyer([page], REFERENCE, FLYER_WEEK_LITERAL)
    expect(offers).toHaveLength(0)
    expect(funnel.multiBuy).toBe(0)
    expect(funnel.multiBuyUnquantified).toBe(1)
    expect(warnings.some((w) => w.message.startsWith('multi-buy:') && w.message.includes('no readable'))).toBe(true)
  })

  it('a found label stating "ab 1 Stück" also withholds — 1 is not a real multi-buy quantity, never assumed 2', () => {
    const page: OcrPage = {
      pageNumber: 1,
      width: 2199,
      height: 2997,
      items: [
        item('ab 1 Stuck', 150, 950, 290, 980),
        item('GarbledLabelProduct', 362, 1040, 700, 1075),
        item('2.88statt4.30', 143, 1090, 400, 1120),
      ],
    }
    const { offers, funnel } = parseFlyer([page], REFERENCE, FLYER_WEEK_LITERAL)
    expect(offers).toHaveLength(0)
    expect(funnel.multiBuyUnquantified).toBe(1)
  })
})

describe('the discount badge search is bounded to the statt line, not "first match anywhere in the x-band"', () => {
  it('a badge far below (a different row) listed FIRST in OCR order is not picked over the anchor\'s own nearer badge', () => {
    // The OLD search (`near.find(PERCENT.test)`) had NO vertical bound at
    // all — any "%" token within an 18%-of-width x-band, taken in raw OCR
    // ARRAY order. Here a decoy "30%" badge belongs to a row 1,460px below
    // and is listed FIRST in the OCR output (a realistic ordering: OCR does
    // not guarantee top-to-bottom item order). The anchor's own badge is
    // "10%", printed directly above it. A wrong badge does not just mislabel
    // the discount — 30% against these prices (11.1% actual) fails the
    // consistency check entirely, so the wrong badge would make the WHOLE
    // OFFER disappear, exactly the "false rejection feeding the yield guard"
    // risk from the code review.
    const page: OcrPage = {
      pageNumber: 1,
      width: 2199,
      height: 2997,
      items: [
        item('30%', 120, 2500, 313, 2615), // decoy: a different row, listed first
        item('2.00', 112, 949, 324, 1024),
        item('RowOneProduct', 362, 946, 700, 980),
        item('statt2.25', 143, 1040, 292, 1070), // 2.00/2.25 = 11.1% actual, consistent with 10%, not 30%
        item('10%', 120, 790, 313, 905), // this row's own badge
      ],
    }
    const { offers } = parseFlyer([page], REFERENCE, FLYER_WEEK_LITERAL)
    const offer = offers.find((o) => o.productName === 'RowOneProduct')
    expect(offer?.discount?.percent).toBe(10)
  })
})

describe('an anchor is on the bare word "statt", not on "statt + a parseable price"', () => {
  // "statt 9." (a single dash, unparseable) must still be COUNTED as an
  // anchor and REJECTED as unreadablePrice — not silently excluded from the
  // anchor count altogether, which is what anchoring on the price-capturing
  // regex used to do (the `unreadablePrice` branch was unreachable dead code:
  // if the regex could not capture a price, the item was never even a
  // `stattItem` in the first place).
  it('"statt 9." (unparseable, single dash) is counted as an anchor and rejected, not silently dropped', () => {
    const page: OcrPage = {
      pageNumber: 1,
      width: 2199,
      height: 2997,
      items: [
        item('3.80', 112, 949, 324, 1024),
        item('TestProduct', 362, 946, 700, 980),
        item('statt 9.', 143, 1040, 292, 1070),
      ],
    }
    const { offers, funnel, warnings } = parseFlyer([page], REFERENCE, FLYER_WEEK_LITERAL)
    expect(offers).toHaveLength(0)
    expect(funnel.anchors).toBe(1)
    expect(funnel.unreadablePrice).toBe(1)
    expect(warnings.some((w) => w.message.includes('unreadable statt price'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Funnel — the counts that were previously discarded entirely (RCA 7.2e).
// ---------------------------------------------------------------------------

describe('funnel counts — anchors, accepted, and every rejection reason', () => {
  it('accounts for all 18 anchors on the committed fixture', () => {
    const { funnel } = parseFlyer(PAGES, REFERENCE, null)
    expect(funnel.anchors).toBe(18)
    // WP-C4: 12 single-item + 5 multi-buy (each honestly labelled "from 2
    // items") = 17 accepted. `multiBuy` and `gridAccepted` are both SUBSETS
    // of `accepted` now, like each other — neither is part of the outcome
    // total below.
    expect(funnel.accepted).toBe(17)
    // F6: exactly one of the 12 single-item offers needed the rappen grid,
    // not the pp rule — "Schweins-Geschnetzeltes," (1.20 statt 1.85, printed
    // 33%, true 35.1%).
    expect(funnel.gridAccepted).toBe(1)
    expect(funnel.multiBuy).toBe(5)
    expect(funnel.multiBuyUnquantified).toBe(0)
    expect(funnel.noDisplayPrice).toBe(1) // Eierschwämme, "06'6" for 9.90
    // "1.20 statt 1.85", printed 33% (true 35.1%), is now ACCEPTED — WP-C2's
    // rappen-grid rule recognises Migros's own 5-rappen shelf-price rounding.
    expect(funnel.invariantRejected).toBe(0)
    expect(funnel.unreadablePrice).toBe(0)
    expect(funnel.noName).toBe(0)
    expect(funnel.invalidValidity).toBe(0)
    const total =
      funnel.accepted +
      funnel.multiBuyUnquantified +
      funnel.noDisplayPrice +
      funnel.invariantRejected +
      funnel.unreadablePrice +
      funnel.noName +
      funnel.invalidValidity
    expect(total).toBe(funnel.anchors)
  })

  it('formats a one-line summary that a run log can carry', () => {
    const { funnel } = parseFlyer(PAGES, REFERENCE, null)
    expect(formatFunnel(funnel)).toBe(
      'funnel: 18 anchors -> 17 accepted (1 via the rappen grid, 5 multi-buy "from N items"), ' +
        '0 multi-buy unquantified (withheld), ' +
        '0 unreadable statt, 1 no display price, 0 no name, 0 invalid validity, 0 discount-inconsistent',
    )
  })
})

// ---------------------------------------------------------------------------
// F2 (code review of WP-C2): the committed fixture no longer exercises
// invariantRejected at all — the one real case it used to catch ("1.20
// statt 1.85") is now correctly accepted, which is progress, but it also
// meant `funnel.invariantRejected === 0` was proven by NOTHING: the
// reviewer changed `funnelField: 'invariantRejected'` to `'noName'` at
// :714 and all 1,156 tests still passed. This synthetic tile restores that
// coverage directly, named after the WP-C1 mis-pair shape it prevents.
// ---------------------------------------------------------------------------
describe('a badge-inconsistent tile is rejected, not silently published (the WP-C1 mis-pair shape)', () => {
  it('statt 4.30, sale 1.90, printed 33% (really 55.8%) — geometrically plausible, badge is wrong', () => {
    // Same tile geometry as a genuinely accepted offer (x-aligned, close
    // above, display-sized) — the display price IS this anchor's own price,
    // by position. Only the printed badge is wrong: 98 rappen off Migros's
    // 5-rappen grid, 22.8pp off the pp rule. That is exactly what
    // invariantRejected exists to catch, distinct from noDisplayPrice
    // (wrong geometry) or noName (no name found).
    const page: OcrPage = {
      pageNumber: 1,
      width: 2199,
      height: 2997,
      items: [
        item('1.90', 112, 500, 290, 577),
        item('WrongBadgeProduct', 362, 497, 700, 531),
        item('statt 4.30', 143, 591, 292, 621),
        item('33%', 700, 560, 850, 590),
      ],
    }
    const { offers, funnel, warnings } = parseFlyer([page], REFERENCE, FLYER_WEEK_LITERAL)
    expect(offers).toHaveLength(0)
    expect(funnel.anchors).toBe(1)
    expect(funnel.invariantRejected).toBe(1)
    expect(funnel.noDisplayPrice).toBe(0)
    expect(funnel.noName).toBe(0)
    expect(warnings.some((w) => w.message.includes('WrongBadgeProduct'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// The 50%-of-PUBLISHABLE-anchors yield guard (real units, not chunks —
// HANDOVER §5). WP-C4: a multi-buy anchor now counts toward `acceptedCount`
// like any other published offer — the denominator no longer excludes it.
// The only anchors still excluded are the ones structurally impossible to
// publish honestly: `multiBuyUnquantifiedCount`, a conditional price whose
// "ab N Stück" quantity could not be read at all. A genuinely multi-buy-
// heavy week where every label DOES read must not trip the guard; a week
// where the LABELS cannot be read still should.
// ---------------------------------------------------------------------------

describe('migrosYieldReason', () => {
  it('excludes only UNQUANTIFIED multi-buy anchors from the denominator — a page of published multi-buy offers is not a parsing failure', () => {
    // Page 2 alone: 6 anchors, all 5 multi-buy ones publish (WP-C4), 1
    // ordinary. acceptedCount=6, publishable=6-0=6, 100% — not a failure.
    expect(migrosYieldReason(6, 6, 0)).toBeNull()
  })

  it('a run converting well under half its PUBLISHABLE anchors is below expected yield', () => {
    expect(migrosYieldReason(1, 3, 0)).toBe('below-expected-yield')
  })

  it('the historical pre-fix conversion rate (~22-29%, RCA item 7) is below expected yield', () => {
    expect(migrosYieldReason(4, 18, 0)).toBe('below-expected-yield')
    expect(migrosYieldReason(5, 18, 0)).toBe('below-expected-yield')
  })

  it("the fixed parser's 94% (17 of 18) on the committed fixture passes", () => {
    expect(migrosYieldReason(17, 18, 0)).toBeNull()
  })

  it('zero anchors is not a yield failure by itself — a different guard handles empty', () => {
    expect(migrosYieldReason(0, 0, 0)).toBeNull()
  })

  it('every anchor being unquantified multi-buy is not a yield failure by itself — nothing was publishable to begin with', () => {
    expect(migrosYieldReason(0, 5, 5)).toBeNull()
  })

  it('a week whose multi-buy labels cannot be read at all still fails the ratio guard', () => {
    // 6 anchors, 4 genuinely unquantified (withheld), 1 accepted, publishable
    // = 6 - 4 = 2, and 1 of 2 (50%) is NOT below the floor — but 0 accepted
    // of the same 2 publishable is.
    expect(migrosYieldReason(0, 6, 4)).toBe('below-expected-yield')
  })
})

describe('createMigrosFlyerSource — the ratio guard fires through the port', () => {
  // Built synthetically (WP-C2, updated WP-C4) rather than off pages 2+3 of
  // the committed fixture: that combination's only rejection used to be the
  // "1.20 statt 1.85" printed-33% offer, which the rappen-grid fix now
  // correctly accepts, so it no longer demonstrates the ratio guard. 1
  // accepted, 2 multi-buy-shaped anchors with NO "ab N Stück" label anywhere
  // (unquantified — still withheld under WP-C4, TP-7a requires an honest
  // label), 2 rejected (a text-sized candidate mistaken for nothing, per the
  // existing "text-sized token" pattern) — publishable = 5 - 2 = 3, accepted
  // = 1, so 1/3 (~33%) is below the 50% floor, even though 1 accepted offer
  // clears an expectedMinimumOffers of 1. Removing the ratio guard and
  // keeping only the absolute floor would make this PASS — that is exactly
  // the mutation this test exists to catch.
  const RATIO_GUARD_PAGE: OcrPage = {
    pageNumber: 1,
    width: 2199,
    height: 9000,
    items: [
      // Accepted: statt 4.30 -> 2.85, printed 33% (true 33.72%, trivially consistent).
      item('2.85', 112, 500, 290, 577),
      item('AcceptedProduct', 362, 497, 700, 531),
      item('statt 4.30', 143, 591, 292, 621),
      item('33%', 700, 560, 850, 590),
      // Multi-buy-unquantified #1 — inline form, no "ab N Stück" label
      // anywhere on the page, so no quantity can be read and it is withheld.
      item('MultiBuyProduct1', 362, 2130, 700, 2165),
      item('2.88statt4.30', 143, 2220, 400, 2250),
      // Multi-buy-unquantified #2 — same shape, shifted well clear.
      item('MultiBuyProduct2', 362, 3630, 700, 3665),
      item('2.88statt4.30', 143, 3720, 400, 3750),
      // Rejected #1 — a text-sized ("0.58") token is not the display price.
      item('statt5.70', 143, 5040, 292, 5070),
      item('RejectedProduct1', 362, 4946, 700, 4980),
      item('0.58', 150, 4995, 280, 5020),
      // Rejected #2 — same shape, shifted well clear.
      item('statt5.70', 143, 6540, 292, 6570),
      item('RejectedProduct2', 362, 6446, 700, 6480),
      item('0.58', 150, 6495, 280, 6520),
    ],
  }

  it('fails below-expected-yield even though the absolute floor is cleared', () => {
    const source = createMigrosFlyerSource({
      loadPages: async () => [RATIO_GUARD_PAGE],
      reference: REFERENCE,
      fallbackValidity: FLYER_WEEK_LITERAL,
      expectedMinimumOffers: 1,
    })
    return source.fetchOffers('2026-W36').then((r) => {
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('below-expected-yield')
    })
  })

  it('sanity-checks the synthetic page: 5 anchors, 2 multi-buy unquantified, 1 accepted', () => {
    const { funnel } = parseFlyer([RATIO_GUARD_PAGE], REFERENCE, FLYER_WEEK_LITERAL)
    expect(funnel.anchors).toBe(5)
    expect(funnel.multiBuyUnquantified).toBe(2)
    expect(funnel.multiBuy).toBe(0)
    expect(funnel.accepted).toBe(1)
    expect(funnel.noDisplayPrice).toBe(2)
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
    // fixture because none of the 12 accepted tiles carries a "gültig vom"
    // line of its own — see the synthetic-fixture tests above for the case
    // where that is NOT true.
    expect(offers.every((o) => o.validity.from === '2026-09-03' && o.validity.to === '2026-09-09')).toBe(true)
  })

  it('keeps printed discounts within a bounded deviation of the price pair — a data assertion, not a re-implementation', () => {
    // Reads the printed-vs-actual gap straight off the fixture data rather
    // than re-deriving isConsistentWithPrices' own pp-OR-grid logic (which
    // could only ever agree with itself). Every accepted offer's printed
    // badge must stay within 4 rappen of round(original * (1 - pct/100))
    // AND within 2.2pp of the true percentage — bounds observed on this
    // fixture (worst case "Schweins-Geschnetzeltes,": 4 rappen / 2.14pp,
    // the WP-C2 case) with headroom, so the assertion moves if the data
    // does, rather than only failing when `createOffer` stops being called.
    const MAX_OBSERVED_RAPPEN_DEVIATION = 4
    const MAX_OBSERVED_PP_DEVIATION = 2.2
    for (const o of offers) {
      if (!o.discount || !o.originalPrice) continue
      const actualPct = ((o.originalPrice.rappen - o.salePrice.rappen) / o.originalPrice.rappen) * 100
      const ppDeviation = Math.abs(actualPct - o.discount.percent)
      const expectedSaleRappen = Math.round(o.originalPrice.rappen * (1 - o.discount.percent / 100))
      const rappenDeviation = Math.abs(expectedSaleRappen - o.salePrice.rappen)
      expect(rappenDeviation).toBeLessThanOrEqual(MAX_OBSERVED_RAPPEN_DEVIATION)
      expect(ppDeviation).toBeLessThanOrEqual(MAX_OBSERVED_PP_DEVIATION)
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
    if (r.ok) expect(r.offers.length).toBe(17)
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

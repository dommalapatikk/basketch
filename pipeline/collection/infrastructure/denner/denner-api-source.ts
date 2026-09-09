// DennerApiSource — anti-corruption layer for Denner's promotion API.
//
// Denner is the most valuable source in the set: it is the only Swiss retailer
// that publishes its own grocery taxonomy alongside prices, which makes it the
// marking scheme for scoring our categoriser (see docs/collection-module-design.md).
//
// Every Denner-shaped name — attributeInfo, insteadPriceText, discount_text,
// _tracking_item_category2, prd_page, refiningId — stops at this file.
//
//   POST https://www.denner.ch/search-api/simplePageContent
//   { moduleVersion, sessionId: <any uuid>, region, advanced, parameters, pageId }
//
// No auth. pageId 12 = current week, 13 = next week. 24 items per page;
// pagination is driven by `parameters.refiningId` (NOT top-level, NOT prd_* keys) —
// this cost real time to find, see research Part 1.

import { printedDiscount } from '../../domain/discount'
import { createMoney } from '../../domain/money'
import { type Offer, createOffer } from '../../domain/offer'
import {
  type CollectionResult,
  type CollectionWarning,
  type IsoWeek,
  type OfferSource,
  collectedWithYieldCheck,
  collectionFailed,
} from '../../domain/offer-source'
import { sourceUrlImage } from '../../domain/product-image'
import { isOk } from '../../domain/result'
import { type ValidityPeriod, createValidityPeriod } from '../../domain/validity-period'

const ENDPOINT = 'https://www.denner.ch/search-api/simplePageContent'
const SITE = 'https://www.denner.ch'
const BLOCK_NAME = 'Weekly special'
const PAGE_ID_CURRENT_WEEK = 12

/** Constraint string from the API's own page descriptors. */
const CONSTRAINTS = 'itemType%3APRODUCT_%2F_promo_current_week%3Atrue_%2F_weekend_highlight%3Afalse'

// ── Denner's wire shape. Referenced nowhere outside this file. ───────────────

type DennerVal = { value?: string; label?: string }
type DennerAttr = { attributeName?: string; vals?: DennerVal[] }
type DennerItem = { sku?: string; price?: number; attributeInfo?: DennerAttr[] }
type DennerSlot = { item?: DennerItem }
type DennerBlock = { blockName?: string; stats?: { totalResults?: number; totalPages?: number }; slots?: DennerSlot[] }
type DennerResponse = { blocks?: { searches?: DennerBlock[] } }

function attr(item: DennerItem, name: string): string | null {
  const found = item.attributeInfo?.find((a) => a.attributeName === name)
  const v = found?.vals?.[0]
  const raw = v?.label ?? v?.value
  return raw?.trim() ? raw.trim() : null
}

// ── Swiss price and badge parsing ────────────────────────────────────────────

/**
 * "statt 2.25" · "statt 75.30" · "statt 10.–"
 * The en-dash form means whole francs — Swiss retail shorthand.
 */
export function parseInsteadPrice(text: string | null): number | null {
  if (!text) return null
  const m = text.match(/(\d{1,4})[.,](\d{2}|[–-])/)
  if (!m) return null
  const francs = Number(m[1])
  const cents = m[2] === '–' || m[2] === '-' ? 0 : Number(m[2])
  if (!Number.isFinite(francs) || !Number.isFinite(cents)) return null
  return francs + cents / 100
}

/**
 * "25%" → 25 · "½ PREIS" → 50 · "SPECIAL" / "AKTION" → null (a label, not a discount).
 * Returning null is correct and important: a badge without a percentage must
 * never become an invented discount.
 */
export function parseDiscountBadge(text: string | null): number | null {
  if (!text) return null
  const pct = text.match(/(\d{1,2})\s*%/)
  if (pct) return Number(pct[1])
  if (/½|1\/2|halb/i.test(text)) return 50
  return null
}

/** Denner sends unix seconds. */
function toIsoDate(unixSeconds: string | null): string | null {
  if (!unixSeconds) return null
  const n = Number(unixSeconds)
  if (!Number.isFinite(n) || n <= 0) return null
  return new Date(n * 1000).toISOString().slice(0, 10)
}

// ── Translation: Denner item → domain Offer ──────────────────────────────────

export function mapItemToOffer(
  item: DennerItem,
  fallbackValidity: ValidityPeriod | null,
): { offer: Offer } | { warning: string } {
  const name = attr(item, '_tracking_item_name') ?? attr(item, 'name')
  if (!name) return { warning: `item ${item.sku ?? '?'} has no name` }

  if (typeof item.price !== 'number') return { warning: `${name}: no price` }
  const sale = createMoney(item.price)
  if (!isOk(sale)) return { warning: `${name}: bad price ${item.price} — ${sale.error}` }

  const insteadFrancs = parseInsteadPrice(attr(item, 'insteadPriceText'))
  let original = null
  if (insteadFrancs !== null) {
    const m = createMoney(insteadFrancs)
    if (!isOk(m)) return { warning: `${name}: bad original price ${insteadFrancs}` }
    original = m.value
  }

  // A badge only becomes a Discount when the item actually has an original
  // price — otherwise the ALDI rule in createOffer would reject it anyway.
  let discount = null
  if (original !== null) {
    const pct = parseDiscountBadge(attr(item, 'discount_text'))
    if (pct !== null) {
      const d = printedDiscount(pct)
      if (isOk(d)) discount = d.value
    }
  }

  const from = toIsoDate(attr(item, 'promotionFrom'))
  const to = toIsoDate(attr(item, 'promotionTo'))
  let validity = fallbackValidity
  if (from && to) {
    const v = createValidityPeriod(from, to)
    if (isOk(v)) validity = v.value
  }
  if (!validity) return { warning: `${name}: no usable validity period` }

  const imageUrl = attr(item, 'imageUrl')
  const image = imageUrl ? sourceUrlImage(imageUrl) : null
  const itemUrl = attr(item, 'itemUrl')

  const offer = createOffer({
    retailer: 'denner',
    productName: name,
    salePrice: sale.value,
    originalPrice: original,
    discount,
    validity,
    image: image && isOk(image) ? image.value : null,
    sourceCategory: attr(item, '_tracking_item_category2'),
    sourceUrl: itemUrl ? (itemUrl.startsWith('http') ? itemUrl : `${SITE}${itemUrl}`) : null,
  })

  return isOk(offer) ? { offer: offer.value } : { warning: `${name}: ${offer.error}` }
}

/** Pulls the Weekly special block out of a raw response. */
export function parseResponse(
  body: unknown,
  fallbackValidity: ValidityPeriod | null,
): { offers: Offer[]; warnings: CollectionWarning[]; totalResults: number; totalPages: number } {
  const res = body as DennerResponse
  const block = res?.blocks?.searches?.find((b) => b.blockName === BLOCK_NAME)
  const offers: Offer[] = []
  const warnings: CollectionWarning[] = []

  for (const slot of block?.slots ?? []) {
    if (!slot.item) continue
    const mapped = mapItemToOffer(slot.item, fallbackValidity)
    if ('offer' in mapped) offers.push(mapped.offer)
    else warnings.push({ message: mapped.warning, item: slot.item.sku })
  }

  return {
    offers,
    warnings,
    totalResults: block?.stats?.totalResults ?? 0,
    totalPages: block?.stats?.totalPages ?? 1,
  }
}

// ── The source ───────────────────────────────────────────────────────────────

export type DennerSourceDeps = {
  /** Injected so tests never touch the network. */
  fetchPage: (pageId: number, page: number) => Promise<unknown>
  fallbackValidity?: ValidityPeriod | null
  maxPages?: number
  /** Overridable so tests can exercise the parse path on a small fixture. */
  expectedMinimumOffers?: number
}

/** Denner published 246 offers in the sampled week; a healthy run clears 100. */
export const DENNER_EXPECTED_MINIMUM = 100

export function requestBody(pageId: number, page: number): string {
  const parameters =
    page <= 1
      ? {}
      : {
          refiningId: `prd_page=${page}&prd_nbResultsPerPage=-1&prd_sorting=MY_SELECTION&prd_constraints=${CONSTRAINTS}`,
        }
  return JSON.stringify({
    moduleVersion: 'D2.0',
    // Any UUID works; the API does not authenticate it.
    sessionId: '00000000-0000-4000-8000-000000000000',
    region: 'de_CH',
    advanced: { device: 'COMPUTER' },
    parameters,
    pageId,
  })
}

export async function httpFetchPage(pageId: number, page: number): Promise<unknown> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'basketch/1.0 (+https://basketch.vercel.app; weekly price comparison)',
    },
    body: requestBody(pageId, page),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function createDennerApiSource(deps: DennerSourceDeps): OfferSource {
  const expectedMinimumOffers = deps.expectedMinimumOffers ?? DENNER_EXPECTED_MINIMUM

  return {
    retailer: 'denner',
    expectedMinimumOffers,

    async fetchOffers(_week: IsoWeek): Promise<CollectionResult> {
      const all: Offer[] = []
      const warnings: CollectionWarning[] = []
      const maxPages = deps.maxPages ?? 15

      let page = 1
      let totalPages = 1

      while (page <= Math.min(totalPages, maxPages)) {
        let body: unknown
        try {
          body = await deps.fetchPage(PAGE_ID_CURRENT_WEEK, page)
        } catch (e) {
          // A first-page failure is fatal; a later one is partial data we keep.
          if (page === 1) {
            return collectionFailed('denner', 'source-unavailable', e instanceof Error ? e.message : String(e))
          }
          warnings.push({ message: `page ${page} failed: ${e instanceof Error ? e.message : String(e)}` })
          break
        }

        const parsed = parseResponse(body, deps.fallbackValidity ?? null)
        if (page === 1) totalPages = parsed.totalPages
        all.push(...parsed.offers)
        warnings.push(...parsed.warnings)

        // Defensive: never loop forever if the API stops advancing.
        if (parsed.offers.length === 0 && parsed.warnings.length === 0) break
        page += 1
      }

      return collectedWithYieldCheck({ retailer: 'denner', expectedMinimumOffers }, all, warnings)
    },
  }
}

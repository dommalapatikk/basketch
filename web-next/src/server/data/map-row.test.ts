import { describe, expect, it, vi } from 'vitest'

import { mapRow } from './supabase-provider'

/**
 * The anti-corruption layer, tested from the database side.
 *
 * Every retailer adapter is an ACL (CLAUDE.md § DDD) and so is this: it is the
 * one place where snake_case columns, nullable fields that only mean something
 * in pairs, and rows written before a migration existed get turned into domain
 * value objects. Downstream code should never have to know any of that, which
 * is only true if this function refuses everything it cannot honestly convert.
 */

const row = (over: Record<string, unknown> = {}) => ({
  id: 'd1',
  store: 'coop',
  product_name: 'Emmi Vollmilch 1L',
  category: 'fresh',
  category_slug: 'dairy',
  sub_category: 'dairy',
  sale_price: 1.45,
  original_price: 1.95,
  discount_percent: 26,
  price_per_unit: 1.45,
  canonical_unit: 'L',
  format: '1 L',
  image_url: null,
  valid_from: '2026-09-09',
  valid_to: '2026-09-15',
  source_url: 'https://coop.ch/x',
  product_id: 'p1',
  taxonomy_confidence: 0.94,
  is_uncertain: false,
  storage: 'chilled',
  price_basis: 'everyone',
  loyalty_programme: null,
  page_image_url: null,
  crop_x: null,
  crop_y: null,
  crop_w: null,
  crop_h: null,
  attributes: { fatPercent: 3.5 },
  is_active: true,
  updated_at: '2026-09-11T00:00:00Z',
  ...over,
})

// biome-ignore lint/suspicious/noExplicitAny: the fixture is a DB row shape, not a domain type
const map = (over: Record<string, unknown> = {}) => mapRow(row(over) as any)

describe('mapRow — rows it converts', () => {
  it('turns a well-formed row into a deal', () => {
    const deal = map()
    expect(deal).toMatchObject({ id: 'd1', store: 'coop', category: 'fresh', storage: 'chilled' })
  })

  it('reads the two price columns as one value object', () => {
    const deal = map({ price_basis: 'member-only', loyalty_programme: 'Lidl Plus' })
    expect(deal?.priceBasis).toEqual({ kind: 'member-only', programme: 'Lidl Plus' })
  })

  it('drops a loyalty programme attached to an open price', () => {
    // The column allows it; carrying it would let a card claim membership is
    // needed when it is not.
    const deal = map({ price_basis: 'everyone', loyalty_programme: 'Supercard' })
    expect(deal?.priceBasis).toEqual({ kind: 'everyone' })
  })

  it('reads a complete crop into a region', () => {
    const deal = map({
      image_url: null,
      page_image_url: 'https://image.isu.pub/rev/jpg/page_5.jpg',
      crop_x: 0.1,
      crop_y: 0.2,
      crop_w: 0.3,
      crop_h: 0.25,
    })
    expect(deal?.crop).toMatchObject({ x: 0.1, y: 0.2, width: 0.3, height: 0.25 })
  })
})

describe('mapRow — rows it refuses', () => {
  it('drops a member price that names no programme', () => {
    // The one row we will not show at all. Unlabelled is the Art. 3(1)(e) UWG
    // problem; relabelling it as an open price is worse.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(map({ price_basis: 'member-only', loyalty_programme: null })).toBeNull()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('drops an unknown store rather than rendering an unbranded card', () => {
    expect(map({ store: 'migrolino' })).toBeNull()
  })

  it('drops a row whose top-level category is not one of the three groups', () => {
    expect(map({ category: 'kiosk' })).toBeNull()
  })
})

describe('mapRow — crops it will not render', () => {
  const withCrop = (crop: Record<string, unknown>) =>
    map({
      image_url: null,
      page_image_url: 'https://image.isu.pub/rev/jpg/page_5.jpg',
      crop_x: 0.1,
      crop_y: 0.2,
      crop_w: 0.3,
      crop_h: 0.25,
      ...crop,
    })

  it('keeps the deal and drops only the image when the crop is unusable', () => {
    // The price is still correct — it is the picture we cannot place. Losing
    // the deal over a rectangle would be the wrong trade.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const deal = withCrop({ crop_w: 0 })
    expect(deal).not.toBeNull()
    expect(deal?.crop).toBeNull()
    spy.mockRestore()
  })

  it('refuses a crop that runs off the edge of the page', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(withCrop({ crop_x: 0.9, crop_w: 0.3 })?.crop).toBeNull()
    spy.mockRestore()
  })

  it('refuses a partial crop rather than guessing the missing side', () => {
    expect(withCrop({ crop_h: null })?.crop).toBeNull()
  })

  it('refuses the empty-revision Issuu url that 404s in the browser', () => {
    // 'image.isu.pub//jpg/page_5.jpg' — a real defect: every Migros crop would
    // 404 in the visitor's browser while the pipeline reported a clean run.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(withCrop({ page_image_url: 'not-a-url' })?.crop).toBeNull()
    spy.mockRestore()
  })
})

describe('mapRow — rows written before the 2026-09-11 migration', () => {
  it('reads a row with none of the new columns', () => {
    const deal = map({
      is_uncertain: null,
      storage: null,
      price_basis: null,
      loyalty_programme: null,
      attributes: null,
    })
    expect(deal).toMatchObject({ isUncertain: false, storage: null, attributes: {} })
    expect(deal?.priceBasis).toEqual({ kind: 'everyone' })
  })

  it('does not read a missing storage value as ambient', () => {
    expect(map({ storage: null })?.storage).toBeNull()
  })

  it('ignores a storage value the CHECK constraint would reject', () => {
    expect(map({ storage: 'tiefkühl' })?.storage).toBeNull()
  })
})

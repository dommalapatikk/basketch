// SourceAttributes — metadata the retailer itself publishes alongside an offer.
//
// WHY this exists: component 2 must not use a language model to guess values a
// retailer is handing us for free. Denner publishes content_size, eco_labels,
// unit_price, box_item_count and — for wine — grape, vintage, region and country.
// Before this type existed, DennerApiSource discarded all of it and the
// categoriser would have had to infer a vintage from a product name that does
// not contain one.
//
// See docs/component-2-agent-design.md §2 (the trust hierarchy) and §3.
//
// This is domain vocabulary, not retailer vocabulary. Names like
// `content_size_text`, `nameSubline` and `_tracking_item_brand` die inside the
// adapter; what arrives here is already translated.

import type { Money } from './money'
import { type Result, err, ok } from './result'

/** Units a retailer prints. Normalised to a base unit on construction. */
export type PublishedUnit = 'g' | 'kg' | 'ml' | 'cl' | 'l' | 'piece'

/** Base units only. Comparable across retailers without further conversion. */
export type QuantityUnit = 'g' | 'ml' | 'piece'

export type PublishedQuantity = {
  readonly amount: number
  readonly unit: QuantityUnit
}

/**
 * Wine fields Denner publishes as structured attributes. Absent for every other
 * product type, and for every other retailer.
 */
export type PublishedWine = {
  readonly colour: string | null
  readonly vintage: number | null
  readonly grape: string | null
  readonly region: string | null
  readonly country: string | null
}

export type SourceAttributes = {
  readonly quantity: PublishedQuantity | null
  /** Units per pack — 6 for a 6 x 75 cl case. */
  readonly packSize: number | null
  /** Price per single unit, where the retailer prints one. */
  readonly unitPrice: Money | null
  /** Certification and origin labels: 'Suisse Garantie', 'Bio', 'IP-SUISSE'. */
  readonly labels: readonly string[]
  /** 'bottle', 'can', 'carton' — the retailer's own container word. */
  readonly container: string | null
  /**
   * The retailer's free-text descriptor, kept verbatim for tier-2 parsing:
   * Denner nameSubline ('am Stück, mager, ca. 900 g, per 100 g'),
   * Lidl description, Volg section heading.
   */
  readonly descriptor: string | null
  readonly wine: PublishedWine | null
}

export const EMPTY_SOURCE_ATTRIBUTES: SourceAttributes = {
  quantity: null,
  packSize: null,
  unitPrice: null,
  labels: [],
  container: null,
  descriptor: null,
  wine: null,
}

/** Grape harvest years we will accept. Anything outside is a parse error. */
const MIN_VINTAGE = 1900
const MAX_VINTAGE = 2100

const TO_BASE: Record<PublishedUnit, { factor: number; unit: QuantityUnit }> = {
  g: { factor: 1, unit: 'g' },
  kg: { factor: 1000, unit: 'g' },
  ml: { factor: 1, unit: 'ml' },
  cl: { factor: 10, unit: 'ml' },
  l: { factor: 1000, unit: 'ml' },
  piece: { factor: 1, unit: 'piece' },
}

/**
 * Normalises a printed quantity to a base unit.
 *
 * Rounding matters: 0.38 kg * 1000 is 380.00000000000006 in IEEE 754, and that
 * dust would propagate into every unit-price comparison downstream.
 */
export function publishedQuantity(amount: number, unit: PublishedUnit): Result<PublishedQuantity> {
  if (!Number.isFinite(amount)) return err(`quantity amount must be finite, got ${amount}`)
  if (amount <= 0) return err(`quantity amount must be greater than 0, got ${amount}`)

  const conversion = TO_BASE[unit]
  if (!conversion) return err(`unknown unit '${unit}'`)

  // Three decimals is far below any real packaging precision.
  const converted = Math.round(amount * conversion.factor * 1000) / 1000
  return ok({ amount: converted, unit: conversion.unit })
}

export type SourceAttributesInput = {
  quantity?: PublishedQuantity | null
  packSize?: number | null
  unitPrice?: Money | null
  labels?: readonly string[]
  container?: string | null
  descriptor?: string | null
  wine?: {
    colour?: string | null
    vintage?: number | null
    grape?: string | null
    region?: string | null
    country?: string | null
  } | null
}

/**
 * Unicode spaces that are visually identical to a plain space but not equal to
 * one. Denner ships U+00A0 between a number and its unit ('900 g') and
 * inside region names ('Colchagua Valley').
 *
 * Left unnormalised these produce cache keys that never match, comparisons that
 * silently fail, and duplicate products that look identical on screen.
 */
const UNICODE_SPACES = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g

function blankToNull(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null
  const normalised = v.replace(UNICODE_SPACES, ' ').trim()
  return normalised || null
}

function buildWine(input: NonNullable<SourceAttributesInput['wine']>): Result<PublishedWine> {
  const vintage = input.vintage ?? null
  if (vintage !== null) {
    if (!Number.isInteger(vintage)) return err(`wine vintage must be a whole year, got ${vintage}`)
    if (vintage < MIN_VINTAGE || vintage > MAX_VINTAGE) {
      return err(`wine vintage ${vintage} is outside ${MIN_VINTAGE}–${MAX_VINTAGE}`)
    }
  }

  return ok({
    colour: blankToNull(input.colour),
    vintage,
    grape: blankToNull(input.grape),
    region: blankToNull(input.region),
    country: blankToNull(input.country),
  })
}

export function createSourceAttributes(input: SourceAttributesInput): Result<SourceAttributes> {
  const packSize = input.packSize ?? null
  if (packSize !== null) {
    if (!Number.isInteger(packSize)) {
      return err(`packSize must be a whole number, got ${packSize}`)
    }
    if (packSize < 1) return err(`packSize must be at least 1, got ${packSize}`)
  }

  let wine: PublishedWine | null = null
  if (input.wine) {
    const built = buildWine(input.wine)
    if (!built.ok) return err(built.error)
    wine = built.value
  }

  // Trim, drop blanks, keep first occurrence. Retailers repeat labels.
  const labels: string[] = []
  for (const raw of input.labels ?? []) {
    const label = blankToNull(raw)
    if (label && !labels.includes(label)) labels.push(label)
  }

  return ok({
    quantity: input.quantity ?? null,
    packSize,
    unitPrice: input.unitPrice ?? null,
    labels,
    container: blankToNull(input.container),
    descriptor: blankToNull(input.descriptor),
    wine,
  })
}

function wineIsEmpty(wine: PublishedWine): boolean {
  return (
    wine.colour === null &&
    wine.vintage === null &&
    wine.grape === null &&
    wine.region === null &&
    wine.country === null
  )
}

/**
 * True when the retailer published anything usable.
 *
 * Drives telemetry: a source whose published-data rate drops to zero has
 * changed shape, even if offer parsing still succeeds.
 */
export function hasPublishedData(a: SourceAttributes): boolean {
  if (a.quantity !== null) return true
  if (a.packSize !== null) return true
  if (a.unitPrice !== null) return true
  if (a.labels.length > 0) return true
  if (a.container !== null) return true
  if (a.descriptor !== null) return true
  if (a.wine !== null && !wineIsEmpty(a.wine)) return true
  return false
}

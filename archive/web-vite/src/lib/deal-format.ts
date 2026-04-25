// Pure formatting helpers for v4 band rendering. Keep out of React component
// files so tests don't have to mount anything to exercise them.

import type { CanonicalUnit } from '@shared/types'

import type { BandDeal } from '../components/SubCategoryBand'

export function formatChf(n: number): string {
  return `CHF ${n.toFixed(2)}`
}

const UNIT_SUFFIX: Record<CanonicalUnit, string> = {
  L: 'L',
  kg: 'kg',
  '100g': '100g',
  piece: 'piece',
}

/** "CHF 0.29 / L" — null when we don't have per-unit pricing. */
export function formatPerUnit(
  pricePerUnit: number | undefined,
  canonicalUnit: CanonicalUnit | undefined,
): string | null {
  if (pricePerUnit == null || canonicalUnit == null) return null
  return `CHF ${pricePerUnit.toFixed(2)} / ${UNIT_SUFFIX[canonicalUnit]}`
}

/**
 * Short human description of the pack — "6 × 1.5 L · 9 L" or "500 g" or
 * empty string when we have nothing to say.
 */
export function formatPackDescriptor(deal: BandDeal): string {
  const parts: string[] = []
  if (deal.format) parts.push(titleCase(deal.format))
  if (deal.packSize != null && deal.packSize > 1 && deal.unitVolumeMl != null) {
    parts.push(`${deal.packSize} × ${formatMl(deal.unitVolumeMl)}`)
  } else if (deal.unitVolumeMl != null) {
    parts.push(formatMl(deal.unitVolumeMl))
  }
  if (deal.canonicalUnit === 'L' && deal.pricePerUnit != null && deal.packSize != null && deal.unitVolumeMl != null) {
    const totalL = (deal.packSize * deal.unitVolumeMl) / 1000
    if (totalL > 1) parts.push(`${totalL} L`)
  }
  return parts.join(' · ')
}

function formatMl(ml: number): string {
  if (ml >= 1000 && ml % 1000 === 0) return `${ml / 1000} L`
  if (ml >= 1000) return `${(ml / 1000).toFixed(1)} L`
  return `${ml} ml`
}

/** Convert "still-water" or "still water" → "Still Water". */
export function titleCase(input: string): string {
  return input
    .split(/[-\s]/)
    .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
}

/**
 * Delta line for a ladder row vs the hero.
 * Returns either a CHF/unit signed string or a "different format" warning.
 * Null when we don't have enough data to compare (hero missing pricePerUnit).
 */
export function deltaVsHero(
  row: BandDeal,
  hero: BandDeal,
): { text: string; sameFormat: boolean } | null {
  if (hero.pricePerUnit == null || hero.canonicalUnit == null) return null

  const sameFormat = row.format != null && hero.format != null && row.format === hero.format
  if (!sameFormat) {
    return { text: '⚠ Different format — not comparable', sameFormat: false }
  }

  if (row.pricePerUnit == null) return null
  const diff = row.pricePerUnit - hero.pricePerUnit
  const unit = UNIT_SUFFIX[hero.canonicalUnit]
  if (diff === 0) return { text: `Same price / ${unit}`, sameFormat: true }
  const sign = diff > 0 ? '+' : '-'
  return { text: `${sign}CHF ${Math.abs(diff).toFixed(2)} / ${unit}`, sameFormat: true }
}

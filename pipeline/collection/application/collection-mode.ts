// Collection cutover — running the new module beside the old one before trusting it.
//
// `run.ts` reads *-deals.json written by the Python aktionis scraper. The new
// collection module talks to seven retailers directly. Swapping one for the
// other in a single deploy changes what every visitor sees, and the new path has
// never run in production.
//
// So it runs in one of three modes:
//
//   off      the Python files, exactly as today. The escape hatch.
//   shadow   BOTH run. The old path still writes; the new one writes NOTHING
//            and reports what it WOULD have stored. One cycle of this and the
//            differences are facts rather than predictions.
//   live     the new module writes; the Python files are ignored.
//
// WHY SHADOW HERE AND NOT FOR THE CATEGORISER: the old keyword matcher was
// known-broken, so comparing against it would have measured noise (decision D4).
// The old COLLECTION path is not broken — it is limited. Its numbers are a
// meaningful baseline, and a bad cutover means a week of wrong prices on a live
// site.

import type { Offer, Retailer } from '../domain/offer'

export type CollectionMode = 'off' | 'shadow' | 'live'

export function readCollectionMode(env: Record<string, string | undefined>): CollectionMode {
  const raw = (env.COLLECTION_MODE ?? 'off').trim().toLowerCase()
  if (raw === 'shadow' || raw === 'live') return raw
  return 'off'
}

export type LegacyCount = { readonly retailer: string; readonly count: number }

export type RetailerComparison = {
  readonly retailer: string
  readonly legacy: number
  readonly collected: number
  readonly delta: number
  /** Offers carrying metadata the retailer published. The legacy path has none. */
  readonly withPublishedData: number
  readonly withImages: number
  readonly withCropRegions: number
  readonly memberOnly: number
  readonly note: string
}

/** A per-retailer swing beyond this is worth a human looking before cutover. */
export const SIGNIFICANT_DELTA = 0.25

function noteFor(legacy: number, collected: number, crops: number, memberOnly: number): string {
  const notes: string[] = []

  if (legacy === 0 && collected > 0) notes.push('new retailer — not collected by the legacy path at all')
  else if (collected === 0 && legacy > 0) notes.push('⚠️ COLLECTED NOTHING while the legacy path did')
  else if (legacy > 0) {
    const change = (collected - legacy) / legacy
    if (Math.abs(change) >= SIGNIFICANT_DELTA) {
      notes.push(`${change > 0 ? '+' : ''}${(change * 100).toFixed(0)}% vs legacy`)
    }
  }

  if (crops > 0) notes.push(`${crops} flyer crops (legacy had none)`)
  // The Lidl Plus filter dropping offers is the POINT, not a regression: those
  // prices are member-only and publishing them as normal prices is the
  // Art. 3(1)(e) UWG exposure.
  if (memberOnly > 0) notes.push(`${memberOnly} member-only prices flagged`)

  return notes.join(' · ') || 'no significant change'
}

export function compareCollection(
  legacy: readonly LegacyCount[],
  collected: readonly Offer[],
): RetailerComparison[] {
  const legacyByRetailer = new Map(legacy.map((l) => [l.retailer, l.count]))
  const byRetailer = new Map<string, Offer[]>()
  for (const o of collected) {
    const list = byRetailer.get(o.retailer) ?? []
    list.push(o)
    byRetailer.set(o.retailer, list)
  }

  const retailers = new Set<string>([...legacyByRetailer.keys(), ...byRetailer.keys()])
  const out: RetailerComparison[] = []

  for (const retailer of [...retailers].sort()) {
    const offers = byRetailer.get(retailer) ?? []
    const legacyCount = legacyByRetailer.get(retailer) ?? 0

    const withPublishedData = offers.filter(
      (o) => o.sourceAttributes.descriptor !== null || o.sourceAttributes.quantity !== null,
    ).length
    const withImages = offers.filter((o) => o.image !== null).length
    const withCropRegions = offers.filter((o) => o.image?.kind === 'crop-region').length
    const memberOnly = offers.filter((o) => o.priceBasis.kind === 'member-only').length

    out.push({
      retailer,
      legacy: legacyCount,
      collected: offers.length,
      delta: offers.length - legacyCount,
      withPublishedData,
      withImages,
      withCropRegions,
      memberOnly,
      note: noteFor(legacyCount, offers.length, withCropRegions, memberOnly),
    })
  }

  return out
}

/** True when nothing in the comparison should stop a cutover. */
export function safeToCutOver(comparisons: readonly RetailerComparison[]): boolean {
  return !comparisons.some((c) => c.legacy > 0 && c.collected === 0)
}

export function formatComparison(comparisons: readonly RetailerComparison[]): string {
  const lines = [
    'retailer   legacy  collected   delta   published  images  crops  member',
    '─────────  ──────  ─────────  ──────   ─────────  ──────  ─────  ──────',
  ]
  for (const c of comparisons) {
    lines.push(
      `${c.retailer.padEnd(9)}  ${String(c.legacy).padStart(6)}  ${String(c.collected).padStart(9)}  ` +
        `${(c.delta >= 0 ? '+' : '') + c.delta}`.padStart(6) +
        `   ${String(c.withPublishedData).padStart(9)}  ${String(c.withImages).padStart(6)}  ` +
        `${String(c.withCropRegions).padStart(5)}  ${String(c.memberOnly).padStart(6)}`,
    )
    if (c.note !== 'no significant change') lines.push(`${' '.repeat(11)}└─ ${c.note}`)
  }
  const totals = comparisons.reduce(
    (a, c) => ({ legacy: a.legacy + c.legacy, collected: a.collected + c.collected }),
    { legacy: 0, collected: 0 },
  )
  lines.push('', `TOTAL      ${String(totals.legacy).padStart(6)}  ${String(totals.collected).padStart(9)}`)
  if (!safeToCutOver(comparisons)) {
    lines.push('', '⚠️  NOT SAFE TO CUT OVER — a retailer collected nothing while the legacy path did.')
  }
  return lines.join('\n')
}

/** Retailers the legacy path covers, for a like-for-like count. */
export function legacyCounts(storeDeals: ReadonlyMap<string, readonly unknown[]>): LegacyCount[] {
  return [...storeDeals.entries()].map(([retailer, deals]) => ({ retailer, count: deals.length }))
}

export type { Retailer }

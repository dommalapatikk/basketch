// DealBand — v4 primitive: hero (CHF/L primary) + format chips + ladder
// with format-aware delta + no-deal footer + drill-down link.
// Consumes BandDeal[] (already per-store-best from deal-groups.ts).

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import type { Store } from '@shared/types'
import { ALL_STORES } from '@shared/types'

import { schemaFor } from '@shared/sub-category-schemas'

import { iconForSubCategory } from '../lib/category-icons'
import { FormatChips, type FormatChip } from './FormatChips'
import { Hero } from './Hero'
import { LadderRow } from './LadderRow'
import { NoDealFooter } from './NoDealFooter'
import type { BandDeal } from './SubCategoryBand'

interface DealBandProps {
  subCategory: string
  label: string
  /** Retained for backwards-compatibility with v3 callers; unused in v4 render. */
  emoji?: string
  deals: BandDeal[]
  /** Total raw deal count before per-store collapsing — drives "See all N →". */
  totalDealCount: number
  onAdd: (deal: BandDeal) => void
  addedIds: Set<string>
}

/** Pick the most populated format as default chip selection, per spec §4. */
function pickDefaultFormat(deals: BandDeal[], fallback?: string): string | null {
  const counts = new Map<string, number>()
  for (const d of deals) {
    if (d.format) counts.set(d.format, (counts.get(d.format) ?? 0) + 1)
  }
  if (counts.size === 0) return null
  if (fallback && counts.has(fallback)) return fallback
  let best: string | null = null
  let bestCount = 0
  for (const [format, n] of counts) {
    if (n > bestCount) {
      best = format
      bestCount = n
    }
  }
  return best
}

export function DealBand(props: DealBandProps) {
  const { subCategory, label, deals, totalDealCount, onAdd, addedIds } = props
  const schema = schemaFor(subCategory)
  const Icon = iconForSubCategory(subCategory)

  const chips = useMemo<FormatChip[]>(() => {
    if (!schema) return []
    const dim = schema.formatDimensions.find((d) => d.id === 'format')
    if (!dim) return []
    const counts = new Map<string, number>()
    for (const d of deals) {
      if (d.format) counts.set(d.format, (counts.get(d.format) ?? 0) + 1)
    }
    return dim.values
      .map((v) => ({ value: v, label: v, count: counts.get(v) ?? 0 }))
      .filter((c) => c.count > 0)
  }, [deals, schema])

  const [selectedFormat, setSelectedFormat] = useState<string | null>(() =>
    pickDefaultFormat(deals, schema?.defaultFormat),
  )
  const [hasUserPicked, setHasUserPicked] = useState(false)

  // Re-sync default format if deals were empty on mount and arrive later.
  // Once the user picks a chip, stop syncing (respect their intent).
  useEffect(() => {
    if (hasUserPicked) return
    if (selectedFormat != null) return
    const next = pickDefaultFormat(deals, schema?.defaultFormat)
    if (next) setSelectedFormat(next)
  }, [deals, schema?.defaultFormat, hasUserPicked, selectedFormat])

  function handleChipChange(next: string | null) {
    setHasUserPicked(true)
    setSelectedFormat(next)
  }

  // Filter by selected format when we have a format dimension; else show all.
  const visibleDeals = useMemo(() => {
    if (!selectedFormat) return deals
    return deals.filter((d) => d.format === selectedFormat || d.format == null)
  }, [deals, selectedFormat])

  const promoDeals = visibleDeals.filter((d) => d.hasPromo)
  const regularDeals = visibleDeals.filter((d) => !d.hasPromo)
  const hero = promoDeals[0] ?? regularDeals[0] ?? null

  const ladderPromos = hero ? promoDeals.filter((d) => d.id !== hero.id) : []
  const ladderRegulars = hero ? regularDeals.filter((d) => d.id !== hero.id) : regularDeals

  const storesWithDeals = new Set(visibleDeals.map((d) => d.store))
  const missingStores: Store[] = ALL_STORES.filter((s) => !storesWithDeals.has(s))

  return (
    <section
      className='mb-4 overflow-hidden rounded-[10px] border border-[#e5e5e5] bg-white'
      aria-label={`${label} deals`}
    >
      {/* Header */}
      <div className='flex items-center justify-between gap-2 border-b border-[#e5e5e5] px-4 py-3'>
        <div className='flex items-center gap-2'>
          <Icon className='size-5 shrink-0 text-[#1a1a1a]' strokeWidth={1.5} aria-hidden='true' />
          <h2 className='text-[15px] font-bold'>{label}</h2>
          <span className='text-[12px] text-[#666]'>
            · {storesWithDeals.size} store{storesWithDeals.size === 1 ? '' : 's'} · best per store
          </span>
        </div>
        <Link
          to={`/c/${subCategory}`}
          className='shrink-0 text-[12px] font-semibold text-[#2563eb] hover:underline focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2 focus-visible:outline-none'
          aria-label={`See all ${totalDealCount} ${label} deals`}
        >
          See all {totalDealCount} →
        </Link>
      </div>

      {/* Chips */}
      {chips.length > 0 && (
        <div className='border-b border-[#e5e5e5] px-4 py-2'>
          <FormatChips chips={chips} selected={selectedFormat} onChange={handleChipChange} />
        </div>
      )}

      {/* Body */}
      <div className='p-4'>
        {hero ? (
          <div className='md:grid md:grid-cols-[1fr_1.1fr] md:gap-4'>
            <Hero
              deal={hero}
              isAdded={addedIds.has(hero.id)}
              onAdd={() => onAdd(hero)}
            />
            <div>
              {(ladderPromos.length > 0 || ladderRegulars.length > 0) && (
                <div className='mt-3 md:mt-0'>
                  <p className='mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#8a8f98]'>
                    Other stores · best {label.toLowerCase()} deal each
                  </p>
                  <ul
                    className='list-none overflow-hidden rounded-[6px] border border-[#e5e5e5]'
                    role='list'
                    aria-label={`${label} deals by store`}
                  >
                    {ladderPromos.map((d, i) => (
                      <LadderRow
                        key={d.id}
                        deal={d}
                        hero={hero}
                        isAdded={addedIds.has(d.id)}
                        onAdd={() => onAdd(d)}
                        isLast={i === ladderPromos.length - 1 && ladderRegulars.length === 0}
                      />
                    ))}
                    {ladderRegulars.map((d, i) => (
                      <LadderRow
                        key={d.id}
                        deal={d}
                        hero={hero}
                        isAdded={addedIds.has(d.id)}
                        onAdd={() => onAdd(d)}
                        isLast={i === ladderRegulars.length - 1}
                      />
                    ))}
                  </ul>
                </div>
              )}
              <NoDealFooter subCategoryLabel={label} stores={missingStores} />
            </div>
          </div>
        ) : (
          <p className='text-[12px] text-[#666]'>No deals match this filter.</p>
        )}
      </div>
    </section>
  )
}

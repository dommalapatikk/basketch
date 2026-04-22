// Single row in a v4 DealBand ladder. Shows CHF/L primary, pack price
// secondary, and a delta vs the hero (or "different format" warning).

import { STORE_META } from '@shared/types'

import type { BandDeal } from './SubCategoryBand'
import { DealImage } from './DealImage'
import { deltaVsHero, formatChf, formatPerUnit } from '../lib/deal-format'

interface LadderRowProps {
  deal: BandDeal
  hero: BandDeal
  isAdded: boolean
  onAdd: () => void
  isLast: boolean
}

export function LadderRow({ deal, hero, isAdded, onAdd, isLast }: LadderRowProps) {
  const meta = STORE_META[deal.store]
  const primary = formatPerUnit(deal.pricePerUnit, deal.canonicalUnit) ?? formatChf(deal.salePrice)
  const pack = formatChf(deal.salePrice)
  const delta = deltaVsHero(deal, hero)

  return (
    <li
      className={`flex min-h-[64px] items-center gap-2 pl-0 pr-3 py-2 ${isLast ? '' : 'border-b border-[#e5e5e5]'}`}
      aria-label={`${meta.label}: ${deal.productName}, ${primary}${delta ? `, ${delta.text}` : ''}`}
    >
      <span
        className='w-1 self-stretch rounded-r-sm shrink-0'
        style={{ backgroundColor: meta.hex }}
        aria-hidden='true'
      />

      <DealImage store={deal.store} size={48} />

      <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <div className='flex items-center gap-2'>
          <span className='shrink-0 text-[10px] font-bold' style={{ color: meta.hexText }}>
            {meta.label}
          </span>
          <span className='min-w-0 flex-1 truncate text-[12px] text-[#1a1a1a]'>
            {deal.productName}
          </span>
        </div>
        {delta && (
          <span
            className={`text-[11px] ${delta.sameFormat ? 'text-[#666]' : 'italic text-[#8a8f98]'}`}
          >
            {delta.text}
          </span>
        )}
      </div>

      <div className='flex shrink-0 flex-col items-end'>
        <span className='text-[13px] font-bold text-[#1a1a1a]'>{primary}</span>
        {primary !== pack && (
          <span className='text-[11px] text-[#666]'>{pack}</span>
        )}
      </div>

      <button
        type='button'
        onClick={onAdd}
        aria-label={isAdded ? `${deal.productName} added to list` : `Add ${deal.productName} to list`}
        className={`flex size-8 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-1 ${
          isAdded
            ? 'bg-[#e8f5ec] text-[#147a2d]'
            : 'bg-[#eef0f3] text-[#666] hover:bg-[#e5e5e5]'
        }`}
      >
        {isAdded ? (
          <svg className='size-3.5' viewBox='0 0 20 20' fill='currentColor' aria-hidden='true'>
            <path fillRule='evenodd' d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z' clipRule='evenodd' />
          </svg>
        ) : (
          <svg className='size-3.5' viewBox='0 0 20 20' fill='currentColor' aria-hidden='true'>
            <path d='M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z' />
          </svg>
        )}
      </button>
    </li>
  )
}

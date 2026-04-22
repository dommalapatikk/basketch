// Hero card for a v4 DealBand. Canonical unit price (CHF/L etc.) is the
// primary figure; pack price is secondary. Accent is the store's brand color
// via a 4px left strip, not a filled background, per spec §2 P6.

import { STORE_META } from '@shared/types'

import type { BandDeal } from './SubCategoryBand'
import { DealImage } from './DealImage'
import { formatChf, formatPerUnit, formatPackDescriptor } from '../lib/deal-format'

interface HeroProps {
  deal: BandDeal
  isAdded: boolean
  onAdd: () => void
  badgeLabel?: string
}

export function Hero({ deal, isAdded, onAdd, badgeLabel }: HeroProps) {
  const meta = STORE_META[deal.store]
  const pricePrimary = formatPerUnit(deal.pricePerUnit, deal.canonicalUnit)
  const pricePack = formatChf(deal.salePrice)
  const packDescriptor = formatPackDescriptor(deal)

  return (
    <article
      className='relative flex min-h-[132px] gap-3 overflow-hidden rounded-[10px] border border-[#e5e5e5] bg-white p-3'
      aria-label={`${deal.productName}, cheapest at ${meta.label}, ${pricePrimary ?? pricePack}`}
    >
      {/* 4px brand accent strip */}
      <span
        className='absolute inset-y-0 left-0 w-1'
        style={{ backgroundColor: meta.hex }}
        aria-hidden='true'
      />

      <DealImage store={deal.store} size={72} />

      <div className='flex w-full flex-col pl-1'>
        <div className='flex items-start justify-between gap-2'>
          <div className='flex items-center gap-2'>
            <span
              className='inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white'
              style={{ backgroundColor: meta.hex }}
            >
              {meta.label}
            </span>
            <span className='rounded-[999px] bg-[#f4f5f7] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#1a1a1a]'>
              {badgeLabel ?? '★ Cheapest'}
            </span>
          </div>
          <button
            type='button'
            onClick={onAdd}
            aria-label={isAdded ? `${deal.productName} added to list` : `Add ${deal.productName} to list`}
            className='flex size-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2'
            style={
              isAdded
                ? { backgroundColor: meta.hexLight, color: meta.hexText, border: `2px solid ${meta.hex}` }
                : { backgroundColor: meta.hex, color: 'white' }
            }
          >
            {isAdded ? (
              <svg className='size-4' viewBox='0 0 20 20' fill='currentColor' aria-hidden='true'>
                <path fillRule='evenodd' d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z' clipRule='evenodd' />
              </svg>
            ) : (
              <svg className='size-4' viewBox='0 0 20 20' fill='currentColor' aria-hidden='true'>
                <path d='M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z' />
              </svg>
            )}
          </button>
        </div>

        <p className='mt-2 text-[14px] font-semibold leading-snug text-[#1a1a1a]'>{deal.productName}</p>
        {packDescriptor && (
          <p className='text-[12px] text-[#666]'>{packDescriptor}</p>
        )}

        <div className='mt-auto pt-2'>
          {pricePrimary ? (
            <>
              <p className='text-[22px] font-extrabold leading-none' style={{ color: meta.hexText }}>
                {pricePrimary}
              </p>
              <div className='mt-1 flex items-center gap-2 text-[12px] text-[#666]'>
                <span>{pricePack}</span>
                {deal.regularPrice != null && deal.regularPrice > deal.salePrice && (
                  <span className='line-through text-[#8a8f98]'>{formatChf(deal.regularPrice)}</span>
                )}
                {deal.discountPercent > 0 && (
                  <span className='rounded-[999px] px-1.5 py-0.5 text-[10px] font-bold text-white' style={{ backgroundColor: meta.hex }}>
                    -{deal.discountPercent}%
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className='flex items-center gap-2'>
              <span className='text-[22px] font-extrabold leading-none' style={{ color: meta.hexText }}>{pricePack}</span>
              {deal.regularPrice != null && deal.regularPrice > deal.salePrice && (
                <span className='text-[12px] text-[#8a8f98] line-through'>{formatChf(deal.regularPrice)}</span>
              )}
              {deal.discountPercent > 0 && (
                <span className='rounded-[999px] px-1.5 py-0.5 text-[10px] font-bold text-white' style={{ backgroundColor: meta.hex }}>
                  -{deal.discountPercent}%
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

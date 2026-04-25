import type { CanonicalUnit, Container, Format, Store } from '@shared/types'
import { ALL_STORES, STORE_META } from '@shared/types'

/**
 * Hand-curated view model for a single row in a band. Consumed by the
 * legacy SubCategoryBand (this file) and the v4-aware DealBand (Phase 2).
 * v4 fields are optional: legacy Comparison path leaves them undefined.
 */
export interface BandDeal {
  id: string
  store: Store
  productName: string
  salePrice: number
  regularPrice: number | null
  discountPercent: number
  hasPromo: boolean

  // v4 format dimensions — optional, populated by deal-groups mapper when available
  pricePerUnit?: number
  canonicalUnit?: CanonicalUnit
  format?: Format
  container?: Container
  packSize?: number
  unitVolumeMl?: number
  /** Product photo URL from aktionis CDN; null if the scraper didn't find one. */
  imageUrl?: string | null
}

export interface SubCategoryBandProps {
  subCategory: string
  emoji: string
  deals: BandDeal[]
  onAdd: (deal: BandDeal) => void
  addedIds: Set<string>
  heroBadgeLabel?: string
}

function formatChf(n: number): string {
  return `CHF ${n.toFixed(2)}`
}

function deltaLabel(heroPrice: number, price: number): string {
  const diff = price - heroPrice
  if (diff === 0) return '=0.00'
  return diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2)
}

export function SubCategoryBand(props: SubCategoryBandProps) {
  const { subCategory, emoji, deals, onAdd, addedIds, heroBadgeLabel } = props

  const promoDeals = deals.filter((d) => d.hasPromo)
  const regularDeals = deals.filter((d) => !d.hasPromo)

  const heroDeals = promoDeals.slice(0, 1)
  const ladderPromoDeals = promoDeals.slice(1)
  const ladderRegularDeals = regularDeals

  const heroDeal = heroDeals[0] ?? null

  // Stores that appear in any deal
  const dealsStoreSet = new Set(deals.map((d) => d.store))
  // Stores absent entirely
  const missingStores = ALL_STORES.filter((s) => !dealsStoreSet.has(s))

  const cheapestStoreMeta = heroDeal ? STORE_META[heroDeal.store] : null

  const promoDealCount = promoDeals.length
  const totalStoreCount = dealsStoreSet.size

  return (
    <section
      className='mb-4 overflow-hidden rounded-[10px] border border-[#e5e5e5] bg-white'
      aria-label={`${subCategory} deals`}
    >
      {/* Band header */}
      <div className='flex items-center justify-between border-b border-[#e5e5e5] px-4 py-3'>
        <div className='flex items-center gap-2'>
          <span aria-hidden='true'>{emoji}</span>
          <h2 className='text-[15px] font-bold'>{subCategory}</h2>
          <span className='text-[12px] text-[#666]'>
            {promoDealCount} deal{promoDealCount !== 1 ? 's' : ''} across {totalStoreCount} store{totalStoreCount !== 1 ? 's' : ''}
          </span>
        </div>
        {cheapestStoreMeta && (
          <span
            className='rounded-[999px] px-2.5 py-1 text-[11px] font-bold text-white'
            style={{ backgroundColor: cheapestStoreMeta.hex }}
          >
            {cheapestStoreMeta.label} cheapest
          </span>
        )}
      </div>

      <div className='p-4'>
        <div className={heroDeal ? 'md:grid md:grid-cols-[1fr_1.1fr] md:gap-4' : ''}>
          {/* Tier 1 — Hero deal */}
          {heroDeal && (
            <HeroDealCard
              deal={heroDeal}
              isAdded={addedIds.has(heroDeal.id)}
              onAdd={() => onAdd(heroDeal)}
              badgeLabel={heroBadgeLabel}
            />
          )}

          {/* Tier 2 — Price ladder + no-deal footer */}
          <div>
            {(ladderPromoDeals.length > 0 || ladderRegularDeals.length > 0) && (
              <div className='mt-3 md:mt-0'>
                <p className='mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#8a8f98]'>
                  Other stores · best {subCategory} deal each
                </p>
                <div className='overflow-hidden rounded-[6px] border border-[#e5e5e5]'>
                  {ladderPromoDeals.map((deal, i) => (
                    <LadderRow
                      key={deal.id}
                      deal={deal}
                      heroPrice={heroDeal?.salePrice ?? deal.salePrice}
                      isAdded={addedIds.has(deal.id)}
                      onAdd={() => onAdd(deal)}
                      isLast={i === ladderPromoDeals.length - 1 && ladderRegularDeals.length === 0}
                      isGreyed={false}
                    />
                  ))}
                  {ladderRegularDeals.map((deal, i) => (
                    <LadderRow
                      key={deal.id}
                      deal={deal}
                      heroPrice={heroDeal?.salePrice ?? deal.salePrice}
                      isAdded={addedIds.has(deal.id)}
                      onAdd={() => onAdd(deal)}
                      isLast={i === ladderRegularDeals.length - 1}
                      isGreyed
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Tier 3 — No-deal footer */}
            {missingStores.length > 0 && (
              <p className='mt-3 text-[12px] text-[#8a8f98]'>
                📭 No {subCategory} deals at:{' '}
                {missingStores.map((s) => STORE_META[s].label).join(' · ')}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Hero deal card ──────────────────────────────────────────────────────────

interface HeroDealCardProps {
  deal: BandDeal
  isAdded: boolean
  onAdd: () => void
  badgeLabel?: string
}

function HeroDealCard(props: HeroDealCardProps) {
  const { deal, isAdded, onAdd, badgeLabel } = props
  const meta = STORE_META[deal.store]

  return (
    <article
      className='relative overflow-hidden rounded-[10px] border-2 pl-4 pr-3 py-3'
      style={{ borderColor: meta.hex, backgroundColor: meta.hexLight }}
      aria-label={`${deal.productName}, ${formatChf(deal.salePrice)}, cheapest at ${meta.label}`}
    >
      {/* Badge */}
      <span
        className='absolute right-3 top-3 rounded-[999px] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white'
        style={{ backgroundColor: meta.hex }}
      >
        {badgeLabel ?? '★ CHEAPEST'}
      </span>

      {/* Store label */}
      <span
        className='mb-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white'
        style={{ backgroundColor: meta.hex }}
      >
        {meta.label}
      </span>

      {/* Product name */}
      <p className='pr-24 text-[14px] font-semibold leading-snug'>{deal.productName}</p>

      {/* Price row */}
      <div className='mt-2 flex items-center gap-3'>
        <span className='text-[20px] font-extrabold' style={{ color: meta.hexText }}>
          {formatChf(deal.salePrice)}
        </span>
        {deal.regularPrice != null && deal.regularPrice > deal.salePrice && (
          <span className='text-[13px] text-[#8a8f98] line-through'>
            {deal.regularPrice.toFixed(2)}
          </span>
        )}
        {deal.discountPercent > 0 && (
          <span
            className='rounded-[999px] px-2 py-0.5 text-[11px] font-bold text-white'
            style={{ backgroundColor: meta.hex }}
          >
            -{deal.discountPercent}%
          </span>
        )}

        {/* Add button */}
        <button
          type='button'
          onClick={onAdd}
          aria-label={isAdded ? `${deal.productName} added to list` : `Add ${deal.productName} to list`}
          className='ml-auto flex size-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2'
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
    </article>
  )
}

// ─── Ladder row ───────────────────────────────────────────────────────────────

interface LadderRowProps {
  deal: BandDeal
  heroPrice: number
  isAdded: boolean
  onAdd: () => void
  isLast: boolean
  isGreyed: boolean
}

function LadderRow(props: LadderRowProps) {
  const { deal, heroPrice, isAdded, onAdd, isLast, isGreyed } = props
  const meta = STORE_META[deal.store]
  const delta = deltaLabel(heroPrice, deal.salePrice)
  const isPositiveDelta = deal.salePrice > heroPrice

  return (
    <div
      className={`flex min-h-[44px] items-center gap-2 pl-0 pr-3 py-2 ${isLast ? '' : 'border-b border-[#e5e5e5]'} ${isGreyed ? 'opacity-60' : ''}`}
      role='listitem'
      aria-label={`${meta.label}: ${deal.productName}, ${isGreyed ? 'regular price' : `${deal.discountPercent}% off`}, ${formatChf(deal.salePrice)}`}
    >
      {/* 4px colour strip */}
      <span
        className='w-1 self-stretch rounded-r-sm shrink-0'
        style={{ backgroundColor: meta.hex }}
        aria-hidden='true'
      />

      {/* Store label */}
      <span
        className='shrink-0 text-[10px] font-bold'
        style={{ color: meta.hexText }}
      >
        {meta.label}
      </span>

      {/* Product name */}
      <span className={`min-w-0 flex-1 truncate text-[12px] ${isGreyed ? 'italic text-[#8a8f98]' : 'text-[#1a1a1a]'}`}>
        {deal.productName}
        {isGreyed && <span className='ml-1 text-[11px]'>(regular)</span>}
      </span>

      {/* Delta */}
      <span
        className={`shrink-0 text-[11px] font-semibold ${isGreyed ? 'italic text-[#8a8f98]' : isPositiveDelta ? 'text-[#666]' : 'text-[#147a2d]'}`}
      >
        {isGreyed ? 'regular price' : delta}
      </span>

      {/* Sale price */}
      <span className={`shrink-0 text-[13px] font-bold ${isGreyed ? 'text-[#8a8f98]' : 'text-[#1a1a1a]'}`}>
        {formatChf(deal.salePrice)}
      </span>

      {/* Add button */}
      <button
        type='button'
        onClick={isGreyed ? undefined : onAdd}
        disabled={isGreyed}
        aria-label={isGreyed ? `${deal.productName} at regular price — no deal` : isAdded ? `${deal.productName} added to list` : `Add ${deal.productName} to list`}
        aria-disabled={isGreyed}
        className={`flex size-8 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-1 ${
          isGreyed
            ? 'cursor-not-allowed bg-[#f4f5f7] text-[#ccc]'
            : isAdded
              ? 'bg-[#e8f5ec] text-[#147a2d]'
              : 'bg-[#eef0f3] text-[#666] hover:bg-[#e5e5e5]'
        }`}
      >
        {isAdded && !isGreyed ? (
          <svg className='size-3.5' viewBox='0 0 20 20' fill='currentColor' aria-hidden='true'>
            <path fillRule='evenodd' d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z' clipRule='evenodd' />
          </svg>
        ) : (
          <svg className='size-3.5' viewBox='0 0 20 20' fill='currentColor' aria-hidden='true'>
            <path d='M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z' />
          </svg>
        )}
      </button>
    </div>
  )
}

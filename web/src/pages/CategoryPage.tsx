// CategoryPage — /c/:subCategoryId drill-down per v4 spec §12.
// Lists every deal in a sub-category (no per-store collapsing), with
// format + sort filters. This is the "See all N →" target from DealBand.

import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import type { DealRow, Store } from '@shared/types'
import { ALL_STORES, STORE_META } from '@shared/types'
import { schemaFor } from '@shared/sub-category-schemas'

import { useActiveDeals, usePageTitle } from '../lib/hooks'
import { LoadingState } from '../components/LoadingState'
import { ErrorState } from '../components/ErrorState'
import { iconForSubCategory } from '../lib/category-icons'
import { formatChf, formatPerUnit, titleCase } from '../lib/deal-format'
import { SUB_CATEGORY_META } from '../lib/deal-groups'

type SortKey = 'price-per-unit' | 'discount' | 'price'

export function CategoryPage() {
  const { subCategoryId = '' } = useParams()
  const schema = schemaFor(subCategoryId)
  const meta = SUB_CATEGORY_META[subCategoryId]
  const label = meta?.label ?? subCategoryId.replace(/-/g, ' ')
  const HeaderIconComponent = iconForSubCategory(subCategoryId)
  const HeaderIcon = () => (
    <HeaderIconComponent className='size-6 text-[#1a1a1a]' strokeWidth={1.5} aria-hidden='true' />
  )

  usePageTitle(`${label} — all deals`)

  const { data: allDeals, loading, error } = useActiveDeals()

  const [selectedFormat, setSelectedFormat] = useState<string | null>(schema?.defaultFormat ?? null)
  const [selectedStores, setSelectedStores] = useState<Set<Store>>(() => new Set(ALL_STORES))
  const [sortKey, setSortKey] = useState<SortKey>('price-per-unit')

  const categoryDeals: DealRow[] = useMemo(() => {
    if (!allDeals) return []
    return allDeals.filter((d) => d.sub_category === subCategoryId)
  }, [allDeals, subCategoryId])

  const formatCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const d of categoryDeals) {
      if (d.format) counts.set(d.format, (counts.get(d.format) ?? 0) + 1)
    }
    return counts
  }, [categoryDeals])

  const filteredDeals = useMemo(() => {
    let rows = categoryDeals.filter((d) => selectedStores.has(d.store))
    if (selectedFormat) {
      rows = rows.filter((d) => d.format === selectedFormat)
    }
    const sorted = [...rows].sort((a, b) => {
      switch (sortKey) {
        case 'price-per-unit': {
          const av = a.price_per_unit ?? Number.POSITIVE_INFINITY
          const bv = b.price_per_unit ?? Number.POSITIVE_INFINITY
          return av - bv
        }
        case 'discount':
          return (b.discount_percent ?? 0) - (a.discount_percent ?? 0)
        case 'price':
          return a.sale_price - b.sale_price
      }
    })
    return sorted
  }, [categoryDeals, selectedStores, selectedFormat, sortKey])

  function toggleStore(store: Store) {
    setSelectedStores((prev) => {
      const next = new Set(prev)
      if (next.has(store)) {
        if (next.size === 1) return prev
        next.delete(store)
      } else {
        next.add(store)
      }
      return next
    })
  }

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error.message} />

  const formatDim = schema?.formatDimensions.find((d) => d.id === 'format')
  const formatChips = formatDim
    ? formatDim.values.filter((v) => (formatCounts.get(v) ?? 0) > 0)
    : []

  return (
    <div className='mx-auto max-w-5xl px-4 py-6'>
      <nav className='mb-3 text-[12px] text-[#666]'>
        <Link to='/deals' className='hover:underline'>
          ← Back to deals
        </Link>
      </nav>

      <header className='mb-4'>
        <h1 className='flex items-center gap-2 text-[22px] font-bold'>
          <HeaderIcon />
          {label}
        </h1>
        <p className='mt-1 text-[13px] text-[#666]'>
          {categoryDeals.length} deals · {new Set(categoryDeals.map((d) => d.store)).size} stores
        </p>
      </header>

      {/* Filters */}
      <div className='mb-4 space-y-3 rounded-[10px] border border-[#e5e5e5] bg-white p-3'>
        {formatChips.length > 0 && (
          <div>
            <p className='mb-1 text-[10px] font-bold uppercase tracking-wider text-[#8a8f98]'>Type</p>
            <div className='flex flex-wrap gap-2'>
              <FilterChip
                active={selectedFormat === null}
                onClick={() => setSelectedFormat(null)}
                label={`All · ${categoryDeals.length}`}
              />
              {formatChips.map((v) => (
                <FilterChip
                  key={v}
                  active={selectedFormat === v}
                  onClick={() => setSelectedFormat(v)}
                  label={`${titleCase(v)} · ${formatCounts.get(v)}`}
                />
              ))}
            </div>
          </div>
        )}

        <div>
          <p className='mb-1 text-[10px] font-bold uppercase tracking-wider text-[#8a8f98]'>Stores</p>
          <div className='flex flex-wrap gap-2'>
            {ALL_STORES.map((s) => (
              <FilterChip
                key={s}
                active={selectedStores.has(s)}
                onClick={() => toggleStore(s)}
                label={STORE_META[s].label}
                accent={STORE_META[s].hex}
              />
            ))}
          </div>
        </div>

        <div>
          <p className='mb-1 text-[10px] font-bold uppercase tracking-wider text-[#8a8f98]'>Sort by</p>
          <div className='flex flex-wrap gap-2'>
            <FilterChip
              active={sortKey === 'price-per-unit'}
              onClick={() => setSortKey('price-per-unit')}
              label={`Cheapest per ${schema?.canonicalUnit ?? 'unit'}`}
            />
            <FilterChip
              active={sortKey === 'discount'}
              onClick={() => setSortKey('discount')}
              label='Biggest % off'
            />
            <FilterChip
              active={sortKey === 'price'}
              onClick={() => setSortKey('price')}
              label='Cheapest pack price'
            />
          </div>
        </div>
      </div>

      <p className='mb-2 text-[12px] text-[#666]'>
        {filteredDeals.length} of {categoryDeals.length} deals
      </p>

      {filteredDeals.length === 0 ? (
        <p className='py-12 text-center text-[14px] text-[#666]'>No deals match these filters.</p>
      ) : (
        <ul className='space-y-2'>
          {filteredDeals.map((deal) => (
            <DealListItem key={deal.id} deal={deal} />
          ))}
        </ul>
      )}
    </div>
  )
}

interface FilterChipProps {
  active: boolean
  onClick: () => void
  label: string
  accent?: string
}

function FilterChip({ active, onClick, label, accent }: FilterChipProps) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={`min-h-[44px] rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2 ${
        active ? 'border-[#1a1a1a] bg-[#1a1a1a] text-white' : 'border-[#e5e5e5] bg-white text-[#1a1a1a] hover:border-[#1a1a1a]'
      }`}
      style={active && accent ? { borderColor: accent, backgroundColor: accent } : undefined}
    >
      {label}
    </button>
  )
}

function DealListItem({ deal }: { deal: DealRow }) {
  const meta = STORE_META[deal.store]
  const primary =
    formatPerUnit(deal.price_per_unit ?? undefined, deal.canonical_unit ?? undefined)
    ?? formatChf(deal.sale_price)
  return (
    <li className='flex items-center gap-3 rounded-[8px] border border-[#e5e5e5] bg-white p-3'>
      <span
        className='shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white'
        style={{ backgroundColor: meta.hex }}
      >
        {meta.label}
      </span>
      <div className='min-w-0 flex-1'>
        <p className='truncate text-[13px] font-semibold text-[#1a1a1a]'>{deal.product_name}</p>
        {deal.format && (
          <p className='text-[11px] text-[#666]'>{deal.format}</p>
        )}
      </div>
      <div className='shrink-0 text-right'>
        <p className='text-[14px] font-bold text-[#1a1a1a]'>{primary}</p>
        <p className='text-[11px] text-[#666]'>{formatChf(deal.sale_price)}</p>
      </div>
      {deal.discount_percent > 0 && (
        <span
          className='shrink-0 rounded-[999px] px-2 py-0.5 text-[11px] font-bold text-white'
          style={{ backgroundColor: meta.hex }}
        >
          -{deal.discount_percent}%
        </span>
      )}
    </li>
  )
}

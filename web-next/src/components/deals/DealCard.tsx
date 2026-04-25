'use client'

import Image from 'next/image'

import { STORE_BRAND, type StoreKey } from '@/lib/store-tokens'
import type { DealCategory } from '@/lib/types'

import { PriceBlock } from '@/components/ui/price-block'
import { Tag } from '@/components/ui/tag'

import { AddToListButton } from './AddToListButton'

export type DealCardVariant = 'primary' | 'compact'

type CommonProps = {
  id: string
  category: DealCategory
  store: StoreKey
  productName: string
  format?: string | null
  imageUrl?: string | null
  current: number
  previous?: number | null
  perUnit?: string | null
  savingsPct?: number | null
  isCheapest?: boolean
  href: string
  cheapestLabel?: string
}

export type DealCardProps = CommonProps & { variant: DealCardVariant }

// v2.1 HR1: store color appears ONLY inside the 6 px dot of the store pill.
// No rail, no left border, no top stripe. v2.1 HR4/HR8: strict CSS grid with
// minmax(0, 1fr) on text columns prevents the price/title overlap (B5).
export function DealCard(props: DealCardProps) {
  return props.variant === 'primary' ? <Primary {...props} /> : <Compact {...props} />
}

function Primary({
  id,
  category,
  store,
  productName,
  format,
  imageUrl,
  current,
  previous,
  perUnit,
  savingsPct,
  isCheapest,
  href,
  cheapestLabel = 'Cheapest',
}: CommonProps) {
  const titleId = titleIdFor(href)
  return (
    <article
      aria-labelledby={titleId}
      className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-paper)] p-3 transition-colors hover:border-[var(--color-line-strong)] sm:grid-cols-[176px_minmax(0,1fr)] sm:gap-5 sm:p-4 md:grid-cols-[192px_minmax(0,1fr)] md:gap-6 md:p-5"
    >
      <div className="aspect-square w-full overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-page)]">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt=""
            width={192}
            height={192}
            sizes="(min-width: 768px) 192px, (min-width: 640px) 176px, 120px"
            className="h-full w-full object-contain p-1"
          />
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <StorePill store={store} size="md" />
          {isCheapest ? (
            <Tag tone="positive" size="sm">
              {cheapestLabel}
            </Tag>
          ) : null}
        </div>

        <a
          href={href}
          rel="noopener nofollow ugc"
          target="_blank"
          id={titleId}
          className="block text-base font-semibold leading-snug text-[var(--color-ink)] hover:underline sm:text-lg"
        >
          {productName}
        </a>

        {format ? <p className="text-xs text-[var(--color-ink-3)]">{format}</p> : null}

        <div className="mt-auto flex items-end justify-between gap-3">
          <PriceBlock
            current={current}
            previous={previous}
            perUnit={perUnit}
            savingsPct={savingsPct}
            size="md"
          />
          <AddToListButton
            id={id}
            store={store}
            productName={productName}
            category={category}
            salePrice={current}
            imageUrl={imageUrl}
            sourceUrl={href}
          />
        </div>
      </div>
    </article>
  )
}

function Compact({
  id,
  category,
  store,
  productName,
  imageUrl,
  current,
  previous,
  perUnit,
  savingsPct,
  href,
}: CommonProps) {
  const brand = STORE_BRAND[store]
  const titleId = titleIdFor(href)
  return (
    <article
      aria-labelledby={titleId}
      // Patch D HR12: below md, switch to 2-row grid so price + button drop
      // beneath the name instead of competing for horizontal room at 280 px.
      // md+ keeps the original 4-col 1-row layout via md:contents on the
      // price+button wrapper, so no DOM duplication.
      className="grid w-[280px] shrink-0 snap-start grid-cols-[40px_1fr] grid-rows-[auto_auto] items-center gap-x-3 gap-y-2 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 transition-colors hover:border-[var(--color-line-strong)] md:grid-cols-[40px_minmax(0,1fr)_auto_auto] md:grid-rows-1 md:gap-y-0 lg:w-auto lg:shrink lg:snap-none"
    >
      <div className="row-span-2 h-10 w-10 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-page)] md:row-span-1">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt=""
            width={40}
            height={40}
            sizes="40px"
            className="h-full w-full object-contain p-0.5"
          />
        ) : null}
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: brand.color }}
          />
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
            {brand.label}
          </span>
        </div>
        <a
          href={href}
          target="_blank"
          rel="noopener nofollow ugc"
          id={titleId}
          className="mt-0.5 block truncate text-sm text-[var(--color-ink)] hover:underline"
        >
          {productName}
        </a>
      </div>

      <div className="flex items-center justify-between gap-3 md:contents">
        <PriceBlock
          current={current}
          previous={previous}
          perUnit={perUnit}
          savingsPct={savingsPct}
          size="sm"
          className="shrink-0 items-end text-right"
        />

        <AddToListButton
          id={id}
          store={store}
          productName={productName}
          category={category}
          salePrice={current}
          imageUrl={imageUrl}
          sourceUrl={href}
          size="sm"
        />
      </div>
    </article>
  )
}

function StorePill({ store, size }: { store: StoreKey; size: 'sm' | 'md' }) {
  const brand = STORE_BRAND[store]
  const cls = size === 'md' ? 'h-5 px-2 text-[11px]' : 'h-[18px] px-2 text-[10px]'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--color-line)] bg-[var(--color-paper)] font-semibold uppercase tracking-[0.06em] text-[var(--color-ink)] ${cls}`}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: brand.color }}
      />
      {brand.label}
    </span>
  )
}

function titleIdFor(href: string): string {
  return `dc-${hash(href)}`
}

function hash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(36)
}

import Image from 'next/image'

import { STORE_BRAND, type StoreKey } from '@/lib/store-tokens'
import type { DealCategory } from '@/lib/types'

import { PriceBlock } from '@/components/ui/price-block'
import { Tag } from '@/components/ui/tag'

import { AddToListButton } from './AddToListButton'

export type DealCardVariant = 'primary' | 'compact'

type CommonProps = {
  // M6: id + category needed so the +List button can store the item.
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

// Spec §6.1: one component, two variants. Single 3px store rail (never doubled).
// Brand color appears only as the rail and the dot inside the store pill.
// Outer wrapper is an <article> with aria-labelledby — see §9 a11y rules.
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
  const brand = STORE_BRAND[store]
  const titleId = titleIdFor(href)
  return (
    <article
      aria-labelledby={titleId}
      className="relative flex overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-paper)] pl-3 transition-colors hover:border-[var(--color-line-strong)]"
    >
      {/* 3px brand rail */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: brand.color }}
      />

      {/* Image — 120×120 on mobile (spec §6.1), 176×176 on sm+. Always shown. */}
      <div className="m-3 h-[120px] w-[120px] shrink-0 overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-page)] sm:m-4 sm:h-[176px] sm:w-[176px]">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt=""
            width={192}
            height={192}
            sizes="(min-width: 640px) 192px, 120px"
            className="h-full w-full object-contain p-2"
          />
        ) : null}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
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
      // Fixed width on mobile so the parent's horizontal-scroll rail snaps
      // properly; auto width on lg+ where rows stack vertically.
      className="relative flex w-[280px] shrink-0 snap-start items-center gap-3 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-paper)] py-2 pl-3 pr-3 transition-colors hover:border-[var(--color-line-strong)] lg:w-auto lg:shrink lg:snap-none"
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: brand.color }}
      />

      <div className="ml-1 h-12 w-12 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-page)]">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt=""
            width={48}
            height={48}
            sizes="48px"
            className="h-full w-full object-contain p-1"
          />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
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

// Stable id derived from href so React can wire aria-labelledby. The id only
// needs to be unique per article on a page, which holds as long as source URLs
// are unique. Plain function (not a hook) — naming reflects that.
function titleIdFor(href: string): string {
  return `dc-${hash(href)}`
}

function hash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(36)
}

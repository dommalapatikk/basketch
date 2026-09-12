'use client'

import { memo } from 'react'
import { PriceBlock } from '@/components/ui/price-block'
import { ProductImage } from '@/components/ui/product-image'
import { Tag } from '@/components/ui/tag'
import { type DealAttribute, isStandaloneAttribute } from '@/lib/deal-attributes'
import { STORE_BRAND, type StoreKey } from '@/lib/store-tokens'
import type { CropRegion, DealCategory } from '@/lib/types'

import { AddToListButton } from './AddToListButton'

export type DealCardVariant = 'primary' | 'compact'

type CommonProps = {
  id: string
  category: DealCategory
  store: StoreKey
  productName: string
  format?: string | null
  imageUrl?: string | null
  /**
   * Flyer crop, for the retailers that publish no product images at all.
   * Spar, Aldi and Migros render as empty grey squares without it.
   */
  crop?: CropRegion | null
  current: number
  previous?: number | null
  perUnit?: string | null
  savingsPct?: number | null
  isCheapest?: boolean
  /**
   * The retailer's page for this product, or null when there is none.
   *
   * Aldi, Spar and Migros come from flyer PDFs and OCR — there is no
   * per-product page, so their adapters set sourceUrl to null deliberately.
   * The card used to fall back to href="#", which looks like a link, invites a
   * click and goes nowhere. 103 of 1,000 live deals behaved that way.
   */
  href: string | null
  cheapestLabel?: string
  /**
   * The classifier's category for this deal is a guess it was not confident in.
   * The deal is shown anyway — the price is not the uncertain part (D3) — but
   * nothing on the card may present its category as settled.
   */
  isUncertain?: boolean
  /** Localised, e.g. "Category unverified". Rendered only when isUncertain. */
  unverifiedLabel?: string
  /**
   * Names the loyalty programme when this price is members-only.
   *
   * Art. 3(1)(e) UWG: a price comparison must be objectively correct, and LIDL
   * publishes its Lidl Plus price with no flag at all. Rendering one as a normal
   * price is the exposure the pipeline's loyalty check exists to prevent — so
   * this is TEXT, never a colour or an icon alone.
   */
  memberPriceLabel?: string | null
  /**
   * Localised "Only at Coop" — shown ONLY together with onlyStoreNote, which
   * states the scope of the claim. The badge on its own would read as "this
   * product is only at Coop", which is not what the data supports.
   */
  onlyStoreBadge?: string | null
  /** Localised "No other store we track has a Dairy deal this week." */
  onlyStoreNote?: string | null
  /** Up to three facts the retailer actually stated. Never inferred. */
  attributes?: DealAttribute[]
}

export type DealCardProps = CommonProps & { variant: DealCardVariant }

// v2.1 HR1: store color appears ONLY inside the 6 px dot of the store pill.
// No rail, no left border, no top stripe. v2.1 HR4/HR8: strict CSS grid with
// minmax(0, 1fr) on text columns prevents the price/title overlap (B5).
// Patch G stage 3: memoised so unchanged cards skip re-render on filter
// changes (huge win when going Fresh → All — 1.2k cards otherwise reconcile).
function DealCardImpl(props: DealCardProps) {
  return props.variant === 'primary' ? <Primary {...props} /> : <Compact {...props} />
}

export const DealCard = memo(DealCardImpl, (a, b) => {
  // Card identity = id. All other props are derived from the deal record so
  // if id matches AND variant matches, we can safely skip re-render.
  return a.id === b.id && a.variant === b.variant && a.isCheapest === b.isCheapest
})

function Primary({
  id,
  category,
  store,
  productName,
  format,
  imageUrl,
  crop,
  current,
  previous,
  perUnit,
  savingsPct,
  isCheapest,
  href,
  cheapestLabel = 'Cheapest',
  isUncertain,
  unverifiedLabel,
  memberPriceLabel,
  onlyStoreBadge,
  onlyStoreNote,
  attributes,
}: CommonProps) {
  const titleId = titleIdFor(id)
  return (
    <article
      aria-labelledby={titleId}
      // Patch G fix: content-visibility:auto lets the browser skip layout +
      // paint for cards that are off-screen. contain-intrinsic-size reserves
      // an accurate placeholder height (matches the rendered card at md) so
      // scrolling doesn't cause CLS. ~140 cards in DOM but only ~6-8 paint
      // at any time. W3C standard, no JS dependency.
      className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-paper)] p-3 transition-colors hover:border-[var(--color-line-strong)] sm:grid-cols-[176px_minmax(0,1fr)] sm:gap-5 sm:p-4 md:grid-cols-[192px_minmax(0,1fr)] md:gap-6 md:p-5 [content-visibility:auto] [contain-intrinsic-size:0_240px]"
    >
      <div className="aspect-square w-full overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-page)]">
        <ProductImage
          imageUrl={imageUrl}
          crop={crop}
          dimension={192}
          sizes="(min-width: 768px) 192px, (min-width: 640px) 176px, 120px"
          className="h-full w-full object-contain p-1"
        />
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <StorePill store={store} size="md" />
          <div className="flex flex-wrap items-center gap-1.5">
            {isCheapest ? (
              <Tag tone="positive" size="sm">
                {cheapestLabel}
              </Tag>
            ) : null}
            {onlyStoreBadge && onlyStoreNote ? (
              <Tag tone="signal" size="sm">
                {onlyStoreBadge}
              </Tag>
            ) : null}
            {isUncertain && unverifiedLabel ? (
              <Tag tone="neutral" size="sm">
                {unverifiedLabel}
              </Tag>
            ) : null}
          </div>
        </div>

        {href ? (
          <a
            href={href}
            rel="noopener nofollow ugc"
            target="_blank"
            id={titleId}
            className="block text-base font-semibold leading-snug text-[var(--color-ink)] hover:underline sm:text-lg"
          >
            {productName}
          </a>
        ) : (
          // No retailer page exists for flyer-sourced products. Plain text
          // rather than a link that goes nowhere.
          <p
            id={titleId}
            className="block text-base font-semibold leading-snug text-[var(--color-ink)] sm:text-lg"
          >
            {productName}
          </p>
        )}

        {format ? <p className="text-xs text-[var(--color-ink-3)]">{format}</p> : null}

        <AttributeLine attributes={attributes} />

        {memberPriceLabel ? <MemberPriceNote label={memberPriceLabel} /> : null}

        {onlyStoreNote ? (
          <p className="text-xs leading-snug text-[var(--color-ink-3)]">{onlyStoreNote}</p>
        ) : null}

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
  crop,
  current,
  previous,
  perUnit,
  savingsPct,
  href,
  isUncertain,
  unverifiedLabel,
  memberPriceLabel,
}: CommonProps) {
  const brand = STORE_BRAND[store]
  const titleId = titleIdFor(id)
  return (
    <article
      aria-labelledby={titleId}
      // Patch D HR12: below md, switch to 2-row grid so price + button drop
      // beneath the name instead of competing for horizontal room at 280 px.
      // md+ keeps the original 4-col 1-row layout via md:contents on the
      // price+button wrapper, so no DOM duplication.
      // Patch G: content-visibility:auto skips layout/paint when off-screen
      // (snap-rail extends off-canvas to the right; this short-circuits
      // those reels until the user scrolls into them).
      className="grid w-[280px] shrink-0 snap-start grid-cols-[40px_1fr] grid-rows-[auto_auto] items-center gap-x-3 gap-y-2 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 transition-colors hover:border-[var(--color-line-strong)] md:grid-cols-[40px_minmax(0,1fr)_auto_auto] md:grid-rows-1 md:gap-y-0 lg:w-auto lg:shrink lg:snap-none [content-visibility:auto] [contain-intrinsic-size:280px_80px] lg:[contain-intrinsic-size:0_60px]"
    >
      <div className="row-span-2 h-10 w-10 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-page)] md:row-span-1">
        <ProductImage
          imageUrl={imageUrl}
          crop={crop}
          dimension={40}
          sizes="40px"
          className="h-full w-full object-contain p-0.5"
        />
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
          {isUncertain && unverifiedLabel ? (
            // Abbreviated on the compact card — the full wording is on the
            // primary card and in the title attribute, but the mark itself is
            // never dropped just because the row is narrow.
            <span
              title={unverifiedLabel}
              className="text-[11px] font-medium text-[var(--color-ink-3)]"
            >
              · ?
            </span>
          ) : null}
        </div>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener nofollow ugc"
            id={titleId}
            className="mt-0.5 block truncate text-sm text-[var(--color-ink)] hover:underline"
          >
            {productName}
          </a>
        ) : (
          <p id={titleId} className="mt-0.5 block truncate text-sm text-[var(--color-ink)]">
            {productName}
          </p>
        )}
        {memberPriceLabel ? (
          // Legally required wherever the price is shown, so it appears on the
          // compact card too — truncated layout is not an exemption.
          <p className="mt-0.5 truncate text-[11px] font-medium text-[var(--color-signal)]">
            {memberPriceLabel}
          </p>
        ) : null}
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

/**
 * The facts the retailer actually printed, in one quiet line.
 *
 * Never a guess: an attribute the retailer did not state is absent from the
 * data and therefore absent here. Capped at three upstream so the price keeps
 * the visual weight on the card.
 */
function AttributeLine({ attributes }: { attributes?: DealAttribute[] }) {
  if (!attributes || attributes.length === 0) return null
  return (
    <ul className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-ink-3)]">
      {attributes.map((a) => (
        <li key={a.id} className="rounded-[var(--radius-sm)] bg-[var(--color-page)] px-1.5 py-0.5">
          {isStandaloneAttribute(a.id) ? (
            a.value
          ) : (
            <>
              <span className="text-[var(--color-ink-3)]">{a.label}</span>{' '}
              <span className="font-medium text-[var(--color-ink-2)]">{a.value}</span>
            </>
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * Names the loyalty programme a members-only price belongs to.
 *
 * Art. 3(1)(e) UWG requires a price comparison to be objectively correct, and
 * CLAUDE.md makes labelling member prices binding. This is deliberately plain
 * text with its own contrast — WCAG 2.1 AA forbids carrying information by
 * colour alone, and "the yellow one is the Lidl price" is exactly that.
 */
function MemberPriceNote({ label }: { label: string }) {
  return (
    <p className="inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-line)] px-2 py-1 text-xs font-medium text-[var(--color-ink-2)]">
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-signal)]"
      />
      {label}
    </p>
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

function titleIdFor(key: string): string {
  return `dc-${hash(key)}`
}

function hash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(36)
}

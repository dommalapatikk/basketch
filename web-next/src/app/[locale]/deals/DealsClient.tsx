'use client'

import { useDeferredValue, useMemo, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useWindowVirtualizer } from '@tanstack/react-virtual'

import { usePathname } from '@/i18n/navigation'
import { type DealsFilters, serializeFilters } from '@/lib/filters'
import { formatShortDate } from '@/lib/format'
import { STORE_BRAND, STORE_KEYS, type StoreKey } from '@/lib/store-tokens'
import { subCategoryLabel } from '@/lib/sub-category-labels'
import type { WeeklySnapshot } from '@/lib/types'
import {
  buildSections,
  categoryCounts,
  filterDeals,
  storeCounts,
  subCategoryCounts,
} from '@/server/data/filter-deals'

import { BottomBar } from '@/components/deals/BottomBar'
import { DealCard } from '@/components/deals/DealCard'
import { DealsSearch } from '@/components/deals/DealsSearch'
import { FilterRail } from '@/components/deals/FilterRail'
import { TypeSegmented } from '@/components/deals/TypeSegmented'
import { IconHeading } from '@/components/ui/IconHeading'

type Props = {
  snapshot: WeeklySnapshot
  initialFilters: DealsFilters
  locale: string
}

// Patch C HR10 (proper fix): the snapshot lands on the client once. Every
// subsequent filter click updates URL + state in the browser only — no RSC
// roundtrip, no server re-render, no payload re-stream. This is what the
// auditor recommended; the earlier startTransition-only fix made the URL
// update fast but left the page-tree re-render slow on real devices.
export function DealsClient({ snapshot, initialFilters, locale }: Props) {
  const t = useTranslations('deals')
  const pathname = usePathname()
  const [filters, setFilters] = useState<DealsFilters>(initialFilters)
  const [, startTransition] = useTransition()
  // Patch G stage 2: virtualize the sections list against the window scroll
  // so only the sections in (and near) the viewport actually render. Section
  // headers stay sticky because the document is still the scroll root —
  // we're not introducing an inner overflow container.
  const sectionsRef = useRef<HTMLDivElement>(null)

  // window.history.replaceState updates the URL without triggering Next's
  // server re-render (router.replace would do that). Combined with local
  // state above, this gives us a shareable URL plus instant interactivity.
  const apply = (next: DealsFilters) => {
    startTransition(() => {
      setFilters(next)
    })
    if (typeof window !== 'undefined') {
      const qs = serializeFilters(next)
      const url = `${pathname}${qs}`
      window.history.replaceState(window.history.state, '', url)
    }
  }

  // Patch G stage 3: useDeferredValue on the filter set lets React paint the
  // filter UI (chip highlight, count) immediately while deferring the heavy
  // sections re-render to a transition. Without this, going Fresh → All
  // blocks the input thread for ~1 s on desktop while React reconciles ~1.2k
  // cards. Filter UI computes against `filters` (instant); the snapshot pipeline
  // computes against `deferredFilters` (allowed to fall behind).
  const deferredFilters = useDeferredValue(filters)

  // Pure derivations from snapshot + filters. ~1.4k rows × 4 filter dims is
  // sub-millisecond on every device we care about, so memoization is for
  // referential stability of the props handed down, not raw perf.
  const filtered = useMemo(
    () => filterDeals(snapshot.deals, deferredFilters),
    [snapshot.deals, deferredFilters],
  )
  const counts = useMemo(
    () => storeCounts(snapshot.deals, filters),
    [snapshot.deals, filters],
  )
  // Patch F: 4-level facets — categories (mid-level) + sub-cats. Both honour
  // the "list-includes-everything, only counts react" rule so chips dim to
  // zero rather than disappear when other filters narrow.
  const cats = useMemo(
    () => categoryCounts(snapshot.deals, filters),
    [snapshot.deals, filters],
  )
  const subCats = useMemo(
    () => subCategoryCounts(snapshot.deals, filters),
    [snapshot.deals, filters],
  )
  const sections = useMemo(() => buildSections(filtered), [filtered])
  const facets = useMemo(
    () =>
      snapshot.deals.map((d) => ({
        store: d.store,
        category: d.category,
        categorySlug: d.categorySlug,
        subCategory: d.subCategory,
        productName: d.productName,
      })),
    [snapshot.deals],
  )

  const noStores = filters.stores.length === 0
  const noResults = !noStores && filtered.length === 0

  // Window-anchored virtualizer for the section list. estimateSize is a
  // first-pass guess; measureElement on each row corrects it on mount, so
  // dynamic heights (German labels wrap, primary card has perUnit etc.) are
  // honoured without CLS once the page has settled. overscan keeps the next
  // 2 sections rendered ahead of the viewport so scroll feels seamless.
  const sectionVirtualizer = useWindowVirtualizer({
    count: sections.length,
    estimateSize: () => 520,
    overscan: 2,
    scrollMargin: sectionsRef.current?.offsetTop ?? 0,
  })

  return (
    <>
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--color-ink)] md:text-4xl">
            {t('headline')}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-ink-2)]">
            {t('subline', {
              date: formatShortDate(snapshot.updatedAt, locale),
              count: filtered.length.toLocaleString(locale),
            })}
          </p>
        </div>
      </header>

      <TypeSegmented filters={filters} onChange={apply} locale={locale} />

      <div className="flex flex-col gap-8 pb-24 lg:flex-row lg:gap-10 lg:pb-0">
        <div className="hidden lg:block">
          <FilterRail
            filters={filters}
            onChange={apply}
            totalDealCount={snapshot.deals.length}
            storeCounts={counts}
            categories={cats}
            subCategories={subCats}
            locale={locale}
          />
        </div>

        <div className="min-w-0 flex-1">
          <DealsSearch filters={filters} onChange={apply} />

          {noStores ? (
            <div className="mt-8">
              <NoStoresState message={t('no_stores_selected')} />
            </div>
          ) : null}
          {noResults ? (
            <div className="mt-8">
              <NoResultsState message={t('no_deals_for_filters')} />
            </div>
          ) : null}

          {sections.length > 0 ? (
            <div
              ref={sectionsRef}
              className="mt-8"
              style={{
                height: `${sectionVirtualizer.getTotalSize()}px`,
                position: 'relative',
                width: '100%',
              }}
            >
              {sectionVirtualizer.getVirtualItems().map((vRow) => {
                const s = sections[vRow.index]
                return (
                  <div
                    key={s.subCategory}
                    ref={sectionVirtualizer.measureElement}
                    data-index={vRow.index}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${vRow.start - sectionVirtualizer.options.scrollMargin}px)`,
                      paddingBottom: '48px',
                    }}
                  >
                    <SubCategorySection
                      subCategoryKey={s.subCategory}
                      title={subCategoryLabel(s.subCategory, locale)}
                      primary={s.primary}
                      others={s.others}
                      cheapestLabel={t('cheapest')}
                      othersLabel={t('section_others')}
                      locale={locale}
                    />
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>
      </div>

      <BottomBar
        filters={filters}
        onChange={apply}
        facets={facets}
        matchedCount={filtered.length}
        locale={locale}
      />
    </>
  )
}

function NoStoresState({ message }: { message: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-line-strong)] bg-[var(--color-paper)] p-8 text-sm text-[var(--color-ink-2)]">
      {message}
      <p className="mt-3 text-xs text-[var(--color-ink-3)]">
        {STORE_KEYS.map((s) => STORE_BRAND[s as StoreKey].label).join(' · ')}
      </p>
    </div>
  )
}

function NoResultsState({ message }: { message: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-line-strong)] bg-[var(--color-paper)] p-8 text-sm text-[var(--color-ink-2)]">
      {message}
    </div>
  )
}

function SubCategorySection({
  subCategoryKey,
  title,
  primary,
  others,
  cheapestLabel,
  othersLabel,
  locale,
}: {
  subCategoryKey: string
  title: string
  primary: ReturnType<typeof buildSections>[number]['primary']
  others: ReturnType<typeof buildSections>[number]['others']
  cheapestLabel: string
  othersLabel: string
  locale: string
}) {
  const subline = `${others.length + 1} ${others.length === 0 ? (locale === 'de' ? 'Aktion' : 'deal') : locale === 'de' ? 'Aktionen' : 'deals'}`
  const headingId = `sec-${slug(title)}`
  return (
    <section aria-labelledby={headingId} className="scroll-mt-24">
      {/* Patch G fix (Claude Cowork issue 2a): bg-page is now opaque — the
          previous /85 alpha let card text bleed through the sticky pill on
          mobile, making both unreadable as the user scrolled past sections. */}
      <header className="sticky top-[72px] z-20 -mx-2 flex items-end justify-between gap-3 rounded-[var(--radius-sm)] bg-[var(--color-page)] px-2 py-2">
        <IconHeading
          id={headingId}
          subCategory={subCategoryKey}
          label={title}
          className="flex items-center gap-2 text-h2 text-base font-semibold tracking-tight text-[var(--color-ink)]"
        />
        <span className="font-mono text-xs tabular-nums text-[var(--color-ink-3)]">{subline}</span>
      </header>

      <div className="mt-4">
        <DealCard
          variant="primary"
          id={primary.id}
          category={primary.category}
          store={primary.store}
          productName={primary.productName}
          format={primary.format}
          imageUrl={primary.imageUrl}
          current={primary.salePrice}
          previous={primary.originalPrice}
          perUnit={
            primary.pricePerUnit && primary.canonicalUnit
              ? `CHF ${primary.pricePerUnit.toFixed(2)}/${primary.canonicalUnit}`
              : null
          }
          savingsPct={primary.discountPercent}
          isCheapest
          href={primary.sourceUrl ?? '#'}
          cheapestLabel={cheapestLabel}
        />
      </div>

      {others.length > 0 ? (
        <div className="mt-6">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-ink-3)]">
            {othersLabel}
          </p>
          <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
            {others.map((d) => (
              <DealCard
                key={d.id}
                variant="compact"
                id={d.id}
                category={d.category}
                store={d.store}
                productName={d.productName}
                imageUrl={d.imageUrl}
                current={d.salePrice}
                previous={d.originalPrice}
                perUnit={
                  d.pricePerUnit && d.canonicalUnit
                    ? `CHF ${d.pricePerUnit.toFixed(2)}/${d.canonicalUnit}`
                    : null
                }
                savingsPct={d.discountPercent}
                href={d.sourceUrl ?? '#'}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

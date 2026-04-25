import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { parseFilters } from '@/lib/filters'
import { formatShortDate } from '@/lib/format'
import { STORE_BRAND, STORE_KEYS, type StoreKey } from '@/lib/store-tokens'
import { subCategoryLabel } from '@/lib/sub-category-labels'
import { getWeeklySnapshot } from '@/server/data/snapshot'
import {
  buildSections,
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
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'deals' })
  const isDe = locale === 'de'
  return {
    title: `${t('headline')} · basketch`,
    description: isDe
      ? 'Wochenangebote von Migros, Coop, LIDL, ALDI, Denner, SPAR und Volg im Vergleich.'
      : 'This week’s promotions from Migros, Coop, LIDL, ALDI, Denner, SPAR and Volg, side by side.',
    alternates: { canonical: isDe ? '/deals' : `/${locale}/deals` },
  }
}

// Page shell is static — only the title prerenders. The header subline (date
// from cached snapshot) and the filtered body live inside Suspense so they can
// stream once searchParams resolves. Required by Cache Components.
export default async function DealsPage({ params, searchParams }: Props) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <section className="mx-auto max-w-[1240px] px-4 py-10 md:px-10 md:py-12">
      <Suspense fallback={<HeaderSkeleton />}>
        <DealsHeader locale={locale} searchParamsP={searchParams} />
      </Suspense>

      <Suspense fallback={<BodySkeleton />}>
        <DealsBody locale={locale} searchParamsP={searchParams} />
      </Suspense>
    </section>
  )
}

async function DealsHeader({
  locale,
  searchParamsP,
}: {
  locale: string
  searchParamsP: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParamsP
  const filters = parseFilters(sp)
  const snapshot = await getWeeklySnapshot({ locale })
  const t = await getTranslations({ locale, namespace: 'deals' })
  const filtered = filterDeals(snapshot.deals, filters)

  return (
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
  )
}

async function DealsBody({
  locale,
  searchParamsP,
}: {
  locale: string
  searchParamsP: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParamsP
  const filters = parseFilters(sp)
  const snapshot = await getWeeklySnapshot({ locale })
  const t = await getTranslations({ locale, namespace: 'deals' })

  const filtered = filterDeals(snapshot.deals, filters)
  const counts = storeCounts(snapshot.deals, filters)
  const subCats = subCategoryCounts(snapshot.deals, filters)
  const sections = buildSections(filtered)

  const noStores = filters.stores.length === 0
  const noResults = !noStores && filtered.length === 0

  // Slim facets passed to the mobile FilterSheet's live count. Keeps the
  // client payload small (4 fields × ~1.4k deals).
  const facets = snapshot.deals.map((d) => ({
    store: d.store,
    category: d.category,
    subCategory: d.subCategory,
    productName: d.productName,
  }))

  return (
    <>
      {/* Mobile-only top type chips. Hidden ≥ lg where FilterRail covers it. */}
      <TypeSegmented filters={filters} locale={locale} />

      <div className="flex flex-col gap-8 pb-24 lg:flex-row lg:gap-10 lg:pb-0">
        <div className="hidden lg:block">
          <FilterRail
            filters={filters}
            totalDealCount={snapshot.deals.length}
            storeCounts={counts}
            subCategories={subCats}
            locale={locale}
          />
        </div>

        <div className="min-w-0 flex-1">
          <DealsSearch filters={filters} />

          <div className="mt-8 flex flex-col gap-12">
            {noStores ? <NoStoresState message={t('no_stores_selected')} /> : null}
            {noResults ? <NoResultsState message={t('no_deals_for_filters')} /> : null}

            {sections.map((s) => (
              <SubCategorySection
                key={s.subCategory}
                subCategoryKey={s.subCategory}
                title={subCategoryLabel(s.subCategory, locale)}
                primary={s.primary}
                others={s.others}
                cheapestLabel={t('cheapest')}
                othersLabel={t('section_others')}
                locale={locale}
              />
            ))}
          </div>
        </div>
      </div>

      <BottomBar
        filters={filters}
        facets={facets}
        matchedCount={filtered.length}
        locale={locale}
      />
    </>
  )
}

function HeaderSkeleton() {
  return (
    <header className="mb-8">
      <div className="h-9 w-72 rounded-[var(--radius-sm)] bg-[var(--color-line)]" />
      <div className="mt-2 h-4 w-48 rounded-[var(--radius-sm)] bg-[var(--color-line)]" />
    </header>
  )
}

function BodySkeleton() {
  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
      <aside className="w-full lg:w-[260px] lg:shrink-0">
        <div className="h-4 w-16 rounded-[var(--radius-sm)] bg-[var(--color-line)]" />
        <div className="mt-5 space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-9 rounded-[var(--radius-md)] bg-[var(--color-line)]" />
          ))}
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="h-11 rounded-[var(--radius-md)] bg-[var(--color-line)]" />
        <div className="mt-8 space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[180px] rounded-[var(--radius-lg)] bg-[var(--color-line)]" />
          ))}
        </div>
      </div>
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
      <header className="sticky top-[72px] z-20 -mx-2 flex items-end justify-between gap-3 rounded-[var(--radius-sm)] bg-[var(--color-page)]/85 px-2 py-2 backdrop-blur">
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
          {/*
           * Mobile: horizontal swipe rail (spec §5.3 "horizontal scroll rails for
           * Other stores · same item"). Desktop: vertical stack.
           * Negative margin + padding lets the scroll bleed to the screen edge.
           */}
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

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

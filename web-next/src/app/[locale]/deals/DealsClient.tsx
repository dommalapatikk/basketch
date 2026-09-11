'use client'

import { ChevronDown } from 'lucide-react'
import { useDeferredValue, useMemo, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useWindowVirtualizer } from '@tanstack/react-virtual'

import { usePathname } from '@/i18n/navigation'
import { visibleAttributes } from '@/lib/deal-attributes'
import { type DealsFilters, serializeFilters } from '@/lib/filters'
import { formatShortDate } from '@/lib/format'
import { STORE_BRAND, STORE_KEYS, type StoreKey } from '@/lib/store-tokens'
import { subCategoryLabel } from '@/lib/sub-category-labels'
import type { Deal, WeeklySnapshot } from '@/lib/types'
import {
  buildSections,
  categoryCounts,
  filterDeals,
  onlyStoreSubCategories,
  storageCounts,
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
  // headers are NOT sticky (removed 2026-04-26 — sticky inside an
  // absolutely-positioned + transform-translated virtualizer row gets a
  // different containing block and drifts to the section's bottom edge).
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
  // Static per-Type totals for the rail counter — independent of category /
  // sub / store filters so the user can see "Long-life has 1,004 deals"
  // before clicking, without the chip re-counting against their narrowing.
  const typeCountsByType = useMemo(() => {
    const acc: Record<string, number> = {
      all: snapshot.deals.length,
      fresh: 0,
      longlife: 0,
      household: 0,
    }
    for (const d of snapshot.deals) {
      acc[d.category] = (acc[d.category] ?? 0) + 1
    }
    return acc as Record<'all' | 'fresh' | 'longlife' | 'household', number>
  }, [snapshot.deals])
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
  const storages = useMemo(
    () => storageCounts(snapshot.deals, filters),
    [snapshot.deals, filters],
  )
  const sections = useMemo(() => buildSections(filtered), [filtered])
  // Computed over the WHOLE snapshot, never `filtered`: a deal is not "only at
  // Coop" because the visitor deselected the other six stores.
  const onlyStore = useMemo(() => onlyStoreSubCategories(snapshot.deals), [snapshot.deals])
  const facets = useMemo(
    () =>
      snapshot.deals.map((d) => ({
        store: d.store,
        category: d.category,
        categorySlug: d.categorySlug,
        subCategory: d.subCategory,
        storage: d.storage,
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
            typeCounts={typeCountsByType}
            storeCounts={counts}
            categories={cats}
            subCategories={subCats}
            storages={storages}
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
                      unverifiedLabel={t('category_unverified')}
                      onlyStoreBadge={
                        onlyStore.has(s.subCategory)
                          ? t('only_store_badge', {
                              store: STORE_BRAND[onlyStore.get(s.subCategory) as StoreKey].label,
                            })
                          : null
                      }
                      onlyStoreNote={
                        onlyStore.has(s.subCategory)
                          ? t('only_store_note', {
                              category: subCategoryLabel(s.subCategory, locale),
                            })
                          : null
                      }
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
  unverifiedLabel,
  onlyStoreBadge,
  onlyStoreNote,
  locale,
}: {
  subCategoryKey: string
  title: string
  primary: ReturnType<typeof buildSections>[number]['primary']
  others: ReturnType<typeof buildSections>[number]['others']
  cheapestLabel: string
  othersLabel: string
  unverifiedLabel: string
  onlyStoreBadge: string | null
  onlyStoreNote: string | null
  locale: string
}) {
  const subline = `${others.length + 1} ${others.length === 0 ? (locale === 'de' ? 'Aktion' : 'deal') : locale === 'de' ? 'Aktionen' : 'deals'}`
  const headingId = `sec-${slug(title)}`
  return (
    <section aria-labelledby={headingId} className="scroll-mt-24">
      {/* Sticky removed entirely — Patch G stage 2's virtualizer puts each
          section inside an absolutely-positioned + transform-translated row,
          which gives `position: sticky` a different containing block than the
          document scroll. The header drifted below its section content on
          BOTH mobile and desktop (user-reproduced 2026-04-26). Plain block
          header, always above its cards, no sticky games. */}
      <header className="-mx-2 mb-2 flex items-end justify-between gap-3 rounded-[var(--radius-sm)] bg-[var(--color-page)] px-2 py-2">
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
          crop={primary.crop}
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
          isUncertain={primary.isUncertain}
          unverifiedLabel={unverifiedLabel}
          memberPriceLabel={memberPriceLabel(primary, locale)}
          onlyStoreBadge={onlyStoreBadge}
          onlyStoreNote={onlyStoreNote}
          attributes={visibleAttributes(primary.attributes, locale)}
        />
      </div>

      {others.length > 0 ? (
        <OtherStoresBlock
          others={others}
          othersLabel={othersLabel}
          unverifiedLabel={unverifiedLabel}
          locale={locale}
        />
      ) : null}
    </section>
  )
}

// OtherStoresBlock — Swiss-restraint expand/collapse for the "other stores"
// list inside each sub-cat band. Default-collapsed when there are >5 others
// so a 340-deal section doesn't overwhelm the page; default-expanded for
// small sections so nothing useful is hidden behind a tap.
function OtherStoresBlock({
  others,
  othersLabel,
  unverifiedLabel,
  locale,
}: {
  others: ReturnType<typeof buildSections>[number]['others']
  othersLabel: string
  unverifiedLabel: string
  locale: string
}) {
  const COLLAPSE_THRESHOLD = 5
  const startsCollapsed = others.length > COLLAPSE_THRESHOLD
  const [collapsed, setCollapsed] = useState(startsCollapsed)
  const visible = collapsed ? [] : others

  const toggleLabel = collapsed
    ? locale === 'de'
      ? `Alle ${others.length} anzeigen`
      : `Show all ${others.length}`
    : locale === 'de'
      ? 'Weniger anzeigen'
      : 'Show less'

  return (
    <div className="mt-6">
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((v) => !v)}
        className="mb-3 flex h-9 w-full items-center justify-between rounded-[var(--radius-sm)] px-1 text-left transition-colors hover:bg-[var(--color-page)]"
      >
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-ink-3)]">
          {othersLabel} · {others.length}
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-ink-2)]">
          {toggleLabel}
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${collapsed ? '' : 'rotate-180'}`}
            strokeWidth={1.75}
            aria-hidden
          />
        </span>
      </button>
      {!collapsed && (
        <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
          {visible.map((d) => (
            <DealCard
              key={d.id}
              variant="compact"
              id={d.id}
              category={d.category}
              store={d.store}
              productName={d.productName}
              imageUrl={d.imageUrl}
              crop={d.crop}
              current={d.salePrice}
              previous={d.originalPrice}
              perUnit={
                d.pricePerUnit && d.canonicalUnit
                  ? `CHF ${d.pricePerUnit.toFixed(2)}/${d.canonicalUnit}`
                  : null
              }
              savingsPct={d.discountPercent}
              href={d.sourceUrl ?? '#'}
              isUncertain={d.isUncertain}
              unverifiedLabel={unverifiedLabel}
              memberPriceLabel={memberPriceLabel(d, locale)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/**
 * The label a members-only price must carry, or null for an open price.
 *
 * Art. 3(1)(e) UWG and CLAUDE.md both make this binding: a Lidl Plus, Supercard
 * or Cumulus price may never render as one anybody can pay.
 *
 * Note what is NOT here — a fallback for a member price with no programme name.
 * There is no such case to handle: `createPriceBasis` refuses to build one, so
 * narrowing on the discriminant yields a programme that is always a string.
 * The earlier version of this function had a branch that announced "Loyalty
 * members only" and named nobody, which is the unlabelled member price the rule
 * is about.
 */
function memberPriceLabel(deal: Deal, locale: string): string | null {
  if (deal.priceBasis.kind !== 'member-only') return null
  const { programme } = deal.priceBasis
  return locale === 'de' ? `Nur mit ${programme}` : `${programme} members only`
}

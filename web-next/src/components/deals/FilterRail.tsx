'use client'

import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback } from 'react'

import { activeFilterCount, type DealsFilters } from '@/lib/filters'
import { CATEGORY_LABELS_DE, CATEGORY_LABELS_EN } from '@/lib/category-rules'
import { STORE_BRAND, STORE_DISPLAY_ORDER, STORE_KEYS, type StoreKey } from '@/lib/store-tokens'
import { subCategoryLabel } from '@/lib/sub-category-labels'
import { iconForSubCategory } from '@/components/ui/IconHeading'
import type { DealCategory } from '@/lib/types'

type Props = {
  filters: DealsFilters
  onChange: (next: DealsFilters) => void
  totalDealCount: number
  storeCounts: Record<StoreKey, number>
  categories: Array<{ key: string; count: number }>     // Patch F: mid-level Category list
  subCategories: Array<{ key: string; count: number }>
  locale: string
}

const TYPES: Array<DealCategory | 'all'> = ['all', 'fresh', 'longlife', 'household']

// Patch E HR17: cheap label helper — humanise the slug if next-intl messages
// don't have an entry yet. Replaces dashes with spaces and title-cases.
// Long-term these labels live in messages/{de,en}.json under "categories".
function humaniseSlug(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ')
}

export function FilterRail({
  filters,
  onChange,
  totalDealCount,
  storeCounts,
  categories,
  subCategories,
  locale,
}: Props) {
  const t = useTranslations('filters')
  const labels = locale === 'de' ? CATEGORY_LABELS_DE : CATEGORY_LABELS_EN

  // Hand-off to parent (DealsClient) which owns the filter state + URL update.
  const apply = useCallback(
    (next: DealsFilters) => {
      onChange(next)
    },
    [onChange],
  )

  // Patch F state invariants from spec §E2:
  //   selecting a new Type clears Category AND Sub-category
  //   selecting a new Category clears Sub-category
  const setType = (type: DealCategory | 'all') =>
    apply({ ...filters, type, category: null, subCategory: null })
  const setCategory = (cat: string | null) =>
    apply({ ...filters, category: cat, subCategory: null })
  const setSubCategory = (sub: string | null) => apply({ ...filters, subCategory: sub })
  const toggleStore = (s: StoreKey) => {
    const has = filters.stores.includes(s)
    const stores = has ? filters.stores.filter((x) => x !== s) : [...filters.stores, s]
    apply({ ...filters, stores })
  }
  const reset = () =>
    apply({ type: 'all', category: null, subCategory: null, stores: [...STORE_KEYS], q: '' })

  const activeCount = activeFilterCount(filters)
  const showCategory = filters.type !== 'all' && categories.length > 0
  const showSubCategory =
    filters.type !== 'all' && filters.category !== null && subCategories.length > 0

  return (
    <aside className="w-full lg:w-[260px] lg:shrink-0">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--color-ink-3)]">
          {t('title')}
        </h2>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--color-line-strong)] bg-[var(--color-paper)] px-2.5 py-1 text-xs text-[var(--color-ink-2)] transition-colors hover:bg-[var(--color-page)]"
          >
            {t('reset', { count: activeCount })} <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      {/* Type — radio behaviour */}
      <fieldset className="mt-5">
        <legend className="sr-only">{t('type_legend')}</legend>
        <ul className="flex flex-col gap-1">
          {TYPES.map((tp) => {
            const selected = filters.type === tp
            const label = tp === 'all' ? t('type_all') : labels[tp]
            return (
              <li key={tp}>
                <button
                  type="button"
                  onClick={() => setType(tp)}
                  aria-pressed={selected}
                  className={`flex w-full items-center justify-between rounded-[var(--radius-md)] px-3 py-2 text-left text-sm transition-colors ${
                    selected
                      ? 'bg-[var(--color-ink)] text-[var(--color-paper)]'
                      : 'text-[var(--color-ink)] hover:bg-[var(--color-page)]'
                  }`}
                >
                  <span>{label}</span>
                  {tp === 'all' ? (
                    <span className="font-mono text-xs tabular-nums opacity-70">
                      {totalDealCount}
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      </fieldset>

      {/* Patch F: CATEGORY (mid-level) — only when a Type is active. */}
      {showCategory ? (
        <div className="mt-6">
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--color-ink-3)]">
            {t('category')}
          </p>
          <ul className="mt-3 flex flex-col gap-0.5">
            <li>
              <button
                type="button"
                onClick={() => setCategory(null)}
                aria-pressed={filters.category === null}
                className={`flex w-full items-center justify-between rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm transition-colors ${
                  filters.category === null
                    ? 'bg-[var(--color-ink)] font-semibold text-[var(--color-paper)]'
                    : 'text-[var(--color-ink-2)] hover:bg-[var(--color-line)]'
                }`}
              >
                <span>{t('category_all')}</span>
              </button>
            </li>
            {categories.map((c) => {
              const selected = filters.category === c.key
              const Icon = iconForSubCategory(c.key)
              return (
                <li key={c.key}>
                  <button
                    type="button"
                    onClick={() => setCategory(selected ? null : c.key)}
                    aria-pressed={selected}
                    className={`flex w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm transition-colors ${
                      selected
                        ? 'bg-[var(--color-ink)] font-semibold text-[var(--color-paper)]'
                        : 'text-[var(--color-ink-2)] hover:bg-[var(--color-line)]'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon
                        className={`size-4 shrink-0 ${selected ? 'text-[var(--color-paper)]/80' : 'text-[var(--color-ink-3)]'}`}
                        strokeWidth={1.5}
                        aria-hidden
                      />
                      <span className="truncate">{humaniseSlug(c.key)}</span>
                    </span>
                    <span
                      className={`font-mono text-xs tabular-nums ${
                        selected ? 'text-[var(--color-paper)]/90' : 'text-[var(--color-ink-3)]'
                      }`}
                    >
                      {c.count}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {/* Patch F HR16: SUB-CATEGORY — only when a Type AND Category are active. */}
      {showSubCategory ? (
        <div className="mt-6">
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--color-ink-3)]">
            {t('subcategory')}
          </p>
          <ul className="mt-3 flex flex-col gap-0.5">
            <li>
              <button
                type="button"
                onClick={() => setSubCategory(null)}
                aria-pressed={filters.subCategory === null}
                className={`flex w-full items-center justify-between rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm transition-colors ${
                  filters.subCategory === null
                    ? 'bg-[var(--color-ink)] font-semibold text-[var(--color-paper)]'
                    : 'text-[var(--color-ink-2)] hover:bg-[var(--color-line)]'
                }`}
              >
                <span>{t('subcategory_all')}</span>
              </button>
            </li>
            {subCategories.map((sc) => {
              const selected = filters.subCategory === sc.key
              return (
                <li key={sc.key}>
                  <button
                    type="button"
                    onClick={() => setSubCategory(selected ? null : sc.key)}
                    aria-pressed={selected}
                    className={`flex w-full items-center justify-between rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm transition-colors ${
                      selected
                        ? 'bg-[var(--color-ink)] font-semibold text-[var(--color-paper)]'
                        : 'text-[var(--color-ink-2)] hover:bg-[var(--color-line)]'
                    }`}
                  >
                    <span className="truncate">{subCategoryLabel(sc.key, locale)}</span>
                    <span
                      className={`font-mono text-xs tabular-nums ${
                        selected ? 'text-[var(--color-paper)]/90' : 'text-[var(--color-ink-3)]'
                      }`}
                    >
                      {sc.count}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {/* Stores — neutral chips with brand dot + count, disabled at 0 */}
      <div className="mt-6">
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--color-ink-3)]">
          {t('stores')}
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {STORE_DISPLAY_ORDER.map((s) => {
            const count = storeCounts[s] ?? 0
            const selected = filters.stores.includes(s)
            const disabled = count === 0
            return (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => toggleStore(s)}
                  aria-pressed={selected}
                  disabled={disabled}
                  className={`inline-flex items-center gap-2 rounded-[var(--radius-pill)] border px-3 py-1.5 text-xs transition-colors ${
                    selected
                      ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-paper)]'
                      : 'border-[var(--color-line)] bg-[var(--color-paper)] text-[var(--color-ink-2)] hover:bg-[var(--color-page)]'
                  } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
                >
                  <span
                    aria-hidden
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: STORE_BRAND[s].color }}
                  />
                  <span>{STORE_BRAND[s].label}</span>
                  <span className="font-mono tabular-nums opacity-70">{count}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </aside>
  )
}

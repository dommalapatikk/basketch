'use client'

import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback } from 'react'

import { useRouter, usePathname } from '@/i18n/navigation'
import { activeFilterCount, type DealsFilters, serializeFilters } from '@/lib/filters'
import { CATEGORY_LABELS_DE, CATEGORY_LABELS_EN } from '@/lib/category-rules'
import { STORE_BRAND, STORE_KEYS, type StoreKey } from '@/lib/store-tokens'
import { subCategoryLabel } from '@/lib/sub-category-labels'
import type { DealCategory } from '@/lib/types'

type Props = {
  filters: DealsFilters
  totalDealCount: number
  storeCounts: Record<StoreKey, number>
  subCategories: Array<{ key: string; count: number }>
  locale: string
}

const TYPES: Array<DealCategory | 'all'> = ['all', 'fresh', 'longlife', 'household']

export function FilterRail({
  filters,
  totalDealCount,
  storeCounts,
  subCategories,
  locale,
}: Props) {
  const t = useTranslations('filters')
  const router = useRouter()
  const pathname = usePathname()
  const labels = locale === 'de' ? CATEGORY_LABELS_DE : CATEGORY_LABELS_EN

  // All filter mutations go through this — keeps URL push behaviour consistent
  // (replace, not push, so back-button doesn't trap in filter combinations).
  const apply = useCallback(
    (next: DealsFilters) => {
      const qs = serializeFilters(next)
      router.replace(`${pathname}${qs}` as never, { scroll: false })
    },
    [pathname, router],
  )

  const setType = (type: DealCategory | 'all') => apply({ ...filters, type, category: null })
  const setCategory = (cat: string | null) => apply({ ...filters, category: cat })
  const toggleStore = (s: StoreKey) => {
    const has = filters.stores.includes(s)
    const stores = has ? filters.stores.filter((x) => x !== s) : [...filters.stores, s]
    apply({ ...filters, stores })
  }
  const reset = () => apply({ type: 'all', category: null, stores: [...STORE_KEYS], q: '' })

  const activeCount = activeFilterCount(filters)

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

      {/* Sub-category — only when a type is active and there are sub-categories */}
      {filters.type !== 'all' && subCategories.length > 0 ? (
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
                    ? 'bg-[var(--color-page)] text-[var(--color-ink)]'
                    : 'text-[var(--color-ink-2)] hover:bg-[var(--color-page)]'
                }`}
              >
                <span>{t('category_all')}</span>
              </button>
            </li>
            {subCategories.map((sc) => {
              const selected = filters.category === sc.key
              return (
                <li key={sc.key}>
                  <button
                    type="button"
                    onClick={() => setCategory(selected ? null : sc.key)}
                    aria-pressed={selected}
                    className={`flex w-full items-center justify-between rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm transition-colors ${
                      selected
                        ? 'bg-[var(--color-page)] text-[var(--color-ink)]'
                        : 'text-[var(--color-ink-2)] hover:bg-[var(--color-page)]'
                    }`}
                  >
                    <span className="truncate">{subCategoryLabel(sc.key, locale)}</span>
                    <span className="font-mono text-xs tabular-nums text-[var(--color-ink-3)]">
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
          {STORE_KEYS.map((s) => {
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

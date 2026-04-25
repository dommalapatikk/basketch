'use client'

import { Filter, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { CATEGORY_LABELS_DE, CATEGORY_LABELS_EN } from '@/lib/category-rules'
import type { DealsFilters } from '@/lib/filters'
import { STORE_BRAND, STORE_DISPLAY_ORDER, STORE_KEYS, type StoreKey } from '@/lib/store-tokens'
import { subCategoryLabel } from '@/lib/sub-category-labels'
import { iconForSubCategory } from '@/components/ui/IconHeading'
import { countMatches, type DealFacet } from '@/server/data/filter-deals'

import { Drawer, DrawerClose, DrawerContent, DrawerTrigger } from '@/components/ui/drawer'

type Props = {
  filters: DealsFilters
  onChange: (next: DealsFilters) => void
  facets: DealFacet[]
  matchedCount: number
  locale: string
}

// Cheap label fallback for category slugs until next-intl messages cover them.
function humaniseSlug(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ')
}

// Mobile bottom-sheet filter UI. Maintains a *draft* filter state so the user
// can toggle freely; only `Show n deals` commits the draft to the URL. Cancel
// (backdrop tap or close X) discards. The "Show n deals" count updates live
// from `facets` — a slim projection of the deals payload — so we don't need a
// network round-trip per toggle.
//
// Patch F: 4-level filter. Type stays at top of page (TypeSegmented). Sheet
// hosts Category, Sub-category (progressive — only visible when a Category
// is selected per HR16), and Stores.
export function FilterSheet({ filters, onChange, facets, matchedCount, locale }: Props) {
  const t = useTranslations('filters')
  const tDeals = useTranslations('deals')
  const labels = locale === 'de' ? CATEGORY_LABELS_DE : CATEGORY_LABELS_EN

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DealsFilters>(filters)

  function onOpenChange(next: boolean) {
    if (next) setDraft(filters)
    setOpen(next)
  }

  const previewCount = useMemo(() => countMatches(facets, draft), [facets, draft])

  // Categories that exist under the active Type. Counts honour stores + q so
  // chips dim to 0 instead of disappearing. Same "list-includes-everything,
  // counts-react" rule as the desktop FilterRail.
  const categories = useMemo(() => {
    const q = draft.q.trim().toLowerCase()
    const storeSet = new Set<StoreKey>(draft.stores)
    const map = new Map<string, number>()
    for (const d of facets) {
      if (draft.type !== 'all' && d.category !== draft.type) continue
      const k = (d.categorySlug ?? '').trim()
      if (!k) continue
      if (!map.has(k)) map.set(k, 0)
      if (!storeSet.has(d.store)) continue
      if (q && !d.productName.toLowerCase().includes(q)) continue
      map.set(k, (map.get(k) ?? 0) + 1)
    }
    return Array.from(map.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => {
        const aZero = a.count === 0
        const bZero = b.count === 0
        if (aZero !== bZero) return aZero ? 1 : -1
        if (a.count !== b.count) return b.count - a.count
        return a.key.localeCompare(b.key)
      })
  }, [facets, draft.type, draft.stores, draft.q])

  // Sub-categories scoped to the active Category. Only computed (and only
  // rendered) when a Category is selected — HR16 progressive disclosure.
  const subCats = useMemo(() => {
    if (!draft.category) return []
    const q = draft.q.trim().toLowerCase()
    const storeSet = new Set<StoreKey>(draft.stores)
    const cat = draft.category.toLowerCase()
    const map = new Map<string, number>()
    for (const d of facets) {
      if (draft.type !== 'all' && d.category !== draft.type) continue
      if ((d.categorySlug ?? '').toLowerCase() !== cat) continue
      const k = (d.subCategory ?? '').trim()
      if (!k) continue
      if (!map.has(k)) map.set(k, 0)
      if (!storeSet.has(d.store)) continue
      if (q && !d.productName.toLowerCase().includes(q)) continue
      map.set(k, (map.get(k) ?? 0) + 1)
    }
    return Array.from(map.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => {
        const aZero = a.count === 0
        const bZero = b.count === 0
        if (aZero !== bZero) return aZero ? 1 : -1
        if (a.count !== b.count) return b.count - a.count
        return a.key.localeCompare(b.key)
      })
  }, [facets, draft.type, draft.category, draft.stores, draft.q])

  // State invariants per spec §E2: changing Category clears Sub-category.
  const toggleCategory = (k: string) =>
    setDraft((d) => ({
      ...d,
      category: d.category === k ? null : k,
      subCategory: null, // any Category change resets the sub-cat selection
    }))
  const toggleSubCategory = (k: string) =>
    setDraft((d) => ({
      ...d,
      subCategory: d.subCategory === k ? null : k,
    }))
  const toggleStore = (s: StoreKey) =>
    setDraft((d) => ({
      ...d,
      stores: d.stores.includes(s) ? d.stores.filter((x) => x !== s) : [...d.stores, s],
    }))
  const reset = () =>
    setDraft({
      type: 'all',
      category: null,
      subCategory: null,
      stores: [...STORE_KEYS],
      q: filters.q,
    })

  function commit() {
    onChange(draft)
    setOpen(false)
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerTrigger asChild>
        <button
          type="button"
          aria-label={t('title')}
          className="flex h-full w-full items-center justify-center gap-2 text-sm font-medium text-[var(--color-ink)]"
        >
          <Filter className="h-4 w-4" aria-hidden />
          {t('title')} <span className="font-mono tabular-nums">· {matchedCount}</span>
        </button>
      </DrawerTrigger>

      <DrawerContent
        title={`${draft.type === 'all' ? t('type_all') : labels[draft.type]} · ${t('title')}`}
        description={t('title')}
        className="pb-0"
      >
        <div className="flex flex-col gap-6">
          {/* Patch F: CATEGORY (mid-level) — chip grid with icons, only when Type ≠ all */}
          {draft.type !== 'all' && categories.length > 0 ? (
            <Section label={t('category')}>
              <div
                className="max-h-[40vh] overflow-y-auto pb-3"
                style={{
                  WebkitMaskImage:
                    'linear-gradient(to bottom, #000 calc(100% - 12px), transparent)',
                  maskImage: 'linear-gradient(to bottom, #000 calc(100% - 12px), transparent)',
                }}
              >
                <div className="flex flex-wrap gap-2">
                  {categories.map((c) => {
                    const selected = draft.category === c.key
                    const disabled = c.count === 0 && !selected
                    const Icon = iconForSubCategory(c.key)
                    return (
                      <button
                        key={c.key}
                        type="button"
                        aria-pressed={selected}
                        disabled={disabled}
                        onClick={() => toggleCategory(c.key)}
                        className={`inline-flex items-center gap-2 rounded-[var(--radius-pill)] border px-3 py-1.5 text-xs transition-colors ${
                          selected
                            ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-paper)]'
                            : 'border-[var(--color-line)] bg-[var(--color-paper)] text-[var(--color-ink-2)]'
                        } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
                      >
                        <Icon
                          className={`size-3.5 shrink-0 ${selected ? 'text-[var(--color-paper)]/80' : 'text-[var(--color-ink-3)]'}`}
                          strokeWidth={1.5}
                          aria-hidden
                        />
                        <span className="truncate">{humaniseSlug(c.key)}</span>
                        <span className="font-mono tabular-nums opacity-70">{c.count}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </Section>
          ) : null}

          {/* Patch F HR16: SUB-CATEGORY — only when a Category is selected */}
          {draft.category && subCats.length > 0 ? (
            <Section label={t('subcategory')}>
              <div
                className="max-h-[40vh] overflow-y-auto pb-3"
                style={{
                  WebkitMaskImage:
                    'linear-gradient(to bottom, #000 calc(100% - 12px), transparent)',
                  maskImage: 'linear-gradient(to bottom, #000 calc(100% - 12px), transparent)',
                }}
              >
                <div className="flex flex-wrap gap-2">
                  {subCats.map((sc) => {
                    const selected = draft.subCategory === sc.key
                    const disabled = sc.count === 0 && !selected
                    return (
                      <button
                        key={sc.key}
                        type="button"
                        aria-pressed={selected}
                        disabled={disabled}
                        onClick={() => toggleSubCategory(sc.key)}
                        className={`inline-flex items-center gap-2 rounded-[var(--radius-pill)] border px-3 py-1.5 text-xs transition-colors ${
                          selected
                            ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-paper)]'
                            : 'border-[var(--color-line)] bg-[var(--color-paper)] text-[var(--color-ink-2)]'
                        } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
                      >
                        <span className="truncate">{subCategoryLabel(sc.key, locale)}</span>
                        <span className="font-mono tabular-nums opacity-70">{sc.count}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </Section>
          ) : null}

          <Section label={t('stores')}>
            <div className="flex flex-wrap gap-2">
              {STORE_DISPLAY_ORDER.map((s) => {
                const selected = draft.stores.includes(s)
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleStore(s)}
                    className={`inline-flex items-center gap-2 rounded-[var(--radius-pill)] border px-3 py-1.5 text-xs transition-colors ${
                      selected
                        ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-paper)]'
                        : 'border-[var(--color-line)] bg-[var(--color-paper)] text-[var(--color-ink-2)]'
                    }`}
                  >
                    <span
                      aria-hidden
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ background: STORE_BRAND[s].color }}
                    />
                    {STORE_BRAND[s].label}
                  </button>
                )
              })}
            </div>
          </Section>
        </div>

        {/* Footer pinned to the sheet bottom — Clear (ghost) + Show n deals (primary). */}
        <div className="-mx-5 mt-6 flex items-center gap-3 border-t border-[var(--color-line)] bg-[var(--color-paper)] px-5 py-4">
          <button
            type="button"
            onClick={reset}
            className="text-sm text-[var(--color-ink-3)] underline-offset-4 hover:underline"
          >
            {tDeals('clear')}
          </button>
          <button
            type="button"
            onClick={commit}
            className="ml-auto inline-flex h-12 flex-1 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-ink)] px-5 text-sm font-semibold text-[var(--color-paper)]"
          >
            {tDeals('show_n_deals', { count: previewCount })}
          </button>
          <DrawerClose
            aria-label="Close"
            className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)]"
          >
            <X className="h-4 w-4" />
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-ink-3)]">
        {label}
      </p>
      {children}
    </div>
  )
}

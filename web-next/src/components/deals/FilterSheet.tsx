'use client'

import { Filter, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useState, useTransition } from 'react'

import { useRouter, usePathname } from '@/i18n/navigation'
import { CATEGORY_LABELS_DE, CATEGORY_LABELS_EN } from '@/lib/category-rules'
import { type DealsFilters, serializeFilters } from '@/lib/filters'
import { STORE_BRAND, STORE_DISPLAY_ORDER, STORE_KEYS, type StoreKey } from '@/lib/store-tokens'
import { subCategoryLabel } from '@/lib/sub-category-labels'
import { countMatches, type DealFacet } from '@/server/data/filter-deals'

import { Drawer, DrawerClose, DrawerContent, DrawerTrigger } from '@/components/ui/drawer'

type Props = {
  filters: DealsFilters
  facets: DealFacet[]
  matchedCount: number
  locale: string
}

// Mobile bottom-sheet filter UI. Maintains a *draft* filter state so the user
// can toggle freely; only `Show n deals` commits the draft to the URL. Cancel
// (backdrop tap or close X) discards. The "Show n deals" count updates live
// from `facets` — a slim projection of the deals payload — so we don't need a
// network round-trip per toggle.
export function FilterSheet({ filters, facets, matchedCount, locale }: Props) {
  const t = useTranslations('filters')
  const tDeals = useTranslations('deals')
  const router = useRouter()
  const pathname = usePathname()
  const labels = locale === 'de' ? CATEGORY_LABELS_DE : CATEGORY_LABELS_EN

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DealsFilters>(filters)
  const [, startTransition] = useTransition()

  // Reset draft to the latest committed filters every time the sheet opens.
  function onOpenChange(next: boolean) {
    if (next) setDraft(filters)
    setOpen(next)
  }

  const previewCount = useMemo(() => countMatches(facets, draft), [facets, draft])

  // HR7 (spec v2 §1) + v2.1 §D.5 / §E.2 — sub-category chips reflect every
  // sub-category present in the type-filtered universe regardless of which
  // stores the user has selected. Counts respect the full draft filter
  // (stores + q), so chips dim to 0 instead of disappearing. Sort: count
  // desc, alpha asc on ties, zero-count chips at the bottom.
  const subCats = useMemo(() => {
    const q = draft.q.trim().toLowerCase()
    const storeSet = new Set<StoreKey>(draft.stores)
    const map = new Map<string, number>()
    for (const d of facets) {
      if (draft.type !== 'all' && d.category !== draft.type) continue
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
  }, [facets, draft.type, draft.stores, draft.q])

  const toggleCategory = (k: string) =>
    setDraft((d) => ({ ...d, category: d.category === k ? null : k }))
  const toggleStore = (s: StoreKey) =>
    setDraft((d) => ({
      ...d,
      stores: d.stores.includes(s) ? d.stores.filter((x) => x !== s) : [...d.stores, s],
    }))
  const reset = () =>
    setDraft({ type: 'all', category: null, stores: [...STORE_KEYS], q: filters.q })

  function commit() {
    const qs = serializeFilters(draft)
    // Same reasoning as FilterRail: yield to keep the close animation smooth
    // and let the new RSC payload stream in without blocking the UI thread.
    startTransition(() => {
      router.replace(`${pathname}${qs}` as never, { scroll: false })
    })
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
        // Patch D HR13: Type is now only at the top of the page (TypeSegmented).
        // The sheet inherits the active Type via the title kicker so users
        // know the scope of the sub-cat / store filters they're tweaking.
        title={`${draft.type === 'all' ? t('type_all') : labels[draft.type]} · ${t('title')}`}
        description={t('title')}
        className="pb-0"
      >
        <div className="flex flex-col gap-6">
          {draft.type !== 'all' && subCats.length > 0 ? (
            <Section label={t('category')}>
              {/*
               * Spec v2 §5.3 + §6.4: chips wrap, the container caps at 40vh
               * with internal scroll and a 12 px fade mask at the bottom edge
               * so the user can tell more chips exist below. Mask is a CSS
               * `mask-image` linear-gradient — degrades to no mask in browsers
               * that don't support it (chips still scroll).
               */}
              <div
                className="max-h-[40vh] overflow-y-auto pb-3"
                style={{
                  WebkitMaskImage:
                    'linear-gradient(to bottom, #000 calc(100% - 12px), transparent)',
                  maskImage:
                    'linear-gradient(to bottom, #000 calc(100% - 12px), transparent)',
                }}
              >
                <div className="flex flex-wrap gap-2">
                  {subCats.map((sc) => {
                    const selected = draft.category === sc.key
                    const disabled = sc.count === 0 && !selected
                    return (
                      <button
                        key={sc.key}
                        type="button"
                        aria-pressed={selected}
                        disabled={disabled}
                        onClick={() => toggleCategory(sc.key)}
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
            {tDeals('clear') /* falls back to filter "reset" copy if missing */}
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

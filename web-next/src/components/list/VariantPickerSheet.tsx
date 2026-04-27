'use client'

import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Drawer as Vaul } from 'vaul'
import * as DialogPrimitive from '@radix-ui/react-dialog'

import { useIsDesktop } from '@/lib/use-is-desktop'
import { cn } from '@/lib/utils'
import type { Concept, ConceptFamily, ConceptVariantTile } from '@/lib/v3-types'

// Surface 1 — Variant Picker (per docs/design-3-new-surfaces.md §1).
// Mobile = Vaul bottom drawer (matches ListDrawer.tsx idiom). Desktop = Radix
// Dialog as a 420 px right-side sheet (matches components/ui/sheet.tsx idiom).
// PM-locked decisions applied: P2 = "Save as default" toggle defaults OFF;
// progressive disclosure for the 4 default tiles vs full axis chips.

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  family: ConceptFamily
  concepts: Concept[]
  defaultTiles: ConceptVariantTile[]
  onSelect: (concept: Concept, saveAsDefault: boolean) => void
}

export function VariantPickerSheet(props: Props) {
  const isDesktop = useIsDesktop()
  return isDesktop ? <DesktopVariantPicker {...props} /> : <MobileVariantPicker {...props} />
}

// ----------------------------------------------------------------------------
// Mobile — Vaul bottom drawer, max-h 90vh, drag handle visible, expandable to
// 90% via "More options" disclosure.
// ----------------------------------------------------------------------------

function MobileVariantPicker(props: Props) {
  return (
    <Vaul.Root open={props.open} onOpenChange={props.onOpenChange} direction="bottom">
      <Vaul.Portal>
        <Vaul.Overlay className="fixed inset-0 z-40 bg-[rgba(11,11,15,0.45)]" />
        <Vaul.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90vh] flex-col rounded-t-[var(--radius-xl)] bg-[var(--color-paper)] shadow-[var(--shadow-md)]">
          <div
            aria-hidden
            className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-[var(--color-line-strong)]"
          />
          <Vaul.Title className="sr-only">{props.family.display_name}</Vaul.Title>
          <Vaul.Description className="sr-only">
            Pick your {props.family.display_name.toLowerCase()} variant
          </Vaul.Description>
          <div className="flex-1 overflow-y-auto px-5 pt-2 pb-4">
            <PickerBody {...props} />
          </div>
        </Vaul.Content>
      </Vaul.Portal>
    </Vaul.Root>
  )
}

// ----------------------------------------------------------------------------
// Desktop — Radix Dialog, right-anchored, 420 px wide, full height.
// ----------------------------------------------------------------------------

function DesktopVariantPicker(props: Props) {
  return (
    <DialogPrimitive.Root open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[rgba(11,11,15,0.45)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:fade-in" />
        <DialogPrimitive.Content
          className="fixed top-0 right-0 z-50 flex h-full w-[420px] max-w-[90vw] flex-col bg-[var(--color-paper)] shadow-[var(--shadow-md)] border-l border-[var(--color-line)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right"
        >
          <DialogPrimitive.Title className="sr-only">{props.family.display_name}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Pick your {props.family.display_name.toLowerCase()} variant
          </DialogPrimitive.Description>
          <div className="flex-1 overflow-y-auto px-6 pt-5 pb-4">
            <PickerBody {...props} />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// ----------------------------------------------------------------------------
// Shared body — used by both mobile and desktop variants.
// ----------------------------------------------------------------------------

function PickerBody({ family, concepts, defaultTiles, onSelect }: Props) {
  const t = useTranslations('variant_picker')

  // Selected concept: defaults to the first matching tile-conceptSlug, otherwise
  // the first concept in the list.
  const initialSelectedSlug =
    defaultTiles.find((tile) => concepts.some((c) => c.slug === tile.conceptSlug))?.conceptSlug ??
    concepts[0]?.slug ??
    null

  const [selectedSlug, setSelectedSlug] = useState<string | null>(initialSelectedSlug)
  const [showMoreOptions, setShowMoreOptions] = useState(false)
  const [saveAsDefault, setSaveAsDefault] = useState(false) // P2: defaults OFF
  const [filters, setFilters] = useState({
    volumeMl: null as number | null,
    origin: null as string | null,
    isOrganic: false,
    isLactoseFree: false,
    isVegan: false,
  })

  // Empty state — no concepts at all in the user's region.
  if (concepts.length === 0 && defaultTiles.length === 0) {
    return (
      <div className="py-6">
        <h2 className="mb-1 text-[22px] leading-tight font-semibold text-[var(--color-ink)]">
          {family.display_name}
        </h2>
        <p className="mb-4 text-sm text-[var(--color-ink-2)]">{t('empty_subtitle')}</p>
        <button
          type="button"
          className="h-12 w-full rounded-[var(--radius-md)] bg-[var(--color-ink)] text-sm font-semibold text-[var(--color-paper)]"
          onClick={() => onSelect({} as Concept, false)}
        >
          {t('add_anyway')}
        </button>
      </div>
    )
  }

  // Resolve selected concept (or fall back to first tile's concept if not in DB yet).
  const selectedConcept =
    concepts.find((c) => c.slug === selectedSlug) ??
    concepts[0] ??
    null

  // Filtered concepts based on More options chips/toggles.
  const filteredConcepts = concepts.filter((c) => {
    if (filters.volumeMl !== null && c.volume_ml !== filters.volumeMl) return false
    if (filters.origin !== null && c.origin !== filters.origin) return false
    if (filters.isOrganic && !c.is_organic) return false
    if (filters.isLactoseFree && !c.is_lactose_free) return false
    if (filters.isVegan && !c.is_vegan) return false
    return true
  })

  const noMatchingConcepts = filteredConcepts.length === 0 && concepts.length > 0

  function handleAdd() {
    if (selectedConcept) {
      onSelect(selectedConcept, saveAsDefault)
    }
  }

  // Compute available chip values from the concept set.
  const availableVolumes = uniqueNumbers(concepts.map((c) => c.volume_ml).filter(notNull))
  const availableOrigins = uniqueStrings(concepts.map((c) => c.origin).filter(notNull))

  return (
    <div className="pb-2">
      <h2 className="mb-1 text-[22px] leading-tight font-semibold text-[var(--color-ink)]">
        {t('title', { family: family.display_name })}
      </h2>
      <p className="mb-5 text-sm leading-snug text-[var(--color-ink-2)]">{t('subtitle')}</p>

      {/* Most common picks — 2x2 tile grid */}
      <SectionLabel>{t('most_common')}</SectionLabel>
      <div className="mb-5 grid grid-cols-2 gap-2">
        {defaultTiles.map((tile) => {
          const isSelected = selectedSlug === tile.conceptSlug
          return (
            <button
              key={tile.conceptSlug}
              type="button"
              aria-pressed={isSelected}
              onClick={() => setSelectedSlug(tile.conceptSlug)}
              className={cn(
                'relative flex min-h-[88px] flex-col items-start justify-between rounded-[var(--radius-md)] border p-3 text-left transition-colors',
                isSelected
                  ? 'border-[var(--color-ink)] bg-[var(--color-page)] shadow-[inset_0_0_0_1px_var(--color-ink)]'
                  : 'border-[var(--color-line)] bg-[var(--color-paper)] hover:bg-[var(--color-page)]',
              )}
            >
              {isSelected && (
                <Check
                  className="absolute right-2 top-2 h-4 w-4 text-[var(--color-ink)]"
                  strokeWidth={2}
                  aria-hidden
                />
              )}
              <div className="text-sm font-semibold text-[var(--color-ink)]">{tile.primaryLabel}</div>
              <div className="text-xs text-[var(--color-ink-2)]">{tile.detailLabel}</div>
            </button>
          )
        })}
      </div>

      {/* More options disclosure */}
      <button
        type="button"
        aria-expanded={showMoreOptions}
        onClick={() => setShowMoreOptions((v) => !v)}
        className="flex h-12 w-full items-center justify-between border-y border-[var(--color-line)] text-sm font-medium text-[var(--color-ink)]"
      >
        {t('more_options')}
        <span aria-hidden className="text-[var(--color-ink-3)]">
          {showMoreOptions ? '▴' : '▾'}
        </span>
      </button>

      {showMoreOptions && (
        <div className="space-y-4 py-4">
          {availableVolumes.length > 0 && (
            <ChipRow
              label={t('group_size')}
              chips={availableVolumes.map((ml) => ({
                key: String(ml),
                label: formatVolume(ml),
                selected: filters.volumeMl === ml,
                onClick: () =>
                  setFilters((f) => ({ ...f, volumeMl: f.volumeMl === ml ? null : ml })),
              }))}
            />
          )}
          {availableOrigins.length > 0 && (
            <ChipRow
              label={t('group_origin')}
              chips={availableOrigins.map((o) => ({
                key: o,
                label: capitalize(o),
                selected: filters.origin === o,
                onClick: () =>
                  setFilters((f) => ({ ...f, origin: f.origin === o ? null : o })),
              }))}
            />
          )}
          <div>
            <SectionLabel>{t('group_diet')}</SectionLabel>
            <ToggleRow
              label={t('toggle_organic')}
              checked={filters.isOrganic}
              onChange={(v) => setFilters((f) => ({ ...f, isOrganic: v }))}
            />
            <ToggleRow
              label={t('toggle_lactose_free')}
              checked={filters.isLactoseFree}
              onChange={(v) => setFilters((f) => ({ ...f, isLactoseFree: v }))}
            />
            <ToggleRow
              label={t('toggle_vegan')}
              checked={filters.isVegan}
              onChange={(v) => setFilters((f) => ({ ...f, isVegan: v }))}
            />
          </div>
        </div>
      )}

      {/* M5 — "Save as default" toggle, default OFF (P2 locked) */}
      <ToggleRow
        label={t('save_as_default', { family: family.display_name.toLowerCase() })}
        checked={saveAsDefault}
        onChange={setSaveAsDefault}
      />

      {/* Bottom CTA — adapts label when no SKUs match the chosen filters */}
      <div className="mt-5 border-t border-[var(--color-line)] pt-4">
        {noMatchingConcepts && (
          <p className="mb-2 text-xs text-[var(--color-ink-3)]">{t('no_match_helper')}</p>
        )}
        <button
          type="button"
          onClick={handleAdd}
          className="h-14 w-full rounded-[var(--radius-md)] bg-[var(--color-ink)] text-sm font-semibold text-[var(--color-paper)] transition-opacity hover:opacity-95"
        >
          {noMatchingConcepts ? t('add_anyway_cta') : t('add_to_list')}
        </button>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Small primitives used inside PickerBody.
// ----------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-3)]">
      {children}
    </div>
  )
}

function ChipRow({
  label,
  chips,
}: {
  label: string
  chips: { key: string; label: string; selected: boolean; onClick: () => void }[]
}) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            aria-pressed={chip.selected}
            onClick={chip.onClick}
            className={cn(
              'inline-flex h-11 items-center rounded-[var(--radius-pill)] border px-4 text-sm transition-colors',
              chip.selected
                ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-paper)]'
                : 'border-[var(--color-line)] bg-[var(--color-paper)] text-[var(--color-ink)] hover:bg-[var(--color-page)]',
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex h-11 items-center gap-3 text-sm text-[var(--color-ink)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 rounded border-[var(--color-line-strong)] text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-[var(--color-ink)]"
      />
      <span>{label}</span>
    </label>
  )
}

// ----------------------------------------------------------------------------
// Helpers.
// ----------------------------------------------------------------------------

function uniqueNumbers(xs: number[]): number[] {
  return Array.from(new Set(xs)).sort((a, b) => a - b)
}
function uniqueStrings(xs: string[]): string[] {
  return Array.from(new Set(xs)).sort()
}
function notNull<T>(x: T | null): x is T {
  return x !== null
}
function formatVolume(ml: number): string {
  if (ml < 1000) return `${ml} ml`
  if (ml % 1000 === 0) return `${ml / 1000} L`
  return `${(ml / 1000).toFixed(1)} L`
}
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

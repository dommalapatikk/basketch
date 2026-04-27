'use client'

import { useState } from 'react'

import { AvailabilityStrip } from '@/components/list/AvailabilityStrip'
import { VariantPickerSheet } from '@/components/list/VariantPickerSheet'
import { CONCEPT_FAMILY_DEFAULT_TILES } from '@/lib/concept-family-defaults'
import type { AvailabilityCell, Concept, ConceptFamily, Store } from '@/lib/v3-types'

// Lightweight preview surface for the v3 components on the home page until
// the full search/list refactor lands. Demonstrates Variant Picker + 7-cell
// Availability Strip with stub data so the components are visible & tappable.

const SAMPLE_FAMILY: ConceptFamily = {
  slug: 'milk',
  display_name: 'Milk',
  category_slug: 'dairy-eggs',
  subcategory_slug: null,
  in_starter_pack: true,
  sort_order: 1,
}

// Stub concepts so the picker has at least one to pick (the real DB rows will
// be populated as the pipeline runs).
const SAMPLE_CONCEPTS: Concept[] = [
  {
    id: 'sample-milk-whole',
    slug: 'milk-cow-fresh-3.5pct-1l',
    display_name: 'Whole milk · 1 L · Fresh',
    family_slug: 'milk',
    fat_pct: 3.5, volume_ml: 1000, weight_g: null, shelf_life: 'fresh',
    origin: 'cow', is_organic: false, is_vegan: false, is_vegetarian: true,
    is_lactose_free: false, is_gluten_free: true, allergens: ['milk'], in_starter_pack: true,
  },
  {
    id: 'sample-milk-skim',
    slug: 'milk-cow-fresh-0.1pct-1l',
    display_name: 'Skim · 0.1% · 1 L · Fresh',
    family_slug: 'milk',
    fat_pct: 0.1, volume_ml: 1000, weight_g: null, shelf_life: 'fresh',
    origin: 'cow', is_organic: false, is_vegan: false, is_vegetarian: true,
    is_lactose_free: false, is_gluten_free: true, allergens: ['milk'], in_starter_pack: true,
  },
]

// Sample 7-cell availability with all 3 states represented so the design is
// visible end-to-end at a glance.
const SAMPLE_CELLS: AvailabilityCell[] = [
  { storeSlug: 'migros' as Store, state: 'A', dealPrice: 1.20, discountPercent: 25, lastSeenAt: '2026-04-30', dealId: 'sample-1' },
  { storeSlug: 'coop'   as Store, state: 'A', dealPrice: 1.55, discountPercent: 12, lastSeenAt: '2026-04-30', dealId: 'sample-2' },
  { storeSlug: 'aldi'   as Store, state: 'B', dealPrice: 1.40, discountPercent: 20, lastSeenAt: '2026-04-13', dealId: null },
  { storeSlug: 'denner' as Store, state: 'B', dealPrice: 1.45, discountPercent: 15, lastSeenAt: '2026-01-30', dealId: null },
  { storeSlug: 'lidl'   as Store, state: 'C', dealPrice: null, discountPercent: null, lastSeenAt: null, dealId: null },
  { storeSlug: 'spar'   as Store, state: 'C', dealPrice: null, discountPercent: null, lastSeenAt: null, dealId: null },
  { storeSlug: 'volg'   as Store, state: 'C', dealPrice: null, discountPercent: null, lastSeenAt: null, dealId: null },
]

export function V3PreviewSection() {
  const [pickerOpen, setPickerOpen] = useState(false)

  return (
    <section className="mt-12 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-line-strong)] bg-[var(--color-paper)] p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink-3)]">
        v3 preview · stub data
      </p>
      <h2 className="mt-1 text-base font-semibold text-[var(--color-ink)]">
        New surfaces (not wired to real data yet)
      </h2>
      <p className="mt-1 text-sm text-[var(--color-ink-2)]">
        Tap to try the variant picker. Strip below shows all 3 freshness states.
      </p>

      <div className="mt-4">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="h-11 rounded-[var(--radius-md)] bg-[var(--color-ink)] px-4 text-sm font-semibold text-[var(--color-paper)]"
        >
          Add milk to list
        </button>
      </div>

      <div className="mt-6">
        <p className="mb-2 text-sm font-semibold text-[var(--color-ink)]">Whole milk 1 L</p>
        <AvailabilityStrip conceptName="Whole milk 1 L" cells={SAMPLE_CELLS} />
      </div>

      <VariantPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        family={SAMPLE_FAMILY}
        concepts={SAMPLE_CONCEPTS}
        defaultTiles={CONCEPT_FAMILY_DEFAULT_TILES.milk ?? []}
        onSelect={(_concept, _saveAsDefault) => {
          // Demo only: in real flow this writes a sku to user's list.
          setPickerOpen(false)
        }}
      />
    </section>
  )
}

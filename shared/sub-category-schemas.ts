// shared/sub-category-schemas.ts — v4 canonical schemas per sub-category.
// Source of truth for: canonical unit, format dimensions, default format chip.
// Keyed by the sub_category string used in DealRow.sub_category and Deal.subCategory.

import type { SubCategorySchema } from './types'

export const SUB_CATEGORY_SCHEMAS: Record<string, SubCategorySchema> = {
  water: {
    id: 'water',
    label: 'Water',
    icon: 'droplet',
    canonicalUnit: 'L',
    formatDimensions: [
      { id: 'format', label: 'Type', values: ['still', 'sparkling', 'lightly-sparkling'] },
      { id: 'container', label: 'Container', values: ['pet', 'glass', 'can'] },
      { id: 'packClass', label: 'Pack', values: ['single', 'multipack'] },
    ],
    defaultFormat: 'still',
  },
  dairy: {
    id: 'dairy',
    label: 'Dairy',
    icon: 'milk',
    canonicalUnit: 'L',
    formatDimensions: [
      { id: 'fat', label: 'Type', values: ['whole', 'semi', 'skim', 'lactose-free'] },
    ],
    defaultFormat: 'whole',
  },
  juice: {
    id: 'juice',
    label: 'Juice',
    icon: 'glass-water',
    canonicalUnit: 'L',
    formatDimensions: [
      { id: 'format', label: 'Type', values: ['100pct', 'nectar', 'flavoured'] },
      { id: 'container', label: 'Container', values: ['carton', 'pet', 'glass'] },
    ],
    defaultFormat: '100pct',
  },
  bread: {
    id: 'bread',
    label: 'Bakery',
    icon: 'wheat',
    canonicalUnit: 'kg',
    formatDimensions: [
      { id: 'form', label: 'Form', values: ['loaf', 'roll', 'sliced'] },
      { id: 'flour', label: 'Flour', values: ['white', 'whole-grain', 'mixed'] },
    ],
    defaultFormat: 'loaf',
  },
  poultry: {
    id: 'poultry',
    label: 'Poultry',
    icon: 'drumstick',
    canonicalUnit: 'kg',
    formatDimensions: [
      { id: 'preservation', label: 'Type', values: ['fresh', 'frozen'] },
    ],
    defaultFormat: 'fresh',
  },
  coffee: {
    id: 'coffee',
    label: 'Coffee',
    icon: 'coffee',
    canonicalUnit: '100g',
    formatDimensions: [
      { id: 'form', label: 'Form', values: ['beans', 'ground', 'pods'] },
    ],
    defaultFormat: 'beans',
  },
  eggs: {
    id: 'eggs',
    label: 'Eggs',
    icon: 'egg',
    canonicalUnit: 'piece',
    formatDimensions: [
      { id: 'size', label: 'Size', values: ['small', 'medium', 'large'] },
      { id: 'husbandry', label: 'Husbandry', values: ['free-range', 'organic', 'barn'] },
    ],
    defaultFormat: 'medium',
  },
}

/** Look up a schema by sub_category string, or null if no schema exists. */
export function schemaFor(subCategory: string | null | undefined): SubCategorySchema | null {
  if (!subCategory) return null
  return SUB_CATEGORY_SCHEMAS[subCategory] ?? null
}

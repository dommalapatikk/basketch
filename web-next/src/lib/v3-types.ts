// v3 concept-layer types — inlined into web-next because Turbopack rejects
// cross-project imports under cacheComponents.
//
// Single source of truth still lives in shared/types.ts for the pipeline.
// If schema changes there, mirror those changes here. Drift risk is small
// because v3 types are stable per the locked 9-table model.

export type Store =
  | 'migros'
  | 'coop'
  | 'lidl'
  | 'aldi'
  | 'denner'
  | 'spar'
  | 'volg'

export interface StoreMeta {
  slug: Store
  label: string
  aktionisSlug: string
  hex: string
  hexText: string
  hexLight: string
}

export const STORE_META: Record<Store, StoreMeta> = {
  migros: { slug: 'migros', label: 'Migros', aktionisSlug: 'migros',      hex: '#FF6600', hexText: '#CC5200', hexLight: '#FFF0E6' },
  coop:   { slug: 'coop',   label: 'Coop',   aktionisSlug: 'coop',        hex: '#E30613', hexText: '#B3040F', hexLight: '#FCECEC' },
  lidl:   { slug: 'lidl',   label: 'LIDL',   aktionisSlug: 'lidl',        hex: '#FFF000', hexText: '#E10915', hexLight: '#FFFBCC' },
  aldi:   { slug: 'aldi',   label: 'ALDI',   aktionisSlug: 'aldi-suisse', hex: '#00225E', hexText: '#001A4A', hexLight: '#E6E8F0' },
  denner: { slug: 'denner', label: 'Denner', aktionisSlug: 'denner',      hex: '#E20613', hexText: '#B3040F', hexLight: '#FCECEC' },
  spar:   { slug: 'spar',   label: 'SPAR',   aktionisSlug: 'spar',        hex: '#E30613', hexText: '#009640', hexLight: '#FCECEC' },
  volg:   { slug: 'volg',   label: 'Volg',   aktionisSlug: 'volg',        hex: '#E30613', hexText: '#B3040F', hexLight: '#FFF9CC' },
}

export const ALL_STORES = Object.keys(STORE_META) as Store[]

export type ShelfLife = 'fresh' | 'long-life' | 'frozen'

export interface ConceptFamily {
  slug: string
  display_name: string
  category_slug: string | null
  subcategory_slug: string | null
  in_starter_pack: boolean
  sort_order: number
}

export interface Concept {
  id: string
  slug: string
  display_name: string
  family_slug: string
  fat_pct: number | null
  volume_ml: number | null
  weight_g: number | null
  shelf_life: ShelfLife | null
  origin: string | null
  is_organic: boolean
  is_vegan: boolean
  is_vegetarian: boolean
  is_lactose_free: boolean
  is_gluten_free: boolean
  allergens: string[]
  in_starter_pack: boolean
}

export interface ConceptVariantTile {
  conceptSlug: string
  primaryLabel: string
  detailLabel: string
}

export type FreshnessState = 'A' | 'B' | 'C'

export interface AvailabilityCell {
  storeSlug: Store
  state: FreshnessState
  dealPrice: number | null
  discountPercent: number | null
  lastSeenAt: string | null
  dealId: string | null
}

export interface AvailabilityRow {
  conceptId: string
  conceptSlug: string
  cells: AvailabilityCell[]
}

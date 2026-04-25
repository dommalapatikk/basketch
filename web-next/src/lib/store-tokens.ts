// Store brand tokens — see redesign spec §3.1.
// Brand colors are DATA, not UI: dot, pill, 3px rail only — never as backgrounds.

export const STORE_KEYS = ['migros', 'coop', 'lidl', 'denner', 'spar', 'volg', 'aldi'] as const

export type StoreKey = (typeof STORE_KEYS)[number]

export const STORE_BRAND: Record<StoreKey, { color: string; contrast: string; label: string }> = {
  migros: { color: '#FF6600', contrast: '#FFFFFF', label: 'Migros' },
  coop: { color: '#E30613', contrast: '#FFFFFF', label: 'Coop' },
  lidl: { color: '#FFD60A', contrast: '#0E1E3A', label: 'LIDL' },
  denner: { color: '#C30010', contrast: '#FFFFFF', label: 'Denner' },
  spar: { color: '#E31F24', contrast: '#FFFFFF', label: 'SPAR' },
  volg: { color: '#C8102E', contrast: '#FFFFFF', label: 'Volg' },
  aldi: { color: '#00509D', contrast: '#FFFFFF', label: 'ALDI' },
}

export const CATEGORY_KEYS = ['fresh', 'longlife', 'household', 'other'] as const

export type CategoryKey = (typeof CATEGORY_KEYS)[number]

export const CATEGORY_ACCENT: Record<CategoryKey, string> = {
  fresh: 'var(--cat-fresh)',
  longlife: 'var(--cat-longlife)',
  household: 'var(--cat-household)',
  other: 'var(--cat-other)',
}

// Swiss cantons + per-store coverage map.
// Used by the DealsPage region filter. Coverage is approximate: the "big 3"
// (Migros, Coop, Denner) operate in every canton; LIDL, ALDI, SPAR skip a
// few small mountain cantons; Volg is the opposite — it's strongest in rural
// German-speaking cantons and absent from most French/Italian regions.
//
// Source: checked against each chain's public store locator in 2026-04.
// Edit `STORE_CANTONS` when real outlets are added or removed.

import type { Store } from './types'

export type Canton =
  | 'ZH' | 'BE' | 'LU' | 'UR' | 'SZ' | 'OW' | 'NW' | 'GL'
  | 'ZG' | 'FR' | 'SO' | 'BS' | 'BL' | 'SH' | 'AR' | 'AI'
  | 'SG' | 'GR' | 'AG' | 'TG' | 'TI' | 'VD' | 'VS' | 'NE' | 'GE' | 'JU'

export interface CantonMeta {
  code: Canton
  /** Full German name — shown in the UI. */
  label: string
  /** Language hint for future i18n. */
  language: 'de' | 'fr' | 'it' | 'rm'
}

export const CANTONS: CantonMeta[] = [
  { code: 'ZH', label: 'Zürich',              language: 'de' },
  { code: 'BE', label: 'Bern',                language: 'de' },
  { code: 'LU', label: 'Luzern',              language: 'de' },
  { code: 'UR', label: 'Uri',                 language: 'de' },
  { code: 'SZ', label: 'Schwyz',              language: 'de' },
  { code: 'OW', label: 'Obwalden',            language: 'de' },
  { code: 'NW', label: 'Nidwalden',           language: 'de' },
  { code: 'GL', label: 'Glarus',              language: 'de' },
  { code: 'ZG', label: 'Zug',                 language: 'de' },
  { code: 'FR', label: 'Fribourg',            language: 'fr' },
  { code: 'SO', label: 'Solothurn',           language: 'de' },
  { code: 'BS', label: 'Basel-Stadt',         language: 'de' },
  { code: 'BL', label: 'Basel-Landschaft',    language: 'de' },
  { code: 'SH', label: 'Schaffhausen',        language: 'de' },
  { code: 'AR', label: 'Appenzell Ausserrhoden', language: 'de' },
  { code: 'AI', label: 'Appenzell Innerrhoden',  language: 'de' },
  { code: 'SG', label: 'St. Gallen',          language: 'de' },
  { code: 'GR', label: 'Graubünden',          language: 'de' },
  { code: 'AG', label: 'Aargau',              language: 'de' },
  { code: 'TG', label: 'Thurgau',             language: 'de' },
  { code: 'TI', label: 'Ticino',              language: 'it' },
  { code: 'VD', label: 'Vaud',                language: 'fr' },
  { code: 'VS', label: 'Valais',              language: 'fr' },
  { code: 'NE', label: 'Neuchâtel',           language: 'fr' },
  { code: 'GE', label: 'Genève',              language: 'fr' },
  { code: 'JU', label: 'Jura',                language: 'fr' },
]

export const ALL_CANTONS: Canton[] = CANTONS.map((c) => c.code)

/** Full-set canton coverage — used for stores that operate everywhere. */
const EVERYWHERE: Canton[] = ALL_CANTONS

/**
 * Per-store canton coverage. Conservative: when uncertain, include the canton
 * (false negatives hide a store from a user who can actually shop there).
 */
export const STORE_CANTONS: Record<Store, Canton[]> = {
  migros: EVERYWHERE,
  coop:   EVERYWHERE,
  denner: EVERYWHERE,
  // LIDL: ~160 stores, mostly urban corridors. Missing from micro-cantons.
  lidl: (['ZH','BE','LU','SZ','ZG','FR','SO','BS','BL','SH','SG','GR','AG','TG','TI','VD','VS','NE','GE','JU'] as Canton[]),
  // ALDI: ~240 stores, similar footprint to LIDL plus a few more rural spots.
  aldi: (['ZH','BE','LU','SZ','ZG','FR','SO','BS','BL','SH','SG','GR','AG','TG','TI','VD','VS','NE','GE','JU','GL'] as Canton[]),
  // SPAR: ~190 stores, weaker in French/Italian cantons.
  spar: (['ZH','BE','LU','UR','SZ','OW','NW','GL','ZG','SO','BS','BL','SH','AR','AI','SG','GR','AG','TG','VD','VS'] as Canton[]),
  // Volg: ~580 rural stores, strongest in German Switzerland, absent from GE / BS.
  volg: (['ZH','BE','LU','UR','SZ','OW','NW','GL','ZG','FR','SO','BL','SH','AR','AI','SG','GR','AG','TG','VD','VS','NE','JU'] as Canton[]),
}

export function storesInCanton(canton: Canton | 'all'): Store[] {
  if (canton === 'all') return Object.keys(STORE_CANTONS) as Store[]
  return (Object.entries(STORE_CANTONS) as Array<[Store, Canton[]]>)
    .filter(([, cantons]) => cantons.includes(canton))
    .map(([store]) => store)
}

export function isValidCanton(value: string | null | undefined): value is Canton {
  if (!value) return false
  return ALL_CANTONS.includes(value as Canton)
}

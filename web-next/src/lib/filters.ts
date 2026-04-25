import type { DealCategory } from './types'
import { STORE_KEYS, type StoreKey } from './store-tokens'

// URL contract — see spec §13.2 (`?type=&cat=&stores=&q=&region=&locale=`).
// Region + locale are owned elsewhere (region is M5+, locale is in the path).
export type DealsFilters = {
  type: DealCategory | 'all'
  category: string | null
  stores: StoreKey[]
  q: string
}

const TYPE_VALUES = new Set<DealsFilters['type']>(['all', 'fresh', 'longlife', 'household'])

// Accept hyphenated URL variants (?type=long-life) by mapping them to the
// canonical value. Without this, links from the auditor + future Patch E
// (which uses the hyphenated form) silently fall back to ?type=all and
// serve the entire snapshot — a real perf bug we hit during Patch G review.
const TYPE_ALIASES: Record<string, DealsFilters['type']> = {
  'long-life': 'longlife',
}

export const DEFAULT_FILTERS: DealsFilters = {
  type: 'all',
  category: null,
  stores: [...STORE_KEYS],
  q: '',
}

// Reads a Next.js searchParams object (plain record from awaited `searchParams`)
// into a typed filter set. Unknown values fall back to defaults so an attacker-
// crafted URL can't crash the page.
export function parseFilters(
  raw: Record<string, string | string[] | undefined> | undefined,
): DealsFilters {
  if (!raw) return DEFAULT_FILTERS
  const typeRaw = first(raw.type)
  const typeAliased = (typeRaw && TYPE_ALIASES[typeRaw]) || typeRaw
  const type = TYPE_VALUES.has(typeAliased as DealsFilters['type'])
    ? (typeAliased as DealsFilters['type'])
    : 'all'

  const storesRaw = first(raw.stores)
  const stores = storesRaw
    ? storesRaw
        .split(',')
        .map((s) => s.trim())
        .filter((s): s is StoreKey => (STORE_KEYS as readonly string[]).includes(s))
    : [...STORE_KEYS]

  return {
    type,
    category: first(raw.cat) || null,
    stores: stores.length ? stores : [],
    q: first(raw.q) ?? '',
  }
}

// Build a query string for `<Link>` or router.push. Omits keys at default value
// so URLs stay tidy ("/deals" not "/deals?type=all&stores=migros,coop,…").
export function serializeFilters(f: DealsFilters): string {
  const p = new URLSearchParams()
  if (f.type !== 'all') p.set('type', f.type)
  if (f.category) p.set('cat', f.category)
  if (f.stores.length !== STORE_KEYS.length) p.set('stores', f.stores.join(','))
  if (f.q) p.set('q', f.q)
  const s = p.toString()
  return s ? `?${s}` : ''
}

export function isFiltersDefault(f: DealsFilters): boolean {
  return (
    f.type === 'all' &&
    f.category === null &&
    f.stores.length === STORE_KEYS.length &&
    f.q === ''
  )
}

// Count of active diverging filter dimensions — used for the "Reset (n)" pill.
export function activeFilterCount(f: DealsFilters): number {
  let n = 0
  if (f.type !== 'all') n += 1
  if (f.category) n += 1
  if (f.stores.length !== STORE_KEYS.length) n += 1
  if (f.q) n += 1
  return n
}

function first(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0]
  return v
}

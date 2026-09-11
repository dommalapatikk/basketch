/**
 * StorageState — where a product lives between the shop and the plate.
 *
 * A FACET, not a category (ADR-001). Ice cream is a sweet that is frozen, and
 * frozen peas are vegetables that are frozen. Modelling "frozen" as a category
 * puts frozen mango nowhere near fresh mango, so "cheapest mango" silently
 * misses half the answer. The Frozen food browse tile is a saved filter over
 * this value, never a category of its own.
 *
 * THE ONE PLACE that decides what a storage state is. It previously had three
 * answers — a type guard in shared/types.ts, a second copy inside
 * supabase-provider.mapRow, and a Set in lib/filters.ts — which is three
 * chances to disagree about a value the database CHECK constraint is strict
 * about.
 *
 * Mirrors deals_storage_check in 20260911_offer_fields.sql.
 */

export const STORAGE_STATES = ['fresh', 'chilled', 'frozen', 'ambient'] as const

export type StorageState = (typeof STORAGE_STATES)[number]

/**
 * Reads an untrusted value — a database column, a URL parameter, a model's
 * answer — as a storage state, or null.
 *
 * Deliberately exact. No trimming, no case folding, no translating the German
 * word a retailer prints: those are mappings, and a mapping invented at the
 * read boundary is data nobody can trace. Null means the question was not
 * answered, which is different from "ambient".
 */
export function parseStorageState(value: unknown): StorageState | null {
  if (typeof value !== 'string') return null
  return (STORAGE_STATES as readonly string[]).includes(value) ? (value as StorageState) : null
}

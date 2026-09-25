// DealKey — the natural identity of a STORED deal row: (store, product_name,
// valid_from), the same conflict target `storeDeals` already upserts on
// (`pipeline/store.ts`, `onConflict: 'store,product_name,valid_from'`).
//
// One value object, shared in spirit with `storage/domain/product-key.ts`'s
// `productLookupKey`, so this module never invents a THIRD string format for
// "which deal is this" — the tech-lead cross-review's own complaint about the
// old '|'-joined keys (§4, 2026-09-25). `store.ts` is not modified by this
// module (that migration is WP-1b); `DealKey` is deliberately built the same
// way so WP-1b can adopt it without a second key format existing meanwhile.

import { normalizeProductName } from '../../../shared/types'

export type DealKey = {
  readonly store: string
  readonly productName: string // normalised — see normalizeProductName's own header
  readonly validFrom: string
}

export function dealKey(store: string, productName: string, validFrom: string): DealKey {
  return { store, productName: normalizeProductName(productName), validFrom }
}

export function dealKeyToString(key: DealKey): string {
  return `${key.store}|${key.productName}|${key.validFrom}`
}

export function dealKeyEquals(a: DealKey, b: DealKey): boolean {
  return dealKeyToString(a) === dealKeyToString(b)
}

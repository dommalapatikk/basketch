// Validates raw JSON entries against the UnifiedDeal shape.
// Used at the Python-TypeScript trust boundary in run.ts.

import type { Store, UnifiedDeal } from '../shared/types'

const VALID_STORES: Store[] = ['migros', 'coop']
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && ISO_DATE_RE.test(v) && !isNaN(Date.parse(v))
}

/**
 * Validate a single parsed JSON entry against the UnifiedDeal shape.
 * Returns true if the entry has all required fields with correct types.
 */
export function isValidDealEntry(entry: unknown): entry is UnifiedDeal {
  if (!entry || typeof entry !== 'object') return false
  const e = entry as Record<string, unknown>

  // Required fields
  if (typeof e.store !== 'string' || !VALID_STORES.includes(e.store as Store)) return false
  if (typeof e.productName !== 'string' || e.productName.length === 0) return false
  if (!isFiniteNumber(e.salePrice) || e.salePrice <= 0) return false
  if (!isIsoDate(e.validFrom)) return false

  // Optional number fields: must be finite if present
  if (e.originalPrice != null && !isFiniteNumber(e.originalPrice)) return false
  if (e.discountPercent != null) {
    if (!isFiniteNumber(e.discountPercent) || e.discountPercent < 0 || e.discountPercent > 100) return false
  }

  // Optional date: must be valid ISO date if present
  if (e.validTo != null) {
    if (!isIsoDate(e.validTo)) return false
    // validTo must not be before validFrom
    if (e.validTo < (e.validFrom as string)) return false
  }

  // Optional string fields
  if (e.imageUrl != null && typeof e.imageUrl !== 'string') return false
  if (e.sourceCategory != null && typeof e.sourceCategory !== 'string') return false
  if (e.sourceUrl != null && typeof e.sourceUrl !== 'string') return false

  // Price sanity: if both prices exist, sale should not exceed original
  if (isFiniteNumber(e.originalPrice) && isFiniteNumber(e.salePrice)) {
    if (e.salePrice > e.originalPrice) return false
  }

  return true
}

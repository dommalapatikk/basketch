// chunkByEncodedSize / encodedSize — a byte-budget chunker for PostgREST
// `.in()` lookups.
//
// MOVED HERE from `transformation/infrastructure/supabase/supabase-classification-cache.ts`
// (WP-1c code review, M-1) so a SECOND caller — `pipeline/product-resolve.ts`,
// which resolves products by (store, source_name) key set — can use the exact
// same chunker without importing across bounded contexts (`product-resolve.ts`
// is not part of the `transformation` context, and the classification cache is
// `transformation`-internal infrastructure). This module has no domain, no
// Supabase, no I/O — it is pure — so it belongs in a shared kernel imported by
// BOTH callers, not owned by either.
//
// THE DEFECT THIS EXISTS TO PREVENT (run 34703713179, and the 2026-09-24 Coop
// RCA that reused the same 200-KEY-COUNT shape in product-resolve.ts): a
// chunk size measured in KEYS, not bytes, made the request size a function of
// data nobody controls. `cacheKeyFor()`/`source_name` are raw, lowercase-ish
// product names — Swiss names carry umlauts, `%`, `&` and spaces that
// percent-encode to 3-6 bytes each. Two chunks of 200 keys can differ by
// kilobytes, and the chunks holding the longest names are the ones that
// overflow the transport limit — silently, because a `.in()` lookup URL that
// is too long comes back as a PostgREST/Supabase error, not a compile-time
// signal.
//
// VERIFIED IN postgrest-js src/PostgrestBuilder.ts:
//   :141  this.urlLengthLimit = builder.urlLengthLimit ?? 8000
//   :412  hint 'HTTP headers exceeded server limits (typically 16KB)'
//   :415  "If filtering with large arrays (e.g., .in('id', [200+ IDs])),
//          consider using an RPC function instead."

/** Default budget: generous room under postgrest-js's 8,000-byte urlLengthLimit for the base URL, select list and headers. */
export const DEFAULT_BUDGET_BYTES = 5_000

/** Belt and braces: Postgres also has a practical ceiling on `IN (...)` length, independent of how short the keys are. */
export const DEFAULT_MAX_KEYS = 150

/**
 * Bytes a set of keys occupies once percent-encoded into a query string.
 *
 * Length in CHARACTERS is the wrong unit — `ä` is one character and three
 * bytes encoded (`%C3%A4`), and a space is one character and three (`%20`).
 * Measuring characters is what let a "200 key" chunk silently become a
 * 20-kilobyte request.
 */
export function encodedSize(keys: readonly string[]): number {
  // +1 per key for the separating comma; quoting adds a couple more.
  return keys.reduce((total, k) => total + encodeURIComponent(k).length + 3, 0)
}

/**
 * Splits keys into chunks that each fit the transport budget.
 *
 * A single key larger than the whole budget is still emitted, alone. It will
 * probably fail — but failing loudly on one product is honest, whereas
 * dropping it means re-processing it every run forever while the lookup
 * reports a clean pass. That is the failure mode this codebase keeps
 * producing, so it is refused explicitly here.
 */
export function chunkByEncodedSize(
  keys: readonly string[],
  budgetBytes: number = DEFAULT_BUDGET_BYTES,
  maxKeys: number = DEFAULT_MAX_KEYS,
): string[][] {
  const chunks: string[][] = []
  let current: string[] = []
  let size = 0

  for (const key of keys) {
    const keySize = encodedSize([key])

    const wouldOverflow = current.length > 0 && (size + keySize > budgetBytes || current.length >= maxKeys)
    if (wouldOverflow) {
      chunks.push(current)
      current = []
      size = 0
    }

    current.push(key)
    size += keySize
  }

  if (current.length > 0) chunks.push(current)
  return chunks
}

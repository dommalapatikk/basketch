// Concept resolution rules — moved out of `v3-cutover.ts` (:20-64) unchanged
// in behaviour, but now pure and testable without a database (ARCH-X §2.2,
// TL cross-review §4 C-2). No I/O, no Supabase — domain layer.

export type ResolverRule = {
  readonly id: string
  readonly rule_type: 'exact' | 'contains' | 'regex' | 'brand' | 'multipack'
  readonly pattern: string
  readonly concept_id: string | null
  readonly priority: number
  readonly is_active: boolean
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 200)
}

export function regionForStore(store: string): string {
  if (store === 'migros') return 'aare'
  if (store === 'coop') return 'all'
  return `${store}-all`
}

/**
 * Highest-priority active rule wins; rules are expected pre-sorted ascending
 * by priority (as the old code required — the caller/port loads them that
 * way). Returns the EXISTING concept id the rule names, or null when no rule
 * matches (the caller falls back to one-concept-per-sub-category).
 */
export function applyResolver(productName: string, rules: readonly ResolverRule[]): string | null {
  for (const r of rules) {
    if (!r.is_active || !r.concept_id) continue
    const haystack = productName.toLowerCase()
    const needle = r.pattern.toLowerCase()
    if (r.rule_type === 'exact' && haystack === needle) return r.concept_id
    if (r.rule_type === 'contains' && haystack.includes(needle)) return r.concept_id
    if (r.rule_type === 'brand' && haystack.includes(needle)) return r.concept_id
    if (r.rule_type === 'multipack' && /\b\d+\s*[x×]\s*\d/.test(haystack) && haystack.includes(needle)) return r.concept_id
    if (r.rule_type === 'regex') {
      try {
        if (new RegExp(r.pattern, 'i').test(productName)) return r.concept_id
      } catch {
        // bad regex — skip
      }
    }
  }
  return null
}

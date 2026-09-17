// Guard for WP-W5: `BROWSE_CATEGORIES` (this file's package) is the single
// source of truth for the sub-category vocabulary, and
// `web-next/src/lib/sub-category-labels.ts` must carry a DE and an EN label
// for every value in it — no more, no less.
//
// `web-next` cannot import `shared/` at runtime (the `@shared/*` alias
// type-checks but is not resolved by `tsx`/`vitest` — see basketch/CLAUDE.md).
// This test runs the other direction instead: `shared`'s vitest imports the
// web-next file directly by relative path. That works, and stays honest,
// because the label file is self-contained (no imports of its own) — there
// is nothing for this package's toolchain to fail to resolve.
//
// This is why a plain count assertion (`shared/types.test.ts:36`) was not
// enough on its own: it fired at commit dc9a0a4 and was simply raised in the
// same commit that caused the drift. Asserting the SET, in both directions,
// is what makes the gap impossible to reopen silently — an added
// sub-category with no label fails here, and so does a stale label left
// behind for a sub-category that no longer exists.

import { describe, expect, it } from 'vitest'

import { BROWSE_CATEGORIES } from './types'
import { SUB_CATEGORY_LABELS_DE, SUB_CATEGORY_LABELS_EN } from '../web-next/src/lib/sub-category-labels'

const TAXONOMY_SUB_CATEGORIES = new Set(BROWSE_CATEGORIES.flatMap((c) => c.subCategories))

describe('sub-category label coverage (WP-W5)', () => {
  it('has no taxonomy sub-category without a German label', () => {
    const missing = [...TAXONOMY_SUB_CATEGORIES].filter((key) => !(key in SUB_CATEGORY_LABELS_DE))
    expect(missing, `Missing DE label(s) for: ${missing.join(', ')}`).toEqual([])
  })

  it('has no taxonomy sub-category without an English label', () => {
    const missing = [...TAXONOMY_SUB_CATEGORIES].filter((key) => !(key in SUB_CATEGORY_LABELS_EN))
    expect(missing, `Missing EN label(s) for: ${missing.join(', ')}`).toEqual([])
  })

  it('has no German label for a sub-category the taxonomy no longer has', () => {
    const orphaned = Object.keys(SUB_CATEGORY_LABELS_DE).filter((key) => !TAXONOMY_SUB_CATEGORIES.has(key))
    expect(orphaned, `Orphaned DE label(s) for: ${orphaned.join(', ')}`).toEqual([])
  })

  it('has no English label for a sub-category the taxonomy no longer has', () => {
    const orphaned = Object.keys(SUB_CATEGORY_LABELS_EN).filter((key) => !TAXONOMY_SUB_CATEGORIES.has(key))
    expect(orphaned, `Orphaned EN label(s) for: ${orphaned.join(', ')}`).toEqual([])
  })

  it('DE and EN cover exactly the same set of keys as each other', () => {
    const deKeys = new Set(Object.keys(SUB_CATEGORY_LABELS_DE))
    const enKeys = new Set(Object.keys(SUB_CATEGORY_LABELS_EN))
    expect([...deKeys].filter((k) => !enKeys.has(k))).toEqual([])
    expect([...enKeys].filter((k) => !deKeys.has(k))).toEqual([])
  })

  it('no label is an empty or whitespace-only string', () => {
    const blankDe = Object.entries(SUB_CATEGORY_LABELS_DE)
      .filter(([, v]) => v.trim() === '')
      .map(([k]) => k)
    const blankEn = Object.entries(SUB_CATEGORY_LABELS_EN)
      .filter(([, v]) => v.trim() === '')
      .map(([k]) => k)
    expect(blankDe).toEqual([])
    expect(blankEn).toEqual([])
  })
})

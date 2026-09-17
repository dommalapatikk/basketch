// Covers `subCategoryLabel` itself. The set-equality guard lives in
// `shared/sub-category-labels.test.ts` and proves the DATA matches
// BROWSE_CATEGORIES — but it runs in the `shared` suite, which a web-next
// developer does not run and `web-next/vitest.config.ts` does not collect
// (`include: ['src/**/*.test.{ts,tsx}']`). So the FUNCTION was untested
// everywhere. These are the five behaviours the rendering path depends on.
//
// ⚠️ Every fixture that asserts a MAPPED label must be a slug whose label
// DIFFERS from the title-cased slug. (Test 3 is the deliberate exception: it
// uses an unmapped slug because the fallback itself is what it tests.)
// `toys` → 'Toys' is byte-identical to titleCase('toys'),
// so a test using it passes whether the map lookup or the fallback ran — it
// cannot fail. That mistake was made and caught in this very file (review
// MF-3): a mutant returning an empty map for unknown locales survived it.
// Safe fixtures: `books-media`, `mens-care`, `home-appliance`, `catering`.

import { describe, expect, it } from 'vitest'
import {
  SUB_CATEGORY_LABELS_DE,
  SUB_CATEGORY_LABELS_EN,
  subCategoryLabel,
} from './sub-category-labels'

describe('subCategoryLabel', () => {
  it('returns the German label on /de — the defect this file exists for', () => {
    // 585 of 1,169 live deals (2026-09-17) fell through to the English
    // fallback, so a /de visitor read "Toys", "Pastry", "Dough".
    expect(subCategoryLabel('toys', 'de')).toBe('Spielzeug')
    expect(subCategoryLabel('pastry', 'de')).toBe('Gebäck')
    expect(subCategoryLabel('kitchen-appliance', 'de')).toBe('Küchengeräte')
  })

  it('returns the English label on /en', () => {
    // Both fixtures differ from their title-cased slug, so neither can pass
    // via the fallback path.
    expect(subCategoryLabel('books-media', 'en')).toBe('Books & Media')
    expect(subCategoryLabel('catering', 'en')).toBe('Party Platters')
  })

  it('falls back to a title-cased key for a sub-category it has never seen', () => {
    // The pipeline can emit a tag before anyone labels it. Rendering the raw
    // slug is acceptable; rendering nothing is not.
    expect(subCategoryLabel('brand-new-tag', 'de')).toBe('Brand New Tag')
    expect(subCategoryLabel('brand-new-tag', 'en')).toBe('Brand New Tag')
  })

  it('treats an unknown locale as English rather than returning nothing', () => {
    // routing.ts serves ['de','en'] today; fr/it are deferred. If one is added
    // before its labels are, it must degrade to English, not to blank.
    // NOT 'toys' — titleCase('toys') is also 'Toys', so that fixture passes
    // whether the EN map or the fallback ran, and a mutant returning {} for
    // unknown locales survives it.
    expect(subCategoryLabel('books-media', 'fr')).toBe('Books & Media')
  })

  // The guard in `shared/` asserts `key in map`; this function asserts
  // truthiness (`if (map[key])`). Those differ for an empty-string label —
  // which would silently fall through to the title-cased key instead of
  // rendering the label. The shared suite pins the data side; this pins that
  // the seam is understood on the rendering side too.
  it('never falls through to the fallback for a key it has a label for', () => {
    // Behavioural, not a data assertion: it exercises the FUNCTION for every
    // mapped key, so it catches a blank label AND any other future cause of a
    // fallthrough. (The earlier form re-asserted the data, duplicating the
    // shared guard and testing nothing about the seam it named.)
    const de = Object.entries(SUB_CATEGORY_LABELS_DE)
    const en = Object.entries(SUB_CATEGORY_LABELS_EN)
    expect(de.length).toBeGreaterThan(0) // no vacuous pass on an empty map
    expect(en.length).toBe(de.length)
    for (const [key, label] of de) {
      // Both assertions are needed. The behavioural one below catches any
      // fallthrough cause, but NOT a whitespace-only label: '  ' is truthy,
      // so the function returns it verbatim and output === data. That renders
      // an invisible chip — worse than the English fallback this file fixes.
      expect(label.trim(), `blank DE label for ${key}`).not.toBe('')
      expect(subCategoryLabel(key, 'de'), key).toBe(label)
    }
    for (const [key, label] of en) {
      expect(label.trim(), `blank EN label for ${key}`).not.toBe('')
      expect(subCategoryLabel(key, 'en'), key).toBe(label)
    }
  })
})

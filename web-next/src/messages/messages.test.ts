import { describe, expect, it } from 'vitest'

import de from './de.json' with { type: 'json' }
import en from './en.json' with { type: 'json' }

// Spec §12 cross-cutting: "DE / FR / IT / EN all render with no key misses
// (tested via a missing-key report in CI)". FR/IT are deferred until the
// translations land, so for now we only check DE↔EN parity.
//
// The check walks every leaf path in both bundles and asserts both sides
// expose the same set of keys. Any drift (typo, half-translated namespace,
// new key added in only one bundle) fails the test loudly with the missing
// path so the fix is one-line.

function leafPaths(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix]
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    leafPaths(v, prefix ? `${prefix}.${k}` : k),
  )
}

describe('i18n key parity', () => {
  it('every key in de.json exists in en.json (and vice versa)', () => {
    const dePaths = new Set(leafPaths(de))
    const enPaths = new Set(leafPaths(en))

    const missingInEn = [...dePaths].filter((p) => !enPaths.has(p))
    const missingInDe = [...enPaths].filter((p) => !dePaths.has(p))

    expect(missingInEn, `Keys present in DE but missing in EN:\n${missingInEn.join('\n')}`).toEqual([])
    expect(missingInDe, `Keys present in EN but missing in DE:\n${missingInDe.join('\n')}`).toEqual([])
  })

  it('no leaf value is empty string', () => {
    function emptyLeaves(obj: unknown, prefix = ''): string[] {
      if (typeof obj === 'string') return obj.trim() === '' ? [prefix] : []
      if (obj === null || typeof obj !== 'object') return []
      return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
        emptyLeaves(v, prefix ? `${prefix}.${k}` : k),
      )
    }
    expect(emptyLeaves(de)).toEqual([])
    expect(emptyLeaves(en)).toEqual([])
  })
})

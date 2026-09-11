// Architecture tests — the layering rules for the read domain, made executable.
//
// CLAUDE.md § Domain-Driven Design:
//   "The domain layer imports no infrastructure — no fetch, no PDF library, no
//    Supabase. Enforce with ESLint no-restricted-imports, not prose."
//
// An invariant that only exists in a markdown file is a comment, not an
// invariant — the same argument the domain makes about constructor validation.
//
// Mirrors pipeline/collection/domain/architecture.test.ts. web-next DOES have a
// linter, but Biome has no import-boundary rule, and this version names the
// offending file and line rather than just failing.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DOMAIN_DIR = __dirname

/** Every .ts file in the domain, excluding tests. */
function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...sourceFiles(full))
    } else if (entry.name.endsWith('.ts') && !entry.name.includes('.test.')) {
      out.push(full)
    }
  }
  return out
}

/** Import specifiers in a file, with line numbers, for a legible failure. */
function imports(file: string): { spec: string; line: number }[] {
  const found: { spec: string; line: number }[] = []
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((text, i) => {
      const m =
        text.match(/^\s*import\s[^'"]*from\s+['"]([^'"]+)['"]/) ??
        text.match(/^\s*import\s+['"]([^'"]+)['"]/)
      if (m?.[1]) found.push({ spec: m[1], line: i + 1 })
    })
  return found
}

const FORBIDDEN = [
  { match: /^@supabase\//, why: 'the domain must not know the database exists' },
  { match: /^@\/lib\/supabase/, why: 'the domain must not know the database exists' },
  { match: /^next(\/|$)/, why: 'the domain must not depend on the framework' },
  { match: /^react(-dom)?(\/|$)/, why: 'the domain must not depend on the view layer' },
  { match: /^next-intl/, why: 'translation is a presentation concern' },
  { match: /^@\/server\//, why: 'the domain must not reach into the server layer' },
  { match: /^@\/components\//, why: 'the domain must not reach into components' },
  { match: /^node:/, why: 'the domain must stay runnable in a browser' },
]

describe('the read domain imports no infrastructure', () => {
  const files = sourceFiles(DOMAIN_DIR)

  it('finds the domain files it is supposed to be guarding', () => {
    // Guards the guard: a rename that empties this list would make every
    // assertion below pass vacuously.
    expect(files.length).toBeGreaterThanOrEqual(4)
  })

  it.each(files.map((f) => [f.split('/src/')[1] ?? f, f]))('%s', (_label, file) => {
    const violations = imports(file).flatMap(({ spec, line }) => {
      const rule = FORBIDDEN.find((r) => r.match.test(spec))
      return rule ? [`${file.split('/src/')[1]}:${line} imports '${spec}' — ${rule.why}`] : []
    })
    expect(violations).toEqual([])
  })

  it('keeps the domain free of relative escapes out of lib/domain', () => {
    // `../store-tokens` would pull presentation constants into the domain and
    // is the easiest accidental way past the checks above.
    const escapes = files.flatMap((file) =>
      imports(file)
        .filter(({ spec }) => spec.startsWith('../'))
        .map(({ spec, line }) => `${file.split('/src/')[1]}:${line} imports '${spec}'`),
    )
    expect(escapes).toEqual([])
  })
})

// Architecture tests — the layering rules, made executable.
//
// CLAUDE.md § Domain-Driven Design:
//   "The domain layer imports no infrastructure — no fetch, no PDF library, no
//    Supabase. Enforce with ESLint no-restricted-imports, not prose."
//
// An invariant that only exists in a markdown file is a comment, not an
// invariant — the same argument the domain makes about constructor validation.
//
// Implemented as a test rather than a lint rule on purpose: `pipeline/` has three
// dependencies and no linter, and adding a toolchain to enforce one rule would
// fail the project's own over-engineering test. This runs in CI that already
// exists, needs nothing installed, and fails loudly with the offending line.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const INFRA_DIR = join(__dirname, '..', 'infrastructure')
const APPLICATION_DIR = join(__dirname, '..', 'application')

/**
 * Every domain directory in the pipeline. Both modules obey the same rules, so
 * a new one must be added here — otherwise it silently escapes enforcement,
 * which is how transformation/domain went unchecked when it was first created.
 */
const DOMAIN_DIRS = [__dirname, join(__dirname, '..', '..', 'transformation', 'domain')].filter((d) => {
  try {
    readdirSync(d)
    return true
  } catch {
    return false
  }
})

/** Every .ts file in a directory tree, excluding tests. */
function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__fixtures__' || entry.name === 'node_modules') continue
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
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((text, i) => {
    const m = text.match(/^\s*import\s[^'"]*from\s+['"]([^'"]+)['"]/) ?? text.match(/^\s*import\s+['"]([^'"]+)['"]/)
    if (m?.[1]) found.push({ spec: m[1], line: i + 1 })
  })
  return found
}

const rel = (f: string) => f.slice(f.indexOf('/collection/') + 1)

describe('the domain layer imports no infrastructure', () => {
  const domainFiles = DOMAIN_DIRS.flatMap(sourceFiles)

  it('finds domain files to check — guards against a silently empty test', () => {
    expect(domainFiles.length).toBeGreaterThan(8)
    expect(DOMAIN_DIRS.length).toBe(2) // collection + transformation
  })

  it('never imports from infrastructure/', () => {
    const violations: string[] = []
    for (const file of domainFiles) {
      for (const { spec, line } of imports(file)) {
        if (spec.includes('infrastructure')) violations.push(`${rel(file)}:${line} imports '${spec}'`)
      }
    }
    expect(violations).toEqual([])
  })

  it('never imports from application/', () => {
    const violations: string[] = []
    for (const file of domainFiles) {
      for (const { spec, line } of imports(file)) {
        if (spec.includes('application')) violations.push(`${rel(file)}:${line} imports '${spec}'`)
      }
    }
    expect(violations).toEqual([])
  })

  it('never imports a node builtin — no fs, no http, no crypto', () => {
    const violations: string[] = []
    for (const file of domainFiles) {
      for (const { spec, line } of imports(file)) {
        if (spec.startsWith('node:')) violations.push(`${rel(file)}:${line} imports '${spec}'`)
      }
    }
    expect(violations).toEqual([])
  })

  it('never imports a third-party package — Supabase, PDF, HTTP clients', () => {
    const violations: string[] = []
    for (const file of domainFiles) {
      for (const { spec, line } of imports(file)) {
        const isRelative = spec.startsWith('.') || spec.startsWith('@shared/')
        if (!isRelative && !spec.startsWith('node:')) {
          violations.push(`${rel(file)}:${line} imports '${spec}'`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('never calls fetch or reaches the network', () => {
    const violations: string[] = []
    for (const file of domainFiles) {
      const src = readFileSync(file, 'utf8')
      // Deliberately crude: any mention in domain source is worth a look.
      if (/\bfetch\s*\(/.test(src)) violations.push(`${rel(file)} calls fetch()`)
      if (/\bcreateClient\s*\(/.test(src)) violations.push(`${rel(file)} creates a Supabase client`)
    }
    expect(violations).toEqual([])
  })
})

describe('adapters are anti-corruption layers', () => {
  it('keeps retailer vocabulary out of the domain', () => {
    // These names appear in real retailer payloads. Each must die inside its
    // adapter. A hit here means an ACL leaked (CLAUDE.md § DDD).
    const RETAILER_VOCABULARY = [
      '_tracking_item_category',
      '_tracking_item_name',
      '_tracking_item_brand',
      'insteadPriceText',
      'content_size_text',
      'nameSubline',
      'categoryPrimary',
      'refiningId',
      'prd_page',
      'eco_labels',
      'box_item_count',
    ]

    const violations: string[] = []
    for (const file of DOMAIN_DIRS.flatMap(sourceFiles)) {
      const src = readFileSync(file, 'utf8')
      for (const term of RETAILER_VOCABULARY) {
        // Comments explaining what the domain deliberately does NOT read are
        // documentation, not leakage — strip them before checking.
        const code = src
          .split('\n')
          .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
          .join('\n')
        if (code.includes(term)) violations.push(`${rel(file)} references '${term}'`)
      }
    }
    expect(violations).toEqual([])
  })
})

describe('personal data never enters the pipeline', () => {
  it('no adapter reads a review, rating or free-text opinion field', () => {
    // CLAUDE.md § Legal: "Filter personal data at parse time — reviews,
    // usernames, named staff."
    //
    // Denner's API returns `rating`, `ratingTotal` and `character` (tasting
    // notes written by people) on every wine. We do not read them — but that
    // was omission, not enforcement, until this test existed. A future adapter
    // reaching for "more metadata" would have pulled user-generated content
    // into a public dataset without anyone noticing.
    const PERSONAL_DATA_FIELDS = [
      'ratingTotal',
      'reviewCount',
      'reviews',
      'userName',
      'username',
      'authorName',
      'customerName',
      'datePublished',
    ]

    const violations: string[] = []
    for (const file of sourceFiles(INFRA_DIR)) {
      const src = readFileSync(file, 'utf8')
      const code = src
        .split('\n')
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join('\n')
      for (const field of PERSONAL_DATA_FIELDS) {
        if (code.includes(field)) violations.push(`${rel(file)} reads '${field}'`)
      }
    }
    expect(violations).toEqual([])
  })
})

describe('application orchestrates, it does not parse', () => {
  it('never imports a specific retailer adapter — it depends on the port', () => {
    const violations: string[] = []
    for (const file of sourceFiles(APPLICATION_DIR)) {
      for (const { spec, line } of imports(file)) {
        if (/\/(denner|coop|migros|lidl|aldi|spar|volg)\//.test(spec)) {
          violations.push(`${rel(file)}:${line} imports '${spec}'`)
        }
      }
    }
    expect(violations).toEqual([])
  })
})

describe('infrastructure implements the domain, not the reverse', () => {
  it('has adapters that import the domain — proving the dependency direction', () => {
    const adapters = sourceFiles(INFRA_DIR).filter((f) => f.includes('-source.ts'))
    expect(adapters.length).toBeGreaterThanOrEqual(7)
    for (const file of adapters) {
      const specs = imports(file).map((i) => i.spec)
      expect(specs.some((s) => s.includes('domain'))).toBe(true)
    }
  })
})

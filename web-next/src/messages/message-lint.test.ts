import {
  isArgumentElement,
  isNumberElement,
  isPluralElement,
  isSelectElement,
  isTagElement,
  type MessageFormatElement,
  parse,
} from '@formatjs/icu-messageformat-parser'
import { describe, expect, it } from 'vitest'

import de from './de.json' with { type: 'json' }
import en from './en.json' with { type: 'json' }

// Guard for the "1 items" bug class (2026-09-27, code review SF-2): parse
// every EN/DE message and flag a count-like argument rendered outside a
// plural for that same argument. fr/it are not served (routing is de/en
// only) and are not scanned; add them here when they ship.

const COUNT_NAMES = new Set(['count', 'n', 'items', 'stores', 'deals', 'days', 'weeks', 'months'])

// Keys that deliberately keep a bare count, each with the reason.
const EXEMPT: Record<string, string> = {
  // isMultiBuy's DB invariant guarantees count >= 2; lib/format.ts duplicates
  // this template with a literal .replace('{count}', …) (spec B.3).
  'deals.from_n_items': 'count is always >= 2',
  // "Reset (3)" — a bare number in brackets, no noun to agree with.
  'filters.reset': 'bare number, no noun',
}

function leaves(obj: unknown, prefix = ''): [string, string][] {
  if (typeof obj === 'string') return [[prefix, obj]]
  if (obj === null || typeof obj !== 'object') return []
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    leaves(v, prefix ? `${prefix}.${k}` : k),
  )
}

type Finding = string

/** Walk the AST; `pluralScope` holds the arguments whose plural we are inside. */
function walk(
  elements: MessageFormatElement[],
  pluralScope: Set<string>,
  found: Finding[],
  args: Set<string>,
): void {
  for (const el of elements) {
    if (isArgumentElement(el) || isNumberElement(el)) {
      args.add(el.value)
      if (COUNT_NAMES.has(el.value) && !pluralScope.has(el.value)) {
        found.push(`{${el.value}} is rendered outside a plural for ${el.value}`)
      }
    } else if (isPluralElement(el)) {
      args.add(el.value)
      const inner = new Set(pluralScope).add(el.value)
      for (const opt of Object.values(el.options)) walk(opt.value, inner, found, args)
    } else if (isSelectElement(el)) {
      args.add(el.value)
      for (const opt of Object.values(el.options)) walk(opt.value, pluralScope, found, args)
    } else if (isTagElement(el)) {
      walk(el.children, pluralScope, found, args)
    }
  }
}

function lintMessage(message: string): { findings: Finding[]; args: Set<string> } {
  const findings: Finding[] = []
  const args = new Set<string>()
  walk(parse(message), new Set(), findings, args)
  return { findings, args }
}

function lintBundle(messages: unknown): string[] {
  return leaves(messages).flatMap(([key, message]) =>
    key in EXEMPT ? [] : lintMessage(message).findings.map((f) => `${key}: ${f}`),
  )
}

describe('message lint — every count is pluralised (EN, DE)', () => {
  it.each([
    ['en', en],
    ['de', de],
  ])('%s', (_locale, messages) => {
    expect(lintBundle(messages)).toEqual([])
  })

  it('EN and DE use the same argument names for every key', () => {
    const deByKey = new Map(leaves(de))
    const mismatches = leaves(en).flatMap(([key, message]) => {
      const other = deByKey.get(key)
      if (other === undefined) return [] // key parity is messages.test.ts's job
      const a = [...lintMessage(message).args].sort().join(',')
      const b = [...lintMessage(other).args].sort().join(',')
      return a === b ? [] : [`${key}: en {${a}} vs de {${b}}`]
    })
    expect(mismatches).toEqual([])
  })

  it('every exemption still exists (a stale exemption hides nothing)', () => {
    const keys = new Set(leaves(en).map(([k]) => k))
    for (const key of Object.keys(EXEMPT)) expect(keys.has(key), key).toBe(true)
  })
})

describe('message lint — catches every known shape of the defect', () => {
  it.each([
    ['bare argument', 'Updated · {count} deals'],
    ['spaces inside braces', 'Updated · { count } deals'],
    ['number format', 'Updated · {count, number} deals'],
    [
      'bare use beside a plural for the same name',
      '{items, plural, other {# items}} and {items} more',
    ],
    ['bare count inside a select', '{kind, select, other {{n} left}}'],
  ])('flags: %s', (_label, message) => {
    expect(lintMessage(message).findings.length).toBeGreaterThan(0)
  })

  it('rejects a plural with no "other" branch (the parser throws, so the bundle test fails)', () => {
    expect(() => lintMessage('{count, plural, one {# deal}}')).toThrow(/MISSING_OTHER_CLAUSE/)
  })

  it.each([
    ['pluralised count', '{count, plural, one {# deal} other {# deals}}'],
    [
      'outer count used inside its own nested plural',
      '{items, plural, other {{stores, plural, other {{items} at # stores}}}}',
    ],
    ['non-count placeholders', '{store} wins {category} at CHF {price}, {pct}% off, {date}'],
  ])('passes: %s', (_label, message) => {
    expect(lintMessage(message).findings).toEqual([])
  })
})

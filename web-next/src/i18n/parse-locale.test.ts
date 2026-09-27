import { describe, expect, it } from 'vitest'

import { parseLocale } from './parse-locale'

// regression 2026-09-25: 404 served global-error (500) — T6
//
// The RCA's second defect: /foo.bar reaches [locale]/page.tsx with the raw,
// unvalidated path segment as `locale`, and a downstream Intl call throws
// `RangeError: Invalid language tag`, an uncaught 500 for what should be a
// 404. Every [locale] entry point must parse the param through this function
// instead of trusting the string — see
// docs/rca/2026-09-25-tech-lead-404-shows-500.md § "Final plan" step 3.

const routing = { locales: ['de', 'en'] } as const

describe('parseLocale', () => {
  it('returns the Locale for de/en', () => {
    expect(parseLocale('de', routing)).toBe('de')
    expect(parseLocale('en', routing)).toBe('en')
  })

  it.each(['foo.bar', '', 'EN'])(
    "throws Next's not-found error for %j instead of returning an unvalidated string",
    (raw) => {
      let caught: unknown
      try {
        parseLocale(raw, routing)
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(Error)
      const digest = (caught as { digest?: unknown }).digest
      expect(typeof digest).toBe('string')
      expect(digest as string).toMatch(/^NEXT_HTTP_ERROR_FALLBACK;404/)
    },
  )
})

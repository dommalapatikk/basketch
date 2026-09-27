import { describe, expect, it } from 'vitest'

import { localeFromPathname } from './locale-from-pathname'

// regression 2026-09-25: 404 served global-error (500) — T5
//
// global-not-found.tsx must stay fully static (no headers()/cookies()), so a
// client island derives the visible locale block from window.location.pathname
// alone. This is the pure function behind that island — see
// docs/rca/2026-09-25-tech-lead-404-shows-500.md § "Final plan" step 2.

const routing = { locales: ['de', 'en'], defaultLocale: 'de' } as const

describe('localeFromPathname', () => {
  it.each([
    ['/en', 'en'],
    ['/en/x', 'en'],
  ])('%s gives en', (pathname, expected) => {
    expect(localeFromPathname(pathname, routing)).toBe(expected)
  })

  it.each([
    '/',
    '/de/x',
    '/does-not-exist',
    '/english',
    '/EN/x',
  ])('%s gives the default locale (de) — guards against a naive prefix match', (pathname) => {
    expect(localeFromPathname(pathname, routing)).toBe('de')
  })

  it('derives its answer from routing.locales, not a second hand-typed list', () => {
    const frRouting = { locales: ['fr', 'it'], defaultLocale: 'fr' } as const
    expect(localeFromPathname('/it/x', frRouting)).toBe('it')
    // 'en' is not in this routing's locale list, so it falls back to ITS default.
    expect(localeFromPathname('/en/x', frRouting)).toBe('fr')
  })

  it('reads the pathname only — a stray query string is not misread as a locale segment', () => {
    expect(localeFromPathname('/en?foo=bar', routing)).toBe('en')
    expect(localeFromPathname('/?foo=bar', routing)).toBe('de')
  })
})

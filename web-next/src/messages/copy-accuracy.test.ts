import { describe, expect, it } from 'vitest'

import { STORE_KEYS } from '@/lib/store-tokens'

import de from './de.json' with { type: 'json' }
import en from './en.json' with { type: 'json' }
import fr from './fr.json' with { type: 'json' }
import itLocale from './it.json' with { type: 'json' }

/**
 * Design spec `docs/design/2026-09-25-data-source-copy-rework.md` §4 —
 * "acceptance criteria + tests the Builder should write first (TDD)".
 *
 * These read the raw locale JSON (not rendered components), so they fail
 * immediately against the pre-rework content — the live site's copy claimed
 * "All deal data comes from aktionis.ch", when in truth six of seven
 * retailers are collected direct from the retailer and only Coop still goes
 * through aktionis.ch (coop.ch blocks automated access).
 *
 * Every test is named after the specific defect it prevents (CLAUDE.md TDD
 * rule), not "test data sources copy".
 */

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

function leafStrings(obj: JsonValue, prefix = ''): Array<{ path: string; value: string }> {
  if (typeof obj === 'string') return [{ path: prefix, value: obj }]
  if (obj === null || typeof obj !== 'object') return []
  if (Array.isArray(obj)) {
    return obj.flatMap((v, i) => leafStrings(v, `${prefix}[${i}]`))
  }
  return Object.entries(obj).flatMap(([k, v]) => leafStrings(v, prefix ? `${prefix}.${k}` : k))
}

const LOCALES: Record<string, JsonValue> = {
  en: en as JsonValue,
  de: de as JsonValue,
  fr: fr as JsonValue,
  it: itLocale as JsonValue,
}

// The only place "aktionis" may legitimately appear: Coop's own source
// description, or a combined "N retailers / Coop via aktionis" line. A path
// is allowlisted by name (data_sources.source_coop) or by content pattern
// (mentions Coop or a retailer count alongside aktionis).
function isCoopScopedAktionisMention(path: string, value: string): boolean {
  if (/source_coop$/i.test(path)) return true
  const mentionsCoop = /coop/i.test(value)
  const mentionsCountOrMajority = /\b7\b|seven|sieben|sept|sette/i.test(value)
  return mentionsCoop || mentionsCountOrMajority
}

describe('does not claim aktionis.ch as the only source', () => {
  it('no locale string says all/every deal data comes from aktionis', () => {
    for (const [locale, messages] of Object.entries(LOCALES)) {
      const joined = leafStrings(messages)
        .map((l) => l.value)
        .join(' \n ')
      expect(joined, `${locale}.json contains an "all data from aktionis" claim`).not.toMatch(
        /all deal data comes from aktionis|alle aktionsdaten stammen von aktionis/i,
      )
    }
  })

  it('every mention of aktionis anywhere in any rendered locale names Coop or the multi-retailer split', () => {
    for (const [locale, messages] of Object.entries(LOCALES)) {
      const offenders = leafStrings(messages)
        .filter((l) => /aktionis/i.test(l.value))
        .filter((l) => !isCoopScopedAktionisMention(l.path, l.value))
      expect(
        offenders,
        `${locale}.json: "aktionis" mentioned without Coop/retailer-count context:\n${offenders
          .map((o) => `${o.path}: ${o.value}`)
          .join('\n')}`,
      ).toEqual([])
    }
  })
})

describe('does not claim aktionis.ch provenance since 2006', () => {
  it('no locale string claims a 2006 provenance for aktionis', () => {
    for (const [locale, messages] of Object.entries(LOCALES)) {
      const joined = leafStrings(messages)
        .map((l) => l.value)
        .join(' \n ')
      expect(joined, `${locale}.json claims "since 2006"`).not.toMatch(/since 2006|seit 2006/i)
    }
  })
})

describe('does not claim automatic per-item cheapest-store routing', () => {
  it('no locale string (other than the 1-word "Cheapest" tag) claims basketch routes items to the cheapest store', () => {
    for (const [locale, messages] of Object.entries(LOCALES)) {
      const offenders = leafStrings(messages)
        .filter((l) => l.path !== 'deals.cheapest')
        .filter((l) =>
          /route.*cheapest store|cheapest store.*routing|we route each item/i.test(l.value),
        )
      expect(
        offenders,
        `${locale}.json claims per-item cheapest-store routing:\n${offenders.map((o) => o.path).join('\n')}`,
      ).toEqual([])
    }
  })
})

describe('does not promise the unshipped "track regular items" or email-for-list feature', () => {
  it('no locale string promises tracking regular items for a personal comparison', () => {
    for (const [locale, messages] of Object.entries(LOCALES)) {
      const joined = leafStrings(messages)
        .map((l) => l.value)
        .join(' \n ')
      expect(joined, `${locale}.json promises "track your regular items"`).not.toMatch(
        /track your regular items|verfolge deine üblichen artikel/i,
      )
    }
  })

  it('about.privacy.bullet3 does not tie e-mail to the list (no e-mail-for-list feature is live)', () => {
    for (const [locale, messages] of Object.entries(LOCALES)) {
      const about = (messages as { about?: { privacy?: { bullet3?: string } } }).about
      const bullet3 = about?.privacy?.bullet3
      if (bullet3 === undefined) continue // fr/it have no `about` namespace yet — not live
      expect(bullet3, `${locale}.json about.privacy.bullet3 still mentions e-mail`).not.toMatch(
        /e-?mail/i,
      )
    }
  })
})

describe('footer and homepage strip never name aktionis.ch as the sole source', () => {
  it('footer.source omits aktionis entirely, or also names the 7-store / Coop split', () => {
    for (const [locale, messages] of Object.entries(LOCALES)) {
      const source = (messages as { footer?: { source?: string } }).footer?.source
      expect(source, `${locale}.json missing footer.source`).toBeTruthy()
      if (source && /aktionis/i.test(source)) {
        expect(source, `${locale}.json footer.source names only aktionis.ch`).toMatch(/\b7\b|coop/i)
      }
    }
  })

  it('methodology.step1_d (en/de — the only rendered locales) omits aktionis entirely, or also names the 7-store / Coop split', () => {
    for (const locale of ['en', 'de'] as const) {
      const step1d = LOCALES[locale] as { methodology?: { step1_d?: string } }
      const value = step1d.methodology?.step1_d
      expect(value, `${locale}.json missing methodology.step1_d`).toBeTruthy()
      if (value && /aktionis/i.test(value)) {
        expect(value, `${locale}.json methodology.step1_d names only aktionis.ch`).toMatch(
          /\b7\b|coop/i,
        )
      }
    }
  })
})

describe('per-retailer source list is complete', () => {
  it('about.data_sources.source_<store> exists, is non-empty, in both en.json and de.json for every STORE_BRAND key', () => {
    for (const locale of ['en', 'de'] as const) {
      const messages = LOCALES[locale] as {
        about?: { data_sources?: Record<string, string> }
      }
      const dataSources = messages.about?.data_sources ?? {}
      for (const store of STORE_KEYS) {
        const key = `source_${store}`
        expect(
          dataSources[key],
          `${locale}.json about.data_sources.${key} missing or empty`,
        ).toBeTruthy()
      }
    }
  })

  it('about.data_sources.stores_label is removed (redundant once the per-retailer list exists)', () => {
    for (const locale of ['en', 'de'] as const) {
      const messages = LOCALES[locale] as {
        about?: { data_sources?: Record<string, string> }
      }
      expect(messages.about?.data_sources?.stores_label).toBeUndefined()
    }
  })
})

describe('share_verdict.share_text names more than a two-store comparison', () => {
  it('does not present the share text as a Migros-vs-Coop-only comparison', () => {
    for (const locale of ['en', 'de'] as const) {
      const messages = LOCALES[locale] as { share_verdict?: { share_text?: string } }
      const text = messages.share_verdict?.share_text
      expect(text, `${locale}.json missing share_verdict.share_text`).toBeTruthy()
      expect(text, `${locale}.json share_text still frames Migros vs Coop only`).not.toMatch(
        /Migros.*Coop|Migros vs Coop/i,
      )
    }
  })
})

describe('locale key parity holds after this rework (no orphaned key left in one file only)', () => {
  it('en.json and de.json expose the same key set', () => {
    function leafPaths(obj: JsonValue, prefix = ''): string[] {
      if (obj === null || typeof obj !== 'object') return [prefix]
      if (Array.isArray(obj)) return obj.flatMap((v, i) => leafPaths(v, `${prefix}[${i}]`))
      return Object.entries(obj).flatMap(([k, v]) => leafPaths(v, prefix ? `${prefix}.${k}` : k))
    }
    const enPaths = new Set(leafPaths(en as JsonValue))
    const dePaths = new Set(leafPaths(de as JsonValue))
    const missingInEn = [...dePaths].filter((p) => !enPaths.has(p))
    const missingInDe = [...enPaths].filter((p) => !dePaths.has(p))
    expect(missingInEn, `Keys in de.json missing from en.json:\n${missingInEn.join('\n')}`).toEqual(
      [],
    )
    expect(missingInDe, `Keys in en.json missing from de.json:\n${missingInDe.join('\n')}`).toEqual(
      [],
    )
  })
})

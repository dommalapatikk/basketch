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
// description (allowlisted by key name), or a line that explicitly names
// Coop alongside aktionis (e.g. "Data from 7 Swiss retailers — Coop via
// aktionis.ch"). A retailer-count word ("7", "seven") is NOT sufficient on
// its own — code review 2026-09-25 (S-3) found "All 7 stores: data from
// aktionis.ch" slipped past a count-only allowlist, and that sentence is
// exactly the sole-source claim this suite exists to catch. "Coop" must be
// named, with a word boundary so "cooperation" etc. cannot match by accident.
function isCoopScopedAktionisMention(path: string, value: string): boolean {
  if (/source_coop$/i.test(path)) return true
  return /\bcoop\b/i.test(value)
}

// Independent of the allowlist above: no string may ever say "all"/"every"
// (or the DE/FR/IT equivalents) within ~30 characters of "aktionis", even if
// it also happens to mention Coop elsewhere in the same sentence. Defense in
// depth for the same S-3 finding.
const CLAIMS_ALL_DATA_IS_AKTIONIS =
  /(all|alle|jede[rs]?|every|tout(e|es)?|tutt[eoi])\W{0,30}aktionis/i

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

  it('every mention of aktionis anywhere in any rendered locale explicitly names Coop', () => {
    for (const [locale, messages] of Object.entries(LOCALES)) {
      const offenders = leafStrings(messages)
        .filter((l) => /aktionis/i.test(l.value))
        .filter((l) => !isCoopScopedAktionisMention(l.path, l.value))
      expect(
        offenders,
        `${locale}.json: "aktionis" mentioned without naming Coop:\n${offenders
          .map((o) => `${o.path}: ${o.value}`)
          .join('\n')}`,
      ).toEqual([])
    }
  })

  it('no locale string frames aktionis as "all"/"every" retailer\'s source, even one that also mentions Coop', () => {
    for (const [locale, messages] of Object.entries(LOCALES)) {
      const offenders = leafStrings(messages).filter((l) =>
        CLAIMS_ALL_DATA_IS_AKTIONIS.test(l.value),
      )
      expect(
        offenders,
        `${locale}.json frames aktionis as the source for "all"/"every" retailer:\n${offenders
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

describe('does not claim the AI judge checks every answer (code review M-1)', () => {
  // Evidence (review §M-1): `judgeMayRun` can be false for the whole run (no
  // API key / no credit ceiling), a judge call can fail or be rate-limited
  // (`port-guards.ts` -> verdict: 'unavailable'), cold-start sampling can
  // skip an item (`judgeSampleRate < 1`), or the escalation budget can run
  // out — in all four cases the product ships classified but UNFLAGGED, not
  // checked and not marked. "A second AI checking every answer" is false.
  it('no locale string claims every answer is checked by a second AI', () => {
    for (const locale of ['en', 'de'] as const) {
      const joined = leafStrings(LOCALES[locale])
        .map((l) => l.value)
        .join(' \n ')
      expect(joined, `${locale}.json claims the judge checks every answer`).not.toMatch(
        /checking every answer|prüft jede Antwort/i,
      )
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

  it('about.privacy.bullet3 exists for en/de and does not tie e-mail to the list (no e-mail-for-list feature is live)', () => {
    // fr/it have no `about` namespace at all yet (not routed — see spec §2
    // "fr / it — not live") so they are skipped entirely, not just an absent
    // bullet3. en/de MUST have the key: silently deleting it here would pass
    // unnoticed under a broader "skip if undefined" check (review N-3).
    const LOCALES_WITH_ABOUT = ['en', 'de'] as const
    for (const locale of LOCALES_WITH_ABOUT) {
      const bullet3 = (LOCALES[locale] as { about?: { privacy?: { bullet3?: string } } }).about
        ?.privacy?.bullet3
      expect(bullet3, `${locale}.json about.privacy.bullet3 is missing`).toBeTruthy()
      expect(bullet3, `${locale}.json about.privacy.bullet3 still mentions e-mail`).not.toMatch(
        /e-?mail/i,
      )
    }
  })
})

describe('does not restore the retired "refreshed weekly" / "no scraping" freshness note (code review S-2)', () => {
  // Fact sheet §5a item 4: runs are Mon/Tue/Thu (not weekly), and basketch
  // does collect automatically from public pages/flyers (it just never
  // circumvents a block) — "no scraping" denies that. Mutation proof (S-2)
  // showed the pre-fix suite let this stale sentence back in unnoticed.
  it('no locale string reintroduces "refreshed weekly" or "no scraping"', () => {
    for (const [locale, messages] of Object.entries(LOCALES)) {
      const joined = leafStrings(messages)
        .map((l) => l.value)
        .join(' \n ')
      expect(
        joined,
        `${locale}.json reintroduces the retired "refreshed weekly"/"no scraping" claim`,
      ).not.toMatch(/refreshed weekly|wöchentlich aktualisiert|no scraping|kein scraping/i)
    }
  })
})

describe('the stale-data banner is attributed to the home page, not the deals page (code review M-2)', () => {
  // Evidence: `StaleBanner` is rendered only in `app/[locale]/page.tsx`
  // (home). `grep -rln StaleBanner app components` finds nothing under
  // `deals/`; `DealsClient.tsx` shows only a neutral "Updated {date}" line.
  it('about.data_sources.note does not attribute the freshness banner to the deals page', () => {
    for (const locale of ['en', 'de'] as const) {
      const note = (LOCALES[locale] as { about?: { data_sources?: { note?: string } } }).about
        ?.data_sources?.note
      expect(note, `${locale}.json missing about.data_sources.note`).toBeTruthy()
      expect(
        note,
        `${locale}.json about.data_sources.note wrongly places the banner on the deals page`,
      ).not.toMatch(/banner.*deals page|hinweis.*aktionen-seite/i)
    }
  })
})

describe('footer and homepage strip never name aktionis.ch as the sole source', () => {
  // S-3: the count-word alternative (`\b7\b`) let "All 7 stores: data from
  // aktionis.ch" pass — that sentence names a count but is still a
  // sole-source claim. Require an explicit, word-bounded "Coop" instead.
  it('footer.source omits aktionis entirely, or also explicitly names Coop', () => {
    for (const [locale, messages] of Object.entries(LOCALES)) {
      const source = (messages as { footer?: { source?: string } }).footer?.source
      expect(source, `${locale}.json missing footer.source`).toBeTruthy()
      if (source && /aktionis/i.test(source)) {
        expect(source, `${locale}.json footer.source names aktionis without Coop`).toMatch(
          /\bcoop\b/i,
        )
      }
      expect(
        source,
        `${locale}.json footer.source overstates aktionis as "all"/"every"`,
      ).not.toMatch(CLAIMS_ALL_DATA_IS_AKTIONIS)
    }
  })

  it('methodology.step1_d (en/de — the only rendered locales) omits aktionis entirely, or also explicitly names Coop', () => {
    for (const locale of ['en', 'de'] as const) {
      const step1d = LOCALES[locale] as { methodology?: { step1_d?: string } }
      const value = step1d.methodology?.step1_d
      expect(value, `${locale}.json missing methodology.step1_d`).toBeTruthy()
      if (value && /aktionis/i.test(value)) {
        expect(value, `${locale}.json methodology.step1_d names aktionis without Coop`).toMatch(
          /\bcoop\b/i,
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

// Key-parity (en.json <-> de.json) is already covered by
// `messages/messages.test.ts` ("i18n key parity") — spec §4.8 said "extend,
// don't duplicate" (review N-2), so it is not repeated here.

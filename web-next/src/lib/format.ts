import { isMemberOnly, type PriceBasis, programmeOf } from './domain/price-basis'
import { isMultiBuy } from './domain/quantity-requirement'

/**
 * "Nur mit Lidl Plus" / "Lidl Plus members only" — the one place this legally
 * required label (CLAUDE.md; Art. 3(1)(e) UWG) is worded, so the deals list,
 * the shopping list drawer and the shared WhatsApp/email text cannot drift
 * into saying three slightly different things about the same fact. Returns
 * null for an open price, and for `undefined` — a `ListItem` persisted
 * before this field existed (code review of 9525601, BLOCKER) has no
 * `priceBasis` at all, and that must read as "nothing to say", never throw.
 */
export function formatMemberPriceLabel(
  priceBasis: PriceBasis | undefined,
  locale: string,
): string | null {
  if (!isMemberOnly(priceBasis)) return null
  // isMemberOnly guarantees a programme name: createPriceBasis refuses to
  // build a member-only PriceBasis without one (the LIDL rule).
  const programme = programmeOf(priceBasis)
  return locale === 'de' ? `Nur mit ${programme}` : `${programme} members only`
}

// "Ab 2 Stück" / "From 2 items" — Migros's own printed wording, translated
// (WP-C4, D2, TP-7a). Kept here, not in messages/*.json, for the identical
// reason formatMemberPriceLabel is: it must read correctly from THREE call
// sites, only two of which are React components with access to next-intl's
// t() — lib/share.ts's groupNote (the shared WhatsApp/email text) is plain
// code, not a component. The same wording is ALSO carried in
// messages/*.json's deals.from_n_items — not imported from here, because a
// module reached from 'use client' components (DealCard's callers) would
// then ship all four locales' strings to every visitor regardless of which
// one they use (CLAUDE.md: JS is the most expensive resource byte-for-byte).
// format.test.ts pins the two copies together so a drift fails a test rather
// than surfacing as a wrong label in production.
const MIN_QUANTITY_TEMPLATE: Record<string, string> = {
  en: 'From {count} items',
  de: 'Ab {count} Stück',
  fr: 'Dès {count} articles',
  it: 'Da {count} articoli',
}

/**
 * The single wording source for the "from N items" label, beside
 * `formatMemberPriceLabel` — the same "one place this is worded" reasoning,
 * for the same legal requirement (Art. 3(1)(e) UWG: a conditional price must
 * never be shown without stating its condition).
 *
 * Returns null for the ordinary single-item price (`isMultiBuy` is false for
 * both `null` — no condition printed — and `undefined` — a `ListItem` saved
 * before this field existed). Never returns a label for a count below 2:
 * "ab 1 Stück" is not a real printed form, it is a mis-parse (the WP-C4 ADR),
 * so there is nothing to claim less about — there is simply nothing to say.
 */
export function formatMinQuantityLabel(
  minQuantity: number | null | undefined,
  locale: string,
): string | null {
  if (!isMultiBuy(minQuantity)) return null
  const template = MIN_QUANTITY_TEMPLATE[locale] ?? MIN_QUANTITY_TEMPLATE.en
  return template.replace('{count}', String(minQuantity))
}

// Locale-aware short date used in the landing kicker and stale banner.
// Falls back to the YYYY-MM-DD slice on parse failure (defensive — Intl can throw on bad strings).
export function formatShortDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}

// A deal that has not started yet is shown with a "from <weekday> <date>"
// label (docs/rca/2026-09-15-final-plan.md #10) rather than hidden — hiding
// it would be its own kind of inaccuracy. `valid_from` is a date-only column
// (no time component), so there is no timezone ambiguity in WHICH day it
// names; the only thing `Europe/Zurich` buys here is that day/month/weekday
// are read consistently with each other regardless of which timezone the
// rendering server happens to run in. Always day.month order (Swiss
// convention), independent of locale — only the weekday word translates.
export function formatValidFromShort(iso: string, locale: string): string {
  try {
    const date = new Date(`${iso}T00:00:00Z`)
    if (Number.isNaN(date.getTime())) throw new Error('unparseable date')
    const parts = new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'numeric',
      timeZone: 'Europe/Zurich',
    }).formatToParts(date)
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
    return `${part('weekday')} ${part('day')}.${part('month')}.`
  } catch {
    return iso.slice(0, 10)
  }
}

/**
 * Split an already-translated "From {date}" sentence around the date inside
 * it, so only the date goes in `<time dateTime>` (code review NEW-4 — the
 * element used to wrap "From Thu 17.9." whole, naming more than the date).
 *
 * It splits the RENDERED sentence rather than assuming a position, so each
 * locale keeps its own word order and a translation may put the date first,
 * last or in the middle. Returns null when the date does not appear verbatim
 * — a translator could reformat it — and the caller then renders the label
 * plain rather than losing it.
 */
export function splitAroundDate(
  label: string,
  date: string,
): { before: string; after: string } | null {
  if (date === '') return null
  const at = label.indexOf(date)
  if (at === -1) return null
  return { before: label.slice(0, at), after: label.slice(at + date.length) }
}

// True when the snapshot is older than the weekly cadence + a small buffer.
// Pipeline runs Mon/Tue/Thu — anything older than 9 days is definitely stale.
export function isStale(updatedAtIso: string, now: Date = new Date()): boolean {
  const updated = new Date(updatedAtIso).getTime()
  if (Number.isNaN(updated)) return false
  const ageMs = now.getTime() - updated
  return ageMs > 9 * 24 * 60 * 60 * 1000
}

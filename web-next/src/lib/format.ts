import { isMemberOnly, type PriceBasis, programmeOf } from './domain/price-basis'

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

// True when the snapshot is older than the weekly cadence + a small buffer.
// Pipeline runs Mon/Tue/Thu — anything older than 9 days is definitely stale.
export function isStale(updatedAtIso: string, now: Date = new Date()): boolean {
  const updated = new Date(updatedAtIso).getTime()
  if (Number.isNaN(updated)) return false
  const ageMs = now.getTime() - updated
  return ageMs > 9 * 24 * 60 * 60 * 1000
}

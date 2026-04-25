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

// True when the snapshot is older than the weekly cadence + a small buffer.
// Pipeline runs Mon/Tue/Thu — anything older than 9 days is definitely stale.
export function isStale(updatedAtIso: string, now: Date = new Date()): boolean {
  const updated = new Date(updatedAtIso).getTime()
  if (Number.isNaN(updated)) return false
  const ageMs = now.getTime() - updated
  return ageMs > 9 * 24 * 60 * 60 * 1000
}

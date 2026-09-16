import { programmeOf } from '@/lib/domain/price-basis'
import { startsAfterToday, todayInZurich } from '@/lib/domain/validity'
import { formatMemberPriceLabel } from '@/lib/format'
import { STORE_BRAND, type StoreKey } from '@/lib/store-tokens'
import type { ListItem } from '@/stores/list-store'

// Group list items by store and sum prices — drives both the in-drawer
// "where to buy" panel and the WhatsApp/email share message.
export type StoreGroup = { store: StoreKey; items: ListItem[]; total: number }

export function groupByStore(items: ListItem[]): StoreGroup[] {
  const map = new Map<StoreKey, StoreGroup>()
  for (const it of items) {
    const g = map.get(it.store) ?? { store: it.store, items: [], total: 0 }
    g.items.push(it)
    g.total += Number.isFinite(it.salePrice) ? it.salePrice : 0
    map.set(it.store, g)
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total)
}

const formatCHF = (value: number, locale = 'de-CH') =>
  new Intl.NumberFormat(locale, {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)

/**
 * "(1 × Lidl Plus members only)" / "(2 not started yet)" appended to a store's line — the
 * recipient of a shared WhatsApp/email message never opens basketch, so a
 * price shown there without this note is exactly the unlabelled member price
 * Art. 3(1)(e) UWG and CLAUDE.md forbid. CLAUDE.md names the requirement
 * precisely — "always label member-only prices (Lidl Plus, Supercard,
 * Cumulus)" — so the programme is named, not just counted; an earlier
 * version of this wrote "(1 member price)" and named nobody, the exact
 * fallback `formatMemberPriceLabel`'s own doc comment warns against.
 *
 * The count matters as much as the name (code review NEW-1): a version that
 * named the programme but dropped the count read "Coop: 4 items · CHF 12.00
 * (Supercard members only)" as if all four items needed Supercard, when only
 * one did. "N × programme" keeps the same shape as "N not started yet" —
 * both say exactly how many of the group's items the note is about, never
 * implying it is all of them.
 *
 * Says nothing when every item in the group is open-priced and already in
 * effect — the common case stays as short as it always was.
 */
function groupNote(items: ListItem[], locale: string, today: string): string | null {
  const programmeCounts = new Map<string, number>()
  for (const it of items) {
    const programme = programmeOf(it.priceBasis)
    if (programme) programmeCounts.set(programme, (programmeCounts.get(programme) ?? 0) + 1)
  }
  const notStarted = items.filter((it) => startsAfterToday(it, today)).length

  const parts: string[] = []
  for (const [programme, count] of programmeCounts) {
    // The full label, not the bare programme name (code review of db1dd78):
    // "1 × Supercard" names who but never says the price is restricted, and
    // this is the one surface whose reader cannot see the card that does.
    // formatMemberPriceLabel stays the single place that wording lives.
    const label = formatMemberPriceLabel({ kind: 'member-only', programme }, locale)
    parts.push(`${count} × ${label}`)
  }
  if (notStarted > 0) {
    parts.push(
      locale === 'de' ? `${notStarted} noch nicht gestartet` : `${notStarted} not started yet`,
    )
  }
  return parts.length > 0 ? `(${parts.join(', ')})` : null
}

// Plain-text share body for WhatsApp / Email / clipboard. Keep it short — most
// chat apps truncate previews after ~250 chars.
export function buildShareText({
  items,
  shareUrl,
  locale,
  today = todayInZurich(),
}: {
  items: ListItem[]
  shareUrl: string
  locale: string
  /** Injectable for tests; defaults to the real Zurich date. */
  today?: string
}): string {
  if (items.length === 0) return shareUrl
  const groups = groupByStore(items)
  const total = groups.reduce((acc, g) => acc + g.total, 0)
  const lines = groups.map((g) => {
    const base = `• ${STORE_BRAND[g.store].label}: ${g.items.length} ${
      g.items.length === 1
        ? locale === 'de'
          ? 'Artikel'
          : 'item'
        : locale === 'de'
          ? 'Artikel'
          : 'items'
    } · CHF ${formatCHF(g.total, locale === 'de' ? 'de-CH' : 'en-CH')}`
    const note = groupNote(g.items, locale, today)
    return note ? `${base} ${note}` : base
  })
  const header = locale === 'de' ? 'Meine basketch-Liste:' : 'My basketch list:'
  const totalLine =
    locale === 'de'
      ? `Gesamt CHF ${formatCHF(total, 'de-CH')}`
      : `Total CHF ${formatCHF(total, 'en-CH')}`
  return `${header}\n${lines.join('\n')}\n${totalLine}\n\n${shareUrl}`
}

export function buildWhatsAppHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

export function buildMailtoHref({ text, locale }: { text: string; locale: string }): string {
  const subject = locale === 'de' ? 'Meine basketch-Liste' : 'My basketch list'
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`
}

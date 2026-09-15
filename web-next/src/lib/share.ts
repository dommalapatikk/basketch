import type { ListItem } from '@/stores/list-store'
import { isMemberOnly } from '@/lib/domain/price-basis'
import { startsAfterToday, todayInZurich } from '@/lib/domain/validity'
import { STORE_BRAND, type StoreKey } from '@/lib/store-tokens'

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
 * "(1 member price)" / "(1 not started yet)" appended to a store's line —
 * the recipient of a shared WhatsApp/email message never opens basketch, so
 * a price shown there without this note is exactly the unlabelled member
 * price Art. 3(1)(e) UWG and CLAUDE.md forbid. Says nothing when every item
 * in the group is open-priced and already in effect — the common case stays
 * as short as it always was.
 */
function groupNote(items: ListItem[], locale: string, today: string): string | null {
  const memberOnly = items.filter((it) => isMemberOnly(it.priceBasis)).length
  const notStarted = items.filter((it) => startsAfterToday(it, today)).length
  const parts: string[] = []
  if (memberOnly > 0) {
    parts.push(
      locale === 'de'
        ? `${memberOnly} Mitgliederpreis${memberOnly === 1 ? '' : 'e'}`
        : `${memberOnly} member price${memberOnly === 1 ? '' : 's'}`,
    )
  }
  if (notStarted > 0) {
    parts.push(locale === 'de' ? `${notStarted} noch nicht gestartet` : `${notStarted} not started yet`)
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

export function buildMailtoHref({
  text,
  locale,
}: {
  text: string
  locale: string
}): string {
  const subject = locale === 'de' ? 'Meine basketch-Liste' : 'My basketch list'
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`
}

import type { ListItem } from '@/stores/list-store'
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

// Plain-text share body for WhatsApp / Email / clipboard. Keep it short — most
// chat apps truncate previews after ~250 chars.
export function buildShareText({
  items,
  shareUrl,
  locale,
}: {
  items: ListItem[]
  shareUrl: string
  locale: string
}): string {
  if (items.length === 0) return shareUrl
  const groups = groupByStore(items)
  const total = groups.reduce((acc, g) => acc + g.total, 0)
  const lines = groups.map(
    (g) =>
      `• ${STORE_BRAND[g.store].label}: ${g.items.length} ${
        g.items.length === 1
          ? locale === 'de'
            ? 'Artikel'
            : 'item'
          : locale === 'de'
            ? 'Artikel'
            : 'items'
      } · CHF ${formatCHF(g.total, locale === 'de' ? 'de-CH' : 'en-CH')}`,
  )
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

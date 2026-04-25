import type { ListItem } from '@/stores/list-store'

// Spec §13.2 URL contract for the list:  /list?items=abc,def,ghi
// IDs travel as a comma-separated, URL-encoded string. The recipient's client
// looks each ID up in this week's snapshot to rebuild the list state.
export function serializeListIds(items: Pick<ListItem, 'id'>[]): string {
  if (items.length === 0) return ''
  return items.map((i) => encodeURIComponent(i.id)).join(',')
}

export function parseListIds(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => decodeURIComponent(s.trim()))
    .filter(Boolean)
}

// Build the absolute share URL the user paste-shares with friends.
// Origin defaults to the current window when called from the client.
export function buildShareUrl({
  origin,
  locale,
  items,
}: {
  origin: string
  locale: string
  items: Pick<ListItem, 'id'>[]
}): string {
  const ids = serializeListIds(items)
  const path = locale === 'de' ? '/list' : `/${locale}/list`
  const u = new URL(`${origin}${path}`)
  if (ids) u.searchParams.set('items', ids)
  return u.toString()
}

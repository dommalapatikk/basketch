import { setRequestLocale } from 'next-intl/server'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { parseListIds } from '@/lib/share-url'
import { getWeeklySnapshot } from '@/server/data/snapshot'
import type { ListItem } from '@/stores/list-store'

import { HydrateAndRedirect } from '@/components/list/HydrateAndRedirect'

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

// /list?items=abc,def — recipient lands here from a shared link. We resolve
// the IDs against the current snapshot, seed the Zustand store, open the
// drawer, and bounce them to /deals so they keep browsing. If a given ID is
// no longer in this week's data we silently drop it (the user still sees
// the items that ARE current rather than a hard error).
export default async function ListSharePage({ params, searchParams }: Props) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <Suspense fallback={<HydratingFallback locale={locale} />}>
      <ListShareBody locale={locale} searchParamsP={searchParams} />
    </Suspense>
  )
}

async function ListShareBody({
  locale,
  searchParamsP,
}: {
  locale: string
  searchParamsP: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParamsP
  const itemsRaw = typeof sp.items === 'string' ? sp.items : Array.isArray(sp.items) ? sp.items[0] : ''
  const ids = parseListIds(itemsRaw ?? null)

  const snapshot = await getWeeklySnapshot({ locale })
  const byId = new Map(snapshot.deals.map((d) => [d.id, d]))

  const items: ListItem[] = ids
    .map((id) => byId.get(id))
    .filter((d): d is NonNullable<typeof d> => Boolean(d))
    .map((d) => ({
      id: d.id,
      store: d.store,
      productName: d.productName,
      category: d.category,
      salePrice: d.salePrice,
      imageUrl: d.imageUrl,
      sourceUrl: d.sourceUrl,
    }))

  const t = await getTranslations({ locale, namespace: 'list' })

  return (
    <section className="mx-auto flex max-w-[600px] flex-col items-center gap-4 px-4 py-24 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--color-ink-3)]">
        {t('title')}
      </p>
      <h1 className="text-2xl font-semibold text-[var(--color-ink)]">
        {t('split_summary', { items: items.length, stores: new Set(items.map((i) => i.store)).size })}
      </h1>
      <HydrateAndRedirect items={items} />
    </section>
  )
}

function HydratingFallback({ locale: _locale }: { locale: string }) {
  return (
    <section className="mx-auto max-w-[600px] px-4 py-24">
      <div className="h-6 w-48 animate-pulse rounded-[var(--radius-sm)] bg-[var(--color-line)]" />
    </section>
  )
}

import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { parseFilters } from '@/lib/filters'
import { getWeeklySnapshot } from '@/server/data/snapshot'

import { DealsClient } from './DealsClient'

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'deals' })
  const isDe = locale === 'de'
  return {
    title: `${t('headline')} · basketch`,
    description: isDe
      ? 'Wochenangebote von Migros, Coop, LIDL, ALDI, Denner, SPAR und Volg im Vergleich.'
      : 'This week’s promotions from Migros, Coop, LIDL, ALDI, Denner, SPAR and Volg, side by side.',
    alternates: { canonical: isDe ? '/deals' : `/${locale}/deals` },
  }
}

// Patch C HR10 (proper fix): server fetches the snapshot once (still ISR-cached
// via getWeeklySnapshot's 'use cache' directive), then hands the whole thing
// off to DealsClient. All subsequent filter clicks are pure browser work — no
// RSC roundtrip, no server re-render. The page shell prerenders statically;
// the snapshot + searchParams resolution lives inside Suspense per Cache
// Components requirements.
export default async function DealsPage({ params, searchParams }: Props) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <section className="mx-auto max-w-[1240px] px-4 py-10 md:px-10 md:py-12">
      <Suspense fallback={<BodySkeleton />}>
        <DealsBody locale={locale} searchParamsP={searchParams} />
      </Suspense>
    </section>
  )
}

async function DealsBody({
  locale,
  searchParamsP,
}: {
  locale: string
  searchParamsP: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParamsP
  const initialFilters = parseFilters(sp)
  const snapshot = await getWeeklySnapshot({ locale })

  return (
    <DealsClient
      snapshot={snapshot}
      initialFilters={initialFilters}
      locale={locale}
    />
  )
}

function BodySkeleton() {
  return (
    <div>
      <header className="mb-8">
        <div className="h-9 w-72 rounded-[var(--radius-sm)] bg-[var(--color-line)]" />
        <div className="mt-2 h-4 w-48 rounded-[var(--radius-sm)] bg-[var(--color-line)]" />
      </header>
      <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
        <aside className="w-full lg:w-[260px] lg:shrink-0">
          <div className="h-4 w-16 rounded-[var(--radius-sm)] bg-[var(--color-line)]" />
          <div className="mt-5 space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-9 rounded-[var(--radius-md)] bg-[var(--color-line)]" />
            ))}
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <div className="h-11 rounded-[var(--radius-md)] bg-[var(--color-line)]" />
          <div className="mt-8 space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[180px] rounded-[var(--radius-lg)] bg-[var(--color-line)]" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

import { setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'

import { CATEGORY_LABELS_DE, CATEGORY_LABELS_EN } from '@/lib/category-rules'
import { getWeeklySnapshot } from '@/server/data/snapshot'

import { CategoryVerdictCard } from '@/components/landing/CategoryVerdictCard'
import { MethodologyStrip } from '@/components/landing/MethodologyStrip'
import { StaleBanner } from '@/components/landing/StaleBanner'
import { VerdictHero } from '@/components/landing/VerdictHero'

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const snapshot = await getWeeklySnapshot({ locale })
  const labels = locale === 'de' ? CATEGORY_LABELS_DE : CATEGORY_LABELS_EN

  return (
    <section className="mx-auto max-w-[1240px] px-4 py-12 md:px-10 md:py-20">
      {/* Suspense around the client island that reads new Date() — required by Cache Components. */}
      <Suspense fallback={null}>
        <StaleBanner updatedAt={snapshot.updatedAt} locale={locale} />
      </Suspense>

      {/* Two-column hero: spec §5.1 — 7fr/5fr above 1024px, stacks below */}
      <div className="grid items-start gap-10 lg:grid-cols-[7fr_5fr] lg:gap-20">
        <VerdictHero snapshot={snapshot} locale={locale} />

        <div className="flex flex-col gap-3">
          {snapshot.categories.map((v) => (
            <CategoryVerdictCard
              key={v.category}
              verdict={v}
              label={labels[v.category as keyof typeof labels] ?? String(v.category)}
            />
          ))}
        </div>
      </div>

      <MethodologyStrip />
    </section>
  )
}

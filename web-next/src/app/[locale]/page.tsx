import { setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'

import { CATEGORY_LABELS_DE, CATEGORY_LABELS_EN } from '@/lib/category-rules'
import { getWeeklySnapshot } from '@/server/data/snapshot'
import { getWorthPickingUpCandidates } from '@/server/data/worth-picking-up'

import { CategoryVerdictCard } from '@/components/landing/CategoryVerdictCard'
import { MethodologyStrip } from '@/components/landing/MethodologyStrip'
import { ShareVerdictButton } from '@/components/landing/ShareVerdictButton'
import { StaleBanner } from '@/components/landing/StaleBanner'
import { V3PreviewSection } from '@/components/landing/V3PreviewSection'
import { VerdictHero } from '@/components/landing/VerdictHero'
import { WorthPickingUpClient } from '@/components/landing/WorthPickingUpClient'

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const snapshot = await getWeeklySnapshot({ locale })
  const labels = locale === 'de' ? CATEGORY_LABELS_DE : CATEGORY_LABELS_EN

  // Surface 3 — Worth Picking Up. Solo project: no email yet, so always
  // cold-start. Section omits itself when N=0 (calm-by-absence per §3.2).
  const wpu = await getWorthPickingUpCandidates({ userEmail: null, locale })

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

      <ShareVerdictButton locale={locale} />

      {wpu.candidates.length > 0 && (
        <div className="mt-8">
          <WorthPickingUpClient mode={wpu.mode} initialCandidates={wpu.candidates} />
        </div>
      )}

      <V3PreviewSection />

      <MethodologyStrip />
    </section>
  )
}

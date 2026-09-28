import { setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'
import { CategoryVerdictCard } from '@/components/landing/CategoryVerdictCard'
import { MethodologyStrip } from '@/components/landing/MethodologyStrip'
import { ShareVerdictButton } from '@/components/landing/ShareVerdictButton'
import { StaleBanner } from '@/components/landing/StaleBanner'
import { VerdictHero } from '@/components/landing/VerdictHero'
import { MidnightGuard } from '@/components/shared/MidnightGuard'
import type { Locale } from '@/i18n/locale-from-pathname'
import { parseLocale } from '@/i18n/parse-locale'
import { routing } from '@/i18n/routing'
import { CATEGORY_LABELS_DE, CATEGORY_LABELS_EN } from '@/lib/category-rules'
import { getWeeklySnapshot } from '@/server/data/snapshot'

// D2, RCA docs/rca/2026-09-27-tech-lead-stale-expired-deals.md §3.1 / §6 and
// docs/rca/2026-09-27-architect-stale-expired-deals.md §6 D2: the homepage
// used to `await getWeeklySnapshot({ locale })` right here, at the page's
// top level — which made the deal count and verdicts part of the static ISR
// shell for `/de` and `/en`, each its own cache entry keyed only by path.
// That shell can outlive the Zurich day boundary by an unbounded amount
// (stale-while-revalidate only regenerates when a request arrives), which is
// how expired Volg deals (valid_to 2026-09-26) were still shown and counted
// on 2026-09-27. `HomeBody` below is the dynamic hole — exactly the pattern
// `/deals` and `/list` already use — so the snapshot is read at request time
// and never baked into the prerendered page.
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale, routing)
  setRequestLocale(locale)

  return (
    <section className="mx-auto max-w-[1240px] px-4 py-12 md:px-10 md:py-20">
      <Suspense fallback={<HomeSkeleton />}>
        <HomeBody locale={locale} />
      </Suspense>

      <MethodologyStrip />
    </section>
  )
}

export async function HomeBody({ locale }: { locale: Locale }) {
  const snapshot = await getWeeklySnapshot({ locale })
  const labels = locale === 'de' ? CATEGORY_LABELS_DE : CATEGORY_LABELS_EN

  return (
    <>
      {/* Suspense around the client island that reads new Date() — required by Cache Components. */}
      <Suspense fallback={null}>
        <StaleBanner
          updatedAt={snapshot.updatedAt}
          locale={locale}
          isDegraded={snapshot.isDegraded}
        />
      </Suspense>

      {/*
        D5 (docs/rca/2026-09-27-architect-stale-expired-deals.md §6 D5):
        a tab left open across a Zurich midnight keeps showing the count and
        verdicts this render produced, with no further server round trip to
        catch it. This is the browser-side guard for that window.
      */}
      <MidnightGuard referenceDay={snapshot.today} />

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

      <ShareVerdictButton locale={locale} today={snapshot.today} />
    </>
  )
}

function HomeSkeleton() {
  return (
    <div>
      <div className="grid items-start gap-10 lg:grid-cols-[7fr_5fr] lg:gap-20">
        <div>
          <div className="h-3 w-40 rounded-[var(--radius-sm)] bg-[var(--color-line)]" />
          <div className="mt-6 h-10 w-full max-w-[520px] rounded-[var(--radius-sm)] bg-[var(--color-line)]" />
          <div className="mt-3 h-10 w-3/4 max-w-[420px] rounded-[var(--radius-sm)] bg-[var(--color-line)]" />
          <div className="mt-6 h-16 w-full max-w-[440px] rounded-[var(--radius-sm)] bg-[var(--color-line)]" />
        </div>
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 rounded-[var(--radius-lg)] bg-[var(--color-line)]" />
          ))}
        </div>
      </div>
      {/*
        N-5, docs/reviews/2026-09-28-review-stale-expired-deals.md: sized to
        ShareVerdictButton's actual rendered height (p-5 padding + title +
        subtitle + the h-11 button row + the preview-card link line, ~172px)
        rather than an arbitrary h-28 (112px) — the mismatch was a small
        layout shift every time this Suspense hole resolved. StaleBanner
        (above, inside HomeBody) is NOT reserved here: it renders nothing on
        every normal page view, so reserving space for it would itself be
        the more common shift.
      */}
      <div className="mt-10 h-[172px] rounded-[var(--radius-lg)] bg-[var(--color-line)]" />
    </div>
  )
}

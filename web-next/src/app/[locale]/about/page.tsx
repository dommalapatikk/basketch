import { useTranslations } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { Metadata } from 'next'

import { siteUrl } from '@/lib/site-url'

const SITE_URL = siteUrl()

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'about' })
  const title = `${t('title')} — basketch`
  const description = t('intro')
  const path = locale === 'de' ? '/about' : `/${locale}/about`
  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    alternates: {
      canonical: path,
      languages: { de: '/about', en: '/en/about' },
    },
    openGraph: {
      title,
      description,
      type: 'website',
      locale: locale === 'de' ? 'de_CH' : 'en_CH',
      url: path,
      siteName: 'basketch',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  }
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  return <AboutContent />
}

function AboutContent() {
  const t = useTranslations('about')

  return (
    <section className="mx-auto max-w-[1240px] px-4 py-12 md:px-10 md:py-20">
      <header className="mb-12 max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-tight text-[var(--color-ink)] md:text-5xl">
          {t('title')}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-[var(--color-ink-2)]">
          {t('intro')}
        </p>
      </header>

      <div className="flex max-w-3xl flex-col gap-12">
        <section aria-labelledby="how-it-works">
          <h2
            id="how-it-works"
            className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]"
          >
            {t('how_it_works.heading')}
          </h2>
          <ol className="mt-5 flex flex-col gap-5">
            {[1, 2, 3].map((step) => (
              <li key={step} className="flex gap-4">
                <span className="font-mono text-sm tabular-nums text-[var(--color-ink-3)]">
                  {String(step).padStart(2, '0')}
                </span>
                <p className="text-base leading-relaxed text-[var(--color-ink-2)]">
                  {t(`how_it_works.step${step}` as
                    | 'how_it_works.step1'
                    | 'how_it_works.step2'
                    | 'how_it_works.step3')}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="data-sources">
          <h2
            id="data-sources"
            className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]"
          >
            {t('data_sources.heading')}
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[var(--color-ink-2)]">
            {t('data_sources.body')}
          </p>
          <p className="mt-3 text-base leading-relaxed text-[var(--color-ink-2)]">
            {t('data_sources.stores_label')}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-3)]">
            {t('data_sources.note')}
          </p>
        </section>

        <section aria-labelledby="what-we-compare">
          <h2
            id="what-we-compare"
            className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]"
          >
            {t('what_we_compare.heading')}
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[var(--color-ink-2)]">
            {t('what_we_compare.body')}
          </p>
        </section>

        <section aria-labelledby="privacy">
          <h2
            id="privacy"
            className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]"
          >
            {t('privacy.heading')}
          </h2>
          <ul className="mt-5 flex flex-col gap-2 text-base leading-relaxed text-[var(--color-ink-2)]">
            <li>{t('privacy.bullet1')}</li>
            <li>{t('privacy.bullet2')}</li>
            <li>{t('privacy.bullet3')}</li>
          </ul>
        </section>

        <section aria-labelledby="contact">
          <h2
            id="contact"
            className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]"
          >
            {t('contact.heading')}
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[var(--color-ink-2)]">
            {t('contact.body')}
          </p>
        </section>
      </div>
    </section>
  )
}

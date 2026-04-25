import { GeistMono } from 'geist/font/mono'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { Inter } from 'next/font/google'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'
import { ListDrawer } from '@/components/list/ListDrawer'
import { routing } from '@/i18n/routing'

import '../globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

import { siteUrl } from '@/lib/site-url'

const SITE_URL = siteUrl()

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const isDe = locale === 'de'
  const title = isDe
    ? 'basketch — Schweizer Wochenangebote im Vergleich'
    : 'basketch — Swiss weekly deals, side by side'
  const description = isDe
    ? 'Migros, Coop, LIDL, Denner, SPAR, Volg, ALDI — die besten Aktionen dieser Woche, Seite an Seite.'
    : 'Migros, Coop, LIDL, Denner, SPAR, Volg, ALDI — this week’s best deals, side by side.'
  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    alternates: {
      canonical: isDe ? '/' : `/${locale}`,
      languages: { de: '/', en: '/en' },
    },
    openGraph: {
      title,
      description,
      type: 'website',
      locale: isDe ? 'de_CH' : 'en_CH',
      url: isDe ? '/' : `/${locale}`,
      siteName: 'basketch',
      images: [
        {
          url: `/card?locale=${locale}`,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`/card?locale=${locale}`],
    },
  }
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  setRequestLocale(locale)

  return (
    <html lang={locale} className={`${inter.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen flex flex-col">
        <NextIntlClientProvider>
          <Header />
          <main id="main-content" className="flex-1">
            {children}
          </main>
          <Footer />
          <ListDrawer locale={locale} />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}

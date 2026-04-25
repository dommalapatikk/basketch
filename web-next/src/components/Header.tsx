import { ShoppingBasket } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'

import { MyListButton } from '@/components/list/MyListButton'

export function Header() {
  const t = useTranslations('nav')
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-md">
      {/* Skip-link — visible only when keyboard-focused. Lands on the <main>
          element which all page bodies wrap in, per spec §9 a11y rules. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-[var(--radius-md)] focus:bg-[var(--color-ink)] focus:px-4 focus:py-2 focus:text-sm focus:text-[var(--color-paper)]"
      >
        {t('skip_to_content')}
      </a>
      <div className="mx-auto flex h-[72px] max-w-[1240px] items-center justify-between px-4 md:px-10">
        <Link
          href="/"
          aria-label="basketch — home"
          className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight"
        >
          <ShoppingBasket size={20} strokeWidth={1.75} aria-hidden />
          basketch
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
          <Link
            href="/deals"
            className="text-sm text-ink-2 transition-colors hover:text-ink"
          >
            {t('deals')}
          </Link>
          <Link
            href="/about"
            className="text-sm text-ink-2 transition-colors hover:text-ink"
          >
            {t('about')}
          </Link>
          <MyListButton variant="header" />
        </nav>
      </div>
    </header>
  )
}

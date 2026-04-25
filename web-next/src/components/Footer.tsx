import { useTranslations } from 'next-intl'

export function Footer() {
  const t = useTranslations('footer')
  return (
    <footer className="border-t border-line py-10">
      <div className="mx-auto max-w-[1240px] px-4 text-xs leading-5 text-ink-3 md:px-10">
        © 2026 basketch · {t('disclaimer')} · {t('source')}
      </div>
    </footer>
  )
}

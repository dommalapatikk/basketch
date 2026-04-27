'use client'

import { Copy, Mail, Share2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

// Share-the-verdict UI for the home page. Uses the existing /card OG image
// (PNG, 1200×630) as the share image. Three actions: WhatsApp, Email, Copy.

type Props = {
  locale: string
}

export function ShareVerdictButton({ locale }: Props) {
  const t = useTranslations('share_verdict')
  const [copied, setCopied] = useState(false)
  const [origin, setOrigin] = useState<string | null>(null)

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(id)
  }, [copied])

  if (!origin) {
    return null
  }

  const homeUrl = `${origin}/${locale === 'de' ? '' : locale}`.replace(/\/$/, '') || origin
  const cardUrl = `${origin}/card`
  const text = t('share_text')

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(`${text}\n${homeUrl}`)}`
  const mailHref = `mailto:?subject=${encodeURIComponent(t('mail_subject'))}&body=${encodeURIComponent(`${text}\n\n${homeUrl}\n\n${cardUrl}`)}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${text}\n${homeUrl}`)
      setCopied(true)
    } catch {
      /* swallow — user can long-press to copy as fallback */
    }
  }

  async function nativeShare() {
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> }
    if (typeof nav.share === 'function') {
      try {
        await nav.share({ title: t('mail_subject'), text, url: homeUrl })
        return
      } catch {
        /* user cancelled or share unsupported — fall through to copy */
      }
    }
    copy()
  }

  return (
    <section
      aria-labelledby="share-verdict-title"
      className="mt-10 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-paper)] p-5"
    >
      <h2
        id="share-verdict-title"
        className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--color-ink-3)]"
      >
        {t('title')}
      </h2>
      <p className="mt-2 text-sm text-[var(--color-ink-2)]">{t('subtitle')}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] px-4 text-sm font-semibold text-white"
          style={{ background: '#128C7E' }}
        >
          <Share2 className="h-4 w-4" aria-hidden /> {t('whatsapp')}
        </a>
        <a
          href={mailHref}
          className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-line-strong)] bg-[var(--color-paper)] px-4 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-page)]"
        >
          <Mail className="h-4 w-4" aria-hidden /> {t('email')}
        </a>
        <button
          type="button"
          onClick={nativeShare}
          className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-line-strong)] bg-[var(--color-paper)] px-4 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-page)]"
        >
          <Copy className="h-4 w-4" aria-hidden /> {copied ? t('copied') : t('copy')}
        </button>
      </div>
      <p className="mt-3 text-xs text-[var(--color-ink-3)]">
        <a href={cardUrl} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
          {t('preview_card')}
        </a>
      </p>
    </section>
  )
}

'use client'

import { Copy, Mail, Share2, ShoppingBag, Trash2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { Drawer as Vaul } from 'vaul'

import { Link } from '@/i18n/navigation'
import { CATEGORY_LABELS_DE, CATEGORY_LABELS_EN } from '@/lib/category-rules'
import { CATEGORY_ACCENT } from '@/lib/store-tokens'
import { STORE_BRAND } from '@/lib/store-tokens'
import { buildMailtoHref, buildShareText, buildWhatsAppHref, groupByStore } from '@/lib/share'
import { buildShareUrl } from '@/lib/share-url'
import { useIsDesktop } from '@/lib/use-is-desktop'
import { useListStore, type ListItem } from '@/stores/list-store'
import { useUiStore } from '@/stores/ui-store'

type Props = { locale: string }

// Right-anchored on desktop (420px wide), bottom sheet on mobile (90vh max).
// Open state lives in useUiStore so any trigger anywhere in the tree can flip it.
export function ListDrawer({ locale }: Props) {
  const t = useTranslations('list')
  const open = useUiStore((s) => s.isListDrawerOpen)
  const setOpen = useUiStore((s) => s.setListDrawerOpen)
  const items = useListStore((s) => s.items)
  const remove = useListStore((s) => s.remove)
  const clear = useListStore((s) => s.clear)
  const isDesktop = useIsDesktop()

  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(id)
  }, [copied])

  const direction = isDesktop ? 'right' : 'bottom'
  const groups = groupByStore(items)

  // Share assets are computed lazily via these helpers — `window.location.origin`
  // is undefined during the server-side prerender pass, and `new URL('')` throws.
  function buildAssets() {
    const origin = window.location.origin
    const shareUrl = buildShareUrl({ origin, locale, items })
    const shareText = buildShareText({ items, shareUrl, locale })
    return { shareUrl, shareText }
  }

  function onWaClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (items.length === 0) {
      e.preventDefault()
      return
    }
    e.currentTarget.href = buildWhatsAppHref(buildAssets().shareText)
  }

  function onMailClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (items.length === 0) {
      e.preventDefault()
      return
    }
    e.currentTarget.href = buildMailtoHref({ text: buildAssets().shareText, locale })
  }

  async function copyLink() {
    if (items.length === 0) return
    const { shareUrl, shareText } = buildAssets()
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
    } catch {
      try {
        await navigator.clipboard.writeText(shareText)
        setCopied(true)
      } catch {
        /* swallow — toast not shown is the user-visible signal */
      }
    }
  }

  return (
    <Vaul.Root open={open} onOpenChange={setOpen} direction={direction} key={direction}>
      <Vaul.Portal>
        <Vaul.Overlay className="fixed inset-0 z-40 bg-[rgba(11,11,15,0.45)]" />
        <Vaul.Content
          className={
            direction === 'right'
              ? 'fixed bottom-0 right-0 top-0 z-50 flex h-full w-[420px] flex-col bg-[var(--color-paper)] shadow-[var(--shadow-md)]'
              : 'fixed inset-x-0 bottom-0 z-50 flex max-h-[90vh] flex-col rounded-t-[var(--radius-xl)] bg-[var(--color-paper)] shadow-[var(--shadow-md)]'
          }
        >
          {/* Drag handle on mobile only */}
          {direction === 'bottom' ? (
            <div
              aria-hidden
              className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-[var(--color-line-strong)]"
            />
          ) : null}

          {/* Header — Title + count + Done */}
          <div className="flex items-center justify-between border-b border-[var(--color-line)] px-5 py-4">
            <Vaul.Title className="text-base font-semibold text-[var(--color-ink)]">
              {t('title')}{' '}
              <span className="font-mono text-sm tabular-nums text-[var(--color-ink-3)]">
                · {items.length}
              </span>
            </Vaul.Title>
            <Vaul.Description className="sr-only">{t('description')}</Vaul.Description>
            <Vaul.Close
              aria-label={t('done')}
              className="text-sm font-medium text-[var(--color-signal)] underline-offset-4 hover:underline"
            >
              {t('done')}
            </Vaul.Close>
          </div>

          {items.length === 0 ? (
            <EmptyState locale={locale} onClose={() => setOpen(false)} />
          ) : (
            <div className="flex-1 overflow-y-auto px-5 py-5">
              <ItemsByCategory items={items} onRemove={remove} locale={locale} />

              <WhereToBuy groups={groups} locale={locale} />
            </div>
          )}

          {/* Share footer — only when list has items */}
          {items.length > 0 ? (
            <div className="border-t border-[var(--color-line)] bg-[var(--color-paper)] px-5 py-4">
              <a
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                onClick={onWaClick}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] text-sm font-semibold text-white"
                style={{ background: '#25D366' }}
              >
                <Share2 className="h-4 w-4" aria-hidden /> {t('share_whatsapp')}
              </a>
              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  onClick={copyLink}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-line-strong)] text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-page)]"
                >
                  <Copy className="h-4 w-4" aria-hidden /> {copied ? t('copied') : t('copy_link')}
                </button>
                <a
                  href="#"
                  onClick={onMailClick}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-line-strong)] text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-page)]"
                >
                  <Mail className="h-4 w-4" aria-hidden /> {t('email')}
                </a>
              </div>
              <button
                type="button"
                onClick={clear}
                className="mt-4 inline-flex items-center gap-2 text-xs text-[var(--color-ink-3)] underline-offset-4 hover:underline"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden /> {t('clear')}
              </button>
            </div>
          ) : null}
        </Vaul.Content>
      </Vaul.Portal>
    </Vaul.Root>
  )
}

function ItemsByCategory({
  items,
  onRemove,
  locale,
}: {
  items: ListItem[]
  onRemove: (id: string) => void
  locale: string
}) {
  const t = useTranslations('list')
  const labels = locale === 'de' ? CATEGORY_LABELS_DE : CATEGORY_LABELS_EN
  const byCat = new Map<string, ListItem[]>()
  for (const it of items) {
    const arr = byCat.get(it.category) ?? []
    arr.push(it)
    byCat.set(it.category, arr)
  }
  return (
    <div className="flex flex-col gap-6">
      {Array.from(byCat.entries()).map(([cat, arr]) => (
        <section key={cat}>
          <p className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-ink-3)]">
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: CATEGORY_ACCENT[cat as keyof typeof CATEGORY_ACCENT] ?? 'var(--cat-other)' }}
            />
            {labels[cat as keyof typeof labels] ?? cat} · {arr.length}{' '}
            {t(arr.length === 1 ? 'item_one' : 'item_other')}
          </p>
          <ul className="flex flex-col gap-2">
            {arr.map((it) => (
              <li
                key={it.id}
                className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-paper)] py-2 pl-2 pr-2"
              >
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-page)]">
                  {it.imageUrl ? (
                    <Image
                      src={it.imageUrl}
                      alt=""
                      width={40}
                      height={40}
                      sizes="40px"
                      className="h-full w-full object-contain p-1"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[var(--color-ink-3)]">
                      <ShoppingBag className="h-4 w-4" aria-hidden />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-[var(--color-ink)]">{it.productName}</p>
                  <p className="font-mono text-[11px] tabular-nums text-[var(--color-ink-3)]">
                    {STORE_BRAND[it.store].label} · CHF {it.salePrice.toFixed(2)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(it.id)}
                  aria-label={t('remove')}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] hover:bg-[var(--color-page)]"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function WhereToBuy({
  groups,
  locale,
}: {
  groups: ReturnType<typeof groupByStore>
  locale: string
}) {
  const t = useTranslations('list')
  const total = groups.reduce((acc, g) => acc + g.total, 0)
  const totalItems = groups.reduce((acc, g) => acc + g.items.length, 0)
  return (
    <section className="mt-8 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-page)] px-4 py-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-ink-3)]">
        {t('where_to_buy')}
      </p>
      <p className="mt-2 text-sm text-[var(--color-ink-2)]">
        {t('split_summary', { items: totalItems, stores: groups.length })}
      </p>
      <ul className="mt-3 flex flex-col gap-1">
        {groups.map((g) => (
          <li
            key={g.store}
            className="flex items-baseline justify-between font-mono text-xs tabular-nums text-[var(--color-ink-2)]"
          >
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: STORE_BRAND[g.store].color }}
              />
              {STORE_BRAND[g.store].label} · {g.items.length}{' '}
              {t(g.items.length === 1 ? 'item_one' : 'item_other')}
            </span>
            <span>CHF {fmt(g.total, locale)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-baseline justify-between border-t border-[var(--color-line-strong)] pt-2 text-sm">
        <span className="text-[var(--color-ink-2)]">{t('estimated_total')}</span>
        <span className="font-mono font-semibold tabular-nums text-[var(--color-ink)]">
          CHF {fmt(total, locale)}
        </span>
      </div>
    </section>
  )
}

function EmptyState({ locale: _locale, onClose }: { locale: string; onClose: () => void }) {
  const t = useTranslations('list')
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-12 text-center">
      <ShoppingBag className="h-12 w-12 text-[var(--color-ink-3)]" aria-hidden />
      <h3 className="text-lg font-semibold text-[var(--color-ink)]">{t('empty_title')}</h3>
      <p className="max-w-[28ch] text-sm text-[var(--color-ink-2)]">{t('empty_body')}</p>
      <Link
        href="/deals"
        onClick={onClose}
        className="mt-2 inline-flex h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-signal)] px-5 text-sm font-semibold text-white"
      >
        {t('browse_deals')}
      </Link>
    </div>
  )
}

function fmt(n: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'de' ? 'de-CH' : 'en-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

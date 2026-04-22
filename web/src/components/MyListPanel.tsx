import type { BasketItem } from '@shared/types'
import { STORE_META } from '@shared/types'
import { removeBasketItem } from '../lib/queries'

// Sub-category emoji lookup for basket item category
const CATEGORY_EMOJI: Record<string, string> = {
  fresh: '🛒',
  'long-life': '🥫',
  'non-food': '🧴',
}

export interface MyListPanelProps {
  open: boolean
  onClose: () => void
  basketId: string | null
  items: BasketItem[]
  onItemRemoved: () => void
}

export function MyListPanel(props: MyListPanelProps) {
  const { open, onClose, basketId, items, onItemRemoved } = props

  if (!open) return null

  async function handleRemove(itemId: string) {
    if (!basketId) return
    try {
      await removeBasketItem(basketId, itemId)
      onItemRemoved()
    } catch {
      // silent — user can retry
    }
  }

  function handleWhatsAppShare() {
    const itemList = items.map((i) => `• ${i.label}`).join('\n')
    const text = `My grocery shopping list (basketch):\n${itemList}\n\nCompare prices: ${window.location.origin}/compare/${basketId}`
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function handleCopyLink() {
    const url = `${window.location.origin}/compare/${basketId}`
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).catch(() => { /* silent */ })
    }
  }

  function handleEmailSave() {
    const subject = encodeURIComponent('My basketch shopping list')
    const body = encodeURIComponent(`My grocery list:\n${items.map((i) => `• ${i.label}`).join('\n')}\n\nView deals: ${window.location.origin}/compare/${basketId}`)
    window.location.href = `mailto:?subject=${subject}&body=${body}`
  }

  const itemCount = items.length

  // Group items by category (since BasketItem has no store field)
  const byCategory = new Map<string, BasketItem[]>()
  for (const item of items) {
    const key = item.category
    const existing = byCategory.get(key) ?? []
    existing.push(item)
    byCategory.set(key, existing)
  }

  const categoryOrder: string[] = ['fresh', 'long-life', 'non-food']
  const orderedCategories = categoryOrder.filter((c) => byCategory.has(c))

  const categoryLabels: Record<string, string> = {
    fresh: 'Fresh',
    'long-life': 'Long-life',
    'non-food': 'Household',
  }

  // Pick a store color per category for visual grouping
  const categoryColors: Record<string, { hex: string; hexLight: string }> = {
    fresh: { hex: STORE_META.migros.hex, hexLight: STORE_META.migros.hexLight },
    'long-life': { hex: STORE_META.denner.hex, hexLight: STORE_META.denner.hexLight },
    'non-food': { hex: STORE_META.coop.hex, hexLight: STORE_META.coop.hexLight },
  }

  const panelContent = (
    <div className='flex h-full flex-col'>
      {/* Grab handle — mobile only */}
      <div className='flex justify-center pb-1 pt-3 md:hidden'>
        <div className='h-[5px] w-[44px] rounded-full bg-[#d1d5db]' aria-hidden='true' />
      </div>

      {/* Header */}
      <div className='flex items-center justify-between border-b border-[#e5e5e5] px-4 py-3'>
        <h2 className='text-[16px] font-bold'>
          My list · {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </h2>
        <button
          type='button'
          onClick={onClose}
          className='flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-sm font-semibold text-accent hover:bg-[#f4f6fa] focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2'
          aria-label='Close list panel'
        >
          Done
        </button>
      </div>

      {/* Items list */}
      <div className='flex-1 overflow-y-auto px-4 py-3'>
        {items.length === 0 ? (
          <p className='py-8 text-center text-sm text-[#8a8f98]'>
            No items in your list yet. Browse deals and tap + to add items.
          </p>
        ) : (
          <div className='space-y-4'>
            {orderedCategories.map((cat) => {
              const catItems = byCategory.get(cat) ?? []
              const colors = categoryColors[cat] ?? { hex: '#666', hexLight: '#f4f6fa' }
              const emoji = CATEGORY_EMOJI[cat] ?? '🛒'
              return (
                <div key={cat}>
                  {/* Category group heading */}
                  <div className='mb-2 flex items-center gap-2'>
                    <span
                      className='inline-block size-2.5 rounded-full'
                      style={{ backgroundColor: colors.hex }}
                      aria-hidden='true'
                    />
                    <span className='text-[12px] font-semibold uppercase tracking-wide text-[#666]'>
                      {emoji} {categoryLabels[cat] ?? cat} · {catItems.length} {catItems.length === 1 ? 'item' : 'items'}
                    </span>
                  </div>

                  {/* Items in this category */}
                  <div className='overflow-hidden rounded-[8px] border border-[#e5e5e5]'>
                    {catItems.map((item, i) => (
                      <div
                        key={item.id}
                        className={`flex min-h-[48px] items-center gap-3 px-3 py-2 ${i < catItems.length - 1 ? 'border-b border-[#e5e5e5]' : ''}`}
                      >
                        {/* Thumbnail — tinted box with category emoji */}
                        <div
                          className='flex size-12 shrink-0 items-center justify-center rounded-[8px] text-[20px]'
                          style={{ backgroundColor: colors.hexLight }}
                          aria-hidden='true'
                        >
                          {emoji}
                        </div>

                        {/* Label */}
                        <span className='flex-1 text-[14px] font-medium leading-snug'>
                          {item.label}
                        </span>

                        {/* Remove button */}
                        <button
                          type='button'
                          onClick={() => handleRemove(item.id)}
                          aria-label={`Remove ${item.label} from list`}
                          className='flex size-8 shrink-0 items-center justify-center rounded-full text-[#8a8f98] hover:bg-[#fee2e2] hover:text-[#dc2626] focus-visible:ring-2 focus-visible:ring-[#dc2626] focus-visible:ring-offset-2'
                        >
                          <svg className='size-4' viewBox='0 0 20 20' fill='currentColor' aria-hidden='true'>
                            <path fillRule='evenodd' d='M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z' clipRule='evenodd' />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Desktop: estimated total note */}
        {items.length > 0 && (
          <p className='mt-4 hidden rounded-[8px] bg-[#f4f6fa] px-3 py-2 text-[12px] text-[#8a8f98] md:block'>
            View deals for prices — tap Browse deals to see this week&apos;s prices at each store.
          </p>
        )}
      </div>

      {/* Action buttons */}
      {items.length > 0 && (
        <div className='border-t border-[#e5e5e5] px-4 py-3 pb-safe'>
          {/* WhatsApp share — full width */}
          <button
            type='button'
            onClick={handleWhatsAppShare}
            className='mb-2 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[8px] bg-[#25d366] px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-[#1fba59] focus-visible:ring-2 focus-visible:ring-[#25d366] focus-visible:ring-offset-2'
          >
            <svg className='size-5' viewBox='0 0 24 24' fill='currentColor' aria-hidden='true'>
              <path d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z' />
            </svg>
            Share on WhatsApp
          </button>

          {/* Copy link + Save to email — side by side */}
          <div className='flex gap-2'>
            <button
              type='button'
              onClick={handleCopyLink}
              className='flex min-h-[44px] flex-1 items-center justify-center rounded-[8px] border border-[#e5e5e5] px-3 py-2 text-[13px] font-semibold text-[#444] hover:border-[#999] hover:bg-[#f4f6fa] focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2'
            >
              Copy link
            </button>
            <button
              type='button'
              onClick={handleEmailSave}
              className='flex min-h-[44px] flex-1 items-center justify-center rounded-[8px] border border-[#e5e5e5] px-3 py-2 text-[13px] font-semibold text-[#444] hover:border-[#999] hover:bg-[#f4f6fa] focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2'
            >
              Save to email
            </button>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <>
      {/* Backdrop */}
      <div
        className='fixed inset-0 z-40 bg-black/40'
        aria-hidden='true'
        onClick={onClose}
      />

      {/* Mobile bottom sheet */}
      <div
        role='dialog'
        aria-modal='true'
        aria-label='My list'
        className='fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] overflow-hidden rounded-t-[16px] bg-white shadow-xl md:hidden'
      >
        {panelContent}
      </div>

      {/* Desktop right drawer */}
      <div
        role='dialog'
        aria-modal='true'
        aria-label='My list'
        className='fixed bottom-0 right-0 top-0 z-50 hidden w-[400px] overflow-hidden bg-white shadow-xl md:flex md:flex-col'
      >
        {/* Close button top right — desktop only */}
        <button
          type='button'
          onClick={onClose}
          aria-label='Close list panel'
          className='absolute right-3 top-3 z-10 flex size-9 items-center justify-center rounded-full text-[#666] hover:bg-[#f4f6fa] focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2'
        >
          <svg className='size-5' viewBox='0 0 20 20' fill='currentColor' aria-hidden='true'>
            <path fillRule='evenodd' d='M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z' clipRule='evenodd' />
          </svg>
        </button>
        {panelContent}
      </div>
    </>
  )
}

// BottomSheet — v4 mobile filter primitive (spec §7).
// Slide-up overlay with drag handle, scrim, and Apply/Clear footer.
// Closes on: ESC, scrim click, drag-down past threshold, explicit Close button.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

interface BottomSheetProps {
  open: boolean
  title: string
  onClose: () => void
  onApply: () => void
  onClear: () => void
  applyLabel?: string
  children: ReactNode
}

const DRAG_CLOSE_THRESHOLD_PX = 80

export function BottomSheet(props: BottomSheetProps) {
  const { open, title, onClose, onApply, onClear, applyLabel = 'Apply', children } = props
  const sheetRef = useRef<HTMLDivElement>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const dragStart = useRef<number | null>(null)

  // Close on ESC
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // Reset drag state on close
  useEffect(() => {
    if (!open) setDragOffset(0)
  }, [open])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const first = e.touches[0]
    if (!first) return
    dragStart.current = first.clientY
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (dragStart.current == null) return
    const first = e.touches[0]
    if (!first) return
    const delta = first.clientY - dragStart.current
    if (delta > 0) setDragOffset(delta)
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (dragOffset > DRAG_CLOSE_THRESHOLD_PX) {
      onClose()
    } else {
      setDragOffset(0)
    }
    dragStart.current = null
  }, [dragOffset, onClose])

  if (!open) return null

  return (
    <div
      className='fixed inset-0 z-50 flex items-end'
      role='dialog'
      aria-modal='true'
      aria-labelledby='bottom-sheet-title'
    >
      {/* Scrim */}
      <button
        type='button'
        aria-label='Close filters'
        onClick={onClose}
        className='absolute inset-0 bg-black/40 transition-opacity'
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className='relative flex max-h-[60vh] w-full flex-col rounded-t-[16px] bg-white shadow-xl transition-transform'
        style={{ transform: `translateY(${dragOffset}px)` }}
      >
        {/* Drag handle */}
        <div
          className='flex cursor-grab touch-pan-y justify-center py-2 active:cursor-grabbing'
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <span className='h-1 w-10 rounded-full bg-[#d4d6dc]' aria-hidden='true' />
        </div>

        {/* Header */}
        <div className='flex items-center justify-between px-4 pb-2'>
          <h2 id='bottom-sheet-title' className='text-[16px] font-bold text-[#1a1a1a]'>
            {title}
          </h2>
          <button
            type='button'
            onClick={onClose}
            aria-label='Close'
            className='flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-[18px] text-[#666] hover:bg-[#f4f5f7] focus-visible:ring-2 focus-visible:ring-[#2563eb]'
          >
            ×
          </button>
        </div>

        {/* Body (scrolls) */}
        <div className='flex-1 overflow-y-auto px-4 pb-4'>{children}</div>

        {/* Footer */}
        <div className='flex items-center gap-2 border-t border-[#e5e5e5] px-4 py-3'>
          <button
            type='button'
            onClick={onClear}
            className='min-h-[44px] flex-1 rounded-full border border-[#e5e5e5] bg-white px-4 text-sm font-semibold text-[#1a1a1a] hover:bg-[#f4f5f7] focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2'
          >
            Clear
          </button>
          <button
            type='button'
            onClick={onApply}
            className='min-h-[44px] flex-[2] rounded-full bg-[#1a1a1a] px-4 text-sm font-semibold text-white hover:bg-black focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2'
          >
            {applyLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

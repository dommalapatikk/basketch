import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import type { FavoriteItemRow, StarterPackRow } from '@shared/types'
import { addFavoriteItemsBatch, fetchBasket } from '../lib/queries'
import { useFavoriteItems, usePageTitle } from '../lib/hooks'
import { useBasketContext } from '../lib/basket-context'
import { Button } from '../components/ui/Button'
import { TemplatePicker } from '../components/TemplatePicker'
import { FavoritesEditor } from '../components/FavoritesEditor'
import { EmailCapture } from '../components/EmailCapture'
import { LoadingState } from '../components/LoadingState'

type Step = 'pick' | 'edit' | 'save'

export function OnboardingPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const editId = searchParams.get('edit')
  const { getOrCreate: getOrCreateBasket } = useBasketContext()

  usePageTitle('Set up your list')

  // Derive step from URL so browser back/forward works (BUG-01 fix)
  const urlStep = searchParams.get('step') as Step | null
  const step: Step = urlStep && ['pick', 'edit', 'save'].includes(urlStep)
    ? urlStep
    : editId ? 'edit' : 'pick'

  function goToStep(next: Step) {
    const params: Record<string, string> = { step: next }
    if (editId) params['edit'] = editId
    setSearchParams(params)
  }

  const [favoriteId, setFavoriteId] = useState<string | null>(editId ?? null)
  const [items, setItems] = useState<FavoriteItemRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [failedPack, setFailedPack] = useState<StarterPackRow | null>(null)
  const stepHeadingRef = useRef<HTMLHeadingElement>(null)
  const initialSyncDone = useRef(false)

  // Focus heading when step changes for screen reader users
  useEffect(() => {
    stepHeadingRef.current?.focus()
  }, [step])

  // Load existing items in edit mode
  const editFavoriteId = editId ?? undefined
  const { data: existingItems, loading: editItemsLoading } = useFavoriteItems(editFavoriteId)

  // Sync existing items into local state — once only on initial load.
  //
  // Guard: only accept existingItems when loading has settled to false.
  // This prevents a background refetch (triggered by a cache miss after
  // a mutation cleared the cache) from updating existingItems and
  // re-entering this effect after the user has already edited their list.
  // `initialSyncDone` blocks re-entry within a single mount; the
  // `!editItemsLoading` guard ensures we only accept the first settled
  // read, not a later doFetch result that races with a remove mutation.
  useEffect(() => {
    if (!initialSyncDone.current && !editItemsLoading && existingItems && existingItems.length > 0 && editId) {
      setItems(existingItems)
      initialSyncDone.current = true
    }
  }, [existingItems, editItemsLoading, editId])

  // B-03: guard against direct navigation to ?step=save without a basket
  useEffect(() => {
    if (step === 'save' && !favoriteId && !editId) {
      setError('We couldn\'t restore your session — let\'s start from the beginning.')
      setSearchParams({ step: 'pick' })
    }
  }, [step, favoriteId, editId, setSearchParams])

  const loading = actionLoading || editItemsLoading

  async function handlePackSelect(pack: StarterPackRow) {
    setActionLoading(true)
    setError(null)

    let id = favoriteId
    if (!id) {
      try {
        id = await getOrCreateBasket()
      } catch {
        setError('Could not create your list. Please try again.')
        setActionLoading(false)
        return
      }
      setFavoriteId(id)
    }

    const imported = await addFavoriteItemsBatch(
      id,
      pack.items.map((i) => ({
        keyword: i.keyword,
        label: i.label,
        category: i.category,
        excludeTerms: i.excludeTerms,
        preferTerms: i.preferTerms,
        productGroupId: i.productGroupId,
      })),
    )

    if (imported.length === 0) {
      setError('Could not import starter pack items.')
      setFailedPack(pack)
      setActionLoading(false)
      return
    }
    setFailedPack(null)

    if (imported.length < pack.items.length) {
      setError(`Imported ${imported.length} of ${pack.items.length} items. Some could not be added.`)
    }

    setItems(imported)
    setActionLoading(false)
    goToStep('edit')
  }

  function handleSkipTemplate() {
    if (actionLoading) return
    setActionLoading(true)
    setError(null)
    getOrCreateBasket().then((id) => {
      setFavoriteId(id)
      goToStep('edit')
      setActionLoading(false)
    }).catch(() => {
      setError('Could not create your list. Please try again.')
      setActionLoading(false)
    })
  }

  function handleDoneEditing() {
    // Skip email step for returning editors who already have an email saved
    if (editId && favoriteId) {
      fetchBasket(favoriteId).then((basket) => {
        if (basket.email) {
          navigate(`/compare/${favoriteId}`)
        } else {
          goToStep('save')
        }
      }).catch(() => {
        goToStep('save')
      })
      return
    }
    goToStep('save')
  }

  function handleEmailSaved() {
    if (favoriteId) {
      navigate(`/compare/${favoriteId}`)
    }
  }

  function handleSkipEmail() {
    if (favoriteId) {
      navigate(`/compare/${favoriteId}`)
    }
  }

  function handleBack() {
    if (step === 'edit') {
      if (editId) {
        navigate(`/compare/${editId}`)
      } else {
        goToStep('pick')
      }
    } else if (step === 'save') {
      goToStep('edit')
    }
  }

  const stepIndex = step === 'pick' ? 0 : step === 'edit' ? 1 : 2
  const stepTitles = ['Choose a starter pack', 'Review your items', 'Save your list']
  const subtitles = [
    'Pick items you buy regularly. We\'ll compare deals for you.',
    'Remove what you don\'t buy. Add anything missing.',
    'Save your list so you can check it every week.',
  ]

  // 30-item warning
  const itemCountWarning = items.length >= 30 && items.length < 40
    ? 'Lists work best with your top 20-30 items. Focus on what you buy every week.'
    : items.length >= 40
      ? 'Maximum 40 items reached.'
      : null

  return (
    <div>
      {step !== 'pick' && (
        <button
          className="mb-2 inline-flex min-h-[44px] cursor-pointer items-center gap-1 border-none bg-transparent py-2 text-sm text-muted hover:text-current focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          onClick={handleBack}
          type="button"
        >
          &larr; {step === 'edit' && !editId ? 'Back to pack selection' : 'Back'}
        </button>
      )}
      {step === 'pick' && !editId && (
        <div className="mb-3 text-right text-sm">
          <Link to="/" className="text-accent hover:underline">Already have a list? Find it here →</Link>
        </div>
      )}
      <h1 ref={stepHeadingRef} tabIndex={-1} className="mb-1 text-2xl font-bold tracking-tight outline-none">{stepTitles[stepIndex]}</h1>
      <p className="mb-4 text-sm text-muted">{subtitles[stepIndex]}</p>

      {/* Step progress bar */}
      <div
        className="mb-6 flex gap-1"
        role="progressbar"
        aria-valuenow={stepIndex + 1}
        aria-valuemin={1}
        aria-valuemax={3}
        aria-label={`Step ${stepIndex + 1} of 3`}
        aria-valuetext={`Step ${stepIndex + 1}: ${step === 'pick' ? 'Choose a starter pack' : step === 'edit' ? 'Edit list' : 'Save'}`}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-sm ${
              i < stepIndex ? 'bg-success' : i === stepIndex ? 'bg-accent' : 'bg-border'
            }`}
            aria-label={`Step ${i + 1}: ${
              i === 0 ? 'Choose a starter pack' : i === 1 ? 'Edit list' : 'Save'
            }${i < stepIndex ? ' (completed)' : i === stepIndex ? ' (current)' : ''}`}
          />
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-error-light p-4 text-center text-sm text-error" role="alert">
          <p>{error}</p>
          {failedPack && (
            <button
              type="button"
              className="mt-2 text-sm font-semibold underline"
              onClick={() => { setError(null); handlePackSelect(failedPack) }}
            >
              Try again
            </button>
          )}
        </div>
      )}

      {loading && <LoadingState message="Setting up..." />}

      {!loading && step === 'pick' && (
        <TemplatePicker onSelect={handlePackSelect} onSkip={handleSkipTemplate} />
      )}

      {!loading && step === 'edit' && favoriteId && (
        <div>
          <FavoritesEditor
            favoriteId={favoriteId}
            items={items}
            onItemsChange={setItems}
          />

          {itemCountWarning && (
            <div className="mt-3 rounded-md bg-warning-light p-3 text-sm text-warning" role="alert">
              {itemCountWarning}
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <Button
              variant="outline"
              onClick={handleBack}
              type="button"
            >
              Back
            </Button>
            {items.length === 0 ? (
              <Button
                fullWidth
                variant="outline"
                onClick={() => window.location.href = '/deals'}
                type="button"
              >
                Browse deals to add items
              </Button>
            ) : (
              <Button
                fullWidth
                onClick={handleDoneEditing}
                type="button"
              >
                Next — compare deals ({items.length} item{items.length !== 1 ? 's' : ''})
              </Button>
            )}
          </div>
        </div>
      )}

      {!loading && step === 'save' && favoriteId && (
        <div>
          <EmailCapture favoriteId={favoriteId} onSaved={handleEmailSaved} />
          <div className="mt-4 flex gap-3">
            <Button variant="outline" onClick={handleBack} type="button">
              Back
            </Button>
            <Button
              variant="outline"
              fullWidth
              onClick={handleSkipEmail}
              type="button"
            >
              Skip — I'll bookmark instead
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

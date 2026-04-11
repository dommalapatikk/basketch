import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'

import type { FavoriteItemRow, StarterPackRow } from '@shared/types'
import { addFavoriteItemsBatch, createFavorite } from '../lib/queries'
import { useFavoriteItems, usePageTitle } from '../lib/hooks'
import { Button } from '../components/ui/Button'
import { TemplatePicker } from '../components/TemplatePicker'
import { FavoritesEditor } from '../components/FavoritesEditor'
import { EmailCapture } from '../components/EmailCapture'

type Step = 'pick' | 'edit' | 'save'

export function OnboardingPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const editState = location.state as { favoriteId?: string; editMode?: boolean } | null

  usePageTitle('Set up your list')
  const [step, setStep] = useState<Step>(editState?.editMode ? 'edit' : 'pick')
  const [favoriteId, setFavoriteId] = useState<string | null>(editState?.favoriteId ?? null)
  const [items, setItems] = useState<FavoriteItemRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  // Use React Query for loading existing items in edit mode
  const editFavoriteId = editState?.editMode ? editState.favoriteId : undefined
  const { data: existingItems, isLoading: editItemsLoading } = useFavoriteItems(editFavoriteId)

  // Sync React Query data into local state when it arrives
  useEffect(() => {
    if (existingItems && existingItems.length > 0 && items.length === 0 && editState?.editMode) {
      setItems(existingItems)
    }
  }, [existingItems, editState?.editMode, items.length])

  const loading = actionLoading || editItemsLoading

  async function handlePackSelect(pack: StarterPackRow) {
    setActionLoading(true)
    setError(null)

    // Reuse existing favorite if we already have one (prevents orphaning items)
    let id = favoriteId
    if (!id) {
      id = await createFavorite()
      if (!id) {
        setError('Could not create your list. Please try again.')
        setActionLoading(false)
        return
      }
      setFavoriteId(id)
      localStorage.setItem('basketch_favoriteId', id)
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
      setError('Could not import starter pack items. Try starting from scratch.')
      setActionLoading(false)
      setStep('edit')
      return
    }

    if (imported.length < pack.items.length) {
      setError(`Imported ${imported.length} of ${pack.items.length} items. Some could not be added.`)
    }

    setItems(imported)
    queryClient.invalidateQueries({ queryKey: ['favorites', id, 'items'] })
    setActionLoading(false)
    setStep('edit')
  }

  function handleSkipTemplate() {
    if (actionLoading) return
    setActionLoading(true)
    setError(null)
    createFavorite().then((id) => {
      if (id) {
        setFavoriteId(id)
        localStorage.setItem('basketch_favoriteId', id)
        setStep('edit')
      } else {
        setError('Could not create your list. Please try again.')
      }
      setActionLoading(false)
    })
  }

  function handleDoneEditing() {
    setStep('save')
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
      if (editState?.editMode && editState.favoriteId) {
        // Return to comparison page in edit mode
        navigate(`/compare/${editState.favoriteId}`)
      } else {
        setStep('pick')
      }
    } else if (step === 'save') {
      setStep('edit')
    }
  }

  const stepIndex = step === 'pick' ? 0 : step === 'edit' ? 1 : 2

  return (
    <div>
      {step !== 'pick' && (
        <button
          className="mb-2 inline-flex min-h-[44px] cursor-pointer items-center gap-1 border-none bg-transparent py-2 text-sm text-muted hover:text-current"
          onClick={handleBack}
          type="button"
        >
          &larr; Back
        </button>
      )}
      <h1 className="mb-2 text-2xl font-bold tracking-tight">Set up your list</h1>
      <p className="mb-6 text-sm text-muted">
        {step === 'pick' && 'Choose a template to get started fast.'}
        {step === 'edit' && 'Add, remove, or search for products.'}
        {step === 'save' && 'Save your list to access it anytime.'}
      </p>

      <div
        className="mb-6 flex gap-2"
        role="progressbar"
        aria-valuenow={stepIndex + 1}
        aria-valuemin={1}
        aria-valuemax={3}
        aria-label={`Step ${stepIndex + 1} of 3`}
        aria-valuetext={`Step ${stepIndex + 1}: ${step === 'pick' ? 'Choose template' : step === 'edit' ? 'Edit list' : 'Save'}`}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-sm ${
              i < stepIndex ? 'bg-success' : i === stepIndex ? 'bg-accent' : 'bg-border'
            }`}
          />
        ))}
      </div>

      {error && <div className="mb-4 rounded-md bg-error-light p-6 text-center text-error" role="alert">{error}</div>}

      {loading && (
        <div className="py-12 text-center text-muted">
          Setting up...
          <div className="mx-auto mt-3 size-6 rounded-full border-[3px] border-border border-t-accent animate-spin" />
        </div>
      )}

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
          <Button fullWidth className="mt-6" onClick={handleDoneEditing} disabled={items.length === 0} type="button">
            Compare deals ({items.length} items)
          </Button>
        </div>
      )}

      {!loading && step === 'save' && favoriteId && (
        <div>
          <EmailCapture favoriteId={favoriteId} onSaved={handleEmailSaved} />
          <button className="mt-4 flex min-h-[44px] w-full items-center justify-center text-center text-sm text-muted underline hover:text-current" onClick={handleSkipEmail} type="button">
            Continue without saving
          </button>
          <p className="mt-2 text-center text-xs text-muted">
            You can still bookmark the next page to return later.
          </p>
        </div>
      )}
    </div>
  )
}

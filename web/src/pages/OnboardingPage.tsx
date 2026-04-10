import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { FavoriteItemRow, StarterPackRow } from '../../../shared/types'
import { addFavoriteItemsBatch, createFavorite } from '../lib/queries'
import { TemplatePicker } from '../components/TemplatePicker'
import { FavoritesEditor } from '../components/FavoritesEditor'
import { EmailCapture } from '../components/EmailCapture'

type Step = 'pick' | 'edit' | 'save'

export function OnboardingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('pick')
  const [favoriteId, setFavoriteId] = useState<string | null>(null)
  const [items, setItems] = useState<FavoriteItemRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePackSelect(pack: StarterPackRow) {
    setLoading(true)
    setError(null)

    const id = await createFavorite()
    if (!id) {
      setError('Could not create your list. Please try again.')
      setLoading(false)
      return
    }
    setFavoriteId(id)

    const imported = await addFavoriteItemsBatch(
      id,
      pack.items.map((i) => ({
        keyword: i.keyword,
        label: i.label,
        category: i.category,
      })),
    )

    if (imported.length === 0) {
      setError('Could not import starter pack items. Try starting from scratch.')
      setLoading(false)
      setStep('edit')
      return
    }

    if (imported.length < pack.items.length) {
      setError(`Imported ${imported.length} of ${pack.items.length} items. Some could not be added.`)
    }

    setItems(imported)
    setLoading(false)
    setStep('edit')
  }

  function handleSkipTemplate() {
    setLoading(true)
    setError(null)
    createFavorite().then((id) => {
      if (id) {
        setFavoriteId(id)
        setStep('edit')
      } else {
        setError('Could not create your list. Please try again.')
      }
      setLoading(false)
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

  const stepIndex = step === 'pick' ? 0 : step === 'edit' ? 1 : 2

  return (
    <div>
      <h1 className="page-title">Set up your list</h1>
      <p className="page-subtitle">
        {step === 'pick' && 'Choose a template to get started fast.'}
        {step === 'edit' && 'Add, remove, or search for products.'}
        {step === 'save' && 'Save your list to access it anytime.'}
      </p>

      <div className="steps" role="group" aria-label={`Step ${stepIndex + 1} of 3`}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`step ${i < stepIndex ? 'done' : ''} ${i === stepIndex ? 'active' : ''}`}
            aria-label={`Step ${i + 1}${i < stepIndex ? ' (done)' : i === stepIndex ? ' (current)' : ''}`}
          />
        ))}
      </div>

      {error && <div className="error-msg mb-16" role="alert">{error}</div>}

      {loading && <div className="loading">Setting up...</div>}

      {!loading && step === 'pick' && (
        <div>
          <TemplatePicker onSelect={handlePackSelect} />
          <button
            className="btn btn-outline btn-block mt-16"
            onClick={handleSkipTemplate}
            type="button"
          >
            Start from scratch
          </button>
        </div>
      )}

      {!loading && step === 'edit' && favoriteId && (
        <div>
          <FavoritesEditor
            favoriteId={favoriteId}
            items={items}
            onItemsChange={setItems}
          />
          <button
            className="btn btn-primary btn-block mt-24"
            onClick={handleDoneEditing}
            disabled={items.length === 0}
            type="button"
          >
            Compare deals ({items.length} items)
          </button>
        </div>
      )}

      {!loading && step === 'save' && favoriteId && (
        <div>
          <EmailCapture favoriteId={favoriteId} onSaved={handleEmailSaved} />
          <button
            className="btn btn-outline btn-block mt-16"
            onClick={handleSkipEmail}
            type="button"
          >
            Skip — just show my deals
          </button>
        </div>
      )}
    </div>
  )
}

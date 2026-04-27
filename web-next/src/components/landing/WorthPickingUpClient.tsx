'use client'

import { useState } from 'react'

import { WorthPickingUp } from './WorthPickingUp'
import type { WorthPickingUpCandidate } from './WorthPickingUpCard'

// Client wrapper that owns local dismissal state. Mutations to user_interest
// are stubbed for now — wire to a server action when the user has saved an
// email (matches v3.2 favorites lookup-key pattern).

type Props = {
  mode: 'personal' | 'cold-start'
  initialCandidates: WorthPickingUpCandidate[]
}

export function WorthPickingUpClient({ mode, initialCandidates }: Props) {
  const [candidates, setCandidates] = useState(initialCandidates)

  function removeOne(conceptId: string) {
    setCandidates((cs) => cs.filter((c) => c.conceptId !== conceptId))
  }

  return (
    <WorthPickingUp
      mode={mode}
      candidates={candidates}
      onAdd={(c) => {
        // TODO: dispatch to list-store + write user_interest(signal='added')
        removeOne(c.conceptId)
      }}
      onNotNow={(c) => {
        // TODO: write a 7-day suppression on user_interest
        removeOne(c.conceptId)
      }}
      onDontSuggestAgain={(c) => {
        // TODO: UPDATE user_interest SET dismissed_at = NOW()
        removeOne(c.conceptId)
      }}
    />
  )
}

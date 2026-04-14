import { useRef, useState } from 'react'

import type { WeeklyVerdict } from '@shared/types'
import { VerdictCard } from './VerdictCard'
import { Button } from './ui/Button'

export function ShareVerdict(props: { verdict: WeeklyVerdict }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  function handleToggle() {
    setOpen((prev) => !prev)
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleToggle} type="button">
        {open ? 'Hide verdict card' : 'Share this verdict'}
      </Button>
      {open && (
        <div ref={containerRef} className="mt-3">
          <VerdictCard verdict={props.verdict} />
        </div>
      )}
    </>
  )
}

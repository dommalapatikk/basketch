// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Sheet, SheetContent } from './sheet'

afterEach(cleanup)

describe('SheetContent aria-describedby', () => {
  // Regression (Sonar S3923): the prop was `description ? undefined : undefined`,
  // i.e. dead code, so the missing-description case was never handled on purpose.
  it('opts out of aria-describedby and does not warn when there is no description', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(
      <Sheet open>
        <SheetContent title="Filters">body</SheetContent>
      </Sheet>,
    )
    expect(screen.getByRole('dialog').hasAttribute('aria-describedby')).toBe(false)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('points aria-describedby at the description when one is given', () => {
    render(
      <Sheet open>
        <SheetContent title="Filters" description="Narrow the deals">
          body
        </SheetContent>
      </Sheet>,
    )
    const dialog = screen.getByRole('dialog')
    const describedBy = dialog.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy as string)?.textContent).toBe('Narrow the deals')
  })
})

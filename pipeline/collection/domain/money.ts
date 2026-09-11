// Money — value object. CHF only, stored as integer rappen.
//
// WHY: prices arrive as parsed floats and get compared, summed and ranked
// (cheapest-store routing). Float francs accumulate representation error;
// integer rappen do not. A bare `number` carrying francs is a defect —
// see CLAUDE.md § Domain-Driven Design.

import { type Result, err, ok } from './result'

const CURRENCY = 'CHF' as const

export type Money = {
  readonly rappen: number
  readonly currency: typeof CURRENCY
}

/** Tolerance for IEEE-754 error when converting parsed francs to rappen. */
const EPSILON = 1e-6

export function createMoney(francs: number): Result<Money> {
  if (!Number.isFinite(francs)) return err(`Money must be finite, got ${francs}`)
  if (francs < 0) return err(`Money must not be negative, got ${francs}`)

  const scaled = francs * 100
  const rounded = Math.round(scaled)
  // Reject genuine sub-rappen precision (1.234) but tolerate float noise
  // (19.99 * 100 === 1998.9999999999998).
  if (Math.abs(scaled - rounded) > EPSILON) {
    return err(`Money must not have sub-rappen precision, got ${francs}`)
  }

  return ok({ rappen: rounded, currency: CURRENCY })
}

export function moneyFromRappen(rappen: number): Result<Money> {
  if (!Number.isInteger(rappen)) return err(`Rappen must be an integer, got ${rappen}`)
  if (rappen < 0) return err(`Rappen must not be negative, got ${rappen}`)
  return ok({ rappen, currency: CURRENCY })
}

export function toFrancs(m: Money): number {
  return m.rappen / 100
}

export function addMoney(a: Money, b: Money): Result<Money> {
  return moneyFromRappen(a.rappen + b.rappen)
}

export function isCheaperThan(a: Money, b: Money): boolean {
  return a.rappen < b.rappen
}

export function equalsMoney(a: Money, b: Money): boolean {
  return a.rappen === b.rappen && a.currency === b.currency
}

/** Swiss retail display: always two decimals. */
export function formatMoney(m: Money): string {
  return toFrancs(m).toFixed(2)
}

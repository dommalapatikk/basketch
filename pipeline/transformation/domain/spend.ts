// spend — the domain the paid judge never had. WP-P8 / RCA item 5.
//
// THE DEFECT THIS CLOSES: `openai/gpt-5-nano` has been a PAID model since
// 2026-09-10 (CLAUDE.md still claimed "No paid LLM" until this WP). Nothing in
// the codebase knew its price. `guardrails.ts`'s `Budget.maxRappen` existed but
// its `rappen` parameter was never passed — `recordSpend(budget, tokens)` always
// spent 0 money, so the cap could never trip. The paid call had no `max_tokens`,
// so its worst case was unbounded (128,000 output tokens × $0.40/M ≈ $0.051 a
// call). The only real ceiling was the OpenRouter account balance.
//
// THE FIX: a call cannot be made without a `Reservation`, and a `Reservation`
// cannot be minted without money to cover the WORST CASE still remaining. You
// can check before spending. You cannot un-spend — so a call whose outcome is
// unknown (an error, a timeout) settles at the worst case, never at 0.
//
// WHY USD, NOT RAPPEN: OpenRouter meters and caps in USD. Converting to CHF
// would add an exchange rate nobody keeps current, for a $5/month ceiling
// where the rounding would dwarf the signal.
//
// WHY MICRO-DOLLARS, NOT FLOATS: `0.1 + 0.2 !== 0.3`. A ledger that adds
// floating-point dollars across hundreds of calls drifts. `UsdMicros` is an
// integer (1 USD = 1_000_000 micros), so every operation below is exact
// integer arithmetic.
//
// WHAT THIS FILE DELIBERATELY DOES NOT BOUND: the INPUT side of a call's cost.
// The judge's prompt is one product's guardrail-capped text plus a fixed
// taxonomy listing (`guardrails.ts`'s MAX_PRODUCT_NAME_LENGTH/
// MAX_DESCRIPTOR_LENGTH already cap it), and OpenAI's input pricing for
// gpt-5-nano is 8x cheaper per token than its output pricing — the dimension
// `max_tokens` cannot bound (see `worstCaseCallCostMicros`) is not the
// dangerous one. `settle` still records the REAL total cost (input + output)
// when the provider reports it, so actual spend is always honest even though
// the pre-call reservation only bounds the output side. The three-layer
// enforcement this WP ships (CLAUDE.md: provider key cap, this ledger,
// `max_tokens`) means a one-call input-cost margin is not the load-bearing
// defence — the provider's own key limit is.

import { type Result, err, ok } from '../../collection/domain/result'

// ── UsdMicros ────────────────────────────────────────────────────────────────

export type UsdMicros = number & { readonly __brand: 'UsdMicros' }

const MICROS_PER_USD = 1_000_000

export function usdMicros(value: number): Result<UsdMicros> {
  if (!Number.isFinite(value)) return err(`UsdMicros must be finite, got ${value}`)
  if (!Number.isInteger(value)) return err(`UsdMicros must be an integer number of micro-dollars, got ${value}`)
  if (value < 0) return err(`UsdMicros must be >= 0, got ${value}`)
  return ok(value as UsdMicros)
}

export const ZERO_USD_MICROS: UsdMicros = 0 as UsdMicros

/** Untrusted external input (a provider's own dollar figure) → the nearest whole micro-dollar, never negative. */
export function usdToMicros(usd: number): Result<UsdMicros> {
  if (!Number.isFinite(usd)) return err(`usd amount must be finite, got ${usd}`)
  return usdMicros(Math.round(Math.max(0, usd) * MICROS_PER_USD))
}

export function addUsdMicros(a: UsdMicros, b: UsdMicros): UsdMicros {
  return (a + b) as UsdMicros
}

export function subtractUsdMicros(a: UsdMicros, b: UsdMicros): UsdMicros {
  return Math.max(0, a - b) as UsdMicros
}

export function formatUsd(micros: UsdMicros): string {
  return `$${(micros / MICROS_PER_USD).toFixed(4)}`
}

// ── ModelPrice ───────────────────────────────────────────────────────────────

export type ModelPrice = {
  readonly inputPerMTokMicros: UsdMicros
  readonly outputPerMTokMicros: UsdMicros
}

export function createModelPrice(input: { inputPerMTokMicros: number; outputPerMTokMicros: number }): Result<ModelPrice> {
  const inputPrice = usdMicros(input.inputPerMTokMicros)
  if (!inputPrice.ok) return err(`inputPerMTokMicros: ${inputPrice.error}`)
  const outputPrice = usdMicros(input.outputPerMTokMicros)
  if (!outputPrice.ok) return err(`outputPerMTokMicros: ${outputPrice.error}`)
  return ok({ inputPerMTokMicros: inputPrice.value, outputPerMTokMicros: outputPrice.value })
}

function costForTokens(perMTokMicros: UsdMicros, tokens: number): UsdMicros {
  return Math.ceil((perMTokMicros * Math.max(0, tokens)) / 1_000_000) as UsdMicros
}

// ── SpendPolicy — what one (provider, model) call may cost ───────────────────

export type SpendPolicy = {
  readonly price: ModelPrice
  readonly maxOutputTokens: number
  /**
   * Precomputed once, at construction: the OUTPUT-side worst case, per call.
   * See the file header for why the input side is not included here.
   */
  readonly worstCaseCallCostMicros: UsdMicros
}

export function createSpendPolicy(input: { price: ModelPrice; maxOutputTokens: number }): Result<SpendPolicy> {
  if (!Number.isInteger(input.maxOutputTokens) || input.maxOutputTokens <= 0) {
    return err(`maxOutputTokens must be a positive integer, got ${input.maxOutputTokens}`)
  }
  return ok({
    price: input.price,
    maxOutputTokens: input.maxOutputTokens,
    worstCaseCallCostMicros: costForTokens(input.price.outputPerMTokMicros, input.maxOutputTokens),
  })
}

// ── SpendLedger — reserve the worst case before a call, settle the actual after ─

export type SpendLedgerState = {
  /** What remains of THIS PERIOD's allowance, as read from the provider at run start. Never persisted by us. */
  readonly ceilingMicros: UsdMicros
  /** Settled — the real cost of calls that have already finished (success or failure), this run. */
  readonly spentMicros: UsdMicros
  /** Reserved but not yet settled — outstanding worst-case commitments for calls still in flight. */
  readonly reservedMicros: UsdMicros
}

export function createSpendLedgerState(ceilingMicros: UsdMicros): SpendLedgerState {
  return { ceilingMicros, spentMicros: ZERO_USD_MICROS, reservedMicros: ZERO_USD_MICROS }
}

/** What a NEW reservation may still draw on without exceeding the ceiling. */
export function remainingMicros(state: SpendLedgerState): UsdMicros {
  return subtractUsdMicros(state.ceilingMicros, addUsdMicros(state.spentMicros, state.reservedMicros))
}

/**
 * A branded receipt only `reserve` can mint — the type-level half of "a paid
 * call without a reservation does not compile": `SpendPolicy`-gated call sites
 * are typed to require one (see `model-gate.ts`), so the only way to get one
 * is to ask the ledger, and the only way to ask honestly is to have it check.
 */
export type Reservation = { readonly __brand: 'Reservation'; readonly worstCaseMicros: UsdMicros }

export type ReserveResult =
  | { readonly ok: true; readonly reservation: Reservation; readonly state: SpendLedgerState }
  | { readonly ok: false; readonly reason: string }

/**
 * Reserves the WORST CASE a call could cost, BEFORE it is made.
 *
 * Concurrency-safe by construction, not by locking: every caller in this
 * codebase updates its ledger `state` synchronously (no `await` between
 * reading the old state and writing the new one — see `model-gate.ts`), so
 * two "concurrent" reservations (WP-P6 raises `maxInFlight` above 1) never
 * observe a stale `state` — each sees the other's commitment already applied.
 */
export function reserve(state: SpendLedgerState, worstCaseMicros: UsdMicros): ReserveResult {
  if (worstCaseMicros > remainingMicros(state)) {
    return {
      ok: false,
      reason: `reserving ${formatUsd(worstCaseMicros)} would exceed the ${formatUsd(remainingMicros(state))} left of this period's ${formatUsd(state.ceilingMicros)} allowance`,
    }
  }
  return {
    ok: true,
    reservation: { __brand: 'Reservation', worstCaseMicros },
    state: { ...state, reservedMicros: addUsdMicros(state.reservedMicros, worstCaseMicros) },
  }
}

/**
 * What a finished call actually cost — `'known'` when the provider reported
 * usage or cost, `'unknown'` for anything else (a thrown error, a timeout, a
 * response with no usage field).
 */
export type SettleUsage = { readonly kind: 'known'; readonly actualMicros: UsdMicros } | { readonly kind: 'unknown' }

/**
 * Releases a reservation and records what the call actually cost.
 *
 * THE INVARIANT: `usage.kind === 'unknown'` settles at the reservation's OWN
 * worst case, never at 0. "The judge recorded 0 tokens on any error" is the
 * exact defect this closes — a provider that is down, or a request that times
 * out after the provider already started billing it, must not look free.
 *
 * A KNOWN actual above the reservation (the worst case turned out to be wrong)
 * is still recorded at its real value, not clamped down to the reservation —
 * clamping would make the ledger under-report a genuine overspend instead of
 * surfacing it to `spend-near-ceiling`.
 */
export function settle(state: SpendLedgerState, reservation: Reservation, usage: SettleUsage): SpendLedgerState {
  const actual = usage.kind === 'known' ? usage.actualMicros : reservation.worstCaseMicros
  return {
    ...state,
    reservedMicros: subtractUsdMicros(state.reservedMicros, reservation.worstCaseMicros),
    spentMicros: addUsdMicros(state.spentMicros, actual),
  }
}

// ── Reading actual cost back out of an OpenRouter response body ──────────────
//
// `model-gate.ts`'s transport/quota boundary (WP-P5's ADR, D1) says the gate
// never inspects a response BODY for content — truncation, an unparseable
// answer, missing indices stay in the adapter. Reading `usage.cost` is a
// narrow, deliberate exception: it does not influence any retry or circuit
// decision (it runs only AFTER a call already succeeded), it is the ONLY way
// to settle a reservation at its real cost instead of always at the worst
// case, and OpenRouter is — by this project's own design (CLAUDE.md: "the
// only paid dependency is OpenRouter") — the only provider this will ever run
// against. If a second paid provider is ever added, this function is the one
// place that needs a sibling, not a rewrite.

export type OpenRouterUsageBody = {
  readonly usage?: {
    readonly cost?: number
    readonly prompt_tokens?: number
    readonly completion_tokens?: number
  }
}

/**
 * `usage.cost` (OpenRouter's own figure, in credits — 1 credit = $1) wins when
 * present. Falling back to `prompt_tokens`/`completion_tokens` × `price`
 * covers a response shape where `cost` is absent; anything less than that is
 * `'unknown'`, which `settle` turns into the worst case.
 */
export function usageFromOpenRouterResponse(body: unknown, price: ModelPrice): SettleUsage {
  const usage = (body as OpenRouterUsageBody | null | undefined)?.usage
  if (!usage) return { kind: 'unknown' }

  if (typeof usage.cost === 'number' && Number.isFinite(usage.cost) && usage.cost >= 0) {
    const micros = usdToMicros(usage.cost)
    if (micros.ok) return { kind: 'known', actualMicros: micros.value }
  }

  if (typeof usage.prompt_tokens === 'number' && typeof usage.completion_tokens === 'number') {
    const inputCost = costForTokens(price.inputPerMTokMicros, usage.prompt_tokens)
    const outputCost = costForTokens(price.outputPerMTokMicros, usage.completion_tokens)
    return { kind: 'known', actualMicros: addUsdMicros(inputCost, outputCost) }
  }

  return { kind: 'unknown' }
}

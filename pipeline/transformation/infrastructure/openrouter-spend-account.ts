// openrouter-spend-account — the provider's own ledger, read fresh every run.
// WP-P8 / RCA item 5.
//
// WHY READ THE PROVIDER INSTEAD OF KEEPING OUR OWN SPEND TABLE: a Supabase
// table would need to survive a retried attempt, a manual re-run, a dispatch
// and a different laptop, and stay correct across all of them — exactly the
// "attempt 2 resets the budget to zero" defect this WP closes for the token
// budget (`guardrails.ts`'s `ZERO_SPEND`, always rebuilt fresh per process).
// OpenRouter's `GET /api/v1/key` already IS that table, updated server-side
// the instant a call is billed, unaffected by which process or machine asked.
// Reading it costs one bounded GET at run start; keeping our own would cost a
// migration, RLS, and a reconciliation story for every one of those failure
// modes — for a value the provider already computes correctly.
//
// AP-10 (PM, 2026-09-15): if this cannot be read, OR the key carries no
// provider-side limit (`limit: null` — an uncapped key), the run continues
// WITHOUT the judge and raises a loud WARNING (composition.ts), never a
// critical alert — a critical alert would fail the very run AP-10 says should
// continue.

import { type UsdMicros, usdToMicros } from '../domain/spend'
import { type ModelGate, createModelGate } from './model-gate'
import { getJson } from './model-http'

const OPENROUTER_KEY_ENDPOINT = 'https://openrouter.ai/api/v1/key'

export type SpendAccountReading =
  | { readonly kind: 'capped'; readonly remainingMicros: UsdMicros; readonly limitMicros: UsdMicros }
  /** The key has no credit limit set at all (`limit: null`) — AP-10 applies. */
  | { readonly kind: 'uncapped' }
  /** The endpoint could not be read — network failure, bad key, malformed body. AP-10 applies. */
  | { readonly kind: 'unreadable'; readonly reason: string }

export type SpendAccount = {
  readonly remaining: () => Promise<SpendAccountReading>
}

type OpenRouterKeyBody = {
  readonly data?: {
    readonly limit_reset?: string | null
    readonly limit?: number | null
    readonly limit_remaining?: number | null
    readonly usage_monthly?: number
  }
}

/**
 * A single account-status read at run start, never retried against a shared
 * quota — the same reasoning `model-probe.ts`'s `probeGate` already documents
 * for a one-shot call that must not turn a ten-second check into a slow retry
 * loop. This is not a call to a MODEL, so it needs no rate/day limit of its
 * own; `requestsPerMinute: 60` and `requestsPerDay: null` are generous rather
 * than meaningful.
 */
function accountReadGate(): ModelGate {
  return createModelGate({
    modelId: 'openrouter-key',
    provider: 'openrouter',
    requestsPerMinute: 60,
    requestsPerDay: null,
    maxInFlight: 1,
    retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 },
  })
}

export type OpenRouterSpendAccountDeps = {
  readonly apiKey: string
  /** Injected only by tests. Production always uses the global fetch. */
  readonly fetchImpl?: typeof fetch
}

export function createOpenRouterSpendAccount(deps: OpenRouterSpendAccountDeps): SpendAccount {
  return {
    async remaining(): Promise<SpendAccountReading> {
      let body: unknown
      try {
        body = await getJson({
          url: OPENROUTER_KEY_ENDPOINT,
          headers: { Authorization: `Bearer ${deps.apiKey}` },
          gate: accountReadGate(),
          fetchImpl: deps.fetchImpl,
        })
      } catch (e) {
        return { kind: 'unreadable', reason: e instanceof Error ? e.message : String(e) }
      }

      return readingFromBody(body)
    },
  }
}

/** Pure — split out so the response-shape logic is testable without a fetch. */
export function readingFromBody(body: unknown): SpendAccountReading {
  const data = (body as OpenRouterKeyBody | null | undefined)?.data
  if (!data) return { kind: 'unreadable', reason: 'response carried no `data` field' }
  if (data.limit === null || data.limit === undefined) return { kind: 'uncapped' }

  // AP-8 caps spend per MONTH. OpenRouter's limits are resettable (docs:
  // /docs/api-reference/limits — `limit_reset` is a string or null), so a key
  // whose USD 5 limit resets DAILY satisfies "a limit exists" while permitting
  // ~USD 150 a month. Reading only `limit` would make the cap a fiction, so a
  // reset we cannot confirm as monthly fails closed: unreadable → AP-10 → the
  // run continues without the judge and says why.
  const reset = data.limit_reset ?? null
  if (reset !== null && reset.toLowerCase() !== 'monthly') {
    return {
      kind: 'unreadable',
      reason: `the key's credit limit resets "${reset}", not monthly — AP-8 caps spend per month, so this limit does not bound it`,
    }
  }

  const limitMicros = usdToMicros(data.limit)
  if (!limitMicros.ok) return { kind: 'unreadable', reason: `malformed limit: ${limitMicros.error}` }

  // Prefer the provider's own `limit_remaining`; fall back to limit minus
  // usage_monthly only if that field is itself absent.
  const remainingUsd = data.limit_remaining ?? (data.usage_monthly !== undefined ? data.limit - data.usage_monthly : null)
  if (remainingUsd === null) return { kind: 'unreadable', reason: 'response had a limit but no way to compute what remains' }

  const remainingMicros = usdToMicros(remainingUsd)
  if (!remainingMicros.ok) return { kind: 'unreadable', reason: `malformed remaining amount: ${remainingMicros.error}` }

  return { kind: 'capped', remainingMicros: remainingMicros.value, limitMicros: limitMicros.value }
}

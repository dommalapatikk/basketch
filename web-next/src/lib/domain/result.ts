// Result type for the web-next read domain.
//
// Domain constructors never throw and never return half-built objects: they
// return Ok or Err. This is what makes "invalid states unrepresentable" real
// rather than aspirational — see CLAUDE.md § Domain-Driven Design.
//
// ⚠️ MIRRORED from pipeline/collection/domain/result.ts rather than imported.
// web-next cannot import across the project boundary — Turbopack rejects it
// under cacheComponents, which is why lib/v3-types.ts inlines its types too.
// Keep the two in step; the shape is deliberately tiny so that is cheap.

export type Ok<T> = { readonly ok: true; readonly value: T }
export type Err = { readonly ok: false; readonly error: string }

export type Result<T> = Ok<T> | Err

export function ok<T>(value: T): Result<T> {
  return { ok: true, value }
}

export function err<T>(error: string): Result<T> {
  return { ok: false, error }
}

/**
 * Named union members matter: they let TypeScript narrow the FALSE branch too,
 * so `if (!isOk(r)) ... r.error` type-checks.
 */
export function isOk<T>(r: Result<T>): r is Ok<T> {
  return r.ok
}

/** Unwrap in tests and at trusted call sites. Throws — never use inside the domain. */
export function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`unwrap called on Err: ${r.error}`)
  return r.value
}

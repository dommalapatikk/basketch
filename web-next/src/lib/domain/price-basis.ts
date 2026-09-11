/**
 * PriceBasis — who can actually pay the advertised price.
 *
 * THE LIDL RULE, expressed as a type: `PriceBasis.MemberOnly must name its
 * programme` (CLAUDE.md § Domain-Driven Design).
 *
 * LIDL publishes its Lidl Plus member price in the same field as an open price,
 * with nothing marking it as one. Showing it as a price anybody can pay is the
 * Art. 3(1)(e) UWG exposure the pipeline's loyalty check exists to prevent —
 * and the reason that adapter drops 117 offers a week.
 *
 * WHY A DISCRIMINATED UNION AND NOT A STRING PLUS A NULLABLE FIELD. The table
 * stores `price_basis` and `loyalty_programme` in two columns and holds them
 * together with a CHECK constraint (deals_member_price_names_programme). Read
 * into two independent fields, that pairing is lost, and every renderer has to
 * remember to check — which in practice meant a fallback that announced
 * "Loyalty members only" and named nobody, exactly the unlabelled member price
 * the rule is about. Here the programme is reachable only through the branch
 * that has one, so there is nothing to remember and nothing to fall back to.
 */

import { err, ok, type Result } from './result'

export type PriceBasis =
  | { readonly kind: 'everyone' }
  | { readonly kind: 'member-only'; readonly programme: string }

const EVERYONE: PriceBasis = { kind: 'everyone' }

/**
 * Reads the two database columns as one value object.
 *
 * An unrecognised basis is read as `everyone`, deliberately: the CHECK
 * constraint means it should never arrive, and of the two readings that is the
 * one that CLAIMS LESS. An open price asserts nothing about membership, while
 * guessing "member-only" would put a restriction on a price that may not have
 * one — a false statement in the other direction.
 *
 * A member price with no programme is refused outright. There is no safe
 * reading of that row: we know the price is restricted and cannot say by what.
 */
export function createPriceBasis(
  basis: string | null | undefined,
  programme: string | null | undefined,
): Result<PriceBasis> {
  if (basis !== 'member-only') return ok(EVERYONE)

  const named = programme?.trim()
  if (!named) {
    return err(
      'a member-only price must name its programme (Lidl Plus, Supercard, Cumulus) — Art. 3(1)(e) UWG',
    )
  }
  return ok({ kind: 'member-only', programme: named })
}

export function isMemberOnly(basis: PriceBasis): boolean {
  return basis.kind === 'member-only'
}

/** The programme name, or null for an open price. For display only. */
export function programmeOf(basis: PriceBasis): string | null {
  return basis.kind === 'member-only' ? basis.programme : null
}

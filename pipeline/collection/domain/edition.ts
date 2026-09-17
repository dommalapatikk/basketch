// Edition — the publication a retailer adapter fetches, as a domain value.
//
// WHY: ruling D5 (docs/rca/2026-09-15-final-plan.md) puts `editionFor` on the
// `OfferSource` port precisely so the enforcement point for "one fetch per
// publication" (WP-J2's ledger) can know WHICH publication BEFORE it fetches.
// An Edition names that fact: which retailer, and which of that retailer's
// own publications is in effect. It is a fact about US (which publication we
// are about to ask for), not a claim about what the source will actually
// serve — a source can still fail after being asked correctly.
//
// WHICH calendar weekday a retailer's publication starts on is retailer
// knowledge and stays inside that retailer's own adapter (CLAUDE.md § DDD).
// This file only knows the SHAPE of an edition, never how to compute one for
// any real retailer.

import type { Retailer } from './offer'
import type { IsoWeek } from './iso-week'

export type Edition = {
  readonly retailer: Retailer
  readonly publication: IsoWeek
}

export function edition(retailer: Retailer, publication: IsoWeek): Edition {
  return { retailer, publication }
}

/** For log lines and error messages — never parsed back apart. */
export function formatEdition(e: Edition): string {
  return `${e.retailer}:${e.publication}`
}

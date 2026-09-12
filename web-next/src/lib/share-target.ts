// Where a share control actually goes — decided once, during render.
//
// THE RULE THIS FILE OWNS:
//
//     a share control is an ANCHOR only when a real destination exists;
//     otherwise it is a DISABLED BUTTON, never an anchor.
//
// It exists because three components each solved the same problem their own
// way, and all three solved it wrongly — see share-target.test.ts for the
// defect. They rendered `<a href="#">` and assigned the true destination from
// inside their own onClick. Only a plain left click fires onClick, so middle
// click, Cmd+click and "Copy link address" all fell through to `#`.
//
// Returning a discriminated union rather than `string | null` is what stops it
// recurring: `unavailable` carries no href at all, so there is nothing for a
// component to put in an `href=` even by mistake. A nullable string invites
// `href={target ?? '#'}`, which is precisely the bug.
//
// NOT in lib/domain, deliberately. buildShareText composes STORE_BRAND labels
// and localised copy, which are presentation. Importing it into lib/domain
// would either break the architecture test or, worse, quietly widen what the
// domain is allowed to touch. The invariant lives in the type, not the folder.

import { buildMailtoHref, buildShareText, buildWhatsAppHref } from '@/lib/share'
import { buildShareUrl } from '@/lib/share-url'
import type { ListItem } from '@/stores/list-store'

export type ShareTarget =
  | {
      readonly kind: 'ready'
      /** Deep link back into basketch with the list pre-loaded. */
      readonly shareUrl: string
      /** The plain-text message body — also what the clipboard falls back to. */
      readonly shareText: string
      readonly whatsappHref: string
      readonly mailtoHref: string
    }
  | {
      readonly kind: 'unavailable'
      readonly reason: 'empty-list' | 'origin-unknown'
    }

/**
 * `origin` is `window.location.origin` on the client and `''` during the
 * server prerender pass of a client component.
 *
 * An unknown origin is an ordinary state, not a failure: `new URL('')` throws,
 * and a share link without an absolute URL is useless to the recipient. Both
 * unavailable reasons render identically; they are distinguished so telemetry
 * and tests can tell "nothing selected" from "not hydrated yet".
 */
export function createShareTarget({
  origin,
  locale,
  items,
}: {
  origin: string
  locale: string
  items: ListItem[]
}): ShareTarget {
  if (items.length === 0) return { kind: 'unavailable', reason: 'empty-list' }
  if (origin.trim() === '') return { kind: 'unavailable', reason: 'origin-unknown' }

  const shareUrl = buildShareUrl({ origin, locale, items })
  const shareText = buildShareText({ items, shareUrl, locale })

  return {
    kind: 'ready',
    shareUrl,
    shareText,
    whatsappHref: buildWhatsAppHref(shareText),
    mailtoHref: buildMailtoHref({ text: shareText, locale }),
  }
}

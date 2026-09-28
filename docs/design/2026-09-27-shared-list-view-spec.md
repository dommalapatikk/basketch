# Shared List View — Design Spec (revised Part A)

**Date:** 2026-09-27
**Author:** Designer agent
**Status:** Draft — awaiting Design Challenger review before Builder starts (Universal Resolution Loop, CLAUDE.md)
**Scope:** Design only. No code, no push.
**Supersedes:** Part A of `docs/design/2026-09-27-shared-list-expiry-and-plurals.md` (that file now carries a one-line pointer at the top of its Part A, per PM P-14). **Part B of that file (pluralisation) is already built and live — nothing in Part B changes here.**
**Built on:** `docs/design/2026-09-27-architect-shared-list-separate-view.md` (read in full before this doc) and PM decision **P-14** (`docs/decisions/2026-09-25-pm-decisions.md`): a shared link never replaces or merges into the recipient's own list; it opens as its own view.

**Files this spec constrains** (Builder reads these before writing code):

| File | Change |
|---|---|
| `web-next/src/app/[locale]/list/page.tsx` | Rewritten: no redirect, no `HydrateAndRedirect`. Renders `resolveSharedList` + `<SharedListView>`. |
| `web-next/src/lib/domain/resolve-shared-list.ts` | **NEW.** Pure function, cases 1–4 (Architect §4). |
| `web-next/src/lib/domain/merge-lists.ts` | **NEW.** Pure `mergeLists(own, incoming, cap)` (Architect §5). |
| `web-next/src/lib/domain/list-limits.ts` | **NEW.** `export const MAX_LIST_ITEMS = 200` — the one shared constant (Architect I4, Challenger M4). |
| `web-next/src/lib/share-url.ts` | `parseListIdsDetailed`, safe per-id decode, dedupe, cap (Tech Lead TL.4). |
| `web-next/src/stores/list-store.ts` | `replaceAll` dedupes by id; `add` enforces `MAX_LIST_ITEMS` (TL.4 point 2, Challenger M4). |
| `web-next/src/components/list/ItemsByCategory.tsx` | **NEW** (extracted from `ListDrawer.tsx`). Server-rendered row text (image, name, store, price). Takes `items`, `locale`, and either `onRemove` (drawer) or, in shared mode, mounts one `<SharedItemAddButton>` per row instead of a prop-drilled `onAdd` (**M2-5**). |
| `web-next/src/components/list/WhereToBuy.tsx` | **NEW** (extracted from `ListDrawer.tsx`). Takes `groups`, `locale`, `ownership: 'mine' \| 'shared'`. |
| `web-next/src/components/list/SharedItemAddButton.tsx` | **NEW (M2-5).** Client island, one per row. The per-item `Add`/`In your list` control — reads `useListStore` (`has`, `add`) directly; a server component cannot pass it an `onAdd` closure, and rows sit above `SharedListActions` in the tree, so a per-row island is required, not optional. This is the **second and only other** file allowed to write the list store on this route. |
| `web-next/src/components/list/SharedListActions.tsx` | **NEW.** Client island for the multi-item actions (Add all / Save as mine / Replace / status banner). Together with `SharedItemAddButton`, these are the **only two** components on this route that touch `useListStore`'s write actions (**M2-5**, rewrites the old single-file claim). |
| `web-next/src/components/list/ListDrawer.tsx` | Updated to import the two extracted components; behaviour unchanged. |
| `web-next/src/components/list/HydrateAndRedirect.tsx` | **DELETED.** No redirect exists any more. |
| `web-next/src/stores/ui-store.ts` | **No change.** The `listNotice` field proposed in the superseded Part A is not built — the shared page needs no cross-component notice channel (Architect §4). |
| `web-next/src/messages/en.json`, `de.json` | New keys, §4 below. `fr.json`/`it.json` — not authored here (routing is de/en only; message-lint.test.ts confirms this), flagged in §7. |
| `web-next/src/messages/message-lint.test.ts` | Add `added`, `present`, `rejected` to `COUNT_NAMES` (**S2-6**) — these three new arguments are count-shaped exactly like the existing set, and leaving them out would let a future edit reintroduce the "1 items" bug class the lint exists to catch. |

---

## 1. What changed from the old Part A, in one paragraph

The old Part A designed a notice banner that had to survive a client-side redirect and race a Vaul focus trap (M5), plus a silent `replaceAll` that overwrote the recipient's own list (P1, the blocking PM question). The Architect's decision removes the redirect entirely: `/list?items=…` now **renders the shared list itself**, server-rendered, read-only, and writes nothing until the recipient taps an explicit action. That deletes the redirect race, the drawer-banner plumbing, and the split_summary-then-redirect flash (Architect §3, §6). This spec designs what replaces it: the page itself, its four content states, its action row, and the exact copy — carrying forward every Design Challenger fix that still applies (M1–M4, S2, S3, S5–S7) and the two that no longer apply because their root cause is gone (M5, S1, S4).

---

## 2. Page anatomy (all states)

```
┌ [locale] /list?items=… ──────────────────────────────┐
│ SHARED LIST                    ← mono eyebrow, list.shared_title
│ [state-dependent notice(s), if any — unavailable +/or overflow]│
│ ┌ Items by category (read-only) ─────────────────────┐│
│ │  CATEGORY · N Artikel                               ││
│ │  [img] Product name        (SharedItemAddButton)    ││ ← icon-only 44x44
│ └──────────────────────────────────────────────────────┘│   client island, M2-5
│ ┌ Where to buy ───────────────────────────────────────┐│
│ │  shared_split_summary text                          ││
│ │  Store · N items          CHF xx.xx                  ││
│ │  Estimated total           CHF xx.xx                 ││
│ └──────────────────────────────────────────────────────┘│
│ ┌ SharedListActions (client island) ──────────────────┐│
│ │  [status banner, if a write just happened]           ││
│ │  [Add all to my list] or [Save as my list]           ││
│ │   or "All items are in your list" (S2-2)             ││
│ │  Replace my list with this one  (conditional, text)  ││
│ └──────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────┘
```

- **Correction (M2-5):** most of the page is server-rendered and needs no JavaScript, but not *everything* above `SharedListActions` — every row's per-item control is its own tiny client island, `SharedItemAddButton` (44×44px, icon-only, see §5.1a/S2-1). The row's image, name, store and price stay server text; only that one button hydrates. The Files table and §8 test 18 now name both client islands.
- `ItemsByCategory` and `WhereToBuy` are the same components the drawer uses, in a `readOnly`/`ownership="shared"` mode: no remove button, `SharedItemAddButton` instead, and `shared_split_summary` copy instead of `split_summary` (see §3.4 — this is a correctness fix beyond what the Architect's flow diagram implied, explained below).
- Case 3 (`none-available`) and case 4 (`link-empty`) replace the whole "Items by category" + "Where to buy" + actions block with a single empty-state block (§5.3, §5.4) — there is nothing to add or buy.
- When every available item is already in the recipient's own list, the action row becomes a static line, not a live-but-pointless "Add all" (§5.3, **S2-2**).

---

## 3. Copy — exact EN + DE, ICU where a count appears

All new keys live under the `list` namespace, both `en.json` and `de.json`. Every plural passes `message-lint.test.ts` (parsed with `@formatjs/icu-messageformat-parser`, every `count`-shaped argument wrapped in a `plural` for that argument, every plural has an `other` branch, EN/DE use the same argument names per key).

### 3.1 Page identity

| Key | EN | DE |
|---|---|---|
| `list.shared_title` | `Shared list` | `Geteilte Liste` |
| `list.shared_description` | `A shopping list someone shared with you` | `Eine Einkaufsliste, die jemand mit dir geteilt hat` |

`list.title` ("My list" / "Meine Liste", already live) is **never** shown on this page — only in the recipient's own drawer. That is the whole point of the two labels (Architect §7: "the two lists are never confused").

### 3.2 Unavailable-items notice (case `partial`) — Challenger M3 wording, renamed key

The old key `list.expired_notice` claimed certainty we don't have (an id can be missing because it never existed, was mistyped, or genuinely ended — A.0 point 1). Renamed to `list.unavailable_notice` so the code doesn't encode the overclaim either, per Challenger M3.

| Key | EN | DE |
|---|---|---|
| `list.unavailable_notice` | `{count, plural, one {# item from this link isn't on offer this week.} other {# items from this link aren't on offer this week.}}` | `{count, plural, one {# Artikel aus diesem Link ist diese Woche nicht im Angebot.} other {# Artikel aus diesem Link sind diese Woche nicht im Angebot.}}` |

**Correction (M2-1 — this re-opens M4, and the Architect's rule wins):** `count` here is **only** ids that were looked up against this week's snapshot and didn't resolve. It does **not** include ids dropped by the 200-cap. The Architect's own test 1 (§9) is explicit: *"Overflow is not counted as unavailable (M4)."* This spec's first draft got the formula backwards (`endedCount = … + overflow`) — that's wrong twice over: an over-cap id can be a perfectly current deal (telling the recipient "50 items aren't on offer this week" would be false), and it's reachable without a hand-made link, because a list saved *before* the `MAX_LIST_ITEMS` store cap ships can already exceed 200 (`sanitizeItems` doesn't cap today). **Corrected attribution (R1):** the Architect's version wins over the TL.4 formula as originally quoted here — not because of a new Tech Lead ruling (none was sought), but because the Architect doc already ratifies this rule directly: l.89 "Over-cap ids … are dropped silently (M4)" and test 1 "Overflow is not counted as unavailable (M4)". TL.4's own counting (old spec l.240) only followed the Designer's now-superseded A.6, so it does not survive against the Architect doc it postdates. TL.4's actual mechanism — `parseListIdsDetailed` returning `{ ids, overflow }` separately — is unchanged and is exactly what makes this correction possible. (One divergence from the Architect doc, not requiring a change to it: the Architect says over-cap ids are dropped "silently"; this spec surfaces them via `list.overflow_notice` instead, per Challenger M4/M2-1 — that only adds honest information on top of the same silent-drop mechanism.)

Corrected: `unavailableCount = (unique ids within the 200 cap) − resolved`. Overflow gets its **own**, honestly-worded line — never folded into "not on offer":

| Key | EN | DE |
|---|---|---|
| `list.overflow_notice` | `{count, plural, one {# more item from this link can't be shown (limit {max}).} other {# more items from this link can't be shown (limit {max}).}}` | `{count, plural, one {# weiterer Artikel aus diesem Link kann nicht angezeigt werden (maximal {max}).} other {# weitere Artikel aus diesem Link können nicht angezeigt werden (maximal {max}).}}` |

Both `list.unavailable_notice` and `list.overflow_notice` can appear together (some ids didn't resolve **and** the link was truncated by the cap) — they are two separate static lines, stacked, each true on its own. This is a static line of page content — no `role="status"`, no `aria-live`, no dismiss button (§6.2). `max` = `MAX_LIST_ITEMS`, interpolated so copy and constant can't drift (**S2-5**'s reasoning applied here too); not in `COUNT_NAMES`, lint-safe.

### 3.3 Empty states (cases `none-available` and `link-empty`) — Challenger M3 wording

Case 3 (ids existed, none resolved) and case 4 (no ids at all) get different copy because they are different facts (superseded spec's A.1, unchanged reasoning) — but neither may say "expired" or "no longer available", per M3.

| Key | EN | DE |
|---|---|---|
| `list.none_available_title` | `None of these items are on offer this week` | `Keiner dieser Artikel ist diese Woche im Angebot` |
| `list.none_available_body` | `Offers change every week. Here's what's on offer now.` | `Die Aktionen wechseln jede Woche. Das ist aktuell im Angebot.` |
| `list.link_empty_title` | `Nothing to show` | `Nichts zum Anzeigen` |
| `list.link_empty_body` | `This link doesn't point to any items. Here's what's on offer this week.` | `Dieser Link enthält keine Artikel. Das ist aktuell im Angebot.` |

Both reuse the existing `list.browse_deals` ("Browse deals" / "Aktionen ansehen") as the CTA — one label for the same job, not two (Rams #8).

### 3.4 Shared-list summary — a NEW correctness fix, not in the Architect's flow note

The Architect's §4 diagram says the shared page reuses `split_summary` (fixed per M2) for its header/`WhereToBuy` summary. **That string says "Your 3 items split best across 2 stores:"** — correct in the recipient's own drawer, but wrong here: before the recipient has added anything, these are not "your" items, they're the sender's. Reusing it verbatim would misstate ownership on a page whose entire job is to keep the two lists distinct (Architect §7, "the two lists are never confused"; Rams #6, Honest). This is a copy-level fix within Designer scope — no PM/Tech Lead escalation needed, and it does not touch `list.split_summary` itself (Part B, live, untouched).

**New key `list.shared_split_summary`**, structurally identical to the existing (live) `split_summary` so it inherits the same verified nested-plural shape, with the possessive removed:

| Locale | ICU |
|---|---|
| EN | `{items, plural, =0 {No items in this link} one {This item is cheapest here:} other {{stores, plural, one {These {items} items are cheapest at one store:} other {These {items} items split best across # stores:}}}}` |
| DE | `{items, plural, =0 {Keine Artikel in diesem Link} one {Dieser Artikel ist hier am günstigsten:} other {{stores, plural, one {Diese {items} Artikel sind in einem Laden am günstigsten:} other {Diese {items} Artikel verteilen sich am besten auf # Läden:}}}}` |

`WhereToBuy` takes an `ownership: 'mine' | 'shared'` prop and picks `split_summary` vs `shared_split_summary` accordingly — the only behavioural difference between the drawer's and the shared page's copy of this component.

### 3.5 Actions

| Key | EN | DE | Shown when |
|---|---|---|---|
| `list.add_all` | `Add all to my list` | `Alle zu meiner Liste hinzufügen` | Own list non-empty **and** at least one shared item is missing from it (**S2-2** — otherwise a static line, see below) |
| `list.save_as_mine` | `Save as my list` | `Als meine Liste speichern` | Own list empty (single primary button, Architect §5) |
| `list.add_one_aria` **(new, M2-6)** | `Add {product} to my list` | `{product} zu meiner Liste hinzufügen` | Accessible name for the per-item button, before add. `{product}` is not a count name — lint-safe, no plural needed. **Dropped `list.add_one`/`list.in_your_list` (S3-3):** an earlier draft also listed those two as "visible labels" on the same icon-only button, but an icon-only button has no visible label and there is no hover tooltip on touch — those two keys would ship unused, exactly the drift `message-lint.test.ts`'s key-parity checks exist to catch. The icon (`Plus`) and this accessible name are the only two representations of "Add" that ship. |
| `list.in_your_list_aria` **(new, M2-6)** | `{product} is in your list` | `{product} ist in deiner Liste` | Accessible name for the per-item button, after add |
| `list.replace_mine` | `Replace my list with this one` | `Meine Liste durch diese ersetzen` | Own list non-empty **and** differs from the shared ids (Architect §5). **Wording fixed (S2-7):** "with this one" is unambiguous about what's being replaced; DE uses "durch...ersetzen" (idiomatic with *ersetzen* — "damit ersetzen" read as "replace it using this") |
| `list.all_in_list` **(new, S2-2)** | `All items are in your list` | `Alle Artikel sind in deiner Liste` | Own list already contains every available shared id — replaces the "Add all" button with this static line (no pointless tap target) |
| `list.open_mine` | `Open my list` | `Meine Liste öffnen` | After any successful add/replace, and as a persistent secondary link — also shown alongside `list.all_in_list` |
| `list.full` | `{rejected, plural, one {Your list is full ({max} items) — # item wasn't added.} other {Your list is full ({max} items) — # items weren't added.}}` | `{rejected, plural, one {Deine Liste ist voll ({max} Artikel) — # Artikel wurde nicht hinzugefügt.} other {Deine Liste ist voll ({max} Artikel) — # Artikel wurden nicht hinzugefügt.}}` | `mergeLists` reports `rejectedByCap > 0`. **Corrected (S2-4, S2-5):** `{max}` is interpolated from `MAX_LIST_ITEMS` so copy and constant can't drift (never hard-code "200"); `rejected` says how many weren't added, so the recipient isn't left guessing. `rejected` is always ≥ 1 when this key is shown, so no `=0` branch is needed. |
| `list.undo` | `Undo` | `Rückgängig` | Inside the status banner, after Add all / Save as mine / Replace — **including the full-cap case whenever `added > 0`** (**S2-4** — a capped Add all is still a multi-item write, same as an uncapped one; only a fully-rejected `added = 0` write has nothing to undo) |
| `list.replaced_notice` | `Your list was replaced.` | `Deine Liste wurde ersetzt.` | After Replace, prefixed to the Undo control |
| `list.undone` **(new, R2)** | `Your previous list is back.` | `Deine vorherige Liste ist wiederhergestellt.` | After tapping Undo — replaces the previous banner text; no count, no plural |

### 3.6 Added-items status — a nested plural on two independent counts

Architect §5: "Inline status: '3 added · 2 already in your list'". Both counts can independently be 0, 1, or N (identical own/shared list → `added = 0`; brand-new own list → `present = 0`), so this needs the same nested-plural discipline as `split_summary`/M2, on two arguments, `added` and `present` (plus `rejected` for `list.full`, §3.5) that are now in `message-lint.test.ts`'s `COUNT_NAMES` set (**S2-6**, Files table) and enforced by it, not merely written correctly by hand. **(S3-2: the earlier statement that these names were "not in `COUNT_NAMES`" is deleted — it was true of the first draft and went stale the moment S2-6 landed.)** German nouns here are invariant — `Artikel` singular = plural, confirmed already in `de.json` `item_one`/`item_other`; the verb still agrees, `ist`/`sind`.

**Key `list.added_summary`** (args: `added`, `present`):

**Correction (M2-2 — reachable `(0,0)` case, and periods):** `added=0, present=0` happens when the own list is already at 200 items and none of the shared ones are in it: "Add all" adds nothing, nothing was already present, everything is rejected by the cap. The first draft's `added=0` branch had no `=0` for `present`, so it rendered "0 items already in your list" — nonsense. Added a `=0 {No items added.}` leaf. Also: every leaf now ends in a period. **Composition rule (fixes the second half of M2-2):** `added_summary` is always one complete sentence; `list.full` (§3.5, itself now a complete sentence with its own period) is appended as a **second sentence** in the same banner when `rejectedByCap > 0`, joined by a single space — never glued mid-sentence. The Builder renders `{addedSummaryText} {fullText ?? ''}`.trim(), not a hand-built concatenation of fragments.

EN:
```
{added, plural,
  =0 {{present, plural,
        =0 {No items added.}
        one {# item already in your list.}
        other {# items already in your list.}}}
  one {{present, plural,
        =0 {{added} item added.}
        other {{added} item added · # already in your list.}}}
  other {{present, plural,
        =0 {{added} items added.}
        other {{added} items added · # already in your list.}}}
}
```

DE:
```
{added, plural,
  =0 {{present, plural,
        =0 {Keine Artikel hinzugefügt.}
        one {# Artikel ist bereits in deiner Liste.}
        other {# Artikel sind bereits in deiner Liste.}}}
  one {{present, plural,
        =0 {{added} Artikel hinzugefügt.}
        other {{added} Artikel hinzugefügt · # bereits in deiner Liste.}}}
  other {{present, plural,
        =0 {{added} Artikel hinzugefügt.}
        other {{added} Artikel hinzugefügt · # bereits in deiner Liste.}}}
}
```

**ICU gotcha (Challenger M2's lesson, applied here too):** inside the nested `present` plural, `#` refers to `present`, not `added` — the outer count is written explicitly as `{added}` in every branch that needs it. The Builder must not "simplify" this to `#` (that was exactly M2's bug).

Test matrix to write (mirrors M2's requirement for `(1,1)`, `(3,1)`, `(3,2)`, plus the new **(0,0)** case from M2-2): `(added=0, present=0)`, `(added=3, present=0)`, `(added=1, present=0)`, `(added=0, present=1)`, `(added=0, present=2)`, `(added=3, present=2)`, `(added=1, present=1)` — both locales. Plus one composition test: `added_summary` + `list.full` render as two space-joined, independently-punctuated sentences, e.g. EN "2 items added. Your list is full (200 items) — 3 items weren't added."

### 3.7 Dismiss / drawer copy — unchanged

`list.notice_dismiss` from the superseded spec is **not needed** — there is no dismissible banner any more (no redirect banner to dismiss; the status banner clears on the next action or on navigating away, §6.3). `list.title`, `list.done`, `list.remove`, `list.item_one/other`, `list.where_to_buy`, `list.estimated_total`, `list.empty_title/body`, `list.browse_deals` are all unchanged (already live).

---

## 4. Messages-file diff (both `en.json` and `de.json`, under `"list"`)

Add: `shared_title`, `shared_description`, `unavailable_notice`, `overflow_notice` **(M2-1)**, `none_available_title`, `none_available_body`, `link_empty_title`, `link_empty_body`, `shared_split_summary`, `add_all`, `save_as_mine`, `add_one_aria` **(M2-6)**, `in_your_list_aria` **(M2-6)**, `replace_mine`, `all_in_list` **(S2-2)**, `open_mine`, `full`, `undo`, `undone` **(new, R2)**, `replaced_notice`, `added_summary`.

Do not add: `expired_notice` (renamed, never shipped), `notice_dismiss` (not needed), **`add_one`, `in_your_list`** (**S3-3** — no visible label exists on the icon-only per-item button; only the `_aria` accessible-name keys ship). Do not touch: anything already live (`title`, `description`, `done`, `remove`, `item_one`, `item_other`, `where_to_buy`, `split_summary`, `estimated_total`, `share_whatsapp`, `copy_link`, `copied`, `email`, `clear`, `empty_title`, `empty_body`, `browse_deals`).

**Also (S2-6):** `message-lint.test.ts`'s `COUNT_NAMES` set (currently `count, n, items, stores, deals, days, weeks, months`) gains `added`, `present`, `rejected` — these three are count-shaped exactly like the existing entries, and the spec's first draft had to rely on the author getting the plural right by hand instead of the lint catching a mistake, which is exactly the drift class this lint exists to stop.

Run `cd web-next && npm test -- message-lint` before this goes to the Challenger — it is the acceptance gate for every string above.

---

## 5. Wireframes — 320px, every state

All layouts: 16px side gutter, content max-width fills viewport at 320px (no fixed max-width until ≥600px, matching the existing `ListShareBody` container). Body text 16px, mono eyebrow 11px uppercase tracked, matches existing `/list` and drawer typography.

### 5.1 Case `ok` — all items current, own list **non-empty and different**

**Per-item control corrected (S2-1):** at 320px minus 2×16px gutter = 288px, minus a 48px image, a text button ("Hinzufügen" ~100px, "In deiner Liste" ~130px) leaves too little room for the product name in German and wraps to 3 lines. Fixed to an **icon-only 44×44px button** (`Plus` before / `Check` after) whose visible label is gone but whose accessible name is `list.add_one_aria`/`list.in_your_list_aria` (**M2-6**) — verify on a real DE render at 320px before shipping, per the project's "verify visually, not theoretically" rule.

```
┌────────────────────────────── 320px ─┐
│ SHARED LIST                          │
│                                       │
│ FRUIT & VEG · 2 Artikel               │
│ ┌───────────────────────────────────┐│
│ │[img] Bananen Bio             (+) ││ icon-only, 44x44, aria-label
│ │      Migros · CHF 2.20            ││ "Add Bananen Bio to my list"
│ ├───────────────────────────────────┤│
│ │[img] Äpfel Gala               (✓)││ aria-label "Äpfel Gala is in
│ │      Coop · CHF 1.80              ││ your list", aria-disabled=true
│ └───────────────────────────────────┘│ ← already in recipient's own list
│                                       │
│ WHERE TO BUY                          │
│ These 2 items are cheapest at one    │
│ store:                                │
│ Migros · 2 items         CHF 4.00    │
│ ─────────────────────────────────    │
│ Estimated total          CHF 4.00    │
│                                       │
│ ┌───────────────────────────────────┐│
│ │  Add all to my list               ││ h-12, full width, primary
│ └───────────────────────────────────┘│
│  Replace my list with this one        │  text-style, min-h-11 (S2-7 wording)
└───────────────────────────────────────┘
```

### 5.2 Case `ok` — own list **empty**

Same items/summary block; the action row collapses to one button (Architect §5: "If the own list is empty... offering both would be a pointless choice"):

```
│ ┌───────────────────────────────────┐│
│ │  Save as my list                  ││ h-12, full width, primary
│ └───────────────────────────────────┘│
```

No "Replace" line at all — nothing to replace.

### 5.3 Case `ok` — own list **non-empty and identical** (same ids)

Items/summary block unchanged. Per-item rows already show the check icon (`aria-disabled`) for every item (all already present).

**Corrected (S2-2):** the first draft kept "Add all to my list" active here — a false affordance (Norman): every row already says "in your list", yet the primary button still invites a tap that visibly does nothing. Replaced with a static line, same treatment already used to hide "Replace" in this state:

```
│  All items are in your list           │  static text, list.all_in_list
│ ┌───────────────────────────────────┐│
│ │  Open my list                     ││ secondary button, always usable
│ └───────────────────────────────────┘│
```

No "Add all" button, no "Replace" button (Architect §5: Replace shown "only when the own list is non-empty and differs" — identical ids means nothing to replace; now, by the same logic, "Add all" has nothing to add either).

### 5.4 Case `partial` — some items not on offer this week

```
┌────────────────────────────── 320px ─┐
│ SHARED LIST                          │
│ ┌───────────────────────────────────┐│
│ │ⓘ 1 item from this link isn't on   ││ static text, part of page
│ │  offer this week.                 ││ content — no dismiss, no
│ └───────────────────────────────────┘│ aria-live (§6.2)
│ ┌───────────────────────────────────┐│
│ │ⓘ 3 more items from this link      ││ list.overflow_notice (M2-1) —
│ │  can't be shown (limit 200).      ││ stacks below unavailable_notice
│ └───────────────────────────────────┘│ when the link was also truncated
│                                       │
│ FRUIT & VEG · 1 Artikel               │
│ ┌───────────────────────────────────┐│
│ │[img] Bananen Bio            [Add] ││ only the resolved item renders —
│ └───────────────────────────────────┘│ the unavailable one is simply
│                                       │ absent (§7 S2, known limit)
│ WHERE TO BUY  …  actions …            │ (as 5.1 / 5.2 / 5.3, by own-list state)
└───────────────────────────────────────┘
```

### 5.5 Case `none-available` — ids existed, none resolved

No redirect (unchanged rule from the superseded spec, now enforced by construction — `resolveSharedList` returns no items and `SharedListActions` never mounts a write path):

```
┌────────────────────────────── 320px ─┐
│ SHARED LIST                          │
│                                       │
│              🛍                       │  ShoppingBag icon, same visual
│                                       │  as ListDrawer's EmptyState
│   None of these items are on offer   │  h1
│   this week                          │
│                                       │
│   Offers change every week. Here's   │  body
│   what's on offer now.               │
│                                       │
│  ┌─────────────────────────────────┐ │
│  │       Browse deals              │ │  h-11, bg-signal, → /deals
│  └─────────────────────────────────┘ │
└───────────────────────────────────────┘
```

### 5.6 Case `link-empty` — malformed or empty `items` param

Identical layout to 5.5, different copy (must not say "not on offer" — nothing was ever identified):

```
│              🛍                       │
│         Nothing to show              │  h1
│  This link doesn't point to any      │  body
│  items. Here's what's on offer this  │
│  week.                                │
│  [ Browse deals ]                    │
```

### 5.7 Status banner — after a write (Add all / Save as mine / Replace)

Appears above the action row, replacing whatever status was there before (only the most recent action's status is shown):

```
│ ┌───────────────────────────────────┐│
│ │ 2 items added · 1 already in your ││ role="status" aria-live="polite"
│ │ list.                    [Undo]   ││ (§6.3 — safe here, unlike M5,
│ └───────────────────────────────────┘│  because no drawer is opening)
│ ┌───────────────────────────────────┐│
│ │  Open my list                     ││ secondary, appears once any
│ └───────────────────────────────────┘│  write has happened
```

Replace variant: `Your list was replaced.  [Undo]`.

**Corrected — full-cap variant keeps Undo (S2-4):** `2 items added. Your list is full (200 items) — 3 items weren't added.  [Undo]`. The first draft dropped Undo whenever the cap was hit, but a capped Add all is still a multi-item write like any other — there is something to undo (the 2 that *were* added). Undo is omitted only when `added = 0` (nothing was written).

**Focus after the write (M2-3 — corrects §6.3's "focus stays on the button just pressed," which isn't always true):** after **Replace** or **Save as mine**, the button the user tapped can itself disappear from the state it produces — Replace makes the own list identical to the shared list, which (§5.3) hides Replace entirely; Save-as-mine makes the own list non-empty, which swaps the button to "Add all"/the all-in-list line. If that element unmounts while it holds focus, focus silently drops to `<body>` — the same class of bug §6.4 already fixes for per-item Add, just triggered by the *primary* action this time. **Fix:** after Replace and Save-as-mine specifically, move focus programmatically to the status banner's **Undo** button once it renders (it's always present after these two writes, per S2-4's logic, and it's the next useful action). After a plain **Add all** merge (own list stays non-empty and still differs, or becomes all-in-list), the button does *not* unmount, so §6.3's original rule (focus stays put) still holds there — only Replace/Save-as-mine need the explicit move. `aria-live="polite"` still carries the announcement; moving focus to Undo inside that same region does not double-announce, because no dialog is competing for it (unlike M5).

**Focus after Undo itself (R2 — a follow-on bug the M2-3 fix introduces one step later):** tapping Undo consumes the snapshot and clears the banner — including the Undo button that currently holds focus. Without a further fix, focus would drop to `<body>` right after Undo, the same failure class M2-3 just fixed one step earlier. **Fix:** after Undo restores the previous list, move focus to the **primary action of the restored state** — concretely, "Replace my list with this one" after undoing a Replace, "Save as my list" after undoing a Save-as-mine, "Add all to my list" (or the `list.all_in_list` state's "Open my list") after undoing an Add all. The status region's text also changes at this point to the new key `list.undone` ("Your previous list is back." / "Deine vorherige Liste ist wiederhergestellt.") — a short, count-free confirmation, not a repeat of `added_summary`, since the merge/replace numbers no longer describe the current (reverted) state.

**Undo has a shelf life (M2-4 — a new invariant):** a snapshot from Replace/Save-as-mine/Add-all is valid **only until the next write to the recipient's own list** — another per-item Add, a remove/clear from the drawer (reachable from this page via "Open my list"), a second Add all/Replace, or a change synced from another tab via the `storage` event. Any of these clears the current banner and its Undo silently (there is nothing to announce — the banner just reflects the newest state). Without this rule, sequence "Add all → per-item Add → Undo" would silently delete the per-item addition too, which is not what "undo *that*" promised. Costs one store subscription in `SharedListActions`/the shared status component.

**Per-item Add gets a status too, without Undo (M2-6):** tapping a per-item `Add` sends "1 item added." (`added_summary` with `added: 1, present: 0`) to the same `aria-live` status region — the button's own label swap (icon changes, `aria-disabled` set) is not reliably re-announced on its own. No Undo control is shown for this one (§6.5, unchanged): the drawer's remove covers it, and it does not count as a "write" for the M2-4 shelf-life rule unless the user was in the middle of an Undo-eligible multi-item action, in which case M2-4 applies and clears that Undo.

### 5.8 Disabled-until-hydrated state (all cases with actions)

Before `useListStore.persist.hasHydrated()` resolves. **Corrected duration and treatment (S2-3):** this is not "one frame" — the localStorage read is synchronous, but it only runs after the JS bundle has loaded and hydrated, which on a slow mobile connection can be visibly seconds, not a flash (§6.6 corrected to match). Two further problems in the first draft, both fixed here:

- **(b) Label flip.** The primary button's final label depends on whether the own list is empty ("Save as my list") or not ("Add all to my list") — information we don't have yet. Flashing one label and then swapping to the other reads as a glitch. Fixed: render a **neutral skeleton bar** in place of the label (no text at all), not a guessed label that might flip.
- **(c) Contrast.** Flat 60% opacity on real text can fall under 4.5:1. WCAG's exemption for inactive controls is legal cover, not a design target (project rule: bake standards in, don't rely on exemptions). Fixed: the skeleton bar is a neutral fill (`--color-line-strong`, already used at sufficient contrast for borders elsewhere), not dimmed text — there is no text to fail contrast.

**R3 — `SharedItemAddButton` must be inert pre-hydration too, and this is a data-correctness requirement, not only an accessibility nicety.** The bullets above cover the multi-item action row; the per-row buttons need the same rule stated explicitly, because getting it wrong loses data silently: if a per-item `Add` writes to `useListStore` *before* `persist` has hydrated, hydration then replaces `items` with whatever was in the stored blob — overwriting, and silently discarding, the add that just happened. **Required:** every `SharedItemAddButton` renders `aria-disabled="true"` with an `onClick`/keyboard no-op until `useListStore.persist.hasHydrated()` is `true` — exactly the same `aria-disabled`-not-`disabled` treatment as its post-hydration "in your list" state (§6.4), just gated on hydration instead of membership. Rows show the neutral (pre-decision) `Plus`-style icon, never the `Check`, during this window.

```
│ ┌───────────────────────────────────┐│
│ │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓                 ││ h-12 button shell, aria-disabled,
│ └───────────────────────────────────┘│ aria-busy="true" on the action
│                                       │ region; skeleton fill, no label;
│[img] Product name              (+)   │ per-item button also aria-disabled
│      Store · CHF x.xx                │ (R3) — inert, not just visually
│                                       │ neutral, until hasHydrated()
```

No "Replace" line, and no "All items are in your list" line, is shown pre-hydration under any circumstance — offering either to someone whose own list state we haven't read yet would be a guess dressed up as a fact (Architect §5; Rams #6). Per-item rows likewise show the neutral (not-yet-decided) `Plus`-style icon, never the check, until hydration — and, per **R3** above, that icon is `aria-disabled` and inert, not merely visually neutral.

---

## 6. Interaction and accessibility detail

### 6.1 Touch targets, focus, redundant encoding
- Every button/link: minimum 44×44px hit area (`Add`, per-item toggle, `Add all`/`Save as mine` h-12, `Replace`/`Undo` min-h-11), 8px+ spacing between adjacent targets.
- Focus ring: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2` — the same token already used on `chip.tsx`/`button.tsx`, plus the project-wide `:focus-visible` fallback in `globals.css`. No new token needed.
- The unavailable-items notice (§5.4) uses an info glyph (`lucide-react` `Info`, neutral ink, never a warning/red icon — Swiss tone, calm and factual) **and** text **and** position (top of page) — never colour alone.
- **Updated for S2-1:** the per-item control is icon-only (`Plus` → `Check`), so "in your list" is communicated by icon shape change **and** the button's `aria-disabled` visual weight **and** its accessible name (`list.in_your_list_aria`, §3.5/M2-6) — never a colour change alone, and never icon-alone either (the accessible name carries the same information for anyone not seeing the icon).

### 6.2 Why the unavailable-items notice needs no `aria-live` or focus handling (M5, S1, S4 — not applicable)
The old spec's hardest problems (M5's focus race with Vaul, S1's two-X-buttons confusion, S4's h1-read-then-lost) all existed because the notice had to survive a client-side redirect into a drawer that was simultaneously running its own focus trap. That redirect no longer exists. The notice in §5.4 is static page content, present at first paint, read by a screen reader in document order like any other paragraph. It needs no `role="status"`, no `aria-live`, no programmatic focus move, and — because there is no second dismiss control fighting the drawer's own `Vaul.Close` — no dismiss button at all (there is nothing to dismiss; reloading or re-sharing the same link reproduces the same page, per Architect I3).

### 6.3 Why the post-write status banner (§5.7) DOES use `aria-live`, and that's safe here
This is a genuine live update inside an already-open page — the user is looking at the same page before and after tapping "Add all". Unlike the old banner, there is no Vaul dialog opening at the same moment to steal focus, so the M5 race does not recur. **Corrected (S3-1):** focus stays on the button the user just pressed (standard button-click behaviour) **except after Replace, Save as mine (§5.7, M2-3), and Undo (§5.7, R2)** — in those three cases the pressed button itself unmounts as a result of the write, and focus is moved programmatically instead (§5.7 for exactly where). `role="status" aria-live="polite"` on the banner container announces the result without moving focus in the unqualified case. Only one status is shown at a time — a second action replaces the banner's content rather than stacking.

### 6.4 "In your list" — `aria-disabled`, not the native `disabled` attribute
Architect §5 specifies the per-item control becomes disabled once the id is already in the own list. Using the native `disabled` attribute removes the element from the tab order; if it currently holds keyboard focus at the moment it becomes disabled, focus is dropped to `<body>` — a real, common accessibility regression. **Corrected citation (Challenger ruling §"Ruling on the Designer's two self-resolved findings"):** the relevant WCAG criteria are **2.4.3 Focus Order** (focus must not jump unpredictably to `<body>`) and **4.1.2 Name, Role, Value** (`aria-disabled` must correctly expose the control's state to assistive tech) — not 2.4.11 Focus Not Obscured, which is about visibility, not the disabling-a-focused-element failure mode this fixes. Use `aria-disabled="true"` with a `pointer-events-none` visual treatment and an `onClick` no-op instead, so the element stays focusable and the tab order doesn't jump. This is `SharedItemAddButton` (§M2-5) rendered as a real `<button>`, so the no-op also covers keyboard activation (Enter/Space), not only pointer clicks. This satisfies Architect §5's intent (no further action possible) without the focus-loss side effect.

**Corrected (S3-4) — the check icon itself does not dim.** The `Check` icon still carries meaning ("already in your list" — the icon shape is one of the three redundant signals in §6.1) and so, unlike the button's surrounding chrome, it must keep at least **3:1 non-text contrast** against its background (WCAG 1.4.11 Non-text Contrast). A blanket reduced-opacity treatment on the whole control (the pattern the "In your list" row used before this correction) risks dropping the icon itself below that ratio. Fixed: the icon renders in a solid neutral ink colour at full opacity (e.g. `--color-ink-2`, already verified elsewhere against the paper/page backgrounds); only the button's non-essential chrome (e.g. a faint background tint distinguishing "done" from "actionable") may use reduced opacity, never the icon glyph that carries the meaning.

### 6.5 "Undo for every write" vs. Architect §5's "Undo is not needed" for per-item Add
The task brief for this spec asks for Undo on every write; the Architect's action table (§5) explicitly says per-item Add needs no Undo "because remove exists in the drawer." These are reconciled, not in conflict: per-item Add is reversible at all times via the recipient's own `ListDrawer` (open it, tap remove) — that satisfies "every write is undoable" without adding a second, redundant control on this page. A dedicated Undo affordance is reserved for `Add all`/`Save as mine`/`Replace`, where undoing multiple items or a full replacement via the drawer's one-at-a-time remove would be real friction (Dill: Friction Log). No PM decision needed here — this is a Designer-level reconciliation of two consistent requirements, not a genuine disagreement. A per-item Add still sends its own status text to the announcement region (§5.7, M2-6) and, per M2-4, still counts as "a change to the own list" that invalidates any Undo currently offered from an earlier multi-item action.

### 6.6 Loading/skeleton
**Corrected (S2-3a):** the disabled-until-hydrated window is **not** a single frame — the localStorage read itself is synchronous, but it only runs once the JS bundle has loaded and React has hydrated, which on a slow mobile connection is visibly seconds. It is still short enough that a full multi-element skeleton screen (matching every row's future shape) would be over-engineering for this one component (CLAUDE.md: "Reject over-engineering... one developer, free tier") — the fix in §5.8 is a single neutral skeleton **fill** inside the existing button shell, not a new component, which satisfies Nielsen's visibility-of-status heuristic and avoids both the label-flip (S2-3b) and the contrast risk (S2-3c) without extra build cost.

---

## 7. Known limits carried forward, unchanged (Challenger S2, S3, S5, S6)

- **S2 — can't name the unavailable items.** The URL carries ids only, so the notice (§3.2, §5.4) can only give a count, not which product. Recorded as a known v1 limit; a future option (id→name archive, or short names in the link) is a PM call, not made here.
- **S3 — locale of link vs. recipient.** Unchanged requirement: a DE link opened by an EN-preference browser keeps `?items=` through any `next-intl` `as-needed` redirect and resolves the same items; copy renders in whichever locale the page finally renders in; items added carry the rendered locale's `productName` (snapshot fetched with that locale).
- **S5 — `aria_b_days` "yesterday" wording.** Unaffected by this spec (Part B, live). Not touched.
- **S6 — banner visible at 320px without scrolling the drawer.** Restated for this page: the unavailable-items notice (§5.4) and the status banner (§5.7) must both be visible at 320px without any scroll beyond the page's own natural scroll — neither sits inside a fixed-height scroll container the way the old drawer banner did.
- **fr/it parity** — out of scope here, same as Part B; `message-lint.test.ts` only scans `en`/`de` today (its own header comment says so) because routing is de/en only.

---

## 8. Acceptance criteria (Given/When/Then — write these first, TDD)

### Content states
1. **Given** a link with 2 ids, both matching current deals, **when** the page renders, **then** both items appear under "Items by category", no notice is shown, and `WhereToBuy` renders `shared_split_summary` (not `split_summary`).
2. **Given** a link with 3 ids where 1 doesn't resolve, **when** the page renders, **then** exactly 2 items render, and the `list.unavailable_notice` `one` form ("1 item...isn't on offer this week.") is present as static page content (no `role="status"`, no `aria-live` attribute on that element).
3. **Given** a link with 4 ids where 2 don't resolve, **then** `list.unavailable_notice` uses the `other` form with count 2.
4. **Given** a link with N ids where none resolve, **when** the page renders, **then** it shows `list.none_available_title`/`body` and a `Browse deals` link to `/deals`, and no `ItemsByCategory`/`WhereToBuy`/`SharedListActions` render at all.
5. **Given** an empty, missing, or purely-punctuation `items` param, **when** the page renders, **then** it shows `list.link_empty_title`/`body` (never the "not on offer" copy), same layout as case 4.
6. **Given** a link with a truncated trailing id ending in `%E2%8`, **when** the page renders, **then** it does not throw, the malformed id is dropped, and it is counted in `unavailableCount` (TL.4 point 1).
7. **Corrected (M2-1). Given** 250 unique ids in the link where all 250 would resolve to current deals, **when** the page renders, **then** exactly 200 items are shown, `list.unavailable_notice` is **not** shown (none of the 200 shown items are unavailable — they're just capped), and `list.overflow_notice` shows the `other` form with count 50. `unavailableCount` (feeding `unavailable_notice`) and `overflow` (feeding `overflow_notice`) are tracked and rendered **separately** — overflow is never folded into "not on offer this week."
7a. **New (M2-1). Given** 250 unique ids where the first 200 (within the cap) contain 190 resolving ids and 10 that don't, and the remaining 50 are over-cap, **when** the page renders, **then** both `list.unavailable_notice` (count 10) and `list.overflow_notice` (count 50) render as two stacked, independent lines, and the 190 resolved items are shown.

### Actions and the recipient's own list
8. **Given** the recipient's own list is empty, **when** the page renders, **then** only "Save as my list" is shown (no "Add all", no "Replace"); **when** they tap it, **then** their list becomes exactly the shared list's available items, and the status banner reads `list.added_summary` with `present = 0`.
9. **Given** the recipient's own list is non-empty and shares no ids with the shared list, **when** the page renders, **then** both "Add all to my list" and "Replace my list with this" are shown; tapping "Add all" merges by id (own order kept, new items appended) and reports `added_summary` with `present = 0`.
10. **Given** the recipient's own list already contains some of the shared ids, **when** they tap "Add all", **then** only the missing ones are appended, `added_summary` reports both `added` and `present` correctly (e.g. `added=2, present=1` → "2 items added · 1 already in your list" / DE equivalent).
11. **Corrected (S2-2). Given** the recipient's own list is identical (same ids) to the shared list's available items, **when** the page renders, **then** neither "Replace my list with this one" **nor** "Add all to my list" is shown — instead the static line `list.all_in_list` ("All items are in your list") plus "Open my list" render. No button is offered that would be a no-op tap.
11a. **New (S2-2). Given** the same setup as #11, **when** the recipient later taps "Open my list" and removes one item from the drawer, **then** on any next render of the shared page (or a state re-check), "Add all to my list" reappears (the lists are no longer identical) and `list.all_in_list` no longer shows.
12. **Given** the recipient taps "Replace my list with this one", **when** the action completes, **then** their list exactly equals the shared list's available items, the previous list is retained in memory for the session, the banner reads `list.replaced_notice` + `Undo`, **and** (M2-3) focus moves programmatically to the Undo button (the Replace control itself has just unmounted per §5.3's rule).
12a. **New (M2-3). Given** the recipient's own list is empty and they tap "Save as my list", **when** the action completes, **then** focus moves to the status banner's Undo button, not to `<body>` — the primary button they pressed has been replaced by a different one ("Add all"/the all-in-list line) in the new, non-empty state.
13. **Given** the banner from #12, **when** the recipient taps "Undo", **then** their list is restored to the exact previous array (same order, same items) — not merely the same ids, **and (R2)** focus moves to the primary action of the restored state (here, "Replace my list with this one", since a Replace was undone) rather than dropping to `<body>`, and the status region now reads `list.undone` ("Your previous list is back.") instead of the earlier `list.replaced_notice`.
13b. **New (R2). Given** the recipient taps "Save as my list" and then "Undo", **then** focus moves to "Save as my list" (the restored state is an empty own list); **given** they tap "Add all to my list" and then "Undo", **then** focus moves to "Add all to my list" (or, if the restored state has every shared item already present, to "Open my list" per §5.3) — in every case `document.activeElement` is a real, visible control, never `<body>`.
13a. **New (M2-4 — Undo's shelf life). Given** the banner from #12 is showing its Undo control, **when** the recipient performs any further write to their own list before tapping Undo — a per-item Add on this page, a remove/clear in the drawer (opened via "Open my list"), or another Add all/Replace — **then** the banner and its Undo control are cleared silently, and Undo is no longer offered for the original Replace.
14. **Corrected (S2-4). Given** merging would push the own list over the 200 cap, **when** "Add all" is tapped, **then** items are added up to the cap, the remainder are rejected, the banner reads `added_summary` followed by `list.full` (both complete sentences, space-joined) with `{max}` and `{rejected}` interpolated, **and Undo is still offered** whenever `added > 0` (only an `added = 0` full-cap result — nothing written — omits Undo).
15. **Given** a per-item row whose id is not yet in the own list, **when** the recipient taps the icon-only `Add` control (**S2-1**), **then** that id is added to the own list, the row's control becomes the check icon with accessible name `list.in_your_list_aria` and `aria-disabled="true"` (not the native `disabled` attribute), the status region announces "1 item added." (**M2-6**), and no separate Undo is offered for that single action (unless it invalidates an earlier multi-item action's Undo per 13a).
15a. **New (M2-6). Given** three per-item rows, none yet in the own list, **when** a screen-reader user tabs through them, **then** each announces a distinct accessible name containing the product ("Add Bananen Bio to my list", "Add Äpfel Gala to my list", …) — never a bare, repeated "Add."
16. **Rewritten (R3). Given** the own list's `persist` store has not yet reported `hasHydrated()`, **when** the page first paints on the client, **then**: the multi-item action region renders `aria-busy="true"` with a neutral skeleton fill and no label text at all (not "Add all to my list" nor "Save as my list" — S2-3); every `SharedItemAddButton` renders `aria-disabled="true"` with a no-op click/keyboard handler and the neutral `Plus` icon (never the `Check`); neither "Replace my list with this one" nor `list.all_in_list` is rendered under any circumstance. **New (R3, data correctness). Given** the same pre-hydration state, **when** a `SharedItemAddButton` is activated anyway (e.g. a queued click that fires before the disabled state is visually reflected), **then** `useListStore.add` is **not** called — the click is a true no-op, not merely a styled one — so a subsequent hydration cannot silently overwrite an add that should have happened.

### The regression this whole spec exists to fix (PM P-14)
17. **Given** the recipient already has a non-empty list saved in `localStorage`, **when** they open `/list?items=…` (any of cases `ok`/`partial`/`none-available`/`link-empty`) and take **no action**, **then** the recipient's saved list in `localStorage` is **byte-identical** before and after — this is the regression test named in Architect §9 test 3, and it must pass even though the page fully renders the shared list's content on screen. **Corrected setup (S2-8):** seed the pre-existing blob at the store's **current `STORAGE_VERSION`** (2, as of `list-store.ts`) — zustand `persist`'s `migrate` hook writes back to storage on hydrate *only when it migrates* an older version, so seeding at a stale version would make the test fail for a reason unrelated to this page. Mount the **real page layout** (header list-count badge, `ListDrawer` present in the tree), not `SharedListView` rendered in isolation — the original regression (Architect §1) was a layout-level write (`HydrateAndRedirect` lived in the page tree, not inside the drawer), so the test must exercise the same tree shape to be a genuine regression guard.
18. **Rewritten (M2-5) — the original wording ("no code path under `app/[locale]/list/` other than `SharedListActions`") would pass trivially, because both client islands live under `components/list/`, not under `app/[locale]/list/`, so it tests nothing.** New wording: **Given** the full import graph of `web-next/src/app/[locale]/list/page.tsx` and everything it renders, **when** an architecture test walks it, **then** the only two modules that import `useListStore`'s write actions (`add`, `replaceAll`, `remove`, `clear`) are `SharedListActions.tsx` and `SharedItemAddButton.tsx` — an explicit allow-list, not a path prefix — and adding a third writer anywhere in that graph fails the test until the list is updated deliberately.

### Copy correctness
19. **Given** `list.added_summary` rendered with `(added: 1, present: 0)`, **then** EN reads "1 item added" and DE reads "1 Artikel hinzugefügt" — never "1 items added".
20. **Given** `list.added_summary` rendered with `(added: 0, present: 3)`, **then** EN reads "3 items already in your list" and DE reads "3 Artikel sind bereits in deiner Liste".
21. **Given** `list.shared_split_summary` rendered with `(items: 1)`, **then** EN reads "This item is cheapest here:" and DE "Dieser Artikel ist hier am günstigsten:" — confirming it never says "Your"/"Dein" (the ownership fix in §3.4).
22. **Given** `messages/message-lint.test.ts` run against the updated `en.json`/`de.json`, **then** it passes with zero findings, including the new EN/DE-argument-parity check on every key added in §4, and (**S2-6**) with `added`, `present`, `rejected` present in `COUNT_NAMES`.
22a. **New (M2-2). Given** `list.added_summary` rendered with `(added: 0, present: 0)`, **then** EN reads "No items added." and DE reads "Keine Artikel hinzugefügt." — never "0 items already in your list."
22b. **New (M2-2). Given** `added_summary` rendered with `(added: 2, present: 1)` composed with `list.full` rendered with `(rejected: 3, max: 200)`, **then** the banner text is exactly two space-joined, independently-punctuated sentences: EN "2 items added · 1 already in your list. Your list is full (200 items) — 3 items weren't added." / DE equivalent — never a fragment glued mid-sentence.
22c. **New (M2-1). Given** `list.overflow_notice` rendered with `(count: 1, max: 200)`, **then** EN reads "1 more item from this link can't be shown (limit 200)." and DE "1 weiterer Artikel aus diesem Link kann nicht angezeigt werden (maximal 200)."; with `count: 3`, EN "3 more items...", DE "3 weitere Artikel...können..."
22d. **New (S2-7). Given** `list.replace_mine`, **then** EN reads "Replace my list with this one" and DE "Meine Liste durch diese ersetzen" — not the earlier "damit ersetzen" wording.
22e. **New (S2-2/S2-5). Given** `list.full` rendered with `(rejected: 1, max: 200)`, **then** EN reads "Your list is full (200 items) — 1 item wasn't added." (singular "item", not "items") and DE "Deine Liste ist voll (200 Artikel) — 1 Artikel wurde nicht hinzugefügt."

### Locale (S3, unchanged)
23. **Given** a DE-built link (`/list?items=…`) opened in a browser with an `en` preference, **when** `next-intl`'s `as-needed` locale handling runs, **then** the `?items=` query string survives and the same ids resolve, rendered in whichever locale the page settles on.

---

## 9. PM decisions needed

**None new, through all three review rounds.** P-14 (this spec's whole premise — never replace/merge silently) is already decided. Everything else in this spec, including the second and third Design Challenger passes (M2-1…M2-6/S2-1…S2-8, and R1/R2/R3/S3-1…S3-4 in "Design Challenger re-review (2)" below), is a Designer-level resolution — round 3 confirmed no Tech Lead or PM ruling was actually sought or needed for M2-1/M2-5, correcting round 2's over-attribution (R1):

- M1–M4 (round 1) were fixed in the superseded spec's tables and are carried into §3 here (M1's `aria_b_months` fix is Part B, already live and untouched; M2's `split_summary` fix is Part B, already live; M3's "isn't on offer this week" wording is applied to `unavailable_notice`/`none_available_*`/`link_empty_body` in §3.2–3.3; M4's 200-cap-in-two-places is in the Files table and §8 items 7/14).
- M5, S1, S4 (round 1) are **not applicable** — their root cause (the redirect) no longer exists, per Architect §6, confirmed again in §6.2 above.
- S2, S3, S6 (round 1) are carried forward unchanged as known limits/requirements (§7).
- S5 (round 1) is Part B, live, untouched.
- S7 (round 1, the message-lint meta-test) is already built and live as `message-lint.test.ts` — verified read directly, quoted in §4/§8 item 22.
- **M2-1 (round 2 — Architect's overflow rule vs. this spec's TL.4-quoted formula):** the Design Challenger flagged that this spec's `count = … + overflow` formula contradicted the Architect's own explicit test 1 ("overflow is not counted as unavailable"). **Resolved: the Architect's rule wins** (**R1, corrected attribution** — not a new Tech Lead ruling; the Architect doc l.89 and test 1 already ratify it, and TL.4's own counting only followed the Designer's superseded A.6, so it doesn't survive against the Architect doc it postdates) — §3.2 is corrected, `list.overflow_notice` is a new, separately-honest line. TL.4's mechanism (`{ ids, overflow }`) is unchanged.
- **M2-5 (round 2 — per-item Add can't be server-rendered as originally specified):** resolved as an implementation correction within this spec's own scope — `SharedItemAddButton` is a second, small client island, not a redesign of the page's read-only/no-JS shape (most of the page is still server-rendered). No separate Tech Lead ruling was sought or is needed; the fix follows directly from the Architect's own component boundaries (§4).
- **M2-2, M2-3, M2-4, M2-6 (round 2)** and **all of S2-1…S2-8 (round 2)** are Designer-level copy, composition, focus-management and accessibility corrections — applied directly in §3, §5, §6, §8 above, each marked with its finding id.
- The `shared_split_summary` ownership fix and the `aria-disabled`-not-`disabled` fix (both round 1, §3.4/§6.4) were upheld by the round-2 review as correctly Designer-level calls; the review corrected the WCAG citation in §6.4's rationale to 2.4.3/4.1.2 (not 2.4.11), applied above.
- **R1 (round 3):** removed the false "Tech Lead confirmed" claim from §3.2 and this section — no Tech Lead was actually consulted for the M2-1 counting rule. It's resolved by tracing directly to the Architect doc (l.89, test 1) and Challenger M4/M2-1, which is a documentation-honesty fix, not a new decision of any kind.
- **R2, R3 (round 3):** a focus-loss bug in the M2-3 fix itself (Undo unmounting and dropping focus) and an unstated inertness requirement on `SharedItemAddButton` pre-hydration — both are Designer-level UX/a11y corrections to this spec's own prior draft, applied in §5.7/§3.5 (`list.undone`) and §5.8/§8 item 16.
- **S3-1…S3-4 (round 3)** are documentation-consistency and accessibility-contrast cleanups within this spec — §6.3's focus sentence, the stale §3.6 `COUNT_NAMES` remark, the two unused visible-label keys, and the check icon's contrast — all applied above.

If the Design Challenger's next pass disagrees with any of the above being resolvable at Designer level rather than needing a Tech Lead or PM call, that routes through the Universal Resolution Loop as usual — not decided unilaterally here.

---

## 10. Summary for the Builder

- Delete `HydrateAndRedirect.tsx`. No redirect, no `ui-store.listNotice`.
- New pure domain functions: `resolveSharedList`, `mergeLists`, and the shared `MAX_LIST_ITEMS` constant (Files table, §1). `resolveSharedList` reports `unavailableCount` and `overflow` **separately** (M2-1) — never combine them.
- Extract `ItemsByCategory`/`WhereToBuy` out of `ListDrawer.tsx` into their own files with an ownership/read-only prop; both the drawer and the new `SharedListView` render through them.
- **Two** client islands touch `useListStore` on this route — `SharedListActions.tsx` (multi-item actions) and `SharedItemAddButton.tsx` (per-row, M2-5) — enforced by an import-graph allow-list test, not a path-prefix test (§8 item 18, rewritten). Both are `aria-disabled` and inert (no store write on click) until `useListStore.persist.hasHydrated()` (R3, §5.8, §8 item 16) — this is a data-correctness requirement, not only accessibility polish.
- Per-item controls are icon-only 44×44px with `aria-label`s carrying the product name (§5.1, M2-6/S2-1) — verify the real DE render at 320px before shipping, and keep the `Check` icon itself at full opacity/solid colour for contrast (S3-4) even though surrounding chrome may be visually muted.
- The post-write status banner moves focus to its Undo control after Replace/Save-as-mine specifically (M2-3), **and moves focus again to the restored state's primary action after Undo itself, switching the text to `list.undone`** (R2, §5.7) — any further list write invalidates a still-showing Undo (M2-4). All of this needs a small amount of state in `SharedListActions`, not new global store fields.
- Add `added`, `present`, `rejected` to `message-lint.test.ts`'s `COUNT_NAMES` (S2-6). Do **not** add `list.add_one`/`list.in_your_list` — dropped as unused (S3-3); only the `_aria` accessible-name keys ship.
- All copy is in §3/§4, ready to paste into `messages/en.json`/`de.json`; run `message-lint.test.ts` before sending back to the Challenger.
- Zero open findings before Build, per the Universal Resolution Loop.

---

## Design Challenger review (2) — 2026-09-27

**Verdict: NOT ready for Build — 6 MUST-CHANGE, all small and on paper.** The separate-view design is right: it deletes the redirect race, the drawer-banner plumbing and the silent overwrite in one move, and the Google Keep / Amazon pattern (a shared list sits *beside* yours, you choose what to copy) is now what we do. Copy tone is calm and Swiss in both languages. The findings below are about counting honesty, one unreachable-looking ICU branch that is reachable, focus loss after the button you pressed disappears, and one architecture contradiction the Builder will hit on day one.

Evidence read: this spec in full; Architect doc (`2026-09-27-architect-shared-list-separate-view.md`, esp. l.47–80, test list l.123–129); live `messages/message-lint.test.ts` (`COUNT_NAMES` l.20, `EXEMPT` l.23); live `en.json` `list.split_summary` (l.114, nested shape confirmed).

### MUST-CHANGE

**M2-1 — Over-cap ids are counted as "not on offer" (test #7, §3.2). This re-opens M4 and contradicts the Architect.** The Architect's own test 1 says: *"Overflow is not counted as unavailable (M4)."* This spec says the opposite (`endedCount = … + overflow`, test #7 "not silently dropped from the count"). Over-cap ids may be perfectly current deals; telling the recipient "50 items aren't on offer this week" is false. It is also reachable without a hand-made link: lists saved *before* the store cap ships can already exceed 200 (`sanitizeItems` does not cap). Fix: `unavailableCount = unique ids within cap − resolved`. If `overflow > 0`, show a separate, honest static line, e.g. EN `{count, plural, one {# more item from this link can't be shown (limit {max}).} other {# more items from this link can't be shown (limit {max}).}}` / DE `{count, plural, one {# weiterer Artikel aus diesem Link kann nicht angezeigt werden (maximal {max}).} other {# weitere Artikel aus diesem Link können nicht angezeigt werden (maximal {max}).}}` (key e.g. `list.overflow_notice`). Rewrite test #7 accordingly. The TL.4 formula quoted in §3.2 conflicts with the Architect — Tech Lead to confirm the Architect's version wins.

**M2-2 — `added_summary` renders "0 items already in your list" in a reachable state.** `added=0, present=0` happens when the own list is already at 200 and none of the shared items are in it: "Add all" adds nothing, nothing was present, everything rejected by cap. The `added=0` branch has no `=0` for `present`, so EN gives "0 items already in your list", DE "0 Artikel sind bereits in deiner Liste". Add `=0 {No items added}` / `=0 {Keine Artikel hinzugefügt}` inside the `added=0` branch, and add `(0,0)` to the test matrix (§3.6) and a test for the full-list case. Also define the composition with `list.full` precisely: the wireframe (§5.7) shows "2 items added. Your list is full…" and "…in your list." with a trailing period, but `added_summary` has no period. Either give `added_summary` a closing period in every branch (EN+DE) or render the two as separate lines — pick one and put it in the spec, so the Builder doesn't glue strings.

**M2-3 — Focus is lost after Replace / Save as my list (the same bug §6.4 fixes for per-item Add).** After "Replace my list with this", the own list equals the shared list → by §5.3's rule Replace is **no longer rendered** → the focused button unmounts → focus drops to `<body>`. After "Save as my list", the own list is no longer empty → the button becomes "Add all" (if it's a different element, same loss). §6.3's "focus stays on the button the user just pressed" is not true for these two. Fix: after Replace and Save-as-mine, move focus to the status banner's **Undo** button (it's the next useful action and it's always present after these writes). Keep the `aria-live="polite"` region for the text; moving focus to Undo inside it is fine (no dialog opens, so no M5-type race). Add an acceptance test: after Replace, `document.activeElement` is the Undo button.

**M2-4 — Undo can silently destroy later edits.** Undo restores a snapshot "for the session" (Architect I2). Sequence: Add all → per-item Add (or remove something in the drawer, which can be opened from this page via "Open my list") → tap Undo → the later edit is gone too, with no message. Rule: **Undo is valid only until the next change to the own list.** Any later write (per-item Add, drawer remove/clear, another Add all/Replace, or a change from another tab via the `storage` event) clears the banner and its Undo. Add a test: Add all → per-item Add → Undo control is gone. This keeps Undo honest ("undo *that*") and costs one store subscription.

**M2-5 — Architecture contradiction: per-item Add can't be server-rendered.** §2 says everything above `SharedListActions` is server-rendered and JS-free, and §8 #18 says only `SharedListActions` touches the store. But every row in `ItemsByCategory` carries an `Add` / `In your list` control that needs `onAdd`, hydration state and `addedIds` — a server component can't pass `onAdd` down, and the rows sit *above* `SharedListActions`. The Builder must either (a) make each per-item control a tiny client island (e.g. `SharedItemAddButton`, the second allowed store writer), or (b) render the item list inside the client island. Recommend (a): row text stays server-rendered, only the 44px button hydrates. Update the Files table, §2, and rewrite test #18 as an import-graph allowlist (`SharedListActions`, `SharedItemAddButton`) — the current wording ("under `app/[locale]/list/`") would pass trivially because both components live in `components/list/`, so it tests nothing.

**M2-6 — Per-item buttons all have the same accessible name.** A screen-reader user tabbing or using the buttons list hears "Add, Add, Add, In your list, Add…" — no way to know which product (WCAG 2.4.6 Headings and Labels / 2.5.3 Label in Name). Keep the short visible label but give each an accessible name that contains it and the product: new keys `list.add_one_aria` EN `Add {product} to my list` / DE `{product} zu meiner Liste hinzufügen`, and `list.in_your_list_aria` EN `{product} is in your list` / DE `{product} ist in deiner Liste`. (`{product}` is not a count name, lint-safe.) Also: per-item Add produces no announcement at all — the label change on a focused button is not reliably re-announced. Send "1 item added" / "1 Artikel hinzugefügt" to the same status region, without Undo (consistent with §6.5).

### SHOULD-CHANGE

**S2-1 — Per-item control width at 320px, DE.** The wireframe shows "[✓ In list]" but the copy is "In deiner Liste" (~130px with icon) and "Hinzufügen" (~100px). At 320px minus 2×16px gutter = 288px, minus a 48px image, the product name gets ~110–140px and wraps to 3 lines ("Bio Vollmilch Past. 1l"). Either use an icon-only 44px button (plus / check) with the M2-6 aria-label, or put the control on its own line under name/price. Verify on a real DE render at 320px before shipping (Visual, not reasoned — project rule).

**S2-2 — "Add all" stays active when everything is already in the list (§5.3).** Every row says "In your list", yet the primary button still invites a tap that does nothing. That's a false affordance (Norman). Replace the action row with a static line "All items are in your list" / "Alle Artikel sind in deiner Liste" plus "Open my list". Same logic the spec already applies to hide Replace.

**S2-3 — Pre-hydration is not "one frame".** The localStorage read is synchronous, but it only runs after the JS bundle loads and hydrates — on a slow mobile connection that's seconds of disabled buttons. Acceptable, but (a) correct §6.6's rationale, (b) the primary label flips from "Add all" to "Save as my list" after hydration for empty-list users — render a neutral label pre-hydration or reserve the final one only after hydration, and (c) don't use 60% opacity for the disabled state if it drops text below 4.5:1; the WCAG exemption for inactive controls is legal cover, not good design.

**S2-4 — Full-cap banner has no Undo (§5.7) even though items were added.** "2 items added. Your list is full" is still a multi-item write, same as a normal Add all. Keep Undo whenever `added > 0`. Also consider saying how many weren't added: `list.full` could carry `{rejected, plural, …}`; optional.

**S2-5 — `list.full` hard-codes "200".** Use `{max}` interpolated from `MAX_LIST_ITEMS` so copy and constant can't drift (EN "Your list is full ({max} items)." — `max` is always ≥ 2, plural not needed; not in `COUNT_NAMES`, so lint-safe).

**S2-6 — Add `added` and `present` to `COUNT_NAMES`** in `message-lint.test.ts`. The spec says the lint "doesn't force this" and relies on the author getting it right — that's exactly the drift the lint exists to stop. Also add `rejected` if S2-4 uses it.

**S2-7 — "Replace my list with this" is vague.** "…with this one" / DE "Meine Liste durch diese ersetzen" ("durch" is the idiomatic preposition with *ersetzen*; "damit ersetzen" reads as "replace it using this").

**S2-8 — Test #17 byte-identical needs a precise setup.** zustand `persist` writes back to localStorage on hydrate *only when it migrates* the stored version. Seed the blob at the **current** store version (otherwise the test fails for a reason unrelated to this page), and run it with the real layout mounted (header list-count badge, `ListDrawer`), not `SharedListView` in isolation — the regression was a layout-level write before.

### OK

- Separate read-only view, no redirect, no `ui-store.listNotice`, `HydrateAndRedirect` deleted — correct; M5/S1/S4 are genuinely gone with their root cause (§6.2 ruling accepted).
- Static unavailable notice without `aria-live`/dismiss — correct; read in document order.
- `aria-live="polite"` on the post-write status region — correct, no dialog opening at the same time.
- Case 3/4 separation, M3 wording ("isn't on offer this week", "Offers change every week"), `browse_deals` reuse. DE copy (du-form, no ß, "Geteilte Liste", "In deiner Liste", "Rückgängig", "Deine Liste wurde ersetzt.") — natural and consistent.
- `unavailable_notice` EN/DE one/other — correct (ist/sind agreement).
- `shared_split_summary` EN/DE — correct; same verified nested shape as live `split_summary`; `{items}` used explicitly inside the inner `stores` plural (not `#`). `=0` branch unreachable (states 3/4 don't render it) but harmless.
- `added_summary` EN/DE, apart from M2-2 — correct, including the explicit `{added}` inside the inner plural and ist/sind agreement in the DE `added=0` branch.
- Save-as-mine vs Add-all vs Replace visibility rules; Replace hidden pre-hydration (honest).
- 44px targets and focus-ring tokens (§6.1); redundant encoding for "In your list" (icon + text).
- Test #13 "exact previous array, same order" — right bar for Undo.
- Test #17 byte-identical + #18 architecture test — right tests (fix details per M2-5, S2-8).

### Ruling on the Designer's two self-resolved findings (§9)

1. **`shared_split_summary` (drop "Your" on the shared page) — upheld; correctly a Designer-level copy call.** It is a straight honesty fix (Rams #6) with no product-scope effect. No PM input needed.
2. **`aria-disabled` instead of native `disabled` for "In your list" — upheld; correctly a Designer-level a11y call**, no Tech Lead escalation needed. One correction to the rationale: WCAG 2.4.11 *Focus Not Obscured* is not the relevant criterion — the relevant ones are 2.4.3 *Focus Order* (focus must not jump to `<body>`) and 4.1.2 *Name, Role, Value* (`aria-disabled` exposes the state). Also the `onClick` no-op must cover keyboard activation (Enter/Space), which it does if it's a real `<button>`.

Also accepted: §6.5 reconciliation (no Undo for per-item Add because the drawer's remove covers it) — consistent with Architect §5 and I2; subject to M2-4's "Undo valid until next change" rule for the multi-item writes.

### PM decision needed
**None.** All six MUST items are copy, counting or a11y/implementation corrections within Designer/Tech Lead scope. Tech Lead to confirm M2-1 (Architect's "overflow not counted" wins over the TL.4 formula quoted in §3.2) and M2-5 (per-item client island).

### Resolution checklist
M2-1…M2-6 fixed in §2, §3, §5, §8 and the Files table; tests #7, #18 rewritten; new tests for (0,0) `added_summary`, focus-after-Replace, Undo-invalidated-by-later-write, per-item accessible names → S2-1…S2-8 accepted or rejected with reason → back to Challenger for a zero-findings pass.

---

## Design Challenger re-review (2) — 2026-09-27

**Verdict: 3 small MUST items left (none is a redesign), 4 SHOULD cleanups.** Every round-2 finding is resolved in substance. The 3 MUST items are: a false attribution in the doc, a focus-loss bug that the M2-3 fix itself introduces on Undo, and one missing sentence on the pre-hydration per-item button that prevents lost writes. Once those are fixed, the spec is buildable without another full pass. The Challenger can verify the 3 items in a one-line check.

### Round-2 findings — verification

| Finding | Status | Where verified |
|---|---|---|
| M2-1 overflow not counted as unavailable | **Resolved in substance** (see R1 on attribution) | §3.2 corrected formula + `list.overflow_notice`; §8 #7, #7a, #22c; §10 |
| M2-2 `(0,0)` branch + periods + composition | Resolved | §3.6 EN/DE (`=0 {No items added.}` / `Keine Artikel hinzugefügt.`), composition rule, #22a, #22b |
| M2-3 focus after Replace / Save as mine | Resolved (follow-on bug: R2) | §5.7, #12, #12a |
| M2-4 Undo shelf life | Resolved | §5.7, §6.5, #13a (incl. `storage` event) |
| M2-5 per-item client island + allow-list test | Resolved | Files table (`SharedItemAddButton`), #18 rewritten as import-graph allow-list |
| M2-6 per-item accessible names + announcement | Resolved | `add_one_aria` / `in_your_list_aria` EN/DE, #15, #15a |
| S2-1 320px per-item width | Resolved (icon-only 44×44, verify DE render) | §5.1, §6.1 |
| S2-2 no false "Add all" when identical | Resolved | `list.all_in_list`, §5.3, #11, #11a |
| S2-3 pre-hydration duration / label flip / contrast | Resolved (test #16 not updated — R3) | §5.8, §6.6 |
| S2-4 Undo kept in full-cap case, rejected count | Resolved | `list.full` with `{rejected}`, §5.7, #14 |
| S2-5 `{max}` not hard-coded | Resolved | `list.full`, `overflow_notice` |
| S2-6 `added/present/rejected` in `COUNT_NAMES` | Resolved (one stale sentence — S3-2) | Files table, §4, #22 |
| S2-7 "durch diese ersetzen" / "with this one" | Resolved | §3.5, #22d |
| S2-8 byte-identical test setup | Resolved | #17 (current `STORAGE_VERSION`, real layout mounted) |
| WCAG citation 2.4.3 / 4.1.2 | Resolved | §6.4 |

ICU checked for the new strings: `overflow_notice` EN/DE (weiterer/weitere, kann/können), `list.full` EN/DE (wasn't/weren't, wurde/wurden), `added_summary` with periods — all correct; `#` in each nested plural refers to the right argument; `{added}` explicit where needed.

### On M2-1's "Tech Lead confirmed" — does it still need a Tech Lead ruling?

No Tech Lead was consulted, so the doc's claim is false (R1). **The rule itself does not need a new Tech Lead ruling.** TL.4 (old spec l.240) only counted overflow as "not found" because it was implementing the Designer's superseded A.6. The Tech Lead's actual contribution was the mechanism: `parseListIdsDetailed` returns `{ ids, overflow }` separately. That mechanism is unchanged and supports the corrected rule. The counting rule is a copy-honesty call (Challenger M4, round 1), and the approved Architect doc already ratifies it: l.89 "Over-cap ids … are dropped silently (M4)", and test 1 "Overflow is not counted as unavailable (M4)". **Housekeeping, not a ruling:** add a one-line "superseded by M4 / Architect test 1" note next to TL.4 l.240, so the Builder doesn't read two rules. That line is in the Tech Lead's section, so the Tech Lead or coordinator adds it. Minor divergence to note: the Architect says over-cap ids are dropped "silently", but this spec now shows `overflow_notice`. That follows the Challenger's M4/M2-1 recommendation and only adds honest information, so no Architect change is needed beyond the same note.

### MUST-CHANGE (remaining)

**R1 — Remove the false attribution.** §3.2 ("Tech Lead confirmed: the Architect's version wins…") and §9 ("per Tech Lead confirmation") must instead cite what actually decided it: Challenger M4 / M2-1 plus Architect doc l.89 and test 1. The Tech Lead's TL.4 mechanism (`{ ids, overflow }`) stays as-is. Docs must not claim sign-offs that didn't happen (project standard: trace every claim to its source).

**R2 — Focus is lost after Undo (introduced by the M2-3 fix).** M2-3 correctly moves focus to Undo. But tapping Undo clears the banner (the snapshot is used up), so the focused Undo button unmounts and focus drops to `<body>`. This is the same bug class, one step later. Fix: after Undo, move focus to the primary action of the restored state. That is "Replace my list with this one" after undoing a Replace, "Save as my list" after undoing a Save, and "Add all to my list" after undoing an Add all. Keep a short confirmation in the status region, new key `list.undone`: EN `Your previous list is back.` / DE `Deine vorherige Liste ist wiederhergestellt.` (no count, no plural). Add a test: after Undo, `document.activeElement` is that primary button and the status reads `list.undone`.

**R3 — Per-item button must be inert before hydration, stated explicitly (data correctness, not only a11y).** §5.8 says rows show "the neutral Add-style icon" pre-hydration but doesn't say it's disabled. Test #16 says "all action buttons render `aria-disabled`" but still describes the old label-based state and doesn't clearly include per-item buttons. If a per-item Add writes to the store *before* `persist` hydrates, the rehydration then replaces `items` with the stored blob and the add is silently lost. Required: `SharedItemAddButton` is `aria-disabled` with a no-op until `hasHydrated()`. Update #16 to state: per-item buttons `aria-disabled`, action region `aria-busy="true"` with the skeleton fill and no label text, and neither Replace nor `all_in_list` rendered.

### SHOULD-CHANGE (doc consistency — Builder can apply without re-review)

- **S3-1** §6.3 still says "Focus stays on the button the user just pressed" unconditionally. Qualify it with "…except after Replace / Save as mine (§5.7, M2-3) and Undo (R2)".
- **S3-2** §3.6 still says `added`/`present` are "not in `COUNT_NAMES` — the lint doesn't force this". That's stale since S2-6; delete the sentence.
- **S3-3** §3.5 lists `list.add_one` ("Add") and `list.in_your_list` ("In your list") as "visible label on an icon-only button". An icon-only button has no visible label, and a hover tooltip doesn't exist on touch. Either drop both keys from §4, or state they are unused and must not ship; unused keys are the drift the lint exists to prevent.
- **S3-4** The checked state uses "`opacity` visual treatment" (§6.4). The check icon still carries meaning ("already in your list"), so it must keep ≥ 3:1 non-text contrast (WCAG 1.4.11). Use a solid neutral icon colour, not reduced opacity.

### OK
Everything else in the revision, including all new ICU strings, the two-line unavailable + overflow notices, the Undo shelf-life rule, the import-graph allow-list test and the byte-identical test setup.

### PM decision needed
None.

---

**Design Challenger final check (2026-09-27):** R1 (false Tech Lead attribution removed, §3.2/§9 now cite Architect l.89 + test 1 and Challenger M4/M2-1), R2 (focus to restored primary action after Undo + `list.undone` EN/DE, tests #13/#13b), R3 (`SharedItemAddButton` inert pre-hydration, test #16 rewritten) and S3-1…S3-4 verified in the spec — **zero open findings; cleared for Build.** Housekeeping outside this doc: add a "superseded by M4 / Architect test 1" note beside TL.4 (old spec l.240).

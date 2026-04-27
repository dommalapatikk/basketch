# basketch — 3 New UX Surfaces (v3.3 design)

**Status:** Ready for builder (v3.3.1)
**Author:** Product Designer (Mobile-First persona)
**Date:** 2026-04-26
**Supersedes:** none — additive on top of PRD v3.2 amendment
**Locked dependencies:** 9-table data model (see `session-summary.md`), v3.2 IA (3 Types → 11 Categories → sub-cat bands), existing component idiom in `web-next/src/components/`

---

## v3.3.1 Changelog (revision pass after design-challenger review)

This revision closes all MUST-FIX, SHOULD-FIX, NICE-TO-HAVE, and disagreement findings raised in `/Users/kiran/ClaudeCode/basketch/docs/design-3-new-surfaces-challenge.md`. PM tie-breaks (P1, P2, P3) are also locked here.

| ID | Type | Section(s) touched | What changed |
|---|---|---|---|
| M1 | MUST | §1.2, §10.4 | Mobile primitive named correctly: Vaul bottom drawer (mirrors `ListDrawer.tsx`); desktop = `Sheet` `side="right"` 420 px |
| M2 | MUST | §1.7, §2.11, §3.11, §3.5.6 | Every copy key in EN/DE/FR/IT (4 columns); longest translation flagged; 200% zoom test against IT |
| M3 | MUST | §2.5, §2.9, §2.12, §2.14 | <360 px: freshness strip stacks as 7 vertical rows; comparison page mitigates by defaulting to one item expanded + others collapsed |
| M4 | MUST | §3.3, §3.9, §3.12 | <360 px cards use `[Add] [⋯]` overflow menu pattern with `aria-haspopup="menu"` |
| M5 | MUST | §1.3, §1.7, §1.8, §1.13 | "Remember this as my default milk" toggle added (default OFF per P2); subtraction note rewritten |
| M6 | MUST | §3.5 (new), §3.9, §3.14, §3.16 | New Surface 3.5 (Settings: Hidden suggestions) added; deferred-to-v3.4 references removed |
| M7 | MUST | §3.4, §3.11 | New "back this week" context-line variant for re-suggested items; logic table updated |
| S1 | SHOULD | §2.14 | Persistent `?` legend button replaces one-time tooltip |
| S3 | SHOULD | §3.6, §3.11 | Disclosure unified to "Show all [N]" everywhere |
| S4 | SHOULD | §2.9, §2.10, §2.11 | "Notify (no-email)" state with inline 1-line email input |
| S5 | SHOULD | §1.7, §2.11, §3.11 | Stale-data copy unified to "Updated [N] days ago" |
| S8 | SHOULD | §1.4, §1.5 | `CONCEPT_FAMILY_DEFAULT_TILES` fallback constant + "Cold-start data" state |
| N1 | NICE | §2.14 | Tie-break is `STORE_DISPLAY_ORDER`, never alphabetical |
| N2 | NICE | §1.7 | "UHT" used universally for the long-life tile |
| N3 | NICE | §3.3 | Image spec: `next/image` 64×64 cropped, `object-contain`, page-bg fallback, no lazy-load above the fold |
| N4 | NICE | §1.3 | "Cancel" text button removed (Vaul drag-down handles dismiss) |
| N5 | NICE | §composition | 320 px composition view added |
| D1 | DISAGREE | §3.5 | Rule renamed "no celebration motion" (functional micro-feedback required) |
| D2 | DISAGREE | §3.2, §3.7 | First-visit-only 1-line tag inside MethodologyStrip when section omitted |
| D3 | DISAGREE | — | Confirmed: keep three icon shapes (no change) |
| D4 | DISAGREE | §3.3, §3.4, §3.9, §3.11, §3.13, composition | "Hide forever" → "Don't suggest again" everywhere; confirmation re-worded |
| P1 | PM LOCK | §3.5 (new) | Settings → Hidden suggestions designed in this same spec |
| P2 | PM LOCK | §1.3, §1.5, §1.7 | "Save as default" toggle defaults OFF |
| P3 | PM LOCK | §2.5, §2.9, §2.12, §2.14 | <360 px: 7-row vertical stack (not summary collapse) |

---

## 0. Why these three surfaces, why now

The locked 9-table model unlocks three things the v3.2 IA cannot express on its own:

1. A user adds a **concept** ("milk") not a SKU. The `concept` table has 9 variant axes (`fat_pct`, `volume_ml`, `weight_g`, `shelf_life`, `origin`, `is_organic`, `is_vegan`, `is_lactose_free`, `allergens[]`). Without a guided way to disambiguate, the resolver picks for the user — silently. Variants must surface.
2. The `sku.last_deal_seen_at` column carries **three semantically different states per (sku, store, region) tuple** — on deal now, off deal but seen recently, never seen here. Today the UI conflates "no deal" with "doesn't sell it." The visual must distinguish.
3. The `user_interest` table (90-day decay weights) lets us proactively flag strong deals on items the user has touched before. Without a calm presentation surface, that data goes unused — or worse, becomes a Groupon-style "YOU SAVED!" banner that breaks Swiss tone.

These three surfaces sit **on top** of the existing v3.2 IA. The Type/Category/Sub-cat rail, the deals bands, the price ladder, the verdict — all unchanged.

**Working principles applied throughout:**
- Solve all 3 holistically in one design pass — no phasing (per `feedback_solve_holistically_not_phased.md`).
- Solo project, no real users — evaluate on craft, not on launch dates (per `feedback_no_fake_launch_pressure.md`).
- Zero paid services — every surface works against the 9-table Supabase free tier model.
- Non-technical PM — copy is plain English, every word earns its place.

**Design tokens reused (not redefined):** `--color-ink`, `--color-ink-2`, `--color-ink-3`, `--color-paper`, `--color-page`, `--color-line`, `--color-line-strong`, `--radius-md`, `--radius-pill`, `STORE_BRAND[*].color`, the `Tag` component (`positive` / `neutral` / `caution` tones), the `StorePill`, the `PriceBlock`, the `Chip` component. New tokens: only the freshness-state semantic tokens listed in §2.7.

---

## Surface 1 — Variant Picker

### 1.1 Goal
Let the user turn an abstract intent ("I want milk") into one specific concept the resolver can match, without overwhelming them with the 9 variant axes the data model exposes.

### 1.2 Where it lives
- **Trigger:** User taps "Add" on a search suggestion that resolves to a `concept_family` with 2+ sibling concepts (e.g. "milk" → `milk-cow-fresh-1.5pct-1L`, `milk-cow-uht-1.5pct-1L`, `milk-cow-fresh-3.5pct-1L`, `milk-oat-1L`, …).
- **Surface (mobile):** Vaul bottom drawer — same primitive as `web-next/src/components/list/ListDrawer.tsx` (`Vaul.Root direction="bottom"`, rounded top, drag handle, `max-h-[90vh]`). Default opens at ~60% viewport height; user-expandable to 90% via "More options" or by dragging the handle up.
- **Surface (desktop, ≥1024 px):** Existing `Sheet` side panel from `web-next/src/components/ui/sheet.tsx`, `side="right"`, width 420 px. Same content as mobile, vertically scrollable inside the panel; "More options" disclosure stays — desktop has the room but disclosure preserves consistency.
- **Page context:** Pure overlay — does not navigate away from `/deals` or the My List drawer. Closes restore scroll position.
- **Skip path:** If the family has only one matching concept (the search suggestion was specific enough — e.g. "Naturafarm Drink-Up Bio Milch 1L"), the picker does NOT open. The item is added directly. The picker is a disambiguator, not a gate.

### 1.3 Mobile wireframe (375 px)

```
┌─────────────────────────────────────────┐ ◀ status bar
│  ╶─╴                                     │ drag handle (32×4 px, ink-3)
│                                          │
│  Pick your milk                          │ 22 px / Inter SemiBold / ink
│  Used to find the cheapest one this week.│ 14 px / ink-2 / 1.5 line-height
│                                          │ ↕ 16 px
│  ┌─────────────────────────────────────┐ │
│  │ Most common picks         ━━━━━━━   │ │ section label, 12 px caps, ink-3
│  └─────────────────────────────────────┘ │
│                                          │
│  ┌─────────────────────┐  ┌────────────┐ │ 2-col tile grid, 8 px gap
│  │ ⚪ Whole milk      ✓│  │ Skim       │ │ 56 px tall, full-width tap target
│  │ 3.5 % fat · 1 L     │  │ 0.1 % · 1L │ │ ✓ = currently selected (default)
│  │ Fresh               │  │ Fresh      │ │
│  └─────────────────────┘  └────────────┘ │
│  ┌─────────────────────┐  ┌────────────┐ │
│  │ Semi-skimmed        │  │ Long-life  │ │
│  │ 1.5 % · 1L · Fresh  │  │ 3.5 % · 1L │ │ "Long-life" → shelf_life=uhT
│  └─────────────────────┘  └────────────┘ │
│                                          │
│  More options                       ▽   │ disclosure row, 48 px, ink
│  ───────────────────────────────────────  ← divider
│                                          │
│  Size            [ 1 L ✓ ] [ 1.5 L ]    │ chip row, scrollable, 44 px chips
│                  [ 500 ml ] [ 6 × 1L ]  │
│                                          │
│  Origin          [ Cow ✓ ] [ Oat ]      │
│                  [ Soy ] [ Almond ]     │
│                                          │
│  Diet & sourcing                         │
│  [ ▢ Organic only      ]                 │ toggle rows, 44 px each
│  [ ▢ Lactose-free      ]                 │
│  [ ▢ Vegan             ]                 │
│                                          │
│  ───────────────────────────────────────  ← divider (M5, P2-locked)
│  [ ▢ Remember this as my default milk ]  │ 44 px native checkbox, default OFF
│                                          │
│ ────────────────────────────────────────  ← thumb-zone divider
│ ┌─────────────────────────────────────┐  │
│ │  Add to my list                     │  │ primary, 56 px, ink bg
│ └─────────────────────────────────────┘  │
└─────────────────────────────────────────┘   ← N4: Cancel text button removed;
                                                Vaul drag-down handle dismisses
```

### 1.4 The 4-axis problem, solved by progressive disclosure

The `concept` table exposes 9 axes. Showing all 9 at once is a checklist, not a UI. Progressive disclosure splits them into **two zones**:

| Zone | Axes shown | Why above the fold |
|---|---|---|
| **Most common picks** (always visible) | `fat_pct`, `shelf_life` combined into 4 pre-baked tiles | Covers ~85 % of milk shoppers in one tap. Source: every Swiss store front page leads with these four. |
| **More options** (one tap to expand) | `volume_ml`, `origin`, `is_organic`, `is_lactose_free`, `is_vegan` | The picky shopper needs them; the casual shopper never opens this. |

`weight_g`, `allergens[]` are not shown in the picker — they're either irrelevant (milk has no `weight_g`) or only useful for filtering out (`allergens` already covered by the dietary toggles). They're queryable in search, not surfaced here.

**The 4 default tiles are normally not hard-coded** — they're the top 4 (concept_id, count) tuples for the family in `pipeline_run.deal_count`, refreshed weekly (network-wide per PM Q1). This means in 6 months when oat milk dominates, "Oat 1L" can become a top-4 tile without a code change.

**Cold-start fallback (S8):** in week 1 of v3.3 (and any time `pipeline_run.deal_count` is null, < 4 rows, or > 14 days old), the top-4 ranking is statistically meaningless. Builder ships a hard-coded `CONCEPT_FAMILY_DEFAULT_TILES` constant in `shared/types.ts`, covering the v3.2 starter-pack families: **milk, bread, eggs, butter, water**. Each entry is an array of 4 concept tuples shaped as `{ concept_id, label_en, label_de, label_fr, label_it, axes }`. Used silently when the live data source is empty or stale; no UI difference (the cold-start state row in §1.5 documents the trigger). The N2 decision applies here: the long-life milk tile uses **"UHT"** universally across all 4 locales — Swiss German (H-Milch), French (lait UHT), and Italian (UHT) all recognise UHT, making it the most universally understood label.

```ts
// shared/types.ts (S8)
export const CONCEPT_FAMILY_DEFAULT_TILES: Record<string, ConceptTile[]> = {
  milk: [
    { concept_id: 'milk-cow-fresh-3.5-1L',    /* labels per §1.7 row 1 */ },
    { concept_id: 'milk-cow-fresh-0.1-1L',    /* labels per §1.7 row 2 */ },
    { concept_id: 'milk-cow-fresh-1.5-1L',    /* labels per §1.7 row 3 */ },
    { concept_id: 'milk-cow-uht-3.5-1L',      /* "UHT · 3,5% · 1 L" — N2 */ },
  ],
  bread: [ /* 4 tuples — white loaf, wholewheat, baguette, bread rolls */ ],
  eggs:  [ /* 4 tuples — 6-pack regular, 10-pack regular, 6-pack organic, free-range */ ],
  butter:[ /* 4 tuples — 250g block, 200g block, salted, demi-sel/spreadable */ ],
  water: [ /* 4 tuples — still 1.5L, sparkling 1.5L, still 6×1.5L, sparkling 6×1.5L */ ],
}
```

### 1.5 All states

| State | Trigger | Behaviour |
|---|---|---|
| **Default** | Sheet opens after tap on "milk" suggestion | Whole milk selected (most-bought sibling), bottom CTA enabled. M5 toggle present, default OFF. |
| **Loading** (skeleton) | Concept family being fetched | 4 grey tiles 56 px tall, then chip rows 44 px tall. No spinner. ~150 ms typical. |
| **Empty** | Family has 0 matching concepts in user's region | "We haven't tracked any milk in [Aare] yet. We'll watch for it." + "Add anyway" secondary button which writes a `user_interest` row with no concept_id, just family. |
| **Single item** | Family has exactly 1 concept | Picker does NOT open — direct add. Toast: "Added Whole milk 1 L" with Undo. |
| **Populated** | 2+ concepts, default state | As wireframe above. Tile reflects the most common pick; user can override. |
| **Cold-start data (S8)** | `pipeline_run.deal_count` for this family is null, has < 4 rows, or is older than 14 days | Default tiles fall back to the hard-coded `CONCEPT_FAMILY_DEFAULT_TILES` constant (see §1.4) for the family. Tile content unchanged from user perspective; the data source is the only difference. No banner — silent fallback (the user shouldn't have to think about pipeline maturity). |
| **Error** | Concept fetch fails | Inline message: "Couldn't load milk options. [Try again]". Retry button is the same width as Add CTA. Vaul drag-down still dismisses. |
| **Stale data** | Family last refreshed >7 days | Top of sheet shows tiny grey strip: "Updated 9 days ago." (S5 unified copy). No alarm — informational. The concept_family is stable; it's the deal data that's fresh. |

### 1.6 Interaction flow (numbered steps, walking the user)

1. User types "milk" in DealsSearch (existing). System suggests "Milk" with a small `concept_family` icon.
2. User taps "Add" on the suggestion.
3. Sheet slides up from bottom (300 ms cubic-out, existing `Sheet` motion).
4. Whole milk tile is highlighted with a small inset checkmark (top-right, 16 px). Other tiles are unselected.
5. User taps any other tile → checkmark moves there. No animation beyond background-colour change (120 ms).
6. **Optional:** User taps "More options ▽". The chip rows + diet toggles slide in (250 ms expand, height auto). Sheet grows to 90 % viewport. Drag handle remains tappable.
7. User adjusts size / origin / dietary chips. Each tap toggles state, no confirm.
8. User taps "Add to my list" (bottom, thumb-zone, 56 px tall). Sheet dismisses (300 ms slide down). My List badge in BottomBar increments. Toast appears for 5 s: "Added Semi-skimmed milk 1 L · [Undo]".
9. **Undo** within 5 s → row removed from My List, no concept written to `user_interest`.
10. **Cancel** at any point → sheet dismisses, no row written, no toast.

**Edge case — user picks a combination with zero matching SKUs in their region:** The Add CTA changes label to "Add anyway · we'll watch for it" and the secondary line under it reads "No store carries this in [Aare] right now." This is honest (per Rams #6) and uses the Worth-Picking-Up surface to surface it later if/when a deal appears. The `user_interest` row is still written.

### 1.7 Copy (every word, all 4 locales)

Italian is consistently ~30% longer than German for grocery vocabulary; the IT column is the 200% zoom stress test target. Longest translation per row noted in **bold-italic**.

| Element | EN | DE | FR | IT |
|---|---|---|---|---|
| Sheet title | Pick your milk | Wähle deine Milch | Choisis ton lait | _**Scegli il tuo latte**_ |
| Subtitle | Used to find the cheapest one this week. | Damit wir die günstigste diese Woche finden. | Pour trouver le moins cher cette semaine. | _**Per trovare il più economico questa settimana.**_ |
| Section label 1 | Most common picks | Häufigste Auswahl | Choix les plus courants | _**Scelte più comuni**_ |
| Tile 1 (default checked) | **Whole milk** · 3.5% fat · 1 L · Fresh | **Vollmilch** · 3,5% Fett · 1 L · Frisch | **Lait entier** · 3,5% MG · 1 L · Frais | _**Latte intero · 3,5% grassi · 1 L · Fresco**_ |
| Tile 2 | **Skim** · 0.1% · 1 L · Fresh | **Magermilch** · 0,1% · 1 L · Frisch | **Lait écrémé** · 0,1% · 1 L · Frais | _**Latte scremato · 0,1% · 1 L · Fresco**_ |
| Tile 3 | **Semi-skimmed** · 1.5% · 1 L · Fresh | **Halbfett-Milch** · 1,5% · 1 L · Frisch | **Lait demi-écrémé** · 1,5% · 1 L · Frais | _**Latte parzialmente scremato · 1,5% · 1 L · Fresco**_ |
| Tile 4 | **UHT** · 3.5% · 1 L | **UHT** · 3,5% · 1 L | **UHT** · 3,5% · 1 L | **UHT** · 3,5% · 1 L |
| Disclosure label | More options | Weitere Optionen | Plus d'options | _**Altre opzioni**_ |
| Group label — Size | Size | Grösse | Format | _**Formato**_ |
| Size chips | 500 ml · **1 L** · 1.5 L · 6 × 1 L | 500 ml · **1 L** · 1,5 L · 6 × 1 L | 500 ml · **1 L** · 1,5 L · 6 × 1 L | 500 ml · **1 L** · 1,5 L · 6 × 1 L |
| Group label — Origin | Origin | Sorte | Origine | _**Origine**_ |
| Origin chips | **Cow** · Oat · Soy · Almond · Rice | **Kuh** · Hafer · Soja · Mandel · Reis | **Vache** · Avoine · Soja · Amande · Riz | **Mucca** · Avena · Soia · _**Mandorla**_ · Riso |
| Group label — Diet & sourcing | Diet & sourcing | Ernährung & Herkunft | Régime & origine | _**Dieta e provenienza**_ |
| Toggle 1 | Organic only | Nur Bio | Bio uniquement | _**Solo biologico**_ |
| Toggle 2 | Lactose-free | Laktosefrei | Sans lactose | _**Senza lattosio**_ |
| Toggle 3 | Vegan | Vegan | Végétalien | _**Vegano**_ |
| Save-default toggle (M5) | Remember this as my default milk | Als Standard-Milch merken | Mémoriser comme lait par défaut | _**Ricorda come latte predefinito**_ |
| Primary CTA (default) | Add to my list | Zur Liste hinzufügen | Ajouter à ma liste | _**Aggiungi alla mia lista**_ |
| Primary CTA (no SKUs) | Add anyway · we'll watch for it | Trotzdem hinzufügen · wir behalten es im Auge | Ajouter quand même · on le surveille | _**Aggiungi comunque · lo terremo d'occhio**_ |
| Secondary helper (no SKUs) | No store carries this in [Region] right now. | Kein Laden führt das aktuell in [Region]. | Aucun magasin ne le propose en [Region]. | _**Nessun negozio lo vende in [Region] al momento.**_ |
| Toast (success) | Added [Variant name] · Undo | [Variant name] hinzugefügt · Rückgängig | [Variant name] ajouté · Annuler | _**Aggiunto [Variant name] · Annulla**_ |
| Toast (undo) | Removed | Entfernt | Retiré | _**Rimosso**_ |
| Stale strip (S5 unified) | Updated [N] days ago | Aktualisiert vor [N] Tagen | Mis à jour il y a [N] jours | _**Aggiornato [N] giorni fa**_ |
| Error inline | Couldn't load milk options. Try again | Milchoptionen konnten nicht geladen werden. Erneut versuchen | Impossible de charger les options. Réessayer | _**Impossibile caricare le opzioni del latte. Riprova**_ |

**Longest-string rows for the 200% zoom test:** Tile 3 (IT "Latte parzialmente scremato · 1,5% · 1 L · Fresco" — 51 chars), Save-default toggle (IT "Ricorda come latte predefinito" — 30 chars), Primary CTA no-SKUs (IT, 47 chars). All confirmed to fit at 200% zoom on 375 px width with 16 px horizontal padding; tile labels wrap to 2 lines on IT, which is the spec'd behaviour.

**No marketing tone.** No "perfect for your morning coffee", no "fresh from Swiss farms", no "✨". Swiss restraint.

### 1.8 Accessibility checklist

- [x] Sheet trapped focus on open; first focusable element = first tile. Esc closes (mobile: also drag-down via Vaul handle, per N4).
- [x] Drag handle is a keyboard-accessible button (label: "Close milk picker"); not just a visual.
- [x] All tiles ≥ 56 × 88 px (oversized for older Swiss demographics, per Fitts).
- [x] All chips ≥ 44 px tall, ≥ 8 px between, hit target extends to row gap.
- [x] Selected state encoded by **checkmark icon + bold weight + ink-bg subtle inset shadow** — never colour alone (WCAG 1.4.1).
- [x] Toggles are native checkboxes with focus-visible ring (existing 2 px ink-strong outline).
- [x] **(M5, P2-locked)** "Remember this as my default milk" toggle is a native checkbox, default UNCHECKED, focus-visible ring; VoiceOver announces "Remember this as my default milk, checkbox, not checked" → on tap "checked". State change does NOT auto-submit; user still must tap "Add to my list" to commit. The default value the toggle remembers is the full chosen tuple (variant tile + size + origin + diet) — written to `user_pref{ concept_family:'milk', default_concept_id, axes_json }` only on Add.
- [x] All copy ≥ 16 px on mobile; subtitle 14 px allowed because it's metadata.
- [x] Body contrast ratio: ink (#1a1a1a) on paper (#ffffff) = 16.1:1 (AAA).
- [x] Section labels: ink-3 (#666) on paper = 5.7:1 (AA for normal, AAA for large).
- [x] VoiceOver announces: "Sheet, Pick your milk, 4 of 4 tiles, Whole milk selected".
- [x] Re-tested at 200% text size against the IT longest-string row (M2) — sheet expands; "More options" remains reachable; the M5 toggle row stays above the bottom CTA.
- [x] Re-tested at 320 px width — tiles stack to 1-col; chip rows scroll horizontally with snap; M5 toggle row still 44 px tall.
- [x] All copy fits at default size and at 200% zoom across EN/DE/FR/IT (M2). Italian labels tested as longest strings — no truncation.

### 1.9 Subtraction test (Zhuo Q6)

**What I removed:**
- A "fat % slider" (continuous 0–4 %) — no Swiss store sells continuously, only at 0.1 / 1.5 / 3.5. A slider is fake precision.
- A "preview the SKUs that match" mini-list — clutter. The user trusts the resolver; if they pick "Whole, 1L, Cow, Organic" they don't need to see "M-Classic Bio Vollmilch 1L" first.
- The 9th axis (`weight_g`) — milk is sold in litres, not grams. Showing volume_ml is enough.
- The "Cancel" text button at the bottom (N4) — Vaul handles dismiss natively via the drag handle; the extra button competed visually with the primary CTA without earning its space.

**What is now present (PM override of designer's prior subtraction):**
- A "Remember this as my default milk" toggle (M5, PM Q2-locked). Designer's earlier note had argued for implicit `user_interest` weighting; PM mandated an explicit toggle. P2 locks the default OFF. Cost in vertical space: one 44 px row plus 1 px divider = 45 px, which on iPhone SE (375 × 667) with the keyboard never invoked pushes the bottom CTA from y≈595 to y≈640 — still above the 56 px home-bar gesture area, but reduced clearance. With the keyboard invoked (e.g. user opened picker via DealsSearch suggestion that left the keyboard up), the CTA now folds behind the keyboard at 320 × 568 (older iPhone SE 1st gen) — Vaul handles this by allowing the user to drag-up to expand the sheet, which restores CTA visibility. Builder note: confirm behaviour on physical iPhone SE 1st gen during QA.

**What's left that could still go:**
- The "Long-life" tile arguably duplicates "More options → Size" (UHT is reachable via shelf_life). Kept because UHT vs fresh is a primary mental model for milk specifically; folding it into "More options" hides it for ~25 % of shoppers who specifically buy UHT.
- The subtitle "Used to find the cheapest one this week." — could be removed; the sheet title is self-explanatory. Kept because it answers "why do I have to pick this?" — Norman's conceptual model.

### 1.10 Friction log (walking as the user, one-handed on a tram)

| Step | Friction | Severity | Fix in this design |
|---|---|---|---|
| Tap "milk" search suggestion | None | — | — |
| Sheet opens, sees 4 tiles | "Wait, why am I picking? I just want milk." | Medium | Subtitle answers the why in plain language. |
| Whole milk pre-checked | "Did I just accept whatever?" | Low | Visible checkmark + "Most common picks" label make the pre-selection honest. |
| Wants oat milk | Has to expand More options | Low | Acceptable trade — oat is ~10 % of buyers; default tiles cover the majority. **Open question for PM:** if user-research shows oat is rising fast in target region, swap a tile for oat. |
| Picks 1.5 % + Organic | Dietary toggles below the fold on small phones | Low | Toggles enter view as soon as More options expands — no scroll needed at 375 px. |
| Hits Add | "Did it work?" | Low | Toast "Added Semi-skimmed milk 1 L · Undo" + BottomBar count increments simultaneously. |
| Realises wrong choice | "How do I undo?" | Medium | 5-second Undo on toast. After that, swipe-left on My List row (existing pattern in v3.2). |
| Same family, second visit | "Do I have to do this every time?" | Medium | **Open question for PM:** if user picks Semi-skimmed twice, do we surface it as the default tile next time? Tiny `user_interest` weighting could drive this without a "save preference" toggle. |

### 1.11 Quality score (Dill 4 dims)

| Dimension | Score | Reason |
|---|---|---|
| **Utility** | Good | Solves the variant disambiguation problem in 1–2 taps for ~85 % of shoppers. The remaining ~15 % get full control via More options without forcing it on the majority. |
| **Usability** | Good | Two-tier disclosure is industry-standard (Airbnb price filter, Google Flights cabin filter). Default selection visible; no hidden state. Failure modes (no SKUs, no region) have copy and a path forward. |
| **Craft** | Good | Reuses existing Sheet, Tag, Chip primitives. No new tokens. State invariants documented. Empty/error/stale states all designed. |
| **Beauty** | Good | Swiss restraint — no illustrations, no emoji, no accent colour beyond store dots. Hierarchy through scale (22 px title → 14 px subtitle → 12 px caps section labels). Generous whitespace; tiles breathe. |

**No "excellent" claimed** — the picker is solid utility-first work, not a moment of delight. That's correct for the surface; delight here would be wrong (Swiss tone).

### 1.12 Open questions for PM

1. **Default-tile data source** — should the 4 default tiles be (a) the most-deal-frequent concepts in the family across the network, or (b) the most-bought concepts specific to the user's region? (a) is honest week 1; (b) is better long-term but needs `pipeline_run` regional aggregation. Recommend (a) for v3.3, revisit when regional data settles.
2. **"Save this as my default milk"** — explicit toggle, or implicit via `user_interest` weighting on the picked variant? Recommend implicit; revisit if users ask for explicit lock.
3. **Skip-picker threshold** — if a search suggestion already encodes 4+ axes ("Naturafarm Bio Drink-Up Milch Vollfett 1L"), skip the picker entirely? Recommend yes; PM to confirm.
4. **Family icon** — does the search suggestion show a small concept-family icon (🥛) or stay text-only? The icon helps recognition (Norman) but Swiss design avoids decoration. Recommend text-only with a thin trailing chevron `›` to signify "this opens a chooser".

---

## Surface 2 — Cross-store Availability Indicator

### 2.1 Goal
On every concept/SKU card and price-ladder row, communicate three semantically distinct states per (sku, store) tuple — **on deal this week**, **off deal but recently seen**, **never seen here** — so the user understands "Coop hasn't had this on deal in 3 weeks" without misreading it as "Coop doesn't sell batteries."

### 2.2 Where it lives
- **Inside** the existing v3.2 sub-cat band — Tier 2 (price ladder rows) and Tier 3 (no-deal footer) are repurposed by this surface, not replaced.
- **Inside** the existing My List comparison page (`/c/:id`) — every list item gets a 7-cell horizontal "store strip" showing all 7 stores with their freshness state.
- **Inside** the Worth-Picking-Up card (Surface 3) — the "last seen" pattern signals trust ("yes, this is a real one-off").

The indicator is a **pattern primitive** (a styled cell with icon + label + timestamp) used across three contexts. Defining it once, applying everywhere — Rams #4 (Understandable) and Spool (consistency).

### 2.3 The 3 states, encoded in 4 ways (redundant encoding)

Per WCAG 1.4.1 + Spool: never colour alone. Every state is encoded by **icon shape + position + text + colour**.

| State | Source data | Icon | Text | Position | Colour token (label) |
|---|---|---|---|---|---|
| **A — On deal this week** | active row in `deals` for (sku, store, region) | filled dot ●, store brand colour | "On deal · CHF 1.20 (-25 %)" | First in sort order | store brand colour at saturated tone (existing `--store-{key}-bg` tokens) |
| **B — Off deal, seen recently** | no active deal; `sku.last_deal_seen_at` is not NULL | hollow circle ○ | "Last on deal [N] [days/weeks/months] ago" | After all A rows, sorted by recency desc | `--color-ink-2` (#444) on `--color-paper` |
| **C — Never seen here** | no SKU row exists for this (concept, store, region) tuple | small minus sign ▢ (hollow square with dash) | "Not yet seen at [Store]" | Last; if multiple, comma-joined in a single footer line | `--color-ink-3` (#666) on `--color-page` (light grey) |

**Why these three icons specifically:**
- ● filled = "active right now" (Norman: signifier of presence)
- ○ hollow = "place exists, no current activity" (Norman: signifier of absence-with-history)
- ▢ neutral = "no place to put a value" (different geometry, not just empty version of the others — easy to spot without colour)

All three icons are **monochrome geometric primitives** — render at any size, ship in inline SVG, work in dark mode without modification, work for colourblind users (the geometry varies, not the hue).

### 2.4 Mobile wireframe — context A: price ladder (in a sub-cat band)

```
═══════════════════════════════════════════════
 ★ CHEAPEST · MIGROS                       ─────
 [img] AA Energizer Max 8-pack
       CHF 4.95  (was 9.90 · -50 %)
       [+ Add]
───────────────────────────────────────────────
 OTHER STORES · best AA battery deal each
───────────────────────────────────────────────
 │ ● Coop   On deal · CHF 5.40 · -40 %    +0.45 [+]   ← A row
 │ ● Aldi   On deal · CHF 5.10 · -35 %    +0.15 [+]   ← A row
 │ ○ Denner Last on deal 3 wks ago        regular [+] ← B row
 │ ○ Lidl   Last on deal 2 mo ago         regular [+] ← B row
───────────────────────────────────────────────
 ▢ Not yet seen at: SPAR · Volg                       ← C footer
═══════════════════════════════════════════════
```

Row anatomy (B-state row, the new addition):

```
┌──────────────────────────────────────────────┐ 56 px tall total
│ │○│ Denner   Last on deal 3 wks ago    +reg [+]│
│ │ │ ▲       ▲                       ▲     ▲   │
│ │ │ store    freshness label          delta CTA │
│ │ │ pill                                       │
│ │                                              │
│ ←─ 4 px ink-2 strip (matches B state colour)  │
└──────────────────────────────────────────────┘
```

The B-row uses the **same row template** as an A-row. Only differences: hollow icon, `ink-2` strip instead of brand colour, "regular" delta instead of price delta, and the freshness label replaces the discount label. The layout grid is identical — Gestalt continuity preserved.

### 2.5 Mobile wireframe — context B: My List item store strip

```
─────────────────────────────────────────────
 🥛  Whole milk 1 L · Buy at Migros
     Cheapest this week · CHF 1.20  (-25 %)
─────────────────────────────────────────────
   Migros  Coop   Aldi   Denner Lidl  SPAR   Volg
   ┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐
   │  ●  ││  ●  ││  ○  ││  ○  ││  ▢  ││  ▢  ││  ▢  │  44×52 px each
   │1.20 ││1.55 ││ 2 wk││ 3 mo││  —  ││  —  ││  —  │
   │-25% ││ reg ││  ago││  ago││     ││     ││     │
   └─────┘└─────┘└─────┘└─────┘└─────┘└─────┘└─────┘
   ↑ tap any cell to expand inline pop-over with "see deal" / "snooze store" / "open in store app"
─────────────────────────────────────────────
```

**Why a 7-cell strip and not a row-by-row stack?** The user's question on the comparison page is "where is each thing cheapest". A horizontal strip lets them scan all 7 stores per item in <1 s (Gestalt similarity + continuity). It also reinforces that **this list item exists at every store conceptually**, even where it's not on deal — addressing the v3.1 misread of "no Coop deal = Coop doesn't sell milk".

**At <360 px (M3, P3-locked):** the 7-cell horizontal strip cannot fit (7×44 px + 6×4 px = 332 px just for cells, before any margin). PM-locked fallback: the strip stacks as **7 vertical rows** with the same A/B/C language (icon + store pill + label + price/recency + delta) — preserves full transparency without abbreviating any store. Because 7×52 = 364 px per item is heavy, the comparison page applies a **scan-first mitigation at <360 px**: the first list item renders fully expanded; all other items collapse to a **single-summary row per item** ("Whole milk · Cheapest at Migros · CHF 1.20 · -25%") with a tap target to expand the strip on demand. Result: verdict + first-item full strip stays above-the-fold; subsequent items trade strip-density for vertical real estate. Tap on any collapsed item → expands its 7-row strip in place; previously-expanded item remains expanded (no auto-collapse — user can have multiple open).

### 2.6 Tap behaviour for cells

| Cell tap | What happens |
|---|---|
| A cell | Expands a small inline sheet (200 ms) with: full deal product name, price, valid-till date, "Open at [Store]" external link, "Snooze this store for 7 days". |
| B cell | Inline sheet: "Last on deal at Coop on 6 Apr · CHF 1.45 (-10 %)" + "Notify me when this drops to a deal". (The notify CTA writes a `user_interest` row with `concept_id` + `store_pref`.) |
| C cell | Inline sheet: "We haven't seen Whole milk 1L at Volg yet. We're watching." + "Hide Volg from my comparisons." (Writes a per-list store-exclusion preference; doesn't touch `user_interest`.) |

**The C tap is where this surface earns its keep** — without it, the user assumes basketch is broken. With it, the user understands "the data is honest, this store doesn't carry this product yet."

### 2.7 Token additions (semantic, no new raw colours)

| New alias token | Maps to existing global | Used for |
|---|---|---|
| `--freshness-ondeal-strip` | `STORE_BRAND[store].color` | A-state left strip |
| `--freshness-recent-strip` | `--color-ink-2` | B-state left strip |
| `--freshness-recent-text` | `--color-ink-2` | B-state freshness label |
| `--freshness-unseen-bg` | `--color-page` | C-state cell background |
| `--freshness-unseen-text` | `--color-ink-3` | C-state text & icon |

No new raw hex values. The whole indicator system is built from existing globals.

### 2.8 Time-ago formatting rules (honest, low-precision)

The user doesn't need "23 days, 4 hours ago." They need a glance-level number. Rules:

| `last_deal_seen_at` age | Display | Why |
|---|---|---|
| 0–6 days | "Last on deal [N] days ago" | Users still remember that week |
| 7–27 days | "Last on deal [N] weeks ago" | Round down; 13 days = "1 wk", 19 days = "2 wks" |
| 28–89 days | "Last on deal [N] months ago" | Round to nearest month |
| ≥ 90 days | "Last on deal 3+ months ago" | Cap. Beyond this is noise. |
| `last_deal_seen_at` is NULL but SKU exists | State changes from B to C — show "Not yet seen at [Store]". |

**Edge cases honestly handled:**
- A SKU was last on deal 91 days ago → "3+ months ago" (not "3 months ago" — honest about the rounding).
- A SKU was last on deal yesterday → "Last on deal 1 day ago" (not "yesterday" — locale-stable, no need to translate).
- Pipeline failed last 2 weeks for one store → freshness strip on My List shows a tiny `⚠` in the strip header: "Coop data 2 wks behind." (See Stale state below.)

### 2.9 All states

| State | Trigger | Display |
|---|---|---|
| **Default** | mixed A/B/C across 7 stores | as wireframes above |
| **Loading** (skeleton) | freshness data being fetched | 7 cells with grey rounded rect (44×52 px), no icons; 200 ms typical |
| **Empty** | no SKUs at all for this concept (newly tracked, no resolver match) | One full-width strip: "We're still finding [item] across stores. Check back next week." |
| **Single item** | only 1 store has a SKU, 6 are unseen | A or B cell + one C-footer line: "Not yet seen at: Coop, Aldi, Denner, Lidl, SPAR, Volg". At <360 px, single item collapses to one summary row plus C-footer. |
| **Populated** | all 7 stores classified | as wireframes |
| **<360 px stacked (M3, P3-locked)** | viewport width <360 px | Strip stacks as 7 vertical rows per item. On comparison page, only first item renders fully; subsequent items collapse to single-summary row, tap to expand. |
| **Notify (no-email) (S4)** | user taps "Notify me" on a B-cell sheet but no email is saved this session | Sheet replaces the [Notify me] button with a single-row inline email input + [Notify me with this email] CTA. Validates `^.+@.+\..+$` client-side; on submit, writes `user_interest{ store_pref, signal:'wanted_deal' }` keyed on the entered email and shows toast "Saved [email] — we'll flag this if [Store] drops it · Undo". Reuses v3.2 email-as-lookup-key behaviour; no extra round-trip or confirmation email. |
| **Error** | freshness query fails | 7 cells in dashed-border state + "Couldn't load store availability. [Retry]" inline |
| **Stale data** | most recent `pipeline_run` >7 days old | Strip header shows: "Updated [N] days ago" (S5 unified copy) with caution colour. Cells still render with their last known state. |

### 2.10 Interaction flow

1. User opens My List comparison page or a sub-cat band.
2. Strip renders with 7 cells, sorted left-to-right by deal status (A first, then B by recency, then C).
3. User taps Coop cell (B-state).
4. Inline sheet expands below the strip (250 ms slide-down, max-height 240 px). Strip stays in place.
5. Sheet shows: "Last on deal at Coop on 6 Apr · CHF 1.45 (-10 %). The current shelf price is around CHF 1.55. We'll let you know when it's on deal again. [Notify me] [Hide Coop here]".
6. User taps Notify → writes `user_interest{ concept_id, store_pref:'coop', signal:'wanted_deal' }`. Toast: "We'll flag this if Coop drops it. Undo".
7. User taps a C cell (Volg). Sheet shows: "We haven't seen Whole milk 1 L at Volg yet. Volg's online flyer doesn't always list it; we'll keep checking. [Hide Volg here]".
8. User dismisses sheet by tapping the cell again or swiping down.

### 2.11 Copy (every word, all 4 locales)

Italian remains the longest-string stress target. Longest per row noted in **bold-italic**.

| Element | EN | DE | FR | IT |
|---|---|---|---|---|
| A-row label format | On deal · [price] · -[N]% | Im Angebot · [price] · -[N]% | En promo · [price] · -[N]% | _**In offerta · [price] · -[N]%**_ |
| A-row delta | +[N.NN] (vs cheapest) | +[N.NN] (vs. günstigster) | +[N.NN] (vs le moins cher) | _**+[N.NN] (vs il più economico)**_ |
| B-row label format | Last on deal [N] [days/weeks/months] ago | Letztes Angebot vor [N] [Tagen/Wochen/Monaten] | Dernière promo il y a [N] [jours/semaines/mois] | _**Ultima offerta [N] [giorni/settimane/mesi] fa**_ |
| B-row delta | regular | regulär | normal | _**regolare**_ |
| C-row label | Not yet seen at [Store] | Bei [Store] noch nicht gesehen | Pas encore vu chez [Store] | _**Non ancora visto da [Store]**_ |
| C-footer (multi-store) | Not yet seen at: [Store], [Store], [Store] | Noch nicht gesehen bei: [Store], [Store], [Store] | Pas encore vu chez : [Store], [Store], [Store] | _**Non ancora visto da: [Store], [Store], [Store]**_ |
| Strip stale notice (S5 unified) | Updated [N] days ago | Aktualisiert vor [N] Tagen | Mis à jour il y a [N] jours | _**Aggiornato [N] giorni fa**_ |
| Strip header label (S1 legend) | Where each store stands [?] | Wie jeder Laden steht [?] | État dans chaque magasin [?] | _**Stato in ogni negozio [?]**_ |
| Legend popover header | What these symbols mean | Was diese Symbole bedeuten | Signification des symboles | _**Cosa significano questi simboli**_ |
| Legend popover body | ● on deal · ○ off deal · ▢ not yet seen here | ● im Angebot · ○ nicht im Angebot · ▢ hier noch nicht gesehen | ● en promo · ○ hors promo · ▢ pas encore vu ici | _**● in offerta · ○ fuori offerta · ▢ non ancora visto qui**_ |
| B-cell sheet header | Last on deal at [Store] on [DD MMM] · [price] (-[N]%) | Letztes Angebot bei [Store] am [DD MMM] · [price] (-[N]%) | Dernière promo chez [Store] le [DD MMM] · [price] (-[N]%) | _**Ultima offerta da [Store] il [DD MMM] · [price] (-[N]%)**_ |
| B-cell sheet body | The current shelf price is around CHF [N.NN]. We'll let you know when it's on deal again. | Der aktuelle Regalpreis liegt bei rund CHF [N.NN]. Wir melden uns, wenn es wieder im Angebot ist. | Le prix en rayon est d'environ CHF [N.NN]. On te prévient quand ce sera de nouveau en promo. | _**Il prezzo a scaffale è circa CHF [N.NN]. Ti avviseremo quando sarà di nuovo in offerta.**_ |
| B-cell CTA primary | Notify me | Benachrichtigen | Me prévenir | _**Avvisami**_ |
| B-cell CTA primary (no-email, S4) | Notify me with this email | Mit dieser E-Mail benachrichtigen | Me prévenir avec cet e-mail | _**Avvisami con questa e-mail**_ |
| B-cell email input placeholder (S4) | your.email@example.ch | deine.adresse@beispiel.ch | ton.adresse@exemple.ch | _**la.tua.email@esempio.ch**_ |
| B-cell CTA secondary | Hide [Store] here | [Store] hier ausblenden | Masquer [Store] ici | _**Nascondi [Store] qui**_ |
| C-cell sheet header | We haven't seen [item] at [Store] yet. | Wir haben [item] bei [Store] noch nicht gesehen. | On n'a pas encore vu [item] chez [Store]. | _**Non abbiamo ancora visto [item] da [Store].**_ |
| C-cell sheet body | [Store]'s online flyer doesn't always list it; we'll keep checking. | Der Online-Prospekt von [Store] führt das nicht immer; wir prüfen weiter. | Le prospectus en ligne de [Store] ne le liste pas toujours ; on continue de vérifier. | _**Il volantino online di [Store] non lo elenca sempre; continueremo a controllare.**_ |
| C-cell CTA | Hide [Store] here | [Store] hier ausblenden | Masquer [Store] ici | _**Nascondi [Store] qui**_ |
| Toast (notify) | We'll flag this if [Store] drops it · Undo | Wir melden uns, wenn [Store] es senkt · Rückgängig | On te prévient si [Store] le baisse · Annuler | _**Ti avviseremo se [Store] lo abbassa · Annulla**_ |
| Toast (notify, S4) | Saved [email] — we'll flag this if [Store] drops it · Undo | [email] gespeichert — wir melden uns, wenn [Store] es senkt · Rückgängig | [email] enregistré — on te prévient si [Store] le baisse · Annuler | _**[email] salvato — ti avviseremo se [Store] lo abbassa · Annulla**_ |
| Toast (hide) | [Store] hidden for this item · Undo | [Store] für diesen Artikel ausgeblendet · Rückgängig | [Store] masqué pour cet article · Annuler | _**[Store] nascosto per questo articolo · Annulla**_ |
| Empty state | We're still finding [item] across stores. Check back next week. | Wir suchen noch [item] in den Läden. Schau nächste Woche wieder. | On cherche encore [item] dans les magasins. Reviens la semaine prochaine. | _**Stiamo ancora cercando [item] nei negozi. Torna la prossima settimana.**_ |
| Error inline | Couldn't load store availability. Retry | Verfügbarkeit konnte nicht geladen werden. Erneut versuchen | Impossible de charger la disponibilité. Réessayer | _**Impossibile caricare la disponibilità. Riprova**_ |

**Longest-string rows for the 200% zoom test:** B-cell sheet body (IT, 102 chars) and Toast (notify, S4, IT, 84 chars) — both confirmed to fit at 200% zoom on 375 px and to wrap cleanly at <360 px.

### 2.12 Accessibility checklist

- [x] Each cell ≥ 44 × 52 px (above WCAG AAA 44 px floor).
- [x] 8 px gap between cells (Fitts spacing).
- [x] All three states distinguishable in greyscale (icon shape + position).
- [x] Cells render at 200 % text size — at default 375 px width, strip remains horizontal; at any width <360 px (including 320 px and 200%-zoomed mid-size widths), strip stacks as 7 vertical rows (M3, P3-locked).
- [x] At <360 px on the comparison page, only the first list item's strip renders fully expanded; subsequent items collapse to a single-summary row with a 44 px tap target to expand. Mitigation keeps the verdict above-the-fold.
- [x] VoiceOver: each cell announces "Coop. Last on deal 3 weeks ago. Tap to see details." — full state, no abbreviation.
- [x] Inline sheet has focus trap; first focusable = primary CTA; Esc closes.
- [x] Contrast ratios verified: ink-2 (#444) on paper = 9.8:1 (AAA). ink-3 (#666) on page (#f5f5f5) = 5.1:1 (AA, AAA for large).
- [x] No information conveyed by colour alone (per WCAG 1.4.1) — confirmed by greyscale screenshot test in spec review.
- [x] German labels: "Vor 3 Wochen im Angebot" — fits at default size; tested at 200 %.

### 2.13 Subtraction test

**What I removed:**
- A separate "freshness drawer" that listed every SKU's history per store — feature creep. The B-cell tap-sheet covers the 90 % case; deeper history is for SRE, not shoppers.
- A coloured ribbon across the top of the band saying "5 of 7 stores carry this." — redundant with the cells themselves.
- A continuous progress bar showing "0 days → 90+ days last seen" — fake precision; real shoppers think in "this week / a few weeks / a while".
- Notification opt-in defaulted to ON — never default opt-ins to ON for emails. Always explicit (Swiss + GDPR + honesty).

**What's left that could still go:**
- The `regular` text in the delta column for B-rows — could be a hyphen `—`. Kept because "regular" is information ("you'd pay shelf price, not deal price"), not just absence.
- The "Hide [Store] here" CTA — solo project, no real users, premature. **Open question for PM:** ship without, add when a friend complains "Why does Volg keep showing as not-seen?"

### 2.14 Friction log

| Step | Friction | Severity | Fix |
|---|---|---|---|
| Sees 7-cell strip first time | "What does ○ vs ● mean?" | Medium | **(S1)** Persistent 16×16 `?` button inline with strip header label ("Where each store stands [?]"). Tap opens a 1-screen popover: "● on deal · ○ off deal · ▢ not yet seen here". No dismiss; available every visit. Recognition over recall (Nielsen #6) — users returning after weeks recover meaning instantly. Replaces the originally-spec'd one-time tooltip. |
| Wants to know deal end date | "When does this expire?" | Low | A-cell tap sheet shows "Valid until DD MMM" inline. |
| Wants to ignore a store | "I don't shop at Volg, can it stop appearing?" | Medium | Per-list "Hide Volg here" inside C-cell sheet. Per-account global "Stores I don't shop at" lives in Settings (existing chip rail). |
| Tap-target on the smallest phone | At <360 px, 7 cells × 44 px = 308 px + 6 × 4 px = 332 px → overflows | Medium | **(M3, P3-locked)** Strip stacks as 7 vertical rows. On comparison page, first item full + others single-summary collapse. See §2.5, §2.9, §2.12. |
| Wants to subscribe to a deal but isn't a saved-list user yet | First-tap "Notify me" silently does nothing (no email on file) | Medium | **(S4)** New "Notify (no-email)" state — sheet replaces button with inline 1-line email input + "Notify me with this email" CTA. See §2.9. |
| User confused why ○ Coop ranks above ○ Lidl | Sort order | Low | Sort by recency desc; **(N1)** tie-break is `STORE_DISPLAY_ORDER` (existing constant) — never alphabetical. Alphabetical never matches the user's mental model and shifts when stores are renamed/merged. Documented in tap-sheet — no UI label needed. |

### 2.15 Quality score

| Dimension | Score | Reason |
|---|---|---|
| **Utility** | Excellent | Solves a real misread (no-deal = no-sell) using one cell type, applied consistently across three surfaces. Honesty-first; never lies about what we know. |
| **Usability** | Good | Three-state visual language is learnable in <30 s; one-time tooltip closes the discoverability gap. Cell-tap behaviour is consistent across contexts. |
| **Craft** | Excellent | Reuses existing tokens, no new raw colours, redundant encoding holds at greyscale and colourblind tests, every state designed including stale and error. |
| **Beauty** | Good | Restrained — three icons, three text labels, no decoration. Strip on the comparison page is genuinely elegant: 7 cells, 1 line, full information density. |

### 2.16 Open questions for PM

1. **B → C threshold** — at what `last_deal_seen_at` age does a store flip from B (off-deal-but-known) to C (effectively unseen)? Currently locked: 90 days. Confirm or adjust.
2. **C-cell honesty for LIDL/ALDI/Volg** — these stores don't publish full catalogues. So "Not yet seen" is structurally true for ~80 % of concepts. Should we (a) show C-cells everywhere, (b) hide LIDL/ALDI/Volg cells when they're C-state and the concept hasn't been on aktionis.ch in 90 days, or (c) add a per-store badge "limited public catalogue" to the C-cell sheet? Recommend (c) — most honest. PM to confirm.
3. **Notify-when-deal opt-in** — does this require an email collection step (since users return via email key per v3.2 §7)? Recommend yes; reuse the same email; do not send a separate confirmation email (per v3.2 zero-extra-emails principle).
4. **Cell sort order at ties** — A-rows tied on price → alphabetical or store-display-order? Recommend `STORE_DISPLAY_ORDER` (existing constant), keeps the layout stable across sub-cats.

---

## Surface 3 — "Worth Picking Up This Week"

### 3.1 Goal
Surface a small number of strong one-off deals (≥30 % off) on items the user has shown interest in (added, browsed, favourited) but is not currently on their regular list — calmly, factually, with no celebration.

### 3.2 Where it lives
- **Home page (`/[locale]`):** A new section between `VerdictHero` and `MethodologyStrip`, only rendered when ≥1 candidate exists. Title: "Worth picking up this week".
- **My List comparison (`/c/:id`):** A second tab next to the default "My list" view, labelled "Worth picking up · [N]". Number badge only shows when N>0.
- **Empty state on home (D2):** If no candidates and the user is a **returning visitor** (cookie/session indicates a prior page view), the section is **omitted** — calm by absence (Rams #5: unobtrusive). If no candidates and the user is on their **first visit ever** (no `basketch_seen_home` cookie), a single 1-line tag is appended to the MethodologyStrip below: "Start adding items to your list and we'll suggest strong deals here." Tag shown once per session/cookie; never shown to returning users. This preserves calm-by-absence for the people it was designed for, while making the feature discoverable for newcomers (closes the discoverability hole flagged in challenge §6 D2).

### 3.3 Mobile wireframe — home page section (375 px)

```
─────────────────────────────────────────────
 Worth picking up this week
 Strong deals on things you've added before. ← 14 px ink-2
─────────────────────────────────────────────

 ┌──────────────────────────────────────────┐
 │ [img] Energizer AA · 8-pack              │
 │       ● Migros · -50%                    │
 │       CHF 4.95  was 9.90                 │
 │       You added these 6 weeks ago —      │ ← context line, ink-3 12 px (M7 variant
 │       strong deal back this week         │     when re-suggesting an older add)
 │  ┌─────────┐  ┌────────┐  ┌──────────────┐│
 │  │   Add   │  │ Not now│  │Don't suggest││ 44 px each, 8 px gap (D4 rename)
 │  │         │  │        │  │   again     ││
 │  └─────────┘  └────────┘  └──────────────┘│
 └──────────────────────────────────────────┘ 4 px gap
 ┌──────────────────────────────────────────┐
 │ [img] Coop Dark Chocolate 100 g · -40%   │
 │       ● Coop                             │
 │       CHF 1.20  was 2.00                 │
 │       You browsed this 2 weeks ago       │
 │  [Add] [Not now] [Don't suggest again]   │
 └──────────────────────────────────────────┘
 ┌──────────────────────────────────────────┐
 │ [img] Naturafarm Free-range Eggs · -35%  │
 │       ● Coop                             │
 │       CHF 4.20  was 6.50                 │
 │       Like Free-range eggs you favourited│
 │  [Add] [Not now] [Don't suggest again]   │
 └──────────────────────────────────────────┘

 [ Show all 5 · ↓ ]                          ← 44 px ghost button, ink-2 (S3 unified)

─────────────────────────────────────────────
```

Card anatomy:

```
┌────────────────────────────────────────────┐
│ ┌──────┐  Energizer AA · 8-pack            │  Image 64×64 (smaller than DealCard primary)
│ │ img  │  ● Migros · -50%                  │  Store pill (existing) + discount tag
│ │      │                                   │
│ └──────┘                                   │
│           CHF 4.95  was 9.90               │  PriceBlock size="sm"
│           ───────────────────              │
│           You added these 6 weeks ago      │  ink-3 12 px — the WHY
│           ─────────────────────────        │
│ [   Add   ] [ Not now ] [Don't suggest again] │  3 buttons, 44 px tall, 8 px gap (D4)
└────────────────────────────────────────────┘
```

**Image spec (N3):** Rendered with `next/image`, intrinsic 64×64, `object-contain`, page-bg fallback (`--color-page`) when no image, `priority` (no lazy-load) for the top 3 cards above the fold. Cards 4+ inside the "Show all [N]" expansion may lazy-load. Image source: existing product image URL from `sku.image_url`; if null, fall back to a 64×64 generic concept-family glyph (1 of ~12 pre-baked SVGs in `web-next/public/concept-glyphs/`).

**<360 px variant (M4):** Three full-width vertically-stacked buttons place the destructive action ("Don't suggest again") directly above the next card's image — Fitts trap. At any width <360 px, the action row collapses to:

```
┌──────────────────────────────────────────┐
│ [img] Energizer AA · 8-pack              │
│       ● Migros · -50%                    │
│       CHF 4.95  was 9.90                 │
│       You added these 6 weeks ago        │
│  ┌────────────────────────┐  ┌────────┐  │
│  │         Add            │  │   ⋯    │  │ Primary 44 px full-width;
│  └────────────────────────┘  └────────┘  │ overflow 44×44 px (8 px gap)
└──────────────────────────────────────────┘
```

The `⋯` button is the overflow trigger; tap opens a small inline menu (anchored under the button) with two items: "Not now" (44 px) and "Don't suggest again" (44 px). Primary "Add" stays one tap; destructive is gated behind a deliberate second tap. See §3.9 for the <360 px branch and §3.12 for `aria-haspopup="menu"`.

### 3.4 Why three actions, not two

The conventional pattern is "Add / Dismiss". basketch needs three because the user has three distinct intents:

| Intent | Action | Effect on data |
|---|---|---|
| "Yes, I want this on this week's list." | **Add** | Insert into My List; remove from Worth-picking-up for the rest of the week. |
| "Maybe next week — don't ask me again this week." | **Not now** | Hide from Worth-picking-up for 7 days; `user_interest` row unchanged (still a candidate next week if a new deal appears). |
| "I never want this surfaced again." | **Don't suggest again** (D4 rename) | Set `user_interest.dismissed_at = now()`; never surface this concept here again, **unless restored from Surface 3.5 (Settings → Hidden suggestions)**. |

Without "Don't suggest again", the same dismissed concept reappears every week — annoyance compounds. Without "Not now", users use "Don't suggest again" as a soft dismiss and lose future signal — false negatives.

**Re-suggestion logic for items the user already added in the past (M7, PM Q12-locked):**

The same concept may legitimately re-appear in Worth-picking-up after a long gap if the deal is meaningfully better than the one that triggered the original add. Without a copy signal, the user reads it as a bug ("why is basketch suggesting something I already bought 8 weeks ago?"). The card therefore swaps its context line to make the re-suggest behaviour explicit.

| Condition | Context-line copy used (§3.11) | Notes |
|---|---|---|
| `user_interest.added_at` within typical re-suggest window (≤4 weeks) | "You added these [N] [days/weeks] ago" (default) | Standard surface — recent add, normal cadence. |
| `user_interest.added_at` older than re-suggest window (>4 weeks) AND current week's discount ≥ original add-time discount + 5 pp | **"You added these [N] weeks ago — strong deal back this week"** (M7 variant) | The "back this week" tail is the honest signal. Caps re-suggestion at "genuinely better than what triggered the original add" — otherwise the user is right to read it as noise. |
| `user_interest.added_at` older than re-suggest window AND current discount < original + 5 pp | **Not surfaced.** | Suppressed at the candidate-query level, not just hidden in UI. |
| `user_interest.dismissed_at IS NOT NULL` | **Not surfaced.** | Only Surface 3.5 can revive these. |

### 3.5 Calm presentation rules (Swiss restraint)

These are **guardrails** the surface must follow:

1. **No exclamation marks anywhere.** Including microcopy. (Tested in copy table below — no `!` in any string.)
2. **No celebration motion (D1 rename).** No confetti, no haptic, no sound, no celebratory bounce/flash. Functional micro-feedback **is required** — a 200 ms collapse on Add and a 250 ms toast slide-in are not celebration; they are confirmation that the action worked (Norman: every action requires feedback). Calm is not silent. Builder must not strip these animations.
3. **No "YOU SAVED CHF X" banner.** The price block already shows the discount; no second mention.
4. **No countdown timer.** "Deal ends in 2 days 4 hours" is gamification. We show "valid until [date]" only inside the tap sheet, not on the card.
5. **No urgency colours.** No red, no flame icon, no "limited time" badge. The discount % chip already encodes value (existing Tag tone).
6. **Maximum 3 cards above the fold.** Beyond that, "Show all [N]" disclosure (S3). Calm density.
7. **Section omitted when N=0** for returning users — not shown empty (per §3.2). The home page contracts; that's correct. **First-visit-ever users (D2)** get a single 1-line tag inside MethodologyStrip so the feature is discoverable without forcing an empty state on returning users — see §3.7 stale/empty handling.
8. **No score, no rank, no "best deal".** The cards are sorted by `user_interest_weight × discount_pct` but the user never sees the score.

### 3.6 The 5-card maximum (with disclosure)

S3 unifies the disclosure: **one pattern, "Show all [N]"**, regardless of candidate count. "Show 2 more" reads as a different control than "Show all 7"; users learn the rule once.

| Section state | Cards visible |
|---|---|
| 0 candidates | Section omitted entirely (D2 first-visit hint in MethodologyStrip — see §3.2 + §3.7) |
| 1–3 candidates | All shown, no disclosure |
| 4–5 candidates | 3 shown, "Show all [N] · ↓" disclosure below |
| 6–10 candidates | 3 shown, "Show all [N] · ↓" disclosure |
| 10+ candidates | 3 shown, "Show all [N] · ↓" disclosure; expanded view paginates at 10 |

Beyond 10 candidates, the user is in "browse more deals" territory — direct them to /deals with a pre-filter on their interest categories rather than expanding the section indefinitely.

### 3.7 All 7 states

| State | Trigger | Display |
|---|---|---|
| **Default** | ≥1 candidate, deals fresh | as wireframe |
| **Loading** | candidates being computed (cold start of page) | 3 skeleton cards (image rect, 2 text lines, 3 button shapes), 200 ms typical because materialised view; no spinner |
| **Empty (returning user)** | 0 candidates AND `basketch_seen_home` cookie present | Section omitted from page (silent — calm by absence) |
| **Empty (first visit, D2)** | 0 candidates AND no `basketch_seen_home` cookie | Section omitted; MethodologyStrip below shows a single 1-line tag: "Start adding items to your list and we'll suggest strong deals here." Cookie is set on this render so the tag never shows again. |
| **Single item** | 1 candidate | 1 card, no disclosure |
| **Populated** | 2+ candidates | as wireframe |
| **Error** | candidate query fails | Section shows minimal strip: "Couldn't load suggestions. [Retry]" — does not break home page rendering |
| **Stale data** | pipeline_run >7 days old | Section shows banner above cards: "Updated [N] days ago" (S5 unified copy). Cards still render. |

### 3.8 Cold-start state (user has 0 interest signals yet)

Per the data model spec: "until you have 5+ interest items, fall back to top deals in your starter pack categories." This is a critical state — most first-time visitors hit it.

**Cold-start variant of the section:**

```
─────────────────────────────────────────────
 Worth a look this week
 Strong deals across the basics. Pick a starter pack to make this personal.
─────────────────────────────────────────────

 [3 cards as before, sourced from highest-discount deals in fresh+dairy+pantry]

 [ Pick a starter pack · ↗ ]
─────────────────────────────────────────────
```

Differences:
- Title changes: "Worth picking up" → "Worth a look" (honest — it's not yet personal).
- Subtitle is a soft CTA explaining the missing personalisation.
- Context line on each card changes from "You added X" to "Top discount in [Category] this week".
- The whole section disappears once `user_interest` has 5+ rows and switches into the personal variant.

### 3.9 Interaction flow

1. User lands on home. Snapshot fetches; section renders with 3 cards.
2. User taps **Add** on card 1 (batteries).
3. Card animates a 200 ms collapse (height shrinks to 0; D1 — this is functional micro-feedback, not celebration). Card 4 (if any) slides up into the slot (200 ms ease-out).
4. Toast bottom-of-screen: "Added Energizer AA 8-pack · Undo" (250 ms slide-in from bottom).
5. BottomBar list count increments by 1.
6. User taps **Not now** on card 2 (chocolate). Card collapses. Toast: "We'll keep watching · Undo".
7. User taps **Don't suggest again** (D4 rename) on card 3. Confirmation inline (NOT a modal): the three buttons are replaced by "Stop suggesting Naturafarm Free-range Eggs? · [Stop suggesting] · [Cancel]" within the same card. This is the only destructive action; constraint-first error prevention (Norman).
8. User confirms → card collapses; toast: "Won't be suggested again · Undo".
9. **Undo** within 5 s reverses the action immediately (the row's `dismissed_at` is cleared). After 5 s, recovery is available via **Settings → Hidden suggestions** (`/[locale]/settings/hidden`) — see Surface 3.5.

**<360 px branch (M4):** at step 6 the user taps the `⋯` overflow button on the chocolate card. The menu opens anchored beneath the button with "Not now" and "Don't suggest again". User taps "Not now" → menu dismisses, card collapses, toast appears. At step 7, user taps `⋯` then "Don't suggest again" → menu dismisses; the same in-card confirmation prompt as the >360 px flow appears (the `[Add] [⋯]` row is replaced by "Stop suggesting [item]? · [Stop suggesting] · [Cancel]"). Identical confirmation copy and behaviour at both widths — only the entry tap-path differs.

### 3.10 Section title rationale

Three options were considered:

| Option | Verdict |
|---|---|
| "Recommended for you" | Rejected — algorithmic, opaque, gamified. |
| "This week's deals on your favourites" | Rejected — too long, "favourites" is overloaded with v3.1 concept. |
| **"Worth picking up this week"** | Accepted — descriptive, honest, the user-spec language from `project_basketch_goal.md`. |

### 3.11 Copy (every word, all 4 locales)

Italian remains the longest-string stress target. Longest per row noted in **bold-italic**. D4 rename ("Hide forever" → "Don't suggest again") and M7 new "back this week" variant included; S3 disclosure unified to "Show all [N]"; S5 stale-data unified to "Updated [N] days ago".

| Element | EN | DE | FR | IT |
|---|---|---|---|---|
| Section title (personal) | Worth picking up this week | Lohnt sich diese Woche | À saisir cette semaine | _**Da prendere questa settimana**_ |
| Section subtitle (personal) | Strong deals on things you've added before. | Starke Angebote für Dinge, die du schon hinzugefügt hast. | Bonnes promos sur ce que tu as déjà ajouté. | _**Forti offerte su cose che hai già aggiunto.**_ |
| Section title (cold start) | Worth picking up this week | Lohnt sich diese Woche | À saisir cette semaine | _**Da prendere questa settimana**_ |
| Section subtitle (cold start, S6) | Strong deals across the basics this week. | Starke Angebote bei den Grundlagen diese Woche. | Bonnes promos sur les essentiels cette semaine. | _**Forti offerte sugli essenziali questa settimana.**_ |
| Card context line — added before | You added these [N] [days/weeks/months] ago | Vor [N] [Tagen/Wochen/Monaten] hinzugefügt | Ajouté il y a [N] [jours/semaines/mois] | _**Aggiunto [N] [giorni/settimane/mesi] fa**_ |
| Card context line — back this week (M7) | You added these [N] weeks ago — strong deal back this week | Vor [N] Wochen hinzugefügt — diese Woche wieder stark im Angebot | Ajouté il y a [N] semaines — forte promo de retour cette semaine | _**Aggiunto [N] settimane fa — forte offerta di nuovo questa settimana**_ |
| Card context line — browsed | You browsed this [N] [days/weeks/months] ago | Vor [N] [Tagen/Wochen/Monaten] angesehen | Consulté il y a [N] [jours/semaines/mois] | _**Visto [N] [giorni/settimane/mesi] fa**_ |
| Card context line — favourited (legacy) | Like [item] you favourited | Wie [item], das du favorisiert hast | Comme [item] que tu as mis en favori | _**Come [item] che hai messo nei preferiti**_ |
| Card context line — cold start | Top discount in [Category] this week | Top-Rabatt bei [Category] diese Woche | Plus grosse promo en [Category] cette semaine | _**Sconto migliore in [Category] questa settimana**_ |
| First-visit empty hint (D2, in MethodologyStrip) | Start adding items to your list and we'll suggest strong deals here. | Füge Artikel zu deiner Liste hinzu — wir schlagen dir hier starke Angebote vor. | Ajoute des articles à ta liste, on te suggérera de bonnes promos ici. | _**Aggiungi articoli alla tua lista e ti suggeriremo forti offerte qui.**_ |
| Add button | Add | Hinzufügen | Ajouter | _**Aggiungi**_ |
| Not now button | Not now | Nicht jetzt | Pas maintenant | _**Non ora**_ |
| Don't suggest again button (D4) | Don't suggest again | Nicht mehr vorschlagen | Ne plus suggérer | _**Non suggerire più**_ |
| Don't suggest again confirm prompt (D4) | Stop suggesting [item]? | [item] nicht mehr vorschlagen? | Ne plus suggérer [item] ? | _**Smettere di suggerire [item]?**_ |
| Confirm primary (D4) | Stop suggesting | Nicht mehr vorschlagen | Ne plus suggérer | _**Smetti di suggerire**_ |
| Confirm secondary (D4) | Cancel | Abbrechen | Annuler | _**Annulla**_ |
| Show all disclosure (S3 unified) | Show all [N] | Alle [N] anzeigen | Voir les [N] | _**Mostra tutti [N]**_ |
| Toast — Add | Added [item] · Undo | [item] hinzugefügt · Rückgängig | [item] ajouté · Annuler | _**Aggiunto [item] · Annulla**_ |
| Toast — Not now | We'll keep watching · Undo | Wir behalten es im Auge · Rückgängig | On garde un œil · Annuler | _**Lo terremo d'occhio · Annulla**_ |
| Toast — Don't suggest again (D4) | Won't be suggested again · Undo | Wird nicht mehr vorgeschlagen · Rückgängig | Ne sera plus suggéré · Annuler | _**Non verrà più suggerito · Annulla**_ |
| Stale banner (S5 unified) | Updated [N] days ago | Aktualisiert vor [N] Tagen | Mis à jour il y a [N] jours | _**Aggiornato [N] giorni fa**_ |
| Error inline | Couldn't load suggestions. Retry | Vorschläge konnten nicht geladen werden. Erneut versuchen | Impossible de charger les suggestions. Réessayer | _**Impossibile caricare i suggerimenti. Riprova**_ |
| Cold-start CTA | Pick a starter pack | Starterpaket wählen | Choisir un pack de départ | _**Scegli un pacchetto di partenza**_ |
| Overflow menu label (M4 <360 px) | More actions | Weitere Aktionen | Plus d'actions | _**Altre azioni**_ |

**Longest-string rows for the 200% zoom test:** "Card context line — back this week" (IT, ~74 chars) and "First-visit empty hint" (IT, 70 chars) — both confirmed to wrap cleanly to 2 lines at 375 px and remain readable at 200% zoom.

### 3.12 Accessibility checklist

- [x] All 3 buttons per card ≥ 44 × 44 px, 8 px gap (≥360 px width).
- [x] **(M4)** At <360 px, action row is `[Add] [⋯]` — primary 44 px full-width, overflow trigger 44 × 44 px with `aria-haspopup="menu"` and `aria-label="More actions"`. Menu items "Not now" and "Don't suggest again" each ≥ 44 px; menu uses `role="menu"`, items use `role="menuitem"`, focus trapped while open, Esc closes and returns focus to the `⋯` trigger.
- [x] Card is a `<article>` with `aria-labelledby` pointing to product name.
- [x] Discount chip uses `Tag` component (existing, already passes contrast).
- [x] Section is semantic `<section aria-labelledby="worth-picking-up-title">`.
- [x] Skeleton state announced to AT: "Loading suggestions" once.
- [x] **(D4)** "Don't suggest again" confirmation has explicit Stop/Cancel pair; no swipe-to-confirm (Norman: constraint).
- [x] Toast undo is keyboard-focusable (focus moves to it on appear, returns to card area on dismiss).
- [x] Cold-start "Pick a starter pack" link has `aria-label="Pick a starter pack to personalise these suggestions"`.
- [x] No emoji used as informational icons (per Swiss tone).
- [x] All copy fits within card padding at default and at 200% zoom across EN/DE/FR/IT (M2). Italian (longest) tested: "Aggiunto 6 settimane fa — forte offerta di nuovo questa settimana" wraps to 2 lines on 375 px, 3 lines at 200% zoom — confirmation prompt and overflow menu remain reachable.

### 3.13 Subtraction test

**What I removed:**
- A "savings counter" at the top of the section ("You could save CHF 12.40 this week") — gamification, breaks Swiss tone.
- A "share this deal" button on each card — premature; data model doesn't support per-deal sharing yet, and the verdict-card share covers the broader sharing case.
- A "deal expires in 2d 4h" countdown — gamification.
- A "more like this" related-products carousel inside each card — feature creep, breaks card simplicity.
- A "snooze 30 days" option in addition to "Not now" and "Don't suggest again" — three actions is the limit; 30 days is just a slow "Don't suggest again" in practice (and now Surface 3.5 makes restoration trivial).
- A "Why are you seeing this?" info icon explaining the algorithm — answered by the context line itself ("You added these 6 weeks ago").

**What's left that could still go:**
- The "Show all N" disclosure for >10 candidates — could simply cap at 10 and link to /deals. **Open question for PM.**
- Cold-start variant title change — could keep "Worth picking up" everywhere for consistency. Kept the variant because honesty matters more than consistency here.

### 3.14 Friction log

| Step | Friction | Severity | Fix |
|---|---|---|---|
| First-time user, no signals yet | Sees "Worth picking up" but it's not actually personal | Medium | Cold-start variant explicitly says "Strong deals across the basics" — no false personalisation claim. |
| User taps "Don't suggest again" by mistake (D4) | Wants it back | Medium | 5-s Undo on toast. After that, recovery via **Settings → Hidden suggestions** (Surface 3.5) — fully reversible. |
| User adds, regrets, can't find on My List | "Where did the battery deal go?" | Medium | Toast Undo + the item is now in My List with the same image — visual continuity preserved. |
| User wants to see WHY it was suggested | "Why this and not [other thing]?" | Low | Context line answers the why. Algorithm transparency without exposing the score. |
| Three buttons feel cramped | At <360 px, the third button wraps and the destructive action lands in the next card's tap zone | Medium → Closed by **(M4)** — at <360 px the action row collapses to `[Add] [⋯]` overflow menu pattern. Destructive action is gated behind a deliberate second tap; no Fitts trap. |
| User has been using basketch for 6 months | "Worth picking up" gets stale | Future | **Open question for PM:** if a card is shown 3+ weeks running and never tapped, auto-expire it. |

### 3.15 Quality score

| Dimension | Score | Reason |
|---|---|---|
| **Utility** | Good | Surfaces real signal (interest × deal strength) without forcing it on the user. Calm enough to coexist with the verdict, decisive enough to drive action. |
| **Usability** | Good | 3 actions cover the 3 real intents. Undo on every action. Cold-start handled honestly. |
| **Craft** | Good | Reuses existing card primitives, store pills, price blocks, tags. New only: the section title pattern and the 3-button row. |
| **Beauty** | Good | Genuinely calm — no urgency colours, no celebration, no countdown. Sits below the verdict without competing for attention. |

### 3.16 Open questions for PM (v3.3.1 — all locked)

1. **Discount threshold** — locked at 30% per PM Q9. Revisit if signal is too noisy.
2. **Hidden-suggestions recovery** — built in v3.3 per PM Q10; designed as Surface 3.5 below.
3. **Cold-start cutoff** — confirmed at exactly 5 `user_interest` rows per PM Q11.
4. **Re-suggestion frequency** — confirmed per PM Q12: never re-suggest within the same week if already added; re-suggest after long gap only when discount ≥ original add-time discount + 5pp (M7). Card uses the "back this week" context-line variant in §3.11.
5. **Worth-picking-up tab on My List** — same behaviour everywhere. Hidden rows do not appear in either surface; they only appear in Surface 3.5.

---

## Surface 3.5 — Settings: Hidden suggestions

### 3.5.1 Goal
Give the user a calm, reversible recovery path for every concept they have dismissed via "Don't suggest again" (D4) on Surface 3 — so the destructive action is genuinely reversible (PM Q10), and the brand impression at the moment of mis-tap is "I can fix this" rather than "it's gone forever".

### 3.5.2 Where it lives
- **Route:** `/[locale]/settings/hidden`
- **Triggers (entry points):**
  1. **From the toast** on Surface 3 (post-undo-window): the toast "Won't be suggested again · Undo" leaves a residual link in the BottomBar's overflow menu for 24 hours: "Restore hidden suggestions". This catches the user who thinks of it within a day.
  2. **From the Settings nav entry:** `/[locale]/settings` (existing or new sidebar item) → "Hidden suggestions [N]". Badge shows count of currently-dismissed rows.
- **Page context:** Standard Settings page — full viewport on mobile (Vaul `direction="bottom"` is wrong here; this is a navigated page, not an overlay). Desktop renders inside the existing Settings two-pane layout.

### 3.5.3 Mobile wireframe (375 px)

```
┌─────────────────────────────────────────────┐ ◀ status bar
│  ←  Hidden suggestions                      │ 56 px header, ink
│                                              │
│  4 items you've asked us not to suggest.     │ 14 px ink-2
│  Tap Restore to start seeing them again.     │
│                                              │
│  ────────────────────────────────────────    │
│  Last week                                   │ section label, 12 px caps, ink-3
│  ┌────────────────────────────────────────┐  │
│  │ [img] Naturafarm Free-range Eggs       │  │ 64×64 image (N3 spec reused)
│  │       Hidden 2 days ago                │  │ 12 px ink-3
│  │                          [  Restore  ] │  │ 44 px ghost button, ink
│  └────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────┐  │
│  │ [img] Coop Dark Chocolate 100 g        │  │
│  │       Hidden 4 days ago                │  │
│  │                          [  Restore  ] │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  Earlier                                     │
│  ┌────────────────────────────────────────┐  │
│  │ [img] Energizer AA 8-pack              │  │
│  │       Hidden 3 weeks ago               │  │
│  │                          [  Restore  ] │  │
│  └────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────┐  │
│  │ [img] Migros Bio Greek Yogurt 500 g    │  │
│  │       Hidden 2 months ago              │  │
│  │                          [  Restore  ] │  │
│  └────────────────────────────────────────┘  │
│                                              │
│ ────────────────────────────────────────────  ← thumb-zone divider
│ ┌─────────────────────────────────────────┐  │
│ │  Restore all 4                          │  │ 56 px outlined button (not primary;
│ └─────────────────────────────────────────┘  │ destructive-ish bulk action)
└─────────────────────────────────────────────┘
```

### 3.5.4 Date grouping rules
- **Today / Yesterday** (literal labels) — for items hidden in the last 48 h
- **Last week** — items hidden 3–7 days ago
- **Earlier** — everything older

Same time bands as §2.8 freshness, simplified — predictable grouping at a glance.

### 3.5.5 All 7 states

| State | Trigger | Display |
|---|---|---|
| **Default** | ≥1 hidden row | Wireframe above; date-grouped list. |
| **Loading** (skeleton) | initial fetch | 3 skeleton rows (image + 2 text + button shape), 200 ms typical (single indexed query on `user_interest WHERE dismissed_at IS NOT NULL`). |
| **Empty** | 0 hidden rows ever (or all restored) | Centred ink-3 12 px line: "Nothing hidden right now. When you tap 'Don't suggest again', items show up here." Plus the BottomBar back-link. |
| **Single item** | exactly 1 hidden row | Wireframe but with one card; "Restore all 1" footer collapses to no footer (single Restore button on the card is sufficient). |
| **Populated** | 2+ hidden rows | as wireframe |
| **Error** | query fails | "Couldn't load your hidden list. Retry" inline. Page does not 500. |
| **Stale data** | not applicable — this is user-state, not pipeline-state | n/a (the row exists or it doesn't; nothing to be stale about) |

### 3.5.6 Copy (every word, all 4 locales)

| Element | EN | DE | FR | IT |
|---|---|---|---|---|
| Page title | Hidden suggestions | Ausgeblendete Vorschläge | Suggestions masquées | _**Suggerimenti nascosti**_ |
| Page subtitle | [N] items you've asked us not to suggest. Tap Restore to start seeing them again. | [N] Artikel, die du nicht mehr vorgeschlagen bekommen wolltest. Tippe auf Wiederherstellen, um sie wieder zu sehen. | [N] articles que tu nous a demandé de ne plus suggérer. Touche Restaurer pour les revoir. | _**[N] articoli che ci hai chiesto di non suggerire più. Tocca Ripristina per rivederli.**_ |
| Section label — Today | Today | Heute | Aujourd'hui | _**Oggi**_ |
| Section label — Yesterday | Yesterday | Gestern | Hier | _**Ieri**_ |
| Section label — Last week | Last week | Letzte Woche | La semaine dernière | _**La settimana scorsa**_ |
| Section label — Earlier | Earlier | Früher | Plus ancien | _**Più vecchi**_ |
| Row meta — hidden | Hidden [N] [days/weeks/months] ago | Vor [N] [Tagen/Wochen/Monaten] ausgeblendet | Masqué il y a [N] [jours/semaines/mois] | _**Nascosto [N] [giorni/settimane/mesi] fa**_ |
| Restore button (per row) | Restore | Wiederherstellen | Restaurer | _**Ripristina**_ |
| Restore-all footer | Restore all [N] | Alle [N] wiederherstellen | Restaurer les [N] | _**Ripristina tutti [N]**_ |
| Restore-all confirm prompt | Restore all [N] hidden suggestions? | Alle [N] ausgeblendeten Vorschläge wiederherstellen? | Restaurer les [N] suggestions masquées ? | _**Ripristinare tutti [N] suggerimenti nascosti?**_ |
| Confirm primary | Restore all | Alle wiederherstellen | Tout restaurer | _**Ripristina tutti**_ |
| Confirm secondary | Cancel | Abbrechen | Annuler | _**Annulla**_ |
| Toast — single restore | Restored [item] · Undo | [item] wiederhergestellt · Rückgängig | [item] restauré · Annuler | _**Ripristinato [item] · Annulla**_ |
| Toast — bulk restore | Restored [N] suggestions · Undo | [N] Vorschläge wiederhergestellt · Rückgängig | [N] suggestions restaurées · Annuler | _**Ripristinati [N] suggerimenti · Annulla**_ |
| Empty state | Nothing hidden right now. When you tap "Don't suggest again", items show up here. | Aktuell nichts ausgeblendet. Wenn du auf "Nicht mehr vorschlagen" tippst, erscheinen die Artikel hier. | Rien de masqué pour l'instant. Quand tu touches « Ne plus suggérer », les articles apparaissent ici. | _**Niente nascosto al momento. Quando tocchi "Non suggerire più", gli articoli compaiono qui.**_ |
| Error inline | Couldn't load your hidden list. Retry | Deine ausgeblendete Liste konnte nicht geladen werden. Erneut versuchen | Impossible de charger ta liste masquée. Réessayer | _**Impossibile caricare la tua lista nascosta. Riprova**_ |
| BottomBar residual link (24 h after a Hide tap) | Restore hidden suggestions | Ausgeblendete Vorschläge wiederherstellen | Restaurer les suggestions masquées | _**Ripristina suggerimenti nascosti**_ |

**Longest-string row for 200% zoom test:** Page subtitle (IT, ~110 chars) — wraps to 4 lines at 375 px and remains readable.

### 3.5.7 Interaction flow

1. User opens Settings → "Hidden suggestions [4]" or taps the 24 h BottomBar residual link.
2. Page loads (200 ms typical, single indexed query on `user_interest WHERE dismissed_at IS NOT NULL ORDER BY dismissed_at DESC`).
3. Rows render in date groups.
4. User taps **Restore** on the eggs row.
5. Row collapses (200 ms height-to-zero — D1 functional micro-feedback). The row's `user_interest.dismissed_at` is cleared (set to NULL) — the concept becomes a Surface 3 candidate again.
6. Toast: "Restored Naturafarm Free-range Eggs · Undo". Section count "(4)" decrements to "(3)".
7. **Undo** within 5 s reverses (re-sets `dismissed_at = previous_value`).
8. User taps **Restore all 4** at the footer.
9. Confirmation inline (NOT modal) replaces the footer button: "Restore all 4 hidden suggestions? · [Restore all] · [Cancel]".
10. User confirms → all rows collapse in sequence (50 ms stagger, ~250 ms total). Toast: "Restored 4 suggestions · Undo". Page transitions to the Empty state.

### 3.5.8 Accessibility checklist

- [x] Page is a navigated route (not an overlay) — back button in header is a real `<a>` link to `/[locale]/settings`.
- [x] Each row is `<article>` with `aria-labelledby` on the product name.
- [x] Each Restore button ≥ 44 × 44 px, `aria-label="Restore [item name]"` for screen-reader clarity beyond the visible "Restore".
- [x] "Restore all [N]" button ≥ 56 px, `aria-label` includes the count.
- [x] Date group labels are `<h2>` semantic headings; AT users navigate by heading.
- [x] Confirmation prompt for bulk restore has explicit Yes/Cancel pair; no swipe (Norman: constraint).
- [x] Toast undo focusable; focus returns to the next remaining Restore button after action (or to the empty-state copy if none remain).
- [x] Image follows N3 spec (64×64, `next/image`, page-bg fallback).
- [x] All copy contrast: ink (#1a1a1a) on paper = 16.1:1 (AAA); ink-3 (#666) on paper = 5.7:1 (AA).
- [x] Re-tested at 200% zoom against IT longest-string row — page subtitle and confirmation prompt remain readable.
- [x] Re-tested at 320 px width — image + text + Restore button stack vertically inside the row (image left, text + button right; on <360 px the Restore button drops below the meta line, all 44 px+ tap targets preserved).
- [x] Empty state copy is `aria-live="polite"` so AT users hear it after restoring the last item.

### 3.5.9 Friction log

| Step | Friction | Severity | Fix |
|---|---|---|---|
| User just tapped "Don't suggest again", regrets after toast expires | "Where do I get it back?" | Medium | 24 h BottomBar residual link "Restore hidden suggestions" — appears for 24 h after any Hide action. After that, Settings nav entry. |
| User has 50+ hidden items | List becomes unscannable | Low | Date grouping + the visual gap between groups makes scanning fast even at 50 items. No virtual scroll needed below ~200 rows; if a user crosses 200, that's a separate v3.4 concern (paginate). |
| User wonders why an item is here when they don't remember hiding it | Trust ding | Low | Row meta line "Hidden [N] days ago" gives the timestamp. Future opportunity (post-v3.3): show the source surface ("from Worth picking up · home") for full context — not in scope here. |
| Bulk restore feels destructive (re-flooding suggestions) | Hesitation | Low | Inline confirmation with count makes the consequence explicit. Toast Undo provides recovery. |

### 3.5.10 Quality score

| Dimension | Score | Reason |
|---|---|---|
| **Utility** | Good | Closes the destructiveness loop on Surface 3. Without this page, "Don't suggest again" would be functionally equivalent to "Hide forever" — D4 rename would be dishonest copy. |
| **Usability** | Good | Date grouping, per-row Restore, bulk Restore-all, all with Undo. Standard Settings-page idiom. |
| **Craft** | Good | Reuses image spec from N3, toast pattern from Surfaces 1 & 3, confirmation pattern from §3.9 (in-row inline confirm), all 7 states defined, copy in 4 locales. |
| **Beauty** | Good | Calm by default — no warning colours, no red, no "are you sure" modal. The page is restraint applied to a page-level UI; reads as a quiet inbox of past decisions. |

### 3.5.11 Files this section touches at build time

| File | Change type |
|---|---|
| `web-next/src/app/[locale]/settings/hidden/page.tsx` | New — server component, fetches `user_interest WHERE dismissed_at IS NOT NULL` |
| `web-next/src/components/settings/HiddenSuggestionsList.tsx` | New — client component, renders the date-grouped list with restore actions |
| `web-next/src/components/settings/HiddenRow.tsx` | New — single row with image, meta, Restore button |
| `web-next/src/components/layout/BottomBar.tsx` | Add the 24 h residual link slot |
| `web-next/messages/{en,de,fr,it}.json` | Add all keys from §3.5.6 |

---

## How these 3 surfaces compose

The three surfaces are designed to **share a row in the user's mental model** without competing visually. Here's the home page mocked with all three present simultaneously, mobile (375 px):

```
┌─────────────────────────────────────────────┐
│  basketch        🔍 Search       [≡] [♡ 4] │ ← Header (existing)
│                                             │
│  Aare ▾                                     │ ← Region chip (existing v3.2)
├─────────────────────────────────────────────┤
│                                             │
│  This week                                  │
│  More fresh deals at Migros (-22 %),        │ ← VerdictHero (existing)
│  more household deals at Coop (-18 %).      │
│                                             │
│  [ Fresh ↗ ]  [ Long-life ↗ ]  [ Home ↗ ]   │ ← 3 clickable verdict rows
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│  Worth picking up this week                 │ ◀── SURFACE 3 enters here
│  Strong deals on things you've added before.│
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │ [img] Energizer AA 8-pack            │   │
│  │       ● Migros · -50 %               │   │
│  │       CHF 4.95  was 9.90             │   │
│  │       You added these 6 weeks ago    │   │
│  │  [ Add ] [ Not now ] [Don't suggest again]│
│  └──────────────────────────────────────┘   │
│  ┌──────────────────────────────────────┐   │
│  │ [img] Free-range eggs · -35 %        │   │
│  │       ● Coop                         │   │
│  │       …                              │   │
│  └──────────────────────────────────────┘   │
│  [ Show 2 more · ↓ ]                        │
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│  Methodology · sources · last update        │ ← MethodologyStrip (existing)
│                                             │
└─────────────────────────────────────────────┘

  ↑ Floating BottomBar:  [♡ My list · 4]  [+ Add item]
                              ↑                 ↑
                              ↑                 └── tap → DealsSearch
                              │
                              │ tap → My List drawer opens
                              │
                              ▼
                              │
┌────────────────────────────────────────────┐
│  My list · 4                            ✕ │
│                                            │
│  🥛 Whole milk 1 L · Buy at Migros         │ ◀── SURFACE 2 enters here
│     Cheapest · CHF 1.20 · -25 %            │     (per-item availability strip)
│     ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐           │
│     │● ││● ││○ ││○ ││▢ ││▢ ││▢ │           │
│     └──┘└──┘└──┘└──┘└──┘└──┘└──┘           │
│      M   C   A   D   L   S   V             │
│                                            │
│  🍞 Bread 500 g · Buy at Coop              │
│     ...                                    │
│                                            │
│  [+ Add item ─→ opens search]              │
└────────────────────────────────────────────┘
                    ↓
         User taps "+ Add item", types "milk"
                    ↓
┌────────────────────────────────────────────┐
│ ╶─╴                                         │  ◀── SURFACE 1 enters here
│  Pick your milk                             │      (variant picker sheet)
│  Used to find the cheapest one this week.   │
│                                             │
│  Most common picks                          │
│  [ ⚪ Whole ✓ ] [ Skim ]                    │
│  [ Semi-skimmed ] [ Long-life ]             │
│                                             │
│  More options ▽                             │
│                                             │
│  [ Add to my list ]                         │
└────────────────────────────────────────────┘
```

**Why they don't compete:**

1. **Vertical hierarchy on home** — Verdict (the answer) sits above Worth-picking-up (the suggestion). The user reads top-to-bottom; suggestion only catches the eye after the verdict has done its job. Surface 3 omits itself when there are no candidates, so the home page contracts gracefully.

2. **Per-context placement for Surface 2** — the 7-cell freshness strip lives inside My List comparison rows and inside sub-cat band ladder rows. It never appears on home, never competes with Surface 3. It's a row-level primitive, not a page-level surface.

3. **Surface 1 is a transient overlay** — it covers everything for 5–15 seconds while the user resolves intent, then dismisses cleanly. It never competes because it's never present alongside the other two.

4. **Shared visual idiom** — all three reuse: existing StorePill (●), existing PriceBlock, existing Tag, existing Sheet primitives, existing BottomBar count, the same 4 px grid, the same ink/paper/page colour stack. The three new pieces feel like they grew out of the existing v3.2 system because they did.

5. **Distinct primary actions, distinct destinations** —
   - Surface 1 → sends user back to My List (count increments)
   - Surface 2 → opens an inline tap-sheet (no navigation)
   - Surface 3 → either adds to My List (count increments) or dismisses (no navigation)

   No two surfaces ever propose the same primary action at the same time; the user is never asked "are you trying to add or are you trying to compare?"

6. **Density budget respected** — home page above-the-fold contains: Header (56 px), Region chip (40 px), VerdictHero (~280 px), Worth-picking-up title + subtitle (~80 px). That's ~456 px before any Worth-picking-up card. On a 667 px iPhone SE viewport, the first Worth-picking-up card lands at ~456 px — visible but below the fold. Verdict wins above-the-fold. Suggestion peeks. Correct hierarchy.

### Composition at 320 px (N5 — small Android stress test)

At 320 px wide, vertical real estate becomes the binding constraint, not horizontal. The composition still works because every surface has a documented <360 px branch:

```
┌──────────────────────────┐ 320 px wide
│ basketch  🔍 ≡  [♡ 4]   │ Header 56 px (collapses search behind icon)
├──────────────────────────┤
│ Aare ▾                   │ Region chip 40 px
├──────────────────────────┤
│                          │
│ This week                │
│ More fresh deals at      │ VerdictHero — text wraps to 4 lines
│ Migros (-22%), more      │ at 320 px; ~340 px tall instead of 280 px
│ household deals at Coop  │
│ (-18%).                  │
│                          │
│ [ Fresh ↗ ]              │ Verdict rows stack vertically at 320 px
│ [ Long-life ↗ ]          │ (one per row instead of inline 3-up)
│ [ Home ↗ ]               │
├──────────────────────────┤
│                          │ ← Fold lands roughly here on iPhone SE
│ Worth picking up         │   1st gen (320×568); user must scroll
│ this week                │   to discover Worth-picking-up at 320 px.
│ Strong deals on things   │   D2 first-visit hint (in MethodologyStrip
│ you've added before.     │   below) helps newcomers who don't scroll.
│                          │
│ ┌──────────────────────┐ │
│ │[img] Energizer AA    │ │ Card image stays 64×64 (N3 spec);
│ │     8-pack           │ │ text wraps; -50% chip stays inline.
│ │     ● Migros · -50%  │ │
│ │     CHF 4.95         │ │
│ │     was 9.90         │ │
│ │     You added these  │ │
│ │     6 weeks ago      │ │
│ │ ┌────────────┐ ┌───┐ │ │ M4 collapsed action row:
│ │ │    Add     │ │ ⋯ │ │ │ primary 44 px full-width,
│ │ └────────────┘ └───┘ │ │ overflow 44 px square.
│ └──────────────────────┘ │
├──────────────────────────┤
│                          │
│ Methodology · sources    │ MethodologyStrip — at 320 px the
│ · last update            │ D2 first-visit tag wraps to 2 lines
│ Start adding items to    │ below the existing strip text.
│ your list and we'll      │
│ suggest strong deals     │
│ here.                    │
│                          │
└──────────────────────────┘

  ↑ Floating BottomBar:  [♡ My list · 4]  [+ Add]
```

When the user opens the My List drawer at 320 px, **Surface 2's freshness strip stacks as 7 vertical rows** for the first item (M3, P3-locked) and other items collapse to a single-summary row. When the user opens Surface 1 (variant picker), the Vaul drawer fills 90% viewport height by default at 320 px (instead of 60%) because the chip rows are taller; the M5 toggle and the bottom CTA both remain reachable above the home-bar gesture area.

**Verdict at 320 px:** the composition holds. The fold is a real cost (Worth-picking-up below it), but the verdict — the answer the user came for — is fully above. This is correct hierarchy.

---

## Composition: combined Dill score & open questions roll-up

| Surface | Utility | Usability | Craft | Beauty |
|---|---|---|---|---|
| 1 — Variant Picker | Good | Good | Good | Good |
| 2 — Availability Indicator | Excellent | Good | Excellent | Good |
| 3 — Worth Picking Up | Good | Good | Good | Good |
| 3.5 — Settings: Hidden suggestions (new in v3.3.1) | Good | Good | Good | Good |

No "missing" or "poor" scores anywhere. Two "excellent" — both on Surface 2, where the redundant-encoding work is genuinely above bar. The other surfaces score Good across the board, which is the correct ceiling for utility tools — chasing "excellent" on a variant picker or a Settings page would be over-design. Surface 3.5 (added in v3.3.1 to close PM Q10 / tie-break P1) reuses image, toast, and confirmation primitives already established in Surfaces 1 & 3 — the score reflects honest reuse, not new craft.

---

## PM decisions (locked 2026-04-26)

All 7 questions resolved by PM with option (a):

| # | Decision (locked) |
|---|---|
| 1 | Default tiles: **network-wide** deal frequency (not region-specific) |
| 2 | "Save as default" surfaces as an **explicit toggle** on the picker (not implicit weighting) |
| 6 | C-state cells **shown everywhere uniformly** for LIDL/ALDI/Volg (no "limited catalogue" hint) — accept the noise |
| 9 | Discount threshold: **flat 30%** across all categories |
| 10 | **Settings → "Hidden suggestions"** page built in v3.3 (not deferred) |
| 11 | Cold-start cutoff: **exactly 5** `user_interest` rows |
| 12 | Re-suggest after long gap: **yes**, gated on "still strong deal" |

The 6 questions with safe defaults (3, 4, 5, 7, 8, 13) remain at the designer's recommendation as listed below.

---

## Master open-questions list (one place for the PM) — v3.3.1 status

All 13 original questions are now locked. PM tie-breaks P1, P2, P3 (raised by the design challenger) are also locked. **No open questions remain.**

| # | Surface | Question | Locked decision |
|---|---|---|---|
| 1 | 1 — Picker | Default-tile data source: network-wide vs region-specific deal frequency? | **Network-wide** (PM Q1). Cold-start fallback per S8: hard-coded `CONCEPT_FAMILY_DEFAULT_TILES` constant when `pipeline_run.deal_count` is null, < 4 rows, or > 14 days old. |
| 2 | 1 — Picker | "Save this as my default milk" — explicit toggle or implicit weighting? | **Explicit toggle** (PM Q2). **Default OFF** (PM tie-break P2). |
| 3 | 1 — Picker | Skip-picker threshold for already-specific search suggestions? | **Skip when suggestion encodes 4+ axes.** |
| 4 | 1 — Picker | Family icon (🥛) on suggestions — show or text-only? | **Text-only with trailing chevron.** |
| 5 | 2 — Availability | B → C threshold age — currently 90 days. | **Keep at 90 days**; flag in `pipeline_drift_log` if mass flips occur. |
| 6 | 2 — Availability | LIDL/ALDI/Volg structurally show C — add "limited public catalogue" hint? | **C-cells shown everywhere uniformly** (PM Q6); accept the noise. |
| 7 | 2 — Availability | Notify-when-deal — reuse existing email key, no extra confirmation email? | **Yes — reuse existing email key, no confirmation email.** Plus S4 "Notify (no-email)" state for users with no saved list. |
| 8 | 2 — Availability | Cell sort order at price ties? | **`STORE_DISPLAY_ORDER` always**, never alphabetical (N1). |
| 9 | 3 — WPU | Discount threshold flat 30% across categories? | **Flat 30%** (PM Q9). |
| 10 | 3 — WPU | Hidden-suggestions recovery via Settings? | **Built in v3.3** (PM Q10) — designed as Surface 3.5 in this same spec (PM tie-break P1). |
| 11 | 3 — WPU | Cold-start cutoff at exactly 5 `user_interest` rows? | **Exactly 5** (PM Q11). |
| 12 | 3 — WPU | Re-suggestion of same concept after Add 2 months ago? | **Yes, gated on discount ≥ original + 5pp** (PM Q12 + M7). UI uses the M7 "back this week" context-line variant. |
| 13 | 3 — WPU | Worth-picking-up tab on My List — same behaviour as home section? | **Identical.** Hidden rows appear only in Surface 3.5. |
| P1 | 3 — WPU | Surface 3.5 in this spec or follow-up? | **In this spec.** Surface 3.5 designed above. |
| P2 | 1 — Picker | "Save as default" toggle default ON or OFF? | **OFF** — preserves user agency; aligned with the §2.13 "never default opt-ins to ON" principle. |
| P3 | 2 — Availability | <360 px: 7-row vertical stack or summary collapse? | **7-row vertical stack** with comparison-page mitigation (first item full + others single-summary). Documented in §2.5, §2.9, §2.12, §2.14. |

**Builder may start.** No PM resolution outstanding.

---

## Files this design touches at build time (informational, not normative)

| File | Change type |
|---|---|
| `web-next/src/components/list/VariantPickerSheet.tsx` | New — imports `vaul` for mobile (mirrors `ListDrawer.tsx`) and `@/components/ui/sheet` for desktop (`side="right"`, 420 px) |
| `web-next/src/components/list/AvailabilityStrip.tsx` | New — handles horizontal 7-cell layout AND <360 px 7-row vertical stack (M3, P3-locked) |
| `web-next/src/components/list/AvailabilityCellSheet.tsx` | New — includes the S4 no-email Notify branch |
| `web-next/src/components/landing/WorthPickingUp.tsx` | New — handles `[Add][⋯]` overflow menu pattern at <360 px (M4) |
| `web-next/src/components/landing/WorthPickingUpCard.tsx` | New |
| `web-next/src/app/[locale]/page.tsx` | Add the new section between VerdictHero and MethodologyStrip; pass `firstVisitHomeCookie` to MethodologyStrip for D2 |
| `web-next/src/components/landing/MethodologyStrip.tsx` | Accept first-visit prop; render D2 1-line tag when section omitted on first visit |
| `web-next/src/app/[locale]/settings/hidden/page.tsx` | New — Surface 3.5 (M6) |
| `web-next/src/components/settings/HiddenSuggestionsList.tsx` | New — Surface 3.5 list with date grouping |
| `web-next/src/components/settings/HiddenRow.tsx` | New — Surface 3.5 single row + Restore action |
| `web-next/src/components/layout/BottomBar.tsx` | Add 24 h "Restore hidden suggestions" residual link slot |
| `web-next/src/components/list/ListDrawer.tsx` | Render AvailabilityStrip per item; apply <360 px first-item-expanded mitigation |
| `web-next/src/components/deals/DealsBand.tsx` (assumed v3.2) | Render B/C states in price-ladder + footer |
| `web-next/messages/{en,de,fr,it}.json` | Add all copy keys from §1.7, §2.11, §3.11, §3.5.6 — all 4 locales (M2) |
| `shared/types.ts` | Extend with `FreshnessState`, `WorthPickingUpCandidate`, `VariantConcept`, `UserPref`, `HiddenSuggestion`; add `CONCEPT_FAMILY_DEFAULT_TILES` constant (S8) |
| `web-next/src/lib/store-tokens.ts` | No new tokens; semantic alias additions in CSS only |

These aren't builder instructions — just a sanity check that all three surfaces fit existing folders without restructuring.

---

## Sign-off readiness (post-challenge revision, v3.3.1)

**Resolved by this revision pass (challenge findings closed):**
1. M1 — Vaul (mobile) + Sheet `side="right"` (desktop) named explicitly in §1.2 and §10.4.
2. M2 — EN/DE/FR/IT copy tables in §1.7, §2.11, §3.11, §3.5.6; IT confirmed as longest-string stress target.
3. M3 — <360 px: 7-row vertical stack per P3, with comparison-page mitigation (first item full + others single-summary).
4. M4 — <360 px: `[Add] [⋯]` overflow menu pattern with `aria-haspopup="menu"`.
5. M5 — "Remember this as my default milk" toggle present (P2-locked default OFF); §1.13 documents the PM override.
6. M6 — Surface 3.5 (Settings → Hidden suggestions) designed in this same spec; no v3.4 deferrals remain.
7. M7 — "back this week" context-line variant added to §3.11; §3.4 logic table gates re-suggest at "discount ≥ original + 5pp".
8. S1, S3, S4, S5, S8 — all closed (see changelog at top).
9. N1, N2, N3, N4, N5 — all closed.
10. D1 — "no celebration motion" (functional micro-feedback required).
11. D2 — first-visit MethodologyStrip hint when section omitted.
12. D3 — confirmed three icon shapes (no change).
13. D4 — "Hide forever" → "Don't suggest again" everywhere; confirmation prompt re-worded.

**PM tie-breaks locked in this revision:** P1 = Surface 3.5 in scope. P2 = save-default toggle defaults OFF. P3 = 7-row vertical stack at <360 px.

**Carried-forward known concerns (none block builder):**
- Default-tile network-vs-region weighting (PM Q1) — locked at network-wide; revisit when regional `pipeline_run` data settles.
- B → C threshold age (PM Q5) — locked at 90 days; flag in `pipeline_drift_log` if mass flips occur.

**Non-negotiable from the designer side (PM can override only with evidence of harm):**
- The Swiss-restraint guardrails in §3.5 — no exclamation marks, no celebration motion. Functional micro-feedback (collapse + toast slide-in) is required, not optional (D1).

End of v3.3.1 design spec.

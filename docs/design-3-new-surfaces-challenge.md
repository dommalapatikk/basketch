# Design Challenge — 3 New UX Surfaces (v3.3)

**Date:** 2026-04-26
**Reviewer:** Design Review Engineer (design-challenger)
**Spec under review:** `/Users/kiran/ClaudeCode/basketch/docs/design-3-new-surfaces.md` (856 lines, 3 surfaces, 7 PM-locked decisions)
**Locked dependencies (not challenged):** PM decisions Q1, Q2, Q6, Q9, Q10, Q11, Q12; v3.2 IA; 9-table data model; zero-paid-services constraint.

---

## 1. Verdict — **Weakened**

The spec is craft-conscious, well-organised, and reuses the existing v3.2 token system honestly. The thinking on Surface 2's three-state encoding (icon shape + position + label + colour) is genuinely above bar — that piece would survive a VP Design review almost untouched. **However, the spec ships in its current form would harm the v3.2 IA in three concrete ways**: (a) Surface 1 doesn't actually use the existing mobile drawer primitive (designer claims "existing Sheet idiom" but `Sheet` is desktop-only — mobile uses `Vaul`, which the spec never names); (b) the 7-cell freshness strip will overflow at 320 px in ways the spec dismisses too quickly (332 px > 320 px is a hard break, and the proposed "stack to vertical" fallback turns the strip into a 7-row tower that competes with the verdict it sits next to); (c) i18n coverage is silently French/Italian-incomplete — the spec lists German labels only, but the codebase ships `en/de/fr/it`, and a Romandie user opening Surface 1 today will see English fallbacks at best. Those three are MUST-FIX; the rest is polish. Verdict: **Weakened** — the design's core ideas are sound, but the spec is not yet builder-ready.

---

## 2. MUST-FIX findings (block the builder from starting)

### M1 — Surface 1 names the wrong primitive (Sheet vs Vaul drawer)

- **Surface:** 1 (Variant Picker)
- **Severity:** High
- **Problem:** The spec claims "Bottom sheet (existing `Sheet` component idiom from `components/ui/sheet.tsx`)" (§1.2). That file is a Radix `Dialog`-based **desktop side-sheet** (`right-0 top-0 h-full w-[420px]`) — it does not slide up from the bottom on mobile. The actual mobile bottom-sheet primitive used by `ListDrawer.tsx` is `vaul` (`Vaul.Root direction="bottom"`, with rounded top, drag handle, max-height 90vh). The designer's wireframes (drag handle, 60→90 % viewport expand, slide-up motion) require Vaul, not Sheet. Builder will either (a) re-implement bottom-sheet behaviour on the wrong primitive and burn a day, or (b) silently swap to Vaul and lose the documented "existing idiom" trace.
- **Framework violated:** Nielsen #4 (Consistency) — same surface name pointing at two different primitives. Norman conceptual model — designer's mental model of the codebase doesn't match the codebase.
- **Fix:** Re-write §1.2 to say: "Mobile: Vaul bottom drawer (same primitive as `ListDrawer.tsx`, `direction='bottom'`, `max-h-[90vh]`, drag handle as in lines 95–100). Desktop: existing `Sheet` side panel from `components/ui/sheet.tsx`, `side='right'`, width 420 px." Add a note to §10.4 (files touched) that `VariantPickerSheet.tsx` will import from `vaul` for mobile and from `@/components/ui/sheet` for desktop, mirroring `ListDrawer.tsx`. Confirm the desktop variant looks correct as a side-sheet (the designer has only specified mobile).

---

### M2 — i18n: French and Italian copy missing entirely; existing `ListDrawer` only translates DE/EN

- **Surfaces:** 1, 2, 3 (all)
- **Severity:** High
- **Problem:** The accessibility checklists at §1.8, §2.12, §3.12 each list "German labels: ... fits within tile padding" — **no French, no Italian**. The codebase ships `messages/{en,de,fr,it}.json` (referenced at §10.4 line 851 of the spec itself). More damning: the existing `ListDrawer.tsx` imports only `CATEGORY_LABELS_DE` and `CATEGORY_LABELS_EN` (lines 10, 183), so an Italian-locale user **already** sees German fallbacks today. Adding 3 surfaces' worth of new copy with the same DE-only translation discipline will harden a v3.2 bug into v3.3. For a Swiss product, Romandie (FR) and Ticino (TI — a region the spec itself names at §1.5 stale-state copy and §2.16 region examples) cannot be the first thing cut.
- **Framework violated:** Rams #6 (Honest) — claiming "Swiss tone" while shipping German-only labels is dishonest about the product's market. WCAG 3.1.1 (Language of page) holds at the `<html>` level, but content language fidelity is a brand-trust requirement.
- **Fix:** Add a 4-row block to §1.7, §2.11, §3.11 — every copy key in DE, FR, IT (not just EN/DE). Include the longest-translation stress test ("Halbfett-Milch" vs "Lait demi-écrémé" vs "Latte parzialmente scremato" — Italian is ~30 % longer than German). Re-do the 200 % text-zoom test against the longest of the four locales, not the German label. Separately: PM should decide whether to file a v3.3 task to extend `CATEGORY_LABELS_*` to FR and IT — but that's a parallel cleanup, not part of these 3 surfaces.

---

### M3 — Surface 2's 7-cell strip overflow at 320 px is dismissed too quickly

- **Surface:** 2 (Cross-store Availability)
- **Severity:** High
- **Problem:** §2.14 acknowledges "7 × 44 px + 6 × 4 px = 332 px → overflows at 320 px" and resolves it with "Already addressed in §2.12 — strip wraps at <360 px." But §2.12 actually says two contradictory things: (a) "strip wraps to 4-up + 3-up rows" at 200 % text size, and (b) "At 320 px, strip becomes a vertical stack of 7 rows." Which is it — 4+3 wrap or 7-row stack? At 320 px (small Android, accessibility zoom on iPhone SE), a 7-row vertical stack inside a comparison-page row is a 7×52 = 364 px tall block **per item**. With 4 items in My List (the average), the comparison page becomes 1,456 px of freshness strips before any verdict copy — verdict and primary action vanish below 4 viewport-heights of grey cells. The spec's calm-by-density ethos (§3.5 "Maximum 3 cards above the fold") would never tolerate this on Surface 3, but it's silently accepted on Surface 2.
- **Framework violated:** Wroblewski mobile-first (320 px is the mandatory floor, not the exception). Spool experience-rot — Surface 2 makes the v3.2 My List page measurably harder to scan. Gestalt figure/ground — when 7 cells become 7 rows, the figure (the verdict) loses contrast against the ground (the strips).
- **Fix:** Pick one fallback and commit. Recommended pattern: at <360 px, **collapse the strip to a single summary row** that reads `M ● · C ● · A ○ · D ○ · 3 not yet seen` — preserves the A/B/C language, fits in one line, tappable to expand the full strip in an inline pop-over. This keeps the comparison page scannable. Update §2.5, §2.9 (the Single-item state needs the same summary format), §2.12, §2.14 with the chosen pattern. Run the 200 % text-zoom test against this collapsed format too.

---

### M4 — Three-action row at 360 px crowding is under-tested; "Hide forever" stacking changes hierarchy silently

- **Surface:** 3 (Worth Picking Up)
- **Severity:** High
- **Problem:** §3.14 line 661 says "buttons stack vertically below 360 px" — fine. But what does that stack look like? Three full-width 44 px buttons stacked vertically = 132 px + gaps = ~150 px of action area per card, which makes "Hide forever" (the destructive action) the **last** thing in the user's reading order, **directly above the next card's product image**. Fitts's Law warning: the user's thumb lifts from "Hide forever" and lands on the next card's "Add" — mis-tap rate will be measurable. Worse, the destructive action is in the same visual position as the primary action two cards up (Add). Spec offers no inline confirmation pattern at 360 px other than reusing the in-card "Are you sure?" replacement (§3.9 step 7) — which at 360 px becomes a vertical stack of 2 buttons, but the moment of truth is when the user's thumb is already moving toward the next "Add."
- **Framework violated:** Fitts's Law (destructive primary in thumb landing zone). Norman constraints (the design fails to physically prevent the wrong tap). Nielsen #5 (Error prevention).
- **Fix:** At <360 px, change the action row from `[Add][Not now][Hide forever]` to `[Add] [⋯]` where the overflow menu holds Not now and Hide forever. Primary stays full-width and one tap; destructive is gated behind a deliberate second tap. Update §3.3 wireframe (cite the <360 px variant explicitly), §3.9 (interaction flow needs a 360 px branch), §3.12 (accessibility — overflow menu needs `aria-haspopup="menu"`), §3.14 (friction log row "Three buttons feel cramped" — current "fix" is insufficient).

---

### M5 — PM Q2 is implemented as bloat; current spec contradicts what was locked

- **Surface:** 1 (Variant Picker)
- **Severity:** High
- **Problem:** PM locked Q2 as: "Save as default surfaces as an explicit toggle on the picker." The current spec at §1.13 line 180 still says "A 'save these preferences as default' toggle — premature. Users haven't told us they re-pick milk every week with the same criteria." This directly contradicts the PM decision. The wireframe (§1.3), the copy table (§1.7), and the accessibility checklist (§1.8) make no mention of the toggle. Builder reading top-to-bottom will not implement it. PM reading the design will assume their decision was honoured.
- **Framework violated:** Nielsen #4 (Consistency) — the design contradicts itself between sections. Rams #6 (Honest) — design must reflect the decisions on which it depends.
- **Fix:** Add the explicit toggle to §1.3 wireframe (suggested position: between "More options" disclosure and the bottom CTA, as a single 44 px row with the label "Remember this as my default milk" and a native checkbox). Add the copy key to §1.7 (DE/FR/IT included per M2). Add to §1.8 accessibility ("toggle is native checkbox, focus-visible 2 px ring, announces state change"). Re-do §1.13 subtraction test — the toggle is no longer "removed"; document why PM overrode and what it costs in vertical space (a 44 px row does push the bottom CTA below the keyboard fold on iPhone SE — verify on device or with measured wireframe).

---

### M6 — PM Q10 ("Settings → Hidden suggestions" page in v3.3) is referenced as deferred throughout

- **Surface:** 3 (Worth Picking Up)
- **Severity:** High
- **Problem:** PM locked Q10: built in v3.3, not deferred. The spec contradicts in three places:
  - §3.9 step 9: "After 5 s, undoing requires going to Settings → 'Hidden suggestions' (deferred to v3.4 — open question)"
  - §3.14 friction log: "After that, recovery requires Settings (deferred)"
  - §3.16 Open question 2: "Hidden-suggestions recovery — settings page to un-hide concepts is deferred. Acceptable for v3.3?"
  Builder reading this will not build the page, then PM will be surprised at quality gate. The Settings page also needs its own design — not specified anywhere in this doc.
- **Framework violated:** Same as M5 — design must reflect PM-locked decisions.
- **Fix:** Add a fourth section "Surface 3.5 — Settings: Hidden suggestions" with: route (`/[locale]/settings/hidden`), wireframe (list of hidden concepts grouped by date with "Restore" affordance per row, plus "Restore all" footer), all 7 states (the spec's own state-coverage discipline applies), copy (DE/FR/IT), accessibility checklist. Without this, "Hide forever" is not actually reversible in v3.3 — and PM signed off on reversible.

---

### M7 — PM Q12 ("re-suggest after long gap") has no UI surface for the user to understand it

- **Surface:** 3 (Worth Picking Up)
- **Severity:** High
- **Problem:** PM locked: "Re-suggest after long gap, gated on still-strong deal." The spec describes the behaviour at §3.16 Q4 but never communicates it to the user. Friction-log scenario: a user added Energizer batteries 8 weeks ago, system suggests them again this week. The card's context line will read "You added these 8 weeks ago" — exactly the same as the first-time-ever shown card. The user's mental model: "Why is basketch suggesting something I already bought?" — read as a bug, not a feature. Trust dings.
- **Framework violated:** Norman conceptual model. Nielsen #1 (Visibility of system status). Rams #4 (Understandable).
- **Fix:** Add a fourth context-line variant to §3.11 copy: "You added these [N] weeks ago — strong deal back this week." The "strong deal back this week" tail is the honest signal of the re-suggest behaviour. Update §3.4 logic table to make clear: when `user_interest.added_at` is older than the typical re-suggest window, switch to this copy. Cap re-suggestion at "discount ≥ original add-time discount + 5 pp" so it's only ever shown if it's a genuinely better deal than what triggered the original add — otherwise the user is right to read it as noise.

---

## 3. SHOULD-FIX findings (don't block, must be fixed before ship)

### S1 — Surface 2 first-time tooltip is the wrong place to put the icon legend

- **Surface:** 2
- **Severity:** Medium
- **Problem:** §2.14 proposes a one-time dismissible tooltip on the strip header to teach `● ○ ▢`. Tooltips on first visit are exactly the pattern Norman's affordance principle says we should avoid — the user who needs the legend the most (the one returning after 6 weeks who's forgotten) gets nothing. Returning users will hit the 5th-week B-state strip and have no recall of what `○` means. Recognition over recall (Nielsen #6) demands persistent help.
- **Framework violated:** Norman discoverability + Nielsen #6 + Nielsen #10 (help available).
- **Fix:** Replace the dismissible tooltip with a persistent 16 × 16 `?` button inline with the strip header label ("Where each store stands [?]"). Tap opens a 1-screen popover with the three states (icon + label + 1-line description). No dismiss; available every visit. Tiny visual cost, large recall payoff.

### S2 — "Hide forever" copy is honest but disproportionate to the action

- **Surface:** 3
- **Severity:** Medium
- **Problem:** §3.4 maps "Hide forever" to setting `user_interest.dismissed_at = now()`. But "forever" is hyperbolic when M6 (PM Q10) makes it reversible from Settings, and §3.16 Q2 entertains a "30-day auto-expire" safety net. "Forever" is also the most American word in the spec — the friction log already flags the mis-tap risk. The designer's own §10.5 "What I'll concede" says: "willing to soften to 'Don't suggest again' if confirmation friction tests poorly."
- **Framework violated:** Rams #6 (Honest — "forever" overstates reversibility). Swiss-tone guardrail (per memory `feedback_swiss_tone_letters.md` — understated copy).
- **Fix:** Adopt the conceded fallback now: rename to "Don't suggest again." Confirmation prompt at §3.11: "Stop suggesting [item]?" → primary "Stop suggesting" / secondary "Cancel". Reduces mis-tap regret because the action sounds reversible (which it now is, per M6).

### S3 — "Show 2 more / Show all 12" disclosure language inconsistency

- **Surface:** 3
- **Severity:** Medium
- **Problem:** §3.6 lists three disclosure variants with shifting wording: "Show [N] more" (4–5 candidates), "Show all 7" (6–10), "Show all 12" (10+). Three patterns for what is conceptually one decision (expand the section). Users learn the rule once and apply it forever; the spec teaches three rules.
- **Framework violated:** Nielsen #4 (Consistency). Zhuo Q6 (subtraction).
- **Fix:** One pattern: "Show all [N]" always. "Show 2 more" reads as a different control than "Show all 7"; "Show all" is calm and honest in every case. Update §3.6, §3.11.

### S4 — Surface 2 cell tap-sheet "Notify me" requires email — but flow is invisible

- **Surface:** 2
- **Severity:** Medium
- **Problem:** §2.10 step 6 fires "Notify me" → writes `user_interest{store_pref, signal:'wanted_deal'}`. Per v3.2 §7, the user's email is the lookup key, set at save-time. But Surface 2 can be hit by a first-time visitor who's never saved a list. There's no "we need your email to notify you" branch documented. §2.16 Q3 hand-waves "reuse existing email key" — that doesn't help when no email exists yet.
- **Framework violated:** Nielsen #5 (Error prevention) — design lets the user tap a button that quietly does nothing for first-timers.
- **Fix:** Add a state to §2.9: "Notify (no-email)". When tapped on a session with no list-saved email, the sheet replaces the [Notify me] button with an inline 1-line email input + [Notify me with this email] CTA. Toast: "Saved [email] — we'll flag this if [Store] drops it." Re-uses v3.2's lookup-key behaviour, no extra round-trip.

### S5 — Stale-data thresholds and copy differ across the three surfaces

- **Surfaces:** 1, 2, 3
- **Severity:** Medium
- **Problem:** Three surfaces, three different stale messages, all tied to ">7 days":
  - S1 (§1.5): "Options last updated [N] days ago."
  - S2 (§2.9): "Store availability last updated [N] days ago."
  - S3 (§3.7): "Suggestions based on deals from [N] days ago."
  Three slightly different sentence shapes for the same user concept. Cross-surface consistency was a stated principle (§composition).
- **Framework violated:** Nielsen #4 (Consistency). Rams #4 (Understandable).
- **Fix:** Unify on one pattern: "Updated [N] days ago" — same words, different surface contexts make the meaning specific (in the picker, it's variant options; in the strip, it's store data; in the section, it's deals). The user learns the phrase once. Update §1.7, §2.11, §3.11.

### S6 — Surface 3 "Worth a look" cold-start variant changes the title — fragile decision

- **Surface:** 3
- **Severity:** Medium
- **Problem:** §3.8 introduces a second section title ("Worth a look this week") for cold-start. The reasoning (honesty about non-personalisation) is sound but creates a discoverability cost: a returning user who first saw "Worth a look" and now sees "Worth picking up" has to re-learn what this section is. Two titles for the same section, switched by an internal threshold the user doesn't know about.
- **Framework violated:** Spool experience-rot (the personal-mode user has lost the section they recognised). Nielsen #4 (Consistency).
- **Fix:** Keep "Worth picking up this week" always. Move the personalisation honesty into the **subtitle**: cold-start = "Strong deals across the basics this week." Personal = "Strong deals on things you've added before." Title stable, subtitle does the work. The designer's §10.5 conceded list already hints they can let this go.

### S7 — Surface 3 omits empty state with no signal to first-time visitor

- **Surface:** 3
- **Severity:** Medium
- **Problem:** §3.7 + §3.2 say "Empty state: Section omitted from page (no message — silent)." For a returning user who once saw cards and now sees nothing, this is correct — calm by absence. For a first-time visitor with 0 user_interest rows but who is **above** the cold-start threshold (5 rows: see PM Q11), the section just isn't there — no "we'll start suggesting once you add a few items" guidance. The user never learns the feature exists.
- **Framework violated:** Norman discoverability. Nielsen #1 (Visibility of system status).
- **Fix:** First-visit-ever (per session/cookie) only: when section is omitted, show a single 1-line tag inside the MethodologyStrip below: "Start adding items to your list and we'll suggest strong deals here." After first visit, never shown again. No new component — reuses existing MethodologyStrip.

### S8 — Surface 1 default-tile data source needs a fallback for empty `pipeline_run` data

- **Surface:** 1
- **Severity:** Medium
- **Problem:** §1.4 says default tiles come from "top 4 (concept_id, count) tuples for the family in `pipeline_run.deal_count`, refreshed weekly." Per PM Q1, network-wide. But the spec doesn't specify the cold-start state for the data source itself: in week 1 of v3.3, `pipeline_run.deal_count` may have ≤ 1 run of data; the top-4 ranking is statistically meaningless. Builder will need a hard-coded fallback per `concept_family` (the v3.2 BROWSE_CATEGORIES constant has equivalents for categories — but not at the variant level).
- **Framework violated:** Dill (state coverage — designer missed the data-cold-start state). Rams #6 (Honest — defaulting to noise is dishonest).
- **Fix:** Add a hard-coded fallback table to the design spec (or to `shared/types.ts` as a `CONCEPT_FAMILY_DEFAULT_TILES` constant) for the top 5 most likely families (milk, bread, eggs, butter, water) — these cover the v3.2 starter pack. Use the fallback when `pipeline_run.deal_count` is null, < 4 rows, or older than 14 days. Document in §1.5 as a new state row: "Cold-start data" trigger, fallback display.

---

## 4. NICE-TO-HAVE findings

### N1 — Surface 2 cell-sort tie-break needs a per-locale alphabetical rule

§2.14 says alphabetical tie-break. But "Aldi" sorts before "Migros" in English, "Aldi" before "Migros" in German, but the user's expected ordering of stores is `STORE_DISPLAY_ORDER` (per §2.16 Q4 — which PM should confirm). Current spec leaves it ambiguous. Pick one and document. Recommendation: always `STORE_DISPLAY_ORDER` — alphabetical never matches the user's mental model.

### N2 — Surface 1's "Long-life" tile may confuse non-native English speakers

§1.7 Tile 4: "**Long-life** · 3.5 % · 1 L". The translation hint "Long-life → shelf_life=UHT" is in the wireframe, but Swiss German users say "H-Milch" / "haltbar"; French users "lait UHT" / "longue conservation"; Italian "UHT" / "lunga conservazione". "Long-life" is an Anglo-supermarket term. Fold the FR/IT translations into the i18n table (M2) and verify via a Swiss native check; possibly use "UHT" everywhere as the more universally understood label.

### N3 — Surface 3 image dimensions need an explicit decision

§3.3 wireframe shows `[img] 64 × 64` for cards. Existing `DealCard.tsx` uses larger product imagery for hero cards. Builder will need to know whether to source new image sizes or letterbox the existing 200 × 200. Recommendation: 64 × 64 is correct (smaller-than-primary signal that this is a sub-section), but explicitly state in spec: "Image rendered with `next/image`, 64×64 cropped, `object-contain`, page-bg fallback. No lazy-load above the fold (top 3 cards)."

### N4 — Surface 1's "Cancel" text button at the bottom violates Fitts on iPhone SE

§1.3 wireframe shows "Cancel" as a 44 px text button below the 56 px primary CTA. On iPhone SE (375 × 667) with the keyboard never invoked, this lands ~50 px above the home-bar gesture area. Tap-success rate is fine; tap-confidence (does the user trust they hit it?) is lower because it's a borderless text button competing visually with the primary CTA above. Recommendation: replace with the standard drag-down-to-dismiss gesture (Vaul handles this natively) and remove the text button entirely. Cleaner, fewer pixels, one-handed easier.

### N5 — Composition diagram (§composition) shows three surfaces stacked but never tested at 320 px

The home-page mock at lines 685–763 is in 375 px-equivalent characters. At 320 px the verdict + Worth-picking-up section + first card is ~520 px before any disclosure — first-time visitor on a small Android scrolls past the verdict before they have time to read it. Suggest: add a 320 px composition view with the three surfaces' interaction.

---

## 5. Per-surface sub-verdicts

| Surface | Verdict | Rationale |
|---|---|---|
| **1 — Variant Picker** | **Weakened** | Strong subtraction discipline (§1.13), but the wrong primitive name (M1), missing PM-locked toggle (M5), no FR/IT (M2), and missing data-cold-start state (S8) all need fixing before build. |
| **2 — Cross-store Availability** | **Weakened** | The 3-icon + redundant-encoding system is the strongest piece of the whole spec. But the 320 px overflow (M3) is a real break, the first-time tooltip is the wrong solution (S1), and the no-email Notify branch (S4) is a missing state. |
| **3 — Worth Picking Up** | **Weakened** | Calm-presentation guardrails (§3.5) are excellent. But two PM-locked decisions are silently violated (M5 toggle reasoning re-applied, M6 Settings page deferred, M7 re-suggest copy invisible), the 360 px three-button stack is a Fitts trap (M4), and "Hide forever" copy is overstated (S2). |

---

## 6. Red-team disagreements with the designer

### D1 — On "no celebration animations" (§3.5)

**Designer position:** No haptic, no toast slide-in beyond 250 ms, no sound — Swiss restraint. Conceded only if "Swiss users actually prefer warmth" (§10.5).

**Reviewer counter-position:** Confirmed — keep the guardrail. But the spec is internally inconsistent: §3.9 step 3 calls for a 200 ms collapse + slide-up animation, and §3.10 step 4 fires a toast with Undo. That **is** feedback, just calm feedback — not the absence of motion. The §3.5 rule should be re-worded as "no celebration motion" not "no celebration animations" to avoid the builder reading "no animations" and stripping out the functional micro-feedback that confirms the action worked. Norman: every action requires feedback; calm is not silent.

**What's at stake:** Builder might over-correct and remove the collapse animation, leaving the user's tapped card frozen on screen for 200 ms while the My List badge updates — feels broken.

### D2 — On "section omitted when N=0" (§3.2)

**Designer position:** Calm by absence. Home page contracts gracefully.

**Reviewer counter-position:** Disagree at scale. For a returning user who once had cards and now has none, calm-by-absence is correct (Rams). For a first-time-ever visitor who's above the cold-start threshold but has no candidates this week, the section being missing is a discoverability hole — the user never learns the feature exists. See S7. The fix is small (one 1-line message in MethodologyStrip on first visit) but the principle matters: "calm by absence" only works for users who already know what's absent.

**What's at stake:** Half of basketch's product value (the "Worth picking up" surface) is invisible to a new user with sparse interest until weeks later. PRD §11 success metric "Add-to-list conversions where added item is from LIDL/ALDI/SPAR/Volg +150%" depends on this section being discovered, not stumbled upon.

### D3 — On three-icon shapes vs. two (designer's §10.5 expected challenge)

**Designer position:** Three icons (●/○/▢) for three states. Defensible.

**Reviewer position:** **Confirmed** — keep three. Two icons + colour would force colour-encoding for the third state, which violates WCAG 1.4.1 and the redundant-encoding discipline that makes Surface 2 the strongest piece in the spec. Don't soften this in response to the designer's anticipated challenge — it's correctly tuned.

### D4 — On "Hide forever" wording (§3.4)

**Designer position:** "Hide forever" because users have three distinct intents and "forever" makes the destructiveness explicit. Conceded if confirmation friction tests poorly (§10.5).

**Reviewer counter-position:** Override the designer now without waiting for a friction test. PM Q10 makes "forever" no longer literal (Settings page restores the action), so the copy is dishonest. Per Rams #6, dishonesty is the failure mode here. Use "Don't suggest again" — same intent, no false claim. See S2.

**What's at stake:** A non-trivial fraction of mis-taps will be remembered as "basketch hides things permanently and I can't get them back." Even with the Settings page as escape hatch, the brand impression is set at the moment of the wrong tap.

---

## 7. PM escalations (deadlocks needing tie-break)

### P1 — Should the Settings → Hidden suggestions page be designed in this same spec, or as a follow-up sub-spec?

- **Designer position (implied):** Out of scope — this spec covers the 3 home/list surfaces; Settings is a different page.
- **Reviewer position:** In scope — PM Q10 makes Settings the recovery path for Surface 3's destructive action; without it, "Hide forever" is irreversible in v3.3 (which contradicts PM intent). Either Settings ships in v3.3 (per PM lock) and is designed here, or the spec should pause and the designer should produce a Surface 3.5 sub-spec before builder starts.
- **What's at stake:** Builder either (a) builds half a feature, (b) inherits an undefined page, or (c) waits a week for the sub-spec. PM should pick (b) becomes (a) or commit to delaying builder for the sub-spec. The cleanest is "design Surface 3.5 now."

### P2 — Should Surface 1's "Save as default" toggle be on by default or off by default?

- **Designer position:** Not stated (the toggle is missing from the spec entirely — see M5).
- **Reviewer position:** Default OFF — Swiss tone, GDPR-aligned, never default opt-ins to ON (§2.13 already invokes this principle for Notify). But this is a real PM call: opt-in (off-by-default) preserves user agency; opt-in-by-default makes the toggle live up to PM Q2's "explicit" framing while still aiding the median user.
- **What's at stake:** First-pick experience for milk: if ON by default, user picks Whole 1L once and the picker never opens again for milk; second pick is silent. If OFF by default, user re-picks every time until they actively turn it on — discoverability of the toggle matters. PM should choose — both have honest design rationales.

### P3 — Should Surface 2 collapse to a summary row at 320 px (per M3 fix), or stack to 7 rows as currently spec'd?

- **Designer position:** 7-row stack at 320 px (§2.12).
- **Reviewer position:** Summary row "M ● · C ● · A ○ · D ○ · 3 not yet seen" tappable to expand. Preserves comparison-page scannability.
- **What's at stake:** The 7-row stack is more honest (every store visible) but breaks the comparison page on small Androids. The summary row is more compact but adds a layer of disclosure. Both are defensible; PM should pick based on whether 320 px-class users are a meaningful slice of basketch's audience.

---

## 8. Sign-off — what MUST be resolved before builder starts

Builder cannot start until:

1. **M1 fixed** — §1.2 names Vaul + Sheet correctly, §10.4 file list updated.
2. **M2 fixed** — §1.7, §2.11, §3.11 contain DE/FR/IT (not just EN) for every copy key. 200 % zoom test re-run against longest translation.
3. **M3 resolved** (PM tie-break P3) — pick summary-row or 7-row-stack; spec section §2.12 + §2.14 + §2.5 updated to match.
4. **M4 fixed** — §3.3 wireframe + §3.9 + §3.12 cover the <360 px overflow-menu pattern.
5. **M5 fixed** — Q2 toggle added to §1.3 wireframe, §1.7 copy, §1.8 accessibility; §1.13 subtraction test updated.
6. **M6 resolved** (PM tie-break P1) — either Surface 3.5 sub-spec for Settings page is added to this doc, or PM agrees to delay builder for sub-spec.
7. **M7 fixed** — §3.11 copy table includes the "back this week" context-line variant; §3.4 logic table updated.

SHOULD-FIX (S1–S8): designer to address before designer's own re-submit, but any one not fixed should be flagged as a known issue carried into VP Design review — not a builder-blocker.

NICE-TO-HAVE (N1–N5): track and address opportunistically; do not block builder.

Disagreements (D1–D4): D1, D3 — agreement reached on the page; designer to update copy of §3.5. D2, D4 — designer to accept the override or escalate to PM.

PM escalations (P1–P3): PM to decide before builder starts.

**Recommendation:** Fix-and-re-review. Do not proceed to build until M1–M7 are resolved and P1–P3 are PM-decided. Estimated designer turnaround: 2–4 hours of design work (not a major restructure — most fixes are spec-level corrections to a fundamentally sound design).

End of challenge report.

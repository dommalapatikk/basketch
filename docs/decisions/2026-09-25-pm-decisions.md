# PM decisions — 2026-09-25

Answers to the open questions in `docs/rca/2026-09-25-tech-lead-cross-review-and-plan.md` §8
and `docs/design/2026-09-25-data-source-copy-rework.md` §5. Recorded by the coordinator
from the PM's own words.

| Id | Question | PM decision |
|---|---|---|
| D-1 | ALDI: a third request (`spreads.json`) per publication | **Yes — fetch it.** Unblocks WP-6. |
| D-2 | Volg: daily image refresh, or accept empty cards | **No empty boxes.** Volg must show pictures; a daily refresh is approved. Unblocks WP-7c. |
| D-3 | SPAR: stay imageless, or ask permission | **SPAR must show pictures.** PM: "I cannot ask Spar for a permission. Just use their pictures… if you have PDF, just pass the PDF and truncate and show those pictures." Team to design the approach (signed-token page images vs. crops from the flyer PDF). Unblocks WP-8. |
| D-4 | Image-coverage alert severity | **Warn, still publish.** Fresh deals go live; the alert names the store that lost pictures. |
| D-5 | Lidl Plus label into the main upsert | Not objected to — **handled as a technical decision** by the Tech Lead. |
| D-6 | Retailer photos via `next/image` (re-encoded/cached on Vercel), incl. Coop photos from a third-party host | **PM accepts: "I don't think legally there is an issue."** Keep `next/image`. WP-9 closed as no-change. The PM's decision; the URG note in `product-image.tsx` should be updated to reflect it rather than contradict it. |
| P-7 | The "Cheapest" tag actually means biggest % discount | **Make it true: "Cheapest" must mean the lowest price.** Keep the label; change the logic. |
| P-8 | Build per-item cheapest-store routing, or keep the category comparison | **Keep today's category comparison.** Do not build routing now. |
| P-9 | `hello@basketch.app` | **Not used.** Replace with a **contact form** that emails the PM's Gmail (the PM told the coordinator which address; it is set only as a secret), address held in a secret setting, never in the page or repo. Must stay on free tiers. |
| P-10 | Order within each section: cheapest-per-kg first (A) or biggest discount first (B) | **B — biggest discount stays first.** PM: "the simplest one is bigger discount… the more the discount, then that's the better one." The "Cheapest" tag (lowest price per kg / l / piece among comparable offers, P-7) is shown on whichever card earns it, wherever it sits. |
| P-11 | Global 404 page: full Header/Footer, or a minimal page (Architect cross-review D4) | **Simple page.** basketch brand bar, "Page not found", and two localized buttons ("See this week's deals", "Home"), in DE or EN to match the link. |

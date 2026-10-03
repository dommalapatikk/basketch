# ⏸ LATEST: 2026-10-02 (evening, saved 2026-10-03) — DB defaults fail closed + MAINTAIN revoked (prod) · PR #6 · prompt audit PR #7 (restart inside basketch/)

**Session date range:** 2026-10-02 → 2026-10-03. main = abdd58c. Agents now register under short names (`builder`, `code-reviewer`, `tech-lead`, …).

**Production DB (applied 2026-10-02, PM-approved, verified):** new tables/sequences in public give anon/authenticated no write privilege; MAINTAIN revoked from anon/authenticated on all 20 existing relations and from new-table defaults (PG 17.6). Defaults now: tables/sequences `anon=r, authenticated=r`. `supabase/checks/anon-privileges.sql` → 14/14 PASS (new rows A-9 defaults, A-10 MAINTAIN). Live deals page 200.

**PR #6 `chore/db-default-privileges`** (https://github.com/dommalapatikk/basketch/pull/6): migrations `20261002_least_privilege_default_tables.sql` + `20261002_least_privilege_revoke_maintain.sql`, checks A-9/A-10, static guards in `pipeline/architecture.test.ts` (CREATE TABLE ⇒ RLS in same file; views must declare public SELECT access; quoted role names caught; one-pass comment strip), README. Code review `docs/reviews/2026-10-02-review-db-default-privileges.md`: Approved after 2 re-reviews. All CI checks green. **Merged 2026-10-02 as 2e78172** (Kiran added allow rule `Bash(gh pr merge:*)` so Claude can merge; main protection still requires the 10 green checks).

**Prompt audit (PR #7, merged abdd58c):** `/claude-api prompt-audit` run on CLAUDE.md + 19 agents + skills. Report `docs/reviews/2026-10-02-prompt-audit.md`. Fixed: stale doc refs/paths in CLAUDE.md, April-era stack (React+Vite, web/, pipeline/coop/) in 5 agents, agent frontmatter `name:` = file slug (restart Claude Code from basketch/ to pick up). **Open for Kiran — F-10:** legal rule "one fetch per store per week" vs pipeline collecting all 7 retailers Mon/Tue/Thu → limit the pipeline or reword the rule. Also flagged: build-order status (F-11), deeper per-agent refresh (F-12), docs/coding-standards.md from April (F-13).

**Kiran's decisions this session:** run the default-privileges SQL on prod; added allow rule `Bash(supabase db query:*)` via /permissions (Claude can now query prod; still confirm writes first); revoke MAINTAIN (recommended option).

**Accepted residual NIT:** view scanner counts `REVOKE GRANT OPTION FOR SELECT … FROM anon` as a declaration; live A-6 is the backstop.

**NEXT SESSION — start here:**
1. ✅ PR #6 merged (2e78172), worktree `db-default-privs` removed.
2. ✅ Worktree cleanup done 2026-10-02 (31 removed with Kiran's OK). Kept: `agent-a93682…` (Migros full-title names, parked), `agent-a41ae…` + `tl-ocr-exp` (unmerged WP-10 OCR commit a5c4b57 + uncommitted edit). `tl-ocr-bench/` is a plain 1.2 GB folder of OCR benchmark scripts/crops (not a worktree) — Kiran to decide.
3. **Kiran decides F-10** (weekly-fetch legal rule vs 3×/week pipeline): limit the pipeline per day, or reword the rule.
4. Site bugs D-1..D-12 (private open items §2 in `/Users/kiran/ClaudeCode/basketch-private-notes/2026-10-02-open-items.md`), Kiran's 14 decisions (§3), LangSmith (§4).
5. Untracked `docs/reviews/2026-10-02-{architect-challenger,vp-product-*}.md` (4 files) still contain security detail — do not push as-is.

# ⏸ LATEST: 2026-10-02 (afternoon) — SonarQube Cloud + protected main + DB least-privilege baseline (restart inside basketch/)

**Merged to main today (all via PR, all CI green, each code-reviewed to zero open findings):**
| PR | What |
|---|---|
| #2 | DealsClient date-bomb test fix (clock pinned) — unblocked CI |
| #3 | SonarQube Cloud in CI (`SonarQube Cloud` job, lcov coverage for pipeline/shared/web-next, runbook `docs/runbooks/sonarqube-cloud.md`, review `docs/reviews/2026-10-02-review-sonarqube-ci.md`) |
| #4 | Sonar BUG/VULN fixes: ISO-date comparator, de-CH sort for origin chips, ShareVerdictButton (AbortError = cancel, always-mounted sr-only status), sheet.tsx aria-describedby, accessible scrims, randomUUID run id, ocr.py manifest/source path checks, `**/*.sql` excluded, new `Test (Python, ocr.py)` CI job. Review: `docs/reviews/2026-10-02-review-sonar-findings.md` |
| #5 | DB least-privilege baseline migration `supabase/migrations/20261002_least_privilege_baseline.sql`, read-only check `supabase/checks/anon-privileges.sql`, superseded headers on old migrations, README, static guard in `pipeline/architecture.test.ts`. Review: `docs/reviews/2026-10-02-review-db-privileges-baseline.md` |

**Kiran's decisions today:** SonarQube **Cloud, Free plan** (no card; public repo; ~21.5k LoC analysed); **gate = block merges via PRs**; e-mail data not needed; new tables should fail closed by default (approved, not yet applied).

**SonarCloud setup (done by Kiran):** org `dommalapatikk`, project `dommalapatikk_basketch`, Automatic Analysis OFF, New Code = 30 days, secret `SONAR_TOKEN` added 2026-10-02 — **token expiry: check the date Kiran chose (max 1 year); CI's Sonar job fails when it expires → regenerate (My account → Access Tokens) and update the GitHub secret.**
Main-branch baseline after first scan: coverage 84.4%, 21,512 LoC, ~327 code smells (not chased; gate judges new code only).

**Branch protection on main (since 2026-10-02):** PR required, strict (up to date), enforce_admins ON, no force-push/deletion, no review required. Required checks (10): Lint & Type Check (pipeline), Test (shared types + taxonomy), Test (TypeScript), Test (Python, ocr.py), web-next · Lint & Type Check, web-next · Vitest, web-next · Build, web-next · Playwright + axe, SonarQube Cloud, SonarCloud Code Analysis. **Direct pushes to main (incl. this file) now need a PR.**

**Security item (§1 of private open items): DONE in production + repo.** Detail is ONLY in `/Users/kiran/ClaudeCode/basketch-private-notes/` (repo is public — keep it out of tracked files).

**NEXT SESSION — start here:**
1. ✅ DONE (evening, see above). **Kiran:** run in Supabase SQL Editor (new tables/sequences fail closed — approved):
   `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;`
   `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE USAGE, UPDATE ON SEQUENCES FROM anon, authenticated;`
   Then coordinator runs `supabase/checks/anon-privileges.sql` read-only (`supabase db query --linked -f ...`) to confirm.
2. ✅ DONE as PR #6 (see above). Repo side of the same (small PR): migration file drafted, uncommitted, in worktree `.claude/worktrees/agent-a76f34591780b9626/supabase/migrations/20261002_least_privilege_default_tables.sql`; still to add check row A-9 + static rule "every CREATE TABLE has ENABLE ROW LEVEL SECURITY" + README line. Builder was blocked by Claude Code permissions on `supabase/` edits — Kiran to allow, or do in a fresh session.
3. Then: site bugs D-1..D-12 (private open items §2), Kiran's 14 decisions (§3), LangSmith (§4).

**Known concerns carried forward:** guard test misses quoted role names (`TO "anon"`, one-line fix); unused availability overlays need focus trap/return + 44px close + design sign-off before V3PreviewSection goes live; 5 skipped e2e tests (AC8 deliberate skip without owner/expiry; AC16 ×4 find no compact cards); web-next `biome check` red on main (CI step is `|| true`); ~20 test files with hard-coded 2026 dates may rot (highest risk: DealCard, ListDrawer, ItemNote, list-store, snapshot, supabase-provider, stale-sweep tests); pipeline vitest `^3.1.0` not exact-pinned; web-next coverage lacks `coverage.include`.
**Auto-mode classifier blocked:** production DB writes and repo edits under `supabase/` for agents — Kiran approved several prod steps explicitly; plan around it.
**Cleanup:** stale agent worktrees under `.claude/worktrees/` (agent-a7d480…, agent-aedfd1…, agent-a01b00…, agent-a76f34…) — merged branches; remove after item 2 is done. Untracked `docs/reviews/2026-10-02-*.md` (4 files) still must not be pushed as-is.

# ⏸ LATEST: 2026-10-02 — case-study docs + GitHub profile refreshed; bug fixes next (restart inside basketch/)

**Done and published (verified on GitHub):**
- basketch commit b153c60 on main: PRD v4.0, business model canvas v2.0, competitive analysis v2.0 (13 tools, sourced; section 6 "My positioning" dictated by Kiran), technical architecture v2.0, use cases v3.0, repo README. Each written by its owning agent (run as stand-ins — session started outside basketch/) and reviewed to zero MUST-FIX (VP Product / Architect Challenger, 2 rounds).
- Profile repo dommalapatikk commit 95abde3: profile README refreshed (current product, Next.js 16 stack, AI categorisation row, cost = free tiers + one paid AI judge capped USD 5/month, 2,100+ tests, 19 agents, 13 competitors, Background with dates).

**Kiran's decisions this session:** rewrite docs in place (old versions in git history); publish when reviews are clean; positioning = personal shopping list, UX is the core, SPAR + Volg coverage stressed, P-8 routing deferred (no reason recorded).

**Corrections found while documenting:** per-item routing is NOT built (P-8); "Cheapest" tag = biggest discount (P-7 not built); cost is not CHF 0 (OpenRouter judge, USD 5 cap); test counts measured 2026-10-02: pipeline 1,524 · shared 129 (incl. 3 expected-fail) · web 492 passed + 2 failing.

**NEXT SESSION — start here:** read `/Users/kiran/ClaudeCode/basketch-private-notes/2026-10-02-open-items.md` (kept outside the public repo). Order:
1. SECURITY item §1 (Tech Lead) — do first.
2. Site bugs §2 (D-1 0% discount in verdict, D-2 category card link, D-3 shared link drops "From N items", D-4/5 shared link overwrites/wipes list, "cheapest" list copy, 2 date-bomb tests blocking CI build + Playwright, cached empty result on DB error, no-op error logging, D-6..12).
3. Kiran's 14 decisions §3.
**LangSmith tracing — designed + installed (2026-09-11, dc9a0a4; design docs/component-2-agent-design.md §7b.5 + tech table), never switched on:** no LANGSMITH_* secret/variable in GitHub, nothing in pipeline.yml. LangGraph traces automatically once env is set. Steps: Kiran creates free LangSmith Developer account + API key → add secret LANGSMITH_API_KEY and env LANGSMITH_TRACING=true, LANGSMITH_PROJECT=basketch to the classify step in pipeline.yml → set a hard trace cap (design says ~240/mo vs 5,000 free) → verify traces appear after a run → then add LangSmith to the GitHub profile AI row (profile currently names LangGraph only, commit on 2026-10-02).
Also: root `.env.example` still has old Vite keys (README local setup incomplete); stale `github-profile-README.md` in repo (Kiran to decide delete/replace).

**Untracked on purpose (do not push as-is — contain security detail):** `docs/reviews/2026-10-02-*.md` (4 review files).

# ⏸ LATEST: 2026-09-28 — basketch handed over to SELF-RUNNING (PM moving to an insurance-tech project)

**Update 2026-10-02:** pipeline ran unattended 2026-09-28, 09-29 and 10-01 — all success; schedule `active`. The Monday 09-28 run started at 11:33 UTC (GitHub delay), so no manual run was needed. Still to do when resuming: check the WP-1c/1d/1e next-run checklist (`docs/qa/2026-09-26-qa-pipeline-wp1c-1d-1e.md` §4) against these runs.

**Live and verified on basketch.vercel.app (main e159e4b):**
- Stale expired deals fixed: deals cache keyed by the Zurich date, homepage deal data rendered per request, webhook `expire: 0`, MidnightGuard on home + /deals, expired list items excluded from totals/share. Live counts matched the DB (1,537 in effect) after deploy.
- 404 fix: `experimental.globalNotFound`, locale parsed at every entry point; `/en/nope` → 404 served as static `/404` (x-matched-path /404), `/foo.bar` → 404.
- Plural-correct wording (EN/DE) + "0 months ago" fix; data-source copy; "Worth a look" removed.
- Pipeline WP-1c/1d/1e (products by key set, image on main row, enrichment retired) — first run with it is Monday 2026-09-28; check with `docs/qa/2026-09-26-qa-pipeline-wp1c-1d-1e.md` §4 checklist.
- Pipeline keep-alive: job `workflow-keepalive` re-enables pipeline.yml every run (60-day inactivity rule).

**Self-running checklist (no one needs to watch it):** Mon/Tue/Thu 05:00 UTC cron (starts hours late); healthchecks.io dead-man ping; keep-alive job.
**Calendar check 2026-11-26:** `gh workflow list --all` → Deal Pipeline must be `active`. If `disabled_inactivity`: `gh workflow enable pipeline.yml`, then switch keep-alive to a PAT marker commit (see HANDOVER.md, docs/rca/2026-09-28-tech-lead-pipeline-keepalive.md).

**Parked (built/approved, NOT live) — resume here:**
- Migros full-title names (branch `worktree-agent-a93682c65ace6ef3d` @ bb0a6b1): approved by review; KW39 91/91 exact names, KW38 holdout fixed. BLOCKED on PM decision: labels (IP-SUISSE/AOP/Fairtrade) are stripped from names but no DB column stores them — (a) persist labels (recommended) / (b) keep in name / (c) accept loss. ~31 products re-key once on first run.
- Shared list as its own page (spec `docs/design/2026-09-27-shared-list-view-spec.md`, Design Challenger zero findings) — not built.
- Not started: ALDI/SPAR/Volg pictures, Volg daily refresh, "Cheapest" = lowest per-kg, contact form (needs PM Resend setup), WP-2..6, S-5 index migration, healthchecks false-alert tuning (review N3).

**Lessons learned for the next project:** `/Users/kiran/ClaudeCode/lessons-learned/basketch-lessons-learned.md` (curated) + `docs/lessons-learned-raw-2026-09-28.md` (88 cited lessons).

# ⏸ LATEST: 2026-09-26

**Live (verified on basketch.vercel.app):** data-source copy rework (e09f9ab/f117b36) — footer, homepage strip, About page now say "6 retailers direct, Coop via aktionis.ch"; CI + Vercel green. (Earlier: WP-11 "Worth a look" removal + catalogue retirement, eeb2a0e.)

**Ready, awaiting PM go-live:** pipeline WP-1c/1d/1e — branch worktree-agent-a515051bebfd72d2c @ 09dde74. Review approved (docs/reviews/2026-09-26-review-wp1c-1d-1e.md), QA PASS (docs/qa/2026-09-26-qa-pipeline-wp1c-1d-1e.md, includes next-run SQL checklist). Takes effect at the next Mon/Tue/Thu run.

**In progress — Migros WP-10:** branch worktree-agent-a93682c65ace6ef3d @ 62144d7. Pairing/prices approved (91 published / 91 correct KW39), QA PASS for pairing. Open: 31 of 91 names differ from the printed title (truncation/hyphen/badges). RCA + Architect cross-review + resolution: docs/rca/2026-09-26-tech-lead-migros-name-truncation.md, docs/rca/2026-09-26-architect-migros-name-cross-review.md. Next: Tech Lead writes expectedName into kw39-zh-truth.json (blocked on PM permission) → QA spot-checks truth → Builder (TDD) → holdout edition hand-check → review → QA → PM.

**404 bug:** plan agreed (docs/rca/2026-09-25-tech-lead-404-shows-500.md § Cross-review resolution + architect cross-review); /foo.bar is a real 500. PM chose the simple 404 page (P-11). Waiting on button wording.

**Coop direct source:** researched (docs/design/2026-09-26-architect-coop-direct-source.md) — recommend stay on aktionis.ch (Coop-owned channels ≤ ~20-24% coverage). Awaiting PM yes/no.

**Open PM questions:** (1) put WP-1c/1d/1e live? (2) allow truth-file edit + commit on the Migros branch? (3) Coop: stay on aktionis + flyer as documented fallback? (4) 404 buttons: "Browse deals / Back to home" vs "See this week's deals / Home"? (5) "Fairtrade" in names: drop or keep?

**Not started:** WP-2..6, 7a-c (Volg), 8a-c (SPAR/ALDI pictures), "Cheapest" = lowest per-kg, contact form (needs PM Resend setup), URG note update, S-5 index migration.

**Session note:** subagents stalled repeatedly (service-side); coordinator finished several steps directly and verified everything.

# basketch — session summary

## ⏸ LATEST: 2026-09-25 — PAUSED mid-cross-review (read this first)

**State:** no code changed, nothing committed or pushed. Five new report files are
untracked (listed below). Work paused by the PM to free tokens for another project.

**PM instruction (2026-09-25):** "fix all ... first root cause analysis by tech lead and
finding investigation by architect and tech lead and find solution and fix properly, no
quick and ugly fix, use DDD, TDD." Process: Tech Lead RCA + Architect investigation
(done) → cross-review (STOPPED before writing anything) → agreed plan → Builder
(test first) → Code Reviewer loop → coordinator verifies on live site → ask PM before push.

**How agents were run this session:** the session started outside the project, so
project agents were run as general-purpose subagents told to read
`.claude/agents/<name>.md` first, on that file's model. Starting Claude Code inside
`basketch/` registers them natively.


**Standing process (PM, 2026-09-25 — applies to every change):**
Tech Lead RCA + Architect investigation → cross-review → agreed plan (DDD) → Builder,
failing test first (TDD) → Code Reviewer loop to zero MUST-FIX, fixes proven by mutation →
**QA Tester** (shopper-style, local build against live data) → coordinator verifies →
PM approves before anything is pushed/goes live.

PM decisions 2026-09-25: `docs/decisions/2026-09-25-pm-decisions.md`.

### Findings (all verified by the coordinator against code/logs)
Pipeline: runs 09-21 / 09-22 / 09-24 all published (1,313 / 1,366 / 1,562 deals); all 7
retailers ok; site healthy (1,623 active deals). 1h19m/1h38m = two 60-min attempts
(`timeout_minutes: 60` is per attempt on nick-fields/retry, pipeline.yml:135) — by design.

| # | Problem | Status |
|---|---|---|
| 1 | ALDI: 211/211 deals no picture; **never worked** (0/517 rows ever). `findPageImageUrls` reads `data.json`, real page images are in `spreads.json`. Tests used Publitas-docs JSON, not a captured response | RCA done, both agree |
| 2 | Volg: all 17 image URLs 404 — Volg regenerates file hashes (~15h after capture). 7 no-URL deals are genuine | RCA done |
| 3 | SPAR: page images DO exist on iPaper but need a signed token (~23-24h) → 403 without | RCA done |
| 4 | Write tail growing 588→983s, over WRITE_TAIL_MS (9.5 min) every run; v3 cutover one DB call per deal (`v3-cutover.ts:260-289`) dominates. ~2,100 deals ⇒ unretried kill | RCA done |
| 5 | Coop: "Created 528 new coop products" then 720 in the same run, only 38-40 existing matched (run 35589218267) — likely duplicates | **RCA NOT done** |
| 6 | MAX_CHUNK_MS 19.5 min ~2x too high (max chunk 10.3 min), WRITE_TAIL_MS too low; config test passes only because errors cancel. Only used in `config.test.ts:218` + a warning | RCA done |
| 7 | Drift warnings invisible; warnings capped at 20 (`json-telemetry.ts:51`) hid ALDI's warning #35; no image-coverage alert exists | RCA done |
| 8 | `|` in product name breaks enrichment key; lossless `offerToRow` built but unwired; image written in two halves by two DB writes (4 loss modes) | Found |

Architect proposal: write image in the main upsert only (no schema change/backfill);
"no picture" carries a reason; ALDI from `spreads.json`; per-source absolute
image-coverage floor + alert. 5 ADRs, 14 failing tests. Tech Lead timing proposal:
derive MAX_CHUNK_MS from rate limits, WRITE_TAIL_MS ~18 min, batch the write tail.

### PM decisions pending (the team must not decide these)
1. ALDI: third fetch (`spreads.json`) per week OK under AP-1?
2. Volg: daily image refresh, or accept empty cards?
3. SPAR: stay imageless, or ask SPAR permission? (signed-token route needs a legal view)
4. Image-coverage alert severity: warning, or fail the run?
5. Move the Lidl Plus member-price label into the single upsert too?
6. Legal: Coop/Denner/LIDL/Volg photos go through `next/image` (re-hosted on Vercel),
   contradicting the URG "never reproduced on basketch infrastructure" rule.

Also still pending from before: verify `OPENROUTER_API_KEY`; AP-6 decision; T1.

### Next steps when resuming
1. Re-run the **cross-review** (stopped, produced nothing):
   - Tech Lead: review the Architect doc; **RCA the Coop duplicates (#5)**; unify #4/#5/#6/#7
     into one design; draft the work plan marking blocked-on-PM vs can-proceed →
     `docs/rca/2026-09-25-tech-lead-cross-review-and-plan.md`
   - Architect: review Tech Lead + SRE docs; challenge the zero-slack budget (28+12+18+2=60);
     design batched v3 write; rule against non-captured test fixtures →
     `docs/rca/2026-09-25-architect-cross-review.md`
2. Get PM answers to the six decisions.
3. Builder (TDD) → Code Reviewer loop → verify live → ask PM before push.

### Files
- `docs/qa/2026-09-25-missing-images.md`
- `docs/rca/2026-09-25-sre-post-monday-runs.md`
- `docs/rca/2026-09-25-tech-lead-max-chunk-ms.md`
- `docs/rca/2026-09-25-tech-lead-missing-images.md`
- `docs/rca/2026-09-25-architect-missing-images.md`

---

# Previous session (2026-09-15 → 2026-09-18)

**Dates:** 2026-09-15 → 2026-09-18
**State at close:** working tree clean, 0 unpushed commits, `main` = `056b0e0`.
**Site:** live and healthy — 1,997 active deals across all seven retailers, prices
rendering, valid through 2026-09-23.

---

## 1. What this session was

The PM's instruction on 2026-09-15 set the method for everything that followed:

> "fix all, 3 api key is valid move it in right place, 5 update it with limits and
> gardrails set. 6-9 fix it. before fixing do root cause anylsis and invluce
> arctect, tech lead and for fix engineer agents and always follow ddd and tdd"

So: RCA first (architect + tech lead, independently, then cross-reviewed), then
builders, then a code-review loop to zero open findings. Every gate re-measured by
the coordinator rather than taken from an agent's report.

Authoritative plan: `docs/rca/2026-09-15-final-plan.md` — decisions AP-1…AP-11,
TP-6…TP-10, Tech Lead rulings D1–D6, 20 work packages in three lanes.

---

## 2. Work packages — 19 of 20 merged and pushed

**Shipped earlier in the session:** #3 starter-pack removal, #4 key move, P1 stale
sweep, W2 validity + member prices, C1 Migros parser, P2 composition root, W3 views,
C2 rappen discounts, P3 deadline/exit codes, P4 retire legacy aktionis, P6 judge
concurrency, P6a cache uncertain, C3 Coop names, P5 ModelGate, C4
QuantityRequirement, W4 "from 2 items", P7 run journal, P8 spend guard, image fixes.

**Shipped 2026-09-17/18:**

| WP | What | Commit |
|---|---|---|
| **P9** | Enrichment completion — `attributes_version` | `c724a5a` |
| **J1** | Each retailer names its own publication (`editionFor`) | `2181731` |
| **W5** | The missing German sub-category labels | `056b0e0` |

**Not built:** J2 (fetch ledger), J3 (collect/transform split + daily cron),
T1 (taxonomy divergence — fully designed and cross-reviewed, ready to build).

---

## 3. Key decisions made by the PM

Recorded in full in `docs/decisions/2026-09-17-pm-taxonomy-decisions.md`.

- **PM-1 — general merchandise is grouped, not promoted.** Fixing the taxonomy gives
  a browse chip to ~28% of the catalogue (227 toys, 91 clothing, appliances, books,
  stationery). These go under one `general-merchandise` group rather than becoming
  top-level chips beside Dairy and Bakery — basketch is a grocery comparison, and
  equal weighting would change what the product appears to be. **Constraint: the
  grouping must be expressed in `BROWSE_CATEGORIES` itself, not as a frontend
  translation layer** — that would be a sixth copy of the vocabulary, which is the
  bug being fixed.
- **PM-2 — the German labels ship now, on their own.** Done, `056b0e0`.
- **PM-3 — the 11,206 historical rows are deferred, not decided.** The Tech Lead's
  `NOT VALID` ruling removed the need for the decision entirely.
- **Push the held commits** (2026-09-17): the PM confirmed the OpenRouter USD 5
  monthly cap was set, and authorised pushing the 41 held commits (P6/P7/P8/P9).
- **Open, flagged, not decided:** `coffee-tea` ceasing to be a category; category
  chips being invisible at the default `?type=all`; `body-care`/`personal-care` both
  rendering "Körperpflege".

---

## 4. Verified data points (all measured against production, not inferred)

| Fact | Value | When |
|---|---|---|
| Active deals | 1,169 (1,997 incl. all windows) | 2026-09-17 |
| Deals with NO `category_slug` | **561 / 1,169 = 48.0%** | 2026-09-17 |
| `taxonomy_alias` rows vs taxonomy | 28 vs ~90 sub-categories | 2026-09-17 |
| `taxonomy_category` rows vs code | 17 vs 22, only **7 names in common** | 2026-09-17 |
| Total deals table | 26,371, of which **11,206 (42.5%)** have no category | 2026-09-17 |
| Deals under an English heading on `/de` | **585 / 1,169 = 50%** | 2026-09-17 |
| `attributes_version` backfill | 437 of 2,414 stamped (18.1%), 0 wrongly | 2026-09-17 |
| Null-category rate by store | coop 57.4%, aldi 48.8%, lidl 35.1%, denner 21.3%, volg 13.6%, spar 13.0%, migros 7.7% | 2026-09-17 |

---

## 5. The bug that defined 2026-09-17: taxonomy divergence

**Two taxonomies exist and have diverged.** `BROWSE_CATEGORIES` in `shared/types.ts`
(22 categories, ~90 sub-categories) is what the classifier is told to use.
`taxonomy_category` + `taxonomy_alias` in the database (17 + 28 rows, seeded
2026-04-25, never touched since) is what actually gets written to `deals.category_slug`.
Only 7 names appear in both. `coffee-tea` is a *category* in the DB and a
*sub-category* in code — they disagree about hierarchy, not just names.

**The real root cause is older than it looked.** `classify-deals.ts:372` does
`category: topCategoryFor(fields.category)` — the classifier's browse category,
already validated, is collapsed to `fresh`/`long-life`/`non-food` and the browse id
is **discarded**. `run-pipeline.ts:839` then reconstructs it from the *child*
(`sub_category`) through the stale alias table. `dealToRow` (`shared/types.ts:961`)
**already writes `category_slug`** and needs no change. So the fix is to stop
discarding the answer, not to seed missing rows.

**Two blockers the cross-review caught, both verified against production:**
1. The planned `DELETE FROM taxonomy_category` would have hard-failed on an FK
   violation every time — 20 `taxonomy_subcategory` rows still point at the 7 doomed
   parents, and the same plan elsewhere decided to keep exactly those rows.
2. A cleanup estimated at "under 50 rows" is **11,206 of 26,371** (224× off). The
   migration would have halted at its own escalation gate, on migration night.

**A schema drift neither started with:** `deals_category_slug_fkey` is **live in
production but absent from a database rebuilt from this repo**. `baseline.sql:87`
declares the column with no FK and sorts first, so `20260425`'s
`ADD COLUMN IF NOT EXISTS … REFERENCES` is a total no-op — REFERENCES clause
included. Any design validated against the repo schema was validated against a
schema production does not have.

**Both sides conceded in writing.** The Tech Lead withdrew the NOT NULL objection and
the "no cheaper fix" argument; the Architect conceded the FK it had missed and
redesigned around it. `CHECK (…) NOT VALID` replaces `SET NOT NULL` — it enforces on
every INSERT/UPDATE without scanning or deleting a historical row, which **removed a
product decision instead of escalating one**.

Docs: `docs/rca/2026-09-17-architect-taxonomy-divergence.md` (1,138 lines),
`docs/rca/2026-09-17-tech-lead-taxonomy-divergence.md` (1,119 lines, CR-0…CR-12).

---

## 6. Pipeline run 35207519113 (2026-09-17) — failed, and why

Failed at the 60-minute wall, but **published 1,148 deals first**, so the site was
never affected.

| Phase | Duration |
|---|---|
| Collection, all 7 retailers | **49 seconds**, 2,060 offers — healthy |
| Classify chunk 1 | 1,295.8s (classify+judge 1,172.5s) |
| Classify chunk 2 | 1,142.0s |
| **Deadline fires before chunk 3/11** | P3 worked exactly as designed — 837 of 1,037 deferred |
| **Backfill — 17 minutes, unbounded** | ← the killer, in nobody's arithmetic |
| Deal upsert | 1,148 of 1,189 written |
| Killed at the wall | tail never finished |

The deadline fired correctly and then handed control to a phase that ignored it —
the same defect class as P3's write tail, one layer along. **Closed by WP-P9's
MUST-FIX 3**, now merged: the backfill breaks on the deadline and sets `deadlineHit`,
so `finishRun` returns exit 75 instead of exit 0.

**Still open:** `MAX_CHUNK_MS` is stale — chunk 1 took 21.6 min against a 19.5 min
constant, and the code warned about itself in the log. Cannot be honestly re-measured
until P6's judge concurrency has actually run. **Re-measure after the 2026-09-21 run.**

---

## 7. Three tests that could not fail

Found and killed during WP-W5, **each by mutation rather than by reading**, and every
one written while fixing the previous finding:

1. The unknown-locale test used `'toys'`, whose English label is byte-identical to
   `titleCase('toys')` — it passed whether the map lookup or the fallback ran. A
   mutant returning `{}` for unknown locales survived it.
2. Rewriting test 5 behaviourally gained an arbitrary-fallthrough case and **silently
   lost the whitespace case**: `'  '` is truthy, so output equals data. A
   whitespace-only label renders an *invisible chip*.
3. A dead first assertion in the `/en` test, same tautology as the first.

Also found in WP-J1: `iso-week.test.ts:119` is a control, not a discriminator — it
cannot fail against the UTC mutation it sits beside. Now labelled.

**The systems lesson, recorded:** a green suite is evidence that nothing is broken,
not that anything is guarded. Only breaking the code on purpose distinguishes them.
`shared/types.test.ts:36`'s count tripwire *fired* at `dc9a0a4` and was updated in
the same commit — which is why set assertions replaced count assertions.

---

## 8. Other findings worth keeping

- **The documented type-check command never worked.** `npx tsc --noEmit -p
  pipeline/tsconfig.json` from the repo root fetches an unrelated package that prints
  a joke and exits 0 — no root `node_modules`. Every "tsc clean" report using it
  verified nothing. Fixed in `CLAUDE.md` (`68393f9`); use the folder-local binary,
  and never pipe in a way that swallows the exit code.
- **Credential audit (2026-09-18).** `.env` was never committed; the Sept-10 backup
  files are gone; `.claude/worktrees` and `web-next/.env.local` are gitignored. The
  only key-shaped string in git history is a Google Maps key inside a captured Coop
  page fixture — not the PM's.
- **`GOOGLE_AI_API_KEY` in GitHub was dead.** The PM had rotated it at Google after
  it was pasted into a CLI session, but GitHub still held the Sept-10 value. Updated
  2026-09-18 09:03 from `.env`; local key verified HTTP 200. **Without this, Monday's
  run would have degraded silently, not crashed.**
- **`OPENAI_API_KEY` sits in `.env` and nothing reads it** — not the pipeline, not
  the frontend, not the workflows. A second paid-service credential outside the
  one-paid-service rule. The two `VITE_*` vars are dead (archived frontend).
- **`OPENROUTER_API_KEY` in GitHub is still dated 2026-09-10.** If it was ever
  rotated, it has the same silent-failure problem the Google key had. Unverified.

---

## 9. PM actions completed this session

- ✅ OpenRouter USD 5 **monthly** cap set (auto top-up off)
- ✅ `HEALTHCHECK_PING_URL` added to GitHub secrets (2026-09-18 08:40)
- ✅ Google AI key rotated at Google; GitHub secret updated 2026-09-18 09:03

## 10. Still pending

**For the PM:**
1. **Verify `OPENROUTER_API_KEY` matches** what's at openrouter.ai — GitHub's copy is
   from 2026-09-10 and unverified. Same one-command fix as the Google key.
2. **AP-6 decision — recommendation given, awaiting go-ahead:** score
   `benchmarkMacroF1` against **Denner's live data** (free, every run, self-updating)
   rather than the 291-row benchmark. Until then two alerts stay wired-but-silent and
   `instrument-missing` fires every run.
3. Consider dropping `delete_repo` from the GitHub token scopes — nothing here needs it.
4. `COLLECTION_MODE` repo variable is inert — delete whenever, or never.
5. Optional: remove the unused `OPENAI_API_KEY` and the two `VITE_*` lines from `.env`.

**Work packages:**
- **T1 — taxonomy divergence.** Designed, cross-reviewed, blockers resolved, PM
  decisions taken. Biggest remaining change: touches a live DB with a migration.
  Build order is in the two RCA docs; steps 0–2 fix the site before any pipeline code
  ships. **Recommended to start with fresh context, not at the tail of a session.**
- **J2** fetch ledger → **J3** collect/transform split + daily cron. Tech Lead's
  ruling: order is `J1 → T1 → J2 → T2 → J3`; J3 does not lose its slot to T1, because
  availability outranks browsability.

**Carry-forwards:** AP-11 judge re-benchmark; the nine self-skipping e2e assertions;
~11 built-but-never-wired units from the audit; README staleness; `collectOffers`
rejects rather than contains on an Invalid Date (guard before J3 adds a caller that
can supply one); ALDI's dual-cycle bundling is not fixture-backed; `shared/` has no
type-check or lint gate; retarget the W5 guard at T1's generated `.sql`.

---

## 11. The next thing that matters

**Monday 2026-09-21, 07:00 UTC** — first run carrying everything: the funded judge,
the spend guard, bounded backfill, per-retailer publication weeks, and a valid Google
key. If it publishes cleanly the five-run outage is closed. The healthcheck will
email if it never runs at all.

After it: **re-measure `MAX_CHUNK_MS`** against the real judge-concurrency numbers.

---

## 12. File paths

- Plan: `docs/rca/2026-09-15-final-plan.md`
- Taxonomy RCA: `docs/rca/2026-09-17-architect-taxonomy-divergence.md`,
  `docs/rca/2026-09-17-tech-lead-taxonomy-divergence.md`
- PM decisions: `docs/decisions/2026-09-17-pm-taxonomy-decisions.md`
- ADRs: `docs/decisions/2026-09-17-attributes-version.md`,
  `docs/decisions/2026-09-17-publication-editions.md`
- Audit/QA: `docs/rca/2026-09-16-ddd-tdd-audit.md`, `docs/qa/2026-09-16-live-data-qa.md`
- Longer-term context: `HANDOVER.md`

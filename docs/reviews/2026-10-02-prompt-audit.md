# Prompt audit — basketch instruction files (2026-10-02)

Run with `/claude-api prompt-audit`. Proposed diff: `docs/reviews/2026-10-02-prompt-audit.patch` (apply with `git apply`; one finding per hunk group). **Applied 2026-10-02 (PR "docs: prompt-audit fixes"), except the flagged items F-10 to F-13.**

## Assumptions (Step 0)

- **Scope:** the working directory's Claude Code configuration — `CLAUDE.md`, `web-next/CLAUDE.md` (imports `web-next/AGENTS.md`), `.claude/agents/*.md` (19), `.claude/skills/{grill-me,grilling}/SKILL.md`.
- **Skipped:** `~/.claude/CLAUDE.md` (user-level, outside the project, not named in the request); `.claude/settings*.json` (may hold secrets, not read); the pipeline's own LLM prompts — they call **non-Anthropic** providers (Gemini, OpenRouter `openai/gpt-5-nano`), so no Claude target applies; `archive/`, `.claude/worktrees/`.
- **Target model:** Claude Opus 5.5 (the model running this audit; agent files pin `opus` / `sonnet` aliases, which resolve to the current generation).
- **Depth:** `CLAUDE.md`, `web-next/*`, and the skills were read in full. The 19 agent bodies (~4,900 lines) were scanned with the pattern greps and every path/command they name was checked against the repo; they were **not** read line by line (see F-12).

## Summary

The files are largely free of the pattern this audit is best known for: there is almost no ALL-CAPS pressure language (2 matches in 5,200 lines), no scratchpad / "think step by step" scaffolding, and no references to retired models. The problems are **stale facts and contradictions between files**:

1. **The 19 agents still describe the April stack** (React + Vite in `web/`, Python in `pipeline/coop/`) — all were written 2026-04-10/14 and last touched 2026-09-09. `CLAUDE.md` says Next.js 16 in `web-next/`. Agents briefed from their own file build or review against a stack that no longer exists.
2. **`CLAUDE.md` points agents at the wrong reference docs** — the April architecture file and a PRD version three releases old — and at paths that moved (Coop source) or no longer exist (`pipeline/archive/migros/`).
3. **A legal rule and the pipeline disagree** — "one fetch per store per week" vs. three full seven-retailer collections a week (flagged, your decision).

Counts: Group 1 (dated prompt text) **0** · Group 2 (brittle config files) **12** · Group 3 (tool descriptions) **not applicable** · Group 4 (request config) **not applicable** (no Anthropic request code).

## Findings (highest confidence first)

| # | Location | Evidence | Pattern | Why it no longer fits | Conf. | Action |
|---|---|---|---|---|---|---|
| F-1 | `CLAUDE.md:280,282` | `Architecture (v2.1): docs/technical-architecture-v2.md` · `PRD (v2.0)` | G2 Volatile specifics | Current architecture is `docs/technical-architecture.md` (v2.0, 2026-10-02); `-v2.md` is the April 2026 version. `docs/prd.md` is v4.0. Every agent reading "Key Reference Files" is sent to the outdated architecture. | High | rewrite (patch) |
| F-2 | `.claude/agents/architect.md:254`, `designer.md:301`, `guide.md:182`, `vp-engineering.md:38`, `devops.md:93-95,130,157,160,190-192` | `React + Vite`, `web/src/styles.css`, `root directory web/`, `pytest in pipeline/coop/`, `vite.config.ts` | G2 Contradicting instruction files + Volatile specifics | `web/` and `pipeline/coop/` do not exist; frontend is Next.js 16 in `web-next/` (CLAUDE.md, verified); Python lives at `pipeline/collection/infrastructure/migros/ocr.py`; design tokens in `web-next/src/app/globals.css`. git blame: agent text 2026-04, CLAUDE.md stack text later → CLAUDE.md is current. | High | rewrite (patch) |
| F-3 | `CLAUDE.md:8` | `pipeline/collection/infrastructure/coop-aktionis-source.ts` | G2 Volatile specifics | File is at `pipeline/collection/infrastructure/coop/coop-aktionis-source.ts`. | High | rewrite (patch) |
| F-4 | `CLAUDE.md:44-46` | `### Planned: collection module` · "the new module" | G2 Time-sensitive / migration-relative | The module exists (`pipeline/collection/{domain,application,infrastructure}`, all seven adapters). "Planned"/"new" is a diff against a state the reader never saw. | High | rewrite (patch) |
| F-5 | `CLAUDE.md:32` | `(latest: 20260427_v3_concept_layer.sql)` | G2 Volatile specifics | Latest is `20261002_least_privilege_revoke_maintain.sql`; a "latest" pin rots on every migration. Point at the folder README instead. | High | rewrite (patch) |
| F-6 | `CLAUDE.md:34` | `pipeline.yml (staggered weekly cron)` | G2 Volatile specifics | `pipeline.yml` runs Mon/Tue/Thu 05:00 UTC; `ci.yml` (the PR gate) is missing from the tree. | High | rewrite (patch) |
| F-7 | `CLAUDE.md:16,238` | `archive/migros/ … do not revive` · `Do NOT revive pipeline/archive/migros/` | G2 Volatile specifics | The directory no longer exists. The **prohibition stays** (legal); only the dead path goes — line 16 removed from the tree, line 238 names the integration (`migros-api-wrapper`) instead. Proposed only — safety rule, confirm before applying. | High | rewrite (patch, confirm) |
| F-8 | `CLAUDE.md:242-243` + all `.claude/agents/*.md:2` | `Invoke with: /agents/<agent-name>`; table uses `builder`, `code-reviewer`…; frontmatter `name: Full-Stack Builder (Implementation Lead)` | G2 Contradicting instruction files | Claude Code registers subagents by the frontmatter `name` (observed in this session: agents appear as "Full-Stack Builder (Implementation Lead)" etc.), so the names CLAUDE.md tells you and other agents to use don't match. Subagent names are meant to be lowercase-hyphen identifiers; `/agents` is the management menu, not an invocation syntax. Fix: frontmatter `name:` → file slug (19 one-line hunks) + reword line 242. Only historical reports mention the display names. | Medium | rewrite (patch) |
| F-9 | `CLAUDE.md:89,230` | `Lazy-load html2canvas …` (twice) | G1d Fossil | `html2canvas` is not a dependency and appears nowhere in `web-next/`. The rule guards code that no longer exists and is said twice. | Medium | remove (patch) |
| F-10 | `CLAUDE.md` Legal Constraints · `.github/workflows/pipeline.yml:5-16` | "One fetch per store per week" vs. cron Mon/Tue/Thu and the workflow comment "a dispatched run collects the same seven retailers … there is no day-of-week gate any more" | G2 Contradicting instruction files | The binding legal rule and the pipeline's behaviour disagree (≈3 fetches per store per week). Which one is right is a legal/product decision; a prohibition is never loosened by an audit. | Medium | **flag — PM decides** (keep the rule and add a day gate, or reword the rule) |
| F-11 | `CLAUDE.md:208-218` | `**Build order (collection module, test-driven):** 1 … 10` | G2 History narrative | Steps 1-8 are built (all adapters exist). Whether 9-10 (categorisation gate, frontend CropRegion rendering) are done I could not verify from files alone. If done, the list is archaeology; if not, mark the remaining steps. | Low | flag |
| F-12 | `.claude/agents/*.md` (19 files) | Project context written 2026-04-10/14 | G2 Volatile specifics | F-2 fixes the paths a grep can find; the agent bodies likely carry more April-era facts (e.g. `code-reviewer.md:138` "Tech stack matches Section 5 of technical-architecture.md … flag as Blocked" — Section 5 of the *new* doc may differ). Recommend a per-agent refresh with each owner (Tech Lead for engineering agents). | Low | flag |
| F-13 | `docs/coding-standards.md` (v2.0, last commit 2026-04-21) | Named as the standards source by CLAUDE.md and several agents | G2 Volatile specifics | Predates Next.js and the collection module; not an instruction file itself, so out of the audit's edit scope. | Low | flag |

**Checked and kept (keep list):** the role lines in `architect.md:10` / `designer.md:10` (followed by real product context, keep-list 9); the `grill-me` → `grilling` wrapper (working redundancy, keep-list 8); `guide.md:237` "troubleshoot step by step" (user-facing troubleshooting, not a reasoning scaffold); `web-next/AGENTS.md` (every rule carries its reason); all Legal Constraints, the DDD invariants, the `tsc`-from-root warning and the Universal Resolution Loop (context and fragile-operation scripts, keep-lists 1 and 3).

## Verify after applying

- `git apply --check docs/reviews/2026-10-02-prompt-audit.patch`, then restart Claude Code from `basketch/` and confirm the agent list shows `builder`, `code-reviewer`, … (F-8).
- Changes to `CLAUDE.md` and `.claude/agents/` go to `main` through a PR (branch protection).

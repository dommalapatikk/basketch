# GSD (Get Shit Done) vs. Basketch Agents — Comparison

**Date:** 2026-04-15
**Source:** [github.com/gsd-build/get-shit-done](https://github.com/gsd-build/get-shit-done)
**Compared against:** basketch agent team (20 agents in `.claude/agents/`)
**Related:** [Osmani agent-skills comparison](agent-skills-comparison.md)

---

## Executive Summary

**GSD** is a generic **workflow automation system** — a meta-prompting layer with 50+ slash commands that manages the entire development lifecycle (initialize → discuss → plan → execute → verify → ship) across 14 AI runtimes. It solves **context rot** through fresh subagent windows, wave-based parallel execution, and XML-structured plans.

**Basketch** is a project-specific **agent organization** — 20 role-based personas with deep frameworks, challenger patterns, resolution loops, and governance hierarchy. It solves **quality governance** through adversarial review, closed-loop enforcement, and escalation chains.

They operate at different layers and are largely complementary. GSD is the **execution engine** (how work gets orchestrated). Basketch agents are the **quality brain** (how work gets judged).

---

## 1. Architecture Comparison

| Dimension | GSD | Basketch |
|-----------|-----|----------|
| **Type** | Workflow automation system (npm package) | Custom agent organization (project-specific) |
| **Scope** | Generic — works on any project | Domain-specific — Swiss grocery deal comparison |
| **Unit of work** | Slash command → phase → plan → task | Agent invocation → module → review loop |
| **Agent model** | Thin orchestrator spawns anonymous specialized agents | Named personas with job titles, frameworks, thought leaders |
| **Execution** | Wave-based parallel (independent plans run simultaneously) | Sequential build order (one module at a time) |
| **Context management** | Fresh 200K window per plan (prevents rot) | Relies on Claude Code's built-in context |
| **State persistence** | STATE.md, HANDOFF.json, SUMMARY.md per phase | CLAUDE.md + agent memory (no formal state file) |
| **Configuration** | config.json with model profiles, workflow toggles | Hard-coded in agent .md files |
| **Runtime support** | 14 runtimes (Claude Code, Gemini, Cursor, Windsurf, etc.) | Claude Code only |
| **Installation** | `npx get-shit-done-cc@latest` | Manual — agents live in `.claude/agents/` |

---

## 2. Workflow Comparison

### GSD's 6-Phase Workflow

```
Initialize ──→ Discuss ──→ Plan ──→ Execute ──→ Verify ──→ Ship
    │              │          │          │           │         │
 Questions     Gray areas  Research   Wave exec   UAT walk  PR creation
 Research      Preferences  XML plans  Fresh ctx   Debug     Archive
 Requirements  CONTEXT.md   Verify     Commits     Fix plans Tag release
 Roadmap                    plans
```

**Key mechanics:**
- `/gsd-new-project`: Questions → research → requirements → roadmap (one command)
- `/gsd-discuss-phase`: Captures preferences before planning (visual, API, content decisions)
- `/gsd-plan-phase`: Research + plan + verify loop until plans pass
- `/gsd-execute-phase`: Wave execution with fresh context per plan, atomic commits
- `/gsd-verify-work`: User acceptance testing with auto-diagnosis of failures
- `/gsd-ship`: PR creation from verified work

### Basketch's AC/DC Workflow

```
GUIDE ──→ GENERATE ──→ VERIFY ──→ SOLVE ──→ VERIFY ──→ NEXT
  │           │           │          │          │
Read docs   Build ONE   Self-check  Fix from  Re-review
+ arch      module      4 gates +   review    ONLY fixes
+ standards              reviewer             → zero findings
```

**Key mechanics:**
- Read CLAUDE.md + architecture + standards before writing anything
- Build one module at a time (strict build order)
- Self-verify: compiles, tests pass, standards, architecture
- Invoke code-reviewer for independent review
- Fix → re-review → loop until zero open findings
- Resolution loop with escalation (Tech Lead → PM)

### Side-by-Side

| Aspect | GSD | Basketch |
|--------|-----|----------|
| **Planning depth** | Deep — discuss phase captures gray areas, research investigates domain | Shallow — relies on architecture doc created upfront |
| **Execution parallelism** | High — wave-based, independent plans run simultaneously | None — strict sequential build order |
| **Context freshness** | Engineered — each plan gets fresh 200K window | Not managed — same conversation window |
| **Review rigor** | Light — plan checker + post-execution verifier | Heavy — code-reviewer + challenger + VP quality gates |
| **User involvement** | Structured — discuss phase, verify phase (UAT) | Minimal during build — heavy at review gates |
| **Session management** | Built-in — pause/resume/handoff | Manual — session-summary.md convention |
| **Scope management** | Phased roadmap with milestones | Fixed build order from architecture |

---

## 3. What GSD Has That Basketch Doesn't

### 3.1 Context Engineering (Critical Gap)
GSD's core innovation. Each execution plan runs in a fresh 200K context window, preventing the quality degradation that happens as context fills up. Basketch has no equivalent — long build sessions accumulate context rot.

**Impact:** A basketch builder agent writing module 5 has worse context quality than when it wrote module 1. GSD's executor writing plan 5 has identical context quality to plan 1.

### 3.2 Wave Execution
Plans grouped by dependency into waves. Independent plans run in parallel within a wave. Waves run sequentially.

```
WAVE 1 (parallel)     WAVE 2 (parallel)     WAVE 3
┌────────┐ ┌────────┐  ┌────────┐ ┌────────┐  ┌────────┐
│ Plan 1 │ │ Plan 2 │→ │ Plan 3 │ │ Plan 4 │→ │ Plan 5 │
└────────┘ └────────┘  └────────┘ └────────┘  └────────┘
```

Basketch's build order is strictly sequential: shared types → scraper → metadata → categorizer → pipeline → frontend data → frontend UI → deploy.

### 3.3 Discussion Phase
`/gsd-discuss-phase` surfaces gray areas before planning. Asks context-appropriate questions (visual features → layout/density; APIs → response format/error handling). Creates CONTEXT.md that guides research and planning.

Basketch has no equivalent. The architect designs upfront, and the builder implements. There's no structured step for capturing implementation preferences before building.

### 3.4 Session Management
- `/gsd-pause-work` → HANDOFF.json (structured mid-phase handoff)
- `/gsd-resume-work` → Restore from last session
- STATE.md → Persistent decisions, blockers, position across sessions

Basketch relies on manual session-summary.md and memory system.

### 3.5 Codebase Mapping (Brownfield)
`/gsd-map-codebase` spawns parallel agents to analyze existing stack, architecture, conventions. Then `/gsd-new-project` uses this as context.

Basketch has no equivalent — agents read CLAUDE.md and architecture docs but don't auto-discover project patterns.

### 3.6 Quick Mode
`/gsd-quick` for ad-hoc tasks that don't need full planning. Same guarantees (atomic commits, state tracking), faster path. Composable flags: `--discuss`, `--research`, `--validate`, `--full`.

Basketch has no equivalent for small tasks — every task goes through the full AC/DC cycle.

### 3.7 Model Profiles
Quality (Opus/Opus/Sonnet), Balanced (Opus/Sonnet/Sonnet), Budget (Sonnet/Sonnet/Haiku). Controls token spend per agent type.

Basketch uses Sonnet by default (per memory feedback), Opus for complex reasoning — but this isn't formalized in agent configs.

### 3.8 Security Hardening
- Path traversal prevention
- Prompt injection detection in planning artifacts
- PreToolUse prompt guard hook
- Shell argument validation
- CI-ready injection scanner

Basketch has no security layer for its agent tooling.

### 3.9 Atomic Git Commits
Every task gets its own commit with structured message: `feat(08-02): add email confirmation flow`. Enables git bisect, independent revertability.

Basketch doesn't mandate commit granularity.

### 3.10 Backlog/Threads/Seeds
- `/gsd-plant-seed`: Forward-looking ideas with trigger conditions
- `/gsd-thread`: Persistent context threads across sessions
- `/gsd-add-backlog`: Parking lot for future work
- `/gsd-add-todo`: Quick idea capture

Basketch has no idea management system.

---

## 4. What Basketch Has That GSD Doesn't

### 4.1 Adversarial Challenger Pattern (Critical Strength)
Architecture and design go through dedicated challenger agents before building starts. The architect-challenger red-teams architecture. The design-challenger red-teams design. These produce Confirmed/Weakened/Rejected verdicts.

GSD has plan verification but no adversarial challenge. Plans are checked against goals, not stress-tested by a devil's advocate.

### 4.2 Closed Resolution Loops
Every finding must be resolved before proceeding:
```
Creator → Reviewer → Findings
                        │
          ACCEPT → Fix → Re-review (only fixes)
          DISAGREE → Escalate (Tech Lead / PM)
          DISCARD → Both agree, documented
                        │
          Zero open findings → Proceed
```

GSD's verification is pass/fail. Basketch's is a negotiation.

### 4.3 Governance Hierarchy
Clear escalation chain with decision authority:
- **Tech Lead** decides technical disagreements
- **PM** decides product/scope disagreements
- **PM has final call** when Tech Lead and PM disagree
- VPs advise but don't veto (blocks are documented if overridden)

GSD has no governance model. The user is the sole decision-maker.

### 4.4 Quality Gate Orchestrator
Meta-agent that orchestrates VP Product + VP Design + VP Engineering reviews in parallel. Uses SPADE framework for disagreements. Four possible verdicts: Ship / Ship with Flags / Hold / Override.

GSD's `/gsd-verify-work` is user acceptance testing. It doesn't have multi-perspective quality review.

### 4.5 Deep Thought Leader Frameworks
Each basketch agent embeds specific thought leaders:
- Builder: Torvalds (data structures), Hejlsberg (types), Beck (TDD), Fowler (refactoring), Metz (simplicity), Osmani (PRPL), Majors (observability)
- Architect: Google Design Doc, C4 Model, AWS Well-Architected, Bezos Two-Way Door
- Code Reviewer: Google Code Review, Beck Four Rules, Torvalds Good Taste
- Tech Lead: Fournier (reversibility), Larson (systems thinking), Kua (multiplier)

GSD agents are anonymous — they follow instructions but don't have embedded expertise frameworks.

### 4.6 Named Agent Personas
20 agents with job titles, specialties, and clear handoff protocols:
- Solution Architect, Architecture Challenger, Code Standards Engineer
- Product Designer, Design Challenger, PM Coach
- Builder, Code Reviewer, Tech Lead, SRE
- Quality Gate, VP Product, VP Design, VP Engineering
- DevOps, Analytics, User Researcher, Guide

GSD's agents are functional (researcher, planner, executor, verifier, debugger) without identity or specialization.

### 4.7 Design System Governance
Dedicated designer agent + design challenger before building. Reviews visual quality, mobile usability, accessibility, copy quality, SEO. VP Design does strategic review (brand coherence, Swiss market fit, trust architecture).

GSD has `/gsd-ui-phase` (UI spec) and `/gsd-ui-review` (visual audit) but no adversarial design challenge.

### 4.8 Domain Expertise
Basketch agents have deep Swiss grocery market knowledge baked in — store colors, product taxonomy, WCAG requirements, two-tier store status messages, date filter safety nets.

GSD is domain-agnostic by design. Domain knowledge comes from research phase, not embedded expertise.

### 4.9 Source-Driven Architecture
Architect agent has explicit hierarchy: source-provided metadata → structured metadata → industry patterns → keywords (last resort). Anti-pattern documentation for over-engineering workarounds.

GSD has no equivalent data architecture guidance.

---

## 5. Scorecard

| Dimension | GSD | Basketch | Winner |
|-----------|-----|----------|--------|
| **Context management** | Fresh 200K per plan | No management | GSD |
| **Execution speed** | Wave parallelism | Sequential only | GSD |
| **Session management** | Pause/resume/handoff | Manual | GSD |
| **Quick tasks** | /gsd-quick with flags | Full cycle only | GSD |
| **Codebase discovery** | /gsd-map-codebase | Manual reading | GSD |
| **User preference capture** | Discuss phase | None | GSD |
| **Model cost control** | 3 profiles | Informal | GSD |
| **Security hardening** | Prompt injection, path traversal | None | GSD |
| **Git workflow** | Atomic commits, branching strategies | No standard | GSD |
| **Multi-runtime** | 14 runtimes | Claude Code only | GSD |
| **Idea management** | Seeds, threads, backlog, todos | None | GSD |
| **Review rigor** | Plan checker + verifier | Challenger + resolution loop + VP gates | Basketch |
| **Quality governance** | User decides everything | Tech Lead / PM hierarchy | Basketch |
| **Adversarial challenge** | None | Architect + design challengers | Basketch |
| **Multi-perspective review** | None | 3 VPs + quality gate orchestrator | Basketch |
| **Disagreement resolution** | None (user decides) | SPADE framework | Basketch |
| **Agent expertise depth** | Anonymous functional agents | Named personas + thought leaders | Basketch |
| **Design governance** | UI spec + review | Designer + challenger + VP Design | Basketch |
| **Domain knowledge** | Research-driven (ephemeral) | Embedded (persistent) | Basketch |
| **Architecture guidance** | None embedded | Source-driven hierarchy, anti-patterns | Basketch |

**Score: GSD 11, Basketch 9**

But this is misleading — they operate at different layers. GSD wins on **execution mechanics**. Basketch wins on **quality judgment**. The ideal system uses both.

---

## 6. How They Could Work Together

### The Ideal Stack

```
┌─────────────────────────────────────────────┐
│  BASKETCH QUALITY LAYER                      │
│  (What to build, how to judge it)            │
│                                              │
│  Architect → Challenger → Builder → Reviewer │
│  Designer → Challenger → Quality Gate → Ship │
│  Resolution loops, SPADE, governance         │
├─────────────────────────────────────────────┤
│  GSD EXECUTION LAYER                         │
│  (How to orchestrate the work)               │
│                                              │
│  Context engineering, wave execution,        │
│  session management, atomic commits,         │
│  model profiles, security hardening          │
└─────────────────────────────────────────────┘
```

### Concrete Integration Ideas

**1. Use GSD's context engineering inside basketch's build cycle**
- Each module in the AC/DC cycle gets a fresh context window (GSD-style)
- Builder agent doesn't degrade across modules 1-8
- Priority: HIGH — direct quality improvement

**2. Add GSD's discuss phase before basketch's build phase**
- After architect designs, before builder implements: capture implementation preferences
- Creates CONTEXT.md per module with gray-area decisions locked in
- Priority: HIGH — reduces builder guesswork

**3. Add basketch's challenger pattern to GSD's plan phase**
- After GSD creates plans, run a challenger agent to red-team them
- "What would break? What's missing? What assumption is wrong?"
- Priority: HIGH — GSD's biggest quality gap

**4. Add basketch's resolution loop to GSD's verify phase**
- GSD's verify is pass/fail. Make it a negotiation: accept/disagree/escalate
- Findings loop until zero open items (not just "fix and hope")
- Priority: MEDIUM — adds rigor to GSD's weakest phase

**5. Use GSD's model profiles in basketch agents**
- Formalize which agents use Opus vs Sonnet vs Haiku
- Architect/Tech Lead: Opus. Builder: Sonnet. Code Reviewer: Sonnet. VP gates: Sonnet.
- Priority: MEDIUM — cost optimization

**6. Add GSD's session management to basketch**
- HANDOFF.json for mid-module pauses
- STATE.md for decisions and blockers across sessions
- Priority: MEDIUM — better than session-summary.md

**7. Use GSD's wave execution for independent basketch modules**
- Shared types (module 1) must be first. But metadata extractor, categorizer, and product resolver (module 3) could potentially parallelize.
- Priority: LOW — basketch's sequential order is mostly dependency-driven

**8. Add GSD's security hardening to basketch agents**
- Prompt injection detection for agent outputs
- Path traversal prevention when agents write files
- Priority: LOW — basketch is a portfolio project, not a production system

---

## 7. Key Takeaways

### What basketch should learn from GSD:
1. **Context rot is real** — long build sessions degrade quality. Fresh windows per module would help.
2. **Discuss before build** — capturing gray-area decisions before implementation reduces rework.
3. **Session management matters** — structured pause/resume is better than manual summaries.
4. **Atomic commits** — every task should produce a traceable, revertable commit.
5. **Quick mode** — not everything needs the full AC/DC cycle. Small fixes need a fast path.

### What GSD should learn from basketch:
1. **Adversarial challenge** — plans checked by a devil's advocate catch more than self-verification.
2. **Resolution loops** — findings must be resolved, not just flagged. Zero open items before proceeding.
3. **Governance hierarchy** — someone must decide technical disagreements. "User decides everything" doesn't scale for complex projects.
4. **Agent expertise** — thought leader frameworks give agents better judgment than anonymous instructions.
5. **Multi-perspective review** — VP Product, VP Design, VP Engineering catch different classes of issues.

### The fundamental insight:
GSD proves that **execution orchestration** (context, parallelism, state, commits) is a separate concern from **quality governance** (review, challenge, resolution, escalation). The best system would combine GSD's execution engine with basketch's quality brain — fresh context windows running challenger-verified plans through resolution loops with governance hierarchy.

---

## Comparison with Osmani agent-skills

This is the third framework in the comparison trilogy. Here's how all three relate:

| Dimension | Osmani agent-skills | GSD | Basketch |
|-----------|-------------------|-----|----------|
| **Type** | Skill library | Workflow system | Agent organization |
| **Unit** | Reusable skill file | Slash command + phase | Named agent persona |
| **Portability** | High (any project) | High (any project, 14 runtimes) | Low (project-specific) |
| **Execution** | Manual invocation | Automated orchestration | Manual invocation |
| **Context** | No management | Fresh windows per plan | No management |
| **Review** | Rationalization tables | Plan checker + verifier | Challengers + resolution loops |
| **Expertise** | Process-encoded | Anonymous agents | Thought leader frameworks |
| **Governance** | None | None (user decides) | Tech Lead / PM hierarchy |
| **Unique strength** | Rationalization tables, source-driven dev | Context engineering, wave execution | Adversarial challenge, quality gates |

**Osmani** provides the **knowledge** (what good engineering looks like).
**GSD** provides the **machinery** (how to orchestrate work at scale).
**Basketch** provides the **judgment** (how to evaluate quality and resolve disagreements).

The ideal system encodes Osmani's skills into basketch's agents, running on GSD's execution engine.

// github-step-summary — the visibility channel WP-P7 wires at zero cost.
//
// THE DEFECT THIS CLOSES: `formatAlerts` printed to stdout, which is 90 days
// of GitHub Actions log retention that nobody opens unless a run already
// looks suspicious. `$GITHUB_STEP_SUMMARY` renders on the run's own summary
// page, and `::error::`/`::warning::` workflow commands surface as
// annotations on the run itself — both free, both already supported by
// GitHub Actions, and both unused until this file (RCA 2026-09-15, item 2,
// §2.4: "write formatAlerts to $GITHUB_STEP_SUMMARY and emit annotations —
// this finally wires formatRunSummary").
//
// INFRASTRUCTURE: the file write and the env lookup live here, the same
// reasoning `healthcheck-ping.ts` already documents for "should a missing
// secret warn instead of fail" — not a domain decision.

import { appendFile as fsAppendFile } from 'node:fs/promises'
import type { Alert } from '../transformation/domain/alerts'

export type StepSummaryResult =
  | { readonly status: 'written' }
  | { readonly status: 'skipped'; readonly reason: string }
  | { readonly status: 'failed'; readonly reason: string }

export type StepSummaryDeps = {
  /** Injected so a test never touches the real filesystem. */
  readonly appendFile?: (path: string, content: string) => Promise<void>
  readonly log?: (message: string) => void
}

/**
 * Appends `markdown` to the file GitHub Actions points `GITHUB_STEP_SUMMARY`
 * at. NEVER throws: a missing env var (not running in Actions — a laptop, a
 * unit test) or a write failure both degrade to a logged warning, exactly
 * like `pingHealthcheck` — a visibility channel that can fail the run it is
 * trying to make visible defeats its own purpose.
 */
export async function writeStepSummary(
  env: Readonly<Record<string, string | undefined>>,
  markdown: string,
  deps: StepSummaryDeps = {},
): Promise<StepSummaryResult> {
  const log = deps.log ?? (() => {})
  const path = env.GITHUB_STEP_SUMMARY

  if (!path) {
    const reason = 'GITHUB_STEP_SUMMARY not set — step summary skipped (not running under GitHub Actions?)'
    log(`[pipeline] [WARN] ${reason}`)
    return { status: 'skipped', reason }
  }

  const append = deps.appendFile ?? fsAppendFile

  try {
    await append(path, `${markdown}\n`)
    return { status: 'written' }
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e)
    log(`[pipeline] [WARN] could not write the step summary: ${reason}`)
    return { status: 'failed', reason }
  }
}

/**
 * Escapes a workflow-command value per GitHub's own rules
 * (percent-encoding `%`, `\r`, `\n`) — an unescaped newline in an
 * `::error::` line truncates the annotation at that point.
 */
function escapeAnnotation(message: string): string {
  return message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
}

/**
 * `Alert.severity` and GitHub's own workflow-command names differ
 * (`critical` here, `error` there) — this is the one place that maps them,
 * so a rename in one vocabulary can never silently desync the other.
 */
const GITHUB_ANNOTATION_COMMAND: Readonly<Record<Alert['severity'], 'error' | 'warning' | 'notice'>> = {
  critical: 'error',
  warning: 'warning',
  info: 'notice',
}

/**
 * Emits one `::error::`/`::warning::`/`::notice::` workflow command per
 * alert. `info` maps to `::notice::` rather than being dropped — GitHub
 * does support it, and an alert that exists at all is worth a line on the
 * run, even one that needs no action.
 */
export function emitAnnotationsForAlerts(alerts: readonly Alert[], log: (message: string) => void = console.log): void {
  for (const alert of alerts) {
    const command = GITHUB_ANNOTATION_COMMAND[alert.severity]
    log(`::${command}::${escapeAnnotation(`[${alert.code}] ${alert.message} — ${alert.action}`)}`)
  }
}

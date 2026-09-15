// "Today" must always come from lib/domain/validity.ts `todayInZurich` — not
// from `new Date().toISOString().slice(0, 10)`, which reads the UTC date and
// is wrong for up to two hours every day (Zurich is UTC+1/+2). That was the
// root cause of RCA #10 (docs/rca/2026-09-15-final-plan.md), and
// server/data/supabase-provider.ts's own `today` computation reverted to
// exactly this line once already during development of this feature.
//
// LOW, code review of 9525601: "nothing proves supabase-provider uses the
// Zurich date — reverting to toISOString stays green." This is that guard —
// a source-level check, not a render/behaviour one, because the failure mode
// is a silent revert to a pattern that still type-checks and still returns a
// plausible-looking string.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const GUARDED_DIRS = [join(__dirname, '..', 'server'), join(__dirname, '..', 'lib')]

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      out.push(...sourceFiles(full))
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) {
      out.push(full)
    }
  }
  return out
}

// The UTC-date-slice pattern this guards against, however it is spaced.
const UTC_DATE_SLICE = /\.toISOString\(\s*\)\s*\.slice\(\s*0\s*,\s*10\s*\)/

/**
 * Strips comments before matching — cheap and imperfect (it does not know
 * about `/*`-lookalikes inside a string literal), but the failure mode is a
 * false positive that is easy to reword, not a missed regression. Without
 * this, `lib/domain/validity.ts`'s own doc comment — which explains why the
 * pattern is wrong by naming it — would trip the guard on its own
 * documentation, which is exactly backwards.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

describe('"today" is never derived from the UTC date', () => {
  const files = GUARDED_DIRS.flatMap(sourceFiles)

  it('finds the files it is supposed to be guarding', () => {
    // Guards the guard — a bad path would make the assertion below vacuous.
    expect(files.length).toBeGreaterThan(30)
  })

  it('has no toISOString().slice(0, 10) date derivation in src/server or src/lib', () => {
    const offenders = files.flatMap((file) => {
      const code = stripComments(readFileSync(file, 'utf8'))
      return UTC_DATE_SLICE.test(code) ? [file.split('/src/')[1]] : []
    })
    expect(offenders).toEqual([])
  })
})

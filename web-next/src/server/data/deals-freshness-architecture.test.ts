import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// D6 (docs/rca/2026-09-27-tech-lead-stale-expired-deals.md § Cross-review
// resolution): 2026-09-27 the German homepage served Volg deals a day after
// their valid_to, because "today" was read inside a cached function.
// These source-level guards keep that class of bug out.

const SRC = join(__dirname, '..', '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

const files = sourceFiles(SRC).map((path) => ({ path, text: readFileSync(path, 'utf8') }))

/** Bodies of functions whose body holds a 'use cache' directive statement
 * (a line that is only the directive — mentions in comments don't count). */
function cachedFunctionBodies(text: string): string[] {
  const bodies: string[] = []
  const directive = /^[ \t]*['"]use cache['"];?[ \t]*$/gm
  for (let m = directive.exec(text); m !== null; m = directive.exec(text)) {
    const open = text.lastIndexOf('{', m.index)
    let depth = 0
    for (let i = open; i < text.length; i++) {
      if (text[i] === '{') depth++
      else if (text[i] === '}' && --depth === 0) {
        bodies.push(text.slice(open, i + 1))
        break
      }
    }
  }
  return bodies
}

const CLOCK = /\b(todayInZurich\(|Date\.now\(|new Date\(\s*\))/

describe('deals freshness — architecture guards (D6)', () => {
  it("no 'use cache' function reads the clock (the date must be part of the cache key)", () => {
    const offenders = files.flatMap(({ path, text }) =>
      cachedFunctionBodies(text)
        .filter((body) => CLOCK.test(body))
        .map(() => path),
    )
    expect(offenders).toEqual([])
  })

  it('every read of the deals table filters on valid_to', () => {
    const offenders = files.flatMap(({ path, text }) => {
      const reads = text.split(/\.from\(\s*['"]deals['"]\s*\)/).slice(1)
      // The chain following each .from('deals') up to the end of the statement.
      return reads
        .map((rest) => rest.slice(0, rest.search(/;|\n\s*\n/) + 1 || undefined))
        .filter((chain) => !/valid_to/.test(chain))
        .map(() => path)
    })
    expect(offenders).toEqual([])
  })

  it('never reads the materialised views that freeze CURRENT_DATE at refresh time', () => {
    const offenders = files
      .filter(({ text }) => /concept_cheapest_now|worth_picking_up_candidates/.test(text))
      .map(({ path }) => path)
    expect(offenders).toEqual([])
  })

  it('the guards catch the defect shapes, and ignore mentions in comments', () => {
    const comment = "// wraps getWeeklySnapshot's 'use cache' directive\nconst t = todayInZurich()"
    expect(cachedFunctionBodies(comment)).toEqual([])
    const cached = "async function f() {\n  'use cache'\n  const today = todayInZurich()\n}"
    expect(cachedFunctionBodies(cached).some((b) => CLOCK.test(b))).toBe(true)
    const uncached = "async function f() {\n  'use cache'\n  return load(today)\n}"
    expect(cachedFunctionBodies(uncached).some((b) => CLOCK.test(b))).toBe(false)
  })
})

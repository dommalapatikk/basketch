import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// D6 (docs/rca/2026-09-27-tech-lead-stale-expired-deals.md § Cross-review
// resolution): 2026-09-27 the German homepage served Volg deals a day after
// their valid_to, because "today" was read inside a cached function.
// These source-level guards keep that class of bug out.

const SRC = join(__dirname, '..', '..')

function sourceFiles(dir: string, skip: RegExp[] = []): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (skip.some((re) => re.test(path))) return []
    if (statSync(path).isDirectory()) return sourceFiles(path, skip)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

const files = sourceFiles(SRC).map((path) => ({ path, text: readFileSync(path, 'utf8') }))

// N-2, docs/reviews/2026-09-28-review-stale-expired-deals.md: matches
// `'use cache'`, `'use cache: remote'` and `'use cache: private'` alike —
// the original regex only matched the bare form.
const DIRECTIVE = /^[ \t]*['"]use cache(?::\s*\w+)?['"];?[ \t]*$/gm

/** Bodies of functions whose body holds a 'use cache' directive statement
 * (a line that is only the directive — mentions in comments don't count). */
function cachedFunctionBodies(text: string): string[] {
  const bodies: string[] = []
  const directive = new RegExp(DIRECTIVE)
  for (let m = directive.exec(text); m !== null; m = directive.exec(text)) {
    const open = text.lastIndexOf('{', m.index)
    // N-2: a FILE-level 'use cache' directive (no enclosing function) has no
    // earlier '{' at all — `lastIndexOf` returns -1. The directive then
    // applies to the whole module, so the rest of the file is its body,
    // rather than silently producing no body (and no guard) at all.
    if (open === -1) {
      bodies.push(text.slice(m.index))
      continue
    }
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

/**
 * M9, docs/reviews/2026-09-28-review-stale-expired-deals.md: "the D6 guard
 * only works at grep level ... a cached function reads the clock through a
 * helper (`zurichDay()` → `todayInZurich()`)" survived undetected, because
 * `cachedFunctionBodies` only ever looked at the cached function's OWN text,
 * never at what a function it calls does. This extracts every named
 * function-like declaration in a module (`function f() {}`, `const f = () =>
 * {}`, `const f = function () {}`) so a cached function's calls can be
 * followed into their own bodies, transitively, within the same file.
 *
 * Deliberately module-scoped, not cross-file: the offending call
 * (`supabaseDealsProvider.fetchDealRows`) already lives in the SAME file as
 * `getDealRowsForDay` in every real case D6 protects, and a cross-module
 * call graph would need real type information (which function a bare
 * identifier resolves to) that a text scan cannot get right — see the note
 * at the bottom of this file for what covers the cross-module case instead.
 */
function functionDeclarations(text: string): Map<string, string> {
  const decls = new Map<string, string>()
  const patterns = [
    // function name(...) { ... }
    /function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{;]+)?\{/g,
    // const/let name = (...) => { ... }  |  = function (...) { ... }  |  = async variants
    /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^={]+)?=\s*(?:async\s*)?(?:function\s*\*?\s*\([^)]*\)|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)\s*(?::[^{=]+)?\{/g,
  ]
  for (const pattern of patterns) {
    const re = new RegExp(pattern)
    for (let m = re.exec(text); m !== null; m = re.exec(text)) {
      const name = m[1]
      const openIdx = m.index + m[0].length - 1 // position of the matched '{'
      const body = extractBalancedBraces(text, openIdx)
      if (name && body) decls.set(name, body)
    }
  }
  return decls
}

function extractBalancedBraces(text: string, openIdx: number): string | null {
  let depth = 0
  for (let i = openIdx; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) return text.slice(openIdx, i + 1)
    }
  }
  return null
}

/** True if `body` reads the clock directly, or calls (directly or
 * transitively) a function declared in the same module whose body does. */
function readsClockTransitively(
  body: string,
  decls: Map<string, string>,
  visited: Set<string> = new Set(),
): boolean {
  if (CLOCK.test(body)) return true
  const callRe = /\b([A-Za-z_$][\w$]*)\s*\(/g
  for (let m = callRe.exec(body); m !== null; m = callRe.exec(body)) {
    const name = m[1]
    if (visited.has(name)) continue
    const calleeBody = decls.get(name)
    if (!calleeBody) continue
    visited.add(name)
    if (readsClockTransitively(calleeBody, decls, visited)) return true
  }
  return false
}

/**
 * N-3, docs/reviews/2026-09-28-review-stale-expired-deals.md: the plan (test
 * 4) also names `pipeline/` for the valid_to guard, excluding `migrate/` and
 * `scripts/` (one-off, human-run repair scripts, not the live read/write
 * path) and excluding WRITES — `pipeline/store.ts` upserts and deactivates
 * rows via `.from('deals').update(...)`/`.upsert(...)`, and an update chain
 * legitimately narrows on other columns (`is_active`, `store`, `valid_from`)
 * without ever needing `valid_to` itself; the rule is about READS.
 */
const PIPELINE_ROOT = join(SRC, '..', '..', 'pipeline')
const pipelineFiles = sourceFiles(PIPELINE_ROOT, [/\/migrate\//, /\/scripts\//]).map((path) => ({
  path,
  text: readFileSync(path, 'utf8'),
}))

function offendingDealsReads(sourceSet: { path: string; text: string }[]): string[] {
  return sourceSet.flatMap(({ path, text }) => {
    const reads = text.split(/\.from\(\s*['"]deals['"]\s*\)/).slice(1)
    // The chain following each .from('deals') up to the end of the statement.
    return reads
      .map((rest) => rest.slice(0, rest.search(/;|\n\s*\n/) + 1 || undefined))
      .filter((chain) => !/\.(upsert|insert|update)\(/.test(chain))
      .filter((chain) => !/valid_to/.test(chain))
      .map(() => path)
  })
}

describe('deals freshness — architecture guards (D6)', () => {
  it("no 'use cache' function reads the clock (the date must be part of the cache key)", () => {
    const offenders = files.flatMap(({ path, text }) => {
      const decls = functionDeclarations(text)
      return cachedFunctionBodies(text)
        .filter((body) => readsClockTransitively(body, decls))
        .map(() => path)
    })
    expect(offenders).toEqual([])
  })

  it('every read of the deals table filters on valid_to (web-next)', () => {
    expect(offendingDealsReads(files)).toEqual([])
  })

  it('every read of the deals table filters on valid_to (pipeline, excluding migrate/ and scripts/)', () => {
    // Documents what this covers, in case the directories above ever go
    // empty and this silently stops checking anything.
    expect(pipelineFiles.length).toBeGreaterThan(0)
    expect(offendingDealsReads(pipelineFiles)).toEqual([])
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

  it('a file-level directive (no enclosing function) is still checked, not silently skipped', () => {
    const fileLevel = "'use cache'\n\nexport async function f() {\n  return todayInZurich()\n}"
    const decls = functionDeclarations(fileLevel)
    expect(cachedFunctionBodies(fileLevel).some((b) => readsClockTransitively(b, decls))).toBe(true)
  })

  it('the widened directive also matches "use cache: remote" and "use cache: private"', () => {
    const remote = "async function f() {\n  'use cache: remote'\n  const t = todayInZurich()\n}"
    expect(cachedFunctionBodies(remote).some((b) => CLOCK.test(b))).toBe(true)
    const priv = "async function f() {\n  'use cache: private'\n  return load(today)\n}"
    expect(cachedFunctionBodies(priv).some((b) => CLOCK.test(b))).toBe(false)
  })

  /**
   * M9: a cached function that reads the clock through a helper defined in
   * the SAME module. `zurichDay()` never mentions `todayInZurich(` in the
   * cached function's own text — only `readsClockTransitively` following the
   * call into `zurichDay`'s body catches it.
   */
  it('catches a cached function that reads the clock through a same-module helper (M9)', () => {
    const indirect = [
      'function zurichDay() {',
      '  return todayInZurich()',
      '}',
      '',
      'async function getDealRowsForDay(input) {',
      "  'use cache'",
      '  const today = zurichDay()',
      '  return fetchDealRows({ today })',
      '}',
    ].join('\n')
    const decls = functionDeclarations(indirect)
    expect(decls.has('zurichDay')).toBe(true)
    const offenders = cachedFunctionBodies(indirect).filter((body) =>
      readsClockTransitively(body, decls),
    )
    expect(offenders.length).toBeGreaterThan(0)
  })

  it('a cached function that calls a helper NOT reading the clock is not flagged', () => {
    const clean = [
      'function formatDay(input) {',
      "  return input.today.replace(/-/g, '')",
      '}',
      '',
      'async function getDealRowsForDay(input) {',
      "  'use cache'",
      '  const key = formatDay(input)',
      '  return fetchDealRows({ today: input.today, key })',
      '}',
    ].join('\n')
    const decls = functionDeclarations(clean)
    const offenders = cachedFunctionBodies(clean).filter((body) =>
      readsClockTransitively(body, decls),
    )
    expect(offenders).toEqual([])
  })
})

// N-3 note on scope: this guard is text-based and module-scoped by
// construction (see functionDeclarations' doc comment above). A cached
// function that reads the clock through a helper imported from ANOTHER
// module would not be caught here — that shape is caught instead by
// snapshot.test.ts's "getDealRowsForDay — the argument wins over the clock
// (M9)" test, which calls the real (possibly cross-module) call graph at
// runtime with the system clock deliberately disagreeing with the argument.

// Review R-1 (2026-09-28, mutation M5b): every share destination must be
// built from `useActiveListItems()`, so an expired item's saved price is
// never sent in a WhatsApp/e-mail message (Art. 3(1)(e) UWG). Covers
// BottomBar, which MF-2 was about, and any future caller.
function shareItemsSource(text: string): string | null {
  const call = /createShareTarget\(\{([^}]*)\}/.exec(text)
  if (!call) return null
  const itemsArg = /\bitems(?:\s*:\s*([A-Za-z_$][\w$]*))?/.exec(call[1])
  return itemsArg ? (itemsArg[1] ?? 'items') : null
}

function comesFromActiveItems(text: string, name: string): boolean {
  return new RegExp(`\\b(?:const|let)\\s+${name}\\s*=\\s*useActiveListItems\\(\\)`).test(text)
}

describe('share targets are built from active (non-expired) list items (R-1)', () => {
  it('every createShareTarget caller passes items from useActiveListItems()', () => {
    const callers = files.filter(
      ({ path, text }) => !path.endsWith('share-target.ts') && /createShareTarget\(/.test(text),
    )
    expect(callers.length).toBeGreaterThan(0)
    const offenders = callers
      .filter(({ text }) => {
        const name = shareItemsSource(text)
        return name === null || !comesFromActiveItems(text, name)
      })
      .map(({ path }) => path)
    expect(offenders).toEqual([])
  })

  it('the guard catches the M5b shape', () => {
    const bad =
      'const items = useListStore((s) => s.items)\nconst t = createShareTarget({ origin, locale, items })'
    const good =
      'const items = useActiveListItems()\nconst t = createShareTarget({ origin, locale, items })'
    expect(comesFromActiveItems(bad, shareItemsSource(bad) ?? '')).toBe(false)
    expect(comesFromActiveItems(good, shareItemsSource(good) ?? '')).toBe(true)
  })
})

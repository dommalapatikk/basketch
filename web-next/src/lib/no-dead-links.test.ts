// A dead link must never reach the DOM again.
//
// Three separate components each rendered `<a href="#">` and each assigned the
// real destination inside its own click handler. Every one of them shipped,
// because nothing in the suite asserted anything about the markup at rest and
// two of the three had no test file at all.
//
// This is a source-level check rather than a render-level one on purpose: it
// covers components that have no test, which is exactly where the defect kept
// appearing. It is the same argument as lib/domain/architecture.test.ts — a
// rule written only in review comments is not a rule.
//
// `#fragment` links are fine. The skip link (`href="#main-content"`) is a real,
// required destination. What is banned is the bare `#`, which resolves to the
// current page and so silently means "this control does nothing".

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')

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

/** `href="#"`, `href={'#'}` and `href={"#"}` — the bare-fragment forms. */
const DEAD_HREF = /href\s*=\s*(?:"#"|'#'|\{\s*['"]#['"]\s*\})/

/**
 * The lines of a file that are actually code, paired with their 1-based number.
 *
 * Comments are excluded because every file that fixed this defect documents it,
 * and quoting `href="#"` is the clearest way to say what was wrong. A guard
 * that fires on its own description trains people to delete the description.
 *
 * This tracks `/* *\/` and `{/* *\/}` blocks rather than testing each line in
 * isolation: the first version only recognised the OPENING line of a block, so
 * a prose line in the middle of a JSX comment counted as code. Cheap and
 * imperfect — it does not know about `/*` inside a string literal — but the
 * failure mode is a false positive on a line that is easy to reword, not a
 * missed dead link.
 */
function codeLines(source: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = []
  let inBlock = false

  source.split('\n').forEach((text, i) => {
    const wasInBlock = inBlock
    const opens = (text.match(/\/\*/g) ?? []).length
    const closes = (text.match(/\*\//g) ?? []).length
    if (opens > closes) inBlock = true
    else if (closes > 0 && closes >= opens) inBlock = false

    const isLineComment = /^\s*(\/\/|\*)/.test(text)
    const startsBlock = /^\s*(\{\s*)?\/\*/.test(text)
    if (wasInBlock || isLineComment || startsBlock) return

    out.push({ text, line: i + 1 })
  })

  return out
}

describe('no component renders a link to nowhere', () => {
  const files = sourceFiles(SRC)

  it('finds the files it is supposed to be guarding', () => {
    // Guards the guard — a bad path would make the assertion below vacuous.
    expect(files.length).toBeGreaterThan(30)
  })

  it('has no bare href="#" anywhere in src', () => {
    const offenders = files.flatMap((file) =>
      codeLines(readFileSync(file, 'utf8')).flatMap(({ text, line }) =>
        DEAD_HREF.test(text) ? [`${file.split('/src/')[1]}:${line}  ${text.trim()}`] : [],
      ),
    )
    expect(offenders).toEqual([])
  })

  it('does not assign href from inside a click handler', () => {
    // The other half of the same defect. Mutating `e.currentTarget.href` during
    // onClick leaves the DOM wrong at rest, so middle click, Cmd+click and
    // "Copy link address" — none of which fire onClick — follow the stale href.
    const offenders = files.flatMap((file) =>
      codeLines(readFileSync(file, 'utf8')).flatMap(({ text, line }) =>
        /\.(currentTarget|target)\s*\.href\s*=/.test(text)
          ? [`${file.split('/src/')[1]}:${line}  ${text.trim()}`]
          : [],
      ),
    )
    expect(offenders).toEqual([])
  })
})

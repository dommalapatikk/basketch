import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// Regression (code review MF-1, 2026-09-27): a count passed to t() as a
// pre-formatted string (`count: n.toLocaleString(locale)`) breaks ICU plural
// rules — "NaN deals" at 1,000+. Counts must be passed as numbers.
const COUNT_ARG = /\b(count|n|items|stores|deals|days|weeks|months)\s*:\s*[^,}\n]*\.toLocaleString\(/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

describe('count arguments reach t() as numbers', () => {
  it('no source file passes a toLocaleString() result as a count argument', () => {
    const offenders = sourceFiles(join(__dirname, '..')).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => (COUNT_ARG.test(line) ? `${file}:${i + 1}: ${line.trim()}` : null))
        .filter((x): x is string => x !== null),
    )
    expect(offenders).toEqual([])
  })

  it('the pattern catches the defect shape', () => {
    expect(COUNT_ARG.test('          count: filtered.length.toLocaleString(locale),')).toBe(true)
    expect(COUNT_ARG.test('          deals: snapshot.totalDeals,')).toBe(false)
  })
})

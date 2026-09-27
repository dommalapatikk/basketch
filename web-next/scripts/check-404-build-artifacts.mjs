#!/usr/bin/env node
// T4 — build-artifact check (regression 2026-09-25: 404 served global-error
// (500)). Run after `next build`. Fails LOUD on an unrecognised build-output
// shape instead of passing vacuously — these are internal, undocumented Next
// formats that can change on any minor bump (architect cross-review § 4,
// amendment A3 / tech-lead cross-review resolution D3). T2 (the HTTP
// structural spec, e2e/404-structural.spec.ts) parses served HTML only, so
// it stays the primary, version-independent gate; this script is defence in
// depth against the specific defect this fix removes.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const nextDir = join(__dirname, '..', '.next')

let failed = false
function fail(message) {
  failed = true
  console.error(`T4 FAIL: ${message}`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function walkHtmlFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      out.push(...walkHtmlFiles(full))
    } else if (name.endsWith('.html')) {
      out.push(full)
    }
  }
  return out
}

// 1. prerender-manifest.json must have the expected shape (version 4).
const manifestPath = join(nextDir, 'prerender-manifest.json')
let manifest
try {
  manifest = readJson(manifestPath)
} catch (error) {
  console.error(
    `T4 FAIL: could not read/parse ${manifestPath}: ${error.message} — ` +
      'Next build-artifact format changed; update this check for the new Next version.',
  )
  process.exit(1)
}
if (manifest.version !== 4) {
  fail(
    `prerender-manifest.json version is ${JSON.stringify(manifest.version)}, expected 4 — ` +
      'Next build-artifact format changed; update this check for the new Next version.',
  )
}

// 2. No dynamic route may still be the [...rest] catch-all shell — that page
// was deleted specifically because its fallback shell produced the bug (RCA
// §5, "Delete src/app/[locale]/[...rest]/page.tsx").
for (const [route, entry] of Object.entries(manifest.dynamicRoutes ?? {})) {
  const source = entry?.fallbackSourceRoute ?? ''
  if (route.endsWith('[...rest]') || String(source).endsWith('[...rest]')) {
    fail(`prerender-manifest.json still has a [...rest] dynamic route: ${route}`)
  }
}

// 3 & 4. Walk every prerendered .html under .next/server/app.
const appDir = join(nextDir, 'server', 'app')
let htmlFiles
try {
  htmlFiles = walkHtmlFiles(appDir)
} catch (error) {
  console.error(
    `T4 FAIL: could not walk ${appDir}: ${error.message} — ` +
      'Next build-artifact format changed; update this check for the new Next version.',
  )
  process.exit(1)
}
if (htmlFiles.length === 0) {
  fail(`no .html files found under ${appDir} — Next build-artifact format changed`)
}

for (const htmlPath of htmlFiles) {
  const html = readFileSync(htmlPath, 'utf8')

  const metaPath = htmlPath.replace(/\.html$/, '.meta')
  let meta
  try {
    meta = readJson(metaPath)
  } catch (error) {
    fail(`could not read/parse ${metaPath}: ${error.message}`)
    continue
  }

  // A PPR fallback shell with a "postponed" resume state is LEGITIMATELY an
  // empty placeholder at build time (e.g. .next/server/app/[locale].html) —
  // its content is filled in per-request. Only a "finished" document (no
  // postponed state) can be the shape of the original defect: a cached
  // artifact with a dangling hole that nothing will ever fill (RCA
  // §2.1-§2.4). Skip shells entirely for the checks below.
  if ('postponed' in meta) continue

  // Single-<html> check (the nested-<html> regression, RCA "Secondary
  // defect"), scoped to finished documents — an empty shell has none.
  const htmlTagCount = (html.match(/<html[ >]/g) ?? []).length
  if (htmlTagCount !== 1) {
    fail(`${htmlPath} has ${htmlTagCount} <html> tags, expected exactly 1`)
  }

  // The dangling-content markers are only a defect on a genuine 404 document
  // — Next's own compiled 500 artifact (_global-error.html) legitimately
  // renders an ErrorApp-style document by design, and is not part of this
  // fix. Scope to status 404, matching the original T4 wording (RCA §6).
  if (meta.status !== 404) continue

  if (html.includes('%%drp:')) {
    fail(
      `${htmlPath} has status 404 with no postponed state but contains a dangling %%drp: placeholder`,
    )
  }
  if (html.includes('id="__next_error__"')) {
    fail(
      `${htmlPath} has status 404 with no postponed state but is the __next_error__ ErrorApp ` +
        'document — a finished, cached 404 must not depend on client-side rendering to show content',
    )
  }
}

if (failed) {
  process.exit(1)
}
console.log(`T4 OK: checked ${htmlFiles.length} prerendered .html files under .next/server/app`)

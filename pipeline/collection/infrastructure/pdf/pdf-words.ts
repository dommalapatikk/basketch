// PdfWordExtractor — turns a flyer PDF into positioned words.
//
// Shared by every flyer-based adapter (Spar, Aldi, and Coop's epaper if it is
// ever preferred over aktionis). Uses poppler's `pdftotext -bbox`, which emits
// one <word> per token with exact coordinates in PDF points.
//
// WHY coordinates and not reading order: flyer text is laid out in a visual
// grid. `pdftotext -layout` interleaves columns — one product's name lands
// between another's price and its "statt" line. Reading order is meaningless
// here; geometry is the only reliable signal.
//
// REQUIRES the `poppler-utils` package (pdftotext, pdftoppm) on the runner.
// Add to the workflow: `sudo apt-get install -y poppler-utils`.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

export type Word = {
  readonly text: string
  readonly xMin: number
  readonly yMin: number
  readonly xMax: number
  readonly yMax: number
}

export type PdfPage = {
  readonly pageNumber: number
  /** Page dimensions in PDF points, needed to convert tiles to fractions. */
  readonly widthPt: number
  readonly heightPt: number
  readonly words: readonly Word[]
}

/** Font height in points. The strongest role signal in a flyer. */
export function heightOf(w: Word): number {
  return w.yMax - w.yMin
}

const PAGE_RE = /<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g
const WORD_RE = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
}

/** Parses the XHTML that `pdftotext -bbox` writes. Pure — trivially testable. */
export function parseBboxXml(xml: string): PdfPage[] {
  const pages: PdfPage[] = []
  let pageNumber = 0

  for (const pageMatch of xml.matchAll(PAGE_RE)) {
    pageNumber += 1
    const widthPt = Number(pageMatch[1])
    const heightPt = Number(pageMatch[2])
    const body = pageMatch[3] ?? ''
    const words: Word[] = []

    for (const w of body.matchAll(WORD_RE)) {
      const text = decode(w[5] ?? '').trim()
      if (!text) continue
      words.push({
        text,
        xMin: Number(w[1]),
        yMin: Number(w[2]),
        xMax: Number(w[3]),
        yMax: Number(w[4]),
      })
    }

    pages.push({ pageNumber, widthPt, heightPt, words })
  }

  return pages
}

/** Runs pdftotext against a local PDF and returns positioned words per page. */
export async function extractWords(pdfPath: string): Promise<PdfPage[]> {
  // maxBuffer: a 17-page flyer produces ~1MB of XML; large flyers more.
  const { stdout } = await run('pdftotext', ['-bbox', pdfPath, '-'], { maxBuffer: 64 * 1024 * 1024 })
  return parseBboxXml(stdout)
}

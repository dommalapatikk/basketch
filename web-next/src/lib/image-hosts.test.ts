import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every retailer image host must be allowed, or next/image silently renders
 * nothing.
 *
 * TWO INCIDENTS, SAME SHAPE. 2026-09-11: the pipeline wrote 107 Denner deals
 * with valid images at denner.imgix.net. `remotePatterns` listed four hosts
 * and that was not one of them, so every Denner card rendered blank on the
 * live site — the data was perfect, the frontend refused to display it, and
 * nothing reported a problem. This test was built that day to close exactly
 * that gap.
 *
 * 2026-09-16 (QA): it didn't. LIDL (74 live deals, imgproxy-retcat.assets.schwarz)
 * and Volg (16, www.volg.ch) were both live in production, both missing from
 * `remotePatterns`, and both missing from THIS FILE's own `REQUIRED_HOSTS` —
 * a hand-typed list that had drifted from the retailers the pipeline actually
 * produces. Two of the four entries it DID check
 * (`image.migros.ch`, `image.coop.ch`) turned out to be hosts no live deal has
 * ever used — a guard checking the wrong things is coverage theatre, not
 * coverage (HANDOVER.md §4).
 *
 * THE FIX: stop hand-typing the list. Read the real host straight out of the
 * SAME committed fixture each retailer adapter's own test already parses —
 * genuine captured data, one hop from what the pipeline would actually write.
 * A host can only go missing from here if the fixture it's read from stops
 * carrying it, and that already fails the adapter's own test first. Mutation
 * check: delete any one line from `next.config.ts`'s `remotePatterns` and the
 * matching case below goes red — see the four `it.each` cases.
 */
const config = readFileSync(join(__dirname, '..', '..', 'next.config.ts'), 'utf8')

/**
 * ONLY the `remotePatterns` array's own text, never the whole file. Checking
 * the whole file is a real trap, not a hypothetical one: an earlier draft of
 * this test named a real host in an explanatory comment ABOVE the array, and
 * `config.includes(host)` passed against the comment while the host was
 * genuinely absent from `remotePatterns` — the exact "guard checks a comment,
 * not the config" failure the file's own "lists the hosts inside a
 * remotePatterns block" case warns about. Scoping the substring closes it.
 */
function remotePatternsBlock(source: string): string {
  const match = source.match(/remotePatterns\s*:\s*\[([\s\S]*?)\n\s*\],/)
  if (!match?.[1]) throw new Error('remotePatterns array not found in next.config.ts')
  return match[1]
}
const remotePatterns = remotePatternsBlock(config)

const PIPELINE = join(__dirname, '..', '..', '..', 'pipeline', 'collection', 'infrastructure')

function readFixture(relativePath: string): string {
  return readFileSync(join(PIPELINE, relativePath), 'utf8')
}

/** The hostname a real, committed retailer response would resolve to. */
function hostOf(url: string): string {
  return new URL(url).hostname
}

/**
 * Finds the first value a retailer's own field-extraction regex would find,
 * inside the SAME fixture file its adapter test reads — never a value typed
 * by hand. Throws with a clear message if the fixture stops matching, which
 * is the right failure: the derivation needs updating, not `REQUIRED_HOSTS`.
 */
function firstFieldValue(source: string, pattern: RegExp, describedAs: string): string {
  const match = source.match(pattern)
  if (!match?.[1]) {
    throw new Error(
      `could not find ${describedAs} in its fixture — update the derivation in image-hosts.test.ts`,
    )
  }
  return match[1]
}

/**
 * Every host a retailer adapter can actually write to `deals.image_url`,
 * read from the real fixture its own pipeline test already parses. Each
 * pattern mirrors the retailer adapter's own extraction, cited by path:
 *   - Denner: denner-api-source.ts reads the `imageUrl` attribute
 *   - Coop:   coop-aktionis-source.ts reads the .card-image <img> src
 *   - LIDL:   lidl-flyer-source.ts reads `product.image`
 *   - Volg:   volg-html-source.ts builds an absolute url from its own SITE
 *             constant plus whatever relative path the page's markup gives —
 *             the constant, not the fixture, is where Volg's host lives.
 *
 * Migros, SPAR and ALDI are deliberately absent: none of the three ever
 * writes `image_url` — see the "does not need an entry for flyer crops" case
 * below, and CLAUDE.md's ProductImage invariant (SourceUrl XOR CropRegion).
 */
const REQUIRED_HOSTS: ReadonlyArray<[string, string]> = [
  [
    'Denner — denner-api-source.ts reads the imageUrl attribute',
    hostOf(
      firstFieldValue(
        readFixture('denner/__fixtures__/weekly-special-page1.json'),
        /"attributeName":\s*"imageUrl"[\s\S]{0,400}?"value":\s*"(https?:\/\/[^"]+)"/,
        "Denner's imageUrl attribute",
      ),
    ),
  ],
  [
    'Coop — coop-aktionis-source.ts reads the .card-image <img> src',
    hostOf(
      firstFieldValue(
        readFixture('coop/__fixtures__/coop-page-1-april-51cards.html'),
        /class="card-image"[\s\S]*?<img[^>]+src="([^"]+)"/,
        "Coop's card-image src",
      ),
    ),
  ],
  [
    'LIDL — lidl-flyer-source.ts reads product.image',
    hostOf(
      firstFieldValue(
        readFixture('lidl/__fixtures__/flyer-kw37.json'),
        /"image":\s*"(https?:\/\/[^"]+)"/,
        "LIDL's product.image field",
      ),
    ),
  ],
  [
    'Volg — volg-html-source.ts builds its absolute image url from SITE',
    hostOf(
      firstFieldValue(
        readFileSync(join(PIPELINE, 'volg/volg-html-source.ts'), 'utf8'),
        /const SITE = '(https?:\/\/[^']+)'/,
        "Volg's SITE constant",
      ),
    ),
  ],
]

describe('next/image remotePatterns', () => {
  it.each(REQUIRED_HOSTS)('allows %s — %s', (_label, host) => {
    expect(remotePatterns).toContain(host)
  })

  it('lists the hosts inside a remotePatterns block', () => {
    // Guards the guard: a config that lost remotePatterns entirely would still
    // pass the string checks above if the hosts appeared in a comment.
    expect(config).toMatch(/remotePatterns\s*:\s*\[/)
  })

  it('does not need an entry for flyer crops', () => {
    // Crops render through a plain <img>, never next/image, because optimising
    // them would serve a derived copy of a protected photograph from our own
    // domain (Art. 2 Abs. 3bis URG). So image.isu.pub and the flyer CDNs must
    // NOT be here — if this ever fails, someone has routed a crop through
    // next/image.
    expect(config).not.toContain('isu.pub')
    expect(config).not.toContain('publitas.com')
  })
})

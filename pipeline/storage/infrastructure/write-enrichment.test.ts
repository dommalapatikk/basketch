import { describe, expect, it } from 'vitest'

import { writeEnrichment } from './write-enrichment'

describe('an update that matches nothing is a failure, not a success', () => {
  /**
   * THE SILENT LOSS, measured on the 2026-09-11 cutover.
   *
   * The run logged `enriched 1618/1620 deals with crop/price-basis/rappen` and
   * the database ended with ZERO crops and ZERO labelled member prices — the
   * entire point of components 1 and 3.
   *
   * Two defects, and the second hid the first:
   *
   *   1. store.ts normalises product_name before the upsert; the enrichment key
   *      was built from the RAW name, so `WHERE product_name = <raw>` never
   *      matched the stored row.
   *   2. PostgREST returns no error for an UPDATE that matches zero rows, and
   *      this function counted every non-error as `updated++`. A write that
   *      changed nothing reported complete success.
   *
   * D3's lesson for the fourth time today: the failure mode here is not things
   * breaking, it is things breaking silently.
   */
  const enrichment = (key: string) => ({
    key,
    sale_price_rappen: 145,
    original_price_rappen: 195,
    price_basis: 'member-only' as const,
    loyalty_programme: 'Lidl Plus',
    page_image_url: 'https://image.isu.pub/rev/jpg/page_5.jpg',
    crop_x: 0.1,
    crop_y: 0.2,
    crop_w: 0.3,
    crop_h: 0.25,
  })

  /** A client whose update matches no rows — the exact production condition. */
  const clientMatchingNothing = () => {
    const seen: string[] = []
    const chain = {
      update() { return chain },
      eq(_col: string, val: string) { seen.push(val); return chain },
      select() { return Promise.resolve({ data: [], error: null }) },
      then(res: (v: unknown) => unknown) { return Promise.resolve({ data: [], error: null }).then(res) },
    }
    return { seen, from() { return chain } }
  }

  it('does not report success for rows it never touched', async () => {
    const c = clientMatchingNothing()
    const updated = await writeEnrichment(c as never, [enrichment('coop|Emmi Vollmilch 1L|2026-09-09')])
    expect(updated).toBe(0)
  })

  it('matches on the NORMALISED name, the way storage wrote it', async () => {
    // store.ts lowercases and collapses whitespace before the upsert. An
    // enrichment keyed on the raw name silently updates nothing.
    const c = clientMatchingNothing()
    await writeEnrichment(c as never, [enrichment('coop|Emmi  Vollmilch   1L|2026-09-09')])
    expect(c.seen).toContain('emmi vollmilch 1l')
  })
})

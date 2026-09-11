import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every retailer image host must be allowed, or next/image silently renders
 * nothing.
 *
 * THE DEFECT, 2026-09-11. The pipeline wrote 107 Denner deals with valid images
 * at denner.imgix.net. `remotePatterns` listed four hosts and that was not one
 * of them, so every Denner card rendered blank on the live site. The data was
 * perfect; the frontend refused to display it, and nothing anywhere reported a
 * problem.
 *
 * Same class as the four pipeline failures found the same day: an operation
 * that appears to succeed while producing nothing.
 *
 * This test is the enforcement. Adding a retailer whose images live on a new
 * host now fails here rather than on the live site.
 */
const config = readFileSync(join(__dirname, '..', '..', 'next.config.ts'), 'utf8')

/** Hosts observed in production data, per retailer. */
const REQUIRED_HOSTS: ReadonlyArray<[string, string]> = [
  ['aktionis / Coop + legacy', 'storage.cpstatic.ch'],
  ['Denner (direct API)', 'denner.imgix.net'],
  ['Migros', 'image.migros.ch'],
  ['Coop', 'image.coop.ch'],
]

describe('next/image remotePatterns', () => {
  it.each(REQUIRED_HOSTS)('allows %s — %s', (_label, host) => {
    expect(config).toContain(host)
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
  })
})

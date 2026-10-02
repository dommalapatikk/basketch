/**
 * De-duplicated, sorted for DISPLAY. Origin names are user-visible German
 * labels, so they use German collation (Ä with A, Ö with O, Ü with U) rather
 * than the default UTF-16 code-unit order, which would put them after 'Z'.
 */
export function uniqueStrings(xs: string[]): string[] {
  return Array.from(new Set(xs)).sort((a, b) => a.localeCompare(b, 'de-CH'))
}

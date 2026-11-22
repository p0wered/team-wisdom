/**
 * Font pairings under evaluation. Each is a display face + a text face (and
 * the accent face used for small labels). All free (OFL), all with Cyrillic.
 *
 * Pick one with `?fonts=<id>`; the choice sets `data-fonts` on <html> and the
 * tokens in global.css do the rest. Default: geist.
 */
export const FONT_PAIRINGS = {
  /** Geist + Geist Mono — Vercel's system; mono for labels, scores, data. */
  geist: 'Geist + Geist Mono',
  /** Manrope + Inter — softer geometric headline (Lattice / Framer feel). */
  manrope: 'Manrope + Inter',
  /** Onest + Inter — neo-grotesk drawn with Cyrillic in mind. */
  onest: 'Onest + Inter',
  /** Inter Display + Inter — the Linear / Attio route, most neutral. */
  inter: 'Inter Display + Inter',
} as const

export type FontPairing = keyof typeof FONT_PAIRINGS

export const DEFAULT_FONT_PAIRING: FontPairing = 'geist'

export function applyFontPairing() {
  const requested = new URLSearchParams(window.location.search).get('fonts')
  const pairing = requested && requested in FONT_PAIRINGS ? (requested as FontPairing) : DEFAULT_FONT_PAIRING
  document.documentElement.dataset.fonts = pairing
}

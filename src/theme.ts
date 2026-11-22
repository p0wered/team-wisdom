/**
 * Site theme, chosen with the `?theme=` query parameter:
 *   /?theme=light — light room, Apple-colour cube (default)
 *   /?theme=dark  — dark room, cube of 26 premium finishes
 *
 * The theme is written to <html data-theme>, where global.css swaps the
 * colour tokens, and passed down to the cube and the backdrop.
 */
export const THEMES = ['light', 'dark'] as const
export type Theme = (typeof THEMES)[number]
export const DEFAULT_THEME: Theme = 'light'

export function parseTheme(value: string | null | undefined): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : DEFAULT_THEME
}

/** Browser chrome colour (mobile address bar) per theme. */
const THEME_COLOR: Record<Theme, string> = { light: '#f5f5f7', dark: '#060606' }

export function applyThemeToDocument(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
}

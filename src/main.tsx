import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted variable fonts (OFL, Latin + Cyrillic). Only the families the
// active pairing uses are downloaded; the others are just @font-face rules.
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import '@fontsource-variable/manrope/wght.css'
import '@fontsource-variable/onest/wght.css'
import '@fontsource-variable/inter/opsz.css'
import './global.css'
import { applyFontPairing } from './fonts'
import { App } from './App'

applyFontPairing()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

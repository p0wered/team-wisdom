import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted variable fonts (OFL, Latin + Cyrillic).
import '@fontsource-variable/geologica/full.css' // all axes, incl. sharpness (SHRP)
import '@fontsource-variable/martian-mono/wght.css'
import './global.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

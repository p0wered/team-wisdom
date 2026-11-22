import { useLayoutEffect } from 'react'
import { useSearchParams } from 'react-router'
import { Backdrop } from '../../components/Backdrop'
import { HeroSection } from '../../components/HeroSection'
import { applyThemeToDocument, parseTheme } from '../../theme'
import styles from './HomePage.module.css'

/** The landing page ("/"): the room behind everything, then sections. */
export function HomePage() {
  const [searchParams] = useSearchParams()
  const theme = parseTheme(searchParams.get('theme'))

  useLayoutEffect(() => applyThemeToDocument(theme), [theme])

  return (
    <main className={styles.page}>
      <div className={styles.backdrop} aria-hidden="true">
        {/* The CSS gradient is the fallback; the shader backdrop covers it when WebGL works */}
        <Backdrop theme={theme} />
      </div>

      <HeroSection theme={theme} />
    </main>
  )
}

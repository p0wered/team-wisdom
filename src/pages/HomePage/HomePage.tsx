import { Backdrop } from '../../components/Backdrop'
import { HeroSection } from '../../components/HeroSection'
import styles from './HomePage.module.css'

/** The landing page ("/"): the room behind everything, then sections. */
export function HomePage() {
  return (
    <main className={styles.page}>
      <div className={styles.backdrop} aria-hidden="true">
        {/* The CSS gradient is the fallback; the shader backdrop covers it when WebGL works */}
        <Backdrop />
      </div>

      <HeroSection />
    </main>
  )
}

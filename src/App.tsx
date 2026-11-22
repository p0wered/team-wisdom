import { Backdrop } from './components/Backdrop'
import { RubiksCube } from './components/RubiksCube'
import styles from './App.module.css'

/**
 * `?compare` renders only the cube in a 648×550 box — the size of the hero
 * canvas on resend.com — so frames can be compared 1:1 against the original.
 */
const compare = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('compare')

export function App() {
  return (
    <main className={styles.page}>
      <div className={styles.backdrop} aria-hidden="true">
        {/* The CSS gradient is the fallback; the shader backdrop covers it when WebGL works */}
        <Backdrop />
      </div>

      {compare ? (
        <RubiksCube className={styles.compare} viewHeight={5.6} />
      ) : (
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.wrap}>
            <div className={styles.copy}>
              <h1 id="hero-title" className={styles.title}>
                Build teams that work.
              </h1>
              <p className={styles.lead}>
                TeamWisdom assesses skills, personality and how people collaborate, then shows who works best
                together. Build teams on evidence, not gut feeling.
              </p>
              <div className={styles.actions}>
                {/* Demo links: point these at the real demo booking and tests pages. */}
                <a className={`${styles.button} ${styles.primary}`} href="#">
                  Book a demo
                </a>
                <a className={`${styles.button} ${styles.secondary}`} href="#">
                  Explore the tests
                </a>
              </div>
            </div>

            <div className={styles.visual}>
              <RubiksCube className={styles.cube} viewHeight={5} />
            </div>
          </div>
        </section>
      )}
    </main>
  )
}

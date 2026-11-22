import { Button } from '../Button'
import { RubiksCube } from '../RubiksCube'
import styles from './HeroSection.module.css'

/**
 * First screen: what TeamWisdom does, in one line, and the cube.
 *
 * Copy: the headline is what the animation acts out — every colour back in
 * its place, as every person in theirs. The lead names how: tests, a role
 * that fits, people who will "сработаться" (get to work well together).
 * Non-breaking spaces (\u00a0) keep short words and dashes off line ends.
 */
export function HeroSection() {
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.wrap}>
        <div className={styles.copy}>
          <h1 id="hero-title" className={styles.title}>
            Каждый&nbsp;— на&nbsp;своём месте
          </h1>
          <p className={styles.lead}>
            TeamWisdom поможет оценить ваших сотрудников, грамотно распределить
            ресурсы, подобрать персонал и наладить командную работу.
          </p>
          <div className={styles.actions}>
            {/* Demo links: point these at the real demo booking and tests pages. */}
            <Button href="#">
              Заказать демо
            </Button>
            <Button href="#" variant="secondary">
              Узнать больше
            </Button>
          </div>
        </div>

        <div className={styles.visual}>
          <RubiksCube className={styles.cube} viewHeight={5} />
        </div>
      </div>
    </section>
  )
}

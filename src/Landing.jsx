import { useCallback, useEffect, useRef, useState } from 'react';
import logo from '../docs/assets/awsome-logo-transparent.png';
import styles from './Landing.module.css';

const TRANSITION_DELAY = 4200;
const EXIT_DURATION = 560;

export default function Landing({ onComplete }) {
  const [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false);
  const exitTimerRef = useRef(null);

  const enterWorkspace = useCallback(() => {
    if (leavingRef.current) return;

    leavingRef.current = true;
    setLeaving(true);
    exitTimerRef.current = window.setTimeout(onComplete, EXIT_DURATION);
  }, [onComplete]);

  useEffect(() => {
    const timer = window.setTimeout(enterWorkspace, TRANSITION_DELAY);
    const handleKeyDown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        enterWorkspace();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      if (exitTimerRef.current) window.clearTimeout(exitTimerRef.current);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enterWorkspace]);

  return (
    <main className={`${styles.landing} ${leaving ? styles.leaving : ''}`} aria-label="awsome launch screen">
      <div className={styles.surface} aria-hidden="true">
        <span className={styles.surfaceGrid} />
        <span className={styles.surfaceLine} />
      </div>

      <div className={styles.page}>
        <header className={styles.topbar}>
          <span className={styles.topbarBrand}>awsome</span>
          <span className={styles.topbarDivider} aria-hidden="true" />
          <span className={styles.topbarLabel}>AWS topology explorer</span>
        </header>

        <div className={styles.layout}>
          <section className={styles.hero}>
            <p className={styles.eyebrow}>Cloud architecture workspace</p>
            <h1>See how your cloud connects.</h1>
            <p className={styles.copy}>
              Explore live AWS resources and relationships in one clear workspace.
            </p>
            <div className={styles.actions}>
              <button type="button" onClick={enterWorkspace} className={styles.enterButton}>
                <span>Open workspace</span>
                <span className={styles.enterArrow} aria-hidden="true">↗</span>
              </button>
              <span className={styles.autoNote}>Opening automatically</span>
            </div>
          </section>

          <div className={styles.logoStage} aria-hidden="true">
            <span className={styles.logoFrame} />
            <span className={styles.logoAxis} />
            <div className={styles.logoLockup}>
              <img className={styles.logo} src={logo} alt="" draggable="false" />
            </div>
            <span className={styles.logoBaseline} />
          </div>
        </div>

        <footer className={styles.footer}>
          <span>Press Enter to continue</span>
          <span className={styles.footerLine} aria-hidden="true" />
        </footer>
      </div>
    </main>
  );
}

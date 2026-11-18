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
      <div className={styles.page}>
        <header className={styles.topbar}>
          <span className={styles.topbarBrand}>awsome</span>
          <span className={styles.topbarLabel}>AWS topology explorer</span>
        </header>

        <div className={styles.layout}>
          <section className={styles.hero}>
            <h1>See how your cloud connects.</h1>
            <p className={styles.copy}>
              Explore live AWS resources and sketch your next architecture.
            </p>
            <div className={styles.actions}>
              <button type="button" onClick={enterWorkspace} className={styles.enterButton}>
                <span>Open workspace</span>
                <span className={styles.enterArrow} aria-hidden="true" />
              </button>
            </div>
          </section>

          <div className={styles.logoStage} aria-hidden="true">
            <img className={styles.logo} src={logo} alt="" draggable="false" />
          </div>
        </div>

        <footer className={styles.footer}>
          <span>Opening automatically. Press <kbd>Enter</kbd> to continue now.</span>
        </footer>
      </div>
    </main>
  );
}

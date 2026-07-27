import { useEffect, useState } from 'react';
import styles from './Landing.module.css';

const TRANSITION_DELAY = 3650;

function NetworkMark() {
  return <svg viewBox="0 0 72 72" fill="none" aria-hidden="true">
    <path className={styles.markLine} d="M16 23 36 13l20 10M16 23v24l20 12 20-12V23M16 47l20-12 20 12M36 13v22" />
    <circle className={styles.markNode} cx="16" cy="23" r="5" />
    <circle className={styles.markNode} cx="36" cy="13" r="5" />
    <circle className={styles.markNode} cx="56" cy="23" r="5" />
    <circle className={styles.markNode} cx="16" cy="47" r="5" />
    <circle className={styles.markNode} cx="36" cy="35" r="5" />
    <circle className={styles.markNode} cx="56" cy="47" r="5" />
    <circle className={styles.markNode} cx="36" cy="59" r="5" />
  </svg>;
}

export default function Landing({ onComplete }) {
  const [leaving, setLeaving] = useState(false);

  const enterWorkspace = () => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(onComplete, 500);
  };

  useEffect(() => {
    const timer = window.setTimeout(enterWorkspace, TRANSITION_DELAY);
    return () => window.clearTimeout(timer);
  }, []);

  return <main className={`${styles.landing} ${leaving ? styles.leaving : ''}`}>
    <div className={styles.ambient} aria-hidden="true"><span /><span /><span /></div>
    <div className={styles.grid} aria-hidden="true" />
    <div className={styles.content}>
      <div className={styles.brand}><span className={styles.brandMark}><NetworkMark /></span><span>Graphivo</span></div>
      <div className={styles.hero}>
        <p className={styles.eyebrow}><i /> AWS topology explorer</p>
        <h1>See how your cloud<br /><em>connects.</em></h1>
        <p className={styles.copy}>Turn AWS resources and relationships into a clear, explorable topology—without losing the bigger picture.</p>
      </div>
      <div className={styles.preview} aria-hidden="true">
        <span className={`${styles.previewLink} ${styles.linkOne}`} /><span className={`${styles.previewLink} ${styles.linkTwo}`} /><span className={`${styles.previewLink} ${styles.linkThree}`} /><span className={`${styles.previewLink} ${styles.linkFour}`} />
        <span className={`${styles.previewNode} ${styles.nodeVpc}`}>VPC</span><span className={`${styles.previewNode} ${styles.nodeSubnet}`}>SUBNET</span><span className={`${styles.previewNode} ${styles.nodeEc2}`}>EC2</span><span className={`${styles.previewNode} ${styles.nodeRds}`}>RDS</span>
      </div>
      <div className={styles.footer}><button type="button" onClick={enterWorkspace} className={styles.enterButton}>Enter workspace <span>→</span></button><span className={styles.loadingLabel}>Preparing your canvas<span className={styles.loadingDots}>...</span></span></div>
    </div>
  </main>;
}

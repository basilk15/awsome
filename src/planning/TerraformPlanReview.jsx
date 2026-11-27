import { useEffect, useId, useRef } from 'react';
import styles from '../../styles/Home.module.css';
import { serializeTerraformChangeSummary } from './terraformPlan.mjs';

const ACTION_LABELS = { delete: 'Deletions', replace: 'Replacements', update: 'Updates', create: 'Creations' };

export default function TerraformPlanReview({ review, onFinish }) {
  const dialogRef = useRef(null);
  const headingRef = useRef(null);
  const titleId = useId();
  const { name, changes, nodes, edges, incomplete } = review;
  const hasGraph = nodes.length > 0;
  const hasChanges = Object.values(changes).some(addresses => addresses.length > 0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog.open) dialog.showModal();
    headingRef.current.focus();
  }, []);

  const finish = (importGraph) => {
    dialogRef.current.close();
    onFinish(importGraph);
  };

  const exportChangeSummary = () => {
    const json = serializeTerraformChangeSummary(review);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'awsome-terraform-change-summary.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return <dialog ref={dialogRef} className={`${styles.importDialog} ${styles.terraformReview}`}
    aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); finish(false); }}>
    <h2 id={titleId} ref={headingRef} tabIndex={-1}>Review Terraform plan</h2>
    <p className={styles.importDestination}><strong>{name}</strong></p>
    <p>Planned changes to managed AWS resources</p>
    {incomplete ? <p>Terraform marked this plan incomplete.</p> : null}
    {hasChanges ? <div className={styles.terraformChanges} role="region" aria-label="Planned resource changes" tabIndex={0}>
      {Object.entries(ACTION_LABELS).map(([action, label]) => <div key={action} className={styles.terraformChangeGroup}>
        <h3>{label} <span>{changes[action].length}</span></h3>
        {changes[action].length ? <ul>
          {changes[action].map((address, index) => <li key={index}><code>{address}</code></li>)}
        </ul> : null}
      </div>)}
    </div> : <p className={styles.terraformImportNote}>No managed AWS deletions, replacements, updates, or creations.</p>}
    <p className={styles.terraformImportNote}>{hasGraph
      ? `Import ${nodes.length} ${nodes.length === 1 ? 'service' : 'services'} and ${edges.length} ${edges.length === 1 ? 'connection' : 'connections'} as a new architecture.`
      : 'The proposed architecture has no supported AWS services to import.'}</p>
    <div className={`${styles.dialogActions} ${styles.terraformActions}`}>
      <button className={styles.secondaryBtn} type="button" onClick={exportChangeSummary}>Export change summary</button>
      <button className={styles.secondaryBtn} type="button" onClick={() => finish(false)}>{hasGraph ? 'Cancel' : 'Close'}</button>
      {hasGraph ? <button className={styles.primaryBtn} type="button" onClick={() => finish(true)}>Import architecture</button> : null}
    </div>
  </dialog>;
}

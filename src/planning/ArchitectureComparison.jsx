import { useId, useLayoutEffect, useMemo, useState } from 'react';
import styles from '../../styles/Home.module.css';
import { compareArchitectures } from './architectureComparison.mjs';
import { summaryFromDocument } from './documentLibrary.mjs';

function collapseLabelWhitespace(label) {
  // Native option text collapses ASCII whitespace.
  return label.replace(/[ \t\n\f\r]+/g, ' ').trim();
}

function getPlanLabels(plans) {
  const nameCounts = new Map();
  const labelCounts = new Map();
  const labels = new Map();

  for (const { name } of plans) {
    const key = collapseLabelWhitespace(name);
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }

  for (const { id, name, nodeCount, edgeCount, updatedAt } of plans) {
    const displayName = collapseLabelWhitespace(name);
    let label = displayName;
    if (nameCounts.get(displayName) > 1) {
      const services = `${nodeCount} service${nodeCount === 1 ? '' : 's'}`;
      const connections = `${edgeCount} connection${edgeCount === 1 ? '' : 's'}`;
      label = collapseLabelWhitespace(`${displayName} · ${services} · ${connections} · Edited ${new Date(updatedAt).toLocaleString()}`);
    }
    labels.set(id, label);
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }

  for (const [id, label] of labels) {
    if (labelCounts.get(label) > 1) labels.set(id, `${label} · ID ${encodeURIComponent(id)}`);
  }

  return labels;
}

function endpointName(endpoint, other) {
  return other && endpoint.id !== other.id && endpoint.name === other.name
    ? `${endpoint.name} (${endpoint.id})`
    : endpoint.name;
}

function ItemDetails({ item, other, serviceCatalog }) {
  if (item.serviceKey) {
    return <>{item.name} · {serviceCatalog.get(item.serviceKey)?.name ?? item.serviceKey}</>;
  }
  return <>
    {endpointName(item.source, other?.source)} → {endpointName(item.target, other?.target)}
    {' · '}{item.label ? `“${item.label}”` : 'Unlabeled'}
  </>;
}

export default function ArchitectureComparison({ dialogRef, current, summaries, readSavedArchitecture, serviceCatalog, onClose }) {
  const titleId = useId();
  const descriptionId = useId();
  const [selection, setSelection] = useState(null);
  const [readSummaries, setReadSummaries] = useState(() => new Map());
  const options = summaries.filter(({ id }) => id !== current.id)
    .map((summary) => readSummaries.get(summary.id) ?? summary);
  const labels = getPlanLabels([...options, {
    ...summaryFromDocument(current),
    updatedAt: summaries.find(({ id }) => id === current.id)?.updatedAt ?? current.updatedAt
  }]);
  const baseline = selection?.document;
  const comparison = useMemo(() => baseline ? compareArchitectures(baseline, current) : null, [baseline, current]);
  const groups = comparison ? [
    ['Added services', comparison.services.added],
    ['Removed services', comparison.services.removed],
    ['Changed services', comparison.services.changed],
    ['Added connections', comparison.connections.added],
    ['Removed connections', comparison.connections.removed],
    ['Changed connections', comparison.connections.changed]
  ] : [];
  const changeCount = groups.reduce((total, [, items]) => total + items.length, 0);

  useLayoutEffect(() => {
    if (!dialogRef.current.open) dialogRef.current.showModal();
  }, [dialogRef]);

  const dismiss = () => {
    dialogRef.current.close();
    onClose();
  };

  const selectBaseline = (event) => {
    const option = options.find(({ id }) => id === event.target.value);
    if (!option) {
      setSelection(null);
      return;
    }
    const loaded = readSavedArchitecture(option.id);
    if (loaded.document) {
      const summary = summaryFromDocument(loaded.document);
      setReadSummaries((previous) => new Map(previous).set(summary.id, summary));
    }
    const error = loaded.error
      ? `Could not read “${option.name}”.`
      : `“${option.name}” is no longer available in the architecture library.`;
    setSelection({ id: option.id, document: loaded.document, error: loaded.document ? null : error });
  };

  return <dialog ref={dialogRef} className={`${styles.importDialog} ${styles.architectureComparison}`}
    aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={(event) => {
      event.preventDefault();
      dismiss();
    }}>
    <h2 id={titleId}>Compare architecture</h2>
    <p id={descriptionId}>Services and connections match by ID. Duplicating a plan keeps its IDs. Items drawn separately usually appear as additions and removals.</p>
    {options.length ? <label className={styles.comparisonSelect}>
      <span>Saved baseline</span>
      <select value={selection?.id ?? ''} onChange={selectBaseline}>
        <option value="">Choose an architecture</option>
        {options.map(({ id }) => <option key={id} value={id}>{labels.get(id)}</option>)}
      </select>
    </label> : <p className={styles.comparisonStatus}>No other saved architectures to compare.</p>}
    <dl className={styles.comparisonPlans}>
      {baseline ? <div><dt>Baseline</dt><dd>{labels.get(selection.id) ?? collapseLabelWhitespace(baseline.name)}</dd></div> : null}
      <div><dt>Current</dt><dd>{labels.get(current.id)}</dd></div>
    </dl>
    {selection?.error ? <div className={styles.comparisonError} role="alert">{selection.error} Select another saved architecture.</div> : null}
    {comparison ? <p className={styles.comparisonStatus} role="status">
      {changeCount ? `${changeCount} topology ${changeCount === 1 ? 'change' : 'changes'}` : 'No topology changes.'}
    </p> : null}
    {changeCount > 0 ? <div key={baseline.id} className={styles.comparisonResults} tabIndex={0} role="region" aria-label="Topology changes">
      {groups.filter(([, items]) => items.length).map(([title, items]) => <section className={styles.comparisonGroup} key={title}>
        <h3>{title} <span>({items.length})</span></h3>
        <ul>{items.map((item) => <li key={item.before?.id ?? item.id}>
          {item.before ? <dl className={styles.comparisonItemValues}>
            <div><dt>Before</dt><dd><ItemDetails item={item.before} other={item.after} serviceCatalog={serviceCatalog} /></dd></div>
            <div><dt>After</dt><dd><ItemDetails item={item.after} other={item.before} serviceCatalog={serviceCatalog} /></dd></div>
          </dl> : <ItemDetails item={item} serviceCatalog={serviceCatalog} />}
        </li>)}</ul>
      </section>)}
    </div> : null}
    <div className={styles.dialogActions}>
      <button className={styles.secondaryBtn} type="button" onClick={dismiss}>Close</button>
    </div>
  </dialog>;
}

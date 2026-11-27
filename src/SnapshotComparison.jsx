import { useMemo, useState } from 'react';
import { snapshotChangeCount, snapshotChangeFields, snapshotUncertainCount } from './liveSnapshots.mjs';
import styles from '../styles/Home.module.css';

const PAGE_SIZE = 20;
const changeKinds = ['added', 'removed', 'changed'];

function captureDate(capturedAt) {
  const isMilliseconds = typeof capturedAt === 'number' || (typeof capturedAt === 'string' && /^\+?\d+$/.test(capturedAt));
  const date = new Date(isMilliseconds ? Number(capturedAt) : NaN);
  return Number.isNaN(date.getTime()) ? null : date;
}

function SnapshotValue({ value }) {
  if (value === undefined) return <i>Missing</i>;
  return typeof value === 'string' && value.length ? value : JSON.stringify(value, null, 2);
}

function ChangeRecord({ kind, item }) {
  const [open, setOpen] = useState(false);
  const before = kind === 'changed' ? item.before : kind === 'removed' ? item : undefined;
  const after = kind === 'changed' ? item.after : kind === 'added' ? item : undefined;
  const record = after || before;
  const fields = open ? snapshotChangeFields(before, after) : [];
  return <details className={styles.changeRecord} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>
      <span><strong>{record.label || record.id}</strong>{record.label && record.label !== record.id ? <small>{record.id}</small> : null}</span>
    </summary>
    {open ? <dl className={styles.changeFields}>{fields.map((field) => <div key={field.key}>
      <dt>{field.label}</dt>
      {kind === 'changed' ? <dd className={styles.changeValues}>
        <div><small>Before</small><span><SnapshotValue value={field.before} /></span></div>
        <div><small>After</small><span><SnapshotValue value={field.after} /></span></div>
      </dd> : <dd><SnapshotValue value={kind === 'added' ? field.after : field.before} /></dd>}
    </div>)}</dl> : null}
  </details>;
}

function ChangeGroup({ category, kind, items }) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  return <details className={styles.changeGroup} data-change={kind} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><span>{kind[0].toUpperCase() + kind.slice(1)} {category}</span><span className={styles.changeCount}>{items.length}</span></summary>
    {open ? <div className={styles.changeRecords}>
      {items.slice(0, limit).map((item) => <ChangeRecord key={(item.after || item).id} kind={kind} item={item} />)}
      {items.length > limit ? <button type="button" className={styles.secondaryBtn} onClick={() => setLimit(limit + PAGE_SIZE)}>
        Show {Math.min(PAGE_SIZE, items.length - limit)} more
      </button> : null}
    </div> : null}
  </details>;
}

export default function SnapshotComparison({ comparison, headingRef, onClose }) {
  const { earlier, later, diff } = comparison;
  const earlierDate = captureDate(earlier.capturedAt);
  const laterDate = captureDate(later.capturedAt);
  const [query, setQuery] = useState('');
  const words = query.trim().toLowerCase();
  const groups = useMemo(() => {
    const terms = words.split(/\s+/).filter(Boolean);
    return Object.entries({ resources: diff.nodes, relationships: diff.edges }).flatMap(([category, changes]) =>
      changeKinds.map((kind) => ({
        category, kind,
        items: terms.length ? changes[kind].filter((item) => {
          const records = kind === 'changed' ? [item.before, item.after] : [item];
          const text = records.flatMap((r) => [r.label, r.id, r.resourceId, r.region, r.type, r.source, r.target]).join(' ').toLowerCase();
          return terms.every((term) => text.includes(term));
        }) : changes[kind]
      })).filter(({ items }) => items.length));
  }, [diff, words]);
  const matches = groups.reduce((sum, group) => sum + group.items.length, 0);
  const total = snapshotChangeCount(diff);
  const uncertain = snapshotUncertainCount(diff);
  function exportReport() {
    const describeScan = ({ id, profile, region, graph }, date) => ({
      id: id || null,
      profile,
      region,
      capturedAt: date?.toISOString() ?? null,
      warnings: graph?.warnings || []
    });
    const report = {
      version: 1,
      earlier: describeScan(earlier, earlierDate),
      later: describeScan(later, laterDate),
      filter: query.trim(),
      confirmedTotal: total,
      confirmedIncluded: matches,
      excludedUncertain: { resources: diff.nodes.uncertain.length, relationships: diff.edges.uncertain.length },
      changes: groups
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'awsome-snapshot-comparison.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return <section className={styles.comparisonPanel} aria-labelledby="scan-comparison-title">
    <header className={styles.comparisonHeader}>
      <h2 ref={headingRef} id="scan-comparison-title" tabIndex={-1}>Changes between scans</h2>
      <button type="button" className={`${styles.closeButton} ${styles.comparisonClose}`} onClick={onClose} aria-label="Close comparison" title="Close comparison">
        <span aria-hidden="true">×</span>
      </button>
    </header>
    <p>{earlier.profile} / {earlier.region}</p>
    <dl className={styles.comparisonDates}>
      <div><dt>Earlier scan</dt><dd>{earlierDate?.toLocaleString() ?? 'Unknown capture date'}</dd></div>
      <div><dt>Later scan</dt><dd>{laterDate?.toLocaleString() ?? 'Unknown capture date'}</dd></div>
    </dl>
    {uncertain || earlier.graph?.warnings?.length || later.graph?.warnings?.length ? <p className={styles.comparisonCaution}>
      Inventory was incomplete in at least one scan.
      {uncertain ? ` ${uncertain} ${uncertain === 1 ? 'entry is' : 'entries are'} excluded from the change counts.` : ''}
    </p> : null}
    {total ? <>
      <label className={styles.changeSearch}>Filter changes
        <input type="search" placeholder="Name, ID, type, or region" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <p role="status" className={styles.comparisonTotal}>{words ? `${matches} of ${total}` : total} confirmed {total === 1 ? 'change' : 'changes'}</p>
      {groups.map(({ category, kind, items }) =>
        <ChangeGroup key={`${category}-${kind}`} category={category} kind={kind} items={items} />)}
      {!matches ? <button type="button" className={styles.secondaryBtn} onClick={() => setQuery('')}>Clear filter</button> : null}
    </> : <p>No confirmed resource or relationship changes.</p>}
    <button className={styles.secondaryBtn} type="button" onClick={exportReport}>
      {words ? 'Export filtered report' : 'Export comparison'} (JSON)
    </button>
  </section>;
}

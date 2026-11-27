import { useMemo, useState } from 'react';
import { resourceInventoryRows } from './resourceInventory.mjs';
import { indexTopology, reviewPlan, simulateRemoval, tracePath } from './topologyAnalysis.mjs';
import styles from '../styles/Home.module.css';

const views = [
  ['path', 'Trace a path'],
  ['removal', 'Simulate removal'],
  ['plan', 'Review plan coverage']
];

function ResourcePicker({ label, value, rows, onChange }) {
  return <label className={styles.analysisField}>{label}
    <select value={value} onChange={event => onChange(event.target.value)}>
      <option value="">Choose a resource</option>
      {rows.map(row => <option key={row.graphId} value={row.graphId}>
        {[row.name, row.name !== row.id && row.id, row.region].filter(Boolean).join(' · ')}
      </option>)}
    </select>
  </label>;
}

function ResultList({ title, items }) {
  const [limit, setLimit] = useState(25);
  return <details className={styles.analysisGroup}><summary>{title} <strong>{items.length}</strong></summary>
    <ul>{items.slice(0, limit).map(item => <li key={item.graphId || item.id}>{item.name}
      <small>{[item.resourceId || item.id, item.region].filter(Boolean).join(' · ')}</small>
    </li>)}</ul>
    {items.length > limit && <button className={styles.secondaryBtn} onClick={() => setLimit(limit + 25)}>Show more</button>}
  </details>;
}

export default function TopologyAnalysis({ graph, context, regions, services, plan, initialId, onPlan, planDisabled, edgeLabel }) {
  const [view, setView] = useState('path');
  const [start, setStart] = useState(initialId || '');
  const [end, setEnd] = useState('');
  const [directed, setDirected] = useState(false);
  const rows = useMemo(() => resourceInventoryRows(graph.nodes, context, services)
    .sort((a, b) => a.name.localeCompare(b.name)), [graph, context, services]);
  const byId = useMemo(() => new Map(rows.map(row => [row.graphId, row])), [rows]);
  const index = useMemo(() => indexTopology(graph), [graph]);
  const ready = start && end && start !== end;
  const path = useMemo(() => ready && view === 'path' ? tracePath(index, start, end, directed) : null,
    [index, start, end, directed, ready, view]);
  const removal = useMemo(() => ready && view === 'removal' ? simulateRemoval(index, start, end) : null,
    [index, start, end, ready, view]);
  const coverage = useMemo(() => view === 'plan' ? reviewPlan(rows, plan, context.profile, regions) : null,
    [view, rows, plan, context, regions]);
  function openPath() {
    const ids = new Set([start, ...path.map(step => step.id)]);
    onPlan({ nodes: graph.nodes.filter(({ data }) => ids.has(data.id)), edges: path.map(step => step.edge) });
  }
  return <section className={styles.analysis} aria-label="Topology analysis">
    <header><h2>Topology analysis</h2><p>{context.profile} · {regions.join(', ')} · {rows.length} scanned resources</p></header>
    <nav aria-label="Analysis tools">{views.map(([key, title]) => <button key={key} type="button"
      aria-pressed={view === key} onClick={() => setView(key)}>{title}</button>)}</nav>
    {graph.warnings?.length > 0 && <p className={styles.comparisonCaution}>This scan has incomplete inventory. Some resources and connections may be missing.</p>}
    {view !== 'plan' ? <>
      <p>{view === 'path' ? 'Find the shortest chain of recorded relationships between two resources.' :
        'Remove one resource from a local simulation and see which others lose their connection to the anchor. This measures graph connectivity, not traffic or service availability.'}</p>
      <div className={styles.analysisPickers}>
        <ResourcePicker label={view === 'path' ? 'Starting resource' : 'Anchor resource'} rows={rows} value={start} onChange={setStart}/>
        <ResourcePicker label={view === 'path' ? 'Destination' : 'Resource to remove'} rows={rows} value={end} onChange={setEnd}/>
      </div>
      {view === 'path' && <label><input type="checkbox" checked={directed} onChange={event => setDirected(event.target.checked)}/> Follow edge direction only</label>}
      {start && start === end && <p role="status">Choose two different resources.</p>}
      {ready && view === 'path' && (path ? <>
        <h3>{path.length} relationship{path.length === 1 ? '' : 's'} on this path</h3>
        <ol className={styles.pathSteps}><li>{byId.get(start).name}</li>{path.map(step =>
          <li key={step.id}><small>{step.forward ? '→' : '←'} {edgeLabel(step.edge).data.fullLabel}</small>{byId.get(step.id).name}</li>)}</ol>
        <button type="button" className={styles.secondaryBtn} disabled={planDisabled} onClick={openPath}>Open path in planner</button>
      </> : <p role="status">No matching path in this scan.</p>)}
      {ready && view === 'removal' && (removal ? <>
        <h3>{removal.detached.length} {removal.detached.length === 1 ? 'resource loses its' : 'resources lose their'} connection</h3>
        {removal.detached.length + removal.retained > 0 && <meter aria-label="Share of remaining resources disconnected" min={0}
          max={removal.detached.length + removal.retained} value={removal.detached.length}/>}
        <p>{removal.retained} other {removal.retained === 1 ? 'resource stays' : 'resources stay'} connected to {byId.get(start).name}.</p>
        {removal.detached.length > 0 && <ResultList title="Disconnected resources" items={removal.detached.map(id => byId.get(id))}/>}
      </> : <p role="status">The selected resources were already disconnected in this scan.</p>)}
    </> : <>
      <h3>{plan.name}</h3><p>{rows.length - coverage.unplanned.length} of {rows.length} scanned resources are linked to this plan. Matches use imported resource identity, profile, and region.</p>
      {rows.length > 0 && <meter aria-label="Scanned resources represented in plan" min={0} max={rows.length} value={rows.length - coverage.unplanned.length}/>}
      <ResultList title="Scanned resources outside the plan" items={coverage.unplanned}/>
      <ResultList title="Imported resources unseen in this scan" items={coverage.unseen}/>
      <ResultList title="Locally designed services" items={coverage.local}/>
      {coverage.unplanned.length > 0 && <button type="button" className={styles.secondaryBtn} disabled={planDisabled} onClick={() => onPlan(graph)}>Open scan in planner</button>}
    </>}
  </section>;
}

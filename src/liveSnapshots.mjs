function byId(items) {
  return new Map((Array.isArray(items) ? items : [])
    .filter((item) => typeof item?.data?.id === 'string' && item.data.id)
    .map((item) => [item.data.id, item.data]));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function regionOf(data, graph) {
  if (typeof data?.region === 'string' && data.region) return data.region;
  const id = data?.id || data?.source || '';
  const divider = id.indexOf('::');
  if (divider > 0) return id.slice(0, divider);
  return graph?.regions?.length === 1 ? graph.regions[0] : '';
}

function typeOf(data) {
  if (typeof data?.type === 'string' && data.type) return data.type;
  const rawId = String(data?.id || '').split('::').at(-1);
  return rawId.split('-')[0];
}

function coverageFor(graph, region) {
  const coverage = Array.isArray(graph?.coverage) ? graph.coverage : [];
  if (!coverage.length) return Array.isArray(graph?.warnings) && graph.warnings.length ? { failed: true } : null;
  return coverage.find((item) => item.region === region)
    || (coverage.length === 1 ? coverage[0] : { failed: true });
}

function comparable(graph, region, type, edge) {
  const coverage = coverageFor(graph, region);
  if (!coverage) return true;
  if (coverage.failed || (edge && coverage.incompleteEdges)) return false;
  const unavailable = coverage.unavailableTypes || [];
  return !unavailable.includes('*') && !unavailable.includes(type) && !(unavailable.length && !type);
}

function itemRegions(data, graph, kind) {
  if (kind !== 'edges') return [regionOf(data, graph)];
  const endpoints = [data.source, data.target].filter((id) => typeof id === 'string' && id);
  return [...new Set((endpoints.length ? endpoints : [data.id])
    .map((id) => regionOf({ id }, graph)))];
}

function compareItems(previousGraph, currentGraph, kind) {
  const before = byId(previousGraph?.[kind]);
  const after = byId(currentGraph?.[kind]);
  const added = [];
  const removed = [];
  const changed = [];
  const uncertain = [];
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const oldData = before.get(id);
    const newData = after.get(id);
    const data = newData || oldData;
    const regions = itemRegions(data, newData ? currentGraph : previousGraph, kind);
    const type = kind === 'edges' ? '' : typeOf(data);
    const edge = kind === 'edges';
    if (regions.some((region) => !comparable(previousGraph, region, type, edge) || !comparable(currentGraph, region, type, edge))) {
      uncertain.push(data);
    } else if (!oldData) added.push(newData);
    else if (!newData) removed.push(oldData);
    else if (JSON.stringify(stableValue(oldData)) !== JSON.stringify(stableValue(newData))) changed.push({ before: oldData, after: newData });
  }
  return { added, removed, changed, uncertain };
}

export function compareTopologySnapshots(previous, current) {
  return {
    nodes: compareItems(previous, current, 'nodes'),
    edges: compareItems(previous, current, 'edges')
  };
}

export function snapshotChangeCount(diff) {
  return ['nodes', 'edges'].reduce((total, kind) =>
    total + diff[kind].added.length + diff[kind].removed.length + diff[kind].changed.length, 0);
}

export function snapshotUncertainCount(diff) {
  return diff.nodes.uncertain.length + diff.edges.uncertain.length;
}

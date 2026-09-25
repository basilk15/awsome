function byId(items) {
  return new Map((Array.isArray(items) ? items : [])
    .filter((item) => typeof item?.data?.id === 'string' && item.data.id)
    .map((item) => [item.data.id, item.data]));
}

function compareItems(previous, current) {
  const before = byId(previous);
  const after = byId(current);
  const added = [];
  const removed = [];
  const changed = [];
  for (const [id, data] of after) {
    if (!before.has(id)) added.push(data);
    else if (JSON.stringify(data) !== JSON.stringify(before.get(id))) changed.push({ before: before.get(id), after: data });
  }
  for (const [id, data] of before) if (!after.has(id)) removed.push(data);
  return { added, removed, changed };
}

export function compareTopologySnapshots(previous, current) {
  return {
    nodes: compareItems(previous?.nodes, current?.nodes),
    edges: compareItems(previous?.edges, current?.edges)
  };
}

export function snapshotChangeCount(diff) {
  return ['nodes', 'edges'].reduce((total, kind) =>
    total + diff[kind].added.length + diff[kind].removed.length + diff[kind].changed.length, 0);
}

function describeTopology({ nodes, edges }) {
  const services = nodes.map(({ id, name, serviceKey }) => ({ id, name, serviceKey }));
  const namesById = new Map(services.map(({ id, name }) => [id, name]));
  const endpoint = (id) => ({ id, name: namesById.get(id) ?? id });
  const connections = edges.map(({ id, source, target, label = '' }) => ({
    id,
    source: endpoint(source),
    target: endpoint(target),
    label
  }));
  return { services, connections };
}

function compareById(baseline, current, differs) {
  const baselineById = new Map(baseline.map((item) => [item.id, item]));
  const currentIds = new Set(current.map((item) => item.id));
  const added = [];
  const changed = [];
  for (const after of current) {
    const before = baselineById.get(after.id);
    if (!before) added.push(after);
    else if (differs(before, after)) changed.push({ before, after });
  }
  const removed = baseline.filter((item) => !currentIds.has(item.id));
  return { added, removed, changed };
}

export function compareArchitectures(baseline, current) {
  const before = describeTopology(baseline);
  const after = describeTopology(current);
  return {
    services: compareById(before.services, after.services, (a, b) => a.name !== b.name || a.serviceKey !== b.serviceKey),
    connections: compareById(before.connections, after.connections, (a, b) => (
      a.source.id !== b.source.id || a.target.id !== b.target.id || a.label !== b.label
    ))
  };
}

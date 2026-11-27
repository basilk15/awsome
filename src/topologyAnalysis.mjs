import { splitLiveGraphId } from './liveRegions.mjs';
import { IMPORTED_FROM_LIVE } from './planning/liveTopology.mjs';

export function indexTopology(graph) {
  const neighbors = new Map(graph.nodes.map(({ data }) => [data.id, []]));
  for (const edge of graph.edges) {
    const { source, target } = edge.data;
    if (!neighbors.has(source) || !neighbors.has(target)) continue;
    neighbors.get(source).push({ id: target, edge, forward: true });
    neighbors.get(target).push({ id: source, edge, forward: false });
  }
  return neighbors;
}

function traverse(index, start, { directed, excluded, end } = {}) {
  const previous = new Map();
  if (!index.has(start) || start === excluded) return previous;
  const queue = [start];
  previous.set(start, null);
  for (let i = 0; i < queue.length; i++) {
    const from = queue[i];
    if (from === end) break;
    for (const step of index.get(from)) {
      if (step.id === excluded || previous.has(step.id) || (directed && !step.forward)) continue;
      previous.set(step.id, { ...step, from });
      queue.push(step.id);
    }
  }
  return previous;
}

export function tracePath(index, start, end, directed) {
  const previous = traverse(index, start, { end, directed });
  if (!previous.has(end)) return null;
  const steps = [];
  for (let id = end; id !== start;) {
    const step = previous.get(id);
    steps.push(step);
    id = step.from;
  }
  return steps.reverse();
}

export function simulateRemoval(index, anchor, excluded) {
  if (anchor === excluded || !index.has(excluded)) return null;
  const before = traverse(index, anchor);
  if (!before.has(excluded)) return null;
  const after = traverse(index, anchor, { excluded });
  return {
    detached: [...before.keys()].filter(id => id !== excluded && !after.has(id)),
    retained: after.size - 1
  };
}

export function reviewPlan(rows, plan, profile, regions) {
  const identity = (region, id) => JSON.stringify([region, splitLiveGraphId(id || '').localId]);
  const live = new Set(rows.map(row => identity(row.region, row.graphId)));
  const imported = plan.nodes.filter(node => node.provenance === IMPORTED_FROM_LIVE
    && node.profile === profile && regions.includes(node.region));
  const represented = new Set(imported.map(node => identity(node.region, node.liveNodeId)));
  return {
    unplanned: rows.filter(row => !represented.has(identity(row.region, row.graphId))),
    unseen: imported.filter(node => !live.has(identity(node.region, node.liveNodeId))),
    local: plan.nodes.filter(node => !node.provenance)
  };
}

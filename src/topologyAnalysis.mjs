import { splitLiveGraphId } from './liveRegions.mjs';
import { IMPORTED_FROM_LIVE } from './planning/liveTopology.mjs';
import { MAX_PLANNING_RESOURCE_ID_LENGTH } from './planningDocument.mjs';

const LEGACY_LIVE_ID_LENGTH = 320;
const TARGET_REGISTRATION_ID = /^(target_(?:ec2|ip|lambda|alb)-.+-(?:default|\d+))-\d+$/;

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

const identity = (region, id) => JSON.stringify([region, id]);
const localId = id => splitLiveGraphId(id || '').localId;
const rowIdentity = row => identity(row.region, localId(row.graphId));
const nodeIdentity = node => identity(node.region, localId(node.liveNodeId));

function registrationIdentity(region, local) {
  // Native target registration IDs end in an enumeration index after the port.
  const match = TARGET_REGISTRATION_ID.exec(local);
  return match && identity(region, match[1]);
}

function legacyIdentity(node) {
  if (node.liveNodeId?.length === LEGACY_LIVE_ID_LENGTH) return identity(node.region, node.liveNodeId);
}

function indexCandidate(index, key, candidate) {
  const group = index.get(key);
  if (group) group.push(candidate);
  else index.set(key, [candidate]);
}

function matchUniqueCandidates(imported, candidatesFor, matchedNodes, matchedRows) {
  const claims = new Map();
  for (const node of imported) {
    if (matchedNodes.has(node)) continue;
    const candidates = candidatesFor(node);
    if (candidates?.length === 1 && !matchedRows.has(candidates[0])) {
      indexCandidate(claims, candidates[0], node);
    }
  }
  for (const [row, nodes] of claims) {
    if (nodes.length !== 1) continue;
    matchedRows.add(row);
    matchedNodes.add(nodes[0]);
  }
}

export function reviewPlan(rows, plan, profile, regions) {
  const live = new Set(rows.map(rowIdentity));
  const imported = plan.nodes.filter(node => node.provenance === IMPORTED_FROM_LIVE
    && node.profile === profile && regions.includes(node.region));
  const represented = new Set(imported.map(nodeIdentity));
  const matchedRows = new Set(rows.filter(row => represented.has(rowIdentity(row))));
  const matchedNodes = new Set(imported.filter(node => live.has(nodeIdentity(node))));

  const registrations = new Map();
  const legacyPrefixes = new Map();
  for (const row of rows) {
    const local = localId(row.graphId);
    const key = registrationIdentity(row.region, local);
    if (key && !matchedRows.has(row)) indexCandidate(registrations, key, row);
    // Old plans clipped either unqualified or region-qualified IDs before saving.
    for (const id of [local, `${row.region}::${local}`]) {
      if (id.length > LEGACY_LIVE_ID_LENGTH) {
        indexCandidate(legacyPrefixes, identity(row.region, id.slice(0, LEGACY_LIVE_ID_LENGTH)), row);
      }
    }
  }
  matchUniqueCandidates(imported, node => {
    if (legacyPrefixes.has(legacyIdentity(node))) return;
    return registrations.get(registrationIdentity(node.region, localId(node.liveNodeId)));
  }, matchedNodes, matchedRows);
  matchUniqueCandidates(imported, node => {
    const candidates = legacyPrefixes.get(legacyIdentity(node));
    if (candidates?.length !== 1 || !node.resourceId) return candidates;
    const [row] = candidates;
    if (typeof row.id === 'string' && row.id.trim().slice(0, MAX_PLANNING_RESOURCE_ID_LENGTH) === node.resourceId) {
      return candidates;
    }
  }, matchedNodes, matchedRows);

  return {
    unplanned: rows.filter(row => !matchedRows.has(row)),
    unseen: imported.filter(node => !matchedNodes.has(node)),
    local: plan.nodes.filter(node => !node.provenance)
  };
}

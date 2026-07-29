export const PLANNING_CANVAS_SIZE = 3000;
export const DEFAULT_NODE_WIDTH = 168;
export const DEFAULT_NODE_HEIGHT = 84;
export const IMPORTED_FROM_LIVE = 'imported-from-live';

export const LIVE_SERVICE_DEFINITIONS = {
  vpc: { category: 'Networking', name: 'Amazon VPC', key: 'vpc', color: '#7b3fe4' },
  subnet: { category: 'Networking', name: 'VPC Subnet', key: 'subnet', color: '#8f67d8' },
  ec2: { category: 'Compute', name: 'Amazon EC2', key: 'ec2', color: '#ec7211' },
  rds: { category: 'Database', name: 'Amazon RDS', key: 'rds', color: '#3b48cc' },
  sg: { category: 'Security', name: 'Security Group', key: 'sg', color: '#64748b' },
  igw: { category: 'Networking', name: 'Internet Gateway', key: 'igw', color: '#2f855a' },
  nat: { category: 'Networking', name: 'NAT Gateway', key: 'nat', color: '#0f9f9a' },
  route_table: { category: 'Networking', name: 'Route Table', key: 'route_table', color: '#475569' },
  alb: { category: 'Networking', name: 'Application Load Balancer', key: 'alb', color: '#8c4fff' },
  nlb: { category: 'Networking', name: 'Network Load Balancer', key: 'nlb', color: '#5b5fc7' }
};

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function typeFromId(id) {
  const separator = id.indexOf('-');
  return separator > 0 ? id.slice(0, separator) : '';
}

function resourceIdFromLiveId(id, type) {
  const prefix = `${type}-`;
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

function uniqueId(base, usedIds) {
  if (!usedIds.has(base)) {
    usedIds.add(base);
    return base;
  }
  let suffix = 2;
  while (usedIds.has(`${base}:${suffix}`)) suffix += 1;
  const id = `${base}:${suffix}`;
  usedIds.add(id);
  return id;
}

function normalizeLiveNodes(graph, context) {
  const candidates = (Array.isArray(graph?.nodes) ? graph.nodes : []).flatMap((node) => {
    const data = node && typeof node.data === 'object' ? node.data : null;
    const liveNodeId = cleanString(data?.id);
    const liveResourceType = cleanString(data?.type) || typeFromId(liveNodeId);
    if (!liveNodeId || !LIVE_SERVICE_DEFINITIONS[liveResourceType]) return [];
    const resourceId = cleanString(data.resourceId) || resourceIdFromLiveId(liveNodeId, liveResourceType);
    if (!resourceId) return [];
    const resourceLabel = cleanString(data.label) || resourceId;
    return [{
      liveNodeId,
      liveResourceType,
      resourceId,
      resourceLabel,
      profile: cleanString(context?.profile) || 'default',
      region: cleanString(context?.region) || 'unknown'
    }];
  });

  candidates.sort((left, right) =>
    left.liveNodeId.localeCompare(right.liveNodeId)
    || left.liveResourceType.localeCompare(right.liveResourceType)
    || left.resourceLabel.localeCompare(right.resourceLabel)
  );

  const seen = new Set();
  return candidates.filter((node) => {
    if (seen.has(node.liveNodeId)) return false;
    seen.add(node.liveNodeId);
    return true;
  });
}

function normalizeLiveEdges(graph, nodeIdMap, context) {
  const candidates = (Array.isArray(graph?.edges) ? graph.edges : []).flatMap((edge, index) => {
    const data = edge && typeof edge.data === 'object' ? edge.data : null;
    const liveSource = cleanString(data?.source);
    const liveTarget = cleanString(data?.target);
    if (!nodeIdMap.has(liveSource) || !nodeIdMap.has(liveTarget)) return [];
    const relationshipLabel = cleanString(data?.label) || 'AWS relationship';
    const sourceEdgeId = cleanString(data?.id) || `${liveSource}->${liveTarget}:${relationshipLabel}`;
    return [{
      sourceEdgeId,
      source: nodeIdMap.get(liveSource),
      target: nodeIdMap.get(liveTarget),
      label: relationshipLabel,
      profile: cleanString(context?.profile) || 'default',
      region: cleanString(context?.region) || 'unknown',
      inputIndex: index
    }];
  });

  candidates.sort((left, right) =>
    left.sourceEdgeId.localeCompare(right.sourceEdgeId)
    || left.source.localeCompare(right.source)
    || left.target.localeCompare(right.target)
    || left.label.localeCompare(right.label)
    || left.inputIndex - right.inputIndex
  );

  const seen = new Set();
  return candidates.filter((edge) => {
    const signature = `${edge.sourceEdgeId}\u0000${edge.source}\u0000${edge.target}\u0000${edge.label}`;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

export function layoutPlanningNodes(nodes, edges, canvasSize = PLANNING_CANVAS_SIZE) {
  const orderedNodes = [...nodes].sort((left, right) => left.id.localeCompare(right.id));
  const nodeIds = new Set(orderedNodes.map((node) => node.id));
  const outgoing = new Map(orderedNodes.map((node) => [node.id, []]));
  const indegree = new Map(orderedNodes.map((node) => [node.id, 0]));

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    outgoing.get(edge.source).push(edge.target);
    indegree.set(edge.target, indegree.get(edge.target) + 1);
  }
  for (const targets of outgoing.values()) targets.sort();

  const ranks = new Map(orderedNodes.map((node) => [node.id, 0]));
  const queue = orderedNodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  const processed = new Set();
  while (queue.length) {
    queue.sort();
    const id = queue.shift();
    if (processed.has(id)) continue;
    processed.add(id);
    for (const target of outgoing.get(id)) {
      ranks.set(target, Math.max(ranks.get(target), ranks.get(id) + 1));
      indegree.set(target, indegree.get(target) - 1);
      if (indegree.get(target) === 0) queue.push(target);
    }
  }

  // Cycles have no topological root. Keep them deterministic in a final layer.
  const highestRank = Math.max(0, ...ranks.values());
  orderedNodes.filter((node) => !processed.has(node.id)).forEach((node) => {
    ranks.set(node.id, highestRank + 1);
  });

  const layers = new Map();
  for (const node of orderedNodes) {
    const rank = ranks.get(node.id);
    if (!layers.has(rank)) layers.set(rank, []);
    layers.get(rank).push(node);
  }

  const marginX = 100;
  const marginY = 100;
  const maxRank = Math.max(0, ...layers.keys());
  const usableX = Math.max(0, canvasSize - (marginX * 2) - DEFAULT_NODE_WIDTH);
  const usableY = Math.max(0, canvasSize - (marginY * 2) - DEFAULT_NODE_HEIGHT);
  const positions = new Map();

  for (const [rank, layerNodes] of [...layers.entries()].sort(([a], [b]) => a - b)) {
    const xStep = maxRank ? Math.min(260, usableX / maxRank) : 0;
    const x = marginX + (xStep * rank);
    const yStep = layerNodes.length > 1 ? Math.min(150, usableY / (layerNodes.length - 1)) : 0;
    layerNodes.forEach((node, index) => {
      positions.set(node.id, {
        x: Math.round(Math.min(canvasSize - DEFAULT_NODE_WIDTH - 10, Math.max(10, x))),
        y: Math.round(Math.min(canvasSize - DEFAULT_NODE_HEIGHT - 10, Math.max(10, marginY + (index * yStep))))
      });
    });
  }

  return nodes.map((node) => ({ ...node, ...positions.get(node.id) }));
}

export function convertLiveTopologyToPlan(graph, context = {}) {
  const normalizedNodes = normalizeLiveNodes(graph, context);
  const usedNodeIds = new Set();
  const nodeIdMap = new Map();
  const nodes = normalizedNodes.map((node) => {
    const id = uniqueId(`live:${node.liveNodeId}`, usedNodeIds);
    nodeIdMap.set(node.liveNodeId, id);
    return {
      id,
      serviceKey: LIVE_SERVICE_DEFINITIONS[node.liveResourceType].key,
      x: 0,
      y: 0,
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
      name: node.resourceLabel,
      provenance: IMPORTED_FROM_LIVE,
      originalResourceLabel: node.resourceLabel,
      resourceId: node.resourceId,
      liveResourceType: node.liveResourceType,
      liveNodeId: node.liveNodeId,
      profile: node.profile,
      region: node.region
    };
  });

  const normalizedEdges = normalizeLiveEdges(graph, nodeIdMap, context);
  const usedEdgeIds = new Set();
  const edges = normalizedEdges.map((edge) => ({
    id: uniqueId(`live-edge:${edge.sourceEdgeId}`, usedEdgeIds),
    source: edge.source,
    target: edge.target,
    label: edge.label,
    provenance: IMPORTED_FROM_LIVE,
    sourceEdgeId: edge.sourceEdgeId,
    profile: edge.profile,
    region: edge.region
  }));

  return { nodes: layoutPlanningNodes(nodes, edges), edges };
}

function importedNodeIdentity(node) {
  if (node?.provenance !== IMPORTED_FROM_LIVE) return '';
  const resourceIdentity = cleanString(node.liveNodeId)
    || `${cleanString(node.liveResourceType)}\u0000${cleanString(node.resourceId)}`;
  return `${cleanString(node.profile)}\u0000${cleanString(node.region)}\u0000${resourceIdentity}`;
}

function importedEdgeIdentity(edge) {
  if (edge?.provenance !== IMPORTED_FROM_LIVE) return '';
  const relationshipIdentity = cleanString(edge.sourceEdgeId)
    || `${cleanString(edge.source)}\u0000${cleanString(edge.target)}\u0000${cleanString(edge.label)}`;
  return `${cleanString(edge.profile)}\u0000${cleanString(edge.region)}\u0000${relationshipIdentity}`;
}

function overlapsAny(node, existingNodes) {
  const gap = 24;
  return existingNodes.some((existing) =>
    node.x < existing.x + (existing.width || DEFAULT_NODE_WIDTH) + gap
    && node.x + (node.width || DEFAULT_NODE_WIDTH) + gap > existing.x
    && node.y < existing.y + (existing.height || DEFAULT_NODE_HEIGHT) + gap
    && node.y + (node.height || DEFAULT_NODE_HEIGHT) + gap > existing.y
  );
}

function findOpenPosition(node, placedNodes) {
  if (!overlapsAny(node, placedNodes)) return node;
  for (let y = 100; y <= PLANNING_CANVAS_SIZE - DEFAULT_NODE_HEIGHT - 10; y += 132) {
    for (let x = 100; x <= PLANNING_CANVAS_SIZE - DEFAULT_NODE_WIDTH - 10; x += 216) {
      const candidate = { ...node, x, y };
      if (!overlapsAny(candidate, placedNodes)) return candidate;
    }
  }
  return node;
}

export function mergePlanningGraphs(existingPlan, importedPlan) {
  const existingNodes = Array.isArray(existingPlan?.nodes) ? existingPlan.nodes : [];
  const existingEdges = Array.isArray(existingPlan?.edges) ? existingPlan.edges : [];
  const incomingNodes = Array.isArray(importedPlan?.nodes) ? importedPlan.nodes : [];
  const incomingEdges = Array.isArray(importedPlan?.edges) ? importedPlan.edges : [];
  const nodes = [...existingNodes];
  const usedNodeIds = new Set(nodes.map((node) => node.id));
  const identityToNodeId = new Map(nodes.map((node) => [importedNodeIdentity(node), node.id]).filter(([identity]) => identity));
  const incomingIdMap = new Map();

  for (const incoming of incomingNodes) {
    const identity = importedNodeIdentity(incoming);
    const existingId = identity && identityToNodeId.get(identity);
    if (existingId) {
      incomingIdMap.set(incoming.id, existingId);
      continue;
    }
    const id = uniqueId(incoming.id, usedNodeIds);
    const placed = findOpenPosition({ ...incoming, id }, nodes);
    nodes.push(placed);
    incomingIdMap.set(incoming.id, id);
    if (identity) identityToNodeId.set(identity, id);
  }

  const edges = [...existingEdges];
  const usedEdgeIds = new Set(edges.map((edge) => edge.id));
  const edgeIdentities = new Set(edges.map(importedEdgeIdentity).filter(Boolean));
  for (const incoming of incomingEdges) {
    const source = incomingIdMap.get(incoming.source);
    const target = incomingIdMap.get(incoming.target);
    if (!source || !target) continue;
    const edge = { ...incoming, source, target };
    const identity = importedEdgeIdentity(edge);
    if (identity && edgeIdentities.has(identity)) continue;
    edges.push({ ...edge, id: uniqueId(edge.id, usedEdgeIds) });
    if (identity) edgeIdentities.add(identity);
  }

  return { nodes, edges };
}

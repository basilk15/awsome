/**
 * Helpers for narrowing the AWS live-topology response before it is rendered.
 * The functions deliberately keep Cytoscape-shaped node and edge objects intact
 * so selections and resource details continue to work in the UI.
 */

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
}

function normalise(value) {
  return text(value).trim().toLocaleLowerCase();
}

function dataFor(element) {
  if (!isRecord(element)) return {};
  return isRecord(element.data) ? element.data : element;
}

function detailSearchText(value, seen = new WeakSet()) {
  const primitive = text(value);
  if (primitive) return primitive;
  if (!isRecord(value) && !Array.isArray(value)) return '';
  if (seen.has(value)) return '';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => detailSearchText(item, seen)).filter(Boolean).join(' ');
  }

  return Object.entries(value).flatMap(([key, item]) => [key, detailSearchText(item, seen)]).join(' ');
}

/**
 * Gets a node's resource type, including the type encoded in AWS-style ids
 * such as `ec2-i-123` when the backend did not return an explicit type.
 */
export function getLiveTopologyNodeType(node) {
  const data = dataFor(node);
  const explicitType = text(data.type).trim();
  if (explicitType) return explicitType;

  const id = text(data.id).trim();
  const separator = id.indexOf('-');
  return separator > 0 ? id.slice(0, separator) : '';
}

/**
 * Returns a normalised Set suitable for storing the UI's type-filter state.
 * Empty, non-string values are ignored and casing is made irrelevant.
 */
export function normaliseLiveTopologyTypes(selectedTypes) {
  const values = selectedTypes instanceof Set
    ? [...selectedTypes]
    : Array.isArray(selectedTypes)
      ? selectedTypes
      : typeof selectedTypes === 'string'
        ? [selectedTypes]
        : [];
  return new Set(values.map(normalise).filter(Boolean));
}

/**
 * Tests one Cytoscape-shaped topology node against a text query and/or
 * selected resource types. The text query covers label, id, type, and both
 * keys and values in details.
 */
export function matchesLiveTopologyNode(node, { query = '', selectedTypes } = {}) {
  const data = dataFor(node);
  const id = text(data.id).trim();
  if (!id) return false;

  const selected = normaliseLiveTopologyTypes(selectedTypes);
  const type = getLiveTopologyNodeType(node);
  if (selected.size && !selected.has(normalise(type))) return false;

  const queryText = normalise(query);
  if (!queryText) return true;
  const searchable = [data.label, id, type, detailSearchText(data.details)]
    .map(normalise)
    .join(' ');
  return searchable.includes(queryText);
}

/**
 * Narrows a live topology without mutating its original nodes or edges. Only
 * edges connecting two retained nodes are returned; dangling edges are ignored.
 */
export function filterLiveTopologyGraph(graph, filters = {}) {
  const source = isRecord(graph) ? graph : {};
  const nodes = Array.isArray(source.nodes) ? source.nodes : [];
  const edges = Array.isArray(source.edges) ? source.edges : [];
  const retainedNodes = nodes.filter((node) => matchesLiveTopologyNode(node, filters));
  const retainedNodeIds = new Set(retainedNodes.map((node) => text(dataFor(node).id).trim()));
  const retainedEdges = edges.filter((edge) => {
    const data = dataFor(edge);
    const sourceId = text(data.source).trim();
    const targetId = text(data.target).trim();
    return Boolean(sourceId && targetId && retainedNodeIds.has(sourceId) && retainedNodeIds.has(targetId));
  });

  return { ...source, nodes: retainedNodes, edges: retainedEdges };
}

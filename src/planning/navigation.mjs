import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH, PLANNING_CANVAS_SIZE } from './liveTopology.mjs';

export function findPlanningNodes(nodes, catalog, query) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return nodes.filter((node) => {
    const fields = [node.name, node.serviceKey, catalog.get(node.serviceKey)?.name, node.resourceId, node.region];
    const searchable = fields.join(' ').toLowerCase();
    return words.every((word) => searchable.includes(word));
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }) || a.id.localeCompare(b.id));
}

export function panToPlanningNode(node, zoom, viewport) {
  const centerAxis = (position, size, dimension) => {
    const desired = dimension / 2 - (position + size / 2) * zoom;
    const minimum = Math.min(0, dimension - PLANNING_CANVAS_SIZE * zoom);
    return Math.min(0, Math.max(minimum, desired));
  };
  return {
    x: centerAxis(node.x, node.width || DEFAULT_NODE_WIDTH, viewport.width),
    y: centerAxis(node.y, node.height || DEFAULT_NODE_HEIGHT, viewport.height)
  };
}

import { liveNodeRegion, splitLiveGraphId } from './liveRegions.mjs';
import { getLiveTopologyNodeType } from './liveTopologyFilter.mjs';

const registrationTypes = new Set(['target_ec2', 'target_ip', 'target_lambda', 'target_alb']);

export function inventoryResourceId(
  data,
  localId = splitLiveGraphId(data.id || '').localId,
  type = getLiveTopologyNodeType(data)
) {
  if (data.resourceId) return data.resourceId;
  // The graph keys each registration by target group, target, port and index.
  if (registrationTypes.has(type) && data.label) return data.label;
  const prefix = `${type}-`;
  return localId.startsWith(prefix) ? localId.slice(prefix.length) : localId;
}

export function resourceInventoryRows(nodes, context, services) {
  return nodes.map((node) => {
    const data = node.data || node;
    const type = getLiveTopologyNodeType(data);
    const id = inventoryResourceId(data);
    const service = services[type];
    return {
      graphId: data.id,
      name: data.label || id,
      id,
      type: service?.heading || type || 'AWS resource',
      region: liveNodeRegion(data, context?.regions?.length === 1 ? context.region : ''),
      profile: context?.profile,
      color: service?.fallbackColor
    };
  });
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^\s*[=+@-]|^[\t\r\n]/u.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function resourceInventoryCsv(resources) {
  const rows = [['Name', 'Resource ID', 'Type', 'Region', 'Profile']];
  for (const { name, id, type, region, profile } of resources) {
    rows.push([name, id, type, region, profile]);
  }
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function normaliseScanRegions(primary, additional = []) {
  return [...new Set([primary, ...additional]
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean))].sort();
}

export function graphRegions(graph, fallback = '') {
  if (Array.isArray(graph?.regions) && graph.regions.length) return normaliseScanRegions('', graph.regions);
  return normaliseScanRegions('', typeof fallback === 'string' ? fallback.split(',') : []);
}

export function splitLiveGraphId(id) {
  const prefix = /^([a-z][a-z0-9]*(?:-[a-z0-9]+)+-\d+)::/.exec(id);
  return prefix ? { region: prefix[1], localId: id.slice(prefix[0].length) } : { region: '', localId: id };
}

export function liveNodeRegion(data, fallback = '') {
  return data.region || splitLiveGraphId(data.id || '').region || fallback;
}

export function sameScanSource(leftProfile, leftRegions, rightProfile, rightRegions) {
  return leftProfile === rightProfile
    && normaliseScanRegions('', leftRegions).join(',') === normaliseScanRegions('', rightRegions).join(',');
}

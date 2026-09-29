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

export function sameScanSource(leftProfile, leftRegions, rightProfile, rightRegions) {
  return leftProfile === rightProfile
    && normaliseScanRegions('', leftRegions).join(',') === normaliseScanRegions('', rightRegions).join(',');
}

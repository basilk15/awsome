const DEFAULT_NODE_WIDTH = 168;
const DEFAULT_NODE_HEIGHT = 84;
const DEFAULT_NODE_COLOR = '#5b6b82';
const DEFAULT_BACKGROUND = '#f8fafc';
const DEFAULT_PADDING = 56;
const DEFAULT_MIN_WIDTH = 640;
const DEFAULT_MIN_HEIGHT = 400;

function finiteNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function text(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function number(value) {
  return Number(value.toFixed(2)).toString();
}

function isSafeColor(value) {
  return typeof value === 'string'
    && /^(?:#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([0-9.%\s,]+\))$/i.test(value.trim());
}

function safeColor(value, fallback) {
  return isSafeColor(value) ? value.trim() : fallback;
}

function serviceLookup(serviceCatalog) {
  const services = new Map();
  if (!Array.isArray(serviceCatalog)) return services;

  for (const service of serviceCatalog) {
    const key = text(service?.key).toLowerCase();
    if (key) services.set(key, service);
  }
  return services;
}

function normalizedNodes(document, services) {
  const seenIds = new Set();
  return (Array.isArray(document?.nodes) ? document.nodes : []).flatMap((node, index) => {
    const id = text(node?.id);
    if (!id || seenIds.has(id)) return [];
    seenIds.add(id);

    const serviceKey = text(node.serviceKey).toLowerCase();
    const service = services.get(serviceKey);
    return [{
      id,
      x: finiteNumber(node.x, 0),
      y: finiteNumber(node.y, 0),
      width: Math.max(1, finiteNumber(node.width, DEFAULT_NODE_WIDTH)),
      height: Math.max(1, finiteNumber(node.height, DEFAULT_NODE_HEIGHT)),
      name: text(node.name, id),
      serviceName: text(service?.name, text(node.serviceKey, 'AWS service')),
      color: safeColor(service?.color, DEFAULT_NODE_COLOR),
      index
    }];
  });
}

function normalizedEdges(document, nodesById) {
  const seenIds = new Set();
  return (Array.isArray(document?.edges) ? document.edges : []).flatMap((edge, index) => {
    const id = text(edge?.id, `edge-${index + 1}`);
    const source = text(edge?.source);
    const target = text(edge?.target);
    if (!source || !target || source === target || seenIds.has(id) || !nodesById.has(source) || !nodesById.has(target)) return [];
    seenIds.add(id);
    return [{ id, source, target, label: text(edge.label), index }];
  });
}

function boundsFor(nodes, padding, minWidth, minHeight) {
  if (!nodes.length) return { x: 0, y: 0, width: minWidth, height: minHeight };

  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + node.width));
  const maxY = Math.max(...nodes.map((node) => node.y + node.height));
  const contentWidth = maxX - minX + (padding * 2);
  const contentHeight = maxY - minY + (padding * 2);
  return {
    x: minX - padding - Math.max(0, minWidth - contentWidth) / 2,
    y: minY - padding - Math.max(0, minHeight - contentHeight) / 2,
    width: Math.max(minWidth, contentWidth),
    height: Math.max(minHeight, contentHeight)
  };
}

function edgeEndpoints(source, target) {
  const sourceCenter = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  const delta = { x: targetCenter.x - sourceCenter.x, y: targetCenter.y - sourceCenter.y };
  const sourceScale = Math.min(
    (source.width / 2) / Math.max(1, Math.abs(delta.x)),
    (source.height / 2) / Math.max(1, Math.abs(delta.y))
  );
  const targetScale = Math.min(
    (target.width / 2) / Math.max(1, Math.abs(delta.x)),
    (target.height / 2) / Math.max(1, Math.abs(delta.y))
  );
  return {
    x1: sourceCenter.x + delta.x * sourceScale,
    y1: sourceCenter.y + delta.y * sourceScale,
    x2: targetCenter.x - delta.x * targetScale,
    y2: targetCenter.y - delta.y * targetScale,
    labelX: (sourceCenter.x + targetCenter.x) / 2,
    labelY: (sourceCenter.y + targetCenter.y) / 2 - 8
  };
}

function wrapLabel(value, maxLength = 25) {
  if (value.length <= maxLength) return [value];
  const words = value.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxLength && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 2).map((item, index, all) => index === all.length - 1 && lines.length > 2 ? `${item.slice(0, Math.max(0, maxLength - 1))}…` : item);
}

/** Escape untrusted text before placing it in an SVG XML text or title node. */
export function escapeSvgText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Creates a standalone SVG representation of a normalized planning document.
 * The service catalog is intentionally supplied by the UI so the export always
 * uses the same service names and colors as the planning palette.
 */
export function renderPlanningArchitectureSvg(document, serviceCatalog, options = {}) {
  const services = serviceLookup(serviceCatalog);
  const nodes = normalizedNodes(document, services);
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const edges = normalizedEdges(document, nodesById);
  const padding = Math.max(0, finiteNumber(options.padding, DEFAULT_PADDING));
  const minWidth = Math.max(1, finiteNumber(options.minWidth, DEFAULT_MIN_WIDTH));
  const minHeight = Math.max(1, finiteNumber(options.minHeight, DEFAULT_MIN_HEIGHT));
  const bounds = boundsFor(nodes, padding, minWidth, minHeight);
  const title = text(options.title, text(document?.name, 'AWS architecture'));
  const background = safeColor(options.background, DEFAULT_BACKGROUND);

  const edgeMarkup = edges.map((edge) => {
    const geometry = edgeEndpoints(nodesById.get(edge.source), nodesById.get(edge.target));
    const label = edge.label
      ? `<text class="edge-label" x="${number(geometry.labelX)}" y="${number(geometry.labelY)}" text-anchor="middle">${escapeSvgText(edge.label)}</text>`
      : '';
    return `<g class="edge"><title>${escapeSvgText(edge.label || `${edge.source} to ${edge.target}`)}</title><line x1="${number(geometry.x1)}" y1="${number(geometry.y1)}" x2="${number(geometry.x2)}" y2="${number(geometry.y2)}" marker-end="url(#planning-export-arrow)"/>${label}</g>`;
  }).join('');

  const nodeMarkup = nodes.map((node) => {
    const nameLines = wrapLabel(node.name);
    const firstLineY = node.y + node.height / 2 - (nameLines.length - 1) * 9;
    const labels = nameLines.map((line, index) => `<tspan x="${number(node.x + 18)}" y="${number(firstLineY + index * 18)}">${escapeSvgText(line)}</tspan>`).join('');
    return `<g class="node"><title>${escapeSvgText(`${node.name} (${node.serviceName})`)}</title><rect class="node-card" x="${number(node.x)}" y="${number(node.y)}" width="${number(node.width)}" height="${number(node.height)}" rx="12" fill="#ffffff"/><rect class="node-accent" x="${number(node.x)}" y="${number(node.y)}" width="8" height="${number(node.height)}" rx="4" fill="${node.color}"/><text class="service-label" x="${number(node.x + 18)}" y="${number(node.y + 22)}">${escapeSvgText(node.serviceName)}</text><text class="node-label">${labels}</text></g>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${number(bounds.x)} ${number(bounds.y)} ${number(bounds.width)} ${number(bounds.height)}" width="${number(bounds.width)}" height="${number(bounds.height)}" role="img" aria-labelledby="planning-export-title planning-export-description"><title id="planning-export-title">${escapeSvgText(title)}</title><desc id="planning-export-description">Architecture diagram with ${nodes.length} services and ${edges.length} directed connections.</desc><defs><marker id="planning-export-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b"/></marker><style>.edge line{stroke:#64748b;stroke-width:2;fill:none}.edge-label{font:500 12px system-ui,sans-serif;fill:#475569;paint-order:stroke;stroke:${background};stroke-width:5;stroke-linejoin:round}.node-card{stroke:#cbd5e1;stroke-width:1.25}.service-label{font:600 11px system-ui,sans-serif;fill:#64748b}.node-label{font:600 14px system-ui,sans-serif;fill:#172033}</style></defs><rect x="${number(bounds.x)}" y="${number(bounds.y)}" width="${number(bounds.width)}" height="${number(bounds.height)}" fill="${background}"/>${edgeMarkup}${nodeMarkup}</svg>`;
}

export function svgFilename(name) {
  const stem = text(name, 'architecture')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100)
    .toLowerCase() || 'architecture';
  return `${stem}.svg`;
}

/** Return the data a React/UI event handler needs to download the rendered SVG. */
export function createPlanningSvgArtifact(document, serviceCatalog, options = {}) {
  return {
    filename: svgFilename(options.filename || document?.name),
    mimeType: 'image/svg+xml;charset=utf-8',
    svg: renderPlanningArchitectureSvg(document, serviceCatalog, options)
  };
}

/** Trigger a browser download. The browser object is injectable for tests. */
export function downloadPlanningSvgArtifact(artifact, browser = globalThis) {
  if (!artifact?.svg || !artifact?.filename) throw new TypeError('A planning SVG artifact with filename and SVG content is required.');
  if (!browser?.document?.createElement || !browser?.URL?.createObjectURL || !browser?.URL?.revokeObjectURL || !browser?.Blob) {
    throw new Error('SVG downloads require browser Blob, URL, and document APIs.');
  }
  const url = browser.URL.createObjectURL(new browser.Blob([artifact.svg], { type: artifact.mimeType || 'image/svg+xml;charset=utf-8' }));
  const link = browser.document.createElement('a');
  link.href = url;
  link.download = artifact.filename;
  link.click();
  browser.setTimeout?.(() => browser.URL.revokeObjectURL(url), 0);
  return url;
}

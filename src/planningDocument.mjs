export const PLANNING_DOCUMENT_SCHEMA = 'graphivo/planning-document';
export const PLANNING_DOCUMENT_VERSION = 1;
export const PLANNING_DOCUMENT_STORAGE_KEY = 'graphivo.planning.last-document';
export const DEFAULT_PLANNING_DOCUMENT_NAME = 'Untitled architecture';

const DEFAULT_VIEWPORT = Object.freeze({ zoom: 1, pan: Object.freeze({ x: 0, y: 0 }) });
const CANVAS_SIZE = 3000;
const MIN_NODE_WIDTH = 126;
const MIN_NODE_HEIGHT = 68;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 1.55;
const MAX_NODES = 2000;
const MAX_EDGES = 5000;

export class PlanningDocumentError extends Error {
  constructor(message, code = 'invalid_document') {
    super(message);
    this.name = 'PlanningDocumentError';
    this.code = code;
  }
}

function createDocumentId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `architecture-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isoTimestamp(value, fieldName) {
  if (typeof value !== 'string' || !value.trim() || Number.isNaN(Date.parse(value))) {
    throw new PlanningDocumentError(`"${fieldName}" must be a valid ISO date string.`);
  }
  return new Date(value).toISOString();
}

function requiredString(value, fieldName, maxLength = 240) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new PlanningDocumentError(`"${fieldName}" must be a non-empty string.`);
  }
  if (value.trim().length > maxLength) {
    throw new PlanningDocumentError(`"${fieldName}" must be ${maxLength} characters or fewer.`);
  }
  return value.trim();
}

function optionalString(value, maxLength = 240) {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value.trim().slice(0, maxLength);
}

function finiteNumber(value, fieldName) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new PlanningDocumentError(`"${fieldName}" must be a finite number.`);
  }
  return value;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function catalogLookup(serviceCatalog) {
  if (!Array.isArray(serviceCatalog) || !serviceCatalog.length) {
    throw new PlanningDocumentError('The AWS service catalog is unavailable.', 'catalog_unavailable');
  }

  const lookup = new Map();
  serviceCatalog.forEach((service) => {
    const key = typeof service === 'string' ? service : service?.key;
    if (typeof key === 'string' && key.trim()) lookup.set(key.trim().toLowerCase(), key.trim());
  });
  return lookup;
}

function migrateLegacyDocument(input, now) {
  if (input.version !== 0) return input;

  const migratedNodes = Array.isArray(input.nodes) ? input.nodes.map((node) => ({
    ...node,
    serviceKey: node?.serviceKey ?? node?.service?.key
  })) : input.nodes;

  return {
    schema: PLANNING_DOCUMENT_SCHEMA,
    version: PLANNING_DOCUMENT_VERSION,
    id: input.id || createDocumentId(),
    name: input.name || DEFAULT_PLANNING_DOCUMENT_NAME,
    nodes: migratedNodes,
    edges: input.edges,
    viewport: input.viewport || {
      zoom: input.canvasZoom ?? DEFAULT_VIEWPORT.zoom,
      pan: input.canvasPan ?? DEFAULT_VIEWPORT.pan
    },
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || input.createdAt || now
  };
}

export function migratePlanningDocument(input, { now = new Date().toISOString() } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new PlanningDocumentError('The document root must be a JSON object.');
  }

  if (input.version === 0) {
    if (input.schema && input.schema !== PLANNING_DOCUMENT_SCHEMA) {
      throw new PlanningDocumentError(`Unsupported document schema "${input.schema}".`, 'incompatible_schema');
    }
    return migrateLegacyDocument(input, now);
  }

  if (input.schema !== PLANNING_DOCUMENT_SCHEMA) {
    throw new PlanningDocumentError(
      `Unsupported document schema. Expected "${PLANNING_DOCUMENT_SCHEMA}".`,
      'incompatible_schema'
    );
  }

  if (input.version !== PLANNING_DOCUMENT_VERSION) {
    const detail = typeof input.version === 'number' && input.version > PLANNING_DOCUMENT_VERSION
      ? 'This file was created by a newer awsome version.'
      : `Expected version ${PLANNING_DOCUMENT_VERSION}.`;
    throw new PlanningDocumentError(`Unsupported planning document version "${input.version}". ${detail}`, 'incompatible_version');
  }

  return input;
}

export function normalizePlanningDocument(input, serviceCatalog, options = {}) {
  const now = options.now || new Date().toISOString();
  const migrated = migratePlanningDocument(input, { now });
  const services = catalogLookup(serviceCatalog);

  if (!Array.isArray(migrated.nodes)) {
    throw new PlanningDocumentError('"nodes" must be an array.');
  }
  if (migrated.nodes.length > MAX_NODES) {
    throw new PlanningDocumentError(`"nodes" cannot contain more than ${MAX_NODES} items.`);
  }
  if (!Array.isArray(migrated.edges)) {
    throw new PlanningDocumentError('"edges" must be an array.');
  }
  if (migrated.edges.length > MAX_EDGES) {
    throw new PlanningDocumentError(`"edges" cannot contain more than ${MAX_EDGES} items.`);
  }

  const nodeIds = new Set();
  const nodes = migrated.nodes.map((node, index) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      throw new PlanningDocumentError(`Node ${index + 1} must be an object.`);
    }
    const id = requiredString(node.id, `nodes[${index}].id`);
    if (nodeIds.has(id)) {
      throw new PlanningDocumentError(`Node id "${id}" is duplicated.`);
    }
    nodeIds.add(id);

    const requestedServiceKey = requiredString(node.serviceKey, `nodes[${index}].serviceKey`, 80);
    const serviceKey = services.get(requestedServiceKey.toLowerCase());
    if (!serviceKey) {
      const examples = [...services.values()].slice(0, 6).join(', ');
      throw new PlanningDocumentError(
        `Node "${id}" uses unknown serviceKey "${requestedServiceKey}". Use a service from the current catalog, such as ${examples}.`,
        'unknown_service'
      );
    }

    const width = clamp(finiteNumber(node.width, `nodes[${index}].width`), MIN_NODE_WIDTH, CANVAS_SIZE);
    const height = clamp(finiteNumber(node.height, `nodes[${index}].height`), MIN_NODE_HEIGHT, CANVAS_SIZE);
    const x = clamp(finiteNumber(node.x, `nodes[${index}].x`), 0, Math.max(0, CANVAS_SIZE - width));
    const y = clamp(finiteNumber(node.y, `nodes[${index}].y`), 0, Math.max(0, CANVAS_SIZE - height));

    const provenance = optionalString(node.provenance, 80);
    const originalResourceLabel = optionalString(node.originalResourceLabel, 240);
    const resourceId = optionalString(node.resourceId, 240);
    const liveResourceType = optionalString(node.liveResourceType, 80);
    const liveNodeId = optionalString(node.liveNodeId, 320);
    const profile = optionalString(node.profile, 160);
    const region = optionalString(node.region, 80);

    return {
      id,
      serviceKey,
      name: requiredString(node.name, `nodes[${index}].name`, 160),
      x,
      y,
      width,
      height,
      ...(provenance ? { provenance } : {}),
      ...(originalResourceLabel ? { originalResourceLabel } : {}),
      ...(resourceId ? { resourceId } : {}),
      ...(liveResourceType ? { liveResourceType } : {}),
      ...(liveNodeId ? { liveNodeId } : {}),
      ...(profile ? { profile } : {}),
      ...(region ? { region } : {})
    };
  });

  const edgeIds = new Set();
  const edges = migrated.edges.map((edge, index) => {
    if (!edge || typeof edge !== 'object' || Array.isArray(edge)) {
      throw new PlanningDocumentError(`Edge ${index + 1} must be an object.`);
    }
    const id = requiredString(edge.id, `edges[${index}].id`);
    const source = requiredString(edge.source, `edges[${index}].source`);
    const target = requiredString(edge.target, `edges[${index}].target`);
    if (edgeIds.has(id)) throw new PlanningDocumentError(`Edge id "${id}" is duplicated.`);
    if (!nodeIds.has(source) || !nodeIds.has(target)) {
      throw new PlanningDocumentError(`Edge "${id}" references a node that does not exist.`);
    }
    if (source === target) throw new PlanningDocumentError(`Edge "${id}" cannot connect a node to itself.`);
    edgeIds.add(id);
    const provenance = optionalString(edge.provenance, 80);
    const sourceEdgeId = optionalString(edge.sourceEdgeId, 320);
    const profile = optionalString(edge.profile, 160);
    const region = optionalString(edge.region, 80);

    return {
      id,
      source,
      target,
      ...(typeof edge.label === 'string' && edge.label.trim() ? { label: edge.label.trim().slice(0, 240) } : {}),
      ...(provenance ? { provenance } : {}),
      ...(sourceEdgeId ? { sourceEdgeId } : {}),
      ...(profile ? { profile } : {}),
      ...(region ? { region } : {})
    };
  });

  if (!migrated.viewport || typeof migrated.viewport !== 'object' || Array.isArray(migrated.viewport)) {
    throw new PlanningDocumentError('"viewport" must be an object.');
  }
  if (!migrated.viewport.pan || typeof migrated.viewport.pan !== 'object' || Array.isArray(migrated.viewport.pan)) {
    throw new PlanningDocumentError('"viewport.pan" must be an object.');
  }

  const zoom = clamp(finiteNumber(migrated.viewport.zoom, 'viewport.zoom'), MIN_ZOOM, MAX_ZOOM);
  const panX = clamp(finiteNumber(migrated.viewport.pan.x, 'viewport.pan.x'), -CANVAS_SIZE * zoom, 0);
  const panY = clamp(finiteNumber(migrated.viewport.pan.y, 'viewport.pan.y'), -CANVAS_SIZE * zoom, 0);

  return {
    schema: PLANNING_DOCUMENT_SCHEMA,
    version: PLANNING_DOCUMENT_VERSION,
    id: requiredString(migrated.id, 'id'),
    name: requiredString(migrated.name, 'name', 120),
    nodes,
    edges,
    viewport: { zoom, pan: { x: panX, y: panY } },
    createdAt: isoTimestamp(migrated.createdAt, 'createdAt'),
    updatedAt: isoTimestamp(migrated.updatedAt, 'updatedAt')
  };
}

export function createPlanningDocument({
  id = createDocumentId(),
  name = DEFAULT_PLANNING_DOCUMENT_NAME,
  now = new Date().toISOString()
} = {}) {
  const timestamp = new Date(now).toISOString();
  return {
    schema: PLANNING_DOCUMENT_SCHEMA,
    version: PLANNING_DOCUMENT_VERSION,
    id,
    name,
    nodes: [],
    edges: [],
    viewport: {
      zoom: DEFAULT_VIEWPORT.zoom,
      pan: { ...DEFAULT_VIEWPORT.pan }
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function touchPlanningDocument(document, now = new Date().toISOString()) {
  return { ...document, updatedAt: new Date(now).toISOString() };
}

export function serializePlanningDocument(document, serviceCatalog, { now } = {}) {
  const candidate = now ? touchPlanningDocument(document, now) : document;
  return JSON.stringify(normalizePlanningDocument(candidate, serviceCatalog, { now }), null, 2);
}

export function deserializePlanningDocument(text, serviceCatalog, options = {}) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new PlanningDocumentError('Choose a non-empty awsome JSON document.');
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new PlanningDocumentError(`The file is not valid JSON: ${error.message}`, 'invalid_json');
  }
  return normalizePlanningDocument(parsed, serviceCatalog, options);
}

export function planningDocumentFingerprint(document) {
  return JSON.stringify({ ...document, updatedAt: '' });
}

export function hasPlanningWork(document) {
  return Boolean(
    document?.nodes?.length
    || document?.edges?.length
    || (typeof document?.name === 'string' && document.name.trim() !== DEFAULT_PLANNING_DOCUMENT_NAME)
  );
}

export function loadPlanningDocument(storage, serviceCatalog, options = {}) {
  const fallback = createPlanningDocument({ now: options.now });
  if (!storage || typeof storage.getItem !== 'function') {
    return {
      document: fallback,
      restored: false,
      error: 'Local saving is unavailable. You can keep working and export your architecture as JSON.'
    };
  }

  let saved;
  try {
    saved = storage.getItem(PLANNING_DOCUMENT_STORAGE_KEY);
  } catch (error) {
    return {
      document: fallback,
      restored: false,
      error: `awsome could not read local planning storage: ${error.message}`
    };
  }

  if (!saved) return { document: fallback, restored: false, error: null };

  try {
    return {
      document: deserializePlanningDocument(saved, serviceCatalog, options),
      restored: true,
      error: null
    };
  } catch (error) {
    return {
      document: fallback,
      restored: false,
      error: `The saved architecture could not be restored: ${error.message} A blank architecture is open; import a valid JSON file or start again.`
    };
  }
}

export function savePlanningDocument(storage, document, serviceCatalog, options = {}) {
  if (!storage || typeof storage.setItem !== 'function') {
    throw new PlanningDocumentError(
      'Local saving is unavailable. Export your architecture as JSON to keep a copy.',
      'storage_unavailable'
    );
  }

  const updated = touchPlanningDocument(document, options.now || new Date().toISOString());
  const normalized = normalizePlanningDocument(updated, serviceCatalog, options);
  const json = JSON.stringify(normalized);
  try {
    storage.setItem(PLANNING_DOCUMENT_STORAGE_KEY, json);
  } catch (error) {
    throw new PlanningDocumentError(
      `awsome could not save locally: ${error.message}. Export your architecture as JSON to keep a copy.`,
      'storage_write_failed'
    );
  }
  return normalized;
}

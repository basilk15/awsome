import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PLANNING_DOCUMENT_SCHEMA,
  PLANNING_DOCUMENT_STORAGE_KEY,
  PLANNING_DOCUMENT_VERSION,
  createPlanningDocument,
  deserializePlanningDocument,
  loadPlanningDocument,
  normalizePlanningDocument,
  savePlanningDocument,
  serializePlanningDocument
} from './planningDocument.mjs';

const catalog = [
  { key: 'ec2', name: 'Amazon EC2' },
  { key: 's3', name: 'Amazon S3' }
];
const now = '2026-07-28T10:00:00.000Z';

function exampleDocument() {
  return {
    ...createPlanningDocument({ id: 'plan-1', name: 'Checkout platform', now }),
    nodes: [
      { id: 'node-1', serviceKey: 'ec2', name: 'Web API', x: 40, y: 50, width: 190, height: 90 },
      { id: 'node-2', serviceKey: 's3', name: 'Uploads', x: 350, y: 170, width: 168, height: 84 }
    ],
    edges: [{ id: 'edge-1', source: 'node-1', target: 'node-2' }],
    viewport: { zoom: 1.2, pan: { x: -120, y: -80 } }
  };
}

test('serializes and deserializes a complete versioned planning document', () => {
  const original = exampleDocument();
  const json = serializePlanningDocument(original, catalog);
  const restored = deserializePlanningDocument(json, catalog);

  assert.deepEqual(restored, original);
  assert.equal(restored.schema, PLANNING_DOCUMENT_SCHEMA);
  assert.equal(restored.version, PLANNING_DOCUMENT_VERSION);
  assert.equal(restored.nodes[0].name, 'Web API');
  assert.deepEqual(restored.viewport, { zoom: 1.2, pan: { x: -120, y: -80 } });
});

test('preserves live-import provenance and relationship metadata across saves', () => {
  const imported = exampleDocument();
  imported.nodes[0] = {
    ...imported.nodes[0],
    provenance: 'imported-from-live',
    originalResourceLabel: 'production-web',
    resourceId: 'i-0123456789',
    liveResourceType: 'ec2',
    liveNodeId: 'ec2-i-0123456789',
    profile: 'production',
    region: 'eu-west-1'
  };
  imported.edges[0] = {
    ...imported.edges[0],
    label: 'hosts',
    provenance: 'imported-from-live',
    sourceEdgeId: 'edge-subnet-ec2',
    profile: 'production',
    region: 'eu-west-1'
  };

  const restored = deserializePlanningDocument(serializePlanningDocument(imported, catalog), catalog);
  assert.equal(restored.nodes[0].liveNodeId, 'ec2-i-0123456789');
  assert.equal(restored.nodes[0].originalResourceLabel, 'production-web');
  assert.equal(restored.nodes[0].profile, 'production');
  assert.equal(restored.edges[0].sourceEdgeId, 'edge-subnet-ec2');
  assert.equal(restored.edges[0].provenance, 'imported-from-live');
});

test('migrates legacy version 0 canvas fields and embedded service objects', () => {
  const legacy = {
    version: 0,
    id: 'legacy-1',
    name: 'Legacy plan',
    nodes: [{
      id: 'node-1',
      service: { key: 'EC2', name: 'Old catalog name' },
      name: 'Compute',
      x: 20,
      y: 30,
      width: 168,
      height: 84
    }],
    edges: [],
    canvasZoom: 1.1,
    canvasPan: { x: -20, y: -30 },
    createdAt: now,
    updatedAt: now
  };

  const migrated = normalizePlanningDocument(legacy, catalog, { now });
  assert.equal(migrated.schema, PLANNING_DOCUMENT_SCHEMA);
  assert.equal(migrated.version, PLANNING_DOCUMENT_VERSION);
  assert.equal(migrated.nodes[0].serviceKey, 'ec2');
  assert.deepEqual(migrated.viewport, { zoom: 1.1, pan: { x: -20, y: -30 } });
  assert.equal('service' in migrated.nodes[0], false);
});

test('validates catalog services, edge references, and incompatible versions with actionable errors', () => {
  const unknownService = exampleDocument();
  unknownService.nodes[0].serviceKey = 'not-a-service';
  assert.throws(
    () => normalizePlanningDocument(unknownService, catalog),
    /unknown serviceKey "not-a-service".*ec2, s3/
  );

  const brokenEdge = exampleDocument();
  brokenEdge.edges[0].target = 'missing-node';
  assert.throws(() => normalizePlanningDocument(brokenEdge, catalog), /references a node that does not exist/);

  const newer = { ...exampleDocument(), version: 99 };
  assert.throws(() => normalizePlanningDocument(newer, catalog), /newer awsome version/);
});

test('normalizes imported coordinates, sizes, service key casing, and viewport bounds', () => {
  const imported = exampleDocument();
  imported.nodes[0] = {
    ...imported.nodes[0],
    serviceKey: 'EC2',
    x: -500,
    y: 9000,
    width: 10,
    height: 10
  };
  imported.viewport = { zoom: 99, pan: { x: 100, y: -99999 } };

  const normalized = normalizePlanningDocument(imported, catalog);
  assert.deepEqual(
    {
      serviceKey: normalized.nodes[0].serviceKey,
      x: normalized.nodes[0].x,
      y: normalized.nodes[0].y,
      width: normalized.nodes[0].width,
      height: normalized.nodes[0].height
    },
    { serviceKey: 'ec2', x: 0, y: 2932, width: 126, height: 68 }
  );
  assert.deepEqual(normalized.viewport, { zoom: 1.55, pan: { x: 0, y: -4650 } });
});

test('corrupt saved data falls back safely without overwriting it', () => {
  const storage = {
    value: '{not json',
    getItem(key) {
      assert.equal(key, PLANNING_DOCUMENT_STORAGE_KEY);
      return this.value;
    },
    setItem() {
      throw new Error('load must not overwrite corrupt data');
    }
  };

  const result = loadPlanningDocument(storage, catalog, { now });
  assert.equal(result.restored, false);
  assert.equal(result.document.name, 'Untitled architecture');
  assert.match(result.error, /could not be restored.*not valid JSON.*blank architecture/is);
  assert.equal(storage.value, '{not json');
});

test('storage read and write failures are recoverable and descriptive', () => {
  const readFailure = loadPlanningDocument({
    getItem() {
      throw new Error('permission denied');
    }
  }, catalog, { now });
  assert.match(readFailure.error, /could not read.*permission denied/i);
  assert.deepEqual(readFailure.document.nodes, []);

  assert.throws(
    () => savePlanningDocument({
      setItem() {
        throw new Error('quota exceeded');
      }
    }, exampleDocument(), catalog, { now }),
    /could not save locally.*quota exceeded.*Export/i
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';

const service = (id, name, serviceKey = 'lambda') => ({ id, name, serviceKey });
const connection = (id, source, target, label) => ({ id, source, target, label });

test('classifies separately created services and connections by ID even when they look identical', async () => {
  const { compareArchitectures } = await import('./architectureComparison.mjs');
  const baseline = {
    nodes: [service('api', 'API'), service('old-store', 'Store', 's3')],
    edges: [connection('old-link', 'api', 'old-store', 'writes')]
  };
  const current = {
    nodes: [service('api', 'API'), service('new-store', 'Store', 's3')],
    edges: [connection('new-link', 'api', 'new-store', 'writes')]
  };

  const { services, connections } = compareArchitectures(baseline, current);
  assert.deepEqual(services.added, [{ id: 'new-store', name: 'Store', serviceKey: 's3' }]);
  assert.deepEqual(services.removed, [{ id: 'old-store', name: 'Store', serviceKey: 's3' }]);
  assert.deepEqual(services.changed, []);
  assert.deepEqual(connections.added, [{
    id: 'new-link', source: { id: 'api', name: 'API' }, target: { id: 'new-store', name: 'Store' }, label: 'writes'
  }]);
  assert.deepEqual(connections.removed, [{
    id: 'old-link', source: { id: 'api', name: 'API' }, target: { id: 'old-store', name: 'Store' }, label: 'writes'
  }]);
  assert.deepEqual(connections.changed, []);
});

test('reports matched service name and type changes without flagging its unchanged connection', async () => {
  const { compareArchitectures } = await import('./architectureComparison.mjs');
  const baseline = {
    nodes: [service('api', 'API'), service('worker', 'Worker'), service('store', 'Store', 's3')],
    edges: [connection('link', 'api', 'store', 'writes')]
  };
  const current = {
    ...baseline,
    nodes: [service('api', 'Public API'), service('worker', 'Worker', 'ecs'), service('store', 'Store', 's3')]
  };

  const { services, connections } = compareArchitectures(baseline, current);
  assert.deepEqual(services.changed, [
    { before: service('api', 'API'), after: service('api', 'Public API') },
    { before: service('worker', 'Worker'), after: service('worker', 'Worker', 'ecs') }
  ]);
  assert.deepEqual(services.added, []);
  assert.deepEqual(services.removed, []);
  assert.deepEqual(connections.changed, []);
});

test('reports source, target and label changes independently with each plan’s endpoint names', async () => {
  const { compareArchitectures } = await import('./architectureComparison.mjs');
  const baseline = {
    nodes: [service('a', 'API'), service('b', 'Worker'), service('c', 'Store', 's3')],
    edges: [connection('source', 'a', 'b'), connection('target', 'b', 'c'), connection('label', 'c', 'a', 'reads')]
  };
  const current = {
    nodes: [service('a', 'Public API'), service('b', 'Worker'), service('c', 'Bucket', 's3')],
    edges: [connection('source', 'c', 'b'), connection('target', 'b', 'a'), connection('label', 'c', 'a')]
  };

  const { connections } = compareArchitectures(baseline, current);
  assert.deepEqual(connections.changed, [
    {
      before: { id: 'source', source: { id: 'a', name: 'API' }, target: { id: 'b', name: 'Worker' }, label: '' },
      after: { id: 'source', source: { id: 'c', name: 'Bucket' }, target: { id: 'b', name: 'Worker' }, label: '' }
    },
    {
      before: { id: 'target', source: { id: 'b', name: 'Worker' }, target: { id: 'c', name: 'Store' }, label: '' },
      after: { id: 'target', source: { id: 'b', name: 'Worker' }, target: { id: 'a', name: 'Public API' }, label: '' }
    },
    {
      before: { id: 'label', source: { id: 'c', name: 'Store' }, target: { id: 'a', name: 'API' }, label: 'reads' },
      after: { id: 'label', source: { id: 'c', name: 'Bucket' }, target: { id: 'a', name: 'Public API' }, label: '' }
    }
  ]);
  assert.deepEqual(connections.added, []);
  assert.deepEqual(connections.removed, []);
});

test('ignores document metadata, layout, provenance, order and absent versus empty labels', async () => {
  const { compareArchitectures } = await import('./architectureComparison.mjs');
  const baseline = {
    id: 'original', name: 'Original', createdAt: '2025-01-01', updatedAt: '2025-01-02',
    viewport: { zoom: 1, pan: { x: 0, y: 0 } },
    nodes: [{ ...service('api', 'API'), x: 0, y: 0, width: 160, height: 80 }, service('store', 'Store', 's3')],
    edges: [{ id: 'write', source: 'api', target: 'store' }, connection('read', 'store', 'api', 'response')]
  };
  const current = {
    id: 'copy', name: 'Copy', createdAt: '2025-02-01', updatedAt: '2025-02-02',
    viewport: { zoom: 2, pan: { x: -8, y: -16 } },
    nodes: [service('store', 'Store', 's3'), {
      ...service('api', 'API'), x: 125, y: 26, width: 200, height: 96, provenance: 'live', resourceId: 'api-1'
    }],
    edges: [connection('read', 'store', 'api', 'response'), {
      ...connection('write', 'api', 'store', ''), provenance: 'live', sourceEdgeId: 'original-write'
    }]
  };

  assert.deepEqual(compareArchitectures(baseline, current), {
    services: { added: [], removed: [], changed: [] },
    connections: { added: [], removed: [], changed: [] }
  });
});

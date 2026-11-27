import assert from 'node:assert/strict';
import test from 'node:test';

test('finds placed services by name, catalog type and imported resource metadata', async () => {
  const { findPlanningNodes } = await import('./navigation.mjs');
  const nodes = [
    { id: 'one', name: 'Reports database', serviceKey: 'rds', resourceId: 'db-reports', region: 'us-east-1' },
    { id: 'two', name: 'Payments database', serviceKey: 'rds', resourceId: 'db-payments', region: 'us-west-2' },
    { id: 'three', name: 'Reports API', serviceKey: 'lambda' }
  ];
  const catalog = new Map([['rds', { name: 'Amazon RDS' }], ['lambda', { name: 'AWS Lambda' }]]);
  assert.deepEqual(findPlanningNodes(nodes, catalog, '  RDS east-1  ').map((node) => node.id), ['one']);
  assert.deepEqual(findPlanningNodes(nodes, catalog, 'DB-PAYMENTS').map((node) => node.id), ['two']);
  assert.deepEqual(findPlanningNodes(nodes, catalog, 'Reports').map((node) => node.id), ['three', 'one']);
});

test('centers the service at the current zoom and bounds pan at the canvas edges', async () => {
  const { panToPlanningNode } = await import('./navigation.mjs');
  const viewport = { width: 800, height: 500 };
  assert.deepEqual(panToPlanningNode({ x: 700, y: 600, width: 200, height: 100 }, 2, viewport), { x: -1200, y: -1050 });
  assert.deepEqual(panToPlanningNode({ x: 10, y: 2900, width: 160, height: 90 }, 1, viewport), { x: 0, y: -2500 });
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_PLANNING_CONNECTION_LABEL_LENGTH,
  PlanningConnectionLabelError,
  updatePlanningConnectionLabel,
  validatePlanningConnectionLabel
} from './connectionLabels.mjs';

test('validates and trims a connection label', () => {
  assert.deepEqual(validatePlanningConnectionLabel('  sends HTTPS traffic  '), {
    valid: true,
    label: 'sends HTTPS traffic',
    error: null
  });
  assert.deepEqual(validatePlanningConnectionLabel('   '), {
    valid: true,
    label: '',
    error: null
  });
});

test('reports actionable validation errors for non-text and overlong labels', () => {
  assert.deepEqual(validatePlanningConnectionLabel(null), {
    valid: false,
    label: '',
    error: 'Connection label must be text.'
  });

  const tooLong = 'x'.repeat(MAX_PLANNING_CONNECTION_LABEL_LENGTH + 1);
  const result = validatePlanningConnectionLabel(tooLong);
  assert.equal(result.valid, false);
  assert.equal(result.label, tooLong);
  assert.match(result.error, /at most 240 characters/);
});

test('immutably updates one edge using its trimmed label', () => {
  const edges = [
    { id: 'web-to-api', source: 'web', target: 'api', label: 'old' },
    { id: 'api-to-db', source: 'api', target: 'db', label: 'query' }
  ];

  const updated = updatePlanningConnectionLabel(edges, 'web-to-api', '  invokes API  ');

  assert.deepEqual(updated, [
    { id: 'web-to-api', source: 'web', target: 'api', label: 'invokes API' },
    edges[1]
  ]);
  assert.notStrictEqual(updated, edges);
  assert.notStrictEqual(updated[0], edges[0]);
  assert.strictEqual(updated[1], edges[1]);
  assert.equal(edges[0].label, 'old');
});

test('clearing a label removes its property without mutating other edge data', () => {
  const edges = [{
    id: 'web-to-api',
    source: 'web',
    target: 'api',
    label: 'old',
    provenance: 'imported-from-live'
  }];

  const updated = updatePlanningConnectionLabel(edges, 'web-to-api', '  ');

  assert.deepEqual(updated, [{
    id: 'web-to-api',
    source: 'web',
    target: 'api',
    provenance: 'imported-from-live'
  }]);
  assert.equal(Object.hasOwn(edges[0], 'label'), true);
});

test('keeps the original collection for a missing edge or no-op update', () => {
  const edges = [{ id: 'web-to-api', source: 'web', target: 'api', label: 'invokes API' }];

  assert.strictEqual(updatePlanningConnectionLabel(edges, 'missing', 'new'), edges);
  assert.strictEqual(updatePlanningConnectionLabel(edges, 'web-to-api', ' invokes API '), edges);
});

test('rejects unusable edge collections and invalid updates', () => {
  assert.throws(
    () => updatePlanningConnectionLabel(null, 'web-to-api', 'valid'),
    /Planning edges must be an array/
  );
  assert.throws(
    () => updatePlanningConnectionLabel([], 'web-to-api', 42),
    PlanningConnectionLabelError
  );
  assert.throws(
    () => updatePlanningConnectionLabel([], 'web-to-api', 'x'.repeat(241)),
    /at most 240 characters/
  );
});

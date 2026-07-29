import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_PLANNING_HISTORY_LIMIT,
  canRedoPlanningHistory,
  canUndoPlanningHistory,
  createPlanningHistory,
  recordPlanningHistory,
  redoPlanningHistory,
  resetPlanningHistory,
  undoPlanningHistory
} from './history.mjs';

function document(name, extra = {}) {
  return {
    schema: 'graphivo/planning-document',
    version: 1,
    id: 'plan-1',
    name,
    nodes: [{ id: 'node-1', name: 'API', metadata: { tags: ['critical'] } }],
    edges: [],
    viewport: { zoom: 1, pan: { x: 0, y: 0 } },
    createdAt: '2026-07-29T00:00:00.000Z',
    updatedAt: '2026-07-29T00:00:00.000Z',
    ...extra
  };
}

test('initializes a history with the complete document and default limit', () => {
  const original = document('Initial', { extension: { owner: 'platform' } });
  const history = createPlanningHistory(original);

  assert.deepEqual(history.present, original);
  assert.notStrictEqual(history.present, original);
  assert.notStrictEqual(history.present.nodes, original.nodes);
  assert.equal(history.limit, DEFAULT_PLANNING_HISTORY_LIMIT);
  assert.equal(canUndoPlanningHistory(history), false);
  assert.equal(canRedoPlanningHistory(history), false);
});

test('records changes and traverses complete snapshots with undo and redo', () => {
  const initial = document('Initial');
  const edited = document('Edited', {
    nodes: [
      ...initial.nodes,
      { id: 'node-2', name: 'Database', metadata: { tags: ['stateful'] } }
    ],
    viewport: { zoom: 1.25, pan: { x: -80, y: -40 } }
  });
  const recorded = recordPlanningHistory(createPlanningHistory(initial), edited);

  assert.equal(canUndoPlanningHistory(recorded), true);
  assert.equal(canRedoPlanningHistory(recorded), false);

  const undone = undoPlanningHistory(recorded);
  assert.deepEqual(undone.present, initial);
  assert.equal(canUndoPlanningHistory(undone), false);
  assert.equal(canRedoPlanningHistory(undone), true);

  const redone = redoPlanningHistory(undone);
  assert.deepEqual(redone.present, edited);
  assert.equal(canUndoPlanningHistory(redone), true);
  assert.equal(canRedoPlanningHistory(redone), false);
});

test('clears redo after recording a new branch', () => {
  const initial = createPlanningHistory(document('A'));
  const withB = recordPlanningHistory(initial, document('B'));
  const withC = recordPlanningHistory(withB, document('C'));
  const backAtB = undoPlanningHistory(withC);
  const branched = recordPlanningHistory(backAtB, document('D'));

  assert.equal(branched.present.name, 'D');
  assert.equal(canRedoPlanningHistory(branched), false);
  assert.strictEqual(redoPlanningHistory(branched), branched);
  assert.deepEqual(branched.past.map((entry) => entry.name), ['A', 'B']);
});

test('bounds the undo stack to the configured number of edits', () => {
  let history = createPlanningHistory(document('A'), { limit: 2 });
  history = recordPlanningHistory(history, document('B'));
  history = recordPlanningHistory(history, document('C'));
  history = recordPlanningHistory(history, document('D'));

  assert.deepEqual(history.past.map((entry) => entry.name), ['B', 'C']);
  history = undoPlanningHistory(history);
  assert.equal(history.present.name, 'C');
  history = undoPlanningHistory(history);
  assert.equal(history.present.name, 'B');
  assert.strictEqual(undoPlanningHistory(history), history);
});

test('does not add duplicate snapshots or discard redo for a no-op record', () => {
  const initial = createPlanningHistory(document('A'));
  const withB = recordPlanningHistory(initial, document('B'));
  const backAtA = undoPlanningHistory(withB);
  const duplicateWithDifferentKeyOrder = {
    name: 'A',
    schema: 'graphivo/planning-document',
    id: 'plan-1',
    version: 1,
    edges: [],
    nodes: [{ metadata: { tags: ['critical'] }, name: 'API', id: 'node-1' }],
    viewport: { pan: { y: 0, x: 0 }, zoom: 1 },
    updatedAt: '2026-07-29T00:00:00.000Z',
    createdAt: '2026-07-29T00:00:00.000Z'
  };

  const unchanged = recordPlanningHistory(backAtA, duplicateWithDifferentKeyOrder);
  assert.strictEqual(unchanged, backAtA);
  assert.equal(canRedoPlanningHistory(unchanged), true);
});

test('reset clears both stacks, preserves the limit by default, and snapshots the new document', () => {
  const original = document('A');
  const changed = recordPlanningHistory(
    createPlanningHistory(original, { limit: 7 }),
    document('B')
  );
  const replacement = document('Replacement');
  const reset = resetPlanningHistory(changed, replacement);

  replacement.name = 'Mutated outside';
  replacement.nodes[0].metadata.tags.push('outside');

  assert.equal(reset.present.name, 'Replacement');
  assert.deepEqual(reset.present.nodes[0].metadata.tags, ['critical']);
  assert.deepEqual(reset.past, []);
  assert.deepEqual(reset.future, []);
  assert.equal(reset.limit, 7);
});

test('history operations are immutable and input mutations cannot rewrite saved snapshots', () => {
  const initialDocument = document('A');
  const initialHistory = createPlanningHistory(initialDocument);
  const editedDocument = document('B');
  const recorded = recordPlanningHistory(initialHistory, editedDocument);

  initialDocument.name = 'Mutated A';
  initialDocument.nodes[0].metadata.tags.push('outside-a');
  editedDocument.name = 'Mutated B';
  editedDocument.nodes[0].metadata.tags.push('outside-b');

  assert.deepEqual(initialHistory.past, []);
  assert.equal(initialHistory.present.name, 'A');
  assert.equal(recorded.present.name, 'B');
  assert.deepEqual(recorded.past[0].nodes[0].metadata.tags, ['critical']);
  assert.deepEqual(recorded.present.nodes[0].metadata.tags, ['critical']);

  const undone = undoPlanningHistory(recorded);
  assert.notStrictEqual(undone, recorded);
  assert.deepEqual(recorded.past.map((entry) => entry.name), ['A']);
  assert.deepEqual(recorded.future, []);
});

test('rejects unusable limits', () => {
  assert.throws(() => createPlanningHistory(document('A'), { limit: 0 }), /positive integer/);
  assert.throws(() => createPlanningHistory(document('A'), { limit: 1.5 }), /positive integer/);
});

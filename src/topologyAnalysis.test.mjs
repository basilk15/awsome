import test from 'node:test';
import assert from 'node:assert/strict';
import { indexTopology, reviewPlan, simulateRemoval, tracePath } from './topologyAnalysis.mjs';

const index = indexTopology({
  nodes: ['a', 'b', 'c', 'd', 'e', 'x'].map(id => ({ data: { id } })),
  edges: ['ab', 'ac', 'bc', 'bd', 'de'].map(([source, target]) => ({ data: { source, target } }))
});

test('shortest relationship paths respect direction and retain the actual edges', () => {
  assert.equal(tracePath(index, 'e', 'a', true), null);
  assert.deepEqual(tracePath(index, 'e', 'a', false).map(s => [s.id, s.forward]), [['d', false], ['b', false], ['a', false]]);
  assert.equal(tracePath(index, 'a', 'x', false), null);
});

test('removal excludes existing islands and accounts for alternate connections', () => {
  assert.deepEqual(simulateRemoval(index, 'a', 'b'), { detached: ['d', 'e'], retained: 1 });
  assert.deepEqual(simulateRemoval(index, 'a', 'c'), { detached: [], retained: 3 });
  assert.equal(simulateRemoval(index, 'a', 'x'), null);
});

test('plan coverage scopes imported identities and preserves manual services', () => {
  const node = { provenance: 'imported-from-live', profile: 'prod', region: 'west', liveNodeId: 'a' };
  const unseen = { ...node, liveNodeId: 'other' };
  const local = { id: 'planned' };
  const rows = ['a', 'b'].map(graphId => ({ graphId, region: 'west' }));
  const nodes = [node, unseen, { ...node, region: 'east' }, { ...node, profile: 'dev' }, local];
  assert.deepEqual(reviewPlan(rows, { nodes }, 'prod', ['west']), { unplanned: [rows[1]], unseen: [unseen], local: [local] });
});

test('plan coverage matches single-region and multi-region IDs without crossing regions', () => {
  const region = 'us-east-1';
  const otherRegion = 'us-west-2';
  const node = { provenance: 'imported-from-live', profile: 'prod', region, liveNodeId: 'ec2:i-123' };
  const matching = { region, graphId: 'us-east-1::ec2:i-123' };
  const other = { region: otherRegion, graphId: 'us-west-2::ec2:i-123' };
  assert.deepEqual(reviewPlan([matching, other], { nodes: [node] }, 'prod', [region, otherRegion]), {
    unplanned: [other], unseen: [], local: []
  });
});

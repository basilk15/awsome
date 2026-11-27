import test from 'node:test';
import assert from 'node:assert/strict';
import { indexTopology, reviewPlan, simulateRemoval, tracePath } from './topologyAnalysis.mjs';
import { convertLiveTopologyToPlan } from './planning/liveTopology.mjs';
import { createPlanningDocument, deserializePlanningDocument, serializePlanningDocument } from './planningDocument.mjs';
import { resourceInventoryRows } from './resourceInventory.mjs';

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

const region = 'us-iso-east-1';
const context = { profile: 'prod', region, regions: [region] };
const targetGroupArn = `arn:aws-iso:elasticloadbalancing:${region}:123456789012:targetgroup/${'g'.repeat(32)}/0123456789abcdef`;
const lambdaArn = `arn:aws-iso:lambda:${region}:123456789012:function:${'f'.repeat(64)}:${'q'.repeat(128)}`;
const longLocalId = `target_lambda-${targetGroupArn}-${lambdaArn}-default-0`;
const scopedId = `${region}::${longLocalId}`;
const row = (graphId, rowRegion = region) => ({ graphId, region: rowRegion });
const imported = (liveNodeId) => ({ provenance: 'imported-from-live', profile: 'prod', region, liveNodeId });

test('plan coverage retains full live identity after an imported plan round-trips', () => {
  const graph = { nodes: [{ data: { id: scopedId, label: lambdaArn, type: 'target_lambda' } }], edges: [] };
  const converted = convertLiveTopologyToPlan(graph, context);
  const catalog = ['target_lambda'];
  const saved = deserializePlanningDocument(serializePlanningDocument({ ...createPlanningDocument(), ...converted }, catalog), catalog);
  const live = resourceInventoryRows(graph.nodes, context, {});
  assert.equal(saved.nodes[0].liveNodeId, scopedId);
  assert.deepEqual(reviewPlan(live, saved, context.profile, context.regions), { unplanned: [], unseen: [], local: [] });
});

test('plan coverage recovers a uniquely truncated legacy identity in either region format', () => {
  const otherRegion = 'us-iso-west-1';
  const outOfRegion = row(`${otherRegion}::${longLocalId}`, otherRegion);
  for (const [previousId, currentId] of [[scopedId, longLocalId], [longLocalId, scopedId]]) {
    const previous = imported(previousId.slice(0, 320));
    const matching = row(currentId);
    assert.deepEqual(reviewPlan([matching, outOfRegion], { nodes: [previous] }, context.profile, [region, otherRegion]), {
      unplanned: [outOfRegion], unseen: [], local: []
    });
  }
});

test('plan coverage leaves ambiguous legacy prefixes unmatched and prefers an exact identity', () => {
  const oldId = longLocalId.slice(0, 320);
  const previous = imported(oldId);
  const first = row(scopedId);
  const second = row(`${longLocalId}-another`);
  assert.deepEqual(reviewPlan([first, second], { nodes: [previous] }, context.profile, context.regions), {
    unplanned: [first, second], unseen: [previous], local: []
  });
  const exact = row(`${region}::${oldId}`);
  assert.deepEqual(reviewPlan([first, exact], { nodes: [previous] }, context.profile, context.regions), {
    unplanned: [first], unseen: [], local: []
  });
});

test('plan coverage checks the stored AWS resource ID before recovering a legacy prefix', () => {
  const previous = { ...imported(scopedId.slice(0, 320)), resourceId: lambdaArn.slice(0, 240) };
  const matching = { ...row(longLocalId), id: lambdaArn };
  const replacedArn = lambdaArn.slice(0, -28) + 'v'.repeat(28);
  const replaced = { ...row(longLocalId.replace(lambdaArn, replacedArn)), id: replacedArn };
  assert.deepEqual(reviewPlan([matching], { nodes: [previous] }, context.profile, context.regions), {
    unplanned: [], unseen: [], local: []
  });
  assert.deepEqual(reviewPlan([replaced], { nodes: [previous] }, context.profile, context.regions), {
    unplanned: [replaced], unseen: [previous], local: []
  });
});

test('plan coverage matches target registrations after their native enumeration index changes', () => {
  const target = `target_ec2-${targetGroupArn}-i-02`;
  const previous = imported(`${region}::${target}-443-1`);
  const original = row(`${target}-443-0`);
  const otherPort = row(`${target}-8443-0`);
  const ordinary = imported('ec2-i-02-1');
  const otherResource = row('ec2-i-02-0');
  assert.deepEqual(reviewPlan([original, otherPort, otherResource], { nodes: [previous, ordinary] }, context.profile, context.regions), {
    unplanned: [otherPort, otherResource], unseen: [ordinary], local: []
  });
});

test('plan coverage accounts for exact target registrations before matching unique reindexed registrations', () => {
  const target = `target_ec2-${targetGroupArn}-i-02-443`;
  const exact = imported(`${target}-0`);
  const previous = imported(`${target}-3`);
  const exactRow = row(`${region}::${target}-0`);
  const reindexed = row(`${region}::${target}-1`);
  assert.deepEqual(reviewPlan([exactRow, reindexed], { nodes: [exact, previous] }, context.profile, context.regions), {
    unplanned: [], unseen: [], local: []
  });
  const otherPrevious = imported(`${target}-4`);
  assert.deepEqual(reviewPlan([exactRow, reindexed], { nodes: [exact, previous, otherPrevious] }, context.profile, context.regions), {
    unplanned: [reindexed], unseen: [previous, otherPrevious], local: []
  });
  const secondReindexed = row(`${target}-2`);
  assert.deepEqual(reviewPlan([exactRow, reindexed, secondReindexed], { nodes: [exact, previous] }, context.profile, context.regions), {
    unplanned: [reindexed, secondReindexed], unseen: [previous], local: []
  });
});

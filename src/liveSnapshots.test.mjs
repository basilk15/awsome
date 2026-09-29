import assert from 'node:assert/strict';
import test from 'node:test';
import { compareTopologySnapshots, snapshotChangeCount, snapshotUncertainCount } from './liveSnapshots.mjs';

test('compares resources and relationships by stable ID', () => {
  const before = { nodes: [
    { data: { id: 'vpc-1', label: 'old', details: { cidr: '10.0.0.0/16' } } },
    { data: { id: 'subnet-1', label: 'removed' } }
  ], edges: [{ data: { id: 'edge-1', source: 'vpc-1', target: 'subnet-1', label: 'contains' } }] };
  const after = { nodes: [
    { data: { id: 'vpc-1', label: 'new', details: { cidr: '10.0.0.0/16' } } },
    { data: { id: 'subnet-2', label: 'added' } }
  ], edges: [{ data: { id: 'edge-2', source: 'vpc-1', target: 'subnet-2', label: 'contains' } }] };
  const diff = compareTopologySnapshots(before, after);
  assert.deepEqual(diff.nodes.added.map((node) => node.id), ['subnet-2']);
  assert.deepEqual(diff.nodes.removed.map((node) => node.id), ['subnet-1']);
  assert.deepEqual(diff.nodes.changed.map((change) => change.after.id), ['vpc-1']);
  assert.deepEqual(diff.edges.added.map((edge) => edge.id), ['edge-2']);
  assert.deepEqual(diff.edges.removed.map((edge) => edge.id), ['edge-1']);
  assert.equal(snapshotChangeCount(diff), 5);
});

test('handles empty and malformed graphs', () => {
  const diff = compareTopologySnapshots(null, { nodes: [null, {}, { data: { id: 'new' } }] });
  assert.equal(diff.nodes.added.length, 1);
  assert.equal(diff.edges.added.length, 0);
});

test('incomplete inventory is excluded from both added and removed counts', () => {
  const before = { regions: ['us-east-1'], coverage: [{ region: 'us-east-1', unavailableTypes: [], incompleteEdges: false }], nodes: [
    { data: { id: 'vpc-1', type: 'vpc', label: 'network' } },
    { data: { id: 'subnet-1', type: 'subnet', label: 'old subnet' } }
  ], edges: [{ data: { id: 'edge-1', source: 'vpc-1', target: 'subnet-1', label: 'contains' } }] };
  const after = { regions: ['us-east-1'], coverage: [{ region: 'us-east-1', unavailableTypes: ['subnet'], incompleteEdges: true }], nodes: [
    { data: { id: 'vpc-1', type: 'vpc', label: 'renamed network' } }
  ], edges: [] };
  const diff = compareTopologySnapshots(before, after);
  assert.equal(diff.nodes.removed.length, 0);
  assert.equal(diff.nodes.uncertain.length, 1);
  assert.equal(diff.edges.removed.length, 0);
  assert.equal(diff.edges.uncertain.length, 1);
  assert.equal(diff.nodes.changed.length, 1);
  assert.equal(snapshotUncertainCount(diff), 2);
});

test('failed remote region makes cross-region relationship removal uncertain', () => {
  const regions = ['eu-west-1', 'us-east-1'];
  const coverage = (remoteFailed) => [
    { region: 'eu-west-1', failed: remoteFailed, unavailableTypes: remoteFailed ? ['*'] : [], incompleteEdges: remoteFailed },
    { region: 'us-east-1', failed: false, unavailableTypes: [], incompleteEdges: false }
  ];
  const crossRegionEdge = { data: { id: 'us-east-1::edge-vpc-peering-accepter-pcx-1-vpc-2', source: 'us-east-1::vpc_peering-pcx-1', target: 'eu-west-1::vpc-vpc-2', label: 'accepted by VPC' } };
  const localEdge = { data: { id: 'us-east-1::edge-local', source: 'us-east-1::vpc-vpc-1', target: 'us-east-1::subnet-subnet-1', label: 'contains' } };
  const before = { regions, coverage: coverage(false), edges: [crossRegionEdge, localEdge] };
  const after = { regions, coverage: coverage(true), edges: [] };
  const diff = compareTopologySnapshots(before, after);
  assert.deepEqual(diff.edges.uncertain.map((edge) => edge.id), [crossRegionEdge.data.id]);
  assert.deepEqual(diff.edges.removed.map((edge) => edge.id), [localEdge.data.id]);
});

test('older warning-only snapshots compare conservatively', () => {
  const before = { warnings: ['subnet inventory unavailable'], nodes: [{ data: { id: 'subnet-1', type: 'subnet' } }] };
  const diff = compareTopologySnapshots(before, { nodes: [] });
  assert.equal(diff.nodes.removed.length, 0);
  assert.equal(diff.nodes.uncertain.length, 1);
});

test('object key order does not count as a resource change', () => {
  const before = { nodes: [{ data: { id: 'vpc-1', type: 'vpc', details: { a: '1', b: '2' } } }] };
  const after = { nodes: [{ data: { details: { b: '2', a: '1' }, type: 'vpc', id: 'vpc-1' } }] };
  assert.equal(compareTopologySnapshots(before, after).nodes.changed.length, 0);
});

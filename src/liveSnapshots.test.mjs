import assert from 'node:assert/strict';
import test from 'node:test';
import { compareTopologySnapshots, snapshotChangeCount } from './liveSnapshots.mjs';

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

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterLiveTopologyGraph,
  getLiveTopologyNodeType,
  matchesLiveTopologyNode,
  normaliseLiveTopologyTypes
} from './liveTopologyFilter.mjs';

const graph = {
  snapshot: 'example',
  nodes: [
    { data: { id: 'vpc-vpc-123', label: 'Production Network', type: 'vpc', details: { cidr: '10.0.0.0/16' } } },
    { data: { id: 'ec2-i-web', label: 'Web Server', type: 'ec2', details: { availabilityZone: 'AP-SOUTHEAST-2A', public: true } } },
    { data: { id: 'rds-orders', label: 'Orders DB', type: 'rds', details: { engine: 'postgres', port: 5432 } } },
    { data: { id: 'sg-web', label: 'Web traffic', details: { description: 'HTTPS ingress' } } }
  ],
  edges: [
    { data: { id: 'vpc-web', source: 'vpc-vpc-123', target: 'ec2-i-web', label: 'contains' } },
    { data: { id: 'web-db', source: 'ec2-i-web', target: 'rds-orders', label: 'connects' } },
    { data: { id: 'web-sg', source: 'ec2-i-web', target: 'sg-web', label: 'secured-by' } },
    { data: { id: 'dangling', source: 'ec2-i-web', target: 'missing', label: 'invalid' } }
  ]
};

test('searches labels, ids, types, and detail names and values case-insensitively', () => {
  assert.equal(matchesLiveTopologyNode(graph.nodes[1], { query: 'web server' }), true);
  assert.equal(matchesLiveTopologyNode(graph.nodes[1], { query: 'I-WEB' }), true);
  assert.equal(matchesLiveTopologyNode(graph.nodes[2], { query: 'RDS' }), true);
  assert.equal(matchesLiveTopologyNode(graph.nodes[1], { query: 'availabilityzone' }), true);
  assert.equal(matchesLiveTopologyNode(graph.nodes[2], { query: 'POSTGRES' }), true);
  assert.equal(matchesLiveTopologyNode(graph.nodes[0], { query: 'postgres' }), false);
});

test('filters by selected resource types and falls back to the AWS id prefix', () => {
  assert.deepEqual(normaliseLiveTopologyTypes([' EC2 ', 'rDs', '', null]), new Set(['ec2', 'rds']));
  assert.equal(getLiveTopologyNodeType(graph.nodes[3]), 'sg');
  assert.equal(matchesLiveTopologyNode(graph.nodes[3], { selectedTypes: new Set(['SG']) }), true);
  assert.equal(matchesLiveTopologyNode(graph.nodes[3], { selectedTypes: ['ec2'] }), false);
});

test('returns matching nodes and only edges with both retained endpoints', () => {
  const filtered = filterLiveTopologyGraph(graph, { selectedTypes: ['ec2', 'sg'] });

  assert.equal(filtered.snapshot, 'example');
  assert.deepEqual(filtered.nodes.map((node) => node.data.id), ['ec2-i-web', 'sg-web']);
  assert.deepEqual(filtered.edges.map((edge) => edge.data.id), ['web-sg']);
  assert.equal(filtered.nodes[0], graph.nodes[1]);
  assert.equal(filtered.edges[0], graph.edges[2]);
});

test('returns a safe empty graph for malformed input and ignores malformed entries', () => {
  assert.deepEqual(filterLiveTopologyGraph(null, { query: 'anything' }), { nodes: [], edges: [] });

  const filtered = filterLiveTopologyGraph({
    nodes: [null, {}, { data: { id: '', label: 'no identity' } }, graph.nodes[1]],
    edges: [null, {}, { data: { source: 'ec2-i-web', target: '' } }, graph.edges[0]]
  }, { query: 'web' });
  assert.deepEqual(filtered.nodes, [graph.nodes[1]]);
  assert.deepEqual(filtered.edges, []);
});

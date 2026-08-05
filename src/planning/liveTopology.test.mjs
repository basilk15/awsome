import assert from 'node:assert/strict';
import test from 'node:test';
import {
  convertLiveTopologyToPlan,
  IMPORTED_FROM_LIVE,
  mergePlanningGraphs,
  PLANNING_CANVAS_SIZE
} from './liveTopology.mjs';

const context = { profile: 'production', region: 'eu-west-1' };

const liveGraph = {
  nodes: [
    { data: { id: 'ec2-i-123', label: 'web-1', type: 'ec2' } },
    { data: { id: 'vpc-vpc-123', label: 'main-network', type: 'vpc' } },
    { data: { id: 'sg-sg-123', label: 'web-traffic', type: 'sg' } },
    { data: { id: 'subnet-subnet-123', label: 'public-a', type: 'subnet' } },
    { data: { id: 'rds-orders-db', label: 'orders-db', type: 'rds' } }
  ],
  edges: [
    { data: { id: 'vpc-subnet', source: 'vpc-vpc-123', target: 'subnet-subnet-123', label: 'contains' } },
    { data: { id: 'subnet-ec2', source: 'subnet-subnet-123', target: 'ec2-i-123', label: 'hosts' } },
    { data: { id: 'ec2-sg', source: 'ec2-i-123', target: 'sg-sg-123', label: 'secured-by' } },
    { data: { id: 'subnet-rds', source: 'subnet-subnet-123', target: 'rds-orders-db', label: 'contains-database' } }
  ]
};

test('converts every supported live resource and preserves snapshot metadata', () => {
  const plan = convertLiveTopologyToPlan(liveGraph, context);
  assert.equal(plan.nodes.length, 5);
  assert.deepEqual(new Set(plan.nodes.map((node) => node.serviceKey)), new Set(['vpc', 'subnet', 'ec2', 'rds', 'sg']));

  const ec2 = plan.nodes.find((node) => node.liveNodeId === 'ec2-i-123');
  assert.equal(ec2.name, 'web-1');
  assert.equal(ec2.originalResourceLabel, 'web-1');
  assert.equal(ec2.resourceId, 'i-123');
  assert.equal(ec2.liveResourceType, 'ec2');
  assert.equal(ec2.profile, 'production');
  assert.equal(ec2.region, 'eu-west-1');
  assert.equal(ec2.provenance, IMPORTED_FROM_LIVE);
  assert.equal(ec2.width, 168);
  assert.equal(ec2.height, 84);
});

test('converts the expanded live network resource set into persistable service keys', () => {
  const graph = {
    nodes: [
      { data: { id: 'igw-igw-1', type: 'igw', label: 'internet' } },
      { data: { id: 'nat-nat-1', type: 'nat', label: 'private-egress' } },
      { data: { id: 'route_table-rtb-1', type: 'route_table', label: 'public-routes' } },
      { data: { id: 'alb-alb-1', type: 'alb', label: 'web-alb' } },
      { data: { id: 'nlb-nlb-1', type: 'nlb', label: 'tcp-nlb' } }
    ],
    edges: []
  };

  const plan = convertLiveTopologyToPlan(graph, context);
  assert.deepEqual(
    new Set(plan.nodes.map((node) => node.serviceKey)),
    new Set(['igw', 'nat', 'route_table', 'alb', 'nlb'])
  );
  assert.equal(plan.nodes.every((node) => !('service' in node)), true);
});

test('imports load-balancer target groups and every registered target type', () => {
  const graph = {
    nodes: [
      { data: { id: 'target_group-web', type: 'target_group', label: 'web-targets' } },
      { data: { id: 'target_ec2-web-i-1', type: 'target_ec2', label: 'i-1' } },
      { data: { id: 'target_ip-web-10.0.0.10', type: 'target_ip', label: '10.0.0.10' } },
      { data: { id: 'target_lambda-web-worker', type: 'target_lambda', label: 'worker' } },
      { data: { id: 'target_alb-web-internal', type: 'target_alb', label: 'internal-alb' } }
    ],
    edges: [
      { data: { id: 'lb-group', source: 'target_group-web', target: 'target_ec2-web-i-1', label: 'registered EC2 target (HTTP; 8080; healthy)' } },
      { data: { id: 'group-ip', source: 'target_group-web', target: 'target_ip-web-10.0.0.10', label: 'registered IP target (HTTP; 8080; unhealthy; Target.Timeout)' } },
      { data: { id: 'group-lambda', source: 'target_group-web', target: 'target_lambda-web-worker', label: 'registered Lambda target' } },
      { data: { id: 'group-alb', source: 'target_group-web', target: 'target_alb-web-internal', label: 'registered Application Load Balancer target (HTTP; 443; healthy)' } }
    ]
  };

  const plan = convertLiveTopologyToPlan(graph, context);
  assert.deepEqual(
    new Set(plan.nodes.map((node) => node.serviceKey)),
    new Set(['target_group', 'target_ec2', 'target_ip', 'target_lambda', 'target_alb'])
  );
  assert.equal(plan.edges.length, 4);
  assert.equal(plan.edges.find((edge) => edge.sourceEdgeId === 'group-ip').label, 'registered IP target (HTTP; 8080; unhealthy; Target.Timeout)');
});

test('layout is deterministic, graph-ranked, bounded, and non-overlapping for an ordinary graph', () => {
  const first = convertLiveTopologyToPlan(liveGraph, context);
  const reordered = convertLiveTopologyToPlan({
    nodes: [...liveGraph.nodes].reverse(),
    edges: [...liveGraph.edges].reverse()
  }, context);
  assert.deepEqual(first, reordered);

  const byLiveId = new Map(first.nodes.map((node) => [node.liveNodeId, node]));
  assert.ok(byLiveId.get('vpc-vpc-123').x < byLiveId.get('subnet-subnet-123').x);
  assert.ok(byLiveId.get('subnet-subnet-123').x < byLiveId.get('ec2-i-123').x);
  for (const node of first.nodes) {
    assert.ok(node.x >= 0 && node.x + node.width <= PLANNING_CANVAS_SIZE);
    assert.ok(node.y >= 0 && node.y + node.height <= PLANNING_CANVAS_SIZE);
  }
  for (let leftIndex = 0; leftIndex < first.nodes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < first.nodes.length; rightIndex += 1) {
      const left = first.nodes[leftIndex];
      const right = first.nodes[rightIndex];
      const overlaps = left.x < right.x + right.width
        && left.x + left.width > right.x
        && left.y < right.y + right.height
        && left.y + left.height > right.y;
      assert.equal(overlaps, false);
    }
  }
});

test('preserves valid relationship labels and direction with stable unique edge ids', () => {
  const graph = {
    nodes: liveGraph.nodes,
    edges: [
      ...liveGraph.edges,
      { data: { id: 'vpc-subnet', source: 'vpc-vpc-123', target: 'sg-sg-123', label: 'owns' } }
    ]
  };
  const plan = convertLiveTopologyToPlan(graph, context);
  assert.equal(plan.edges.length, 5);
  assert.equal(new Set(plan.edges.map((edge) => edge.id)).size, 5);
  const relationship = plan.edges.find((edge) => edge.sourceEdgeId === 'subnet-ec2');
  assert.equal(relationship.source, 'live:subnet-subnet-123');
  assert.equal(relationship.target, 'live:ec2-i-123');
  assert.equal(relationship.label, 'hosts');
  assert.equal(relationship.provenance, IMPORTED_FROM_LIVE);
});

test('append keeps planning work and deduplicates repeated live imports', () => {
  const imported = convertLiveTopologyToPlan(liveGraph, context);
  const manualNode = {
    id: 'lambda-manual',
    serviceKey: 'lambda',
    x: 20,
    y: 20,
    width: 168,
    height: 84,
    name: 'New worker'
  };
  const firstMerge = mergePlanningGraphs({ nodes: [manualNode], edges: [] }, imported);
  const renamedImportedId = firstMerge.nodes.find((node) => node.provenance === IMPORTED_FROM_LIVE).id;
  const editedFirstMerge = {
    ...firstMerge,
    nodes: firstMerge.nodes.map((node) => node.id === renamedImportedId ? { ...node, name: 'Edited in plan' } : node)
  };
  const repeatedMerge = mergePlanningGraphs(editedFirstMerge, imported);
  assert.equal(firstMerge.nodes.length, imported.nodes.length + 1);
  assert.equal(firstMerge.edges.length, imported.edges.length);
  assert.equal(repeatedMerge.nodes.length, editedFirstMerge.nodes.length);
  assert.equal(repeatedMerge.edges.length, editedFirstMerge.edges.length);
  assert.equal(repeatedMerge.nodes.find((node) => node.id === renamedImportedId).name, 'Edited in plan');
  assert.equal(repeatedMerge.nodes.find((node) => node.id === manualNode.id).name, 'New worker');
});

test('deduplication is scoped to the loaded profile and region', () => {
  const ireland = convertLiveTopologyToPlan(liveGraph, context);
  const sydney = convertLiveTopologyToPlan(liveGraph, { profile: 'production', region: 'ap-southeast-2' });
  const merged = mergePlanningGraphs(ireland, sydney);
  assert.equal(merged.nodes.length, ireland.nodes.length + sydney.nodes.length);
  assert.equal(merged.edges.length, ireland.edges.length + sydney.edges.length);
  assert.equal(new Set(merged.nodes.map((node) => node.id)).size, merged.nodes.length);
  assert.equal(new Set(merged.edges.map((edge) => edge.id)).size, merged.edges.length);
});

test('skips malformed, unsupported, duplicate, and dangling input without throwing', () => {
  const plan = convertLiveTopologyToPlan({
    nodes: [
      null,
      {},
      { data: { id: '', type: 'ec2' } },
      { data: { id: 'bucket-1', type: 's3', label: 'unsupported-live-type' } },
      { data: { id: 'vpc-vpc-1', type: 'vpc', label: 'network' } },
      { data: { id: 'vpc-vpc-1', type: 'vpc', label: 'duplicate' } },
      { data: { id: 'subnet-subnet-1', type: 'subnet', label: '' } }
    ],
    edges: [
      null,
      { data: { id: 'valid', source: 'vpc-vpc-1', target: 'subnet-subnet-1', label: '' } },
      { data: { id: 'dangling', source: 'vpc-vpc-1', target: 'ec2-missing', label: 'hosts' } },
      { data: { source: '', target: 'subnet-subnet-1' } }
    ]
  }, {});

  assert.equal(plan.nodes.length, 2);
  assert.equal(plan.edges.length, 1);
  assert.equal(plan.edges[0].label, 'AWS relationship');
  assert.equal(plan.nodes.find((node) => node.liveResourceType === 'subnet').name, 'subnet-1');
  assert.equal(plan.nodes[0].profile, 'default');
  assert.equal(plan.nodes[0].region, 'unknown');
});

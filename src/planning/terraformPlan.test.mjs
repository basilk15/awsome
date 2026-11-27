import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlanningDocument, deserializePlanningDocument, serializePlanningDocument } from '../planningDocument.mjs';
import { readTerraformPlan, serializeTerraformChangeSummary } from './terraformPlan.mjs';

const AWS = 'registry.terraform.io/hashicorp/aws';

function resource(address, values = {}, extra = {}) {
  const [, type, name] = /(?:^|\.)(aws_\w+)\.([\w-]+)(?:\[|$)/.exec(address);
  return { address, type, name, mode: 'managed', provider_name: AWS, values, ...extra };
}

function plan(resources, extra = {}) {
  return { format_version: '1.2', terraform_version: '1.9.5', planned_values: { root_module: { resources } }, ...extra };
}

function read(input, fileName = 'staging.tfplan.json') {
  return readTerraformPlan(JSON.stringify(input), fileName);
}

function change(address, actions, extra = {}) {
  return {
    address, mode: 'managed', provider_name: AWS,
    change: { actions, before: { password: 'secret-before' }, after: { password: 'secret-after' } },
    ...extra
  };
}

function relationships({ nodes, edges }) {
  const addresses = new Map(nodes.map(node => [node.id, node.terraformAddress]));
  return edges.map(edge => [addresses.get(edge.source), addresses.get(edge.target), edge.label]);
}

test('imports the proposed managed AWS topology without copying Terraform values', () => {
  const resources = [
    resource('aws_vpc.main', { id: 'vpc-example', tags: { Name: 'private-input' } }),
    resource('aws_subnet.public', { vpc_id: 'vpc-example', id: 'subnet-example' }),
    resource('aws_instance.web', { subnet_id: 'subnet-example', user_data: 'secret-script', vpc_security_group_ids: ['sg-example'] }),
    resource('aws_security_group.web', { id: 'sg-example', vpc_id: 'vpc-example' }),
    resource('aws_db_instance.main', { password: 'secret-password' }),
    resource('aws_s3_bucket.lookup', {}, { mode: 'data' }),
    resource('aws_s3_bucket.foreign', {}, { provider_name: 'registry.terraform.io/example/aws' }),
    resource('aws_unknown.example')
  ];
  const result = read(plan(resources, {
    resource_changes: [{ address: 'aws_subnet.deleted', change: { actions: ['delete'] } }],
    output_changes: { secret: { after: 'secret-output' } }
  }));

  assert.equal(result.name, 'Terraform · staging');
  assert.equal(result.skippedResources, 1);
  assert.deepEqual(result.nodes.map(({ terraformAddress, serviceKey }) => [terraformAddress, serviceKey]), [
    ['aws_db_instance.main', 'rds'], ['aws_instance.web', 'ec2'], ['aws_security_group.web', 'sg'],
    ['aws_subnet.public', 'subnet'], ['aws_vpc.main', 'vpc']
  ]);
  assert.deepEqual(relationships(result).sort(), [
    ['aws_instance.web', 'aws_security_group.web', 'Uses security group'],
    ['aws_subnet.public', 'aws_instance.web', 'Hosts'],
    ['aws_vpc.main', 'aws_security_group.web', 'Contains'],
    ['aws_vpc.main', 'aws_subnet.public', 'Contains']
  ]);
  assert.doesNotMatch(JSON.stringify(result), /private-input|secret-|vpc-example|sg-example|subnet-example/);

  const catalog = ['rds', 'ec2', 'sg', 'subnet', 'vpc'];
  const document = { ...createPlanningDocument({ name: result.name }), nodes: result.nodes, edges: result.edges };
  const exported = serializePlanningDocument(document, catalog);
  assert.deepEqual(deserializePlanningDocument(exported, catalog), document);
});

test('resolves indexed relationships within the correct nested module instance', () => {
  const keys = ['blue.east', 'green'];
  const children = keys.map(key => {
    const address = `module.zone[${JSON.stringify(key)}]`;
    return { address, child_modules: [{ address: `${address}.module.net`, resources: [
      resource(`${address}.module.net.aws_vpc.network`),
      resource(`${address}.module.net.aws_subnet.private[0]`),
      resource(`${address}.module.net.aws_subnet.private[1]`),
      resource(`${address}.module.net.aws_instance.worker`)
    ] }] };
  });
  const result = read(plan([], {
    planned_values: { root_module: { child_modules: children } },
    configuration: { root_module: { module_calls: { zone: { module: { module_calls: { net: { module: { resources: [
      { address: 'aws_subnet.private', expressions: { vpc_id: { references: ['aws_vpc.network.id', 'aws_vpc.network'] } } },
      { address: 'aws_instance.worker', expressions: { subnet_id: { references: ['aws_subnet.private[1].id', 'aws_subnet.private[1]', 'aws_subnet.private'] } } }
    ] } } } } } } } }
  }));

  assert.equal(result.nodes.length, 8);
  assert.deepEqual(relationships(result).sort(), keys.flatMap(key => {
    const prefix = `module.zone[${JSON.stringify(key)}].module.net.`;
    return [
      [`${prefix}aws_instance.worker`, `${prefix}aws_subnet.private[1]`, 'Terraform reference · subnet_id'],
      [`${prefix}aws_subnet.private[0]`, `${prefix}aws_vpc.network`, 'Terraform reference · vpc_id'],
      [`${prefix}aws_subnet.private[1]`, `${prefix}aws_vpc.network`, 'Terraform reference · vpc_id']
    ];
  }).sort());
});

test('keeps sensitive, external and ambiguous references out of the resolved graph', () => {
  const result = read(plan([
    resource('aws_vpc.main', { id: 'vpc-common' }),
    resource('aws_vpc.other', { id: 'vpc-common' }),
    resource('aws_vpc.sensitive', { id: 'vpc-secret' }, { sensitive_values: { id: true } }),
    resource('aws_subnet.ambiguous', { vpc_id: 'vpc-common' }),
    resource('aws_subnet.external', { vpc_id: 'vpc-external' }),
    resource('aws_subnet.sensitive_id', { vpc_id: 'vpc-secret' }),
    resource('aws_subnet.sensitive_ref', { vpc_id: 'vpc-common' }, { sensitive_values: { vpc_id: true } }),
    resource('aws_subnet.uncertain'),
    resource('aws_internet_gateway.detached')
  ], {
    configuration: { root_module: { resources: [
      { address: 'aws_subnet.external', expressions: { vpc_id: { references: ['aws_vpc.main.id'] } } },
      { address: 'aws_subnet.sensitive_ref', expressions: { vpc_id: { references: ['aws_vpc.main.id'] } } },
      { address: 'aws_subnet.uncertain', expressions: { vpc_id: { references: ['aws_vpc.main.id', 'aws_vpc.other.id'] } } },
      { address: 'aws_internet_gateway.detached', expressions: { vpc_id: { constant_value: null, references: ['aws_vpc.main.id'] } } }
    ] } }
  }));
  assert.deepEqual(result.edges, []);
});

test('resolves unknown load balancer inputs and forward actions with Terraform sensitivity masks', () => {
  const result = read(plan([
    resource('aws_lb.web', { load_balancer_type: 'application', subnets: ['subnet-known', null] }, { sensitive_values: { subnets: [false, false] } }),
    resource('aws_subnet.public[0]', { id: 'subnet-known' }),
    resource('aws_subnet.public[1]'),
    resource('aws_lb_target_group.web'),
    resource('aws_lb_target_group.canary', { arn: 'arn:canary' }),
    resource('aws_lb_listener.web', { default_action: [{ type: 'forward' }] }, { sensitive_values: { default_action: [{ forward: [] }] } }),
    resource('aws_lb_listener_rule.weighted', { action: [{ type: 'forward', forward: [{ target_group: [{ arn: 'arn:canary', weight: 10 }, { weight: 90 }] }] }] }),
    resource('aws_lb_listener_rule.private', { action: [{ type: 'forward', target_group_arn: 'arn:canary' }] }, { sensitive_values: { action: [{ target_group_arn: true }] } })
  ], {
    configuration: { root_module: { resources: [
      { address: 'aws_lb.web', expressions: { subnets: { references: ['aws_subnet.public[0].id', 'aws_subnet.public[1].id'] } } },
      { address: 'aws_lb_listener.web', expressions: { default_action: [{ type: { constant_value: 'forward' }, target_group_arn: { references: ['aws_lb_target_group.web.arn'] } }] } },
      { address: 'aws_lb_listener_rule.weighted', expressions: { action: [{ type: { constant_value: 'forward' }, forward: [{ target_group: [
        { arn: { references: ['aws_lb_target_group.web.arn'] } }, { arn: { references: ['aws_lb_target_group.canary.arn'] } }
      ] }] }] } }
    ] } }
  }));

  assert.deepEqual(relationships(result).sort(), [
    ['aws_lb.web', 'aws_subnet.public[1]', 'Terraform reference · subnets'],
    ['aws_lb_listener.web', 'aws_lb_target_group.web', 'Terraform reference · target group'],
    ['aws_lb_listener_rule.weighted', 'aws_lb_target_group.canary', 'Forwards to'],
    ['aws_lb_listener_rule.weighted', 'aws_lb_target_group.web', 'Terraform reference · target group'],
    ['aws_subnet.public[0]', 'aws_lb.web', 'Hosts']
  ].sort());
});

test('labels unknown route endpoints as configuration references', () => {
  const graph = read(plan([
    resource('aws_route_table.edge'),
    resource('aws_nat_gateway.egress'),
    resource('aws_route.main')
  ], {
    configuration: { root_module: { resources: [
      { address: 'aws_route.main', expressions: {
        route_table_id: { references: ['aws_route_table.edge.id'] },
        nat_gateway_id: { references: ['aws_nat_gateway.egress.id'] }
      } }
    ] } }
  }));
  assert.deepEqual(relationships(graph), [
    ['aws_route_table.edge', 'aws_nat_gateway.egress', 'Terraform reference · aws_route']
  ]);
});

test('imports subnet mapping blocks when the load balancer has no direct subnet list', () => {
  const result = read(plan([
    resource('aws_lb.web', { load_balancer_type: 'network', subnet_mapping: [{ subnet_id: 'subnet-known' }, {}] }),
    resource('aws_subnet.known', { id: 'subnet-known' }),
    resource('aws_subnet.unknown')
  ], { configuration: { root_module: { resources: [
    { address: 'aws_lb.web', expressions: { subnet_mapping: [
      { subnet_id: { references: ['aws_subnet.unknown.id'] } }, { subnet_id: { references: ['aws_subnet.known.id'] } }
    ] } }
  ] } } }));
  assert.deepEqual(relationships(result).sort(), [
    ['aws_lb.web', 'aws_subnet.unknown', 'Terraform reference · subnet_mapping'],
    ['aws_subnet.known', 'aws_lb.web', 'Hosts']
  ]);
});

test('imports common routing and load balancer relationships without extra resource nodes', () => {
  const result = read(plan([
    resource('aws_subnet.public', { id: 'subnet-public' }),
    resource('aws_route_table.public', { id: 'rtb-public' }),
    resource('aws_internet_gateway.main', { id: 'igw-main' }),
    resource('aws_route_table_association.public', { route_table_id: 'rtb-public', subnet_id: 'subnet-public' }),
    resource('aws_route.default', { route_table_id: 'rtb-public', gateway_id: 'igw-main' }),
    resource('aws_lb.web', { load_balancer_type: 'application', arn: 'arn:lb', subnets: ['subnet-public'] }),
    resource('aws_lb_listener.web', { load_balancer_arn: 'arn:lb', default_action: [{ type: 'forward', target_group_arn: 'arn:tg' }] }),
    resource('aws_lb_target_group.web', { arn: 'arn:tg' }),
    resource('aws_lb_target_group_attachment.web', { target_group_arn: 'arn:tg', target_id: 'i-web' }),
    resource('aws_instance.web', { id: 'i-web' })
  ], { complete: false }));

  assert.equal(result.nodes.length, 7);
  assert.equal(result.skippedResources, 0);
  assert.equal(result.incomplete, true);
  assert.deepEqual(relationships(result).sort(), [
    ['aws_lb.web', 'aws_lb_listener.web', 'Has listener'],
    ['aws_lb_listener.web', 'aws_lb_target_group.web', 'Forwards to'],
    ['aws_lb_target_group.web', 'aws_instance.web', 'Registers target'],
    ['aws_route_table.public', 'aws_internet_gateway.main', 'Routes to'],
    ['aws_subnet.public', 'aws_lb.web', 'Hosts'],
    ['aws_subnet.public', 'aws_route_table.public', 'Uses route table']
  ].sort());
});

test('reviews managed HashiCorp AWS action metadata independently of the graph', () => {
  const indexed = 'module.zone["blue.east"].aws_instance.worker[0]';
  const result = read(plan([resource('aws_vpc.main')], {
    resource_changes: [
      change('aws_vpc.main', ['create']),
      change('aws_iam_policy.unsupported', ['update']),
      change('aws_instance.before_destroy', ['create', 'delete']),
      change(indexed, ['delete', 'create']),
      change('aws_subnet.deleted', ['delete']),
      change('aws_subnet.deleted', ['delete'], { deposed: 'old-object' }),
      change('aws_s3_bucket.unchanged', ['no-op']),
      change('aws_s3_bucket.read', ['read']),
      change('aws_s3_bucket.data', ['delete'], { mode: 'data' }),
      change('aws_s3_bucket.foreign', ['delete'], { provider_name: 'registry.terraform.io/other/aws' }),
      change('aws_s3_bucket.legacy', ['create'], { provider_name: 'aws' }),
      change('aws_s3_bucket.future', ['forget']),
      change('aws_s3_bucket.malformed', 'delete'),
      change('aws_s3_bucket.malformed', ['delete,create']),
      change('', ['delete']),
      null
    ],
    resource_drift: [change('aws_vpc.drifted', ['delete'])],
    output_changes: { secret: { after: 'secret-output' } }
  }));

  assert.deepEqual(Object.entries(result.changes), [
    ['delete', ['aws_subnet.deleted', 'aws_subnet.deleted']],
    ['replace', ['aws_instance.before_destroy', indexed]],
    ['update', ['aws_iam_policy.unsupported']],
    ['create', ['aws_s3_bucket.legacy', 'aws_vpc.main']]
  ]);
  assert.deepEqual(result.nodes.map(node => node.terraformAddress), ['aws_vpc.main']);
  assert.doesNotMatch(JSON.stringify(result), /secret-|old-object|drifted/);
});

test('reviews deletion-only and unsupported-only plans without a graph', () => {
  const deleted = read(plan([], {
    planned_values: {},
    resource_changes: [change('aws_instance.removed', ['delete'])]
  }));
  assert.deepEqual(deleted.changes.delete, ['aws_instance.removed']);
  assert.deepEqual(deleted.nodes, []);
  assert.deepEqual(deleted.edges, []);

  const unsupported = read(plan([resource('aws_iam_policy.new')], {
    resource_changes: [change('aws_iam_policy.new', ['create'])]
  }));
  assert.deepEqual(unsupported.changes.create, ['aws_iam_policy.new']);
  assert.deepEqual(unsupported.nodes, []);
  assert.equal(unsupported.skippedResources, 1);
});

test('serializes only the ordered change summary from a Terraform review', () => {
  const indexed = 'module.zone["blue.east"].aws_instance.worker[0]';
  const review = read(plan([
    resource('aws_vpc.main', { id: 'vpc-private' }),
    resource('aws_subnet.new', { vpc_id: 'vpc-private' })
  ], {
    complete: false,
    resource_changes: [
      change('aws_subnet.new', ['create']),
      change('aws_iam_policy.unsupported', ['update']),
      change(indexed, ['delete', 'create']),
      change('aws_subnet.old', ['delete']),
      change('aws_subnet.old', ['delete'], { deposed: 'old-object' })
    ],
    output_changes: { secret: { after: 'secret-output' } }
  }));

  assert.equal(review.nodes.length, 2);
  assert.equal(review.edges.length, 1);
  const summary = JSON.parse(serializeTerraformChangeSummary({
    ...review,
    fileName: 'private.tfplan.json',
    changes: { ...review.changes, drift: ['aws_subnet.drifted'] }
  }));
  assert.deepEqual(Object.keys(summary), ['version', 'incomplete', 'changes']);
  assert.equal(summary.version, 1);
  assert.equal(summary.incomplete, true);
  assert.deepEqual(Object.entries(summary.changes), [
    ['delete', ['aws_subnet.old', 'aws_subnet.old']],
    ['replace', [indexed]],
    ['update', ['aws_iam_policy.unsupported']],
    ['create', ['aws_subnet.new']]
  ]);
});

test('serializes all four empty action groups from a review without a topology', () => {
  const summary = JSON.parse(serializeTerraformChangeSummary(read(plan([]))));
  assert.deepEqual(summary, {
    version: 1,
    incomplete: false,
    changes: { delete: [], replace: [], update: [], create: [] }
  });
});

test('supports empty changes and preserves format, failed-plan and address validation', () => {
  assert.equal(read({ schema: 'graphivo/planning-document', version: 1 }), null);
  assert.throws(() => read({ ...plan([]), format_version: '2.0' }), /format version/);
  assert.throws(() => read({ ...plan([]), errored: true }), /failed/);
  assert.throws(() => read({ format_version: '1.0', terraform_version: '1.0.0', values: {} }), /saved Terraform plan/);
  assert.throws(() => read(plan([resource('aws_vpc.main', {}, { name: 'mismatch' })])), /invalid Terraform address/);
  const empty = read(plan([]));
  assert.deepEqual(empty.changes, { delete: [], replace: [], update: [], create: [] });
  assert.deepEqual(empty.nodes, []);
  assert.equal(readTerraformPlan(`\ufeff${JSON.stringify(plan([resource('aws_vpc.main')]))}`, '.json').name, 'Terraform plan');
});

test('lays out a crowded plan without stacking unrelated services', () => {
  const resources = Array.from({ length: 60 }, (_, index) => resource(`aws_s3_bucket.bucket_${index}`));
  const { nodes } = read(plan(resources));
  for (const [index, node] of nodes.entries()) {
    assert.ok(nodes.slice(0, index).every(other => Math.abs(node.x - other.x) >= node.width
      || Math.abs(node.y - other.y) >= node.height));
  }
});

test('uses the Aurora icon only for RDS clusters with an Aurora engine', () => {
  const { nodes } = read(plan([
    resource('aws_rds_cluster.aurora', { engine: 'aurora-postgresql' }),
    resource('aws_rds_cluster.multi_az', { engine: 'mysql' })
  ]));
  assert.deepEqual(nodes.map(node => node.serviceKey), ['aurora', 'rds']);
});

test('imports Transit Gateways and their relationships with the planning catalog key', () => {
  const graph = read(plan([
    resource('aws_ec2_transit_gateway.hub', { id: 'tgw-hub' }),
    resource('aws_ec2_transit_gateway_vpc_attachment.site', { transit_gateway_id: 'tgw-hub' }),
    resource('aws_ec2_transit_gateway_route_table.hub', { transit_gateway_id: 'tgw-hub' }),
    resource('aws_route_table.site', { id: 'rtb-site' }),
    resource('aws_route.hub', { route_table_id: 'rtb-site', transit_gateway_id: 'tgw-hub' })
  ]));
  const document = { ...createPlanningDocument(), nodes: graph.nodes, edges: graph.edges };
  serializePlanningDocument(document, ['transit', 'transit_gateway_attachment', 'transit_gateway_route_table', 'route_table']);
  assert.deepEqual(relationships(graph).sort(), [
    ['aws_ec2_transit_gateway.hub', 'aws_ec2_transit_gateway_route_table.hub', 'Contains'],
    ['aws_ec2_transit_gateway.hub', 'aws_ec2_transit_gateway_vpc_attachment.site', 'Contains'],
    ['aws_route_table.site', 'aws_ec2_transit_gateway.hub', 'Routes to']
  ]);
});

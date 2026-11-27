import assert from 'node:assert/strict';
import test from 'node:test';
import * as inventory from './resourceInventory.mjs';

test('projects filtered nodes into inventory rows with distinct regional graph keys', () => {
  const nodes = [
    { data: { id: 'us-east-1::vpc-vpc-1', label: 'Core network' } },
    { data: { id: 'us-west-2::vpc-vpc-1', type: 'vpc', region: 'us-west-2' } },
    { data: { id: 'us-east-1::target_ip-2001:db8::42-443-0', label: '2001:db8::42' } }
  ];
  assert.deepEqual(inventory.resourceInventoryRows(nodes, { profile: 'team' }, { vpc: { heading: 'VPC', fallbackColor: '#123456' } }), [
    { graphId: 'us-east-1::vpc-vpc-1', name: 'Core network', id: 'vpc-1', type: 'VPC', region: 'us-east-1', profile: 'team', color: '#123456' },
    { graphId: 'us-west-2::vpc-vpc-1', name: 'vpc-1', id: 'vpc-1', type: 'VPC', region: 'us-west-2', profile: 'team', color: '#123456' },
    { graphId: 'us-east-1::target_ip-2001:db8::42-443-0', name: '2001:db8::42', id: '2001:db8::42', type: 'target_ip', region: 'us-east-1', profile: 'team', color: undefined }
  ]);
});
import { inventoryResourceId, resourceInventoryCsv } from './resourceInventory.mjs';

test('inventory CSV quotes multiline fields and neutralizes spreadsheet formulas', () => {
  const csv = resourceInventoryCsv([{ name: 'job, "blue"\nworker', id: 'i-42', type: 'EC2', region: 'eu-west-1', profile: ' =SUM(A1)' }]);
  assert.equal(csv, '"Name","Resource ID","Type","Region","Profile"\r\n"job, ""blue""\nworker","i-42","EC2","eu-west-1","\' =SUM(A1)"\r\n');
});

test('exports the AWS target ID for an IPv6 load balancer registration', () => {
  const label = '2001:db8::42';
  const localId = `target_ip-arn:aws:elasticloadbalancing:us-east-1:123:targetgroup/web/one-${label}-443-0`;
  assert.equal(inventoryResourceId({ label }, localId, 'target_ip'), label);
});

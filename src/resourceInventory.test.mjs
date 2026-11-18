import assert from 'node:assert/strict';
import test from 'node:test';
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

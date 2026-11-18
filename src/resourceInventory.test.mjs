import assert from 'node:assert/strict';
import test from 'node:test';
import { resourceInventoryCsv } from './resourceInventory.mjs';

test('inventory CSV quotes multiline fields and neutralizes spreadsheet formulas', () => {
  const csv = resourceInventoryCsv([{ name: 'job, "blue"\nworker', id: 'i-42', type: 'EC2', region: 'eu-west-1', profile: ' =SUM(A1)' }]);
  assert.equal(csv, '"Name","Resource ID","Type","Region","Profile"\r\n"job, ""blue""\nworker","i-42","EC2","eu-west-1","\' =SUM(A1)"\r\n');
});

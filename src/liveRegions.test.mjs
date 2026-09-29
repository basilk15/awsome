import assert from 'node:assert/strict';
import test from 'node:test';
import { graphRegions, normaliseScanRegions, sameScanSource } from './liveRegions.mjs';

test('normalises and compares multi-region source sets regardless of selection order', () => {
  assert.deepEqual(normaliseScanRegions('US-EAST-1', ['ap-southeast-2', ' us-east-1 ']), ['ap-southeast-2', 'us-east-1']);
  assert.equal(sameScanSource('team', ['us-east-1', 'ap-southeast-2'], 'team', ['ap-southeast-2', 'us-east-1']), true);
  assert.equal(sameScanSource('team', ['us-east-1'], 'other', ['us-east-1']), false);
});

test('reads saved graph regions and older single-region metadata', () => {
  assert.deepEqual(graphRegions({ regions: ['us-east-1', 'eu-west-1'] }), ['eu-west-1', 'us-east-1']);
  assert.deepEqual(graphRegions({}, 'us-east-1'), ['us-east-1']);
});

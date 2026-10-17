import test from 'node:test';
import assert from 'node:assert/strict';
import { splitBatches, loadPlan } from './migrate.mjs';

test('splits GO delimiters without splitting embedded words', () => {
  assert.deepEqual(splitBatches('SELECT 1;\nGO\nSELECT N\'GONE\';\ngo\n'), ['SELECT 1;', "SELECT N'GONE';"]);
});
test('supports GO repeat count', () => assert.deepEqual(splitBatches('SELECT 1\nGO 2'), ['SELECT 1','SELECT 1']));
test('rejects unreasonable GO repeats', () => assert.throws(() => splitBatches('SELECT 1\nGO 1000')));
test('Athena migration manifest has expected ordered SQL files', async () => {
  const items = await loadPlan('ATHENA');
  assert.equal(items.length, 9);
  assert.equal(items[0].name, '001_his_foundation.sql');
  assert.ok(items.every(item => item.sha256.length === 64 && item.batches.length > 0));
});

test('isolated migration plans are ordered and contain no duplicate names', async () => {
  for (const [role, expected] of [['PLATFORM_ISOLATED', 2], ['TELEMETRY_ISOLATED', 4], ['BAS_EMS_ISOLATED', 10]]) {
    const items = await loadPlan(role);
    assert.equal(items.length, expected, role);
    assert.equal(new Set(items.map(item => item.name)).size, expected, role);
    assert.ok(items.every(item => item.sha256.length === 64 && item.batches.length > 0), role);
  }
});

test('isolated migrations contain no cross-database foreign key references', async () => {
  for (const [role, forbidden] of [
    ['PLATFORM_ISOLATED', /\bREFERENCES\s+(?:Telemetry|Energy)\./i],
    ['TELEMETRY_ISOLATED', /\bREFERENCES\s+(?:Platform|Energy)\./i],
    ['BAS_EMS_ISOLATED', /\bREFERENCES\s+(?:Platform|Telemetry)\./i]
  ]) {
    const items = await loadPlan(role);
    for (const item of items) {
      for (const batch of item.batches) {
        assert.doesNotMatch(batch, forbidden, role + '/' + item.name);
      }
    }
  }
});

test('development tenant seeds are excluded from isolated Platform migration plan', async () => {
  const items = await loadPlan('PLATFORM_ISOLATED');
  assert.ok(items.every(item => !item.name.toLowerCase().includes('dev')));
  assert.ok(items.every(item => item.batches.every(batch => !batch.includes('11111111-1111-4111-8111-111111111111'))));
});

test('isolated migration batches do not contain embedded Unicode byte-order marks', async () => {
  for (const role of ['PLATFORM_ISOLATED', 'TELEMETRY_ISOLATED', 'BAS_EMS_ISOLATED']) {
    for (const item of await loadPlan(role)) {
      for (const batch of item.batches) {
        assert.ok(!batch.includes('\uFEFF'), role + '/' + item.name + ' contains a BOM');
      }
    }
  }
});

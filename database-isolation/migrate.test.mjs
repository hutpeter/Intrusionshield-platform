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

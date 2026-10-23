import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entityOrder } from '../shared/entities.mjs';
import { readFile } from 'node:fs/promises';
import { recordsToCsv, recordsToJson } from '../shared/export.mjs';

test('dedicated workspace tasks table exists without changing the eight-entity catalog', async () => {
  assert.equal(entityOrder.length, 8);
  const schema = await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS workspace_tasks/);
  const app = await readFile(new URL('../server/app.mjs', import.meta.url), 'utf8');
  assert.match(app, /app\.get\('\/api\/tasks'/);
  assert.match(app, /app\.patch\('\/api\/tasks\/:id'/);
});

test('export preserves false, 0 and empty values in CSV and JSON', () => {
  const rows = [{ name: 'Review proof', count: 0, active: false, note: '' }];
  assert.match(recordsToCsv(rows, ['name', 'count', 'active', 'note']), /Review proof,0,false,/);
  const parsed = JSON.parse(recordsToJson(rows));
  assert.equal(parsed.records[0].count, 0);
  assert.equal(parsed.records[0].active, false);
  assert.equal(parsed.records[0].note, '');
});

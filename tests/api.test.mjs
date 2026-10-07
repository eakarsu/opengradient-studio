import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import os from 'node:os';
import pg from 'pg';
import { entities, entityOrder, defaultsFor } from '../shared/entities.mjs';

// All writes happen in a uniquely named disposable database, never the workspace DB.
const database = `opengradient_studio_test_${randomBytes(6).toString('hex')}`;
const baseUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const adminConfig = baseUrl ? { connectionString: new URL('/postgres', baseUrl).toString() } : {
  host: process.env.PGHOST || '127.0.0.1', port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || os.userInfo().username, password: process.env.PGPASSWORD, database: 'postgres',
};
const admin = new pg.Client({ ...adminConfig, connectionTimeoutMillis: 5000 });
let server, pool, transaction, seed, endpoint, createdDatabase = false;
let model, node, inference;

async function request(path, method = 'GET', body, expected = 200, headers = {}) {
  const response = await fetch(`${endpoint}/api${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const data = response.status === 204 ? null : await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
  return data;
}

before(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);
  createdDatabase = true;
  if (baseUrl) { baseUrl.pathname = `/${database}`; process.env.DATABASE_URL = baseUrl.toString(); }
  else process.env.PGDATABASE = database;
  ({ pool, transaction } = await import('../server/db.mjs'));
  ({ seed } = await import('../server/seed.mjs'));
  const sql = await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8');
  await transaction(async client => { await client.query(sql); await seed(client); });
  const { default: app } = await import('../server/app.mjs');
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  endpoint = `http://127.0.0.1:${server.address().port}`;
  model = (await request('/models?status=Published')).rows[0];
  node = (await request('/nodes?status=Online')).rows[0];
  inference = (await request('/inferences?status=Completed')).rows[0];
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (pool) await pool.end();
  if (createdDatabase) await admin.query(`DROP DATABASE "${database}"`);
  await admin.end();
});

test('health and all eight features have at least fifteen persisted seed rows', async () => {
  assert.equal((await request('/health')).database, 'postgresql');
  const overview = await request('/overview');
  assert.equal(Object.keys(overview.counts).length, 8);
  for (const entity of entityOrder) {
    const result = await request(`/${entity}`);
    assert.ok(result.total >= 15, `${entity} seeded`);
    assert.equal(result.rows.length, 15, `${entity} shows fifteen records per page`);
    assert.equal(overview.counts[entity], result.total);
  }
  assert.equal(overview.chart.length, 14);
  assert.equal((await request('/overview?days=7')).chart.length, 7);
});

test('every module supports create, read, update, persistence, conflict protection, and delete', async t => {
  for (const entity of entityOrder) await t.test(entity, async () => {
    const writable = entities[entity].fields.filter(field => !field.readOnly);
    const defaults = defaultsFor(entity);
    const body = Object.fromEntries(writable.map(field => [field.key, defaults[field.key]]));
    body.name = `Integration test ${entity}`;
    for (const field of writable) {
      if (field.type === 'reference') body[field.key] = field.entity === 'models' ? model.id : field.entity === 'nodes' ? node.id : field.entity === 'inferences' ? inference.id : null;
      if (['owner', 'operator'].includes(field.key)) body[field.key] = 'Test operator';
      if (field.pattern) body[field.key] = `0x${randomBytes(20).toString('hex')}`;
    }
    if (entity === 'inferences') { body.input = 'Stable positive growth with risk 0.2'; body.output = 'Integration output'; body.status = 'Completed'; }
    const created = await request(`/${entity}`, 'POST', body, 201);
    assert.equal(created.name, body.name);
    const fetched = await request(`/${entity}/${created.id}`);
    assert.equal(fetched.record.id, created.id);
    assert.equal(fetched.activity[0].action, 'created');
    const updated = await request(`/${entity}/${created.id}`, 'PATCH', { description: 'Persisted integration edit', revision: created.revision });
    assert.equal(updated.revision, 2);
    const reader = new pg.Client(baseUrl ? { connectionString: baseUrl.toString() } : { ...adminConfig, database });
    await reader.connect();
    try {
      assert.equal((await reader.query(`SELECT description FROM "${entity}" WHERE id=$1`, [created.id])).rows[0].description, 'Persisted integration edit');
    } finally { await reader.end(); }
    await request(`/${entity}/${created.id}`, 'PATCH', { description: 'Stale edit', revision: 1 }, 409);
    await request(`/${entity}/${created.id}`, 'DELETE', { revision: 1 }, 409);
    await request(`/${entity}/${created.id}`, 'DELETE', { revision: updated.revision }, 204);
    await request(`/${entity}/${created.id}`, 'GET', undefined, 404);
  });
});

test('filtering, stable pagination, sorting, and literal search are backed by PostgreSQL', async () => {
  const first = await request('/inferences?page=1&pageSize=15&sort=name&order=asc');
  const second = await request('/inferences?page=2&pageSize=15&sort=name&order=asc');
  assert.equal(first.rows.length, 15); assert.equal(second.rows.length, 15);
  assert.ok(!second.rows.some(row => first.rows.some(other => other.id === row.id)));
  assert.ok((await request('/models?status=Published')).rows.every(row => row.status === 'Published'));
  assert.ok((await request('/models?category=Embeddings')).rows.every(row => row.category === 'Embeddings'));
  assert.equal((await request('/models?q=Llama')).total, 1);
  assert.equal((await request('/models?q=%25')).total, 0);
  assert.equal((await request('/models?q=%27%3B%20DROP%20TABLE%20models%3B--')).total, 0);
});

test('invalid fields, references, numbers, SQL identifiers, and cross-origin writes are rejected', async () => {
  await request('/models', 'POST', { name: '' }, 422);
  await request('/models', 'POST', { name: 'Test', owner: 'Test', unexpected: 'bad' }, 400);
  await request('/models?sort=name%3BDROP%20TABLE%20models', 'GET', undefined, 400);
  await request('/models?pageSize=100000', 'GET', undefined, 400);
  await request('/models/not-a-uuid', 'GET', undefined, 400);
  await request('/not_a_table', 'GET', undefined, 404);
  await request(`/nodes/${node.id}`, 'PATCH', { utilization: -1, revision: node.revision }, 422);
  await request('/agents', 'POST', { ...defaultsFor('agents'), name: 'Bad ref', owner: 'Test', model_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }, 422);
  await request('/models', 'POST', { name: 'Cross-site', owner: 'Test' }, 403, { Origin: 'https://unrelated.example' });
});

test('sandbox execution atomically persists linked job, receipt, and simulated settlement', async () => {
  const before = (await request('/overview')).counts;
  const result = await request('/inferences/run', 'POST', { model_id: model.id, node_id: node.id, input: 'Strong growth with stable liquidity 1200000 and risk 0.042.' }, 201);
  const after = (await request('/overview')).counts;
  for (const entity of ['inferences', 'proofs', 'transactions']) assert.equal(after[entity], before[entity] + 1);
  assert.equal(result.proof.inference_id, result.inference.id);
  assert.equal(result.transaction.inference_id, result.inference.id);
  assert.equal(result.transaction.status, 'Simulated');
  assert.equal(result.proof.digest.length, 64);
  const output = JSON.parse(result.inference.output);
  assert.equal(output.execution, 'deterministic local sandbox');
  assert.deepEqual(output.analysis.numeric_values, [1200000, 0.042]);
  const verified = await request(`/proofs/${result.proof.id}/verify`, 'POST');
  assert.equal(verified.valid, true);
  await request(`/inferences/${result.inference.id}`, 'PATCH', { output: 'Tampered result', revision: result.inference.revision });
  assert.equal((await request(`/proofs/${result.proof.id}`)).record.status, 'Pending');
  assert.equal((await request(`/proofs/${result.proof.id}/verify`, 'POST')).valid, false);
  const changed = (await request(`/inferences/${result.inference.id}`)).record;
  await request(`/inferences/${changed.id}`, 'DELETE', { revision: changed.revision }, 204);
  const retained = (await request(`/proofs/${result.proof.id}`)).record;
  assert.equal(retained.inference_id, null);
  assert.equal(retained.status, 'Invalid');
  const annotated = await request(`/proofs/${retained.id}`, 'PATCH', { inference_id: null, description: 'Source removed; receipt retained for history.', revision: retained.revision });
  assert.equal(annotated.inference_id, null);
  assert.equal(annotated.description, 'Source removed; receipt retained for history.');
});

test('failed runs leave all three collections unchanged and enforce model lifecycle', async () => {
  const before = (await request('/overview')).counts;
  const draft = (await request('/models?status=Draft')).rows[0];
  await request('/inferences/run', 'POST', { model_id: draft.id, input: 'Test' }, 409);
  await request('/inferences/run', 'POST', { model_id: model.id, input: '  ' }, 422);
  const offline = (await request('/nodes?status=Offline')).rows[0];
  await request('/inferences/run', 'POST', { model_id: model.id, node_id: offline.id, input: 'Test' }, 409);
  const after = (await request('/overview')).counts;
  for (const entity of ['inferences', 'proofs', 'transactions']) assert.equal(after[entity], before[entity]);
});

test('deleting a referenced model retains agents and clears the relationship', async () => {
  const createdModel = await request('/models', 'POST', { ...defaultsFor('models'), name: 'Disposable relation model', owner: 'Test' }, 201);
  const agent = await request('/agents', 'POST', { ...defaultsFor('agents'), name: 'Disposable agent', owner: 'Test', model_id: createdModel.id }, 201);
  await request(`/models/${createdModel.id}`, 'DELETE', { revision: createdModel.revision }, 204);
  assert.equal((await request(`/agents/${agent.id}`)).record.model_id, null);
  await request(`/agents/${agent.id}`, 'DELETE', { revision: agent.revision }, 204);
});

test('simultaneous stale edits cannot overwrite one another', async () => {
  const created = await request('/models', 'POST', { ...defaultsFor('models'), name: 'Concurrent edits', owner: 'Test' }, 201);
  const statuses = await Promise.all(['Edit A', 'Edit B'].map(description => fetch(`${endpoint}/api/models/${created.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description, revision: 1 }) }).then(response => response.status)));
  assert.deepEqual(statuses.sort(), [200, 409]);
  const updated = (await request(`/models/${created.id}`)).record;
  await request(`/models/${created.id}`, 'DELETE', { revision: updated.revision }, 204);
});

test('watched development mode selects free ports and supports same-origin writes through its proxy', async t => {
  const blocker = createServer((req, res) => res.end('existing frontend service'));
  await new Promise(resolve => blocker.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => blocker.close(resolve)));
  const apiPort = server.address().port;
  const frontendPort = blocker.address().port;
  const child = spawn(process.execPath, ['--watch', 'scripts/dev.mjs'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, PORT: String(apiPort), DEV_PORT: String(frontendPort), HOST: '127.0.0.1', STRICT_PORT: '0', NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const finished = new Promise(resolve => child.once('exit', resolve));
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      if (process.platform === 'win32') child.kill('SIGTERM');
      else process.kill(-child.pid, 'SIGTERM');
    }
    await finished;
  });
  let frontend;
  for (let attempt = 0; attempt < 80; attempt++) {
    const marker = output.lastIndexOf('Development frontend');
    if (marker >= 0) frontend = output.slice(marker).match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
    if (frontend) break;
    assert.equal(child.exitCode, null, output);
    await delay(100);
  }
  assert.ok(frontend, `Development frontend did not become ready: ${output}`);
  assert.notEqual(Number(new URL(frontend).port), frontendPort);
  assert.match(output, new RegExp(`Port ${apiPort} is in use. Using available port`));
  const response = await fetch(`${frontend}/api/models`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: frontend },
    body: JSON.stringify({ name: 'Development proxy integration model', owner: 'Integration test' }),
  });
  const created = await response.json();
  assert.equal(response.status, 201, JSON.stringify(created));
  assert.equal((await request(`/models/${created.id}`)).record.name, created.name);
  await request(`/models/${created.id}`, 'DELETE', { revision: created.revision }, 204);
  await delay(1200);
  assert.equal((output.match(/Development frontend/g) || []).length, 1, `Development server restarted unexpectedly: ${output}`);
  assert.equal((await fetch(`${frontend}/api/health`).then(response => response.json())).status, 'ok');
  assert.equal(await fetch(`http://127.0.0.1:${frontendPort}`).then(response => response.text()), 'existing frontend service');
});

test('startup seed is idempotent and does not recreate deleted records', async () => {
  const dataset = (await request('/datasets')).rows[0];
  await request(`/datasets/${dataset.id}`, 'DELETE', { revision: dataset.revision }, 204);
  const before = (await request('/overview')).counts;
  await transaction(async client => { assert.equal(await seed(client), false); });
  assert.deepEqual((await request('/overview')).counts, before);
  await request(`/datasets/${dataset.id}`, 'GET', undefined, 404);
});

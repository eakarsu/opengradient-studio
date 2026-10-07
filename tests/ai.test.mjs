import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import pg from 'pg';
import { aiFeatures, presetValues } from '../shared/ai-features.mjs';
import { entityOrder } from '../shared/entities.mjs';

const databaseName = `opengradient_studio_test_ai_${randomBytes(5).toString('hex')}`;
const base = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const admin = new pg.Client(base ? { connectionString: new URL('/postgres', base).toString() } : {
  host: process.env.PGHOST || '127.0.0.1', port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || os.userInfo().username, password: process.env.PGPASSWORD, database: 'postgres', connectionTimeoutMillis: 5000,
});
const fakeKey = 'sk-or-v1-local-test-key-never-a-real-credential';
let database, temporary, store, remote, server, endpoint, createAiRouter, validateAiValues, buildAiMessages, created = false;
let mode = 'ok', lastRequest, chatCalls = 0, saved;

const close = listener => new Promise(resolve => listener.close(resolve));
async function request(route, method = 'GET', body, status = 200) {
  const response = await fetch(`${endpoint}${route}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  assert.equal(response.status, status, JSON.stringify(data));
  assert.ok(!JSON.stringify(data).includes(fakeKey), 'credentials must never be returned');
  return data;
}

before(async () => {
  await admin.connect(); await admin.query(`CREATE DATABASE "${databaseName}"`); created = true;
  if (base) { base.pathname = `/${databaseName}`; process.env.DATABASE_URL = base.toString(); }
  else process.env.PGDATABASE = databaseName;
  ({ pool: database } = await import('../server/db.mjs'));
  await database.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  ({ createAiRouter, validateAiValues, buildAiMessages } = await import('../server/ai.mjs'));
  const { createSettingsStore } = await import('../server/ai.mjs');
  temporary = await mkdtemp(path.join(os.tmpdir(), 'opengradient-ai-test-'));
  store = createSettingsStore({ filename: path.join(temporary, 'settings.json'), environment: {} });
  remote = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/v1/key') {
      if (mode === 'bad-key') { res.statusCode = 401; return res.end(JSON.stringify({ error: fakeKey })); }
      return res.end(JSON.stringify({ data: { label: 'Local test key' } }));
    }
    if (req.url === '/api/v1/models') return res.end(JSON.stringify({ data: [{ id: 'openrouter/free', name: 'Free Models Router', architecture: { output_modalities: ['text'] }, pricing: { prompt: '0', completion: '0' } }, { id: 'test/text-model', name: 'Test model', pricing: { prompt: '0.00001', completion: '0.00002' } }] }));
    if (req.url !== '/api/v1/chat/completions') { res.statusCode = 404; return res.end('{}'); }
    let body = ''; for await (const chunk of req) body += chunk;
    lastRequest = { body: JSON.parse(body), authorization: req.headers.authorization }; chatCalls++;
    if (typeof mode === 'number') { res.statusCode = mode; return res.end(JSON.stringify({ error: { message: `Do not expose ${fakeKey}`, code: mode } })); }
    if (mode === 'slow' || mode === 'slow-body') {
      if (mode === 'slow-body') res.flushHeaders();
      setTimeout(() => res.end('{}'), 160); return;
    }
    const content = mode === 'empty' ? null : mode === 'json' ? '{"summary":"Readable structured report","findings":["Clear observation","Next action"]}' : '## Executive summary\n\n**Recommendation:** evaluate the supplied assumptions before proceeding.\n\n## Findings\n\n| Area | Observation | Next step |\n| --- | --- | --- |\n| Evidence | Some measurements are missing. | Collect baseline metrics. |\n\n## Next steps\n\n1. Confirm the assumptions.\n2. Run a small evaluation.';
    res.end(JSON.stringify({ id: 'gen-local-test', model: 'test/text-model', choices: [{ finish_reason: mode === 'truncated' ? 'length' : 'stop', message: { role: 'assistant', content } }], usage: { prompt_tokens: 120, completion_tokens: 180, total_tokens: 300, cost: 0.0012 } }));
  });
  await new Promise(resolve => remote.listen(0, '127.0.0.1', resolve));
  const upstream = `http://127.0.0.1:${remote.address().port}`;
  const app = express(); app.use(express.json());
  app.use(createAiRouter({ database, settingsStore: store, fetchImpl: (url, options) => fetch(`${upstream}${new URL(url).pathname}`, options), timeoutMs: 2000 }));
  app.use((error, req, res, next) => res.status(500).json({ error: 'Unexpected server error.' }));
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  endpoint = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await close(server);
  if (remote) await close(remote);
  if (database) await database.end();
  if (created) await admin.query(`DROP DATABASE "${databaseName}"`);
  await admin.end();
  if (temporary) await rm(temporary, { recursive: true });
});

test('24 tools cover every module and all 72 presets fill every field', async () => {
  const catalog = await request('/features'); assert.equal(catalog.features.length, 24);
  for (const entity of entityOrder) assert.equal(aiFeatures.filter(feature => feature.entity === entity).length, 3);
  for (const feature of aiFeatures) {
    assert.equal(feature.fields.length, 11); assert.equal(feature.presets.length, 3);
    for (let index = 0; index < feature.presets.length; index++) {
      const values = presetValues(feature, index);
      assert.deepEqual(Object.keys(values).sort(), feature.fields.map(field => field.key).sort());
      assert.deepEqual(validateAiValues(feature, values), values);
      for (const field of feature.fields) assert.notEqual(values[field.key], '', `${feature.id}: ${field.key}`);
    }
  }
});

test('unconfigured AI fails clearly without calling a provider or creating history', async () => {
  assert.equal((await request('/settings')).configured, false);
  assert.match((await request('/generate', 'POST', { feature_id: aiFeatures[0].id, values: presetValues(aiFeatures[0]) }, 503)).error, /Connect your OpenRouter API key/);
  assert.equal(chatCalls, 0); assert.equal((await request('/runs')).total, 0);
});

test('AI settings validate the key, persist securely, and never reveal credentials', async () => {
  mode = 'bad-key';
  await request('/settings', 'PUT', { model: 'openrouter/free', apiKey: fakeKey }, 401);
  assert.equal((await request('/settings')).configured, false);
  mode = 'ok';
  assert.equal((await request('/settings', 'PUT', { model: 'openrouter/free', apiKey: fakeKey })).configured, true);
  assert.equal((await stat(path.join(temporary, 'settings.json'))).mode & 0o777, 0o600);
  assert.equal((await store.read()).apiKey, fakeKey);
  await request('/settings', 'PUT', { model: 'test/text-model' });
  assert.equal((await store.read()).apiKey, fakeKey);
  await request('/settings', 'PUT', { model: 'bad model id' }, 422);
  await request('/settings', 'PUT', { model: 'openrouter/free', apiKey: 'not-a-key' }, 422);
});

test('model catalog reports real provider IDs and free model flags', async () => {
  const catalog = await request('/models');
  assert.equal(catalog.models[0].id, 'openrouter/free'); assert.equal(catalog.models[0].free, true);
  assert.equal(catalog.models[1].free, false);
});

test('all tools make authenticated OpenRouter-compatible requests and persist their reports', async () => {
  for (const feature of aiFeatures) {
    const values = presetValues(feature);
    saved = await request('/generate', 'POST', { feature_id: feature.id, values }, 201);
    assert.equal(saved.feature_id, feature.id); assert.equal(saved.entity, feature.entity);
    assert.equal(saved.model, 'test/text-model'); assert.equal(saved.requested_model, values.model);
    assert.deepEqual(saved.request, values); assert.match(saved.response, /## Executive summary/);
    assert.equal(Number(saved.cost_usd), 0.0012); assert.equal(saved.total_tokens, 300);
    assert.equal(lastRequest.authorization, `Bearer ${fakeKey}`);
    assert.equal(lastRequest.body.model, values.model); assert.equal(lastRequest.body.stream, false);
    assert.equal(lastRequest.body.max_tokens, values.max_tokens);
    assert.match(lastRequest.body.messages[0].content, /never a JSON/);
    for (const field of feature.fields.filter(field => !['model', 'temperature', 'max_tokens'].includes(field.key))) assert.ok(lastRequest.body.messages[1].content.includes(values[field.key]));
    assert.equal((await request(`/runs/${saved.id}`)).response, saved.response);
  }
  assert.equal(chatCalls, 24); assert.equal((await request('/runs')).total, 24);
});

test('history is paginated, filtered, and retained through a fresh database connection', async () => {
  const page = await request('/runs?page=1'); const next = await request('/runs?page=2');
  assert.equal(page.rows.length, 15); assert.equal(next.rows.length, 9);
  assert.equal(new Set([...page.rows, ...next.rows].map(row => row.id)).size, 24);
  assert.equal((await request(`/runs?feature=${aiFeatures[0].id}`)).total, 1);
  const reader = new pg.Client(base ? { connectionString: base.toString() } : { ...admin.connectionParameters, database: databaseName });
  await reader.connect();
  try { assert.match((await reader.query('SELECT response FROM ai_runs WHERE id=$1', [saved.id])).rows[0].response, /Executive summary/); }
  finally { await reader.end(); }
});

test('invalid fields and source references never reach OpenRouter', async () => {
  const count = chatCalls, feature = aiFeatures[0], values = presetValues(feature);
  const error = await request('/generate', 'POST', { feature_id: feature.id, values: { ...values, objective: '', temperature: 2 } }, 422);
  assert.ok(error.fields.objective); assert.ok(error.fields.temperature);
  await request('/generate', 'POST', { feature_id: feature.id, values: { ...values, apiKey: 'unexpected' } }, 422);
  await request('/generate', 'POST', { feature_id: feature.id, values, source_record_id: 'invalid' }, 422);
  await request('/generate', 'POST', { feature_id: 'nonexistent', values }, 404);
  await request('/runs?feature=nonexistent', 'GET', undefined, 404);
  await request('/runs?page=0', 'GET', undefined, 400);
  assert.equal(chatCalls, count);
});

test('provider failures are actionable and do not fabricate or save an AI response', async () => {
  const beforeCount = (await request('/runs')).total;
  for (const [upstreamStatus, expected] of [[401, 401], [402, 402], [429, 429], [404, 422], [503, 502]]) {
    mode = upstreamStatus;
    assert.match((await request('/generate', 'POST', { feature_id: aiFeatures[0].id, values: presetValues(aiFeatures[0]) }, expected)).error, /OpenRouter|AI provider/);
  }
  mode = 'empty';
  await request('/generate', 'POST', { feature_id: aiFeatures[0].id, values: presetValues(aiFeatures[0]) }, 502);
  assert.equal((await request('/runs')).total, beforeCount);
  mode = 'ok';
});

test('truncated responses are explicitly marked and their complete saved text is retained', async () => {
  mode = 'truncated';
  const result = await request('/generate', 'POST', { feature_id: aiFeatures[0].id, values: presetValues(aiFeatures[0]) }, 201);
  assert.equal(result.truncated, true); assert.match(result.response, /Next steps/);
  mode = 'ok';
});

test('provider timeout returns a retryable error without saving a report', async () => {
  const app = express(); app.use(express.json());
  app.use(createAiRouter({ database, settingsStore: store, timeoutMs: 25, fetchImpl: (url, options) => fetch(`http://127.0.0.1:${remote.address().port}${new URL(url).pathname}`, options) }));
  app.use((error, req, res, next) => res.status(500).json({ error: 'Unexpected server error.' }));
  const listener = await new Promise(resolve => { const running = app.listen(0, '127.0.0.1', () => resolve(running)); });
  const count = (await request('/runs')).total;
  try {
    for (const slowMode of ['slow', 'slow-body']) {
      mode = slowMode;
      const response = await fetch(`http://127.0.0.1:${listener.address().port}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feature_id: aiFeatures[0].id, values: presetValues(aiFeatures[0]) }) });
      assert.equal(response.status, 504); assert.match((await response.json()).error, /too long/);
    }
    assert.equal((await request('/runs')).total, count);
  } finally { mode = 'ok'; await close(listener); }
});

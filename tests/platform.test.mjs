import 'dotenv/config';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import pg from 'pg';
import { Interface } from 'ethers';
import { defaultsFor } from '../shared/entities.mjs';

// Files, secrets, provider traffic and database writes are isolated from the workspace.
const databaseName = `opengradient_studio_test_platform_${randomBytes(5).toString('hex')}`;
const base = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const admin = new pg.Client(base ? { connectionString: new URL('/postgres', base).toString() } : {
  host: process.env.PGHOST || '127.0.0.1', port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || os.userInfo().username, password: process.env.PGPASSWORD, database: 'postgres',
});
const fakeKey = 'sk-or-v1-isolated-platform-test';
const fakePassword = 'isolated-test-password';
const fakeWallet = '0x' + '11'.repeat(32);
const abi = new Interface(['function totalSupply() view returns (uint256)']);
let pool, transact, insertRow, bridge, platform, connections, blockchain, endpoint, temporary, server, upstream, created = false;
let hosted, example, agent, providerMode = 'ok', providerCalls = [], rpcCalls = [], sdkCalls = [];

const close = listener => new Promise(resolve => listener.close(resolve));
async function request(route, method = 'GET', body, status = 200, headers = {}) {
  const multipart = body instanceof FormData;
  const response = await fetch(`${endpoint}${route}`, {
    method, headers: { ...(body && !multipart ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? multipart ? body : JSON.stringify(body) : undefined,
  });
  const data = response.status === 204 ? null : await response.json();
  assert.equal(response.status, status, `${method} ${route}: ${JSON.stringify(data)}`);
  for (const secret of [fakeKey, fakePassword, fakeWallet]) assert.ok(!JSON.stringify(data).includes(secret), 'responses must not expose secrets');
  return data;
}
const workflowBody = steps => ({ name: 'Isolated connected workflow', description: 'Integration coverage', status: 'Active', trigger_type: 'manual', interval_minutes: 1, default_input: 'Original supplied context', steps });
const aiStep = (id, modelId = hosted.id) => ({ id, name: id, kind: 'model', model_id: modelId, prompt: 'Source: {{input}}\nPrior: {{previous}}\nFirst: {{step:first}}' });

before(async () => {
  await admin.connect(); await admin.query(`CREATE DATABASE "${databaseName}"`); created = true;
  if (base) { base.pathname = `/${databaseName}`; process.env.DATABASE_URL = base.toString(); }
  else process.env.PGDATABASE = databaseName;
  ({ pool, transaction: transact } = await import('../server/db.mjs'));
  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  ({ insertRow } = await import('../server/seed.mjs'));
  ({ callBridge: bridge } = await import('../server/bridge.mjs'));
  temporary = await mkdtemp(path.join(os.tmpdir(), 'opengradient-platform-'));
  upstream = createServer(async (req, res) => {
    let source = ''; for await (const chunk of req) source += chunk;
    const body = JSON.parse(source); res.setHeader('Content-Type', 'application/json');
    if (req.url === '/rpc') {
      rpcCalls.push(body);
      const values = { eth_chainId: '0x2105', eth_blockNumber: '0xabcdef', eth_call: abi.encodeFunctionResult('totalSupply', [1000000000n]) };
      return res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: values[body.method] }));
    }
    providerCalls.push({ body, authorization: req.headers.authorization });
    if (providerMode === 'fail' || providerMode === 'fail-second' && body.messages.at(-1).content.includes('Fail this step')) {
      res.statusCode = 429; return res.end(JSON.stringify({ error: fakeKey }));
    }
    if (providerMode === 'slow') await new Promise(resolve => setTimeout(resolve, 150));
    res.end(JSON.stringify({ id: 'gen-isolated', model: 'test/model', choices: [{ finish_reason: 'stop', message: { content: '## Verified provider response\n\n**Result:** processed the supplied context.\n\n| Check | Result |\n| --- | --- |\n| Input | Received |' } }], usage: { total_tokens: 60, cost: 0.0001 } }));
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamUrl = `http://127.0.0.1:${upstream.address().port}`;
  const fetchImpl = (url, options) => fetch(`${upstreamUrl}${String(url).includes('openrouter.ai') ? '/chat' : '/rpc'}`, options);
  const sdkBridge = async (operation, input, options) => {
    sdkCalls.push({ operation, input });
    if (operation === 'hub_check') return { authenticated: true };
    if (operation === 'hub_publish') return { repository: input.repository, version: '1.00', file: { modelCid: 'QmIsolatedPublishedModel', size: 203 } };
    if (operation === 'og_approve') return { approved: true };
    if (operation === 'og_chat') return { chat_output: { content: '## OpenGradient response\n\nStored provider evidence.' }, usage: { total_tokens: 12 }, tee_signature: 'isolated-signature', payment_hash: 'isolated-payment', id: 'isolated-attestation' };
    return bridge(operation, input, options);
  };
  const { createConnectionStore } = await import('../server/platform-connections.mjs');
  connections = createConnectionStore({ filename: path.join(temporary, 'connections.json'), environment: {}, bridge: sdkBridge });
  const { createBlockchainReader } = await import('../server/blockchain.mjs');
  blockchain = createBlockchainReader({ fetchImpl });
  const { createPlatform } = await import('../server/platform.mjs');
  platform = createPlatform({ database: pool, transact, storageRoot: path.join(temporary, 'artifacts'), bridge: sdkBridge, connections, settingsStore: { read: async () => ({ apiKey: fakeKey, model: 'openrouter/free' }) }, fetchImpl, blockchain });
  const app = express(); app.use(express.json()); app.use(platform.router);
  app.use((error, req, res, next) => res.status(500).json({ error: error.message }));
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  endpoint = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await close(server);
  if (upstream) await close(upstream);
  if (pool) await pool.end();
  if (created) await admin.query(`DROP DATABASE "${databaseName}"`);
  await admin.end();
  if (temporary) await rm(temporary, { recursive: true, force: true });
});

test('connections report the installed SDK and ONNX runtime without credentials', async () => {
  const data = await request('/connections');
  assert.equal(data.runtime.ready, true);
  assert.equal(data.runtime.version, '1.1.4');
  assert.equal(data.opengradient.hub_configured, false);
  assert.equal(data.opengradient.wallet_configured, false);
  assert.ok(data.models.some(model => model.id.includes('anthropic/')));
});

test('hosted connections execute provider requests and persist readable output and matching receipts', async () => {
  hosted = await request('/models/connect', 'POST', { name: 'Isolated hosted assistant', provider: 'openrouter', provider_model: 'test/model' }, 201);
  assert.equal(hosted.verification, 'None'); assert.equal(hosted.license, 'Provider terms');
  const result = await request('/execute', 'POST', { model_id: hosted.id, input: 'Use the supplied facts', name: 'Hosted result' }, 201);
  assert.equal(result.inference.status, 'Completed'); assert.equal(result.inference.provider, 'openrouter');
  assert.match(result.inference.output, /## Verified provider response/);
  assert.equal(providerCalls.at(-1).body.model, 'test/model');
  assert.equal(providerCalls.at(-1).authorization, `Bearer ${fakeKey}`);
  const { digestPayload, receiptPayload } = await import('../server/receipts.mjs');
  assert.equal(result.proof.digest, digestPayload(receiptPayload(result.inference)));
  assert.equal((await pool.query('SELECT output FROM inferences WHERE id=$1', [result.inference.id])).rows[0].output, result.inference.output);
  const longName = await request('/execute', 'POST', { model_id: hosted.id, input: 'Test long saved names', name: 'x'.repeat(255) }, 201);
  assert.equal(longName.inference.name.length, 255); assert.equal(longName.proof.name.length, 255);
});

test('upload, versions, download and real ONNX execution preserve file contents and prediction data', async () => {
  example = await request('/models/example', 'POST', {}, 201);
  const files = await request(`/models/${example.model.id}/files`);
  assert.equal(files.binding.provider, 'onnx'); assert.equal(files.versions[0].version, '1.0.0');
  assert.equal(files.files[0].storage_key, undefined); assert.equal(files.files[0].metadata.inputs[0].name, 'features');
  const downloaded = await fetch(`${endpoint}/files/${example.file.id}/download`);
  assert.equal(downloaded.status, 200);
  const contents = Buffer.from(await downloaded.arrayBuffer());
  assert.equal(createHash('sha256').update(contents).digest('hex'), example.file.sha256);
  const form = new FormData(); form.set('version', '2.0.0'); form.set('notes', 'Second version'); form.set('file', new Blob([contents]), 'second.onnx');
  const second = await request(`/models/${example.model.id}/files`, 'POST', form, 201);
  await request(`/models/${example.model.id}/binding`, 'PUT', { provider: 'onnx', artifact_id: second.id });
  const result = await request('/execute', 'POST', { model_id: example.model.id, input: JSON.stringify({ features: [[1, 2, 3], [2, 2, 2]] }) }, 201);
  assert.deepEqual(result.outputs[0].values, [[14.5], [12]]);
  assert.match(result.inference.output, /\| 1 \| 14.5 \|/);
  assert.equal(result.inference.provider_metadata.sha256, second.sha256);
  assert.equal((await request(`/models/${example.model.id}/files`)).versions.length, 2);
  await request(`/models/${hosted.id}/binding`, 'PUT', { provider: 'onnx', artifact_id: second.id }, 422);
});

test('invalid models and inputs fail honestly and do not fabricate a success receipt', async () => {
  const proofs = (await pool.query('SELECT COUNT(*)::int AS total FROM proofs')).rows[0].total;
  await request('/execute', 'POST', { model_id: example.model.id, input: '{"features":[[1,2]]}' }, 422);
  const failed = (await pool.query("SELECT * FROM inferences WHERE model_id=$1 AND status='Failed'", [example.model.id])).rows;
  assert.equal(failed.length, 1); assert.match(failed[0].error, /dimension|shape|input/i);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS total FROM proofs')).rows[0].total, proofs);
  await request('/execute', 'POST', { model_id: 'missing', input: 'test' }, 422);
  await request('/execute', 'POST', { model_id: randomUUID(), input: 'test' }, 404);
  const draft = await transact(client => insertRow(client, 'models', { ...defaultsFor('models'), id: randomUUID(), name: 'Draft model', owner: 'Test' }));
  await request('/execute', 'POST', { model_id: draft.id, input: 'test' }, 409);
});

test('agents apply saved instructions and runtime parameters and preserve conversation ordering', async () => {
  agent = await transact(client => insertRow(client, 'agents', { ...defaultsFor('agents'), id: randomUUID(), name: 'Isolated agent', owner: 'Test', model_id: hosted.id, status: 'Active', instructions: 'Treat facts carefully. Do not invent evidence.' }));
  await request(`/agents/${agent.id}/runtime`, 'PUT', { memory_enabled: true, temperature: 0.7, max_tokens: 1024 });
  await request('/execute', 'POST', { model_id: hosted.id, agent_id: agent.id, input: 'Remember the first request' }, 201);
  await request('/execute', 'POST', { model_id: hosted.id, agent_id: agent.id, input: 'Continue the discussion' }, 201);
  const payload = providerCalls.at(-1).body;
  assert.match(payload.messages[0].content, /Treat facts carefully/);
  assert.deepEqual(payload.messages.map(message => message.role), ['system', 'user', 'assistant', 'user']);
  assert.equal(payload.messages[1].content, 'Remember the first request');
  assert.equal(payload.temperature, 0.7); assert.equal(payload.max_tokens, 1024);
  const runtime = await request(`/agents/${agent.id}/runtime`);
  assert.equal(runtime.memory_messages, 4); assert.equal(runtime.history.length, 2);
  await request(`/agents/${agent.id}/runtime`, 'PUT', { memory_enabled: false, temperature: 0.1, max_tokens: 512 });
  await request('/execute', 'POST', { model_id: hosted.id, agent_id: agent.id, input: 'Run without memory' }, 201);
  assert.deepEqual(providerCalls.at(-1).body.messages.map(message => message.role), ['system', 'user']);
  assert.equal((await request(`/agents/${agent.id}/runtime`)).memory_messages, 4);
  await request(`/agents/${agent.id}/memory`, 'DELETE', undefined, 204);
  assert.equal((await request(`/agents/${agent.id}/runtime`)).memory_messages, 0);
  assert.equal((await request(`/agents/${agent.id}/runtime`)).history.length, 3);
});

test('provider errors retain failed history and never leak the upstream credential', async () => {
  providerMode = 'fail';
  await request('/execute', 'POST', { model_id: hosted.id, input: 'A failing provider request' }, 429);
  providerMode = 'ok';
  const failed = (await pool.query("SELECT id,error FROM inferences WHERE input=$1", ['A failing provider request'])).rows[0];
  assert.match(failed.error, /rate limited/);
  assert.equal((await pool.query('SELECT 1 FROM proofs WHERE inference_id=$1', [failed.id])).rowCount, 0);
});

test('workflows save revisions, chain results and apply agent settings within their steps', async () => {
  const workflow = await request('/workflows', 'POST', workflowBody([aiStep('first'), { id: 'agent', name: 'Agent review', kind: 'agent', agent_id: agent.id, prompt: 'Review {{previous}} for {{input}}' }]), 201);
  const list = await request('/workflows'); assert.equal(list[0].webhook_hash, undefined);
  const run = await request(`/workflows/${workflow.id}/run`, 'POST', { input: 'Workflow facts' }, 201);
  assert.equal(run.status, 'Completed'); assert.equal(run.steps.length, 2);
  assert.match(providerCalls.at(-1).body.messages.at(-1).content, /Verified provider response/);
  assert.match(providerCalls.at(-1).body.messages.at(-1).content, /Workflow facts/);
  assert.equal(providerCalls.at(-1).body.temperature, 0.1); assert.equal(providerCalls.at(-1).body.max_tokens, 512);
  assert.equal((await request(`/workflows/${workflow.id}/runs`))[0].id, run.id);
  const scheduled = { ...workflowBody([aiStep('first')]), trigger_type: 'schedule', revision: 1 };
  const updated = await request(`/workflows/${workflow.id}`, 'PUT', scheduled); assert.equal(updated.revision, 2);
  assert.ok((await request('/workflows')).find(row => row.id === workflow.id).next_run_at);
  await request(`/workflows/${workflow.id}`, 'PUT', scheduled, 409);
  await pool.query("UPDATE workflows SET status='Paused' WHERE id=$1", [workflow.id]);
  await request(`/workflows/${workflow.id}/run`, 'POST', { input: 'test' }, 409);
});

test('webhook authorization, token rotation and scheduler claims execute protected workflows', async () => {
  const workflow = await request('/workflows', 'POST', { ...workflowBody([aiStep('first')]), trigger_type: 'webhook' }, 201);
  await request(`/hooks/${workflow.id}`, 'POST', { input: 'Webhook facts' }, 401);
  const run = await request(`/hooks/${workflow.id}`, 'POST', { input: 'Webhook facts' }, 201, { Authorization: `Bearer ${workflow.webhook_token}` });
  assert.equal(run.trigger_type, 'webhook');
  const token = await request(`/workflows/${workflow.id}/token`, 'POST', {});
  await request(`/hooks/${workflow.id}`, 'POST', { input: 'test' }, 401, { Authorization: `Bearer ${workflow.webhook_token}` });
  await request(`/hooks/${workflow.id}`, 'POST', { input: 'test' }, 201, { Authorization: `Bearer ${token.webhook_token}` });
  const scheduled = await request('/workflows', 'POST', { ...workflowBody([aiStep('first')]), trigger_type: 'schedule' }, 201);
  await pool.query("UPDATE workflows SET next_run_at=NOW()-INTERVAL '1 minute' WHERE id=$1", [scheduled.id]);
  await platform.workflows.tick();
  for (let attempt = 0; attempt < 50; attempt++) {
    const runs = await request(`/workflows/${scheduled.id}/runs`);
    if (runs[0]?.status === 'Completed') { assert.equal(runs[0].trigger_type, 'schedule'); return; }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail('Scheduled workflow did not complete.');
});

test('overlapping runs are rejected and failed workflows retain completed steps and error history', async () => {
  const workflow = await request('/workflows', 'POST', workflowBody([aiStep('first')]), 201);
  providerMode = 'slow';
  const statuses = await Promise.all([1, 2].map(() => fetch(`${endpoint}/workflows/${workflow.id}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"input":"Concurrent request"}' }).then(response => response.status)));
  assert.deepEqual(statuses.sort(), [201, 409]);
  const { createWorkflowEngine } = await import('../server/workflows.mjs');
  const secondEngine = createWorkflowEngine({ database: pool, execution: platform.execution, blockchain });
  const concurrent = await Promise.allSettled([platform.workflows.run(workflow.id, 'First instance'), secondEngine.run(workflow.id, 'Second instance')]);
  assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(concurrent.find(result => result.status === 'rejected').reason.status, 409);
  const several = [];
  for (let index = 0; index < 5; index++) several.push(await request('/workflows', 'POST', { ...workflowBody([aiStep('first')]), name: `Concurrent workflow ${index}` }, 201));
  const capacity = await Promise.all(several.map(row => fetch(`${endpoint}/workflows/${row.id}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"input":"Capacity check"}' }).then(response => response.status)));
  assert.deepEqual(capacity.sort(), [201, 201, 201, 201, 429]);
  providerMode = 'fail-second';
  const failing = await request('/workflows', 'POST', workflowBody([aiStep('first'), { ...aiStep('second'), prompt: 'Fail this step' }]), 201);
  await request(`/workflows/${failing.id}/run`, 'POST', { input: 'test' }, 429);
  providerMode = 'ok';
  const failed = (await request(`/workflows/${failing.id}/runs`))[0];
  assert.equal(failed.status, 'Failed'); assert.equal(failed.steps[0].status, 'Completed'); assert.match(failed.error, /rate limited/);
});

test('contract reads are ABI-decoded at the recorded block and cannot send a transaction', async () => {
  const status = await request('/networks/base');
  assert.equal(status.connected, true); assert.equal(status.status, 'connected');
  assert.equal(status.chain_id, 8453); assert.equal(status.block_number, 0xabcdef);
  rpcCalls = [];
  const body = { network: 'base', address: '0xFbC2051AE2265686a469421b2C5A2D5462FbF5eB', signature: 'function totalSupply() view returns (uint256)', args: [] };
  const observed = await request('/contracts/read', 'POST', body);
  assert.equal(observed.values[0].value, '1000000000'); assert.equal(observed.block_number, 0xabcdef);
  assert.equal(rpcCalls.find(call => call.method === 'eth_call').params[1], '0xabcdef');
  assert.ok(rpcCalls.every(call => ['eth_call', 'eth_blockNumber', 'eth_chainId'].includes(call.method)));
  await request('/contracts/read', 'POST', { ...body, signature: 'function transfer(address,uint256) returns (bool)' }, 422);
  assert.equal((await request('/contracts/observations')).length, 1);
  const workflow = await request('/workflows', 'POST', workflowBody([{ id: 'chain', name: 'Read chain', kind: 'contract', ...body }, { ...aiStep('explain'), prompt: 'Explain the real observation: {{previous}}' }]), 201);
  const run = await request(`/workflows/${workflow.id}/run`, 'POST', { input: 'Chain context' }, 201);
  assert.match(run.steps[0].output, /1000000000/);
  assert.match(providerCalls.at(-1).body.messages.at(-1).content, /Block: 11259375/);
});

test('OpenGradient publication and paid execution require configured credentials and explicit payment settings', async () => {
  await request(`/files/${example.file.id}/publish`, 'POST', { repository: 'isolated-model', create_repository: true }, 503);
  const og = await request('/models/connect', 'POST', { name: 'Isolated OpenGradient model', provider: 'opengradient', provider_model: 'anthropic/claude-haiku-4-5' }, 201);
  await request('/execute', 'POST', { model_id: og.id, input: 'Test' }, 503);
  await request('/connections', 'PUT', { email: 'isolated@example.com', password: fakePassword, private_key: fakeWallet, payments_enabled: false });
  assert.equal((await stat(path.join(temporary, 'connections.json'))).mode & 0o777, 0o600);
  const published = await request(`/files/${example.file.id}/publish`, 'POST', { repository: 'isolated-model', create_repository: true });
  assert.equal(published.file.modelCid, 'QmIsolatedPublishedModel');
  assert.equal(sdkCalls.find(call => call.operation === 'hub_publish').input.create_repository, true);
  await request('/execute', 'POST', { model_id: og.id, input: 'Test' }, 409);
  await request('/connections/approve', 'POST', { amount: 1 }, 409);
  await request('/connections', 'PUT', { payments_enabled: true });
  const result = await request('/execute', 'POST', { model_id: og.id, input: 'Test' }, 201);
  assert.equal(result.inference.provider_metadata.tee_signature, 'isolated-signature');
  assert.equal(result.inference.provider_metadata.payment_hash, 'isolated-payment');
  assert.ok(!sdkCalls.some(call => call.operation === 'og_approve'), 'inference must not silently approve a token allowance');
  await request('/connections/approve', 'POST', { amount: 1 });
  assert.equal(sdkCalls.at(-2)?.operation === 'og_approve' || sdkCalls.at(-1)?.operation === 'og_approve', true);
});

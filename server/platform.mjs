import express from 'express';
import multer from 'multer';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { mkdirSync, createReadStream } from 'node:fs';
import { mkdir, rename, unlink, stat, rm } from 'node:fs/promises';
import path from 'node:path';
import { pool, transaction } from './db.mjs';
import { artifactRoot, createExecutionEngine, requireId } from './execution.mjs';
import { callBridge, problem } from './bridge.mjs';
import { createConnectionStore, publicConnections } from './platform-connections.mjs';
import { createBlockchainReader } from './blockchain.mjs';
import { createWorkflowEngine, validateWorkflow, tokenDigest, validWebhook } from './workflows.mjs';
import { createSettingsStore } from './ai.mjs';
import { defaultsFor } from '../shared/entities.mjs';
import { insertRow } from './seed.mjs';
import { networks } from '../shared/platform.mjs';

const text = (value, max, label) => { if (typeof value !== 'string' || !value.trim() || value.length > max) throw problem(422, `Enter ${label} of up to ${max} characters.`); return value.trim(); };
const hashFile = async filename => { const hash = createHash('sha256'); for await (const chunk of createReadStream(filename)) hash.update(chunk); return hash.digest('hex'); };
const cleanName = filename => path.basename(filename).replace(/[^a-zA-Z0-9_. -]/g, '_').slice(0, 160);
const publicFile = ({ storage_key, ...file }) => file;

export function createPlatform({ database = pool, transact = transaction, storageRoot = artifactRoot, bridge = callBridge, connections = createConnectionStore(), settingsStore = createSettingsStore(), fetchImpl = fetch, blockchain = createBlockchainReader({ fetchImpl }), execution } = {}) {
  const router = express.Router();
  const engine = execution || createExecutionEngine({ database, transact, storageRoot, bridge, connections, settingsStore, fetchImpl });
  const workflows = createWorkflowEngine({ database, execution: engine, blockchain });
  const temporary = path.join(storageRoot, '.uploads'); mkdirSync(temporary, { recursive: true });
  const uploader = multer({ dest: temporary, limits: { fileSize: 512 * 1024 * 1024, files: 1, fields: 6 }, fileFilter: (req, file, callback) => callback(null, /\.(onnx|gguf|safetensors|bin|pt|pth|json|txt|md|csv)$/i.test(file.originalname)) });
  async function model(id) { requireId(id); const row = (await database.query('SELECT * FROM models WHERE id=$1', [id])).rows[0]; if (!row) throw problem(404, 'Model not found.'); return row; }
  async function file(id) { requireId(id); const row = (await database.query('SELECT * FROM model_files WHERE id=$1', [id])).rows[0]; if (!row) throw problem(404, 'Model file not found.'); return row; }
  async function storeFile(modelId, incoming, version, notes = '') {
    const selected = await model(modelId);
    version = text(version || selected.version, 80, 'a version');
    if (!/^[a-zA-Z0-9_.-]+$/.test(version)) throw problem(422, 'Version labels can contain letters, numbers, dots, underscores, and dashes.');
    const filename = cleanName(incoming.originalname);
    if (!filename) throw problem(422, 'Choose a named model file.');
    const id = randomUUID(), storage_key = `${id}/${filename}`, destination = path.join(storageRoot, storage_key);
    await mkdir(path.dirname(destination), { recursive: true }); await rename(incoming.path, destination);
    try {
      const sha256 = await hashFile(destination);
      let metadata = null;
      if (/\.onnx$/i.test(filename)) {
        try { metadata = await bridge('onnx_inspect', { filename: destination }); }
        catch (error) { metadata = { runnable: false, error: error.message }; }
      }
      const result = await transact(async client => {
        const versionId = (await client.query('INSERT INTO model_versions(id,model_id,version,notes) VALUES($1,$2,$3,$4) ON CONFLICT(model_id,version) DO UPDATE SET notes=CASE WHEN EXCLUDED.notes<>\'\' THEN EXCLUDED.notes ELSE model_versions.notes END RETURNING id', [randomUUID(), modelId, version, String(notes).slice(0, 4000)])).rows[0].id;
        const stored = (await client.query('INSERT INTO model_files(id,model_id,version_id,filename,storage_key,size_bytes,sha256,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *', [id, modelId, versionId, filename, storage_key, incoming.size, sha256, metadata])).rows[0];
        await client.query("INSERT INTO activity(entity,record_id,record_name,action,detail) VALUES('models',$1,$2,'uploaded',$3)", [modelId, selected.name, `${filename} · version ${version} · ${incoming.size} bytes`]);
        if (metadata?.inputs) await client.query("INSERT INTO model_bindings(model_id,provider,artifact_id) VALUES($1,'onnx',$2) ON CONFLICT(model_id) DO NOTHING", [modelId, id]);
        return stored;
      });
      return publicFile(result);
    } catch (error) { await rm(path.dirname(destination), { recursive: true, force: true }); throw error; }
  }
  async function connectedModel(input) {
    const name = text(input.name, 160, 'a model name');
    if (!['openrouter', 'opengradient', 'opengradient-ml'].includes(input.provider)) throw problem(422, 'Choose a hosted model provider.');
    const provider_model = text(input.provider_model, 200, 'a provider model ID');
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_./:~@+-]*$/.test(provider_model)) throw problem(422, 'The provider model ID is invalid.');
    return transact(async client => {
      const row = await insertRow(client, 'models', { ...defaultsFor('models'), id: randomUUID(), name, owner: 'Personal workspace', runtime: 'Hosted API', status: 'Published', parameters: '', license: 'Provider terms', verification: input.provider === 'openrouter' ? 'None' : 'TEE', category: 'Text generation', description: String(input.description || `Executable ${input.provider} model connection.`).slice(0, 5000) });
      await client.query('INSERT INTO model_bindings(model_id,provider,provider_model) VALUES($1,$2,$3)', [row.id, input.provider, provider_model]);
      return row;
    });
  }
  router.get('/connections', async (req, res) => res.json(await publicConnections(connections, settingsStore, bridge)));
  router.put('/connections', async (req, res) => { await connections.save(req.body || {}); res.json(await publicConnections(connections, settingsStore, bridge)); });
  router.post('/connections/approve', async (req, res) => {
    const settings = await connections.read(), amount = req.body?.amount;
    if (!settings.private_key || !settings.payments_enabled) throw problem(409, 'Connect a wallet and enable payments first.');
    if (typeof amount !== 'number' || amount < 0.1 || amount > 10) throw problem(422, 'Choose an approval amount from 0.1 to 10 OPG.');
    res.json(await bridge('og_approve', { private_key: settings.private_key, amount }));
  });
  router.get('/networks/:network', async (req, res) => res.json(await blockchain.status(req.params.network)));
  router.get('/models/runnable', async (req, res) => {
    const { rows } = await database.query('SELECT m.id,m.name,m.status,b.provider,b.provider_model,b.artifact_id,f.metadata FROM models m JOIN model_bindings b ON b.model_id=m.id LEFT JOIN model_files f ON f.id=b.artifact_id ORDER BY m.name');
    res.json(rows);
  });
  router.post('/models/connect', async (req, res) => res.status(201).json(await connectedModel(req.body || {})));
  router.post('/models/example', async (req, res) => {
    const id = randomUUID(), filename = path.join(temporary, id);
    const example = await bridge('example_model', { filename });
    const row = await transact(client => insertRow(client, 'models', { ...defaultsFor('models'), id: randomUUID(), name: 'Weighted score · ONNX example', owner: 'Personal workspace', category: 'Classification', runtime: 'ONNX', verification: 'Local CPU', status: 'Published', parameters: '3 inputs · 1 output', description: example.description }));
    try { const artifact = await storeFile(row.id, { path: filename, originalname: 'weighted-score.onnx', size: (await stat(filename)).size }, '1.0.0', 'Working tutorial model with fixed coefficients.'); res.status(201).json({ model: row, file: artifact, example: example.example }); }
    finally { await unlink(filename).catch(() => {}); }
  });
  router.get('/models/:id/files', async (req, res) => {
    await model(req.params.id);
    const [versions, files, binding] = await Promise.all([
      database.query('SELECT * FROM model_versions WHERE model_id=$1 ORDER BY created_at DESC', [req.params.id]),
      database.query('SELECT * FROM model_files WHERE model_id=$1 ORDER BY created_at DESC', [req.params.id]),
      database.query('SELECT * FROM model_bindings WHERE model_id=$1', [req.params.id]),
    ]);
    res.json({ versions: versions.rows, files: files.rows.map(publicFile), binding: binding.rows[0] || null });
  });
  router.post('/models/:id/files', uploader.single('file'), async (req, res) => {
    if (!req.file) throw problem(422, 'Choose a model file: ONNX, GGUF, safetensors, weights, or an accompanying text/data file.');
    try { res.status(201).json(await storeFile(req.params.id, req.file, req.body.version, req.body.notes)); }
    finally { await unlink(req.file.path).catch(() => {}); }
  });
  router.get('/files/:id/download', async (req, res) => { const selected = await file(req.params.id); res.download(path.join(storageRoot, selected.storage_key), selected.filename); });
  router.delete('/files/:id', async (req, res) => {
    const selected = await file(req.params.id);
    await database.query('DELETE FROM model_files WHERE id=$1', [selected.id]);
    await rm(path.dirname(path.join(storageRoot, selected.storage_key)), { recursive: true, force: true });
    res.status(204).end();
  });
  router.put('/models/:id/binding', async (req, res) => {
    await model(req.params.id);
    const { provider, artifact_id, provider_model = '' } = req.body || {};
    if (!['onnx', 'openrouter', 'opengradient', 'opengradient-ml'].includes(provider)) throw problem(422, 'Choose an execution provider.');
    if (provider === 'onnx') {
      const artifact = await file(artifact_id);
      if (artifact.model_id !== req.params.id || !artifact.metadata?.inputs) throw problem(422, 'Choose a runnable ONNX file belonging to this model.');
    } else if (typeof provider_model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_./:~@+-]{0,199}$/.test(provider_model)) throw problem(422, 'Enter a valid provider model ID or Model Hub CID.');
    const saved = (await database.query('INSERT INTO model_bindings(model_id,provider,provider_model,artifact_id) VALUES($1,$2,$3,$4) ON CONFLICT(model_id) DO UPDATE SET provider=EXCLUDED.provider,provider_model=EXCLUDED.provider_model,artifact_id=EXCLUDED.artifact_id,updated_at=NOW() RETURNING *', [req.params.id, provider, provider_model, provider === 'onnx' ? artifact_id : null])).rows[0];
    res.json(saved);
  });
  router.post('/files/:id/publish', async (req, res) => {
    const selected = await file(req.params.id), settings = await connections.read();
    if (!settings.email || !settings.password) throw problem(503, 'Connect your Model Hub account in Connections before publishing.');
    const repository = text(req.body.repository, 160, 'a Model Hub repository name');
    if (!/^[a-zA-Z0-9_.-]+$/.test(repository)) throw problem(422, 'Use a repository name containing letters, numbers, dots, underscores, or dashes.');
    const result = await bridge('hub_publish', { email: settings.email, password: settings.password, filename: path.join(storageRoot, selected.storage_key), repository, create_repository: req.body.create_repository === true, remote_version: req.body.remote_version || '', notes: String(req.body.notes || 'Uploaded from Studio').slice(0, 1000), description: (await model(selected.model_id)).description }, { timeoutMs: 240000 });
    await database.query('UPDATE model_files SET hub_result=$1 WHERE id=$2', [result, selected.id]);
    await database.query('UPDATE model_bindings SET hub_repository=$1,hub_version=$2 WHERE model_id=$3', [result.repository, result.version, selected.model_id]);
    res.json(result);
  });
  router.post('/hub/files', async (req, res) => {
    const settings = await connections.read();
    if (!settings.email || !settings.password) throw problem(503, 'Connect your Model Hub account first.');
    res.json(await bridge('hub_files', { email: settings.email, password: settings.password, repository: text(req.body.repository, 160, 'a repository'), version: text(req.body.version, 80, 'a version') }));
  });
  router.post('/execute', async (req, res) => {
    const controller = new AbortController(); const disconnected = () => { if (!res.writableEnded) controller.abort(); }; res.once('close', disconnected);
    try { const result = await engine.execute(req.body || {}, { signal: controller.signal }); if (!controller.signal.aborted) res.status(201).json(result); }
    finally { res.off('close', disconnected); }
  });
  router.get('/agents/:id/runtime', async (req, res) => {
    requireId(req.params.id);
    const [agent, settings, history, memory] = await Promise.all([
      database.query('SELECT * FROM agents WHERE id=$1', [req.params.id]), database.query('SELECT * FROM agent_settings WHERE agent_id=$1', [req.params.id]),
      database.query('SELECT id,name,status,provider,created_at,error FROM inferences WHERE agent_id=$1 ORDER BY created_at DESC LIMIT 20', [req.params.id]),
      database.query('SELECT COUNT(*)::int AS total FROM agent_memory WHERE agent_id=$1', [req.params.id]),
    ]);
    if (!agent.rows[0]) throw problem(404, 'Agent not found.');
    res.json({ agent: agent.rows[0], settings: settings.rows[0] || { memory_enabled: true, temperature: 0.3, max_tokens: 2048 }, history: history.rows, memory_messages: memory.rows[0].total });
  });
  router.put('/agents/:id/runtime', async (req, res) => {
    requireId(req.params.id); const { memory_enabled, temperature, max_tokens } = req.body || {};
    if (typeof memory_enabled !== 'boolean' || typeof temperature !== 'number' || temperature < 0 || temperature > 1 || !Number.isInteger(max_tokens) || max_tokens < 256 || max_tokens > 8192) throw problem(422, 'Check memory, creativity, and maximum response tokens.');
    if (!(await database.query('SELECT 1 FROM agents WHERE id=$1', [req.params.id])).rowCount) throw problem(404, 'Agent not found.');
    res.json((await database.query('INSERT INTO agent_settings(agent_id,memory_enabled,temperature,max_tokens) VALUES($1,$2,$3,$4) ON CONFLICT(agent_id) DO UPDATE SET memory_enabled=EXCLUDED.memory_enabled,temperature=EXCLUDED.temperature,max_tokens=EXCLUDED.max_tokens,updated_at=NOW() RETURNING *', [req.params.id, memory_enabled, temperature, max_tokens])).rows[0]);
  });
  router.delete('/agents/:id/memory', async (req, res) => { requireId(req.params.id); await database.query('DELETE FROM agent_memory WHERE agent_id=$1', [req.params.id]); res.status(204).end(); });
  router.get('/workflows', async (req, res) => res.json((await database.query('SELECT id,name,description,status,trigger_type,interval_minutes,default_input,steps,next_run_at,last_run_at,revision FROM workflows ORDER BY created_at DESC')).rows));
  router.post('/workflows', async (req, res) => {
    const values = validateWorkflow(req.body); await workflows.validateReferences(values.steps);
    const token = randomBytes(32).toString('hex');
    const row = (await database.query('INSERT INTO workflows(id,name,description,status,trigger_type,interval_minutes,default_input,steps,webhook_hash,next_run_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,CASE WHEN $5=\'schedule\' AND $4=\'Active\' THEN NOW()+make_interval(mins => $6::int) ELSE NULL END) RETURNING id,name,revision', [randomUUID(), values.name, values.description, values.status, values.trigger_type, values.interval_minutes, values.default_input, JSON.stringify(values.steps), tokenDigest(token)])).rows[0];
    res.status(201).json({ ...row, webhook_token: token });
  });
  router.put('/workflows/:id', async (req, res) => {
    requireId(req.params.id); const values = validateWorkflow(req.body); await workflows.validateReferences(values.steps);
    if (!Number.isInteger(req.body.revision)) throw problem(422, 'A current workflow revision is required.');
    const row = (await database.query('UPDATE workflows SET name=$1,description=$2,status=$3,trigger_type=$4,interval_minutes=$5,default_input=$6,steps=$7,next_run_at=CASE WHEN $4=\'schedule\' AND $3=\'Active\' THEN NOW()+make_interval(mins => $5::int) ELSE NULL END,updated_at=NOW(),revision=revision+1 WHERE id=$8 AND revision=$9 RETURNING id,name,revision', [values.name, values.description, values.status, values.trigger_type, values.interval_minutes, values.default_input, JSON.stringify(values.steps), req.params.id, req.body.revision])).rows[0];
    if (!row) throw problem(409, 'This workflow changed. Reload it before saving.'); res.json(row);
  });
  router.post('/workflows/:id/run', async (req, res) => res.status(201).json(await workflows.run(req.params.id, req.body?.input)));
  router.get('/workflows/:id/runs', async (req, res) => { requireId(req.params.id); res.json((await database.query('SELECT * FROM workflow_runs WHERE workflow_id=$1 ORDER BY started_at DESC LIMIT 30', [req.params.id])).rows); });
  router.post('/workflows/:id/token', async (req, res) => {
    requireId(req.params.id); const token = randomBytes(32).toString('hex');
    if (!(await database.query('UPDATE workflows SET webhook_hash=$1 WHERE id=$2', [tokenDigest(token), req.params.id])).rowCount) throw problem(404, 'Workflow not found.');
    res.json({ webhook_token: token });
  });
  router.post('/hooks/:id', async (req, res) => {
    requireId(req.params.id); const row = (await database.query("SELECT webhook_hash FROM workflows WHERE id=$1 AND status='Active' AND trigger_type='webhook'", [req.params.id])).rows[0];
    if (!row || !validWebhook(req.headers.authorization?.replace(/^Bearer /, ''), row.webhook_hash)) throw problem(401, 'Provide this workflow’s webhook token.');
    res.status(201).json(await workflows.run(req.params.id, req.body?.input, 'webhook'));
  });
  router.post('/contracts/read', async (req, res) => {
    const result = await blockchain.read(req.body || {});
    await database.query('INSERT INTO chain_observations(id,contract_id,network,address,method,result,block_number) VALUES($1,$2,$3,$4,$5,$6,$7)', [randomUUID(), req.body.contract_id ? requireId(req.body.contract_id) : null, result.network, result.address, result.method, result, result.block_number]);
    res.json(result);
  });
  router.get('/contracts/observations', async (req, res) => res.json((await database.query('SELECT * FROM chain_observations ORDER BY created_at DESC LIMIT 30')).rows));
  router.post('/workflows/deploy-alpha', async (req, res) => {
    const settings = await connections.read(); if (!settings.private_key || !settings.payments_enabled) throw problem(409, 'Connect your wallet and enable network execution first.');
    const input = req.body || {};
    for (const key of ['model_cid','base','quote','input_tensor']) text(input[key], 200, key);
    for (const [key, min, max] of [['candles',1,1000],['candle_minutes',1,1440],['frequency',60,604800],['duration_hours',1,8760]]) if (!Number.isInteger(input[key]) || input[key] < min || input[key] > max) throw problem(422, `Check ${key}.`);
    if (!Array.isArray(input.candle_types) || !input.candle_types.length || input.candle_types.some(value => !['OPEN','HIGH','LOW','CLOSE','VOLUME'].includes(value))) throw problem(422, 'Choose valid candle fields.');
    const result = await bridge('og_deploy', { ...input, private_key: settings.private_key });
    await transact(client => insertRow(client, 'contracts', { ...defaultsFor('contracts'), id: randomUUID(), name: String(input.name || 'OpenGradient ML workflow').slice(0,255), address: result.address, network: 'OpenGradient alpha', status: 'Registered', description: `Deployed through the OpenGradient SDK. Model CID: ${input.model_cid}` }));
    res.status(201).json(result);
  });
  router.post('/workflows/alpha-result', async (req, res) => {
    const settings = await connections.read(); if (!settings.private_key) throw problem(503, 'Connect your OpenGradient wallet first.');
    if (!/^0x[a-fA-F0-9]{40}$/.test(req.body?.address || '')) throw problem(422, 'Enter a valid workflow contract address.');
    res.json(await bridge('og_workflow_result', { private_key: settings.private_key, address: req.body.address }));
  });
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof multer.MulterError) return res.status(422).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Files must be 512 MB or smaller.' : 'Upload one model file at a time.' });
    if (!error.status) return next(error);
    res.status(error.status).json({ error: error.message, fields: error.fields });
  });
  return { router, workflows, execution: engine };
}

export const platform = createPlatform();

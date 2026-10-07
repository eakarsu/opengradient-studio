import express from 'express';
import { randomUUID, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool, transaction } from './db.mjs';
import { entities, entityOrder, defaultsFor } from '../shared/entities.mjs';
import { insertRow } from './seed.mjs';
import { receiptPayload, digestPayload, sandboxInference } from './receipts.mjs';
import { createAiRouter } from './ai.mjs';
import { platform } from './platform.mjs';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
      const allowed = new Set([`http://${req.headers.host}`, `https://${req.headers.host}`, 'http://127.0.0.1:5173', 'http://localhost:5173']);
      if (!allowed.has(req.headers.origin)) return res.status(403).json({ error: 'Cross-origin writes are not allowed.' });
    }
  }
  next();
});

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
app.use('/api/ai', createAiRouter());
app.use('/api/platform', platform.router);
function fail(status, message, fields) { const error = new Error(message); error.status = status; error.fields = fields; throw error; }
function requireEntity(value) { if (!Object.hasOwn(entities, value)) fail(404, 'This collection does not exist.'); return entities[value]; }
function requireId(value) { if (!uuid.test(value || '')) fail(400, 'Invalid record ID.'); return value; }
function requireRevision(value) { if (!Number.isInteger(value) || value < 1) fail(400, 'A valid record revision is required.'); return value; }

function validate(entity, input, existing) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'Provide a JSON object.');
  const config = requireEntity(entity);
  const allowed = new Set([...config.fields.filter(field => !field.readOnly).map(field => field.key), 'revision']);
  for (const key of Object.keys(input)) if (!allowed.has(key)) fail(400, `Unknown or read-only field: ${key}`);
  const result = existing ? {} : defaultsFor(entity);
  const errors = {};
  for (const field of config.fields) {
    if (field.readOnly) continue;
    if (existing && !Object.hasOwn(input, field.key)) continue;
    let value = Object.hasOwn(input, field.key) ? input[field.key] : result[field.key];
    if (field.immutable && existing) {
      if (value !== existing[field.key]) errors[field.key] = `${field.label} cannot be changed after creation.`;
      else result[field.key] = existing[field.key];
      // Deleted sources remain null; their retained receipts can still be annotated.
      continue;
    }
    if (field.type === 'reference') {
      if (value === '' || value === undefined || value === null) value = null;
      if (field.required && !value) errors[field.key] = `${field.label} is required.`;
      else if (value !== null && (typeof value !== 'string' || !uuid.test(value))) errors[field.key] = `Choose a valid ${field.label.toLowerCase()}.`;
    } else if (field.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) errors[field.key] = `${field.label} must be a number.`;
      else if (value < (field.min ?? 0) || value > (field.max ?? 1e12)) errors[field.key] = `${field.label} must be between ${field.min ?? 0} and ${field.max ?? 1e12}.`;
      else if (field.integer && (!Number.isInteger(value) || value > 2147483647)) errors[field.key] = `${field.label} must be a whole number below 2,147,483,648.`;
    } else {
      if (typeof value !== 'string') { errors[field.key] = `${field.label} must be text.`; continue; }
      value = value.trim();
      if (field.required && !value) errors[field.key] = `${field.label} is required.`;
      if (value.length > (field.maxLength ?? 255)) errors[field.key] = `${field.label} is too long (maximum ${field.maxLength ?? 255} characters).`;
      if (field.type === 'select' && !field.options.includes(value)) errors[field.key] = `Choose a valid ${field.label.toLowerCase()}.`;
      if (field.pattern && value && !new RegExp(field.pattern).test(value)) errors[field.key] = `${field.label} has an invalid format.`;
    }
    result[field.key] = value;
  }
  if (Object.keys(errors).length) fail(422, 'Please check the highlighted fields.', errors);
  return result;
}

async function audit(client, entity, record, action, detail = '') {
  await client.query('INSERT INTO activity(entity,record_id,record_name,action,detail) VALUES($1,$2,$3,$4,$5)', [entity, record.id, record.name, action, detail]);
}

async function hydrate(client, entity, rows) {
  const enriched = rows.map(row => ({ ...row, references: {} }));
  await Promise.all(entities[entity].fields.filter(field => field.type === 'reference').map(async field => {
    const ids = [...new Set(rows.map(row => row[field.key]).filter(Boolean))];
    if (!ids.length) return;
    const result = await client.query(`SELECT id,name FROM "${field.entity}" WHERE id=ANY($1::uuid[])`, [ids]);
    const names = new Map(result.rows.map(row => [row.id, row.name]));
    enriched.forEach(row => { row.references[field.key] = names.get(row[field.key]) || 'Unlinked record'; });
  }));
  return enriched;
}

app.get('/api/health', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', database: 'postgresql', mode: 'local-workspace' });
});

app.get('/api/meta', (req, res) => res.json({ entities, entityOrder, mode: 'local-workspace' }));

app.get('/api/overview', async (req, res) => {
  const days = [7, 14, 30].includes(Number(req.query.days)) ? Number(req.query.days) : 14;
  const [countsResult, metrics, chart, regions, recent, featured, activity] = await Promise.all([
    pool.query(entityOrder.map(entity => `SELECT '${entity}' AS entity, COUNT(*)::int AS count FROM "${entity}"`).join(' UNION ALL ')),
    pool.query(`SELECT
      (SELECT COUNT(*)::int FROM models WHERE status='Published') AS published_models,
      (SELECT COUNT(*)::int FROM agents WHERE status='Active') AS active_agents,
      (SELECT COUNT(*)::int FROM nodes WHERE status='Online') AS online_nodes,
      (SELECT COUNT(*)::int FROM inferences WHERE status='Completed') AS completed,
      (SELECT COALESCE(ROUND(AVG(latency_ms)),0)::int FROM inferences WHERE status='Completed') AS avg_latency,
      (SELECT COALESCE(SUM(cost),0) FROM inferences) AS credits,
      (SELECT COUNT(*)::int FROM ai_runs) AS ai_responses,
      (SELECT COUNT(*)::int FROM proofs WHERE status='Valid') AS valid_proofs`),
    pool.query(`SELECT TO_CHAR(day,'YYYY-MM-DD') AS date, COUNT(i.id)::int AS total,
      COUNT(i.id) FILTER (WHERE i.status='Completed')::int AS completed
      FROM generate_series(CURRENT_DATE - ($1::int - 1),CURRENT_DATE,'1 day') AS day
      LEFT JOIN inferences i ON i.created_at >= day AND i.created_at < day + INTERVAL '1 day'
      GROUP BY day ORDER BY day`, [days]),
    pool.query(`SELECT region, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='Online')::int AS online FROM nodes GROUP BY region ORDER BY total DESC`),
    pool.query('SELECT * FROM inferences ORDER BY created_at DESC,id LIMIT 5'),
    pool.query("SELECT m.*, (SELECT COUNT(*)::int FROM inferences i WHERE i.model_id=m.id) AS inference_count FROM models m WHERE status='Published' ORDER BY created_at ASC,id LIMIT 3"),
    pool.query('SELECT * FROM activity ORDER BY created_at DESC,id DESC LIMIT 6'),
  ]);
  res.json({
    counts: Object.fromEntries(countsResult.rows.map(row => [row.entity, row.count])), metrics: metrics.rows[0],
    chart: chart.rows, regions: regions.rows, recent: await hydrate(pool, 'inferences', recent.rows), featured: featured.rows, activity: activity.rows,
  });
});

app.get('/api/options/:entity', async (req, res) => {
  requireEntity(req.params.entity);
  const { rows } = await pool.query(`SELECT id,name,status FROM "${req.params.entity}" ORDER BY name LIMIT 2000`);
  res.json(rows);
});

app.post('/api/inferences/run', async (req, res) => {
  const { model_id, node_id, agent_id, input } = req.body || {};
  if (typeof input !== 'string' || !input.trim() || input.length > 20000) fail(422, 'Enter an input between 1 and 20,000 characters.');
  requireId(model_id);
  if (node_id) requireId(node_id);
  if (agent_id) requireId(agent_id);
  const result = await transaction(async client => {
    const model = (await client.query('SELECT * FROM models WHERE id=$1 FOR SHARE', [model_id])).rows[0];
    if (!model) fail(404, 'Model not found.');
    if (model.status !== 'Published') fail(409, 'Publish the model before running an inference.');
    let agent;
    if (agent_id) {
      agent = (await client.query('SELECT * FROM agents WHERE id=$1 FOR UPDATE', [agent_id])).rows[0];
      if (!agent) fail(404, 'Agent not found.');
      if (agent.status !== 'Active') fail(409, 'Activate the agent before running it.');
      if (agent.model_id !== model_id) fail(409, 'This agent uses a different model. Reopen the runner to refresh it.');
    }
    const node = node_id ? (await client.query('SELECT * FROM nodes WHERE id=$1 FOR SHARE', [node_id])).rows[0] : null;
    if (node_id && !node) fail(404, 'Compute node not found.');
    if (node && node.status !== 'Online') fail(409, 'Choose an online compute node.');
    const started = performance.now();
    const output = sandboxInference(input.trim(), model);
    const latency = Math.max(1, Math.round(performance.now() - started));
    const tokens = Math.ceil((input.length + output.length) / 4);
    const cost = +(tokens * 0.00001).toFixed(4);
    if (agent) {
      const spent = Number((await client.query('SELECT COALESCE(SUM(cost),0) AS spent FROM inferences WHERE agent_id=$1 AND status=$2', [agent_id, 'Completed'])).rows[0].spent);
      if (spent + cost > agent.budget) fail(409, 'This run exceeds the agent’s demo-credit budget. Edit the agent to increase it.');
    }
    const inference = await insertRow(client, 'inferences', {
      ...defaultsFor('inferences'), id: randomUUID(), name: `${agent?.name || model.name} · sandbox run`,
      model_id, node_id: node_id || null, agent_id: agent_id || null, status: 'Completed', verification: 'Local hash',
      latency_ms: latency, tokens, cost, input: input.trim(), output,
      description: 'Executed locally with deterministic text analysis. Linked nodes are catalog metadata; no external GPU or onchain execution occurred.',
    });
    const payload = receiptPayload(inference);
    const proof = await insertRow(client, 'proofs', {
      ...defaultsFor('proofs'), id: randomUUID(), name: `Receipt · ${model.name}`, inference_id: inference.id,
      scheme: 'SHA-256', status: 'Valid', digest: digestPayload(payload), payload,
      description: 'A local SHA-256 input/output integrity receipt. Not a TEE attestation or zkML proof.',
    });
    const settlement = await insertRow(client, 'transactions', {
      ...defaultsFor('transactions'), id: randomUUID(), name: `Settlement · ${model.name}`,
      kind: 'Inference settlement', inference_id: inference.id, tx_hash: `0x${randomBytes(32).toString('hex')}`,
      from_address: `0x${'1'.repeat(40)}`, to_address: `0x${'2'.repeat(40)}`,
      amount: cost, status: 'Simulated', network: 'Local sandbox', description: 'Local ledger entry; no payment or blockchain transaction was sent.',
    });
    await audit(client, 'inferences', inference, 'completed', 'Sandbox run stored with an integrity receipt and simulated settlement.');
    await audit(client, 'proofs', proof, 'created', 'Local SHA-256 receipt created.');
    await audit(client, 'transactions', settlement, 'created', 'Simulated settlement recorded.');
    if (agent) await audit(client, 'agents', agent, 'executed', `Sandbox run ${inference.id}`);
    return { inference: (await hydrate(client, 'inferences', [inference]))[0], proof, transaction: settlement };
  });
  res.status(201).json(result);
});

app.post('/api/proofs/:id/verify', async (req, res) => {
  requireId(req.params.id);
  const result = await transaction(async client => {
    const initial = (await client.query('SELECT * FROM proofs WHERE id=$1', [req.params.id])).rows[0];
    if (!initial) fail(404, 'Receipt not found.');
    // Lock sources before receipts, matching inference edit/delete lock order.
    const inference = initial.inference_id ? (await client.query('SELECT * FROM inferences WHERE id=$1 FOR SHARE', [initial.inference_id])).rows[0] : null;
    const proof = (await client.query('SELECT * FROM proofs WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (!proof) fail(404, 'Receipt not found.');
    const valid = Boolean(inference && inference.status === 'Completed' && digestPayload(receiptPayload(inference)) === proof.digest && digestPayload(proof.payload) === proof.digest);
    const status = valid ? 'Valid' : inference?.status === 'Queued' ? 'Pending' : 'Invalid';
    const updated = (await client.query('UPDATE proofs SET status=$1,updated_at=NOW(),revision=revision+1 WHERE id=$2 RETURNING *', [status, proof.id])).rows[0];
    const message = valid ? 'Input and output match the stored SHA-256 receipt.' : !inference ? 'The source inference was deleted. The receipt can no longer be checked against it.' : inference.status !== 'Completed' ? 'The source inference has not completed successfully.' : 'Input or output has changed. This receipt no longer matches the source inference.';
    await audit(client, 'proofs', updated, valid ? 'verified' : 'checked', message);
    return { valid, message, record: (await hydrate(client, 'proofs', [updated]))[0] };
  });
  res.json(result);
});

app.get('/api/:entity', async (req, res) => {
  const entity = req.params.entity;
  const config = requireEntity(entity);
  const page = Number(req.query.page ?? 1);
  const pageSize = Number(req.query.pageSize ?? 15);
  if (!Number.isInteger(page) || page < 1 || page > 100000 || ![15, 30, 60, 100].includes(pageSize)) fail(400, 'Invalid pagination.');
  const sort = req.query.sort || 'created_at';
  const order = req.query.order || 'desc';
  if (![...config.fields.map(field => field.key), 'created_at', 'updated_at'].includes(sort) || !['asc', 'desc'].includes(order)) fail(400, 'Invalid sort order.');
  const params = [];
  const clauses = [];
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 200) : '';
  if (q) {
    params.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
    clauses.push(`(${config.fields.filter(field => field.type === 'text' || field.type === 'textarea' || field.type === 'select').map(field => `"${field.key}" ILIKE $${params.length}`).join(' OR ')})`);
  }
  for (const key of ['status', 'category', 'kind']) {
    if (req.query[key] && config.fields.some(field => field.key === key)) {
      params.push(req.query[key]); clauses.push(`"${key}"=$${params.length}`);
    }
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = (await pool.query(`SELECT COUNT(*)::int AS count FROM "${entity}" ${where}`, params)).rows[0].count;
  const { rows } = await pool.query(`SELECT * FROM "${entity}" ${where} ORDER BY "${sort}" ${order.toUpperCase()},id ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, pageSize, (page - 1) * pageSize]);
  res.json({ rows: await hydrate(pool, entity, rows), total, page, pageSize, pages: Math.ceil(total / pageSize) });
});

app.get('/api/:entity/:id', async (req, res) => {
  const { entity, id } = req.params;
  requireEntity(entity); requireId(id);
  const record = (await pool.query(`SELECT * FROM "${entity}" WHERE id=$1`, [id])).rows[0];
  if (!record) fail(404, 'This record was deleted or could not be found.');
  const { rows: activity } = await pool.query('SELECT * FROM activity WHERE entity=$1 AND record_id=$2 ORDER BY created_at DESC,id DESC LIMIT 30', [entity, id]);
  res.json({ record: (await hydrate(pool, entity, [record]))[0], activity });
});

app.post('/api/:entity', async (req, res) => {
  const entity = req.params.entity;
  const data = validate(entity, req.body);
  const result = await transaction(async client => {
    if (entity === 'proofs') {
      const inference = (await client.query('SELECT * FROM inferences WHERE id=$1 FOR SHARE', [data.inference_id])).rows[0];
      if (!inference) fail(422, 'Choose an existing inference job.');
      data.payload = receiptPayload(inference);
      data.digest = digestPayload(data.payload);
      data.status = inference.status === 'Completed' ? 'Valid' : 'Pending';
    }
    if (entity === 'transactions') data.tx_hash = `0x${randomBytes(32).toString('hex')}`;
    const record = await insertRow(client, entity, { id: randomUUID(), ...data });
    await audit(client, entity, record, 'created');
    return (await hydrate(client, entity, [record]))[0];
  });
  res.status(201).json(result);
});

app.patch('/api/:entity/:id', async (req, res) => {
  const { entity, id } = req.params;
  requireEntity(entity); requireId(id); requireRevision(req.body?.revision);
  const result = await transaction(async client => {
    const existing = (await client.query(`SELECT * FROM "${entity}" WHERE id=$1 FOR UPDATE`, [id])).rows[0];
    if (!existing) fail(404, 'This record no longer exists.');
    if (existing.revision !== req.body.revision) fail(409, 'This record changed in another window. Cancel and reopen it before editing.');
    const data = validate(entity, req.body, existing);
    const keys = Object.keys(data);
    if (!keys.length) fail(400, 'No changes provided.');
    const record = (await client.query(`UPDATE "${entity}" SET ${keys.map((key, index) => `"${key}"=$${index + 1}`).join(',')},updated_at=NOW(),revision=revision+1 WHERE id=$${keys.length + 1} RETURNING *`, [...keys.map(key => data[key]), id])).rows[0];
    if (entity === 'inferences' && ['input', 'output', 'status'].some(key => data[key] !== undefined && data[key] !== existing[key])) {
      await client.query("UPDATE proofs SET status='Pending',updated_at=NOW(),revision=revision+1 WHERE inference_id=$1", [id]);
    }
    await audit(client, entity, record, 'updated');
    return (await hydrate(client, entity, [record]))[0];
  });
  res.json(result);
});

app.delete('/api/:entity/:id', async (req, res) => {
  const { entity, id } = req.params;
  requireEntity(entity); requireId(id); requireRevision(req.body?.revision);
  await transaction(async client => {
    const record = (await client.query(`SELECT * FROM "${entity}" WHERE id=$1 FOR UPDATE`, [id])).rows[0];
    if (!record) fail(404, 'This record has already been deleted.');
    if (record.revision !== req.body.revision) fail(409, 'This record has changed. Cancel and reopen it before deleting.');
    if (entity === 'inferences') await client.query("UPDATE proofs SET status='Invalid',updated_at=NOW(),revision=revision+1 WHERE inference_id=$1", [id]);
    await client.query(`DELETE FROM "${entity}" WHERE id=$1`, [id]);
    await audit(client, entity, record, 'deleted', 'Related records are retained; references to this record are cleared.');
  });
  res.status(204).end();
});

app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
app.use(express.static(dist, { etag: true, maxAge: '1h', setHeaders: (res, file) => { if (file.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
app.use((req, res, next) => {
  if (req.method === 'GET' && !path.extname(req.path)) return res.sendFile(path.join(dist, 'index.html'), error => error && next(error));
  next();
});
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.code === '23503') return res.status(422).json({ error: 'A linked record no longer exists. Refresh and select another record.' });
  if (error.code === '23505') return res.status(409).json({ error: 'A record with this unique address or hash already exists.' });
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body must be valid JSON.' });
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
  const status = error.status || 500;
  if (status >= 500) console.error('Request failed:', error.message);
  res.status(status).json({ error: status >= 500 ? 'The server could not complete this request. Check the server log and PostgreSQL connection.' : error.message, fields: error.fields });
});

export default app;

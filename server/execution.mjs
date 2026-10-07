import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool, transaction } from './db.mjs';
import { createSettingsStore } from './ai.mjs';
import { createConnectionStore } from './platform-connections.mjs';
import { callBridge, problem } from './bridge.mjs';
import { receiptPayload, digestPayload } from './receipts.mjs';

export const artifactRoot = fileURLToPath(new URL('../.runtime/artifacts/', import.meta.url));
export const isId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const requireId = value => { if (!isId(value)) throw problem(422, 'Choose a valid workspace record.'); return value; };
const integer = (value, min, max, label) => { if (!Number.isInteger(value) || value < min || value > max) throw problem(422, `${label} must be between ${min} and ${max}.`); return value; };
const cell = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
export function predictionReport(outputs) {
  return '## Model prediction\n\n' + outputs.map(output => {
    const values = Array.isArray(output.values) ? output.values.flat(Infinity) : [output.values];
    return `### ${cell(output.name)}\n\nShape: ${output.shape?.join(' × ') || 'Scalar'} · Type: ${output.type || 'numeric'}\n\n| Position | Value |\n| --- | --- |\n${values.slice(0, 100).map((value, index) => `| ${index + 1} | ${cell(value)} |`).join('\n')}${values.length > 100 ? '\n\nShowing the first 100 values. Download the full result for every value.' : ''}`;
  }).join('\n\n');
}

export function createExecutionEngine({ database = pool, transact = transaction, settingsStore = createSettingsStore(), connections = createConnectionStore(), bridge = callBridge, fetchImpl = fetch, storageRoot = artifactRoot } = {}) {
  async function complete(binding, messages, parameters, signal) {
    if (binding.provider === 'openrouter') {
      const settings = await settingsStore.read();
      if (!settings.apiKey) throw problem(503, 'Connect OpenRouter in AI settings to run this model.');
      let response;
      try { response = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json', 'X-OpenRouter-Title': 'OpenGradient Studio' },
        body: JSON.stringify({ model: binding.provider_model, messages, ...parameters, stream: false }),
        signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(90000)]),
      }); } catch (error) { if (signal?.aborted) throw problem(499, 'Request cancelled.'); throw problem(504, 'The AI provider did not respond in time. Try again or choose another model.'); }
      if (!response.ok) {
        const errors = { 401: 'OpenRouter rejected your API key. Update AI settings.', 402: 'OpenRouter credits are unavailable. Choose a free model or review your balance.', 429: 'OpenRouter is rate limited. Try again shortly or choose another model.' };
        throw problem(response.status === 401 || response.status === 402 || response.status === 429 ? response.status : 502, errors[response.status] || 'OpenRouter could not run this model. Check the model ID and try again.');
      }
      const result = await response.json();
      const content = result.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw problem(502, 'The model returned no answer. Try a different model.');
      return { output: content.trim(), tokens: result.usage?.total_tokens || 0, cost: result.usage?.cost || 0,
        metadata: { model: result.model || binding.provider_model, provider_id: result.id, usage: result.usage, truncated: result.choices[0].finish_reason === 'length' } };
    }
    const settings = await connections.read();
    if (!settings.private_key) throw problem(503, 'Connect your OpenGradient wallet in Connections to use this model.');
    if (!settings.payments_enabled) throw problem(409, 'Enable OpenGradient payments in Connections before running network inference.');
    const result = await bridge('og_chat', { private_key: settings.private_key, model: binding.provider_model, messages, ...parameters }, { signal });
    if (!result.chat_output?.content) throw problem(502, 'OpenGradient returned no answer.');
    const { chat_output, images, ...metadata } = result;
    return { output: chat_output.content, tokens: result.usage?.total_tokens || 0, cost: result.usage?.cost || 0, metadata: { ...metadata, model: binding.provider_model, trust: 'Registry-pinned TLS; TEE signature retained for settlement verification.' } };
  }

  async function execute(input, { signal } = {}) {
    const modelId = requireId(input.model_id);
    const prompt = typeof input.input === 'string' ? input.input.trim() : '';
    if (!prompt || prompt.length > 20000) throw problem(422, 'Provide an input between 1 and 20,000 characters.');
    const model = (await database.query('SELECT m.*,b.provider,b.provider_model,b.artifact_id FROM models m LEFT JOIN model_bindings b ON b.model_id=m.id WHERE m.id=$1', [modelId])).rows[0];
    if (!model) throw problem(404, 'Model not found.');
    if (model.status !== 'Published') throw problem(409, 'Publish the model before running it.');
    if (!model.provider) throw problem(409, 'This model needs an executable connection. Open its files and runtime settings to attach weights or select a provider.');
    let agent, memory = [];
    if (input.agent_id) {
      requireId(input.agent_id);
      agent = (await database.query('SELECT a.*,s.memory_enabled,s.temperature,s.max_tokens FROM agents a LEFT JOIN agent_settings s ON s.agent_id=a.id WHERE a.id=$1', [input.agent_id])).rows[0];
      if (!agent) throw problem(404, 'Agent not found.');
      if (agent.status !== 'Active') throw problem(409, 'Activate the agent before running it.');
      if (agent.model_id !== modelId) throw problem(409, 'Use the agent’s configured model.');
      if (agent.memory_enabled !== false) {
        memory = (await database.query('SELECT role,content FROM agent_memory WHERE agent_id=$1 ORDER BY sequence DESC LIMIT 12', [agent.id])).rows.reverse().map(message => ({ ...message, content: message.content.slice(0, 8000) }));
      }
    }
    const max_tokens = integer(input.max_tokens ?? agent?.max_tokens ?? 2048, 256, 8192, 'Maximum tokens');
    const temperature = input.temperature ?? agent?.temperature ?? 0.3;
    if (typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature < 0 || temperature > 1) throw problem(422, 'Creativity must be between zero and one.');
    const name = String(input.name || `${agent?.name || model.name} · execution`).slice(0, 255);
    const runId = randomUUID();
    await database.query("INSERT INTO inferences(id,name,model_id,agent_id,status,verification,input,provider) VALUES($1,$2,$3,$4,'Queued','Local hash',$5,$6)", [runId, name, modelId, agent?.id || null, prompt, model.provider]);
    const started = performance.now();
    try {
      let result;
      if (model.provider === 'onnx') {
        const file = model.artifact_id ? (await database.query('SELECT * FROM model_files WHERE id=$1 AND model_id=$2', [model.artifact_id, modelId])).rows[0] : null;
        if (!file) throw problem(409, 'Attach an uploaded ONNX file to this model first.');
        let tensors;
        try { tensors = JSON.parse(prompt); } catch { throw problem(422, 'Enter valid tensor values for the ONNX model.'); }
        if (!tensors || Array.isArray(tensors) || typeof tensors !== 'object') throw problem(422, 'Provide named model inputs.');
        const predicted = await bridge('onnx_run', { filename: path.join(storageRoot, file.storage_key), inputs: tensors }, { signal });
        result = { output: predictionReport(predicted.outputs), tokens: 0, cost: 0, metadata: { ...predicted, artifact_id: file.id, sha256: file.sha256 } };
      } else if (model.provider === 'opengradient-ml') {
        const settings = await connections.read();
        if (!settings.private_key || !settings.payments_enabled) throw problem(503, 'Connect your wallet and enable network execution in Connections.');
        let tensors; try { tensors = JSON.parse(prompt); } catch { throw problem(422, 'Provide named ML inputs as valid tensor data.'); }
        if (!tensors || Array.isArray(tensors) || typeof tensors !== 'object') throw problem(422, 'Provide named ML input tensors.');
        if (!['VANILLA', 'TEE', 'ZKML'].includes(input.verification_mode || 'VANILLA')) throw problem(422, 'Choose a supported ML verification mode.');
        const predicted = await bridge('og_ml', { private_key: settings.private_key, model_cid: model.provider_model, inputs: tensors, mode: input.verification_mode || 'VANILLA' }, { signal });
        const outputs = Object.entries(predicted.model_output || {}).map(([name, values]) => ({ name, values, type: 'numeric' }));
        result = { output: predictionReport(outputs), tokens: 0, cost: 0, metadata: predicted };
      } else {
        const instructions = [agent?.instructions, input.system, 'Respond professionally in Markdown with descriptive headings and useful next steps. Do not invent external actions, sources, measurements, or transaction results.'].filter(Boolean).join('\n\n').slice(0, 18000);
        result = await complete(model, [{ role: 'system', content: instructions }, ...memory, { role: 'user', content: prompt }], { max_tokens, temperature }, signal);
      }
      if (signal?.aborted) throw problem(499, 'Request cancelled.');
      if (typeof result.output !== 'string' || result.output.length > 120000) throw problem(502, 'The model returned an unusable response.');
      const duration = Math.round(performance.now() - started);
      return await transact(async client => {
        const inference = (await client.query("UPDATE inferences SET status='Completed',output=$1,latency_ms=$2,tokens=$3,cost=$4,provider_metadata=$5,updated_at=NOW(),revision=revision+1 WHERE id=$6 RETURNING *", [result.output, duration, Number.isInteger(result.tokens) ? result.tokens : 0, result.cost, result.metadata, runId])).rows[0];
        const payload = receiptPayload(inference);
        const proof = (await client.query("INSERT INTO proofs(id,name,inference_id,scheme,status,digest,payload,description) VALUES($1,$2,$3,'SHA-256','Valid',$4,$5,$6) RETURNING *", [randomUUID(), `Integrity · ${name}`.slice(0, 255), runId, digestPayload(payload), payload, 'SHA-256 receipt of the saved input and result. Provider proof material is retained separately on the inference.'])).rows[0];
        await client.query("INSERT INTO activity(entity,record_id,record_name,action,detail) VALUES('inferences',$1,$2,'executed',$3)", [runId, name, `Executed using ${model.provider}.`]);
        if (agent && agent.memory_enabled !== false) {
          for (const [role, content] of [['user', prompt], ['assistant', result.output]]) await client.query('INSERT INTO agent_memory(id,agent_id,inference_id,role,content) VALUES($1,$2,$3,$4,$5)', [randomUUID(), agent.id, runId, role, content]);
        }
        return { inference, proof, outputs: result.metadata.outputs || null };
      });
    } catch (error) {
      const message = error.status ? error.message : 'Model execution failed. Check the connection and inputs, then try again.';
      await database.query("UPDATE inferences SET status='Failed',error=$1,latency_ms=$2,updated_at=NOW(),revision=revision+1 WHERE id=$3", [message, Math.round(performance.now() - started), runId]);
      throw error.status ? error : problem(502, message);
    }
  }
  return { execute, complete };
}

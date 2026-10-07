import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { pool } from './db.mjs';
import { problem } from './bridge.mjs';
import { requireId } from './execution.mjs';
import { networks } from '../shared/platform.mjs';

export function validateWorkflow(input) {
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 120) throw problem(422, 'Give the workflow a name of up to 120 characters.');
  if (!['Draft', 'Active', 'Paused'].includes(input.status)) throw problem(422, 'Choose a workflow status.');
  if (!['manual', 'schedule', 'webhook'].includes(input.trigger_type)) throw problem(422, 'Choose a workflow trigger.');
  if (!Number.isInteger(input.interval_minutes) || input.interval_minutes < 1 || input.interval_minutes > 10080) throw problem(422, 'Schedule interval must be between 1 and 10,080 minutes.');
  if (typeof input.default_input !== 'string' || input.default_input.length > 20000) throw problem(422, 'Default input must be text of up to 20,000 characters.');
  if (input.trigger_type === 'schedule' && input.status === 'Active' && !input.default_input.trim()) throw problem(422, 'Provide a default input for scheduled runs.');
  if (typeof input.description !== 'string' || input.description.length > 4000) throw problem(422, 'Description must be text of up to 4,000 characters.');
  if (!Array.isArray(input.steps) || !input.steps.length || input.steps.length > 8) throw problem(422, 'Add between one and eight workflow steps.');
  const ids = new Set();
  const steps = input.steps.map(step => {
    if (!step || typeof step.id !== 'string' || !/^[a-z][a-z0-9_-]{0,39}$/.test(step.id) || ids.has(step.id)) throw problem(422, 'Step identifiers must be unique and start with a letter.');
    ids.add(step.id);
    if (typeof step.name !== 'string' || !step.name.trim() || step.name.length > 120) throw problem(422, 'Give every step a name of up to 120 characters.');
    if (!['model', 'agent', 'contract'].includes(step.kind)) throw problem(422, 'Choose a supported step type.');
    if (step.kind === 'contract') {
      if (!Object.hasOwn(networks, step.network) || !/^0x[0-9a-f]{40}$/i.test(step.address || '') || typeof step.signature !== 'string' || step.signature.length > 500 || !Array.isArray(step.args) || step.args.length > 20) throw problem(422, 'Check the network, contract address, read function, and arguments.');
      return { id: step.id, name: step.name.trim(), kind: step.kind, network: step.network, address: step.address, signature: step.signature, args: step.args };
    }
    requireId(step.kind === 'agent' ? step.agent_id : step.model_id);
    if (typeof step.prompt !== 'string' || !step.prompt.trim() || step.prompt.length > 18000) throw problem(422, 'Each AI step needs a prompt of up to 18,000 characters.');
    return { id: step.id, name: step.name.trim(), kind: step.kind, ...(step.kind === 'agent' ? { agent_id: step.agent_id } : { model_id: step.model_id }), prompt: step.prompt };
  });
  return { name, description: input.description.trim(), status: input.status, trigger_type: input.trigger_type, interval_minutes: input.interval_minutes, default_input: input.default_input, steps };
}

export const tokenDigest = token => createHash('sha256').update(token).digest('hex');
export function validWebhook(token, hash) {
  if (!token || !hash) return false;
  const supplied = Buffer.from(tokenDigest(token));
  const expected = Buffer.from(hash);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function createWorkflowEngine({ database = pool, execution, blockchain } = {}) {
  const running = new Set();
  const controllers = new Set();
  const completions = new Set();
  let stopping = false;
  async function validateReferences(steps) {
    for (const step of steps) {
      if (step.kind === 'contract') continue;
      const entity = step.kind === 'agent' ? 'agents' : 'models';
      const id = step.kind === 'agent' ? step.agent_id : step.model_id;
      if (!(await database.query(`SELECT 1 FROM "${entity}" WHERE id=$1`, [id])).rowCount) throw problem(422, `The ${step.name} source no longer exists.`);
    }
  }
  async function run(id, input, trigger = 'manual', options = {}) {
    requireId(id);
    if (stopping) throw problem(503, 'The app is stopping. Try this workflow after restart.');
    if (running.has(id)) throw problem(409, 'This workflow already has a run in progress.');
    const workflow = (await database.query('SELECT * FROM workflows WHERE id=$1', [id])).rows[0];
    if (!workflow) throw problem(404, 'Workflow not found.');
    if (workflow.status !== 'Active') throw problem(409, 'Activate the workflow before running it.');
    const source = typeof input === 'string' ? input : workflow.default_input;
    if (!source.trim() || source.length > 20000) throw problem(422, 'Provide workflow input of up to 20,000 characters.');
    await validateReferences(workflow.steps);
    if (running.has(id)) throw problem(409, 'This workflow already has a run in progress.');
    if (running.size >= 4) throw problem(429, 'Four workflows are already running. Try again when one finishes.');
    running.add(id);
    let lock;
    try {
      lock = await database.connect();
      const claimed = (await lock.query('SELECT pg_try_advisory_lock(hashtext($1)) AS acquired', [`studio-workflow:${id}`])).rows[0].acquired;
      if (!claimed) throw problem(409, 'This workflow already has a run in progress.');
      if (stopping) throw problem(503, 'The app is stopping. Try this workflow after restart.');
    } catch (error) {
      if (lock) { await lock.query('SELECT pg_advisory_unlock(hashtext($1))', [`studio-workflow:${id}`]).catch(() => {}); lock.release(); }
      running.delete(id); throw error;
    }
    const controller = new AbortController(); controllers.add(controller);
    let finish;
    const completedRun = new Promise(resolve => { finish = resolve; });
    completions.add(completedRun);
    const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
    const runId = randomUUID(), completed = [];
    try {
      await database.query("INSERT INTO workflow_runs(id,workflow_id,name,trigger_type,status,input) VALUES($1,$2,$3,$4,'Running',$5)", [runId, id, workflow.name, trigger, source]);
      let previous = '', outputs = {};
      for (const step of workflow.steps) {
        signal.throwIfAborted();
        const started = performance.now();
        let result, inference_id = null;
        if (step.kind === 'contract') {
          const observation = await blockchain.read(step, signal);
          result = `## Blockchain observation\n\nNetwork: ${observation.network_name}\n\nContract: ${observation.address}\n\nFunction: ${observation.method}\n\nBlock: ${observation.block_number}\n\n` + observation.values.map(value => `**${value.name}:** ${Array.isArray(value.value) ? value.value.join(', ') : value.value}`).join('\n\n');
          await database.query('INSERT INTO chain_observations(id,network,address,method,result,block_number) VALUES($1,$2,$3,$4,$5,$6)', [randomUUID(), observation.network, observation.address, observation.method, observation, observation.block_number]);
        } else {
          const prompt = step.prompt.replace(/\{\{(input|previous|step:([a-z0-9_-]+))\}\}/g, (match, variable, key) => variable === 'input' ? source : variable === 'previous' ? previous : outputs[key] ?? match);
          let model_id = step.model_id;
          if (step.kind === 'agent') model_id = (await database.query('SELECT model_id FROM agents WHERE id=$1', [step.agent_id])).rows[0]?.model_id;
          const response = await execution.execute({ model_id, ...(step.kind === 'agent' ? { agent_id: step.agent_id } : {}), input: prompt, name: `${workflow.name} · ${step.name}` }, { signal });
          result = response.inference.output; inference_id = response.inference.id;
        }
        previous = result; outputs[step.id] = result;
        completed.push({ id: step.id, name: step.name, kind: step.kind, status: 'Completed', output: result, inference_id, latency_ms: Math.round(performance.now() - started) });
        await database.query('UPDATE workflow_runs SET steps=$1,output=$2 WHERE id=$3', [JSON.stringify(completed), result, runId]);
      }
      const record = (await database.query("UPDATE workflow_runs SET status='Completed',completed_at=NOW() WHERE id=$1 RETURNING *", [runId])).rows[0];
      await database.query('UPDATE workflows SET last_run_at=NOW() WHERE id=$1', [id]);
      return record;
    } catch (error) {
      const message = error.status ? error.message : signal.aborted ? 'Workflow cancelled.' : 'A workflow step failed. Check the run details and its connections.';
      await database.query("UPDATE workflow_runs SET status='Failed',error=$1,steps=$2,completed_at=NOW() WHERE id=$3", [message, JSON.stringify(completed), runId]);
      throw problem(error.status || 502, message);
    } finally {
      await lock.query('SELECT pg_advisory_unlock(hashtext($1))', [`studio-workflow:${id}`]).catch(() => {});
      lock.release(); running.delete(id); controllers.delete(controller); completions.delete(completedRun); finish();
    }
  }
  let ticking = false;
  async function tick() {
    if (ticking || stopping) return;
    ticking = true;
    try {
      const due = (await database.query("SELECT id FROM workflows WHERE status='Active' AND trigger_type='schedule' AND next_run_at<=NOW() ORDER BY next_run_at LIMIT 5")).rows;
      for (const item of due) {
        if (running.size >= 4) break;
        if (running.has(item.id)) continue;
        const claimed = await database.query("UPDATE workflows SET next_run_at=NOW()+(interval_minutes||' minutes')::interval WHERE id=$1 AND next_run_at<=NOW() RETURNING id", [item.id]);
        if (claimed.rowCount) run(item.id, undefined, 'schedule').catch(error => console.error('Scheduled workflow:', error.status || 'error'));
      }
    } catch (error) { console.error('Workflow scheduler:', error.code || error.name); }
    finally { ticking = false; }
  }
  function start() { stopping = false; const timer = setInterval(tick, 15000).unref(); return async () => { stopping = true; clearInterval(timer); for (const controller of controllers) controller.abort(); await Promise.all([...completions]); }; }
  return { run, validateReferences, tick, start };
}

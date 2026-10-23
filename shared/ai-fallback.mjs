// Deterministic AI fallback over the app's own records. No provider call is made here.
export function hasProvider(env = process.env) { return Boolean((env.OPENROUTER_API_KEY || env.OPENAI_API_KEY || '').trim()); }
function countBy(rows, key) { const o = {}; for (const r of rows || []) { const k = r[key] ?? '(empty)'; o[k] = (o[k] || 0) + 1; } return o; }
export function readableLabel(k) { return String(k).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, (c) => c.toUpperCase()); }
export function scalar(v) { if (v === null || v === undefined) return '(not supplied)'; if (v === '') return '(empty)'; return String(v); }
export function readableSections(value) {
  if (Array.isArray(value)) return value.length ? value.map((v) => readableSections(v)).join('\n') : '(empty list)';
  if (value && typeof value === 'object') { const e = Object.entries(value); return e.length ? e.map(([k, v]) => (v && typeof v === 'object' ? `${readableLabel(k)}:\n${readableSections(v)}` : `${readableLabel(k)}: ${scalar(v)}`)).join('\n') : '(no fields)'; }
  return scalar(value);
}
export function fallbackModelHealth(models = []) {
  const byStatus = countBy(models, 'status'); const byCategory = countBy(models, 'category');
  return { aiGenerated: false, source: 'deterministic-fallback', providerConfigured: false, feature: 'model-health', summary: `${models.length} model record(s) reviewed.`, sections: { totalModels: models.length, byStatus, byCategory, publishedModels: byStatus.Published || 0 }, readable: readableSections({ totalModels: models.length, byStatus, byCategory }) };
}
export function fallbackInferenceHealth(inferences = []) {
  const byStatus = countBy(inferences, 'status');
  const completed = inferences.filter((r) => r.status === 'Completed');
  const avgLatency = completed.length ? Math.round(completed.reduce((s, r) => s + (Number(r.latency_ms) || 0), 0) / completed.length) : 0;
  return { aiGenerated: false, source: 'deterministic-fallback', providerConfigured: false, feature: 'inference-health', summary: `${inferences.length} inference(s); average completed latency ${avgLatency} ms.`, sections: { totalInferences: inferences.length, byStatus, completedCount: completed.length, failedCount: byStatus.Failed || 0, avgLatencyMs: avgLatency }, readable: readableSections({ totalInferences: inferences.length, byStatus, avgLatencyMs: avgLatency }) };
}
export function fallbackAgentReadiness(agents = []) {
  const byStatus = countBy(agents, 'status');
  return { aiGenerated: false, source: 'deterministic-fallback', providerConfigured: false, feature: 'agent-readiness', summary: `${agents.length} agent(s); ${byStatus.Active || 0} active.`, sections: { totalAgents: agents.length, byStatus, activeAgents: byStatus.Active || 0, withoutModel: agents.filter((a) => !a.model_id).length }, readable: readableSections({ totalAgents: agents.length, byStatus }) };
}
export async function callProvider({ feature, prompt, env = process.env, fetchImpl = fetch }) {
  const key = (env.OPENROUTER_API_KEY || env.OPENAI_API_KEY || '').trim();
  if (!key) return null;
  const isOR = Boolean((env.OPENROUTER_API_KEY || '').trim());
  const base = isOR ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1';
  const model = env.OPENROUTER_MODEL || env.OPENAI_MODEL || (isOR ? 'openrouter/free' : 'gpt-4o-mini');
  const res = await fetchImpl(`${base}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages: [{ role: 'system', content: 'Return JSON {summary, sections} grounded only in supplied records.' }, { role: 'user', content: prompt }], temperature: 0.2 }) });
  if (!res.ok) { const e = new Error(`AI provider failed with HTTP ${res.status}`); e.status = 502; throw e; }
  const data = await res.json(); const content = data?.choices?.[0]?.message?.content || '';
  if (!content || !data?.id) { const e = new Error('AI provider returned incomplete response'); e.status = 502; throw e; }
  let parsed; try { parsed = JSON.parse(content); } catch { parsed = { summary: content, sections: {} }; }
  return { aiGenerated: true, source: isOR ? 'openrouter' : 'openai', providerConfigured: true, feature, model: data.model || model, providerReceiptId: data.id, ...parsed, readable: readableSections(parsed.sections || parsed) };
}

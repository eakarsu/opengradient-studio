import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fallbackModelHealth, fallbackInferenceHealth, fallbackAgentReadiness, readableSections, hasProvider } from '../shared/ai-fallback.mjs';

test('deterministic AI fallback is labelled and grounded on own records', () => {
  const out = fallbackModelHealth([{ status: 'Published', category: 'Text generation' }, { status: 'Draft', category: 'Text generation' }]);
  assert.equal(out.aiGenerated, false); assert.equal(out.sections.totalModels, 2); assert.equal(out.sections.publishedModels, 1);
  const inf = fallbackInferenceHealth([{ status: 'Completed', latency_ms: 100 }, { status: 'Failed', latency_ms: 0 }]);
  assert.equal(inf.aiGenerated, false); assert.equal(inf.sections.avgLatencyMs, 100); assert.equal(inf.sections.failedCount, 1);
  assert.equal(fallbackAgentReadiness([{ status: 'Active', model_id: 'm1' }]).sections.activeAgents, 1);
  assert.equal(hasProvider({}), false);
});
test('readable sections preserve false, 0 and empty', () => {
  const text = readableSections({ count: 0, active: false, note: '' });
  assert.match(text, /Count: 0/); assert.match(text, /Active: false/); assert.match(text, /Note: \(empty\)/);
});
test('feature AI endpoints are mounted without changing the generate contract', async () => {
  const app = await readFile(new URL('../server/app.mjs', import.meta.url), 'utf8');
  assert.match(app, /\/api\/feature\/ai\/model-health/);
  assert.match(app, /\/api\/feature\/ai\/inference-health/);
  assert.match(app, /\/api\/feature\/ai\/agent-readiness/);
  const ai = await readFile(new URL('../server/ai.mjs', import.meta.url), 'utf8');
  assert.match(ai, /Connect your OpenRouter API key/);
});

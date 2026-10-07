import { createHash } from 'node:crypto';

export function receiptPayload(inference) {
  return { inferenceId: inference.id, input: inference.input, output: inference.output };
}

export function digestPayload(payload) {
  // Explicit ordering makes receipts reproducible across JSONB round-trips.
  return createHash('sha256').update(JSON.stringify({
    inferenceId: payload.inferenceId, input: payload.input, output: payload.output,
  })).digest('hex');
}

export function sandboxInference(input, model) {
  const words = input.trim().split(/\s+/).filter(Boolean);
  const positive = ['growth', 'secure', 'strong', 'positive', 'gain', 'stable', 'improve', 'good'];
  const negative = ['risk', 'loss', 'decline', 'volatile', 'negative', 'weak', 'fraud', 'bad'];
  const normalized = words.map(word => word.toLowerCase().replace(/[^a-z]/g, ''));
  const positives = normalized.filter(word => positive.includes(word)).length;
  const negatives = normalized.filter(word => negative.includes(word)).length;
  const balance = positives - negatives;
  return JSON.stringify({
    execution: 'deterministic local sandbox',
    model: model.name,
    category: model.category,
    analysis: {
      word_count: words.length,
      character_count: input.length,
      unique_words: new Set(normalized.filter(Boolean)).size,
      sentiment: balance > 0 ? 'positive' : balance < 0 ? 'cautious' : 'neutral',
      positive_signals: positives,
      risk_signals: negatives,
      numeric_values: (input.match(/\b\d+(?:\.\d+)?\b/g) || []).map(Number).slice(0, 20),
    },
    note: 'Local text analysis for exercising the workflow. No model weights, external AI, TEE, zkML, or blockchain transaction are executed.',
  }, null, 2);
}

import { createHash } from 'node:crypto';
import { defaultsFor } from '../shared/entities.mjs';
import { digestPayload, receiptPayload, sandboxInference } from './receipts.mjs';

const id = (group, n) => `${group.toString(16).padStart(8, '0')}-0000-4000-8000-${String(n + 1).padStart(12, '0')}`;
const hash = text => createHash('sha256').update(text).digest('hex');
const address = text => `0x${hash(text).slice(0, 40)}`;
const ago = (days, hours = 0) => new Date(Date.now() - days * 86400000 - hours * 3600000).toISOString();

export async function insertRow(client, entity, values) {
  const keys = Object.keys(values);
  const { rows } = await client.query(`INSERT INTO "${entity}" (${keys.map(key => `"${key}"`).join(',')}) VALUES (${keys.map((_, index) => `$${index + 1}`).join(',')}) RETURNING *`, keys.map(key => values[key]));
  return rows[0];
}

export async function seed(client) {
  const exists = await client.query('SELECT 1 FROM schema_migrations WHERE version = 1001');
  if (exists.rowCount) return false;
  const modelSpecs = [
    ['Llama 3.3 70B', 'meta', 'Text generation', '70B', 'PyTorch', 'TEE', 'Open reasoning for complex agent workflows.'],
    ['ETH Risk Forecaster', 'opengradient', 'DeFi intelligence', '42M', 'ONNX', 'zkML', 'Volatility and liquidity signals for intelligent DeFi applications.'],
    ['Qwen 2.5 32B', 'qwen', 'Text generation', '32B', 'GGUF', 'TEE', 'Multilingual reasoning and structured text generation.'],
    ['BGE Large EN', 'baai', 'Embeddings', '335M', 'ONNX', 'TEE', 'Dense semantic embeddings for retrieval and memory.'],
    ['Sybil Sentinel', 'chainlab', 'Classification', '18M', 'ONNX', 'zkML', 'Classify wallet behavior for Sybil resistance research.'],
    ['AMM Fee Optimizer', 'opengradient', 'DeFi intelligence', '6M', 'ONNX', 'zkML', 'Adaptive fee forecasts for automated market makers.'],
    ['Mistral Small', 'mistral', 'Text generation', '24B', 'PyTorch', 'TEE', 'Efficient reasoning for conversational applications.'],
    ['Chronos Forecast', 'amazon', 'Forecasting', '710M', 'PyTorch', 'Hybrid', 'Time-series forecasting across market datasets.'],
    ['CLIP Vision Encoder', 'open-research', 'Computer vision', '428M', 'PyTorch', 'TEE', 'Connect visual information with semantic descriptions.'],
    ['DePIN Reputation', 'chainlab', 'Classification', '12M', 'ONNX', 'zkML', 'Evaluate device and operator reputation signals.'],
    ['E5 Multilingual', 'intfloat', 'Embeddings', '560M', 'ONNX', 'TEE', 'Multilingual embeddings for global knowledge bases.'],
    ['Portfolio Guard', 'quant-labs', 'DeFi intelligence', '85M', 'TensorFlow', 'Hybrid', 'Scenario analysis for diverse asset portfolios.'],
    ['Phi 4 Mini', 'microsoft', 'Text generation', '3.8B', 'GGUF', 'TEE', 'Compact language reasoning for lightweight agents.'],
    ['Whale Activity Classifier', 'chainlab', 'Classification', '32M', 'ONNX', 'zkML', 'Categorize large-wallet activity in evaluation datasets.'],
    ['Liquidity Lens', 'quant-labs', 'Forecasting', '94M', 'TensorFlow', 'Hybrid', 'Estimate short-term liquidity patterns.'],
    ['Document Vision', 'open-research', 'Computer vision', '1.2B', 'PyTorch', 'TEE', 'Extract document representations for knowledge workflows.'],
    ['Governance Embed', 'dao-labs', 'Embeddings', '110M', 'ONNX', 'TEE', 'Semantic search over governance proposals and discussions.'],
    ['Transaction Anomaly', 'opengradient', 'Classification', '28M', 'ONNX', 'zkML', 'Identify unusual transaction patterns in historical data.'],
  ];
  const models = [];
  for (let i = 0; i < modelSpecs.length; i++) {
    const [name, owner, category, parameters, runtime, verification, description] = modelSpecs[i];
    models.push(await insertRow(client, 'models', {
      ...defaultsFor('models'), id: id(1, i), name, owner, category, parameters, runtime, verification,
      version: i % 3 ? '1.0.0' : '2.1.0', status: i === 15 ? 'Draft' : i === 17 ? 'Archived' : 'Published',
      tags: `${category.toLowerCase()}, open-source, sandbox`, description, created_at: ago(22 - i), updated_at: ago(i % 5),
    }));
  }
  const nodeCities = ['Virginia', 'Frankfurt', 'Singapore', 'Oregon', 'Amsterdam', 'Tokyo', 'Montreal', 'London', 'Seoul', 'São Paulo', 'Paris', 'Sydney', 'Dallas', 'Stockholm', 'Mumbai', 'Santiago', 'Zurich', 'Osaka'];
  const regions = ['North America', 'Europe', 'Asia Pacific'];
  const operators = ['Atlas Compute', 'Northstar Labs', 'Gradient Collective', 'Meridian Cloud', 'Protocol Works', 'Open Compute'];
  const nodes = [];
  for (let i = 0; i < 18; i++) {
    nodes.push(await insertRow(client, 'nodes', {
      ...defaultsFor('nodes'), id: id(2, i), name: `${nodeCities[i]}-${String(i + 1).padStart(2, '0')}`,
      operator: operators[i % operators.length], region: i === 9 || i === 15 ? 'South America' : regions[i % 3],
      hardware: ['NVIDIA H100', 'NVIDIA A100', 'NVIDIA L40S', 'AMD MI300X', 'Intel Xeon'][i % 5],
      verification: ['TEE', 'zkML', 'Hybrid'][i % 3], status: i === 13 ? 'Offline' : i === 11 ? 'Degraded' : 'Online',
      utilization: 34 + (i * 7) % 57, uptime: +(99.12 + (i % 9) * 0.1).toFixed(2), stake: 12500 + i * 1250,
      description: `Sample compute inventory for ${operators[i % operators.length]} in ${nodeCities[i]}. Metrics are seeded examples, not live network telemetry.`,
      created_at: ago(26 - i), updated_at: ago(0, i % 4),
    }));
  }
  const agentNames = ['Atlas Research', 'Risk Sentinel', 'Liquidity Scout', 'Governance Analyst', 'Market Pulse', 'Portfolio Copilot', 'Sybil Watch', 'Knowledge Curator', 'Yield Observer', 'Protocol Monitor', 'Treasury Analyst', 'Data Steward', 'Community Signal', 'Anomaly Tracker', 'Memory Keeper', 'Network Observer'];
  const purposes = ['Research', 'Risk analysis', 'Portfolio insights', 'Governance', 'Monitoring', 'Data processing'];
  const agents = [];
  for (let i = 0; i < 16; i++) {
    agents.push(await insertRow(client, 'agents', {
      ...defaultsFor('agents'), id: id(3, i), name: agentNames[i], model_id: models[i % 15].id,
      purpose: purposes[i % 6], status: i === 12 ? 'Paused' : i === 15 ? 'Draft' : 'Active',
      execution_mode: ['On demand', 'Scheduled', 'Event driven'][i % 3], owner: operators[i % 6], budget: 25 + i * 5,
      instructions: `Analyze provided information for ${purposes[i % 6].toLowerCase()}. Identify positive signals and risk factors; include the source data.`,
      description: `A sample ${purposes[i % 6].toLowerCase()} agent. Trigger policies are metadata; local execution is manual.`,
      created_at: ago(20 - i), updated_at: ago(i % 4),
    }));
  }
  const inputs = [
    'Analyze strong growth with stable liquidity of 1200000 and volatility of 0.042.',
    'Review risk signals: volatile markets, weak volume, and a decline of 12 percent.',
    'Classify a proposal to improve governance with a budget of 45000 tokens.',
    'Summarize 240 transactions and identify stable patterns in the last 7 days.',
    'Assess positive adoption growth alongside protocol risk and liquidity of 850000.',
    'Evaluate secure infrastructure with good uptime of 99.98 percent across 18 nodes.',
  ];
  for (let i = 0; i < 48; i++) {
    const model = models[i % 15];
    const created_at = ago(Math.floor(i / 4), (i * 3) % 21);
    const row = await insertRow(client, 'inferences', {
      ...defaultsFor('inferences'), id: id(4, i), name: `${['Market analysis', 'Risk evaluation', 'Governance review', 'Signal extraction'][i % 4]} #${1048 - i}`,
      model_id: model.id, node_id: nodes[i % 18].id, agent_id: i % 3 === 0 ? agents[i % 14].id : null,
      status: i === 5 || i === 19 ? 'Failed' : i === 8 || i === 26 ? 'Queued' : 'Completed',
      verification: 'Local hash', latency_ms: 120 + (i * 43) % 880, tokens: 124 + (i * 37) % 1100,
      cost: +((0.003 + (i % 12) * 0.0012).toFixed(4)), input: inputs[i % 6],
      output: sandboxInference(inputs[i % 6], model), description: 'Seeded sandbox execution. No external model or blockchain was invoked.',
      created_at, updated_at: created_at,
    });
    const payload = receiptPayload(row);
    await insertRow(client, 'proofs', {
      ...defaultsFor('proofs'), id: id(5, i), name: `Receipt for ${row.name}`, inference_id: row.id,
      scheme: 'SHA-256', status: row.status === 'Completed' ? 'Valid' : 'Pending',
      digest: digestPayload(payload), payload, verifier: 'Local integrity verifier',
      description: 'SHA-256 integrity receipt for stored input and output. This is not a TEE attestation or zero-knowledge proof.',
      created_at, updated_at: created_at,
    });
    await insertRow(client, 'transactions', {
      ...defaultsFor('transactions'), id: id(6, i), name: `Settlement #${2048 - i}`,
      kind: ['Inference settlement', 'Model registration', 'Node reward', 'Contract registration'][i % 4],
      inference_id: row.id, tx_hash: `0x${hash(`sample-transaction-${i}`)}`,
      from_address: address(`sample-sender-${i % 6}`), to_address: address(`sample-recipient-${i % 9}`),
      amount: row.cost, status: row.status === 'Completed' ? 'Simulated' : row.status === 'Failed' ? 'Failed' : 'Pending',
      network: 'Local sandbox', description: 'Sample ledger entry. No funds were moved.', created_at, updated_at: created_at,
    });
  }
  const contractNames = ['Inference Router', 'Model Registry', 'Risk Oracle', 'Agent Vault', 'Receipt Registry', 'Liquidity Advisor', 'Operator Registry', 'Fee Optimizer', 'Governance Oracle', 'Portfolio Guard', 'Reputation Registry', 'Data Access Controller', 'Treasury Monitor', 'Model Gateway', 'Compute Scheduler', 'Settlement Ledger'];
  const datasetNames = ['ETH Market History', 'Protocol Risk Benchmarks', 'Governance Proposals', 'Agent Research Memory', 'Wallet Behavior Samples', 'AMM Pool Snapshots', 'Network Telemetry', 'DeFi Knowledge Embeddings', 'Liquidity Time Series', 'Smart Contract Corpus', 'Operator Reputation', 'Portfolio Scenarios', 'Market Sentiment Notes', 'Agent Conversation Memory', 'Evaluation Prompts', 'Transaction Patterns'];
  for (let i = 0; i < 16; i++) {
    await insertRow(client, 'contracts', {
      ...defaultsFor('contracts'), id: id(7, i), name: contractNames[i], address: address(`sample-contract-${i}`),
      model_id: models[i % 15].id, network: 'Local sandbox', status: i === 12 ? 'Paused' : i === 15 ? 'Draft' : 'Registered',
      language: i % 5 === 0 ? 'Vyper' : 'Solidity', gas_limit: 2500000 + i * 100000,
      description: `Sample ${contractNames[i].toLowerCase()} registration. Registration stores metadata only; it does not deploy bytecode.`,
      created_at: ago(18 - i), updated_at: ago(i % 3),
    });
    await insertRow(client, 'datasets', {
      ...defaultsFor('datasets'), id: id(8, i), name: datasetNames[i], owner: operators[i % 6],
      kind: ['Market data', 'Validation', 'Training', 'Agent memory', 'Embeddings'][i % 5],
      rows_count: 1200 + i * 7350, size_mb: +(4.2 + i * 17.35).toFixed(1),
      visibility: i % 3 ? 'Public' : 'Private', status: i === 13 ? 'Processing' : i === 15 ? 'Draft' : 'Ready',
      storage_uri: `sandbox://datasets/${datasetNames[i].toLowerCase().replaceAll(' ', '-')}`,
      description: 'Sample dataset catalog entry. Storage references are metadata; dataset files are not hosted by this application.',
      created_at: ago(18 - i), updated_at: ago(i % 3),
    });
    await client.query('INSERT INTO activity(entity, record_id, record_name, action, detail, created_at) VALUES($1,$2,$3,$4,$5,$6)', [
      'models', models[i].id, models[i].name, 'registered', 'Sample model added to the workspace.', ago(0, i),
    ]);
  }
  await client.query('INSERT INTO schema_migrations(version) VALUES(1001)');
  return true;
}

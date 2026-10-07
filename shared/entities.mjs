const text = (key, label, options = {}) => ({ key, label, type: 'text', ...options });
const select = (key, label, options, extra = {}) => ({ key, label, type: 'select', options, ...extra });
const number = (key, label, options = {}) => ({ key, label, type: 'number', min: 0, ...options });
const ref = (key, label, entity, options = {}) => ({ key, label, type: 'reference', entity, ...options });
const description = text('description', 'Description', { type: 'textarea', maxLength: 5000 });

export const entities = {
  models: {
    title: 'Model catalog', singular: 'Model', icon: 'Box', prefix: 'MDL',
    subtitle: 'Manage model records saved in this local workspace.',
    nameKey: 'name', statuses: ['Published', 'Draft', 'Archived'],
    columns: ['name', 'category', 'runtime', 'verification', 'status', 'version'],
    fields: [
      text('name', 'Model name', { required: true }), text('owner', 'Publisher', { required: true }),
      select('category', 'Category', ['Text generation', 'DeFi intelligence', 'Embeddings', 'Classification', 'Forecasting', 'Computer vision']),
      text('version', 'Version', { default: '1.0.0', required: true }),
      select('runtime', 'File format (metadata)', ['ONNX', 'PyTorch', 'GGUF', 'TensorFlow', 'Hosted API']),
      select('verification', 'Verification goal', ['TEE', 'zkML', 'Hybrid', 'Local CPU', 'None']),
      select('status', 'Catalog status', ['Published', 'Draft', 'Archived']),
      text('parameters', 'Parameters', { default: '' }),
      text('license', 'License', { default: '' }),
      text('tags', 'Tags', { placeholder: 'finance, open-source, reasoning' }), description,
    ],
  },
  inferences: {
    title: 'Inference jobs', singular: 'Inference job', icon: 'Zap', prefix: 'INF',
    subtitle: 'Run hosted or uploaded models and follow their saved results and integrity receipts.',
    nameKey: 'name', statuses: ['Completed', 'Queued', 'Failed'],
    columns: ['name', 'model_id', 'status', 'latency_ms', 'tokens', 'created_at'],
    fields: [
      text('name', 'Job name', { required: true }), ref('model_id', 'Model', 'models'),
      ref('node_id', 'Compute node', 'nodes'), ref('agent_id', 'Agent', 'agents'),
      select('status', 'Status', ['Queued', 'Completed', 'Failed']),
      select('verification', 'Receipt type', ['Local hash']),
      number('latency_ms', 'Latency (ms)', { integer: true }), number('tokens', 'Tokens', { integer: true }),
      number('cost', 'Estimated credits', { step: 0.0001 }),
      text('input', 'Input', { type: 'textarea', required: true, maxLength: 20000 }),
      text('output', 'Output', { type: 'textarea', maxLength: 30000 }), description,
    ],
  },
  agents: {
    title: 'AI agents', singular: 'Agent', icon: 'Bot', prefix: 'AGT',
    subtitle: 'Save instructions, choose a model, and keep conversation memory between runs.',
    nameKey: 'name', statuses: ['Active', 'Paused', 'Draft'],
    columns: ['name', 'model_id', 'purpose', 'status', 'execution_mode', 'budget'],
    fields: [
      text('name', 'Agent name', { required: true }), ref('model_id', 'Model', 'models', { required: true }),
      select('purpose', 'Purpose', ['Risk analysis', 'Research', 'Monitoring', 'Portfolio insights', 'Data processing', 'Governance']),
      select('status', 'Status', ['Active', 'Paused', 'Draft']),
      select('execution_mode', 'Trigger policy (metadata)', ['On demand', 'Scheduled', 'Event driven']),
      text('owner', 'Owner', { required: true }), number('budget', 'Budget (demo credits)', { step: 0.01 }),
      text('instructions', 'Agent instructions', { type: 'textarea', maxLength: 10000 }), description,
    ],
  },
  nodes: {
    title: 'Compute network', singular: 'Compute node', icon: 'Network', prefix: 'NOD',
    subtitle: 'An inventory of the operators and hardware powering your compute layer.',
    nameKey: 'name', statuses: ['Online', 'Degraded', 'Offline'],
    columns: ['name', 'region', 'hardware', 'status', 'utilization', 'uptime'],
    fields: [
      text('name', 'Node name', { required: true }), text('operator', 'Operator', { required: true }),
      select('region', 'Region', ['North America', 'Europe', 'Asia Pacific', 'South America']),
      select('hardware', 'Hardware', ['NVIDIA H100', 'NVIDIA A100', 'NVIDIA L40S', 'AMD MI300X', 'Intel Xeon']),
      select('verification', 'Target capability', ['TEE', 'zkML', 'Hybrid']),
      select('status', 'Status', ['Online', 'Degraded', 'Offline']),
      number('utilization', 'Utilization (%)', { max: 100, step: 0.1 }),
      number('uptime', 'Uptime (%)', { max: 100, step: 0.01, default: 99.9 }),
      number('stake', 'Stake (demo credits)', { step: 0.01 }), description,
    ],
  },
  proofs: {
    title: 'Verification center', singular: 'Receipt', icon: 'ShieldCheck', prefix: 'PRF',
    subtitle: 'Check stored input and output against their SHA-256 integrity receipts.',
    nameKey: 'name', statuses: ['Valid', 'Pending', 'Invalid'],
    columns: ['name', 'inference_id', 'scheme', 'status', 'digest', 'created_at'],
    fields: [
      text('name', 'Receipt name', { required: true }), ref('inference_id', 'Inference job', 'inferences', { required: true, immutable: true }),
      select('scheme', 'Scheme', ['SHA-256'], { readOnly: true, default: 'SHA-256' }),
      select('status', 'Status', ['Pending', 'Valid', 'Invalid'], { readOnly: true, default: 'Pending' }),
      text('digest', 'SHA-256 digest', { readOnly: true }),
      text('verifier', 'Verifier', { readOnly: true, default: 'Local integrity verifier' }), description,
    ],
  },
  contracts: {
    title: 'Smart contracts', singular: 'Contract', icon: 'FileCode2', prefix: 'CTR',
    subtitle: 'Keep model integrations and EVM contract registrations in one place.',
    nameKey: 'name', statuses: ['Registered', 'Draft', 'Paused'],
    columns: ['name', 'address', 'model_id', 'network', 'status', 'language'],
    fields: [
      text('name', 'Contract name', { required: true }),
      text('address', 'EVM address', { required: true, pattern: '^0x[a-fA-F0-9]{40}$', placeholder: '0x followed by 40 hexadecimal characters' }),
      ref('model_id', 'Linked model', 'models'), select('network', 'Network', ['Local sandbox', 'Testnet record', 'OpenGradient testnet', 'OpenGradient alpha', 'Base', 'Ethereum']),
      select('status', 'Status', ['Registered', 'Draft', 'Paused']),
      select('language', 'Language', ['Solidity', 'Vyper']),
      number('gas_limit', 'Gas limit', { integer: true, default: 3000000 }), description,
    ],
  },
  transactions: {
    title: 'Transactions', singular: 'Transaction', icon: 'ArrowLeftRight', prefix: 'TXN',
    subtitle: 'Explore your sandbox ledger. These records do not move real funds.',
    nameKey: 'name', statuses: ['Simulated', 'Pending', 'Failed'],
    columns: ['name', 'kind', 'amount', 'status', 'tx_hash', 'created_at'],
    fields: [
      text('name', 'Transaction name', { required: true }),
      select('kind', 'Type', ['Inference settlement', 'Model registration', 'Node reward', 'Contract registration']),
      ref('inference_id', 'Inference job', 'inferences'),
      text('tx_hash', 'Local transaction hash', { readOnly: true }),
      text('from_address', 'From address', { required: true, pattern: '^0x[a-fA-F0-9]{40}$' }),
      text('to_address', 'To address', { required: true, pattern: '^0x[a-fA-F0-9]{40}$' }),
      number('amount', 'Amount (demo credits)', { step: 0.0001 }),
      select('status', 'Status', ['Simulated', 'Pending', 'Failed']),
      select('network', 'Network', ['Local sandbox']), description,
    ],
  },
  datasets: {
    title: 'Datasets & memory', singular: 'Dataset', icon: 'Database', prefix: 'DAT',
    subtitle: 'Organize datasets, evaluation collections, and agent memory references.',
    nameKey: 'name', statuses: ['Ready', 'Processing', 'Draft'],
    columns: ['name', 'kind', 'rows_count', 'visibility', 'status', 'size_mb'],
    fields: [
      text('name', 'Dataset name', { required: true }), text('owner', 'Owner', { required: true }),
      select('kind', 'Type', ['Training', 'Validation', 'Agent memory', 'Market data', 'Embeddings']),
      number('rows_count', 'Records', { integer: true }), number('size_mb', 'Size (MB)', { step: 0.1 }),
      select('visibility', 'Visibility', ['Private', 'Public']),
      select('status', 'Status', ['Ready', 'Processing', 'Draft']),
      text('storage_uri', 'Storage reference', { placeholder: 'ipfs://… or a local reference' }), description,
    ],
  },
};

export const entityOrder = ['models', 'inferences', 'agents', 'nodes', 'proofs', 'contracts', 'transactions', 'datasets'];
export const schemaVersion = 1;

export function defaultsFor(entity) {
  return Object.fromEntries(entities[entity].fields.map(field => [field.key,
    field.default ?? (field.type === 'select' ? field.options[0] : field.type === 'number' ? 0 : '')]));
}

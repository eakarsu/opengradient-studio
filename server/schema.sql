CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS models (
  id UUID PRIMARY KEY, name TEXT NOT NULL, owner TEXT NOT NULL,
  category TEXT NOT NULL, version TEXT NOT NULL, runtime TEXT NOT NULL,
  verification TEXT NOT NULL, status TEXT NOT NULL, parameters TEXT NOT NULL DEFAULT '',
  license TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS nodes (
  id UUID PRIMARY KEY, name TEXT NOT NULL, operator TEXT NOT NULL,
  region TEXT NOT NULL, hardware TEXT NOT NULL, verification TEXT NOT NULL, status TEXT NOT NULL,
  utilization NUMERIC NOT NULL DEFAULT 0 CHECK (utilization BETWEEN 0 AND 100),
  uptime NUMERIC NOT NULL DEFAULT 0 CHECK (uptime BETWEEN 0 AND 100),
  stake NUMERIC NOT NULL DEFAULT 0 CHECK (stake >= 0), description TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY, name TEXT NOT NULL,
  model_id UUID REFERENCES models(id) ON DELETE SET NULL,
  purpose TEXT NOT NULL, status TEXT NOT NULL, execution_mode TEXT NOT NULL,
  owner TEXT NOT NULL, budget NUMERIC NOT NULL DEFAULT 0 CHECK (budget >= 0),
  instructions TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS inferences (
  id UUID PRIMARY KEY, name TEXT NOT NULL,
  model_id UUID REFERENCES models(id) ON DELETE SET NULL,
  node_id UUID REFERENCES nodes(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  status TEXT NOT NULL, verification TEXT NOT NULL DEFAULT 'Local hash',
  latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (latency_ms >= 0), tokens INTEGER NOT NULL DEFAULT 0 CHECK (tokens >= 0),
  cost NUMERIC NOT NULL DEFAULT 0 CHECK (cost >= 0), input TEXT NOT NULL, output TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS proofs (
  id UUID PRIMARY KEY, name TEXT NOT NULL,
  inference_id UUID REFERENCES inferences(id) ON DELETE SET NULL,
  scheme TEXT NOT NULL DEFAULT 'SHA-256', status TEXT NOT NULL DEFAULT 'Pending', digest TEXT NOT NULL,
  verifier TEXT NOT NULL DEFAULT 'Local integrity verifier',
  payload JSONB NOT NULL, description TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL UNIQUE,
  model_id UUID REFERENCES models(id) ON DELETE SET NULL,
  network TEXT NOT NULL, status TEXT NOT NULL, language TEXT NOT NULL,
  gas_limit INTEGER NOT NULL DEFAULT 0 CHECK (gas_limit >= 0), description TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL,
  inference_id UUID REFERENCES inferences(id) ON DELETE SET NULL,
  tx_hash TEXT NOT NULL UNIQUE, from_address TEXT NOT NULL, to_address TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0 CHECK (amount >= 0), status TEXT NOT NULL,
  network TEXT NOT NULL DEFAULT 'Local sandbox', description TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS datasets (
  id UUID PRIMARY KEY, name TEXT NOT NULL, owner TEXT NOT NULL, kind TEXT NOT NULL,
  rows_count INTEGER NOT NULL DEFAULT 0 CHECK (rows_count >= 0), size_mb NUMERIC NOT NULL DEFAULT 0 CHECK (size_mb >= 0),
  visibility TEXT NOT NULL, status TEXT NOT NULL, storage_uri TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS activity (
  id BIGSERIAL PRIMARY KEY, entity TEXT NOT NULL, record_id UUID NOT NULL,
  record_name TEXT NOT NULL, action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_record ON activity(entity, record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inferences_created ON inferences(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inferences_model ON inferences(model_id);
CREATE INDEX IF NOT EXISTS idx_inferences_node ON inferences(node_id);
CREATE INDEX IF NOT EXISTS idx_inferences_agent ON inferences(agent_id);
CREATE INDEX IF NOT EXISTS idx_proofs_inference ON proofs(inference_id);
CREATE INDEX IF NOT EXISTS idx_transactions_inference ON transactions(inference_id);
CREATE INDEX IF NOT EXISTS idx_agents_model ON agents(model_id);
CREATE INDEX IF NOT EXISTS idx_contracts_model ON contracts(model_id);

CREATE TABLE IF NOT EXISTS ai_runs (
  id UUID PRIMARY KEY,
  entity TEXT NOT NULL, feature_id TEXT NOT NULL, title TEXT NOT NULL,
  model TEXT NOT NULL, requested_model TEXT NOT NULL,
  request JSONB NOT NULL, response TEXT NOT NULL,
  source_record_id UUID, provider_id TEXT NOT NULL DEFAULT '',
  latency_ms INTEGER NOT NULL DEFAULT 0,
  prompt_tokens INTEGER NOT NULL DEFAULT 0, completion_tokens INTEGER NOT NULL DEFAULT 0, total_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC CHECK (cost_usd >= 0), truncated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_runs_feature_created ON ai_runs(feature_id,created_at DESC);

CREATE TABLE IF NOT EXISTS model_versions (
  id UUID PRIMARY KEY, model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  version TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(model_id,version)
);
CREATE TABLE IF NOT EXISTS model_files (
  id UUID PRIMARY KEY, model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES model_versions(id) ON DELETE CASCADE,
  filename TEXT NOT NULL, storage_key TEXT NOT NULL UNIQUE, size_bytes BIGINT NOT NULL,
  sha256 TEXT NOT NULL, metadata JSONB, hub_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS model_bindings (
  model_id UUID PRIMARY KEY REFERENCES models(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider IN ('openrouter','opengradient','onnx','opengradient-ml')),
  provider_model TEXT NOT NULL DEFAULT '', artifact_id UUID REFERENCES model_files(id) ON DELETE SET NULL,
  hub_repository TEXT NOT NULL DEFAULT '', hub_version TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE inferences ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'legacy-sandbox';
ALTER TABLE inferences ADD COLUMN IF NOT EXISTS provider_metadata JSONB NOT NULL DEFAULT '{}';
ALTER TABLE inferences ADD COLUMN IF NOT EXISTS error TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS agent_settings (
  agent_id UUID PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  memory_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  temperature NUMERIC NOT NULL DEFAULT 0.3, max_tokens INTEGER NOT NULL DEFAULT 2048,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS agent_memory (
  id UUID PRIMARY KEY, agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  inference_id UUID REFERENCES inferences(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL,
  sequence BIGINT GENERATED ALWAYS AS IDENTITY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS sequence BIGINT GENERATED ALWAYS AS IDENTITY;
CREATE INDEX IF NOT EXISTS idx_agent_memory_created ON agent_memory(agent_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_memory_sequence ON agent_memory(agent_id,sequence DESC);
CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','Active','Paused')),
  trigger_type TEXT NOT NULL DEFAULT 'manual' CHECK(trigger_type IN ('manual','schedule','webhook')),
  interval_minutes INTEGER NOT NULL DEFAULT 60 CHECK(interval_minutes BETWEEN 1 AND 10080),
  default_input TEXT NOT NULL DEFAULT '', steps JSONB NOT NULL,
  webhook_hash TEXT, next_run_at TIMESTAMPTZ, last_run_at TIMESTAMPTZ,
  revision INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS workflow_runs (
  id UUID PRIMARY KEY, workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
  name TEXT NOT NULL, trigger_type TEXT NOT NULL, status TEXT NOT NULL,
  input TEXT NOT NULL, output TEXT NOT NULL DEFAULT '', steps JSONB NOT NULL DEFAULT '[]',
  error TEXT NOT NULL DEFAULT '', started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_workflow_runs ON workflow_runs(workflow_id,started_at DESC);
CREATE TABLE IF NOT EXISTS chain_observations (
  id UUID PRIMARY KEY, contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  network TEXT NOT NULL, address TEXT NOT NULL, method TEXT NOT NULL,
  result JSONB NOT NULL, block_number BIGINT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

const scenarios = (...items) => items.map(([label, objective, source, constraints]) => ({ label, objective, source, constraints }));
const definitions = [
  ['model-advisor', 'models', 'Model advisor', 'Choose the right intelligence for your workload.', 'Box', 'Application requirements', 'Selection criteria', scenarios(
    ['Support assistant', 'Recommend a model strategy for a customer support assistant.', 'A small SaaS team handles 800 tickets per week. Answers must use our help center, support English and Spanish, and escalate billing disputes to a person.', 'Prioritize low operating cost, reliable citations to supplied content, and latency below three seconds.'],
    ['DeFi research', 'Compare model approaches for a financial research assistant.', 'Researchers summarize protocol documents, compare mechanisms, and extract risk assumptions. Inputs can be 20 pages long. This is research support, not automated trading.', 'Compare reasoning, context length, accuracy evaluation, and cost. Do not invent current prices or benchmark results.'],
    ['Document search', 'Design the model stack for an internal knowledge search product.', 'A team has 50,000 engineering documents. Questions need retrieval, ranked passages, grounded answers, and access-aware citations.', 'Separate embeddings, retrieval, reranking, and generation. Include an evaluation plan.']
  )],
  ['prompt-designer', 'models', 'Prompt designer', 'Turn a rough task into a clear, reusable prompt.', 'Pencil', 'Task and sample input', 'Prompt requirements', scenarios(
    ['Product brief', 'Create a reusable prompt for writing product briefs.', 'Input: interview notes from ten users who struggle to reconcile invoices. Output should explain the problem, target user, proposed solution, and success measures.', 'Include placeholders, grounding rules, a sample response outline, and a review checklist.'],
    ['Document extractor', 'Design a prompt for extracting facts from supplier documents.', 'Documents include invoice identifiers, delivery dates, payment terms, and inconsistent company names. Some fields are missing or contradictory.', 'Use readable tables, identify missing fields explicitly, and never infer an absent invoice number.'],
    ['Technical reviewer', 'Create a prompt that reviews architecture proposals.', 'The reviewer receives a proposal, workload assumptions, system constraints, and an incident history. The audience is senior engineers.', 'Separate evidence from assumptions. Ask for alternatives, failure modes, and measurable acceptance criteria.']
  )],
  ['evaluation-planner', 'models', 'Evaluation planner', 'Build a practical quality and reliability evaluation.', 'BadgeCheck', 'Model task and examples', 'Evaluation requirements', scenarios(
    ['Answer quality', 'Plan an evaluation for a help-center question answering model.', 'Test questions cover account setup, subscription changes, and troubleshooting. Source documentation is supplied with each question. The model must acknowledge unsupported questions.', 'Include groundedness, completeness, escalation, latency, and a scoring rubric.'],
    ['Classification test', 'Plan an evaluation for support ticket classification.', 'Categories: account, billing, technical issue, and feature request. Some tickets span categories. There are 400 manually labeled examples.', 'Include leakage prevention, per-class metrics, ambiguous cases, and an error review workflow.'],
    ['Release readiness', 'Design an evaluation gate for releasing an agent model.', 'The agent drafts incident summaries from supplied logs. It must not execute commands or claim to have repaired a system.', 'Include adversarial inputs, regression tests, human review, and rollout thresholds.']
  )],
  ['text-intelligence', 'inferences', 'Text intelligence', 'Extract meaning, decisions, and next steps from text.', 'Sparkles', 'Text to analyze', 'Analysis focus', scenarios(
    ['Meeting insights', 'Summarize the meeting and produce an actionable follow-up brief.', 'Launch meeting: Maya owns onboarding copy by Friday. Dev will investigate slow document search. Two customers requested audit exports. The release date is tentative until latency improves.', 'List decisions, action owners, deadlines, unresolved questions, and dependencies.'],
    ['Customer feedback', 'Identify themes and prioritize improvements from customer feedback.', 'Feedback: search results feel slow; onboarding is easy; invoice exports lack project tags; support answers are helpful; mobile tables are difficult to read; search relevance is inconsistent.', 'Distinguish frequency from severity. Propose measurable experiments without claiming statistical significance.'],
    ['Risk narrative', 'Analyze the supplied risk narrative and identify assumptions.', 'A protocol report describes positive growth and stable liquidity of 1,200,000 units, alongside a volatility risk indicator of 0.042. The units and calculation method are unspecified.', 'Explain what can and cannot be concluded. Identify missing definitions and follow-up questions.']
  )],
  ['research-brief', 'inferences', 'Research brief', 'Synthesize supplied research into a useful briefing.', 'BookOpen', 'Research notes and sources', 'Scope and evidence rules', scenarios(
    ['Architecture research', 'Write a research brief on retrieval-based assistants.', 'Notes: retrieval limits answers to selected passages; chunking affects relevance; reranking improves passage ordering; evaluation should include citation accuracy and unanswered questions.', 'Use only supplied evidence. Cover tradeoffs, evaluation, and an implementation sequence.'],
    ['Market landscape', 'Synthesize the supplied notes into a market landscape brief.', 'Company A focuses on analytics for small teams. Company B offers enterprise integrations. Company C emphasizes privacy and on-premise deployment. These are fictional examples.', 'Organize a comparison table, differentiators, uncertainties, and questions for validation.'],
    ['Verification concepts', 'Explain the supplied verification approaches for a research team.', 'Hash receipts detect changes in committed content. TEE attestations concern trusted execution environments. Zero-knowledge proofs can establish a specified computation statement under stated assumptions.', 'Do not equate a content hash with proof of AI execution. State trust assumptions clearly.']
  )],
  ['data-interpreter', 'inferences', 'Data interpreter', 'Make a clear story out of supplied numbers.', 'List', 'Data or table', 'Questions and limitations', scenarios(
    ['Usage trends', 'Interpret usage trends and propose follow-up experiments.', 'Week,Active users,Requests,Median latency ms\n1,120,2400,480\n2,148,3210,510\n3,171,4200,690\n4,180,5100,840', 'Calculate changes where possible. Avoid implying causation from these four observations.'],
    ['Experiment review', 'Review the experiment results and explain decision options.', 'Variant,Visitors,Conversions\nControl,2000,160\nNew onboarding,1900,171\nThe experiment ran for seven days. User assignment and eligibility details are unavailable.', 'Explain descriptive rates and what is needed for a defensible statistical decision.'],
    ['Quality dashboard', 'Interpret the model quality dashboard for a release review.', 'Dataset,Grounded answers,Total answers,Median latency ms\nSimple,94,100,450\nAmbiguous,62,100,670\nUnsupported,38,100,510', 'Highlight the unsupported-question risk and propose targeted checks before release.']
  )],
  ['agent-designer', 'agents', 'Agent designer', 'Define an agent with a mission and clear boundaries.', 'Bot', 'Agent inputs and workflow', 'Permissions and boundaries', scenarios(
    ['Support triage', 'Design an agent that triages customer support tickets.', 'Inputs: ticket text, customer plan, and supplied help-center passages. Outputs: category, suggested answer, escalation reason, and next action.', 'Drafts only. Require approval for sending replies or changing an account.'],
    ['Research copilot', 'Design an agent that turns supplied documents into research notes.', 'Inputs: document excerpts and a research question. Outputs: source-grounded findings, disagreements, missing evidence, and follow-up questions.', 'Do not browse or invent sources. Keep references tied to supplied excerpts.'],
    ['Incident coordinator', 'Design an incident coordination assistant.', 'Inputs: alert descriptions, service ownership, timelines, and runbook excerpts. Outputs: incident brief, roles, updates to draft, and recovery checks.', 'Never execute remediation. Separate confirmed observations from hypotheses.']
  )],
  ['agent-execution', 'agents', 'Agent execution', 'Use an agent’s instructions to work through a task.', 'Play', 'Agent instructions and task input', 'Execution boundaries', scenarios(
    ['Risk analyst', 'Produce a risk review following the agent instructions.', 'Agent instructions: identify assumptions, evidence gaps, and mitigations. Task: review a launch proposal with one region, one database, and no tested restore process.', 'Return a prioritized risk register and next steps. Do not claim to have tested the system.'],
    ['Research assistant', 'Complete the document synthesis task following the agent instructions.', 'Agent instructions: compare claims and identify agreement and disagreement. Document A favors a small retrieval model for latency; document B favors a larger model for complex reasoning.', 'Ground the synthesis in these excerpts and propose an evaluation to resolve tradeoffs.'],
    ['Planning assistant', 'Turn the task into a step-by-step execution plan.', 'Agent instructions: produce an actionable plan with acceptance criteria. Task: add searchable AI report history to a local PostgreSQL application.', 'Include sequencing, data design, validation, and rollback considerations. Do not execute changes.']
  )],
  ['workflow-planner', 'agents', 'Workflow planner', 'Map the steps, handoffs, and review points.', 'Layers3', 'Workflow inputs and participants', 'Operational requirements', scenarios(
    ['Content review', 'Design an AI-assisted content review workflow.', 'Participants: writer, reviewer, and publisher. Inputs: product notes and a draft. Outputs: revised draft, factual questions, approval record, and publication checklist.', 'Human approval before publication. Define what happens when evidence is incomplete.'],
    ['Data onboarding', 'Plan an AI-assisted dataset onboarding workflow.', 'Inputs: uploaded CSV, schema notes, and intended use. Participants: data owner, engineer, and analyst. Outputs: profile, quality checks, and accepted dataset specification.', 'Keep validation reproducible and require approval before changing source data.'],
    ['Incident response', 'Map an incident response workflow with an AI assistant.', 'Inputs: alerts, logs, ownership, and runbooks. Participants: responder, incident lead, and communications owner.', 'AI drafts analysis and messages. Humans decide remediation and approve communications.']
  )],
  ['capacity-planner', 'nodes', 'Capacity planner', 'Translate traffic assumptions into compute requirements.', 'Server', 'Workload and compute inventory', 'Capacity targets', scenarios(
    ['Launch capacity', 'Create a capacity plan for a document assistant launch.', 'Expected peak: 20 concurrent requests, 8 KB average prompt, and 1 KB average answer. Existing inventory: two general-purpose nodes and one GPU node. No measured throughput is available.', 'Identify benchmark measurements needed before sizing. Include headroom and failure handling.'],
    ['Scale planning', 'Plan the next capacity evaluation for a growing inference service.', 'Requests increased from 5,000 to 30,000 per day. Peak concurrency is 80. GPU utilization reaches 88% during business hours. Median latency has doubled.', 'Compare queueing, batching, caching, replicas, and admission control. State assumptions.'],
    ['Batch workload', 'Plan capacity for a nightly document processing workload.', 'A nightly job processes 50,000 documents, each about 2,000 tokens. The completion window is eight hours. Interactive traffic shares the same infrastructure.', 'Separate batch and interactive priorities and calculate the required processing rate.']
  )],
  ['incident-analyst', 'nodes', 'Incident analyst', 'Turn symptoms and telemetry into a focused investigation.', 'CircleAlert', 'Symptoms, logs, and timeline', 'Investigation scope', scenarios(
    ['Latency spike', 'Analyze the incident and propose an investigation sequence.', '09:00: release deployed. 09:10: request latency rises from 400 ms to 1.8 s. GPU utilization is steady at 55%. Database connection wait rises. No database errors are reported.', 'Rank hypotheses, identify discriminating checks, and suggest reversible mitigations.'],
    ['Unavailable node', 'Create an incident investigation brief for a missing compute node.', 'One node stops reporting health at 14:05. Other nodes remain online. Requests assigned to the missing node time out. Host logs and network telemetry are not yet available.', 'Avoid asserting a root cause. Cover containment, evidence collection, and recovery verification.'],
    ['Memory pressure', 'Analyze resource pressure in the supplied telemetry.', 'After a new model version, memory usage rises from 60% to 94%, restarts occur every 20 minutes, and throughput falls. Request volume is unchanged.', 'Investigate model size, concurrency, caching, and leaks. Define safe rollback checks.']
  )],
  ['region-planner', 'nodes', 'Region planner', 'Plan a deployment around latency and availability.', 'Globe2', 'Traffic distribution and regions', 'Deployment requirements', scenarios(
    ['Global launch', 'Propose a regional deployment evaluation for a global assistant.', 'Traffic assumptions: North America 50%, Europe 35%, Asia Pacific 15%. Only one North America region is currently available. User latency is not yet measured.', 'Include measurement, rollout sequence, failover, and data-location requirements to clarify.'],
    ['Regional failover', 'Review the regional failover approach.', 'The primary region handles all writes. A second region has read replicas but no tested promotion process. Recovery targets are 30 minutes and five minutes of data loss.', 'Explain gaps, test scenarios, and operational acceptance criteria.'],
    ['Latency review', 'Interpret regional latency and recommend investigations.', 'Region,P50 ms,P95 ms\nNorth America,450,900\nEurope,820,1800\nAsia Pacific,1200,2600', 'Separate network and service processing hypotheses. Propose measurements before adding regions.']
  )],
  ['verification-review', 'proofs', 'Verification review', 'Explain what your evidence establishes and what is missing.', 'ShieldCheck', 'Receipt and verification evidence', 'Review criteria', scenarios(
    ['Receipt review', 'Review the assurance provided by a local SHA-256 receipt.', 'The receipt stores a digest of inference ID, input, and output. Recomputing the digest currently matches. There is no signature, attestation, or external timestamp.', 'Explain content consistency, remaining trust assumptions, and additional evidence needed.'],
    ['Attestation plan', 'Plan an evidence checklist for a TEE-based inference workflow.', 'Proposed evidence includes a hardware attestation, model identifier, runtime measurement, request digest, response digest, and a signed receipt. No concrete attestation has been supplied.', 'Discuss validation steps and assumptions without claiming verification has occurred.'],
    ['Assurance comparison', 'Compare the assurance of the supplied verification approaches.', 'Approaches: unsigned local hash receipt, signed execution receipt, hardware attestation, and a proof of a specified computation. Implementation details are unavailable.', 'Use a comparison table and distinguish integrity, authenticity, execution, and correctness.']
  )],
  ['integrity-investigator', 'proofs', 'Integrity investigator', 'Investigate mismatches with a clear evidence trail.', 'History', 'Expected and observed evidence', 'Investigation requirements', scenarios(
    ['Output changed', 'Create an investigation plan for an integrity mismatch.', 'A receipt was valid yesterday. Today its source inference output contains an extra sentence and verification fails. The source record revision increased from 1 to 2.', 'Identify likely explanations, required audit evidence, and safe recovery options.'],
    ['Missing source', 'Explain how to investigate a receipt whose source was deleted.', 'The receipt and original committed payload remain stored, but its inference reference is now empty. Verification marks it invalid against the current source.', 'Distinguish retained content integrity from the ability to compare a live source.'],
    ['Serialization mismatch', 'Analyze a suspected serialization-related digest mismatch.', 'Two systems hash logically equivalent JSON using different key orders. One encodes Unicode characters literally; another uses escaped characters.', 'Explain canonicalization, byte-level checks, and a reproducible test plan.']
  )],
  ['evidence-summary', 'proofs', 'Evidence summary', 'Make verification evidence easy to review and share.', 'FileCode2', 'Evidence and activity timeline', 'Summary requirements', scenarios(
    ['Audit brief', 'Summarize the verification evidence for a reviewer.', '10:00: inference saved. 10:00: SHA-256 receipt created. 10:05: receipt verified. 10:20: output edited. 10:21: mismatch detected. The records are local and unsigned.', 'Provide a timeline, confirmed facts, evidence gaps, and recommended follow-up.'],
    ['Release evidence', 'Prepare an evidence checklist for a model release review.', 'Supplied evidence: version identifier, evaluation report, sample request outputs, and local hash receipts. Missing: signed artifact manifest and independent execution evidence.', 'Separate available evidence from requested evidence and assign review questions.'],
    ['Incident handoff', 'Create an evidence handoff summary after an integrity incident.', 'Two receipts fail after a maintenance window. Four remain valid. The deployment log shows a schema change; no user edit log has yet been reviewed.', 'Avoid a causal conclusion. Include preservation steps and prioritized evidence requests.']
  )],
  ['contract-reviewer', 'contracts', 'Contract reviewer', 'Review supplied contract logic and integration risks.', 'FileCode2', 'Contract source or design', 'Review scope', scenarios(
    ['Access control', 'Review the supplied contract outline for access-control gaps.', 'A model registry exposes registerModel(name, uri), updateModel(id, uri), and pauseModel(id). Registration records an owner; the outline does not specify authorization checks for updates or pausing.', 'Identify findings, severity rationale, and tests. Do not treat this outline as a completed security audit.'],
    ['Settlement review', 'Review the settlement workflow design for failure modes.', 'A contract receives an inference identifier, a result digest, and a payment amount. It marks the identifier settled and transfers payment. Signature checks and replay protection are unspecified.', 'Cover authenticity, replay, checks-effects-interactions, and failure recovery.'],
    ['Oracle integration', 'Review an AI result integration design.', 'A contract accepts an offchain numeric result from an operator and adjusts a limit. The accepted range, freshness check, and operator authorization are not yet defined.', 'Cover bounds, stale data, trust assumptions, and circuit breakers.']
  )],
  ['contract-architect', 'contracts', 'Contract architect', 'Design clear interfaces and trust boundaries.', 'Blocks', 'Use case and participants', 'Design constraints', scenarios(
    ['Model registry', 'Design a contract interface for model registration metadata.', 'Publishers register model name, version, storage reference, and artifact digest. Consumers need to inspect versions and recognize deprecated entries.', 'Include roles, events, versioning, data validation, and offchain responsibilities.'],
    ['Receipt registry', 'Design a receipt registry concept for signed inference receipts.', 'An offchain service signs request and response digests. A registry records receipt identifiers and signer information. Consumers need duplicate protection.', 'Define the signed statement, replay domain, signer rotation, and verification assumptions.'],
    ['Usage settlement', 'Outline a usage settlement contract design.', 'A service produces usage claims. A payer reviews claims before settlement. Disputes must not block unrelated claims.', 'Include authorization, claim lifecycle, dispute handling, and test scenarios.']
  )],
  ['integration-planner', 'contracts', 'Integration planner', 'Connect AI results to applications with explicit review points.', 'Network', 'Application and integration flow', 'Integration boundaries', scenarios(
    ['App integration', 'Plan an application integration using AI recommendations.', 'A dashboard receives a generated risk report. A user reviews it and may update local risk-policy metadata. There is no wallet or deployed contract in this workspace.', 'Keep generated advice separate from execution. Include storage, errors, and approval points.'],
    ['Offchain pipeline', 'Design an offchain AI-to-contract integration pipeline.', 'Steps under consideration: collect inputs, request AI analysis, validate a bounded result, obtain operator approval, sign a statement, and submit to a contract.', 'Identify trust boundaries, freshness, idempotency, and rejection paths.'],
    ['Event processing', 'Plan reliable processing for contract events and AI summaries.', 'Events are indexed offchain and summarized for operators. Reorganizations and duplicate deliveries are possible. AI reports must link to the evidence used.', 'Cover confirmations, deduplication, replay, and report provenance.']
  )],
  ['ledger-analyst', 'transactions', 'Ledger analyst', 'Explain activity and accounting patterns in a ledger.', 'ArrowLeftRight', 'Ledger entries', 'Analysis requirements', scenarios(
    ['Weekly summary', 'Summarize the supplied sandbox ledger.', 'Type,Count,Demo credits\nInference settlement,42,8.4\nModel registration,3,1.5\nNode reward,12,6.0\nContract registration,2,0.8', 'Calculate totals and shares. Explicitly identify these as demo-credit records, not real transfers.'],
    ['Pending entries', 'Analyze a ledger with unresolved entries.', 'There are 25 simulated settlements, five pending registrations, and two failed reward records. Pending records have no recorded settlement reason or retry history.', 'Identify reconciliation questions and a status review workflow.'],
    ['Cost breakdown', 'Explain the supplied inference cost breakdown.', 'Team,Requests,Reported USD cost\nResearch,800,12.40\nSupport,2400,18.10\nOperations,500,7.20', 'Calculate cost per request and suggest investigation areas without inventing provider rates.']
  )],
  ['anomaly-review', 'transactions', 'Anomaly review', 'Find patterns that deserve an evidence-based investigation.', 'CircleAlert', 'Transactions and observed patterns', 'Review criteria', scenarios(
    ['Duplicate entries', 'Review possible duplicate ledger records.', 'Entries A and B have the same inference identifier and amount, but different local hashes and timestamps one second apart. There is no external chain evidence.', 'Treat duplication as a hypothesis. Propose idempotency and reconciliation checks.'],
    ['Cost spike', 'Analyze a sudden increase in reported AI usage cost.', 'Daily cost changed from about $4 to $19. Request count stayed near 1,000. Average prompt length increased from 1,200 to 6,000 tokens after a release.', 'Distinguish observations from a confirmed cause. Identify measurements and controls.'],
    ['Missing settlement', 'Investigate a completed job without a linked settlement record.', 'An inference is marked completed, its receipt is present, and its transaction reference is empty. A maintenance job recently archived some ledger entries.', 'Cover retained evidence, transaction boundaries, deletion history, and safe reconciliation.']
  )],
  ['settlement-explainer', 'transactions', 'Settlement explainer', 'Make usage, settlement, and status changes understandable.', 'Info', 'Settlement details and lifecycle', 'Explanation requirements', scenarios(
    ['Explain a record', 'Explain a simulated inference settlement for a product manager.', 'A completed local inference created a receipt and a simulated ledger entry for 0.0034 demo credits. Its hash is locally generated and no funds were transferred.', 'Use plain language and distinguish the local workflow from blockchain settlement.'],
    ['Billing lifecycle', 'Explain a proposed AI usage billing lifecycle.', 'A request is accepted, the provider returns tokens and usage cost, the application saves the report, and the account balance is maintained by the external provider.', 'Explain responsibilities, failure cases, and reconciliation evidence.'],
    ['Status guide', 'Write a guide to interpreting settlement statuses.', 'Local statuses are Simulated, Pending, and Failed. Simulated means a demo ledger entry; Pending needs review; Failed represents an unsuccessful local record.', 'Include examples and operator actions. Do not imply these statuses prove chain finality.']
  )],
  ['data-profiler', 'datasets', 'Data profiler', 'Inspect supplied data for quality and useful patterns.', 'Database', 'Sample data and schema', 'Quality questions', scenarios(
    ['Customer CSV', 'Profile the supplied customer data sample.', 'id,email,plan,signup_date\n1,alex@example.com,pro,2026-09-01\n2,,starter,2026-09-02\n2,sam@example.com,enterprise,unknown\n4,lee@example.com,pro,2026-09-05', 'Identify duplicates, missing values, date issues, and validation rules. The sample uses fictional contacts.'],
    ['Market data', 'Review quality risks in the supplied market data sample.', 'date,symbol,close,volume\n2026-09-01,EXAMPLE,101.2,12000\n2026-09-02,EXAMPLE,-4.5,0\n2026-09-02,EXAMPLE,103.1,9000\n2026-09-04,EXAMPLE,,11000', 'Flag suspicious values and duplicate dates. Do not silently repair the source.'],
    ['Training labels', 'Profile a classification dataset sample.', 'text,label\nPayment did not arrive,billing\nCannot log in,account\nInvoice is incorrect,account\nPlease add exports,feature\nMy account is locked,', 'Identify potential label issues, missing labels, and an annotation review plan.']
  )],
  ['memory-architect', 'datasets', 'Memory architect', 'Design useful agent memory with clear retention rules.', 'Layers3', 'Memory needs and information types', 'Storage and retention constraints', scenarios(
    ['Support memory', 'Design memory for a support drafting assistant.', 'Useful context: current ticket, approved product facts, resolved issue summaries, and customer preferences. Authentication credentials must never be included.', 'Separate short-term task context from approved durable memory. Include expiry and deletion.'],
    ['Research memory', 'Design memory for a source-grounded research assistant.', 'Researchers need reusable findings, source excerpts, dates, disagreements, and the questions that produced each note.', 'Preserve provenance, distinguish hypotheses, and prevent outdated notes from appearing authoritative.'],
    ['Project memory', 'Plan an engineering assistant’s project memory.', 'Information types: architecture decisions, coding conventions, release notes, ownership, and incident lessons. Decisions can be superseded.', 'Include versioning, relevance retrieval, updates, and permission boundaries.']
  )],
  ['dataset-planner', 'datasets', 'Dataset planner', 'Plan coverage, annotation, and validation before collecting data.', 'ListFilter', 'Task and dataset requirements', 'Collection constraints', scenarios(
    ['Evaluation set', 'Plan a dataset for evaluating a support assistant.', 'The product supports onboarding, billing, search, and troubleshooting. Questions range from straightforward facts to unsupported requests.', 'Include coverage, held-out examples, source references, and a review rubric.'],
    ['Classification set', 'Plan a support ticket classification dataset.', 'Labels: account, billing, technical issue, and feature request. Some tickets need multiple labels. Human annotation capacity is five hours per week.', 'Address ambiguity, label balance, annotation quality, and leakage prevention.'],
    ['Retrieval benchmark', 'Plan a retrieval evaluation dataset for internal documents.', 'The knowledge base includes engineering proposals, incident reviews, and product specifications. Some documents are obsolete or access restricted.', 'Include relevant passage judgments, permission-aware cases, stale sources, and ranking metrics.']
  )],
];

const text = (key, label, extra = {}) => ({ key, label, type: 'text', required: true, maxLength: 160, ...extra });
const area = (key, label, extra = {}) => text(key, label, { type: 'textarea', maxLength: 12000, ...extra });
const select = (key, label, options) => ({ key, label, type: 'select', required: true, options });

export const aiFeatures = definitions.map(([id, entity, title, description, icon, sourceLabel, constraintsLabel, examples]) => ({
  id, entity, title, description, icon,
  fields: [
    text('title', 'Request name'),
    area('objective', 'Goal', { maxLength: 4000, rows: 3 }),
    area('source', sourceLabel, { maxLength: 18000, rows: 6 }),
    area('constraints', constraintsLabel, { maxLength: 4000, rows: 3 }),
    select('audience', 'Audience', ['Product & business', 'Engineering team', 'Research team']),
    select('format', 'Response format', ['Structured report', 'Executive brief', 'Implementation plan', 'Comparison & recommendations']),
    select('detail', 'Detail level', ['Concise', 'Balanced', 'Comprehensive']),
    area('notes', 'Additional instructions', { maxLength: 2000, rows: 2 }),
    text('model', 'OpenRouter model', { type: 'model', maxLength: 200 }),
    { key: 'temperature', label: 'Creativity', type: 'number', required: true, min: 0, max: 1, step: 0.1, default: 0.3 },
    { key: 'max_tokens', label: 'Maximum response tokens', type: 'number', required: true, min: 256, max: 8192, step: 1, integer: true, default: 2048 },
  ],
  presets: examples.map((example, index) => ({
    id: `${id}-${index + 1}`, label: example.label,
    description: index === 0 ? 'A practical starting point' : index === 1 ? 'A more involved scenario' : 'A deeper exploration',
    values: {
      title: `${example.label} · ${title}`,
      objective: example.objective, source: example.source, constraints: example.constraints,
      audience: index === 0 ? 'Product & business' : index === 1 ? 'Engineering team' : 'Research team',
      format: index === 0 ? 'Structured report' : index === 1 ? 'Implementation plan' : 'Comparison & recommendations',
      detail: index === 2 ? 'Comprehensive' : 'Balanced',
      notes: 'Use the supplied information. Mark assumptions and missing evidence clearly. End with practical next steps. These example inputs are illustrative.',
      model: 'openrouter/free', temperature: index === 2 ? 0.4 : 0.3, max_tokens: index === 2 ? 4096 : 2048,
    },
  })),
}));

export const aiFeatureMap = Object.fromEntries(aiFeatures.map(feature => [feature.id, feature]));
export const aiExampleSets = [
  { id: 'starter', label: 'Starter examples', description: 'Fill every tool with a practical example.', index: 0 },
  { id: 'advanced', label: 'Advanced examples', description: 'Fill every tool with an operational scenario.', index: 1 },
  { id: 'research', label: 'Research examples', description: 'Fill every tool with a deeper exploration.', index: 2 },
];

export function aiDefaults(feature, model = 'openrouter/free') {
  return Object.fromEntries(feature.fields.map(field => [field.key, field.key === 'model' ? model : field.default ?? (field.type === 'select' ? field.options[0] : '')]));
}

export function presetValues(feature, index = 0, model = 'openrouter/free') {
  return { ...feature.presets[index].values, model };
}

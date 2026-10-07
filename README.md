# OpenGradient Studio

An independent React, Express, and PostgreSQL workspace for **storing model files, running configured AI, and building local agents and workflows**. It includes ONNX execution, OpenRouter inference, optional OpenGradient SDK integrations, 24 AI tools, complete presets, formatted reports, and persistent history.

The Model catalog contains local metadata and starter examples, rather than a synchronized OpenGradient catalog. Local execution supports uploaded self-contained ONNX models. There is currently no model downloader or GGUF/PyTorch/Transformers LLM runtime; storing those weights does not make them executable. OpenRouter and OpenGradient language models run through remote providers. The weighted-score tutorial is a fixed-coefficient example. These capabilities cover only part of the [official OpenGradient platform](https://www.opengradient.ai/).

## Start

```bash
cd /Users/erolakarsu/external/projects/opengradient-studio
./start.sh
```

Open the **Local URL printed in the terminal**, normally **http://127.0.0.1:4310**. If the preferred port is occupied, startup selects an available port from the next 19 ports. It prints the running URL after a successful bind. Existing services are left running.

Requirements: Node.js 22.12+, npm, PostgreSQL, and Python 3.11–3.13 (3.12 recommended). If `uv` is installed, setup can provision Python 3.12 automatically. Startup installs locked JavaScript and Python dependencies, prepares the OpenGradient SDK and ONNX Runtime, creates the database if needed, applies schema updates, preserves existing records, builds the frontend, and starts the app. Ctrl+C stops the app and retains its data.

## Build & execute

Four sidebar entries open the working platform screens:

| Sidebar button | What you can do |
| --- | --- |
| **Model hosting** | Create repositories, upload actual files, keep versions and notes, download weights, bind a runtime, and publish files to OpenGradient Model Hub. |
| **Inference playground** | Run a connected language model or uploaded ONNX model and read a formatted response with timings, saved history, and an integrity receipt. Three presets fill the request fields. |
| **Workflows** | Chain up to eight model, agent, or live contract-read steps. Run on demand, schedule while the server runs, or trigger using a protected webhook. Three examples fill the editor. |
| **Connections** | Configure OpenRouter, Model Hub, and an OpenGradient wallet; inspect the installed SDK and runtime; check live blockchain RPC connections. |

For a working local prediction: open **Model hosting → Add ONNX tutorial model → Run this model**. Enter `[[1,2,3]]` for `features` and a run name, then run. The output is **14.5**, calculated by an actual ONNX graph. This tutorial uses fixed coefficients and is described as an example, not a trained forecast.

For hosted AI: choose **Free assistant → Connect executable model** in Model hosting, then **Run this model** or select it in Inference playground. It uses your configured OpenRouter key. The three request presets fill the name, prompt, creativity, and token limit. Results render as Markdown reports; **Download report** saves a standalone HTML report. Numeric predictions also offer a complete data download.

Uploads allow ONNX, GGUF, safetensors, common weight files, and accompanying text/data files, up to 512 MB each. Self-contained ONNX runs locally on CPU. Other file formats can be stored and published; local execution does not load arbitrary PyTorch pickles or claim to run unsupported weights. Uploaded files live in `.runtime/artifacts`, with versions, SHA-256 fingerprints, and runtime metadata in PostgreSQL. Preserve both the database and `.runtime` when moving the workspace.

## Agents & connected workflows

Open **AI agents → Add agent**, select a model with a configured runtime, save instructions, and set the agent to **Active**. **Run agent** uses its model and instructions. The **Runtime & memory** tab manages creativity, response limits, conversation memory, saved run history, and memory clearing. These settings apply to workflow agent steps as well.

In **Workflows**, create a workflow or choose an example, select its sources, and set it to **Active**. Each step can use `{{input}}`, `{{previous}}`, or `{{step:step_id}}` in its prompt. Runs save each completed step and the final result. Failures retain their error and completed steps. Overlapping runs of the same workflow are rejected.

Scheduled workflows use their saved default input and interval while the server is running. Active schedules can call paid providers; choose the model and interval deliberately. Application webhooks require a per-workflow Bearer token. The token is shown once and stored only as a hash; generating a new token invalidates the previous one. Paused and Draft workflows do not execute.

Smart contracts includes a **Read a live smart contract** form. It supports view/pure functions, decodes results, and saves the network, contract, and observed block. Reads require no wallet and send no transaction. Contract reads can also feed subsequent AI workflow steps.

## OpenGradient integration

The installed official SDK is locked to **1.1.4**, with ONNX Runtime **1.30.0**. Configure your Model Hub account in **Connections** to publish uploaded files into a real remote repository and version. Model Hub assigns its remote version independently of the local version label. Successful publication saves its CID.

OpenGradient LLM execution requires a dedicated EVM wallet with OPG on Base. Saving the wallet does not send transactions. Enable network payments before executing, and use the separate **Approve OPG allowance** action if an allowance is required. Inference never silently approves a token allowance. Network results retain provider evidence, including signatures and payment metadata; a local SHA-256 receipt verifies saved data integrity and is not itself a TEE or zkML proof.

Published-model ML inference and on-chain ML workflow deployment use OpenGradient’s deprecated experimental alpha testnet. Deployment requires a compatible published model, funded alpha wallet, oracle input fields, and an explicit deployment action. The deployed contract address is saved in Smart contracts. These operations depend on a reachable alpha RPC endpoint and your account/funding; they are not simulated as successful runs. Connections marks the alpha network as deprecated and reports DNS, timeout, certificate, and unexpected-chain failures explicitly. A successful connection check must report the expected chain ID. The primary testnet is a separate network and is not silently substituted for alpha ML execution. See the [official SDK documentation](https://docs.opengradient.ai/developers/sdk/).

Credentials are stored in ignored local files with owner-only permissions and are never returned by the API. You can alternatively set `OG_HUB_EMAIL`, `OG_HUB_PASSWORD`, `OG_PRIVATE_KEY`, and `OG_ALLOW_PAYMENTS=1` in `.env`. OpenGradient payment approval and deployment must be initiated by you.

## Connect AI

1. Open **AI Studio → AI settings**.
2. Enter an [OpenRouter API key](https://openrouter.ai/settings/keys).
3. Keep `openrouter/free` as the default or enter another OpenRouter model ID.
4. Click **Save connection**. The app checks the key with OpenRouter before saving it.

The key is stored on the local server in the ignored `.runtime/openrouter.json` file with owner-only permissions. API responses never return the key. Alternatively, configure these values in `.env`:

```dotenv
OPENROUTER_API_KEY=your-openrouter-key
OPENROUTER_MODEL=openrouter/free
```

The [Free Models Router](https://openrouter.ai/openrouter/free) selects an available free model. Other models can use your OpenRouter credits. The model field searches the current OpenRouter catalog and also accepts a model ID directly. See the [official OpenRouter quickstart](https://openrouter.ai/docs/quickstart).

## AI tools and fields

Every tool has **11 editable fields**: request name, goal, source material, constraints, audience, response format, detail level, additional instructions, OpenRouter model, creativity, and maximum response tokens. Source and constraint labels are tailored to the tool.

Each tool has **three example buttons that fill every field**. The **Starter examples**, **Advanced examples**, and **Research examples** buttons at the top of AI Studio fill all fields in all 24 tools at once. Filling examples makes no generation requests. Click **Generate with AI** on a tool to request its response.

| Workspace section | AI tools |
| --- | --- |
| Model catalog | Model advisor, Prompt designer, Evaluation planner |
| Inference jobs | Text intelligence, Research brief, Data interpreter |
| AI agents | Agent designer, Agent execution, Workflow planner |
| Compute network | Capacity planner, Incident analyst, Region planner |
| Verification center | Verification review, Integrity investigator, Evidence summary |
| Smart contracts | Contract reviewer, Contract architect, Integration planner |
| Transactions | Ledger analyst, Anomaly review, Settlement explainer |
| Datasets & memory | Data profiler, Memory architect, Dataset planner |

Every collection links directly to its AI tools. Open a record and click **Ask AI** to fill a brief using that record's details. Edit the fields before generating.

AI responses are presented as reports with headings, paragraphs, lists, tables, and useful next steps. Structured responses and older JSON-shaped local outputs are converted into readable sections. Raw model HTML is excluded from rendering. Each successful response saves its full brief, text, model, token usage, provider-reported cost, timestamp, and duration in PostgreSQL.

Use **Copy AI response**, **Download formatted report**, **Reuse this brief**, or **Response history** to work with a result. Downloaded reports are standalone HTML documents with print styling. History persists across restarts and includes pagination. A response that reaches its token limit is marked clearly. Connection, key, credit, model, rate-limit, and timeout errors are shown beside the form; failed requests create no fabricated response.

## Database workspace

The eight collections start with **228 sample records**:

| Collection | Initial records |
| --- | ---: |
| Models | 18 |
| Inference jobs | 48 |
| Agents | 16 |
| Nodes | 18 |
| Integrity receipts | 48 |
| Contracts | 16 |
| Transactions | 48 |
| Datasets | 16 |

Collections support create, read, edit, delete, activity history, revision conflict protection, search, sorting, status filters, table/card views, CSV export, and 15/30/60-row pagination. Cmd/Ctrl+K searches across collections. Startup seeds once and preserves edits and deletions. AI reports are additional records in `ai_runs` and are not seeded with generated answers.

Seeded catalog entries are examples and have no executable weights or provider connection until you configure one in Model hosting. Real execution results are saved alongside these records. Compute-node and dataset catalogs remain local inventories; transaction records remain a demo ledger. Agent trigger preferences do not schedule work automatically: use Workflows for scheduling and webhooks. The legacy deterministic sandbox runner remains available through its API for receipt tests.

This is an independent application inspired by [OpenGradient](https://www.opengradient.ai/), with an OpenRouter integration.

## PostgreSQL and ports

By default, PostgreSQL connects at `127.0.0.1:5432` using your operating-system user and the dedicated `opengradient_studio` database. Configure `DATABASE_URL` or the usual `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, and `PGDATABASE` variables in `.env`. Shell environment values take precedence. The role needs database-creation privileges for initial setup, or an existing database with schema-creation privileges.

```bash
PORT=4311 ./start.sh             # Preferred application port
STRICT_PORT=1 ./start.sh         # Require the exact port
USE_DOCKER=1 ./start.sh          # Dedicated PostgreSQL 17 container
```

Docker mode requires a running Docker engine. It binds PostgreSQL to `127.0.0.1:55432`, generates a local password in `.runtime/docker-password`, and retains data in a named volume. `APP_DB_PASSWORD` and `DOCKER_PGPORT` override those defaults. Preserve the generated password while reusing the volume. `docker compose stop` retains the volume.

## Development and tests

```bash
npm run runtime:setup
npm run db:setup
npm run dev
npm run build
npm test
```

Development mode prefers API port 4310 and frontend port 5173. It selects available ports and connects Vite's proxy to the actual API port. Open the printed **Development frontend** URL. `DEV_PORT` sets the preferred frontend port. Backend changes restart development mode; frontend changes use hot reload.

Tests create uniquely named disposable PostgreSQL databases and remove only those databases. They cover all eight CRUD modules, relationships, persistence, conflict protection, sandbox receipts, startup port fallback, development proxy writes, all 24 AI tools, all 72 complete presets, private credential storage, report persistence, history pagination, provider errors, and timeouts. AI tests use a local provider implementing the OpenRouter HTTP contract and do not make paid generation requests. Platform tests additionally cover real ONNX graph execution, uploads and versions, agent instruction and memory ordering, saved runtime parameters, workflow chaining, failure history, overlap protection, scheduling, webhook authorization and rotation, block-specific contract reads, and credential/payment requirements. Remote SDK calls use isolated adapters in tests. Live OpenRouter generation and local ONNX inference have also been checked in the browser; paid OpenGradient operations require your own configured account and wallet.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | PostgreSQL connectivity |
| GET | `/api/overview?days=14` | Overview and saved AI response count |
| GET | `/api/ai/features` | AI tools, form fields, and presets |
| GET | `/api/ai/settings` | Connection status and default model; no secrets |
| PUT | `/api/ai/settings` | Check and save a key or change the default model |
| GET | `/api/ai/models` | Cached OpenRouter text model catalog |
| POST | `/api/ai/generate` | Generate and save a report with `feature_id`, `values`, and optional `source_record_id` |
| GET | `/api/ai/runs?feature=…&page=1` | Paginated report history |
| GET | `/api/ai/runs/:id` | Full saved brief and response |
| GET/PUT | `/api/platform/connections` | Connection status and private configuration |
| POST | `/api/platform/models/connect` | Connect an executable hosted model |
| POST | `/api/platform/models/example` | Create a real tutorial ONNX graph |
| GET/POST | `/api/platform/models/:id/files` | List versions/files or upload a multipart file |
| PUT | `/api/platform/models/:id/binding` | Choose the model execution provider |
| GET | `/api/platform/files/:id/download` | Download the original model file |
| POST | `/api/platform/files/:id/publish` | Publish to the real Model Hub |
| POST | `/api/platform/execute` | Execute a model or agent and persist output/evidence |
| GET/PUT | `/api/platform/agents/:id/runtime` | Agent settings, memory count, and saved runs |
| GET/POST | `/api/platform/workflows` | List or create connected workflows |
| PUT | `/api/platform/workflows/:id` | Save a workflow with revision protection |
| POST | `/api/platform/workflows/:id/run` | Execute every step |
| GET | `/api/platform/workflows/:id/runs` | Persistent workflow run history |
| POST | `/api/platform/hooks/:id` | Bearer-token protected workflow trigger |
| POST | `/api/platform/contracts/read` | Decode and save a live contract observation |
| POST | `/api/platform/workflows/deploy-alpha` | Deploy an on-chain alpha-testnet ML workflow |
| GET | `/api/meta` | Collection metadata |
| GET/POST | `/api/:entity` | List or create collection records |
| GET/PATCH/DELETE | `/api/:entity/:id` | Read, edit, or delete; writes require a revision |
| GET | `/api/options/:entity` | Reference choices |
| POST | `/api/inferences/run` | Legacy local inference/receipt/demo-settlement workflow |
| POST | `/api/proofs/:id/verify` | Recompute a local integrity receipt |

Database values are parameterized, identifiers are allowlisted, writes record activity, and stale record revisions return HTTP 409. Cross-origin writes are rejected. Request bodies and AI fields are bounded. The local server binds to loopback by default and is intended for one user's workspace.

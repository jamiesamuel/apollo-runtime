# Deploy and Host Mastra on Railway

Deploy a production Mastra server and the built-in Mastra Studio with PostgreSQL-backed workflows and agent memory. This repository is intended for the Railway template **Mastra** in the **AI/ML** category.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/mastra?referralCode=indah&utm_medium=integration&utm_source=template&utm_campaign=generic)

> **Template description:** A TypeScript AI agent platform with Studio, workflows and persistent memory.

## About Hosting Mastra

[Mastra](https://mastra.ai/) is a TypeScript framework and runtime for AI agents and typed workflows. This starter builds Mastra's production server and Studio into one container, listens on Railway's `PORT`, and keeps application state in a Railway PostgreSQL service.

## Common Use Cases

- Build and inspect stateful AI assistants.
- Orchestrate typed, multi-step AI workflows.
- Prototype agent tools and MCP integrations in Studio.
- Self-host an AI runtime with provider choice and PostgreSQL persistence.

## Dependencies for Mastra Hosting

- Node.js 22.13 or newer (the Docker image uses Node.js 22 LTS).
- pnpm 10, provisioned through Corepack.
- One PostgreSQL database.
- An API key only for the model provider you select. No provider key is needed merely to boot the server.

Redis is deliberately not included. It is not required for this single-instance starter. It may become useful when designing advanced multi-replica coordination or durable event-replay systems.

## Features

- Official Mastra production server and self-hosted Studio build.
- Persistent PostgreSQL storage managed by `@mastra/pg`; no custom schema or migration layer.
- Persistent recent-message memory for the starter assistant.
- OpenAI, Anthropic, and Google model selection through Mastra's model router.
- A runnable two-step analysis and summarization workflow.
- Database-aware `GET /health` readiness endpoint.
- Mastra-generated REST API and OpenAPI document.
- Strict TypeScript, linting, tests, pinned dependencies, and a multi-stage Docker image.

## Mastra Studio

After deployment, open the Railway public domain at `/`. The production build embeds and serves Studio there; Mastra's API is mounted below `/api`.

Studio can inspect and run the `assistant` agent and `example-workflow`, including stored runs and traces supported by the configured Mastra storage.

This starter intentionally has no authentication. **Anyone who can reach the public domain can use Studio and invoke the configured model.** Before exposing a real workload, add an official Mastra auth provider or restrict access at an upstream gateway. Never use this unauthenticated setup for sensitive data.

## Persistent PostgreSQL Storage

The same official `PostgresStore` backs the Mastra runtime and agent memory. It persists conversation messages, workflow runs/state, and the storage/observability domains supported by the installed Mastra version. The adapter initializes and upgrades its own tables; this repository has no application migrations.

The application container does not need a volume. Railway PostgreSQL owns its persistent volume.

```text
Internet
   |
   v
Mastra (public)
:4111
   |
   | Railway private network
   v
PostgreSQL (private only + volume)
:5432
```

## Supported AI Providers

Set `MODEL_PROVIDER` and the provider-local `MODEL_NAME`. The code combines these using Mastra's current model-router format, `provider/model`.

| Provider  | `MODEL_PROVIDER` | Example `MODEL_NAME` | Key variable                   |
| --------- | ---------------- | -------------------- | ------------------------------ |
| OpenAI    | `openai`         | `gpt-4o-mini`        | `OPENAI_API_KEY`               |
| Anthropic | `anthropic`      | `claude-sonnet-4-6`  | `ANTHROPIC_API_KEY`            |
| Google    | `google`         | `gemini-2.5-flash`   | `GOOGLE_GENERATIVE_AI_API_KEY` |

Google's current Mastra model-router integration uses `GOOGLE_GENERATIVE_AI_API_KEY`, rather than the more ambiguous `GOOGLE_API_KEY`.

## Environment Variables

Copy `.env.example` for local use. Important values are:

- `DATABASE_URL` — required PostgreSQL connection URL.
- `PORT` — HTTP port; defaults to `4111` and is automatically overridden by Railway when supplied.
- `MODEL_PROVIDER` / `MODEL_NAME` — provider and model selected at runtime configuration load.
- The matching provider API key — required only when an agent or workflow invokes that provider.
- `SYSTEM_PROMPT` — starter assistant instructions.

The application validates configuration at startup without logging secret values.

## Agent and Workflow Examples

`assistant` is a configurable agent with persistent recent conversation history. Select it in Studio and supply a thread/resource when using memory across requests.

`example-workflow` accepts:

```json
{ "topic": "How can small teams operate reliable AI agents?" }
```

It first asks the registered assistant for an analysis, then asks it to produce a concise summary. Its structured output contains `topic`, `analysis`, and `summary`. Invoking either example without the selected provider's key produces a provider error at invocation time, not server startup time.

## API and Health Endpoints

| Path            | Purpose                                                        |
| --------------- | -------------------------------------------------------------- |
| `/`             | Mastra Studio                                                  |
| `/health`       | Readiness check, including a lightweight PostgreSQL `SELECT 1` |
| `/api`          | Mastra API base                                                |
| `/openapi.json` | Generated OpenAPI document                                     |

Mastra generates agent and workflow endpoint details in its OpenAPI document. The current standalone server exposes the JSON document cleanly but does not bundle a separate Swagger UI route, so this starter does not add one. The health route never invokes an LLM and returns HTTP `503` without exposing database errors if PostgreSQL is unavailable.

## Railway Deployment

1. Create a Railway project from this repository.
2. Add a PostgreSQL service and keep it private.
3. On the Mastra service, set `DATABASE_URL` to the service reference:

   ```text
   ${{Postgres.DATABASE_URL}}
   ```

4. Set one provider API key and optionally change the model variables.
5. Generate a public domain for the Mastra service and configure `/health` as its healthcheck path.
6. Deploy and open the public domain.

Railway detects the root `Dockerfile`. Do not set a custom build command or start command. The image already runs the compiled production entry point as the non-root `node` user. Do not set `RAILWAY_RUN_UID`.

For local development with an available PostgreSQL instance:

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

For a production build:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

## Security Notes

- `.env` files, generated output, logs, and dependencies are ignored by Git.
- Neither `DATABASE_URL` nor provider keys are returned by the custom route.
- CORS is not opened to arbitrary origins; same-origin Studio requests work without wildcard CORS.
- Studio and APIs are unauthenticated by default. Protect them before using this template beyond a trusted demo.
- Use a separate database/observability backend and an appropriate deployment architecture if traffic grows beyond a low-volume single instance.

## Mastra vs Alternatives

Capabilities evolve; verify framework documentation for a production decision. “Built-in” means the capability is part of the framework rather than a separately assembled application.

| Dimension                       | Mastra                        | Pydantic AI                | Agno                             | CrewAI                       |
| ------------------------------- | ----------------------------- | -------------------------- | -------------------------------- | ---------------------------- |
| Primary language                | TypeScript                    | Python                     | Python                           | Python                       |
| Agent framework                 | Yes                           | Yes                        | Yes                              | Yes                          |
| Built-in workflow engine        | Yes                           | Graphs                     | Workflows                        | Crews/Flows                  |
| First-party development UI      | Studio                        | Logfire is separate        | Agent UI / Control Plane options | Studio/Control Plane options |
| Persistent storage abstractions | Yes                           | User/integration dependent | Yes                              | Yes                          |
| MCP support                     | Yes                           | Yes                        | Yes                              | Yes                          |
| Observability                   | Built in; exporters supported | Logfire integration        | Built in/integrations            | Built in/integrations        |
| Human-in-the-loop primitives    | Yes                           | Yes                        | Yes                              | Yes                          |
| Multi-provider models           | Yes                           | Yes                        | Yes                              | Yes                          |
| Self-hostable runtime           | Yes                           | Yes                        | Yes                              | Yes                          |

## Why Deploy Mastra on Railway?

Railway can build the Dockerfile, inject a dynamic port, connect the application to PostgreSQL over private networking, retain database data on a managed volume, and expose Studio through one public domain. The resulting starter has one application service and one infrastructure dependency, with no Redis, application volume, custom start command, or custom runtime UID.

## Template Metadata

- **Name:** Mastra
- **Category:** AI/ML
- **Short description:** A TypeScript AI agent platform with Studio, workflows and persistent memory.

Marketplace metadata is set when publishing the Railway template; it is documented here so it stays versioned with the repository.

# Slack to CRM

`slack-to-crm` is a new Twenty App scaffolded with `create-twenty-app@latest`.
It keeps the existing `twenty_slack_app` untouched and implements the new
architecture as a thin Slack ingress/audit app plus a companion MCP worker.

## Architecture

- `src/` is the Twenty App layer.
  - Exposes `POST /s/slack/events`, `/s/slack/commands`, and `/s/slack/interactivity`.
  - Verifies Slack signatures with forwarded Slack headers.
  - Stores Slack requests, thread state, approvals, and MCP tool traces as custom objects.
  - Hands off only request or approval IDs to the worker.
  - Does not define CRM `search-*`, `create-record`, `update-record`, or `delete-record` logic-function tools.
- `worker/` is the companion agent service.
  - Uses the Twenty `/mcp` JSON-RPC endpoint.
  - Runs Codex CLI with native MCP tools so ChatGPT/Codex subscription access can be used.
  - Exposes only a session-scoped policy MCP gateway to Codex, never the direct Twenty MCP token.
  - Runs `get_tool_catalog`, `learn_tools`, `load_skills`, read tools, and write draft interception through `ToolPolicyGateway`.
  - Sends read/meta tools through the read MCP token.
  - Turns create/update/delete tool calls into Slack approval drafts until approval.
  - Applies approved drafts only through `execute_tool` with the write MCP token.
  - Uses `AGENT_ENGINE=native-mcp` by default. Use `AGENT_ENGINE=legacy-json-loop` for rollback.

## Official Twenty Docs

This project follows the current Twenty Apps documentation:

- Getting started: https://docs.twenty.com/developers/extend/apps/getting-started
- Data model: https://docs.twenty.com/developers/extend/apps/data-model
- Logic functions: https://docs.twenty.com/developers/extend/apps/logic-functions
- CLI and testing: https://docs.twenty.com/developers/extend/apps/cli-and-testing
- Publishing: https://docs.twenty.com/developers/extend/apps/publishing

## Environment

Twenty App variables:

```bash
SLACK_SIGNING_SECRET=
SLACK_BOT_TOKEN=
SLACK_ALLOWED_CHANNEL_IDS=
WORKER_BASE_URL=
WORKER_SHARED_SECRET=
TWENTY_PUBLIC_URL=
```

Worker variables:

```bash
WORKER_PORT=8787
WORKER_SHARED_SECRET=
TWENTY_MCP_URL=https://your-twenty.example.com/mcp
TWENTY_MCP_READ_TOKEN=
TWENTY_MCP_WRITE_TOKEN=
AGENT_ENGINE=native-mcp
CODEX_AGENT_MODE=cli
CODEX_BINARY=codex
CODEX_MODEL=gpt-5.4
CODEX_REASONING_EFFORT=high
CODEX_HOME=
CODEX_WORKDIR=
CODEX_TIMEOUT_MS=900000
```

## Development

```bash
yarn install
yarn lint
yarn test
yarn twenty typecheck
yarn twenty build --tarball
```

Worker checks:

```bash
yarn workspace slack-to-crm-worker test
yarn workspace slack-to-crm-worker typecheck
yarn workspace slack-to-crm-worker build
```

Twenty local app flow:

```bash
yarn twenty remote add
yarn twenty dev --once
```

Integration tests require a reachable Twenty dev server and API key:

```bash
TWENTY_API_URL=http://localhost:2020 TWENTY_API_KEY=... yarn test:integration
```

## Slack Routes

Configure Slack to call the deployed Twenty App route paths:

- Events API request URL: `https://<twenty-host>/s/slack-to-crm/events`
- Slash command request URL: `https://<twenty-host>/s/slack-to-crm/commands`
- Interactivity request URL: `https://<twenty-host>/s/slack-to-crm/interactivity`

If a public proxy is used, point Slack at the proxy and route the same paths to
the Twenty `/s/slack-to-crm/*` endpoints.

## Safety Model

- Reads and catalog/schema/skill discovery use `TWENTY_MCP_READ_TOKEN`.
- Creates, updates, and deletes are captured as `WriteDraft` objects.
- Slack approval is required for every write, including creates.
- The write token is only used in the worker apply path.
- Codex subprocesses receive only a session-scoped policy MCP bearer token, not `TWENTY_MCP_*` secrets.
- Tool traces are modeled separately so MCP catalog/schema-based execution can be audited.

# Quickstart: ModelFuse Conversation Comparison

## Prerequisites

- Node.js 22+
- pnpm 11
- Docker with Compose
- Credentials for OpenAI, Google, MiniMax and a Qwen deployment

## 1. Install

```bash
pnpm install
```

Implementation adds `@tanstack/react-query` to frontend and Playwright as a
frontend development dependency. Provider SDKs are not required; backend uses the
existing Axios dependency.

## 2. Configure backend

Copy `apps/backend/.env.sample` to `apps/backend/.env` and configure:

```dotenv
# Existing server/PostgreSQL values
PORT=3001
NODE_ENV=development
FRONTEND_URL_LOCALHOST=http://localhost:5173
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=db_dev

# Providers
OPENAI_API_KEY=
OPENAI_MODEL=
GEMINI_API_KEY=
GOOGLE_MODEL=
MINIMAX_API_KEY=
MINIMAX_MODEL=
DASHSCOPE_API_KEY=
DASHSCOPE_BASE_URL=
QWEN_MODEL=

# Runtime behavior
LLM_PROVIDER_TIMEOUT_MS=
CONVERSATION_CONTEXT_MAX_TURNS=
CONVERSATION_SIDEBAR_PAGE_SIZE=
```

Real keys never belong in `.env.sample`, logs or conversation data. Omitting any
required variable prevents backend startup and reports only the variable name.

No token-budget or output-token setting is part of ModelFuse.

## 3. Configure frontend

Copy `apps/frontend/.env.sample` to `apps/frontend/.env`:

```dotenv
VITE_API_BASE_URL=http://localhost:3001/api/v1
VITE_HISTORY_COLLAPSE_CHAR_THRESHOLD=
```

The collapse threshold is non-secret and affects only presentation of loaded
history.

## 4. Start PostgreSQL and apply migrations

```bash
docker compose up -d postgres_template
docker compose run --rm liquibase_template
```

Liquibase must apply the `conversations` and `messages` module changesets. No
manual schema command is allowed.

## 5. Run

```bash
pnpm dev
```

- Frontend: URL printed by Vite.
- Backend: `http://localhost:3001`.
- API base: `http://localhost:3001/api/v1`.

## 6. Smoke flow

1. Submit a prompt and verify tabs labeled OpenAI, Google, MiniMax and Qwen.
2. Verify the three base slots run independently and Qwen appears after available
   base results.
3. Send a follow-up and verify each base uses only its own previous answers.
4. Force one base failure; choose “continuar sin respuesta” and verify the visible
   persisted indication and that another turn can be sent.
5. Force another base failure, retry it successfully and verify Qwen replaces its
   stale consolidation.
6. Force the retry to fail and verify no new Qwen call occurs.
7. Create at least seven turns, reload and verify only the newest three appear.
8. Scroll upward and verify older blocks prepend without visual jump.
9. Create enough conversations to overflow the sidebar; verify downward infinite
   scroll and automatic filling without page controls.
10. Reopen a conversation containing long messages; verify “Mostrar más /
    Mostrar menos” without network or persistence changes.
11. Rename with free text, verify the remaining-character counter and disabled
    Guardar for whitespace.
12. Cancel delete once, then confirm it and verify cascade.

## 7. Recovery check

1. Persist a turn with slots `pending` and `running`.
2. Stop backend without deleting PostgreSQL.
3. Start backend again.
4. Verify those slots become `failed/interrupted`.
5. Verify the turn becomes `partial` when useful content exists, otherwise
   `failed`.
6. Verify order, provider attribution, retry and history remain available.

The automated integration test recreates the service composition over the same
test database.

## 8. Validation

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
docker compose run --rm liquibase_template validate
```

After implementation:

```bash
pnpm --filter frontend test:e2e
pnpm --filter backend test:performance
pnpm --filter backend test:consolidation-eval
```

- `test:performance` uses fake providers and local PostgreSQL; it checks p95 under
  one second for create and first history block.
- `test:consolidation-eval` performs at most five real Qwen calls and exits nonzero
  below 90% of fixture checks.
- Default tests never call paid providers.

## Troubleshooting

- Missing configuration: fix the named variable; no secret value is printed.
- Rejected credential: only its slot fails with a safe authentication error.
- Provider timeout: successful slots remain visible and the failed slot can retry
  or continue-without.
- Stale Qwen response: a base retry succeeded and reconsolidation is still
  running or failed; the previous content remains visibly stale.
- Liquibase failure: fix the changeset and rerun Liquibase; never edit PostgreSQL
  manually.

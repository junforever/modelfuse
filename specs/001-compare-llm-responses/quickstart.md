# Quickstart: ModelFuse Conversation Comparison

## Prerequisites

- Node.js 22+
- pnpm 11
- Docker with Compose
- Credentials for the configured LLM providers

## 1. Install

```bash
pnpm install
```

The implemented frontend manifest includes `@tanstack/react-query`; setup must not
install it ad hoc outside pnpm.

## 2. Configure

Copy `apps/backend/.env.sample` to `apps/backend/.env`. Implementation will add
and validate these non-secret names:

```dotenv
MODEL_BASE_1_PROVIDER=
MODEL_BASE_1_NAME=
MODEL_BASE_2_PROVIDER=
MODEL_BASE_2_NAME=
MODEL_BASE_3_PROVIDER=
MODEL_BASE_3_NAME=
MODEL_CONSOLIDATOR_PROVIDER=
MODEL_CONSOLIDATOR_NAME=
LLM_CONTEXT_MAX_TURNS=10
LLM_PROVIDER_TIMEOUT_MS=55000
```

Provider credentials use provider-specific environment variables such as
`<PROVIDER>_API_KEY`; real values never belong in `.env.sample`.

## 3. Start PostgreSQL and apply migrations

```bash
docker compose up -d postgres_template
docker compose run --rm liquibase_template
```

Liquibase must report both `conversations` and `messages` module changesets as
applied. No manual schema command is part of setup.

## 4. Run the app

```bash
pnpm dev
```

- Frontend: Vite URL printed by the command.
- Backend: `http://localhost:3001`.
- API base: `http://localhost:3001/api/v1`.

## 5. Smoke flow

1. Open a new draft and submit a non-empty prompt.
2. Verify four labeled tabs appear and transition independently.
3. Send a follow-up; verify each base uses its own prior response and the
   consolidator uses only its consolidated history plus current base outputs.
4. Cree al menos siete turnos, recargue y verifique que solo aparecen los tres
   más recientes.
5. Haga scroll hacia arriba y verifique que se antepone el bloque anterior sin
   botones ni salto de posición.
6. Continúe la conversación y confirme que el nuevo turno entra al cache reciente.
7. Renombre con un valor de hasta 80 caracteres.
8. Cancele un delete una vez; luego confírmelo y verifique que el cache y el
   servidor ya no contienen la conversación.

## 6. Validation

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
docker compose run --rm liquibase_template validate
```

After Playwright is added during implementation:

```bash
pnpm --filter frontend test:e2e
```

Tests use deterministic fake LLM adapters and a disposable PostgreSQL database;
they must not call paid providers.

Frontend tests create a fresh `QueryClient` per test, disable retries and cover
infinite pages, polling termination, cache replacement and invalidation.

## Troubleshooting

- Missing configuration: backend must fail at startup with variable names, never
  values.
- A slot times out: its tab shows a safe error and retry; successful slots remain.
- Server restarts mid-turn: stale `running` slots become
  `failed/interrupted` and can be retried.
- Liquibase fails: fix the changeset; do not modify PostgreSQL manually.

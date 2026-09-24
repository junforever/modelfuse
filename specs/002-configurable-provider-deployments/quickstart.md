# Implementation Quickstart

This guide defines the delivery order and minimum verification for the plan. It does not authorize implementation during the planning phase.

## Preconditions

- Branch: `002-configurable-provider-deployments`
- Node.js: repository-supported Node 22 or newer
- Package manager: repository-pinned pnpm 11.22.0
- Database services: existing PostgreSQL 16 and Liquibase 4.30 workflow
- Authoritative inputs: `requirements-brief.md`, `spec.md`, `plan.md`, `research.md`, `data-model.md`, and `contracts/`

Run every Node/pnpm command from the repository root through `& .\agent-scripts\run-pnpm.ps1 -- [literal pnpm args]`; the wrapper validates the cached paths and exact versions on every invocation. Run `initialize-runtime.ps1` only when the cache is missing, invalid, or stale, when the wrapper reports a runtime mismatch, or when an external runtime change is confirmed, and reuse valid runtime evidence between commands.

## Environment setup

All five credentials are optional configuration values:

```dotenv
OPENAI_API_KEY=
GOOGLE_API_KEY=
MINIMAX_API_KEY=
QWEN_API_KEY=
OPENROUTER_API_KEY=
```

An absent or blank credential omits that provider's deployments from the public catalog. Do not add model IDs, context limits, output limits, or modality values to environment configuration; those belong to the exact static catalog. Never log or return credential values.

## Delivery sequence and owners

1. `backend-builder`: canonical backend types, static catalog, optional environment validation, provider registry, adapter refactors, and OpenRouter adapter.
2. `backend-builder`: Liquibase migrations and repository snapshot persistence after the shared types are stable.
3. `backend-builder`: catalog REST endpoint, conversation-creation resolution, snapshot-based orchestration/context, and response projections.
4. `frontend-builder`: canonical frontend schemas, catalog query, shared select primitive, new-conversation selectors, and immutable assignment rendering.
5. `unit-test-runner`: backend/frontend unit and provider contract tests after builder changes are available.
6. `integration-test-runner`: migrations, repository transactions, routes, availability, orchestration, SSE, and recovery integration tests.
7. `e2e-test-runner`: the focused clean-database browser workflow.

Generate dependency-ordered task IDs with Spec Kit before delegating. Use the owners above and the repository's custom-agent mapping. Group same-owner tasks that share files and are simultaneously ready. No UX or performance task is required by this feature; do not invent one.

## Database application

Before the first Docker/Compose, PostgreSQL/Liquibase, integration, or E2E command in a block, run the integration preflight once. Reuse that evidence until Compose, `apps/backend/.env.integration`, the services, or the machine changes.

```powershell
& .\agent-scripts\preflight-integration.ps1 -EnvFile apps/backend/.env.integration
```

Apply migrations through the existing Docker Compose/Liquibase workflow from the repository root:

```powershell
docker compose up -d postgres
docker compose run --rm liquibase update
```

The supported target is a clean database. The migration must create `conversation_deployments` and replace all old response-slot constraints without updating, translating, or backfilling existing rows.

## Focused validation commands

Use the workspace scripts from the repository root. Replace the placeholders with repository-relative test paths.

```powershell
& .\agent-scripts\run-pnpm.ps1 -- --filter backend run test --run <backend-test-path>
& .\agent-scripts\run-pnpm.ps1 -- --filter frontend run test --run <frontend-test-path>
& .\agent-scripts\run-pnpm.ps1 -- --filter backend run build
& .\agent-scripts\run-pnpm.ps1 -- --filter frontend run typecheck
& .\agent-scripts\run-pnpm.ps1 -- --filter frontend run lint
& .\agent-scripts\run-pnpm.ps1 -- --filter @workspace/ui run typecheck
```

Use the existing Playwright script for the single focused E2E workflow after the disposable database and fake providers are configured. Run the integration preflight once before its command block, then pass `-EnvFile apps/backend/.env.integration` to every dependent wrapper invocation because process environments do not persist:

```powershell
& .\agent-scripts\preflight-integration.ps1 -EnvFile apps/backend/.env.integration
& .\agent-scripts\run-pnpm.ps1 -EnvFile apps/backend/.env.integration -- --filter frontend test:e2e -- <e2e-test-path>
```

No automated test may call a paid provider.

## Acceptance walkthrough

1. Start the system with at least one credential missing and verify `GET /api/v1/model-catalog` omits only deployments for that provider and exposes no secrets.
2. With the complete default profile available, open a new conversation and verify all four canonical selectors are preselected.
3. Assign four distinct deployments and create the conversation. Verify the response contains four immutable summaries in canonical order.
4. Verify persisted snapshots contain provider, model, context limit, maximum output limit, and modality arrays.
5. Continue the conversation and verify no request accepts deployment replacement and the original snapshots drive context and execution.
6. Reopen history and verify assignment summaries and response tabs use logical slot labels plus stored display names, with no edit controls.
7. Verify duplicate deployment selection, incomplete explicit selection, unavailable IDs, old slot names, and extra keys are rejected.
8. Make the complete default profile unavailable and verify omitted `deploymentIds` returns the standard safe 503 response with the missing deployment IDs.
9. Force a provider output-limit rejection and verify one `provider_error`, no reduction, no negotiation, and no automatic retry.
10. Exercise all OpenRouter structured 403 cases and verify free-text-only policy wording remains `provider_error`.

## Final delivery gate

- Contract, unit, integration, and E2E owners report the minimum successful evidence required by their tasks.
- Run a single cross-artifact Spec Kit analysis after `tasks.md` exists and implementation is complete.
- Confirm `git diff --check` on the final changed files.
- The coordinator performs the mandatory one-time final subagent status check, interrupts any agent still running, and reports the shutdown result.

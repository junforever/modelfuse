# Implementation Plan: Configurable Provider Deployments

**Branch**: `002-configurable-provider-deployments` | **Date**: 2026-08-19 | **Spec**: [spec.md](./spec.md)
**Input**: `requirements-brief.md` and `spec.md` from `specs/002-configurable-provider-deployments/`

## Summary

Replace provider-named response slots with the four canonical logical slots (`base-1`, `base-2`, `base-3`, `consolidator`) and resolve each slot from an immutable per-conversation deployment snapshot. Add a backend-owned static catalog of exactly ten deployments, expose only entries whose adapter credential is configured, extend conversation creation with an optional complete assignment, and add an OpenRouter adapter behind the existing normalized LLM boundary.

The implementation refactors the existing provider registry from `Record<ResponseSlot, LlmProvider>` to a registry keyed by `providerId`, retains the current orchestration sequence (three base calls followed by one consolidator call), and passes a resolved snapshot into each adapter and `ContextBuilder`. PostgreSQL stores one immutable snapshot row per slot; Liquibase changes the slot constraints without aliases or backfill. The frontend adds four catalog-driven selectors only for new conversations and renders stored assignments read-only for existing conversations. No provider discovery, automatic fallback, retry negotiation, economic metrics, or non-text composer input is added.

## Technical Context

**Language/Version**: Node.js 22+, TypeScript 6.0, React 19.2
**Primary Dependencies**: Express 5.2, Zod 4.4, Axios 1.18, `pg` 8.22, React Query 5.101, Vite 8, Shadcn/Base UI and Tailwind CSS 4
**Storage**: PostgreSQL 16; Liquibase 4.30 formatted-SQL migrations
**Testing**: Vitest 4.1 with Testing Library and Supertest; Playwright 1.62 for full-browser E2E; disposable PostgreSQL integration environment
**Target Platform**: Browser frontend plus Node.js web service on the current local/container deployment model
**Project Type**: pnpm 11 workspace monorepo web application
**Performance Goals**: Catalog reads perform no external I/O; conversation execution preserves three concurrent base attempts followed by one consolidator attempt; every adapter performs exactly one external call per attempt
**Constraints**: Exactly four canonical slots and ten initial deployments; assignments immutable after creation; static catalog; optional provider credentials and optional positive output limits; text-only composer; exact context limits; absent output limits delegate to provider defaults; no aliases, backfill, provider discovery, fallback, automatic retry, economic fields, or new dependency
**Scale/Scope**: One catalog endpoint, one extended creation contract, one snapshot table, two slot-constraint migrations, five adapter registrations, four UI selectors, and the existing conversation/recovery/SSE flows migrated to canonical slots

## Constitution Check

_GATE: Passed before Phase 0 and re-checked after Phase 1 design._

- [x] Work remains within `apps/frontend`, `apps/backend`, `packages/ui`, and `db`; no cross-application internal imports are introduced.
- [x] Backend responsibilities remain separated: `app.ts` mounts routers, routes bind controllers, controllers translate HTTP, services own selection/orchestration rules, and infrastructure owns PostgreSQL, environment configuration, the static catalog, and adapters.
- [x] LLM execution stays behind `LlmProvider`; provider-specific payloads remain inside adapters and normalized results continue to feed orchestration and consolidation.
- [x] PostgreSQL remains the source of truth. Each conversation persists four immutable deployment snapshots, and existing context isolation/windowing behavior is retained with the snapshot's `contextLimitTokens`.
- [x] The Shadcn select primitive belongs to `packages/ui`; selection composition, catalog querying, validation, and conversation state stay in `apps/frontend`.
- [x] Schema changes use Liquibase-formatted SQL, wired through the existing conversations and messages module changelogs and master changelog.
- [x] Credentials stay optional and backend-only through the validated environment boundary; public responses and logs contain no secret or upstream body.
- [x] Non-trivial behavior has unit/contract, integration, and E2E coverage at the lowest sufficient layer.
- [x] Unit, integration, and E2E work is reserved for `unit-test-runner`, `integration-test-runner`, and `e2e-test-runner` respectively.
- [x] Builders change production/testability seams only; auditors are read-only and test runners exclusively own tests and their execution.
- [x] No constitutional violation or exception is required.

### Post-design gate

Phase 1 preserves every gate: the data model uses PostgreSQL and Liquibase; REST, SSE, and adapter contracts use canonical slots; catalog filtering remains backend-only; UI behavior remains application-owned; and all provider output is normalized before orchestration. Complexity Tracking is empty because no exception is needed.

## Architecture and Component Plan

### 1. Shared backend contracts and canonical slots

Refactor `apps/backend/src/types/conversations.ts` so `RESPONSE_SLOTS` is exactly `['base-1', 'base-2', 'base-3', 'consolidator']`, `BaseResponseSlot` excludes `consolidator`, response tuples use that stable order, and role typing maps only `consolidator` to `consolidator`. Add deployment catalog, assignment, public summary, and stored snapshot types. Model `maxOutputTokens` as an optional positive integer and omit the property at API/application boundaries when absent; never materialize absence as `null`, `undefined`, or `0`. Update `apps/backend/src/types/sse.ts` through the shared `ResponseSlot` type; no event alias or translation layer is allowed.

Refactor `apps/backend/src/types/llm.ts` so `LlmProvider` represents one adapter keyed by `providerId`, not one slot/model instance. `LlmRequest` carries the canonical slot and resolved immutable deployment snapshot. Adapter input measurement receives the resolved model and messages; `contextLimitTokens` comes from the snapshot. Keep only the existing normalized content, timestamps, `inputTokens`, `outputTokens`, and `totalTokens` behavior. Existing optional cost fields remain unused and OpenRouter must never populate or persist them.

### 2. Static catalog and optional availability

Add `apps/backend/src/infrastructure/llm/deploymentCatalog.ts` as a readonly typed constant containing exactly the ten normative rows, exact context limits, absent `maxOutputTokens`, exact modalities, and required credential name. It performs no startup or request-time network call.

Add `apps/backend/src/services/llm/ModelCatalogService.ts` to:

- return available entries ordered by `displayName` by filtering definitions against registered provider adapters;
- expose only safe catalog fields, never credential names or availability reasons;
- resolve an explicit four-slot assignment and reject missing, extra, empty, unavailable, or duplicate values;
- resolve the exact default profile only when all four default deployments are available;
- return typed resolution outcomes that `ConversationService` maps to `DEPLOYMENT_UNAVAILABLE`, `DUPLICATE_DEPLOYMENT_ASSIGNMENT`, or `DEFAULT_PROFILE_UNAVAILABLE`.

Add a thin `modelCatalogController` and `modelCatalogRoutes` for `GET /api/v1/model-catalog`, mount it in `apiRouter.ts`, and inject the service through `ApiDependencies` so tests do not depend on process-global configuration.

### 3. Environment and adapter registry

Refactor `apps/backend/src/infrastructure/config/env.ts` and `apps/backend/.env.sample`:

- make `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `MINIMAX_API_KEY`, `QWEN_API_KEY`, and new `OPENROUTER_API_KEY` optional trimmed values;
- remove model and per-provider context-limit variables because the static deployment catalog owns those values;
- retain the shared timeout and the existing optional direct-provider base URLs;
- do not add an OpenRouter URL override because its endpoint is normative.

Refactor `apps/backend/src/infrastructure/llm/providerRegistry.ts` into a pure `createProviderRegistry(environment)` factory returning `Partial<Record<ProviderId, LlmProvider>>`. Register an adapter only when its credential is configured. MiniMax and Qwen direct adapters remain registrable extensions but have no initial catalog deployment. `server.ts` constructs the registry and catalog service once from the already parsed environment and injects both into orchestration/API dependencies.

### 4. Provider adapter contract and OpenRouter

Refactor the four existing adapters to consume the resolved deployment per call and send its exact `modelId`. When optional `maxOutputTokens` is absent, omit the provider-native output-limit field; when present, send the positive integer unchanged through:

- OpenAI Chat Completions: `max_completion_tokens`;
- Google GenerateContent: `generationConfig.maxOutputTokens`;
- MiniMax Chat Completion v2: `max_completion_tokens`;
- Qwen DashScope native request: `parameters.max_tokens`.

No adapter clamps, negotiates, discovers, substitutes, or retries a present value, and the output limit never participates in input context admission.

Add `apps/backend/src/infrastructure/llm/providers/OpenRouterProvider.ts`. It uses the fixed `POST https://openrouter.ai/api/v1/chat/completions` endpoint, Bearer `OPENROUTER_API_KEY`, exact catalog `modelId`, conditional `max_tokens`, normalized messages, the existing Axios timeout/abort behavior, and exactly one request per attempt. It omits `max_tokens` when `maxOutputTokens` is absent and sends the value unchanged when present. It maps usage to the three existing normalized token metrics and discards all other upstream metadata.

OpenRouter error classification is closed and structural: 401 → `authentication`; 429 → `rate_limited`; 408/502/503 → `provider_transient_error`; 402 → `provider_error`; `content_blocked` only when `error.metadata.error_type` is `content_policy_violation` or `refusal`, or when a 403 has a non-empty `error.metadata.reasons` or `error.metadata.patterns` array. Every other 403 is `provider_error`. No message-text matching, upstream metadata retention, header/body exposure, negotiation, fallback, or automatic retry is permitted. Any provider rejection of a present output limit becomes non-recoverable `provider_error` through its normal status classification.

The internal adapter contract is fixed in [contracts/provider-adapter.md](./contracts/provider-adapter.md).

### 5. Persistence and migration

Add `db/changelogs/conversations/002-create-conversation-deployments.sql` and include it from `db.changelog-conversations.xml`. It creates `conversation_deployments` with one immutable row per conversation/slot, primary key `(conversation_id, slot)`, unique `(conversation_id, deployment_id)`, a required positive context limit, a nullable output limit constrained positive when present, non-empty modality arrays, a cascade foreign key to `conversations`, and a `BEFORE UPDATE` trigger that rejects updates. PostgreSQL `NULL` represents an absent `maxOutputTokens`. Deletes occur only through conversation cascade; `created_at` and `updated_at` are equal at insertion because rows never update.

Add `db/changelogs/messages/002-replace-response-slots.sql` and include it from `db.changelog-messages.xml`. It replaces `model_responses` slot, slot/role, and stale-consolidator checks with the four canonical identifiers. It performs no row conversion or backfill; application on a non-clean database containing old slot values is intentionally unsupported by this feature.

Refactor repository mappers and queries to use canonical order. `ConversationRepository.createConversation` receives four resolved snapshots and, in one transaction, inserts the conversation, four snapshots, the first turn, and four response rows before service code launches any provider. The database unique constraint is the final atomic duplicate guard. `createTurn` reads the stored snapshots inside its transaction and derives response rows from them; it never receives catalog-derived response definitions. Conversation detail/snapshot reads join the stored deployment snapshots and expose only the four public fields through REST.

Existing `model_responses.provider` and `model_responses.model` remain as per-attempt attribution copied from the immutable snapshot; no additional deployment catalog lookup is introduced. Retry and recovery queries replace hard-coded `qwen` checks with `consolidator` while preserving the existing status, staleness, recoverability, and one-active-turn rules.

The complete schema and lifecycle are fixed in [data-model.md](./data-model.md).

### 6. Conversation service, orchestration, and context

Extend the strict creation Zod schema with optional `deploymentIds`, requiring exactly the four canonical keys when present. Other request schemas remain strict and therefore cannot accept deployment changes.

`ConversationService.createConversation` resolves the explicit or default assignment before repository insertion. It maps resolution failures to safe typed API errors, passes the resolved snapshots into the creation transaction, then launches the committed turn. Idempotent replay returns the originally persisted assignment and never mutates it. Subsequent turns, retry, recovery, rename, and delete accept no deployment assignment.

Refactor `TurnOrchestrator` to keep `BASE_SLOTS = ['base-1', 'base-2', 'base-3']`, run them concurrently, then run `consolidator`. For each slot it selects the stored deployment snapshot, resolves its adapter by `providerId`, builds context using snapshot limits plus adapter measurement, and invokes the adapter once. It must not branch by provider name or query the catalog. Consolidation receives only current normalized base responses and its existing isolated history.

Refactor `ContextBuilder`, `ContextRepository`, `turnState`, mappers, publisher/recovery paths, fakes, and acceptance utilities to canonical slots. Preserve the current threshold ratio, bounded historical window, truncation marker, no-persisted-prompt rule, recovery matrix, event ordering, and normalized observability fields. `maxOutputTokens` never participates in input admission or local truncation. The immutable snapshot preserves whether the limit was delegated, but a provider default can change externally, so an absent value does not guarantee exact output-limit reproducibility.

### 7. REST and SSE contracts

[contracts/openapi.yaml](./contracts/openapi.yaml) defines:

- `GET /api/v1/model-catalog` → `{ items: DeploymentCatalogItem[] }`, available only and sorted by `displayName`;
- `POST /api/v1/conversations` → existing `clientRequestId` and `prompt` plus optional strict `deploymentIds` map;
- `GET /api/v1/conversations/{conversationId}` and creation response → four ordered public deployment summaries containing `slot`, `deploymentId`, `providerId`, `modelId`, and `displayName`;
- safe 422 and 503 errors, including `missingDeploymentIds` only for `DEFAULT_PROFILE_UNAVAILABLE`.

All turn, retry, continue-without, recovery, and SSE payloads use only canonical slots. No endpoint other than conversation creation accepts `deploymentIds`.

### 8. Frontend behavior

Refactor frontend conversation/SSE types and Zod response schemas to the canonical tuple order and new catalog/detail DTOs. Add a catalog API function, React Query key, and query used only by the new-conversation draft. Validate every catalog/detail response before use.

Add the Shadcn select primitive centrally to `packages/ui/src/components/select.tsx`. Add an application-specific `DeploymentSelectors.tsx` under the conversations feature. It renders four labeled selectors, each showing `displayName` and `providerId`, permits any available deployment for any slot, rejects duplicates locally, and has explicit loading, empty, error, invalid, and disabled states. When all four exact defaults are available, preselect them; otherwise start with no complete profile and require four explicit distinct choices. Modalities are display metadata only and do not add input controls.

Keep `PromptComposer` text-only. It receives `deploymentIds` only when creating a new conversation; continuation payloads remain unchanged. After creation or when reopening history, render an immutable assignment summary and use the stored `displayName` with logical slot labels in response tabs. No replacement control is rendered.

### 9. Test strategy and ownership

**Unit and adapter contract tests — `unit-test-runner`**

- catalog exactness: ten definitions, exact models/context limits/modalities, absent initial output limits, stable sort, availability filter, defaults, duplicates, and unavailable IDs;
- strict backend/frontend schemas and rejection of all old slot names;
- canonical tuple ordering, slot/role state calculation, mapper behavior, ContextBuilder snapshot limits, and no provider call on oversized minimum payload;
- contract suite for all five adapters covering exact model, omission of the native output-limit field when absent, unchanged forwarding when present, one request, abort/timeout, normalized content and three metrics, safe error shape, no retries, and output-limit rejection;
- OpenRouter 403 table using only the specified structured fields, including negative free-text cases;
- frontend selector/default/duplicate/read-only states and catalog/detail response validation.

**Browserless integration tests — `integration-test-runner`**

- Liquibase update on a clean PostgreSQL database, canonical constraints, snapshot PK/unique/FK/checks, update trigger, and absence of backfill;
- catalog endpoint under credential combinations without leaking credential names or reasons;
- explicit/default conversation creation, safe 422/503 errors, duplicate rollback, zero provider calls on rejection, exact persisted snapshots, and idempotent replay preservation;
- later turns and retries after changing the in-memory catalog/configuration still use persisted snapshots;
- canonical REST/SSE/recovery/continue-without paths and unchanged recovery/staleness behavior;
- frontend query/cache/workspace boundary with catalog loading and immutable detail data.

**Full-browser E2E — `e2e-test-runner`**

- default selectors and successful text-only creation;
- arbitrary mixed-provider selection across all four slots;
- duplicate selection blocked before submission;
- unavailable/default-missing UI states with explicit selection path;
- reload/reopen shows the immutable assignment, canonical tab labels, and no replacement control;
- existing retry, continuation, history, and SSE journeys run with canonical slots through deterministic fake adapters and the disposable test database.

No performance test task is required: the catalog is a fixed ten-row in-memory read and the execution call count is already a functional contract. No real provider or paid API is called by any test.

## AI Sub-agent Delivery Workflow

`/speckit-tasks` must assign exactly one owner per task and keep production, audit, and test work separate:

1. `backend-builder` owns backend types, static catalog, config/registry, REST services/controllers/routes, adapters, orchestration, repositories, and Liquibase production migrations (`BE`/`DB`). It may run focused production build/typecheck only, never tests.
2. `backend-auditor` performs a read-only review of the completed backend/database diff, focusing on layering, transaction boundaries, secret safety, provider neutrality, migration determinism, and absence of aliases/fallbacks.
3. `frontend-builder` owns the shared Shadcn select primitive and frontend application types, queries, selectors, immutable summary, and logical response labels (`FE`/`UI`). It may run focused typecheck/lint only, never tests.
4. `frontend-auditor` performs a read-only review of frontend boundaries, accessibility states, response validation, and the text-only restriction.
5. `unit-test-runner` owns all isolated unit and provider contract tests (`UNIT`) after the relevant builder seams exist.
6. `integration-test-runner` owns PostgreSQL/Liquibase, backend HTTP/SSE, repository/service, and frontend provider/cache integration tests (`INTEGRATION`) after both production sides stabilize.
7. `e2e-test-runner` owns Playwright journeys and deterministic E2E fixtures (`E2E`) after integration gates pass.

Independent backend and frontend production work may run in parallel only after the REST contract and canonical types in this plan are fixed. Database/catalog/orchestration tasks stay grouped under one backend builder because they overlap transaction and type boundaries. Testing follows its production dependency; auditors review diffs and never reimplement. There is no `UX` task: the installed `.codex/agents/product-ux.toml` is an evidence-evaluation agent, not the required `product-designer`, and this plan requires no separate UX research deliverable.

Before the first JavaScript/TypeScript validation block, the coordinator resolves Node and pnpm once and provides owners the root-based commands. Focused Vitest invocations must use `pnpm --filter <workspace> run test --run <relative-test-path>`. Owners report only task IDs, changed files, exact validation/result, decisions, and real blockers. At implementation end, the coordinator performs the single mandatory final sub-agent shutdown check.

## Project Structure

### Documentation (this feature)

```text
specs/002-configurable-provider-deployments/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── requirements-brief.md
├── spec.md
├── checklists/
│   └── requirements.md
└── contracts/
    ├── openapi.yaml
    └── provider-adapter.md
```

### Source Code (repository root)

```text
apps/
├── backend/
│   ├── .env.sample
│   └── src/
│       ├── controllers/{conversations/conversationController,modelCatalogController}.ts
│       ├── routes/{apiRouter,modelCatalogRoutes}.ts
│       ├── routes/conversations/conversationRoutes.ts
│       ├── middleware/validation/conversationSchemas.ts
│       ├── services/conversations/{ConversationService,TurnOrchestrator,ContextBuilder,turnState,recoverInterruptedTurns}.ts
│       ├── services/llm/{ModelCatalogService,llmErrors}.ts
│       ├── infrastructure/config/env.ts
│       ├── infrastructure/llm/{deploymentCatalog,providerRegistry}.ts
│       ├── infrastructure/llm/providers/{OpenAi,Google,MiniMax,Qwen,OpenRouter}Provider.ts
│       ├── infrastructure/postgres/mappers/conversationMapper.ts
│       ├── infrastructure/postgres/repositories/{conversation,context,turn}Repository.ts
│       └── types/{conversations,llm,sse,apiError}.ts
└── frontend/src/features/conversations/
    ├── api/conversationsApi.ts
    ├── hooks/{useConversationQueries,useConversationExecution}.ts
    ├── queries/conversation-keys.ts
    ├── schemas/conversationSchemas.ts
    ├── types/{conversation,sse}.ts
    └── components/{ConversationWorkspace,PromptComposer,ResponseTabs,ResponsePanel,DeploymentSelectors,ConversationDeploymentSummary}.tsx
packages/ui/src/components/select.tsx
db/changelogs/
├── db.changelog-master.xml
├── conversations/{db.changelog-conversations.xml,002-create-conversation-deployments.sql}
└── messages/{db.changelog-messages.xml,002-replace-response-slots.sql}
```

**Structure Decision**: Extend the existing conversations feature, LLM infrastructure, and two owning Liquibase modules. Add only the catalog service/route/controller, deployment catalog, OpenRouter adapter, two focused UI components, one shared select primitive, and two migrations. Do not add a new package, ORM, repository abstraction, discovery service, compatibility layer, or state framework.

## Complexity Tracking

No constitutional violations or approved complexity exceptions.

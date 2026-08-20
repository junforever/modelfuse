# Tasks: Configurable Provider Deployments

**Input**: Design documents from `specs/002-configurable-provider-deployments/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/openapi.yaml`, `contracts/provider-adapter.md`, `quickstart.md`

**Tests**: Unit, provider-contract, integration, and E2E coverage are required. Builders modify production code and testability seams only; specialized test runners exclusively author, modify, and execute tests. Functional integration tasks start only after their backend/frontend production dependencies are complete; the Foundational T017 fixture-only migration is the sole exception and does not start the application, PostgreSQL, or a product journey.

**Organization**: Tasks are grouped by User Story in specification order. Blocking cross-story contracts, provider infrastructure, catalog availability, and migrations live in Foundational because US1–US5 cannot be implemented safely without them.

## Format: `[ID] [P?] [Story?] [Domain] Description`

- **[P]**: Safe to execute in parallel after its declared dependencies because it touches different files and does not depend on another incomplete task.
- **[Story]**: `[US1]` through `[US7]` only inside User Story phases.
- **[Domain] / owner**:
  - `BE` → `backend-builder`
  - `DB` → `backend-builder`
  - `FE` → `frontend-builder`
  - `UI` → `frontend-builder`
  - `UNIT` → `unit-test-runner`
  - `INTEGRATION` → `integration-test-runner`
  - `E2E` → `e2e-test-runner`
  - `BE-AUDIT` → `backend-auditor`
  - `FE-AUDIT` → `frontend-auditor`
- No `UX`, `PERF`, SDK-installation, ORM, remote-discovery, alias, backfill, fallback, provider-retry, economic-metric, multimedia-composer, or speculative-abstraction task belongs to this feature.

Before the first JavaScript/TypeScript validation block, the coordinator resolves the exact Node and pnpm executables once and supplies those absolute paths to every owner. Focused Vitest commands must run from the repository root as `pnpm --filter <workspace> run test --run <relative-test-path>`.

---

## Phase 1: Setup

**Purpose**: Prepare the existing monorepo surfaces without adding dependencies or creating new packages.

- [ ] T001 [BE] Update the safe configuration example in `apps/backend/.env.sample` to list optional `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `MINIMAX_API_KEY`, `QWEN_API_KEY`, and `OPENROUTER_API_KEY`, remove provider model/context variables, retain existing direct-provider URL/timeout variables, and add no OpenRouter URL override (validated by T018)
- [ ] T002 [P] [UI] Add the existing-stack Shadcn/Base UI Select primitive in `packages/ui/src/components/select.tsx`, using the package wildcard export already declared in `packages/ui/package.json`, with keyboard, focus, disabled, and accessible labeling behavior and no new dependency (validated by T019 and T063)

**Checkpoint**: Environment documentation and the application-agnostic UI primitive are ready; no product behavior has been wired.

---

## Phase 2: Foundational — Blocking Contracts, Catalog, Registry, and Schema

**Purpose**: Establish every shared contract and persistence boundary before User Story implementation.

**Critical gate**: T003–T019 must complete before any User Story phase starts. T013 and T014 must exist before repository snapshot work; T008–T010 must complete before orchestration work.

- [ ] T003 [BE] Replace provider-named slots with the closed ordered set `base-1`, `base-2`, `base-3`, `consolidator`, update base/consolidator role and tuple typing, and add deployment/assignment/snapshot/public-summary types in `apps/backend/src/types/conversations.ts` and canonical SSE references in `apps/backend/src/types/sse.ts`, with no aliases for `openai`, `google`, `minimax`, or `qwen` (validated by T018 and T028)
- [ ] T004 [P] [FE] Mirror the canonical slots, ordered response tuple, provider/deployment/catalog/assignment/detail types, and strict response schemas in `apps/frontend/src/features/conversations/types/conversation.ts`, `apps/frontend/src/features/conversations/types/sse.ts`, and `apps/frontend/src/features/conversations/schemas/conversationSchemas.ts`, rejecting all old slot identifiers (validated by T018 and T029)
- [ ] T005 [BE] Refactor `LlmProvider`, `LlmRequest`, provider registry types, and immutable deployment input in `apps/backend/src/types/llm.ts` to match `contracts/provider-adapter.md`, keeping only normalized content, timing, `inputTokens`, `outputTokens`, and `totalTokens` behavior (depends on T003; validated by T054)
- [ ] T006 [P] [BE] Add the readonly catalog constant with exactly the ten normative definitions, exact credentials, model IDs, `contextLimitTokens`, approved `maxOutputTokens`, and modality arrays in `apps/backend/src/infrastructure/llm/deploymentCatalog.ts`; add no variants, prices, URLs, discovery, aliases, MiniMax-direct entries, or Qwen-direct entries (depends on T003; validated by T018 and T037)
- [ ] T007 [BE] Make all five provider credentials optional trimmed values, remove model/context environment variables, retain timeout and existing direct-provider base URLs, and expose no raw secret outside the validated boundary in `apps/backend/src/infrastructure/config/env.ts` (depends on T001; validated by T018, T037, and T039)
- [ ] T008 [BE] Refactor `apps/backend/src/infrastructure/llm/providers/OpenAiProvider.ts`, `apps/backend/src/infrastructure/llm/providers/GoogleProvider.ts`, `apps/backend/src/infrastructure/llm/providers/MiniMaxProvider.ts`, and `apps/backend/src/infrastructure/llm/providers/QwenProvider.ts` to consume the resolved deployment per call, send its exact `modelId`, and send unchanged `maxOutputTokens` through `max_completion_tokens`, `generationConfig.maxOutputTokens`, `max_completion_tokens`, and `parameters.max_tokens` respectively, preserving each native protocol and disabling adjustment/retry (depends on T005 and T007; validated by T054)
- [ ] T009 [P] [BE] Implement `apps/backend/src/infrastructure/llm/providers/OpenRouterProvider.ts` with the fixed chat-completions endpoint, Bearer credential, exact snapshot model, exact `max_tokens`, normalized messages/token metrics, existing abort/timeout semantics, and one external call per attempt, without fallback, retry, billing, cost, credit, budget, or upstream-payload exposure (depends on T005 and T007; validated by T054 and T059)
- [ ] T010 [BE] Refactor `apps/backend/src/infrastructure/llm/providerRegistry.ts` into a pure optional `providerId` registry factory that creates only credential-backed adapters and retains direct MiniMax/Qwen registrations without catalog entries (depends on T008 and T009; validated by T018 and T054)
- [ ] T011 [BE] Add `apps/backend/src/services/llm/ModelCatalogService.ts` with immutable catalog indexing, safe available-item projection, `displayName` ordering, and exact ID lookup against adapters present in the registry; do not resolve defaults or duplicates in this foundational task (depends on T006 and T010; validated by T018 and T037)
- [ ] T012 [BE] Add the thin catalog HTTP boundary in `apps/backend/src/controllers/modelCatalogController.ts` and `apps/backend/src/routes/modelCatalogRoutes.ts`, mount `GET /api/v1/model-catalog` from `apps/backend/src/routes/apiRouter.ts`, and return only the OpenAPI safe envelope `{ items }` (depends on T011; validated by T037 and T039)
- [ ] T013 [P] [DB] Create `db/changelogs/conversations/002-create-conversation-deployments.sql` and include it from `db/changelogs/conversations/db.changelog-conversations.xml`, defining the four-slot snapshot table, composite primary key, per-conversation deployment uniqueness, positive/non-blank/non-empty checks, cascade FK, equal insert timestamps, and update-rejection trigger exactly as `data-model.md` specifies (depends on T003; validated by T048 and T065)
- [ ] T014 [P] [DB] Create `db/changelogs/messages/002-replace-response-slots.sql` and include it from `db/changelogs/messages/db.changelog-messages.xml`, replacing slot, role, and stale-response checks with canonical values only and performing no row update, alias, backfill, or conversion (depends on T003; validated by T048 and T065)
- [ ] T015 [BE] Construct the provider registry and catalog service exactly once from parsed environment configuration in `apps/backend/src/server.ts`; pass them as `ApiDependencies` through `apps/backend/src/app.ts` and `apps/backend/src/routes/apiRouter.ts` without constructing them there or reading process-global configuration in services/controllers (depends on T010–T012; validated by T018 and T039)

### Shared test fixtures and acceptance utilities

- [ ] T016 [UNIT] Migrate the shared backend and frontend unit fixtures from the old provider-named slots to `base-1`, `base-2`, `base-3`, and `consolidator` in `apps/backend/src/test/fakes/fakeLlmProvider.ts`, `apps/backend/src/test/fakes/__tests__/fakeLlmProvider.test.ts`, `apps/backend/src/test/fixtures/conversationFixtures.ts`, and `apps/frontend/src/test/conversation-fixtures.ts`; preserve deterministic results, provider/model attribution, error overrides, canonical role semantics, and frontend response/SSE fixture shape (depends on T003, T004, and T005; validated by the focused tests in the same paths)
- [ ] T017 [INTEGRATION] Migrate the browserless integration and acceptance utilities plus the consolidation fixture from the old provider-named slots to canonical slots in `apps/backend/src/test/integration/controlledLlmProviders.ts`, `apps/backend/src/test/integration/createIntegrationBackend.ts`, `apps/backend/src/acceptance/terminalStates.acceptance.test.ts`, `apps/backend/src/acceptance/latency.acceptance.test.ts`, `apps/backend/src/acceptance/consolidationEvaluation.ts`, and `apps/backend/src/services/conversations/__tests__/fixtures/consolidation-evaluation.json`; preserve canonical imports, deterministic provider control, terminal-state assertions, latency/acceptance thresholds, and consolidator behavior; add and execute only the fixture-only smoke test `apps/backend/src/test/integration/__tests__/canonicalFixtures.test.ts` with `pnpm --filter backend run test --run src/test/integration/__tests__/canonicalFixtures.test.ts`, without starting the application, PostgreSQL, or any acceptance journey (depends on T016; full terminal/latency/consolidation acceptance runs only in T065)

**Fixture gate**: T016 and T017 must pass before T018–T070. No E2E owner modifies these shared backend UNIT/INTEGRATION fixtures.

- [ ] T018 [UNIT] Add and execute structural smoke tests for canonical types, optional-environment parsing shape, provider-registry construction shape, strict frontend schemas, and rejection of every old slot identifier in `apps/backend/src/infrastructure/config/__tests__/env.test.ts`, `apps/backend/src/infrastructure/llm/__tests__/providerRegistry.test.ts`, and `apps/frontend/src/features/conversations/__tests__/conversationSchemas.test.ts` after T003–T017; leave exact catalog values, availability filtering, and safe-projection assertions to T037
- [ ] T019 [P] [UNIT] Inspect the installed Base UI Select DOM first, then add and execute stable observable keyboard/label/focus/disabled tests without asserting dependency-private attributes in `apps/frontend/src/test/ui-primitives.test.tsx` after T002 and T016–T017

**Checkpoint**: Contracts, adapters, catalog availability, optional configuration, REST catalog surface, and clean-database migrations are fixed. User Story product work may begin.

---

## Phase 3: User Story 1 — Elegir deployments al crear una conversación (Priority: P1) 🎯 MVP

**Goal**: Create a conversation using four explicit, distinct, available deployments assigned to the canonical slots, return the persisted assignment, and start the first turn through canonical orchestration.

**Independent Test**: With a deterministic available catalog, submit four different deployment IDs including direct and OpenRouter-backed entries, assert the exact four ordered persisted summaries in creation/detail, and observe the first turn start with those assignments.

- [ ] T020 [US1] [BE] Extend the strict creation request and response contracts with the exact optional four-key `deploymentIds` object and canonical ordered deployment summaries in `apps/backend/src/middleware/validation/conversationSchemas.ts`, `apps/backend/src/types/conversations.ts`, and `apps/backend/src/types/apiError.ts`, rejecting missing/extra/empty/null keys and every old slot (depends on T003; validated by T028 and T030)
- [ ] T021 [US1] [BE] Extend `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts` and `apps/backend/src/infrastructure/postgres/mappers/conversationMapper.ts` so new-conversation creation inserts the conversation, four complete snapshots, first turn, and four attributed response rows in one transaction and creation/detail reads return summaries in canonical order (depends on T013, T014, and T020; validated by T028 and T030)
- [ ] T022 [US1] [BE] Add explicit-assignment resolution to `apps/backend/src/services/llm/ModelCatalogService.ts` and wire it into `apps/backend/src/services/conversations/ConversationService.ts`, resolving only current available definitions before the transaction and launching provider work only after commit (depends on T011, T020, and T021; validated by T028 and T030)
- [ ] T023 [US1] [BE] Refactor `apps/backend/src/services/conversations/TurnOrchestrator.ts` to run `base-1`/`base-2`/`base-3` concurrently and `consolidator` afterward, choose the persisted snapshot by slot and adapter by `providerId`, and invoke the normalized adapter once without provider-name branches or catalog lookup (depends on T008–T010 and T021–T022; validated by T028, T030, T054, and T055)
- [ ] T024 [US1] [BE] Update `apps/backend/src/controllers/conversations/conversationController.ts` and `apps/backend/src/routes/conversations/conversationRoutes.ts` so creation/detail match `contracts/openapi.yaml`, expose only stored public assignment fields, and map invalid/unavailable selections to safe 422 errors (depends on T022 and T023; validated by T030)
- [ ] T025 [P] [US1] [FE] Add catalog/detail/create request validation, API calls, query keys, and draft query wiring in `apps/frontend/src/features/conversations/api/conversationsApi.ts`, `apps/frontend/src/features/conversations/queries/conversation-keys.ts`, and `apps/frontend/src/features/conversations/hooks/useConversationQueries.ts` (depends on T004 and T012; validated by T029 and T030)
- [ ] T026 [US1] [FE] Implement the four application-owned selectors showing `displayName` plus `providerId`, permitting any available item in any slot, and exposing loading/selection/disabled semantics in `apps/frontend/src/features/conversations/components/DeploymentSelectors.tsx` using only the shared primitive from T002 (depends on T002 and T025; validated by T029)
- [ ] T027 [US1] [FE] Integrate catalog selection into new-conversation state and submit `deploymentIds` only on creation in `apps/frontend/src/features/conversations/components/ConversationWorkspace.tsx`, `apps/frontend/src/features/conversations/hooks/useConversationExecution.ts`, and `apps/frontend/src/features/conversations/components/PromptComposer.tsx`, preserving a text-only prompt and unchanged continuation payloads (depends on T026; validated by T029 and T030)
- [ ] T028 [US1] [UNIT] Add and execute focused backend tests for strict assignment shape, unavailable/unknown IDs, transaction inputs, canonical orchestration order, provider-neutral dispatch, public mapper ordering, and zero provider calls before commit in `apps/backend/src/middleware/validation/__tests__/conversationSchemas.test.ts`, `apps/backend/src/services/llm/__tests__/ModelCatalogService.test.ts`, `apps/backend/src/services/conversations/__tests__/ConversationService.test.ts`, `apps/backend/src/services/conversations/__tests__/TurnOrchestrator.test.ts`, and `apps/backend/src/infrastructure/postgres/mappers/__tests__/conversationMapper.test.ts` after T020–T024
- [ ] T029 [P] [US1] [UNIT] Add and execute focused frontend tests for catalog/schema validation, arbitrary four-slot selection, labels, create-only payload, canonical response tabs, and text-only composer behavior in `apps/frontend/src/features/conversations/__tests__/conversationSchemas.test.ts`, `apps/frontend/src/features/conversations/api/__tests__/conversationsApi.test.ts`, `apps/frontend/src/features/conversations/components/__tests__/DeploymentSelectors.test.tsx`, `apps/frontend/src/features/conversations/__tests__/new-conversation-draft.test.tsx`, and `apps/frontend/src/features/conversations/components/__tests__/PromptComposer.test.tsx` after T025–T027
- [ ] T030 [US1] [INTEGRATION] Add and execute browserless explicit-creation coverage with PostgreSQL, Supertest, deterministic fake adapters, and frontend query/cache boundaries in `apps/backend/src/routes/conversations/__tests__/conversationCreation.integration.test.ts`, `apps/backend/src/infrastructure/postgres/repositories/__tests__/conversationDeployments.integration.test.ts`, and `apps/frontend/src/features/conversations/__tests__/deployment-catalog.integration.test.tsx`, asserting atomic snapshots, exact creation/detail summaries, canonical first-turn rows, and no paid-provider network calls after T028 and T029

**Checkpoint**: US1 is independently functional and testable as the MVP.

---

## Phase 4: User Story 2 — Crear con el perfil por defecto (Priority: P1)

**Goal**: Apply the exact four-deployment default when available and return a safe 503 with only missing deployment IDs when it is not.

**Independent Test**: Omit `deploymentIds` with all required credentials and verify the exact four defaults; repeat with one required provider absent and verify `503 DEFAULT_PROFILE_UNAVAILABLE` without rows or provider calls.

- [ ] T031 [US2] [BE] Implement the exact all-or-nothing default profile and `DEFAULT_PROFILE_UNAVAILABLE` result with only safe message/request ID/missing deployment IDs in `apps/backend/src/services/llm/ModelCatalogService.ts`, `apps/backend/src/services/conversations/ConversationService.ts`, and `apps/backend/src/services/conversations/conversationErrors.ts` (depends on T022; validated by T033 and T035)
- [ ] T032 [P] [US2] [FE] Preselect exactly `openai-5.6-sol`, `gemini-3.7-flash`, `openrouter-minimax-m3`, and `openrouter-qwen-3.8-max` only when all four are present; otherwise leave no complete default and require explicit choices in `apps/frontend/src/features/conversations/components/DeploymentSelectors.tsx` and `apps/frontend/src/features/conversations/components/ConversationWorkspace.tsx` (depends on T026; validated by T034 and T035)
- [ ] T033 [US2] [UNIT] Add and execute backend tests for exact defaults, all missing-ID combinations, safe error projection, and zero writes/provider calls on default failure in `apps/backend/src/services/llm/__tests__/ModelCatalogService.test.ts` and `apps/backend/src/services/conversations/__tests__/ConversationService.test.ts` after T031; test idempotent replay preservation only in T046/T048 after snapshot replay implementation
- [ ] T034 [P] [US2] [UNIT] Add and execute frontend tests for complete-default preselection and incomplete-default explicit-selection behavior in `apps/frontend/src/features/conversations/components/__tests__/DeploymentSelectors.test.tsx` and `apps/frontend/src/features/conversations/__tests__/new-conversation-draft.test.tsx` after T032
- [ ] T035 [US2] [INTEGRATION] Add and execute default-profile creation and safe 503 integration cases in `apps/backend/src/routes/conversations/__tests__/conversationCreation.integration.test.ts` and `apps/frontend/src/features/conversations/__tests__/deployment-catalog.integration.test.tsx`, asserting exact persisted defaults, rollback, missing IDs, and zero provider calls after T033 and T034

**Checkpoint**: US2 works independently without weakening explicit US1 selection.

---

## Phase 5: User Story 3 — Consultar solo deployments disponibles (Priority: P1)

**Goal**: Show exactly the static deployments whose optional provider credential is configured, sorted safely, while allowing backend startup with any optional credential absent.

**Independent Test**: Query the catalog under multiple credential combinations and verify exact rows/order/modalities, omission of unavailable providers, safe fields only, and 422 for direct selection of an unavailable ID.

- [ ] T036 [US3] [FE] Complete explicit catalog loading, empty, error, unavailable-default, and existing-React-Query retry states without exposing internal availability reasons; use only the retry behavior already provided by React Query and add no new retry state machine or business logic in `apps/frontend/src/features/conversations/components/DeploymentSelectors.tsx` and `apps/frontend/src/features/conversations/components/ConversationWorkspace.tsx` (depends on T032; validated by T038 and T039)
- [ ] T037 [US3] [UNIT] Add and execute exhaustive backend catalog/config tests for exactly ten definitions, exact limits/modalities/models, stable `displayName` sorting, provider-based omission, no secret/credential/reason/economic fields, optional startup credentials, and direct MiniMax/Qwen registry availability without catalog rows in `apps/backend/src/infrastructure/llm/__tests__/deploymentCatalog.test.ts`, `apps/backend/src/services/llm/__tests__/ModelCatalogService.test.ts`, and `apps/backend/src/infrastructure/config/__tests__/env.test.ts` after T011–T015
- [ ] T038 [P] [US3] [UNIT] Add and execute frontend loading/empty/error/existing-React-Query-retry and unavailable-default state tests, asserting that retry delegates to the existing React Query mechanism and introduces no new business logic, in `apps/frontend/src/features/conversations/components/__tests__/DeploymentSelectors.test.tsx` and `apps/frontend/src/features/conversations/__tests__/new-conversation-draft.test.tsx` after T036
- [ ] T039 [US3] [INTEGRATION] Add and execute `GET /api/v1/model-catalog`, optional-startup, and unavailable-selection cases across credential combinations in `apps/backend/src/routes/__tests__/modelCatalog.integration.test.ts` and `apps/backend/src/routes/conversations/__tests__/conversationCreation.integration.test.ts`, plus the frontend provider/cache boundary in `apps/frontend/src/features/conversations/__tests__/deployment-catalog.integration.test.tsx`, asserting safe output and `422 DEPLOYMENT_UNAVAILABLE` after T037 and T038

**Checkpoint**: US3 independently proves static, credential-derived availability with no remote discovery.

---

## Phase 6: User Story 4 — Conservar la asignación durante toda la conversación (Priority: P1)

**Goal**: Keep the four persisted snapshots immutable and authoritative for every later turn, retry, recovery, REST detail, SSE event, rename, and deletion lifecycle.

**Independent Test**: Create a conversation, alter in-memory catalog/configuration, then continue/retry/recover and verify every operation still uses the original snapshots while the UI remains read-only.

- [ ] T040 [US4] [BE] Refactor later-turn and replay persistence in `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts` so each turn locks/reads the four stored snapshots, derives response attribution from them, commits before execution, and returns the original assignment on idempotent replay without catalog re-resolution (depends on T021; validated by T046 and T048)
- [ ] T041 [US4] [BE] Update `apps/backend/src/services/conversations/ConversationService.ts` and `apps/backend/src/middleware/validation/conversationSchemas.ts` so continuation, retry, continue-without, recovery, rename, and delete never accept `deploymentIds` and always pass repository snapshots into execution (depends on T040; validated by T046 and T048)
- [ ] T042 [US4] [BE] Replace every old-slot assumption with canonical slot/role/staleness behavior while preserving existing recovery rules in `apps/backend/src/services/conversations/turnState.ts`, `apps/backend/src/services/conversations/recoverInterruptedTurns.ts`, `apps/backend/src/infrastructure/postgres/mappers/conversationMapper.ts`, and the affected repository queries under `apps/backend/src/infrastructure/postgres/repositories/` (depends on T040; validated by T046 and T048)
- [ ] T043 [P] [US4] [BE] Update canonical SSE publication and recovery event payloads in `apps/backend/src/services/conversations/turnEventPublisher.ts`, `apps/backend/src/controllers/conversations/turnEventsController.ts`, and `apps/backend/src/types/sse.ts`, with no old-slot translation layer (depends on T003; validated by T046 and T048)
- [ ] T044 [US4] [FE] Add `apps/frontend/src/features/conversations/components/ConversationDeploymentSummary.tsx` and update `apps/frontend/src/features/conversations/components/ConversationWorkspace.tsx`, `apps/frontend/src/features/conversations/components/ResponseTabs.tsx`, and `apps/frontend/src/features/conversations/components/ResponsePanel.tsx` to render stored assignments read-only and label responses with canonical logical slot plus stored `displayName`, never a replacement control (depends on T004 and T025; validated by T047 and T048)
- [ ] T045 [US4] [FE] Update conversation history, continuation, retry, recovery, and SSE cache flows to preserve canonical snapshots in `apps/frontend/src/features/conversations/hooks/useTurnEvents.ts`, `apps/frontend/src/features/conversations/hooks/useConversationExecution.ts`, `apps/frontend/src/features/conversations/queries/conversation-cache.ts`, and `apps/frontend/src/features/conversations/types/sse.ts` (depends on T044; validated by T047 and T048)
- [ ] T046 [US4] [UNIT] Add and execute backend unit coverage for later-turn snapshot reuse, idempotent replay, canonical state/role/staleness, recovery state decisions, event ordering, and mapper output in `apps/backend/src/services/conversations/__tests__/ConversationService.test.ts`, `apps/backend/src/services/conversations/__tests__/turnState.test.ts`, `apps/backend/src/services/conversations/__tests__/turnEventPublisher.test.ts`, `apps/backend/src/infrastructure/postgres/mappers/__tests__/conversationMapper.test.ts`, and the shared recovery fixture `apps/backend/src/services/conversations/__tests__/fixtures/recoveryCases.ts` after T040–T043
- [ ] T047 [P] [US4] [UNIT] Add and execute frontend tests for immutable summaries, canonical display labels, reload/history preservation, continuation/retry payloads without assignment, and canonical SSE cache updates in `apps/frontend/src/features/conversations/__tests__/conversation-history.test.tsx`, `apps/frontend/src/features/conversations/__tests__/conversation-continuation.test.tsx`, `apps/frontend/src/features/conversations/__tests__/useTurnEvents.test.tsx`, `apps/frontend/src/features/conversations/components/__tests__/ResponsePanel.test.tsx`, and `apps/frontend/src/features/conversations/queries/__tests__/conversation-cache.test.ts` after T044 and T045
- [ ] T048 [US4] [INTEGRATION] Add and execute clean-PostgreSQL snapshot immutability, update-trigger, idempotency, catalog/config change, later-turn, retry, continue-without, recovery, history, management, and SSE cases in `apps/backend/src/infrastructure/postgres/repositories/__tests__/conversationDeployments.integration.test.ts`, `apps/backend/src/infrastructure/postgres/repositories/__tests__/conversationHistoryRepository.integration.test.ts`, `apps/backend/src/routes/conversations/__tests__/conversationContinuation.integration.test.ts`, `apps/backend/src/routes/conversations/__tests__/conversationManagement.integration.test.ts`, `apps/backend/src/routes/conversations/__tests__/responseActions.integration.test.ts`, `apps/backend/src/routes/conversations/__tests__/turnRecoverySse.integration.test.ts`, `apps/backend/src/routes/conversations/__tests__/turnEvents.integration.test.ts`, and `apps/backend/src/services/conversations/__tests__/recovery.integration.test.ts` after T046 and T047

**Checkpoint**: US4 proves that the conversation snapshot, not runtime catalog/configuration, owns execution for the conversation lifetime.

---

## Phase 7: User Story 5 — Impedir deployments duplicados (Priority: P1)

**Goal**: Reject a repeated `deploymentId` in UI, service, and database transaction while allowing distinct IDs from the same provider or underlying model.

**Independent Test**: Attempt duplicate selection in the browserless UI and direct API, then verify visible validation, 422, full rollback, and zero provider calls; verify distinct same-provider/model-route IDs remain valid.

- [ ] T049 [US5] [BE] Add duplicate-ID validation and named unique-constraint mapping to `422 DUPLICATE_DEPLOYMENT_ASSIGNMENT` in `apps/backend/src/services/llm/ModelCatalogService.ts`, `apps/backend/src/services/conversations/ConversationService.ts`, `apps/backend/src/services/conversations/conversationErrors.ts`, and `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts`, preserving full rollback and no provider launch (depends on T013 and T022; validated by T051 and T053)
- [ ] T050 [P] [US5] [FE] Detect repeated complete `deploymentId` values, show an accessible validation error, and block submission without restricting different IDs from the same provider/model in `apps/frontend/src/features/conversations/components/DeploymentSelectors.tsx` and `apps/frontend/src/features/conversations/components/ConversationWorkspace.tsx` (depends on T026; validated by T052 and T053)
- [ ] T051 [US5] [UNIT] Add and execute backend duplicate, same-provider, same-model-different-ID, named-constraint, rollback-input, and zero-provider-call tests in `apps/backend/src/services/llm/__tests__/ModelCatalogService.test.ts` and `apps/backend/src/services/conversations/__tests__/ConversationService.test.ts` after T049
- [ ] T052 [P] [US5] [UNIT] Add and execute frontend duplicate-error, blocked-submit, and distinct-ID acceptance tests in `apps/frontend/src/features/conversations/components/__tests__/DeploymentSelectors.test.tsx` and `apps/frontend/src/features/conversations/__tests__/new-conversation-draft.test.tsx` after T050
- [ ] T053 [US5] [INTEGRATION] Add and execute duplicate API/DB rollback and valid same-provider/model-route creation cases in `apps/backend/src/routes/conversations/__tests__/conversationCreation.integration.test.ts` and `apps/backend/src/infrastructure/postgres/repositories/__tests__/conversationDeployments.integration.test.ts`, asserting no partial rows and zero fake-provider calls after T051 and T052

**Checkpoint**: US5 enforces uniqueness consistently at all three boundaries.

---

## Phase 8: User Story 6 — Ejecutar deployments mediante adapters normalizados (Priority: P2)

**Goal**: Prove that all five adapters honor the provider-neutral contract, native request shape, exact output limit, normalized metrics, cancellation/timeout, and one-call/no-retry rule.

**Independent Test**: Run the shared adapter contract suite against the four direct adapters and OpenRouter, then run mixed-provider orchestration with deterministic transports and inspect normalized observable results.

The productive adapter and orchestration work is intentionally Foundational/US1 because catalog availability and explicit creation depend on it; this phase supplies the story-specific contract and cross-component proof without duplicating production code.

- [ ] T054 [US6] [UNIT] Extend `apps/backend/src/infrastructure/llm/providers/__tests__/providerContract.ts` and execute `apps/backend/src/infrastructure/llm/providers/__tests__/OpenAiProvider.test.ts`, `apps/backend/src/infrastructure/llm/providers/__tests__/GoogleProvider.test.ts`, `apps/backend/src/infrastructure/llm/providers/__tests__/MiniMaxProvider.test.ts`, `apps/backend/src/infrastructure/llm/providers/__tests__/QwenProvider.test.ts`, new `apps/backend/src/infrastructure/llm/providers/__tests__/OpenRouterProvider.test.ts`, and `apps/backend/src/infrastructure/llm/providers/__tests__/inputMeasurement.contract.test.ts`, proving arbitrary canonical slot use, exact snapshot model/output field, one call, normalized content/three token metrics, absent-metric behavior, abort, timeout, safe errors, non-recoverable output-limit rejection, and no fallback/reduction/negotiation/retry after T008–T010 and T023
- [ ] T055 [US6] [INTEGRATION] Add and execute mixed direct/OpenRouter provider-registry orchestration using deterministic transports in `apps/backend/src/services/conversations/__tests__/providerDeploymentExecution.integration.test.ts`, asserting provider-neutral dispatch, three-base-then-consolidator order, exact stored attribution, normalized metrics only, and one upstream call per attempt after T054

**Checkpoint**: US6 is complete without real or paid provider calls.

---

## Phase 9: User Story 7 — Aplicar límites de contexto y errores seguros (Priority: P2)

**Goal**: Enforce stored context limits before provider calls and apply the closed structural OpenRouter error matrix without leaking sensitive or economic data.

**Independent Test**: For every exact catalog limit, exceed the minimum admitted payload and verify no provider call; exercise every structured OpenRouter status/metadata case and negative free-text case and inspect logs/persistence/responses for prohibited data.

- [ ] T056 [US7] [BE] Refactor `apps/backend/src/services/conversations/ContextBuilder.ts`, `apps/backend/src/infrastructure/postgres/repositories/contextRepository.ts`, and `apps/backend/src/services/conversations/contextProtection.ts` to use each stored snapshot `contextLimitTokens` plus the existing ratio and adapter measurement, reject oversized minimum payloads before provider calls, exclude `maxOutputTokens` from input admission/truncation, and persist neither composed prompts nor token counts (depends on T040 and T054; validated by T058 and T060)
- [ ] T057 [P] [US7] [BE] Implement the closed OpenRouter structural error classifier and upstream-data discard in `apps/backend/src/infrastructure/llm/providers/OpenRouterProvider.ts`: 401 authentication, 429 rate-limited, 408/502/503 transient, 402 provider error, content blocked only for the specified `error.metadata.error_type` values or non-empty 403 reasons/patterns arrays, every other 403 provider error, and never free-text matching or economic fields (depends on T009; validated by T059 and T060)
- [ ] T058 [US7] [UNIT] Add and execute exact-limit, threshold, minimum-payload, snapshot-isolation, no-provider-call, no-output-limit-input-effect, and no-composed-prompt/token-persistence tests in `apps/backend/src/services/conversations/__tests__/ContextBuilder.test.ts`, `apps/backend/src/services/conversations/__tests__/contextProtection.test.ts`, and `apps/backend/src/services/conversations/__tests__/observabilitySafety.test.ts` after T056
- [ ] T059 [P] [US7] [UNIT] Add and execute the complete OpenRouter status/structured-metadata table, empty-array cases, free-text negative cases, safe-message assertions, metadata discard, exact output-limit rejection, and absence of billing/cost/credit/budget fields in `apps/backend/src/infrastructure/llm/providers/__tests__/OpenRouterProvider.test.ts` and `apps/backend/src/services/conversations/__tests__/observabilitySafety.test.ts` after T057
- [ ] T060 [US7] [INTEGRATION] Add and execute oversized-context/no-provider-call, repository-context isolation, management/history lifecycle, and safe OpenRouter failure propagation cases in `apps/backend/src/infrastructure/postgres/repositories/__tests__/contextRepository.integration.test.ts`, `apps/backend/src/infrastructure/postgres/repositories/__tests__/conversationHistoryRepository.integration.test.ts`, `apps/backend/src/routes/conversations/__tests__/conversationCreation.integration.test.ts`, `apps/backend/src/routes/conversations/__tests__/conversationContinuation.integration.test.ts`, `apps/backend/src/routes/conversations/__tests__/conversationManagement.integration.test.ts`, and `apps/backend/src/services/conversations/__tests__/observabilitySafety.integration.test.ts`, inspecting API, PostgreSQL, and captured logs for no secret, raw upstream, prompt, token-count, or economic persistence after T058 and T059

**Checkpoint**: US7 preserves context/recovery guarantees and closes all provider-error exposure paths.

---

## Phase 10: Cross-Cutting Build, Unit, and Integration Gates

**Purpose**: Validate the integrated production tree after the shared backend fixtures are migrated and before any Playwright E2E work.

- [ ] T061 [BE] Run the backend production build from the repository root with `pnpm --filter backend run build`, fix only production/type errors in `apps/backend/src/` or `db/changelogs/`, and do not modify or execute tests (depends on passing T016, T017, and T060)
- [ ] T062 [P] [FE] Run `pnpm --filter frontend run typecheck`, `pnpm --filter frontend run lint`, and `pnpm --filter frontend run build`, fixing only production errors in `apps/frontend/src/` and not modifying or executing tests (depends on passing T016, T017, and T060)
- [ ] T063 [P] [UI] Run `pnpm --filter @workspace/ui run typecheck` and `pnpm --filter @workspace/ui run lint`, fixing only production errors in `packages/ui/` and not modifying or executing tests (depends on passing T016, T017, and T060)
- [ ] T064 [UNIT] Execute once, after T061–T063, the complete impacted unit/contract set in `apps/backend/src/infrastructure/llm/__tests__/deploymentCatalog.test.ts`, `apps/backend/src/infrastructure/config/__tests__/env.test.ts`, `apps/backend/src/infrastructure/llm/__tests__/providerRegistry.test.ts`, `apps/backend/src/test/fakes/__tests__/fakeLlmProvider.test.ts`, `apps/backend/src/infrastructure/llm/providers/__tests__/OpenAiProvider.test.ts`, `apps/backend/src/infrastructure/llm/providers/__tests__/GoogleProvider.test.ts`, `apps/backend/src/infrastructure/llm/providers/__tests__/MiniMaxProvider.test.ts`, `apps/backend/src/infrastructure/llm/providers/__tests__/QwenProvider.test.ts`, `apps/backend/src/infrastructure/llm/providers/__tests__/OpenRouterProvider.test.ts`, `apps/backend/src/infrastructure/llm/providers/__tests__/inputMeasurement.contract.test.ts`, `apps/backend/src/middleware/validation/__tests__/conversationSchemas.test.ts`, `apps/backend/src/services/llm/__tests__/ModelCatalogService.test.ts`, `apps/backend/src/services/conversations/__tests__/ConversationService.test.ts`, `apps/backend/src/services/conversations/__tests__/TurnOrchestrator.test.ts`, `apps/backend/src/services/conversations/__tests__/ContextBuilder.test.ts`, `apps/backend/src/services/conversations/__tests__/contextProtection.test.ts`, `apps/backend/src/services/conversations/__tests__/turnState.test.ts`, `apps/backend/src/services/conversations/__tests__/turnEventPublisher.test.ts`, `apps/backend/src/services/conversations/__tests__/observabilitySafety.test.ts`, `apps/backend/src/infrastructure/postgres/mappers/__tests__/conversationMapper.test.ts`, `apps/frontend/src/features/conversations/__tests__/conversationSchemas.test.ts`, `apps/frontend/src/test/ui-primitives.test.tsx`, `apps/frontend/src/features/conversations/api/__tests__/conversationsApi.test.ts`, `apps/frontend/src/features/conversations/components/__tests__/DeploymentSelectors.test.tsx`, `apps/frontend/src/features/conversations/__tests__/new-conversation-draft.test.tsx`, `apps/frontend/src/features/conversations/components/__tests__/PromptComposer.test.tsx`, `apps/frontend/src/features/conversations/__tests__/conversation-history.test.tsx`, `apps/frontend/src/features/conversations/__tests__/conversation-continuation.test.tsx`, `apps/frontend/src/features/conversations/__tests__/useTurnEvents.test.tsx`, `apps/frontend/src/features/conversations/components/__tests__/ResponsePanel.test.tsx`, and `apps/frontend/src/features/conversations/queries/__tests__/conversation-cache.test.ts`, using only root workspace scripts; the adapter contract helper is covered indirectly by the adapter tests and is not invoked as a standalone test file; classify the first failure before changing code or command and record the complete executed file list and result
- [ ] T065 [INTEGRATION] Apply Liquibase to a clean disposable PostgreSQL database and execute once, after T061–T064, the complete impacted browserless integration set plus the fixture-only smoke in `apps/backend/src/test/integration/__tests__/canonicalFixtures.test.ts`, `apps/backend/src/infrastructure/postgres/repositories/__tests__/conversationDeployments.integration.test.ts`, `apps/backend/src/infrastructure/postgres/repositories/__tests__/conversationHistoryRepository.integration.test.ts`, `apps/backend/src/infrastructure/postgres/repositories/__tests__/contextRepository.integration.test.ts`, `apps/backend/src/routes/__tests__/modelCatalog.integration.test.ts`, `apps/backend/src/routes/conversations/__tests__/conversationCreation.integration.test.ts`, `apps/backend/src/routes/conversations/__tests__/conversationContinuation.integration.test.ts`, `apps/backend/src/routes/conversations/__tests__/conversationManagement.integration.test.ts`, `apps/backend/src/routes/conversations/__tests__/responseActions.integration.test.ts`, `apps/backend/src/routes/conversations/__tests__/turnRecoverySse.integration.test.ts`, `apps/backend/src/routes/conversations/__tests__/turnEvents.integration.test.ts`, `apps/backend/src/services/conversations/__tests__/recovery.integration.test.ts`, `apps/backend/src/services/conversations/__tests__/providerDeploymentExecution.integration.test.ts`, `apps/backend/src/services/conversations/__tests__/observabilitySafety.integration.test.ts`, and `apps/frontend/src/features/conversations/__tests__/deployment-catalog.integration.test.tsx`; then execute `pnpm --filter backend run test:acceptance-terminal`, `pnpm --filter backend run test:acceptance-latency`, and `pnpm --filter backend run test:consolidation-eval`; record the complete executed file list, acceptance command results, and integration result, then issue explicit integration approval before E2E

**Integration gate**: T065 must pass before T066–T068 start.

---

## Phase 11: Deterministic Playwright E2E

**Purpose**: Validate critical full-product journeys only after the integration gate, using fake adapters and the disposable database.

- [ ] T066 [E2E] Update deterministic canonical-slot/catalog/deployment fixtures and fake-adapter scenarios exclusively in `apps/frontend/e2e/fixtures/modelFuse.ts`, `apps/frontend/e2e/support/scenarios.ts`, `apps/frontend/e2e/support/journeys.ts`, and `apps/frontend/e2e/support/backend.ts`, guaranteeing no DNS/network path to a real or paid provider and leaving shared backend UNIT/INTEGRATION fakes untouched (depends on approved T065)
- [ ] T067 [P] [E2E] Add and execute Playwright journeys for complete defaults, arbitrary mixed-provider selection, text-only creation, duplicate blocking before submit, unavailable/default-missing states, exact stored summaries, reload/read-only controls, and the fixture smoke path in `apps/frontend/e2e/new-conversation.spec.ts`, `apps/frontend/e2e/conversation-comparison.spec.ts`, and `apps/frontend/e2e/fixture.smoke.spec.ts` after T066
- [ ] T068 [P] [E2E] Update and execute existing continuation, retry, response-action, history, and SSE/recovery journeys with canonical slots and immutable assignments in `apps/frontend/e2e/conversation-continuation.spec.ts`, `apps/frontend/e2e/conversation-response-actions.spec.ts`, `apps/frontend/e2e/conversation-history.spec.ts`, and `apps/frontend/e2e/conversation-management.spec.ts` after T066

**Checkpoint**: All critical E2E journeys pass without external provider calls.

---

## Phase 12: Read-Only Backend and Frontend Audits

**Purpose**: Review the fully implemented and validated production tree after builds, unit/integration gates, and E2E, without modifying files or executing tests.

- [ ] T069 [P] [BE-AUDIT] Review `apps/backend/` and `db/changelogs/` against `specs/002-configurable-provider-deployments/spec.md`, `plan.md`, `data-model.md`, `contracts/openapi.yaml`, `contracts/provider-adapter.md`, and constitution principles II/III/IV/VI/VII/VIII/IX; report pass/fail, severity, exact file/line, transaction/layer/secret/provider-neutrality/schema findings, and prohibited alias/backfill/fallback/retry/economic behavior; do not modify files or execute tests (depends on T067 and T068)
- [ ] T070 [P] [FE-AUDIT] Review `apps/frontend/` and `packages/ui/` against `specs/002-configurable-provider-deployments/spec.md`, `plan.md`, `contracts/openapi.yaml`, and constitution principles I/V/VII/VIII/IX; report pass/fail, severity, exact file/line, schema/query/accessibility/read-only/text-only findings, and any old-slot or multimedia-control leak; do not modify files or execute tests (depends on T067 and T068)

**Audit gate**: Any blocking finding stops the final coordinator gates. Create the smallest focused correction task for the owning builder, rerun only the invalidated focused tests through their test owner, and repeat the corresponding audit. Any production correction after T069/T070 invalidates both audit results and requires both audits to pass again.

## Phase 13: Final Coordinator Gates

**Purpose**: Execute the global repository and Spec Kit checks as coordinator-only gates; these checks are not delegated tasks.

- Coordinator gate G1 (after T069 and T070): run `git diff --check`, inspect `git status --short` and `git diff --name-only`, and verify that changed files are limited to `apps/backend/`, `apps/frontend/`, `packages/ui/`, `db/changelogs/`, `specs/002-configurable-provider-deployments/`, and the already-authorized Spec Kit context block in `AGENTS.md`; report any out-of-scope file without modifying it.
- Coordinator gate G2 (after G1): execute the non-destructive `$speckit-analyze` workflow against `specs/002-configurable-provider-deployments/spec.md`, `plan.md`, and `tasks.md`; report requirement coverage, contradictions, ambiguity, owner/format/dependency defects, and unresolved constitutional violations; completion is blocked by any HIGH/CRITICAL finding.
- Final shutdown gate (after G2): the coordinator performs the mandatory one-time status check for every delegated subagent, interrupts any still `running`, confirms shutdown, and reports the result.

---

## Dependencies and Execution Order

### Phase dependencies

1. **Setup (Phase 1)** starts immediately.
2. **Foundational (Phase 2)** depends on Setup and blocks all User Stories; its fixture tasks T016/T017 must complete before T018–T070.
3. **US1 → US2 → US3 → US4 → US5** execute in specification order for P1 delivery.
4. **US6 → US7** execute after all P1 stories because they validate/refine the P2 execution and safety contracts.
5. **Build/unit/integration gates (Phase 10)** require all story tasks through T060 plus T016/T017 and complete before E2E.
6. **E2E (Phase 11)** requires explicit T065 integration approval.
7. **Audits (Phase 12)** require all builds, unit/integration gates, and E2E tasks T066–T068.
8. **Final coordinator gates (Phase 13)** require both audits and any resulting correction/revalidation cycle to pass.

### User Story dependency graph

```text
Setup T001-T002
  └─ Foundational T003-T019 (canonical contracts, fixtures, catalog, registry, migrations)
       └─ US1 T020-T030 (MVP explicit assignment)
            └─ US2 T031-T035 (exact default profile)
                 └─ US3 T036-T039 (availability states and proof)
                      └─ US4 T040-T048 (immutable lifetime reuse)
                           └─ US5 T049-T053 (duplicate rejection)
                                └─ US6 T054-T055 (adapter contract proof)
                                     └─ US7 T056-T060 (context/error safety)
                                          └─ Gates T061-T065
                                               └─ E2E T066-T068
                                                    └─ Audits T069-T070
                                                         └─ Coordinator G1-G2
```

### Critical task dependencies

- T003/T004 canonical types precede every dependent backend/frontend task.
- T005/T007 precede adapter work; T008/T009 precede T010 registry; T010 precedes catalog availability and orchestration.
- T013/T014 migrations precede T021/T040 persistence and all PostgreSQL integration tests.
- T006/T010/T011 precede selection services; T011/T012 precede frontend catalog querying.
- T021/T022 precede T023 provider execution; adapters T008–T010 also precede T023.
- Relevant backend and frontend production plus UNIT tasks precede each INTEGRATION task.
- T016 precedes T017 where acceptance utilities import the shared backend fake; both precede T061–T065.
- T065 integration approval precedes all E2E fixture/spec work.
- T067 and T068 precede T069/T070; any production correction after either audit invalidates both audits and requires revalidation before coordinator gates.

### Parallel opportunities by User Story

- **US1**: T025 can begin after Foundational while T020–T024 proceed; T028 and T029 can run in parallel after their respective productive blocks; T030 waits for both.
- **US2**: T031 and T032 can run in parallel; T033 and T034 can then run in parallel; T035 waits for both.
- **US3**: T036 and T037 can proceed independently after US2/Foundation; T038 follows T036; T039 waits for T037/T038.
- **US4**: T043 can proceed separately from T040–T042; T044/T045 can run in parallel with backend persistence work; T046/T047 can run in parallel; T048 waits for both.
- **US5**: T049 and T050 can run in parallel; T051 and T052 can then run in parallel; T053 waits for both.
- **US6**: T054 is the contract gate; T055 is intentionally sequential because it consumes the proven adapters.
- **US7**: T056 and T057 can run in parallel; T058 and T059 can then run in parallel; T060 waits for both.
- **Fixture/build gates**: T016 must pass before T017; after T060 and T017, T061/T062/T063 can run in parallel. T067/T068 can run in parallel after the shared T066 E2E fixture update. T069/T070 can run in parallel after T067 and T068.

---

## Parallel Delegation Examples

### US1

```text
frontend-builder: T025 after T004/T012 while backend-builder executes T020-T024
unit-test-runner: group T028 and T029 only after both productive sides finish
integration-test-runner: T030 only after T028/T029 pass
```

### US2

```text
backend-builder: T031
frontend-builder: T032
unit-test-runner: T033 and T034 after their matching builder tasks
integration-test-runner: T035 after both unit results
```

### US3

```text
frontend-builder: T036
unit-test-runner: T037 after Foundational and T038 after T036
integration-test-runner: T039 after T037/T038
```

### US4

```text
backend-builder: group T040-T043 sequentially to reuse repository/recovery context
frontend-builder: group T044-T045 while backend work proceeds
unit-test-runner: T046 and T047 after matching product blocks
integration-test-runner: T048 after both unit tasks
```

### US5

```text
backend-builder: T049
frontend-builder: T050
unit-test-runner: T051 and T052 after matching product tasks
integration-test-runner: T053 after both
```

### US6

```text
unit-test-runner: T054
integration-test-runner: T055 only after the provider contract passes
```

### US7

```text
backend-builder: T056 and T057 may be grouped in one delegation but touch independent ContextBuilder/OpenRouter areas
unit-test-runner: T058 and T059 after matching production changes
integration-test-runner: T060 after both unit tasks
```

### Shared fixtures, gates, and audits

```text
unit-test-runner: T016
integration-test-runner: T017 after T016
backend-builder: T061 after T060 and T017
frontend-builder: T062 and T063 after T060 and T017
unit-test-runner: T064 after T061-T063
integration-test-runner: T065 after T064
e2e-test-runner: T066, then T067 and T068 in parallel
backend-auditor: T069 after T067 and T068
frontend-auditor: T070 after T067 and T068
coordinator: G1, G2, and final shutdown gate after T069/T070
```

---

## Implementation Strategy

### MVP first

1. Complete Setup and all Foundational tasks.
2. Complete US1 T020–T030.
3. Stop and verify the US1 independent test with deterministic adapters.
4. Do not deploy a partial Foundation without the US1 transaction and tests; the slot migration is intentionally incompatible with old rows.

### Incremental delivery

1. US1: explicit four-slot assignment and creation.
2. US2: exact default profile and safe failure.
3. US3: credential-derived availability states and proof.
4. US4: immutable lifetime behavior across existing operations.
5. US5: duplicate enforcement at UI/service/database boundaries.
6. US6: complete provider-contract and mixed-execution proof.
7. US7: exact context admission and closed safe error behavior.
8. Audits, integrated gates, E2E, and final Spec Kit analysis.

### Delegation rules

- Group ready same-owner tasks that share files; do not create multiple same-owner agents for overlapping files.
- Builders never author, modify, or execute tests. Test owners never change production code; they report a product defect to the relevant builder.
- Auditors remain read-only. Blocking findings create focused builder work followed by targeted test reruns and re-audit.
- Use focused validations first and never repeat an unchanged successful validation without an integration reason.
- No task calls a real provider or paid API; all provider behavior uses deterministic transports/fakes.

---

## Notes

- `[P]` means safe file-level parallelism after dependencies, not permission to duplicate agents on overlapping scope.
- Every task has one configured owner and exact repository paths.
- Existing contracts, repositories, ContextBuilder, orchestration, recovery, fixtures, and UI primitives are extended in place.
- The supported migration target is a clean database. Failure against old-slot rows is expected; no compatibility work is authorized.
- The composer remains text-only; catalog modalities are display metadata only.
- Commit behavior remains user-controlled; task completion does not imply an automatic commit.

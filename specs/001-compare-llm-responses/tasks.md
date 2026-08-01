# Tasks: Comparación y consolidación de respuestas LLM

**Input**: artefactos actuales de `specs/001-compare-llm-responses/`.
**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`,
`contracts/rest-api.md`, `contracts/llm-provider.md`, `quickstart.md` y
`consolidation-evaluation.md`.

**Tests**: obligatorios para todo comportamiento no trivial; se escriben primero
y deben fallar antes de implementar.

**Organization**: tareas por historia, dependencia y owner. Cada línea declara
objetivo, archivos principales y prueba mínima.

## Format: `[ID] [P?] [Story?] [Domain] Description`

- **[P]**: ejecutable en paralelo tras sus dependencias y sin conflicto de archivo.
- **[Story]**: `US1`, `US2`, `US3` o `US4`; solo en fases de historia.
- **[Domain]**: `FE`, `BE`, `UI`, `DB`, `TEST`, `DOC`, `UX` o `SHARED`.
- Si una validación falla, se crea una tarea concreta para su causa; la tarea de
  validación no corrige código.

---

## Phase 1: Setup

**Purpose**: instalar solo dependencias y runners exigidos por los artefactos.

- [ ] T001 [FE] Añadir TanStack Query y Playwright/scripts en `apps/frontend/package.json` y `pnpm-lock.yaml`; prueba mínima: build frontend y arranque del runner Playwright.
- [ ] T002 [P] [UI] Añadir/exportar con Shadcn `Tabs`, `Dialog`, `DropdownMenu`, `ScrollArea`, `Skeleton` y `Alert` en `packages/ui/src/components/`; prueba mínima: unit de render, teclado y foco por primitiva interactiva.
- [ ] T003 [FE] Montar `QueryClientProvider` en `apps/frontend/src/providers/query-provider.tsx` y `apps/frontend/src/main.tsx` (depende de T001); prueba mínima: unit de montaje sin provider ausente.
- [ ] T004 [P] [TEST] Configurar Testing Library y QueryClient aislado en `apps/frontend/src/test/setup.ts`, `apps/frontend/src/test/query-test-utils.tsx` y `apps/frontend/vitest.config.ts`; tipo: unit infrastructure.
- [ ] T005 [P] [TEST] Configurar Playwright y providers fake deterministas en `apps/frontend/playwright.config.ts` y `apps/frontend/e2e/fixtures/modelFuse.ts`; tipo: E2E smoke del fixture.
- [ ] T006 [P] [DOC] Documentar solo variables vigentes de providers, límites, ratio, ventana, sidebar, API y colapso en `apps/backend/.env.sample` y `apps/frontend/.env.sample`; prueba mínima: revisión contra `quickstart.md` sin variables de polling.

**Checkpoint**: no se añaden SDKs LLM preventivos, librerías SSE, retry automático,
colas ni infraestructura genérica de idempotencia.

---

## Phase 2: Foundational

**Purpose**: esquema, configuración, contratos y utilidades que bloquean historias.

### Database / Liquibase

- [ ] T007 [P] [TEST] Escribir validación de tres tablas, cascades, checks, uniques, índices parciales y restauración del estado anterior tras rollback en `db/tests/validate-model-fuse-schema.sql`; tipo: integration PostgreSQL, debe fallar antes de T008–T010.
- [ ] T008 [DB] Crear `conversations` y `turns` con request IDs, ordinal, estados, cascades, índice único parcial de turno activo y rollback explícito en `db/changelogs/conversations/001-create-conversations-and-turns.sql`; prueba mínima: integration T007.
- [ ] T009 [DB] Crear `model_responses` con cuatro slots, errores, `continued_without_at`, `is_stale`, `attempt_no`, metadata, checks/índices busy y rollback explícito en `db/changelogs/messages/001-create-model-responses.sql` (depende de T008); prueba mínima: integration T007.
- [ ] T010 [DB] Incluir ambos módulos en `db/changelogs/conversations/db.changelog-conversations.xml`, `db/changelogs/messages/db.changelog-messages.xml` y `db/changelogs/db.changelog-master.xml` (depende de T008, T009); prueba mínima: Liquibase validate y T007.

### Backend foundation

- [ ] T011 [P] [TEST] Probar credenciales requeridas, timeouts, ventana, ratio `(0,1]`, límites por deployment y sidebar en `apps/backend/src/infrastructure/config/__tests__/env.test.ts`; tipo: unit, debe fallar antes de T012.
- [ ] T012 [BE] Implementar configuración Zod segura en `apps/backend/src/infrastructure/config/env.ts` (depende de T011); prueba mínima: unit T011.
- [ ] T013 [P] [BE] Definir contratos REST/SSE de conversación, turno, slots, eventos y errores en `apps/backend/src/types/conversations.ts` y `apps/backend/src/types/sse.ts`; prueba mínima: typecheck y contract tests de T035.
- [ ] T014 [P] [BE] Definir `LlmProvider`, `InputTokenMeasurement`, resultado normalizado y error seguro en `apps/backend/src/types/llm.ts` y `apps/backend/src/services/llm/llmErrors.ts`; prueba mínima: typecheck y contract tests T028–T032.
- [ ] T015 [P] [TEST] Probar UUIDs, prompt, rename, IDs, slots y cursores inválidos en `apps/backend/src/middleware/validation/__tests__/conversationSchemas.test.ts`; tipo: unit, debe fallar antes de T016.
- [ ] T016 [BE] Implementar schemas Zod y middleware de error saneado en `apps/backend/src/middleware/validation/conversationSchemas.ts`, `validateRequest.ts` y `apps/backend/src/types/apiError.ts` (depende de T015); prueba mínima: unit T015.
- [ ] T017 [P] [BE] Crear helper transaccional PostgreSQL en `apps/backend/src/infrastructure/postgres/transaction.ts`; prueba mínima: integration de commit/rollback en T034.
- [ ] T018 [P] [BE] Crear mapper PostgreSQL→contrato sin secretos ni mediciones en `apps/backend/src/infrastructure/postgres/mappers/conversationMapper.ts`; prueba mínima: unit de mapping en `apps/backend/src/infrastructure/postgres/mappers/__tests__/conversationMapper.test.ts`.
- [ ] T019 [P] [TEST] Probar cálculo de turno y busy desde cuatro slots en `apps/backend/src/services/conversations/__tests__/turnState.test.ts`; tipo: unit, debe fallar antes de T020.
- [ ] T020 [BE] Implementar cálculo puro de turno/`hasWorkInProgress` en `apps/backend/src/services/conversations/turnState.ts` (depende de T019); prueba mínima: unit T019.
- [ ] T021 [P] [TEST] Probar `createApp()`, error JSON y separación start/stop en `apps/backend/src/__tests__/app-lifecycle.test.ts`; tipo: integration, debe fallar antes de T022.
- [ ] T022 [BE] Crear `apiRouter`, `createApp()`, `startServer()` y limitar `index.ts` a start/stop en `apps/backend/src/routes/apiRouter.ts`, `apps/backend/src/app.ts`, `apps/backend/src/server.ts` y `apps/backend/src/index.ts` (depende de T012, T016, T021); prueba mínima: integration T021.
- [ ] T023 [P] [TEST] Crear cuatro providers fake y fixtures deterministas en `apps/backend/src/test/fakes/fakeLlmProvider.ts` y `apps/backend/src/test/fixtures/conversationFixtures.ts`; tipo: unit self-test de llamadas/errores controlados.

### Frontend foundation

- [ ] T024 [P] [FE] Definir tipos/schemas REST y SSE en `apps/frontend/src/features/conversations/types/conversation.ts`, `sse.ts` y `schemas/conversationSchemas.ts`; prueba mínima: unit de parseo en `apps/frontend/src/features/conversations/__tests__/conversationSchemas.test.ts`.
- [ ] T025 [P] [FE] Crear configuración frontend validada, cliente Axios cancelable y query keys en `apps/frontend/src/config/env.ts`, `apps/frontend/src/features/conversations/api/client.ts` y `queries/conversation-keys.ts`; prueba mínima: unit de env, URL, cancelación y claves estables.
- [ ] T026 [P] [TEST] Probar aplicación idempotente y rechazo de `updatedAt`/`attemptNo` antiguos en `apps/frontend/src/features/conversations/queries/__tests__/conversation-cache.test.ts`; tipo: unit, debe fallar antes de T027.
- [ ] T027 [FE] Implementar helpers de cache para `slot_update`, `turn_update` y `busy_update` en `apps/frontend/src/features/conversations/queries/conversation-cache.ts` (depende de T024–T026); prueba mínima: unit T026.

**Checkpoint**: foundation validada sin tablas de eventos, locks, tokens,
presupuestos, métricas, ranking o retries.

---

## Phase 3: User Story 1 — Comparar y consolidar respuestas (P1) 🎯 MVP

**Goal**: crear la primera conversación, ejecutar tres bases/Qwen, seguir el
turno por SSE y resolver manualmente fallos de slots.

**Independent Test**: un prompt devuelve `202`, abre SSE, muestra cuatro tabs y
termina con `busy_update=false`; replay no duplica y un fallo ofrece Retry o
Continue-without irreversible sin fallback de transporte.

### Tests for User Story 1

- [ ] T028 [P] [US1] [TEST] Probar medición exacta/`upper_bound`, overhead y corpus ASCII, puntuación, Unicode/emoji, scripts no latinos y delimitadores en `apps/backend/src/infrastructure/llm/providers/__tests__/inputMeasurement.contract.test.ts`; tipo: contract unit, debe fallar antes de T043–T046.
- [ ] T029 [P] [US1] [TEST] Probar mapping, cancelación, error seguro y una llamada de OpenAI en `apps/backend/src/infrastructure/llm/providers/__tests__/OpenAiProvider.test.ts`; tipo: contract unit.
- [ ] T030 [P] [US1] [TEST] Probar mapping, cancelación, error seguro y una llamada de Google en `apps/backend/src/infrastructure/llm/providers/__tests__/GoogleProvider.test.ts`; tipo: contract unit.
- [ ] T031 [P] [US1] [TEST] Probar mapping, cancelación, error seguro y una llamada de MiniMax en `apps/backend/src/infrastructure/llm/providers/__tests__/MiniMaxProvider.test.ts`; tipo: contract unit.
- [ ] T032 [P] [US1] [TEST] Probar mapping, cancelación, error seguro y una llamada de Qwen en `apps/backend/src/infrastructure/llm/providers/__tests__/QwenProvider.test.ts`; tipo: contract unit.
- [ ] T033 [P] [US1] [TEST] Probar bases paralelas, protección del prompt actual, `INVALID_PROMPT_SIZE`, persistencia por intento y consolidación con disponibles en `apps/backend/src/services/conversations/__tests__/TurnOrchestrator.test.ts`; tipo: unit.
- [ ] T034 [P] [US1] [TEST] Probar `202`, replay concurrente antes de busy, conflicto ID/prompt y título en `apps/backend/src/routes/conversations/__tests__/conversationCreation.integration.test.ts`; tipo: integration REST/PostgreSQL.
- [ ] T035 [P] [US1] [TEST] Probar pertenencia, headers, snapshot inicial, `slot_update`, `turn_update`, `busy_update`, publicación post-commit, cleanup, cierre terminal, ausencia de eventos o contenido parcial token por token y entrega del contenido únicamente como respuesta final normalizada en `apps/backend/src/routes/conversations/__tests__/turnEvents.integration.test.ts`; tipo: integration SSE/PostgreSQL.
- [ ] T036 [P] [US1] [TEST] Probar CAS de retry, tres códigos 409, `attempt_no`, reconsolidación y Continue-without irreversible en `apps/backend/src/routes/conversations/__tests__/responseActions.integration.test.ts`; tipo: integration.
- [ ] T037 [P] [US1] [TEST] Probar un `EventSource`, cache idempotente, runtime stage efímero, cierre terminal y error visible sin fallback en `apps/frontend/src/features/conversations/__tests__/useTurnEvents.test.tsx`; tipo: unit/integration frontend.
- [ ] T038 [P] [US1] [TEST] Probar tabs/labels, estados aislados, busy controls y confirmación permanente en `apps/frontend/src/features/conversations/__tests__/comparison-workspace.test.tsx`; tipo: component integration.
- [ ] T039 [P] [US1] [TEST] Escribir flujo `202 → SSE → cuatro resultados → cierre` en `apps/frontend/e2e/conversation-comparison.spec.ts`; tipo: E2E.
- [ ] T040 [P] [US1] [TEST] Escribir retry manual, reconsolidación, 409 y Continue-without en `apps/frontend/e2e/conversation-response-actions.spec.ts`; tipo: E2E.

### Backend implementation

- [ ] T041 [P] [US1] [BE] Implementar create/replay atómico, título y cuatro slots en `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts`; prueba mínima: integration T034.
- [ ] T042 [P] [US1] [BE] Implementar transiciones CAS, `attempt_no`, recálculo y busy derivado en `apps/backend/src/infrastructure/postgres/repositories/turnRepository.ts`; prueba mínima: integration T036.
- [ ] T043 [P] [US1] [BE] Implementar `OpenAiProvider` y medición exacta/cota demostrable en `apps/backend/src/infrastructure/llm/providers/OpenAiProvider.ts`; prueba mínima: contract T028/T029.
- [ ] T044 [P] [US1] [BE] Implementar `GoogleProvider` y medición exacta/cota demostrable en `apps/backend/src/infrastructure/llm/providers/GoogleProvider.ts`; prueba mínima: contract T028/T030.
- [ ] T045 [P] [US1] [BE] Implementar `MiniMaxProvider` y medición exacta/cota demostrable en `apps/backend/src/infrastructure/llm/providers/MiniMaxProvider.ts`; prueba mínima: contract T028/T031.
- [ ] T046 [P] [US1] [BE] Implementar `QwenProvider` y medición exacta/cota demostrable en `apps/backend/src/infrastructure/llm/providers/QwenProvider.ts`; prueba mínima: contract T028/T032.
- [ ] T047 [US1] [BE] Construir registro literal de cuatro adapters en `apps/backend/src/infrastructure/llm/providerRegistry.ts` (depende de T043–T046); prueba mínima: unit de cuatro claves sin factory.
- [ ] T048 [P] [US1] [BE] Implementar protección técnica pura: umbral, compactación y `INVALID_PROMPT_SIZE` en `apps/backend/src/services/conversations/contextProtection.ts`; prueba mínima: unit T033 y T064.
- [ ] T049 [P] [US1] [BE] Implementar publicador en proceso tipado y cleanup en `apps/backend/src/services/conversations/turnEventPublisher.ts`; prueba mínima: unit de subscribe/publish/unsubscribe en `turnEventPublisher.test.ts`.
- [ ] T050 [US1] [BE] Implementar tres bases paralelas, Qwen y persistencia antes de publicar en `apps/backend/src/services/conversations/TurnOrchestrator.ts` (depende de T042, T047–T049); prueba mínima: unit T033 e integration T035.
- [ ] T051 [US1] [BE] Añadir retry manual, stale/reconsolidación y Continue-without irreversible en `apps/backend/src/services/conversations/TurnOrchestrator.ts` (depende de T050); prueba mínima: integration T036.
- [ ] T052 [US1] [BE] Implementar create/replay, snapshot y acciones en `apps/backend/src/services/conversations/ConversationService.ts` (depende de T041, T042, T051); prueba mínima: integration T034–T036.
- [ ] T053 [US1] [BE] Implementar controller SSE con snapshot, eventos y cierre en `apps/backend/src/controllers/conversations/turnEventsController.ts` (depende de T049, T052); prueba mínima: integration T035.
- [ ] T054 [US1] [BE] Exponer create, get puntual, SSE, retry y Continue-without en `apps/backend/src/controllers/conversations/conversationController.ts` y `apps/backend/src/routes/conversations/conversationRoutes.ts` (depende de T052, T053); prueba mínima: integration T034–T036.

### Frontend implementation

- [ ] T055 [P] [US1] [FE] Implementar API validada de create, snapshot, retry y Continue-without en `apps/frontend/src/features/conversations/api/conversationsApi.ts`; prueba mínima: unit de contratos/errores.
- [ ] T056 [US1] [FE] Implementar ciclo SSE/cache/error/cierre en `apps/frontend/src/features/conversations/hooks/useTurnEvents.ts` (depende de T027, T055); prueba mínima: frontend T037; no crear fallback.
- [ ] T057 [P] [US1] [FE] Crear layout accesible en `apps/frontend/src/components/layout/AppShell.tsx`; prueba mínima: component de landmarks/foco.
- [ ] T058 [P] [US1] [FE] Crear aviso textual busy/SSE en `apps/frontend/src/features/conversations/components/ConversationProcessingNotice.tsx`; prueba mínima: component T038.
- [ ] T059 [P] [US1] [FE] Crear tabs y panel de cuatro respuestas en `apps/frontend/src/features/conversations/components/ResponseTabs.tsx` y `ResponsePanel.tsx`; prueba mínima: component T038.
- [ ] T060 [P] [US1] [FE] Crear confirmación Continue-without en `apps/frontend/src/features/conversations/components/ContinueWithoutDialog.tsx`; prueba mínima: component T038 con foco/copy irreversible.
- [ ] T061 [P] [US1] [FE] Crear composer con trim, UUID estable y disabled por busy/mutación en `apps/frontend/src/features/conversations/components/PromptComposer.tsx`; prueba mínima: component T038.
- [ ] T062 [P] [US1] [FE] Crear `TurnCard` con prompt, cuatro slots y runtime stage en `apps/frontend/src/features/conversations/components/TurnCard.tsx`; prueba mínima: component T038.
- [ ] T063 [US1] [SHARED] Integrar API, SSE y componentes en `apps/frontend/src/features/conversations/components/ConversationWorkspace.tsx` y `apps/frontend/src/App.tsx` (owner: frontend-builder; depende de T055–T062); prueba mínima: E2E T039/T040.

**Checkpoint**: MVP operativo con REST + SSE exclusivo, idempotencia inicial,
retry manual y Continue-without irreversible.

---

## Phase 4: User Story 2 — Continuar una conversación (P2)

**Goal**: crear turnos posteriores con contexto aislado, busy e idempotencia.

**Independent Test**: un segundo prompt usa solo el historial correcto; replay
precede a busy y protección técnica cubre cabe/compacta/falla sin subestimar.

### Tests for User Story 2

- [ ] T064 [P] [US2] [TEST] Probar aislamiento base/Qwen, ventana, compactación, re-medición y `INVALID_PROMPT_SIZE` en `apps/backend/src/services/conversations/__tests__/ContextBuilder.test.ts`; tipo: unit.
- [ ] T065 [P] [US2] [TEST] Probar replay→busy→create, ordinal y liberación terminal en `apps/backend/src/routes/conversations/__tests__/conversationContinuation.integration.test.ts`; tipo: integration.
- [ ] T066 [P] [US2] [TEST] Probar createTurn, UUID estable, navegación, cache por IDs y nueva suscripción SSE en `apps/frontend/src/features/conversations/__tests__/conversation-continuation.test.tsx`; tipo: frontend integration.
- [ ] T067 [P] [US2] [TEST] Probar aviso de contexto acotado sin contenido/mediciones/límites en `apps/frontend/src/features/conversations/__tests__/ContextWindowNotice.test.tsx`; tipo: component unit.
- [ ] T068 [P] [US2] [TEST] Escribir E2E multiturno de aislamiento, busy por conversación y protección de contexto en `apps/frontend/e2e/conversation-continuation.spec.ts`; tipo: E2E.

### Implementation for User Story 2

- [ ] T069 [P] [US2] [BE] Implementar consultas aisladas base/Qwen en `apps/backend/src/infrastructure/postgres/repositories/contextRepository.ts`; prueba mínima: integration de fixtures en T064.
- [ ] T070 [US2] [BE] Implementar composición por turnos sobre `contextProtection` en `apps/backend/src/services/conversations/ContextBuilder.ts` (depende de T048, T069); prueba mínima: unit T064.
- [ ] T071 [US2] [BE] Integrar `ContextBuilder` antes de cada adapter y omitir Continue-without en Qwen en `apps/backend/src/services/conversations/TurnOrchestrator.ts` (depende de T070); prueba mínima: unit T064 y E2E T068.
- [ ] T072 [US2] [BE] Implementar lock, replay, conflicto, busy y ordinal para turno posterior en `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts` (depende de T041, T042); prueba mínima: integration T065.
- [ ] T073 [US2] [BE] Exponer `POST /conversations/:id/turns` en `apps/backend/src/services/conversations/ConversationService.ts`, `conversationController.ts` y `conversationRoutes.ts` (depende de T071, T072); prueba mínima: integration T065.
- [ ] T074 [P] [US2] [FE] Añadir createTurn idempotente en `apps/frontend/src/features/conversations/api/conversationsApi.ts` y `hooks/useConversationExecution.ts`; prueba mínima: frontend T066.
- [ ] T075 [P] [US2] [FE] Crear timeline multiturno y aviso contextual en `apps/frontend/src/features/conversations/components/TurnList.tsx` y `ContextWindowNotice.tsx`; prueba mínima: component T067.
- [ ] T076 [US2] [FE] Integrar follow-up, timeline, cache por conversación y SSE del turno activo en `apps/frontend/src/features/conversations/components/ConversationWorkspace.tsx` (depende de T074, T075); prueba mínima: frontend T066 y E2E T068.

**Checkpoint**: multiturno aislado y protegido, sin presupuesto de producto ni
bloqueo global.

---

## Phase 5: User Story 3 — Recuperar y gestionar conversaciones (P3)

**Goal**: sidebar/historial infinitos, rename, Delete condicionado por busy y
colapso local.

**Independent Test**: siete turnos cargan 3/3/1 sin salto; Rename persiste durante
busy y Delete responde 409 hasta quedar terminal.

### Tests for User Story 3

- [ ] T077 [P] [US3] [TEST] Probar encode/decode y rechazo de cursores en `apps/backend/src/utils/__tests__/cursor.test.ts`; tipo: unit.
- [ ] T078 [P] [US3] [TEST] Probar sidebar estable y bloques 3/3/1 completos en `apps/backend/src/infrastructure/postgres/repositories/__tests__/conversationHistoryRepository.integration.test.ts`; tipo: integration.
- [ ] T079 [P] [US3] [TEST] Probar list/detail/rename, Delete busy, cascade y errores en `apps/backend/src/routes/conversations/__tests__/conversationManagement.integration.test.ts`; tipo: integration.
- [ ] T080 [P] [US3] [TEST] Probar queries infinitas, autofill y compensación al anteponer en `apps/frontend/src/features/conversations/__tests__/conversation-history.test.tsx`; tipo: frontend integration.
- [ ] T081 [P] [US3] [TEST] Probar menú, dialogs, foco, contador, busy y colapso local en `apps/frontend/src/features/conversations/__tests__/conversation-management.test.tsx`; tipo: component integration.
- [ ] T082 [P] [US3] [TEST] Escribir E2E de reapertura y scroll histórico 3/3/1 en `apps/frontend/e2e/conversation-history.spec.ts`; tipo: E2E.
- [ ] T083 [P] [US3] [TEST] Escribir E2E de sidebar, Rename, Delete busy/cascade y error SSE al reabrir en `apps/frontend/e2e/conversation-management.spec.ts`; tipo: E2E.

### Implementation for User Story 3

- [ ] T084 [US3] [BE] Implementar cursor, sidebar y bloques históricos en `apps/backend/src/utils/cursor.ts` y `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts`; prueba mínima: unit T077 e integration T078.
- [ ] T085 [US3] [BE] Implementar detail, Rename y Delete transaccional con busy/cascade en `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts` y `apps/backend/src/services/conversations/ConversationService.ts` (depende de T084); prueba mínima: integration T079.
- [ ] T086 [US3] [BE] Exponer list/detail/history/Rename/Delete en `apps/backend/src/controllers/conversations/conversationController.ts` y `apps/backend/src/routes/conversations/conversationRoutes.ts` (depende de T085); prueba mínima: integration T079.
- [ ] T087 [P] [US3] [FE] Implementar API y queries infinitas de list/detail/history/Rename/Delete en `apps/frontend/src/features/conversations/api/conversationsApi.ts` y `hooks/useConversationQueries.ts`; prueba mínima: frontend T080.
- [ ] T088 [P] [US3] [FE] Crear sidebar con fecha, sentinel inferior y autofill en `apps/frontend/src/features/conversations/components/ConversationSidebar.tsx`; prueba mínima: frontend T080.
- [ ] T089 [P] [US3] [FE] Crear menú y dialogs Rename/Delete accesibles en `apps/frontend/src/features/conversations/components/ConversationMenu.tsx`, `RenameConversationDialog.tsx` y `DeleteConversationDialog.tsx`; prueba mínima: component T081.
- [ ] T090 [P] [US3] [FE] Crear sentinel superior, compensación y colapso local en `apps/frontend/src/features/conversations/components/HistoryTopSentinel.tsx`, `TurnList.tsx` y `CollapsibleHistoryMessage.tsx`; prueba mínima: frontend T080/T081.
- [ ] T091 [US3] [SHARED] Integrar selección, historial, mutations, dialogs y reapertura SSE en `apps/frontend/src/components/layout/AppShell.tsx` y `ConversationWorkspace.tsx` (owner: frontend-builder; depende de T087–T090); prueba mínima: E2E T082/T083.

**Checkpoint**: historial navegable sin paginación visible; gestión respeta busy.

---

## Phase 6: User Story 4 — Iniciar un contexto nuevo (P4)

**Goal**: mantener un único draft vacío local sin borrar ni persistir historial.

**Independent Test**: Nueva conversación no inserta datos; el primer prompt crea
el recurso sin contexto previo y conserva conversaciones existentes.

- [ ] T092 [P] [US4] [TEST] Probar draft repetido, cero persistencia y conservación de lista en `apps/frontend/src/features/conversations/__tests__/new-conversation-draft.test.tsx`; tipo: frontend unit.
- [ ] T093 [P] [US4] [TEST] Escribir primer prompt de draft y contexto aislado en `apps/frontend/e2e/new-conversation.spec.ts`; tipo: E2E.
- [ ] T094 [US4] [FE] Implementar draft/selección local y acción Nueva conversación en `apps/frontend/src/components/layout/AppShell.tsx` y `ConversationSidebar.tsx`; prueba mínima: unit T092.
- [ ] T095 [US4] [FE] Enviar primer prompt por `POST /conversations`, seleccionar ID y conservar historial en `apps/frontend/src/features/conversations/components/ConversationWorkspace.tsx` (depende de T094); prueba mínima: E2E T093.

**Checkpoint**: no existe endpoint clear ni conversación vacía persistida.

---

## Phase 7: Acceptance, recovery and quality gates

**Purpose**: cerrar v1 con evidencia medible y checks separados.

- [ ] T096 [P] [TEST] Escribir fixture/versionado de recovery `pending`/`running` y prueba sobre la misma DB en `apps/backend/src/services/conversations/__tests__/fixtures/recoveryCases.ts` y `recovery.integration.test.ts`; tipo: integration SC-002, debe fallar antes de T097.
- [ ] T097 [BE] Implementar `recoverInterruptedTurns()` antes de listen en `apps/backend/src/services/conversations/recoverInterruptedTurns.ts` y `apps/backend/src/server.ts` (depende de T096); prueba mínima: integration T096 al 100% del fixture.
- [ ] T098 [P] [TEST] Probar ausencia de prompts, respuestas, payloads SSE, mediciones, límites, headers y secretos en `apps/backend/src/services/conversations/__tests__/observabilitySafety.test.ts`; tipo: unit, debe fallar antes de T099.
- [ ] T099 [BE] Añadir logs Pino seguros de IDs, busy, replay, slot, duración, SSE y recovery en `apps/backend/src/middleware/logger/requestContext.ts`, `TurnOrchestrator.ts` y `turnEventsController.ts` (depende de T098); prueba mínima: unit T098.
- [ ] T100 [P] [TEST] Crear fixture ≤5 casos y runner de consolidación ≥90% en `apps/backend/src/services/conversations/__tests__/fixtures/consolidation-evaluation.json` y `apps/backend/src/acceptance/consolidationEvaluation.ts`; tipo: acceptance SC-005.
- [ ] T101 [P] [TEST] Implementar estados terminales ≤60 s con providers fake en `apps/backend/src/acceptance/terminalStates.acceptance.test.ts`; tipo: acceptance SC-001.
- [ ] T102 [P] [TEST] Implementar latencia `202`/primer historial p95 <1 s en `apps/backend/src/acceptance/latency.acceptance.test.ts`; tipo: acceptance SC-010.
- [ ] T103 [P] [UX] Diseñar tareas, escenarios, criterios observables y escalas subjetivas en `specs/001-compare-llm-responses/usability/sc-003-protocol.md`; prueba mínima: revisión Product/UX de cobertura SC-003/SC-004.
- [ ] T104 [UX] Ejecutar participantes y registrar numerador, denominador, porcentaje y pass/fail por SC en `specs/001-compare-llm-responses/usability/sc-004-results.md` (depende de T103); tipo: aceptación Product/UX, umbral 90% separado.
- [ ] T105 [DB] Ejecutar migrate-from-zero, Liquibase validate y rollback con `docker-compose.yml` y `db/changelogs/db.changelog-master.xml`; tipo: integration DB, sin corregir fallos dentro de esta tarea.
- [ ] T106 [P] [TEST] Ejecutar Vitest backend desde `apps/backend/package.json`; tipo: unit/integration backend, registrar fallos como tareas concretas.
- [ ] T107 [P] [TEST] Ejecutar Vitest frontend desde `apps/frontend/package.json`; tipo: unit/integration frontend, registrar fallos como tareas concretas.
- [ ] T108 [TEST] Ejecutar Playwright con fakes desde `apps/frontend/playwright.config.ts` (depende de historias implementadas); tipo: E2E, registrar fallos como tareas concretas.
- [ ] T109 [SHARED] Ejecutar `pnpm typecheck`, `pnpm lint` y `pnpm build` desde `package.json` (owner: integration-owner); prueba mínima: los tres comandos exitosos, sin corregir hallazgos aquí.
- [ ] T110 [DOC] Ejecutar todos los smoke flows de `specs/001-compare-llm-responses/quickstart.md` (depende de T100–T109); prueba mínima: aceptación manual documentada, discrepancias como tareas concretas.

---

## Dependencies and execution order

### Phase dependencies

- Phase 1 no tiene dependencias.
- Phase 2 depende de Phase 1 y bloquea todas las historias.
- US1 depende de Phase 2 y constituye el MVP.
- US2 amplía US1 con turnos/contexto.
- US3 puede adelantar componentes aislados tras Phase 2; integración T091 depende
  del workspace/SSE de US1–US2.
- US4 depende de selección/sidebar de US3.
- Phase 7 depende de las historias incluidas en la entrega.

### Graph

```text
Setup → Foundational → US1 (MVP) → US2 → US3 → US4
                         └──────────────→ Acceptance
```

### Critical chains

- DB: `T007 → T008/T009 → T010 → T105`.
- Backend base: `T011 → T012 → T022`; `T019 → T020`.
- Providers: `T028–T032 → T043–T046 → T047 → T050`.
- SSE: `T026 → T027`; `T035 → T049 → T053/T054 → T056 → T063`.
- Context: `T028 → T048`; `T064 → T069 → T070 → T071`.
- US2: `T065 → T072/T073`; `T066 → T074/T076`.
- US3: `T077–T081 → T084–T091`.
- US4: `T092/T093 → T094 → T095`.
- Recovery: `T096 → T097`; UX: `T103 → T104`.

## Parallel opportunities

- Setup: T002, T004, T005 y T006.
- Foundation: lanes DB, backend contracts/config, fakes y frontend contracts.
- US1: T028–T040; cuatro adapters T043–T046; componentes T057–T062.
- US2: T064–T068; backend context y frontend components en archivos separados.
- US3: T077–T083; T087–T090.
- Final: T096, T098, T100–T103, T105–T107.

## Parallel examples

### US1

```text
Tests:     T028 + T029 + T030 + T031 + T032 + T033 + T034 + T035 + T036 + T037 + T038 + T039 + T040
Adapters:  T043 + T044 + T045 + T046
Frontend:  T057 + T058 + T059 + T060 + T061 + T062
```

### US2

```text
Tests:     T064 + T065 + T066 + T067 + T068
Lanes:     T069/T070/T071 (backend) + T074/T075 (frontend), luego T076
```

### US3

```text
Tests:     T077 + T078 + T079 + T080 + T081 + T082 + T083
Frontend:  T087 + T088 + T089 + T090, luego T091
```

### US4

```text
Tests: T092 + T093
Flow:  T094 → T095
```

## Domain ownership

| Domain | Primary owner | Scope |
|---|---|---|
| FE | `frontend-builder` | `apps/frontend` composition/state |
| UI | `frontend-builder` | `packages/ui` primitives only |
| BE | `backend-builder` | API, orchestration, SSE and LLM adapters |
| DB | `backend-builder` | Liquibase/schema validation |
| TEST | `unit-test-runner` or owning builder | exact test/acceptance file |
| UX | Product/UX | participant protocol/evidence |
| DOC | integration owner | env samples/quickstart validation |
| SHARED | named owner | cross-boundary integration/checks |

Auditors remain read-only.

## Independent test criteria

- **US1**: `202`, cuatro slots, consolidación parcial, SSE terminal, busy
  explícito, retry manual, Continue-without permanente e idempotencia inicial.
- **US2**: follow-up, replay seguro, aislamiento base/Qwen y protección
  exacta/upper_bound con cabe/compacta/falla.
- **US3**: ventana de tres, cursores, posición estable, sidebar, Rename, Delete
  busy/cascade, colapso y reapertura SSE.
- **US4**: draft local y persistencia solo con primer prompt válido.

## Implementation strategy

### MVP first

1. Completar T001–T027.
2. Escribir T028–T040 y confirmar que fallan.
3. Implementar T041–T063.
4. Validar US1 independientemente.

### Incremental delivery

1. US1: comparación/consolidación y recuperación manual en tiempo real.
2. US2: multiturno con contexto aislado/protegido.
3. US3: recuperación y gestión del historial.
4. US4: nuevo contexto vacío local.
5. Phase 7: recovery, aceptación automatizada y Product/UX.

## Notes

- REST crea/lee recursos y ejecuta acciones; SSE es el único mecanismo de
  actualización en tiempo real de v1.
- No hay polling, long polling, WebSockets, streaming token por token, replay
  durable, cola externa ni fallback de transporte.
- PostgreSQL y backend conservan autoridad para busy, idempotencia, retry,
  Continue-without y Delete.
- Medición de contexto es exacta o `upper_bound` demostrable, efímera y técnica;
  no crea presupuesto ni contabilidad por modelo.
- No se crean ranking, dashboards, métricas persistentes o políticas nuevas.

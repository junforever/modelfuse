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
- **[Domain]**: `FE`, `BE`, `UI`, `DB`, `FE-AUDIT`, `BE-AUDIT`, `UNIT`,
  `INTEGRATION`, `E2E`, `PERF`, `DOC`, `UX` o `SHARED`.
- `FE-AUDIT` y `BE-AUDIT` pertenecen exclusivamente a `frontend-auditor` y
  `backend-auditor`; producen un reporte en la salida del agente, no modifican
  archivos ni ejecutan pruebas.
- `UNIT`, `INTEGRATION`, `E2E` y `PERF` pertenecen exclusivamente a
  `unit-test-runner`, `integration-test-runner`, `e2e-test-runner` y
  `performance-test-runner`, respectivamente.
- Builders no crean, modifican ni ejecutan pruebas; auditores permanecen
  read-only. La prueba mínima de una tarea de implementación es un criterio de
  aceptación y no transfiere ownership al builder.
- Un hallazgo bloqueante de auditoría crea una tarea nueva para el builder
  correspondiente y exige una nueva revisión del mismo auditor.
- Toda prueba automatizada mínima de una tarea productiva DEBE referenciar al
  menos una tarea de prueba explícita con ID y owner especializado; una ruta o
  descripción de prueba dentro de una tarea builder no transfiere ownership ni
  cuenta como tarea.
- Si una validación falla, se crea una tarea concreta para su causa; la tarea de
  validación no corrige código.

---

## Phase 1: Setup

**Purpose**: instalar solo dependencias y runners exigidos por los artefactos.

- [ ] T001 [FE] Añadir TanStack Query en `apps/frontend/package.json` y `pnpm-lock.yaml`; prueba mínima: build frontend.
- [ ] T002 [P] [UNIT] Configurar Testing Library y QueryClient aislado en `apps/frontend/src/test/setup.ts`, `apps/frontend/src/test/query-test-utils.tsx` y `apps/frontend/vitest.config.ts`; tipo: unit infrastructure.
- [ ] T003 [P] [UNIT] Probar render, teclado y foco de `Tabs`, `Dialog`, `DropdownMenu`, `ScrollArea`, `Skeleton` y `Alert` en `apps/frontend/src/test/ui-primitives.test.tsx` (depende de T002); tipo: component unit, debe fallar antes de T004.
- [ ] T004 [P] [UI] Añadir/exportar con Shadcn `Tabs`, `Dialog`, `DropdownMenu`, `ScrollArea`, `Skeleton` y `Alert` en `packages/ui/src/components/` (depende de T003); prueba mínima: unit T003.
- [ ] T005 [INTEGRATION] Probar el montaje con `QueryClientProvider` y QueryClient real en `apps/frontend/src/providers/__tests__/query-provider.integration.test.tsx` (depende de T001, T002); tipo: frontend integration provider/cache, debe fallar antes de T006.
- [ ] T006 [FE] Montar `QueryClientProvider` en `apps/frontend/src/providers/query-provider.tsx` y `apps/frontend/src/main.tsx` (depende de T001, T005); prueba mínima: integration T005.
- [ ] T007 [P] [E2E] Añadir Playwright/scripts y configurar providers fake deterministas en `apps/frontend/package.json`, `pnpm-lock.yaml`, `apps/frontend/playwright.config.ts` y `apps/frontend/e2e/fixtures/modelFuse.ts`; tipo: E2E smoke del fixture.
- [ ] T008 [P] [DOC] Documentar solo variables vigentes de providers, límites, ratio, ventana, sidebar, API y colapso en `apps/backend/.env.sample` y `apps/frontend/.env.sample`; prueba mínima: revisión contra `quickstart.md` sin variables de polling.

**Checkpoint**: no se añaden SDKs LLM preventivos, librerías SSE, retry automático,
colas ni infraestructura genérica de idempotencia.

---

## Phase 2: Foundational

**Purpose**: esquema, configuración, contratos y utilidades que bloquean historias.

### Database / Liquibase

- [ ] T009 [P] [INTEGRATION] Escribir validación de tres tablas, cascades, checks, uniques, índices parciales y restauración del estado anterior tras rollback en `db/tests/validate-model-fuse-schema.sql`; tipo: integration PostgreSQL, debe fallar antes de T010–T012.
- [ ] T010 [DB] Crear `conversations` y `turns` con request IDs, ordinal, estados, cascades, índice único parcial de turno activo y rollback explícito en `db/changelogs/conversations/001-create-conversations-and-turns.sql`; prueba mínima: integration T009.
- [ ] T011 [DB] Crear `model_responses` con cuatro slots, errores, `continued_without_at`, `is_stale`, `attempt_no`, metadata, checks/índices busy y rollback explícito en `db/changelogs/messages/001-create-model-responses.sql` (depende de T010); prueba mínima: integration T009.
- [ ] T012 [DB] Incluir ambos módulos en `db/changelogs/conversations/db.changelog-conversations.xml`, `db/changelogs/messages/db.changelog-messages.xml` y `db/changelogs/db.changelog-master.xml` (depende de T010, T011); prueba mínima: Liquibase validate y T009.

### Backend foundation

- [ ] T013 [P] [UNIT] Probar credenciales requeridas, timeouts, ventana, ratio `(0,1]`, límites por deployment y sidebar en `apps/backend/src/infrastructure/config/__tests__/env.test.ts`; tipo: unit, debe fallar antes de T014.
- [ ] T014 [BE] Implementar configuración Zod segura en `apps/backend/src/infrastructure/config/env.ts` (depende de T013); prueba mínima: unit T013.
- [ ] T015 [P] [BE] Definir contratos REST/SSE de conversación, turno, slots, eventos y errores en `apps/backend/src/types/conversations.ts` y `apps/backend/src/types/sse.ts`; prueba mínima: typecheck y contract tests de T040.
- [ ] T016 [P] [BE] Definir `LlmProvider`, `InputTokenMeasurement`, resultado normalizado y error seguro en `apps/backend/src/types/llm.ts` y `apps/backend/src/services/llm/llmErrors.ts`; prueba mínima: typecheck y contract tests T033–T037.
- [ ] T017 [P] [UNIT] Probar UUIDs, prompt, rename, IDs, slots y cursores inválidos en `apps/backend/src/middleware/validation/__tests__/conversationSchemas.test.ts`; tipo: unit, debe fallar antes de T018.
- [ ] T018 [BE] Implementar schemas Zod y middleware de error saneado en `apps/backend/src/middleware/validation/conversationSchemas.ts`, `validateRequest.ts` y `apps/backend/src/types/apiError.ts` (depende de T017); prueba mínima: unit T017.
- [ ] T019 [P] [BE] Crear helper transaccional PostgreSQL en `apps/backend/src/infrastructure/postgres/transaction.ts`; prueba mínima: integration de commit/rollback en T039.
- [ ] T020 [P] [UNIT] Probar el mapper PostgreSQL→contrato sin secretos ni mediciones en `apps/backend/src/infrastructure/postgres/mappers/__tests__/conversationMapper.test.ts`; tipo: unit, debe fallar antes de T021.
- [ ] T021 [P] [BE] Crear mapper PostgreSQL→contrato sin secretos ni mediciones en `apps/backend/src/infrastructure/postgres/mappers/conversationMapper.ts` (depende de T020); prueba mínima: unit T020.
- [ ] T022 [P] [UNIT] Probar cálculo de turno y busy desde cuatro slots en `apps/backend/src/services/conversations/__tests__/turnState.test.ts`; tipo: unit, debe fallar antes de T023.
- [ ] T023 [BE] Implementar cálculo puro de turno/`hasWorkInProgress` en `apps/backend/src/services/conversations/turnState.ts` (depende de T022); prueba mínima: unit T022.
- [ ] T024 [P] [INTEGRATION] Probar `createApp()`, error JSON y separación start/stop en `apps/backend/src/__tests__/app-lifecycle.test.ts`; tipo: integration, debe fallar antes de T025.
- [ ] T025 [BE] Crear `apiRouter`, `createApp()`, `startServer()` y limitar `index.ts` a start/stop en `apps/backend/src/routes/apiRouter.ts`, `apps/backend/src/app.ts`, `apps/backend/src/server.ts` y `apps/backend/src/index.ts` (depende de T014, T018, T024); prueba mínima: integration T024.
- [ ] T026 [P] [UNIT] Crear cuatro providers fake y fixtures deterministas en `apps/backend/src/test/fakes/fakeLlmProvider.ts` y `apps/backend/src/test/fixtures/conversationFixtures.ts`; tipo: unit self-test de llamadas/errores controlados.

### Frontend foundation

- [ ] T027 [P] [UNIT] Probar parseo válido/inválido de contratos REST y SSE frontend en `apps/frontend/src/features/conversations/__tests__/conversationSchemas.test.ts`; tipo: contract unit, debe fallar antes de T028.
- [ ] T028 [P] [FE] Definir tipos/schemas REST y SSE en `apps/frontend/src/features/conversations/types/conversation.ts`, `sse.ts` y `schemas/conversationSchemas.ts` (depende de T027); prueba mínima: unit T027.
- [ ] T029 [P] [UNIT] Probar env, URL, cancelación Axios con transporte controlado y query keys estables en `apps/frontend/src/config/__tests__/env.test.ts`, `apps/frontend/src/features/conversations/api/__tests__/client.test.ts` y `apps/frontend/src/features/conversations/queries/__tests__/conversation-keys.test.ts`; tipo: unit, debe fallar antes de T030.
- [ ] T030 [P] [FE] Crear configuración frontend validada, cliente Axios cancelable y query keys en `apps/frontend/src/config/env.ts`, `apps/frontend/src/features/conversations/api/client.ts` y `queries/conversation-keys.ts` (depende de T029); prueba mínima: unit T029.
- [ ] T031 [P] [UNIT] Probar aplicación idempotente y rechazo de `updatedAt`/`attemptNo` antiguos en `apps/frontend/src/features/conversations/queries/__tests__/conversation-cache.test.ts`; tipo: unit, debe fallar antes de T032.
- [ ] T032 [FE] Implementar helpers de cache que apliquen únicamente los campos canónicos de `slot_update`, `turn_update` y `busy_update`, excluyendo explícitamente `runtimeStage`, en `apps/frontend/src/features/conversations/queries/conversation-cache.ts` (depende de T028–T031); prueba mínima: unit T031.

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

- [ ] T033 [P] [US1] [UNIT] Probar medición exacta/`upper_bound`, overhead y corpus ASCII, puntuación, Unicode/emoji, scripts no latinos y delimitadores en `apps/backend/src/infrastructure/llm/providers/__tests__/inputMeasurement.contract.test.ts`; tipo: contract unit, debe fallar antes de T053–T056.
- [ ] T034 [P] [US1] [UNIT] Probar mapping, cancelación, error seguro y una llamada de OpenAI en `apps/backend/src/infrastructure/llm/providers/__tests__/OpenAiProvider.test.ts`; tipo: contract unit.
- [ ] T035 [P] [US1] [UNIT] Probar mapping, cancelación, error seguro y una llamada de Google en `apps/backend/src/infrastructure/llm/providers/__tests__/GoogleProvider.test.ts`; tipo: contract unit.
- [ ] T036 [P] [US1] [UNIT] Probar mapping, cancelación, error seguro y una llamada de MiniMax en `apps/backend/src/infrastructure/llm/providers/__tests__/MiniMaxProvider.test.ts`; tipo: contract unit.
- [ ] T037 [P] [US1] [UNIT] Probar mapping, cancelación, error seguro y una llamada de Qwen en `apps/backend/src/infrastructure/llm/providers/__tests__/QwenProvider.test.ts`; tipo: contract unit.
- [ ] T038 [P] [US1] [UNIT] Probar bases paralelas, protección del prompt actual, `INVALID_PROMPT_SIZE`, persistencia por intento y consolidación con disponibles en `apps/backend/src/services/conversations/__tests__/TurnOrchestrator.test.ts`; tipo: unit.
- [ ] T039 [P] [US1] [INTEGRATION] Probar `202`, replay concurrente antes de busy, conflicto ID/prompt y título en `apps/backend/src/routes/conversations/__tests__/conversationCreation.integration.test.ts`; tipo: integration REST/PostgreSQL.
- [ ] T040 [P] [US1] [INTEGRATION] Probar pertenencia, headers, snapshot inicial, `slot_update`, `turn_update`, `busy_update`, publicación post-commit, cleanup, cierre terminal después del drenaje, ausencia de eventos o contenido parcial token por token y entrega del contenido únicamente como respuesta final normalizada en `apps/backend/src/routes/conversations/__tests__/turnEvents.integration.test.ts`; incluir casos deterministas donde un commit entre la suscripción y la finalización del snapshot se entrega después de este sin pérdida, y donde eventos viejos o duplicados almacenados en el buffer se descartan por `updatedAt` y `attemptNo`; tipo: integration SSE/PostgreSQL.
- [ ] T041 [P] [US1] [INTEGRATION] Probar CAS de retry, tres códigos 409, `attempt_no`, reconsolidación y Continue-without irreversible en `apps/backend/src/routes/conversations/__tests__/responseActions.integration.test.ts`; tipo: integration.
- [ ] T042 [P] [US1] [INTEGRATION] Probar un único `EventSource`, aplicación idempotente de eventos canónicos, `runtimeStage` local y efímero y, al coincidir turno terminal con `busy_update=false`, cierre del stream, limpieza del estado efímero y exactamente una invalidación final de las queries de detalle/turno; comprobar además que no existe fetch periódico y que un fallo SSE muestra un error visible sin activar fallback en `apps/frontend/src/features/conversations/__tests__/useTurnEvents.test.tsx`; tipo: frontend integration con hook, QueryClient y cache reales y boundary EventSource controlado.
- [ ] T043 [P] [US1] [INTEGRATION] Probar tabs/labels, estados aislados, busy controls y confirmación permanente en `apps/frontend/src/features/conversations/__tests__/comparison-workspace.test.tsx`; tipo: component integration.
- [ ] T044 [P] [US1] [E2E] Escribir flujo `202 → SSE → cuatro resultados → cierre` en `apps/frontend/e2e/conversation-comparison.spec.ts`; tipo: E2E.
- [ ] T045 [P] [US1] [E2E] Escribir retry manual, reconsolidación, 409 y Continue-without en `apps/frontend/e2e/conversation-response-actions.spec.ts`; tipo: E2E.
- [ ] T046 [P] [US1] [UNIT] Probar el registro literal de los cuatro adapters y la ausencia de factory en `apps/backend/src/infrastructure/llm/__tests__/providerRegistry.test.ts`; tipo: unit, debe fallar antes de T057.
- [ ] T047 [P] [US1] [UNIT] Probar subscribe, publicación ordenada y unsubscribe del publicador en `apps/backend/src/services/conversations/__tests__/turnEventPublisher.test.ts`; tipo: unit, debe fallar antes de T059.
- [ ] T048 [P] [US1] [UNIT] Probar contratos y errores de create, snapshot, retry y Continue-without con transporte controlado en `apps/frontend/src/features/conversations/api/__tests__/conversationsApi.test.ts`; tipo: contract unit, debe fallar antes de T065.
- [ ] T049 [P] [US1] [UNIT] Probar landmarks y foco del layout en `apps/frontend/src/components/layout/__tests__/AppShell.test.tsx`; tipo: component unit, debe fallar antes de T067.
- [ ] T050 [P] [US1] [UNIT] Probar trim, UUID estable y disabled por busy/mutación en `apps/frontend/src/features/conversations/components/__tests__/PromptComposer.test.tsx`; tipo: component unit, debe fallar antes de T071.

### Backend implementation

- [ ] T051 [P] [US1] [BE] Implementar create/replay atómico, título y cuatro slots en `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts`; prueba mínima: integration T039.
- [ ] T052 [P] [US1] [BE] Implementar transiciones CAS, `attempt_no`, recálculo y busy derivado en `apps/backend/src/infrastructure/postgres/repositories/turnRepository.ts`; prueba mínima: integration T041.
- [ ] T053 [P] [US1] [BE] Implementar `OpenAiProvider` y medición exacta/cota demostrable en `apps/backend/src/infrastructure/llm/providers/OpenAiProvider.ts`; prueba mínima: contract T033/T034.
- [ ] T054 [P] [US1] [BE] Implementar `GoogleProvider` y medición exacta/cota demostrable en `apps/backend/src/infrastructure/llm/providers/GoogleProvider.ts`; prueba mínima: contract T033/T035.
- [ ] T055 [P] [US1] [BE] Implementar `MiniMaxProvider` y medición exacta/cota demostrable en `apps/backend/src/infrastructure/llm/providers/MiniMaxProvider.ts`; prueba mínima: contract T033/T036.
- [ ] T056 [P] [US1] [BE] Implementar `QwenProvider` y medición exacta/cota demostrable en `apps/backend/src/infrastructure/llm/providers/QwenProvider.ts`; prueba mínima: contract T033/T037.
- [ ] T057 [US1] [BE] Construir registro literal de cuatro adapters en `apps/backend/src/infrastructure/llm/providerRegistry.ts` (depende de T053–T056, T046); prueba mínima: unit T046.
- [ ] T058 [P] [US1] [BE] Implementar protección técnica pura: umbral, compactación y `INVALID_PROMPT_SIZE` en `apps/backend/src/services/conversations/contextProtection.ts`; prueba mínima: unit T038 y T074.
- [ ] T059 [P] [US1] [BE] Implementar publicador en proceso tipado con entrega en orden de publicación y cleanup en `apps/backend/src/services/conversations/turnEventPublisher.ts` (depende de T047); prueba mínima: unit T047.
- [ ] T060 [US1] [BE] Implementar tres bases paralelas, Qwen y persistencia antes de publicar en `apps/backend/src/services/conversations/TurnOrchestrator.ts` (depende de T052, T057–T059); prueba mínima: unit T038 e integration T040.
- [ ] T061 [US1] [BE] Añadir retry manual, stale/reconsolidación y Continue-without irreversible en `apps/backend/src/services/conversations/TurnOrchestrator.ts` (depende de T060); prueba mínima: integration T041.
- [ ] T062 [US1] [BE] Implementar create/replay, snapshot y acciones en `apps/backend/src/services/conversations/ConversationService.ts` (depende de T051, T052, T061); prueba mínima: integration T039–T041.
- [ ] T063 [US1] [BE] Implementar controller SSE que registra el listener antes de leer PostgreSQL, bufferiza durante la lectura, emite el snapshot, descarta eventos ya representados mediante `updatedAt` y `attemptNo`, drena en orden los posteriores, continúa en vivo y cierra solo tras el drenaje cuando el estado más reciente sea terminal y no busy en `apps/backend/src/controllers/conversations/turnEventsController.ts` (depende de T059, T062); prueba mínima: integration T040.
- [ ] T064 [US1] [BE] Exponer create, get puntual, SSE, retry y Continue-without en `apps/backend/src/controllers/conversations/conversationController.ts` y `apps/backend/src/routes/conversations/conversationRoutes.ts` (depende de T062, T063); prueba mínima: integration T039–T041.

### Frontend implementation

- [ ] T065 [P] [US1] [FE] Implementar API validada de create, snapshot, retry y Continue-without en `apps/frontend/src/features/conversations/api/conversationsApi.ts` (depende de T048); prueba mínima: unit T048.
- [ ] T066 [US1] [FE] Implementar el ciclo SSE en `apps/frontend/src/features/conversations/hooks/useTurnEvents.ts`: aplicar actualizaciones canónicas mediante los helpers de cache, mantener `runtimeStage` como estado local por slot y, cuando coincidan turno terminal y `busy_update=false`, cerrar el stream, limpiar el estado efímero e invalidar exactamente una vez las queries de detalle/turno para converger con PostgreSQL; gestionar error visible sin fetch periódico ni fallback de transporte (depende de T032, T065); prueba mínima: frontend T042.
- [ ] T067 [P] [US1] [FE] Crear layout accesible en `apps/frontend/src/components/layout/AppShell.tsx` (depende de T049); prueba mínima: unit T049.
- [ ] T068 [P] [US1] [FE] Crear aviso textual busy/SSE en `apps/frontend/src/features/conversations/components/ConversationProcessingNotice.tsx`; prueba mínima: component T043.
- [ ] T069 [P] [US1] [FE] Crear tabs y panel de cuatro respuestas en `apps/frontend/src/features/conversations/components/ResponseTabs.tsx` y `ResponsePanel.tsx`; prueba mínima: component T043.
- [ ] T070 [P] [US1] [FE] Crear confirmación Continue-without en `apps/frontend/src/features/conversations/components/ContinueWithoutDialog.tsx`; prueba mínima: component T043 con foco/copy irreversible.
- [ ] T071 [P] [US1] [FE] Crear composer con trim, UUID estable y disabled por busy/mutación en `apps/frontend/src/features/conversations/components/PromptComposer.tsx` (depende de T050); prueba mínima: unit T050 e integration T043.
- [ ] T072 [P] [US1] [FE] Crear `TurnCard` con prompt, cuatro slots y runtime stage en `apps/frontend/src/features/conversations/components/TurnCard.tsx`; prueba mínima: component T043.
- [ ] T073 [US1] [SHARED] Integrar API, SSE y componentes en `apps/frontend/src/features/conversations/components/ConversationWorkspace.tsx` y `apps/frontend/src/App.tsx` (owner: frontend-builder; depende de T065–T072); prueba mínima: E2E T044/T045.

**Checkpoint**: MVP operativo con REST + SSE exclusivo, idempotencia inicial,
retry manual y Continue-without irreversible.

---

## Phase 4: User Story 2 — Continuar una conversación (P2)

**Goal**: crear turnos posteriores con contexto aislado, busy e idempotencia.

**Independent Test**: un segundo prompt usa solo el historial correcto; replay
precede a busy y protección técnica cubre cabe/compacta/falla sin subestimar.

### Tests for User Story 2

- [ ] T074 [P] [US2] [UNIT] Probar aislamiento base/Qwen, ventana, compactación, re-medición y `INVALID_PROMPT_SIZE` en `apps/backend/src/services/conversations/__tests__/ContextBuilder.test.ts`; tipo: unit.
- [ ] T075 [P] [US2] [INTEGRATION] Probar replay→busy→create, ordinal y liberación terminal en `apps/backend/src/routes/conversations/__tests__/conversationContinuation.integration.test.ts`; tipo: integration.
- [ ] T076 [P] [US2] [INTEGRATION] Probar createTurn, UUID estable, navegación, cache por IDs y nueva suscripción SSE en `apps/frontend/src/features/conversations/__tests__/conversation-continuation.test.tsx`; tipo: frontend integration.
- [ ] T077 [P] [US2] [UNIT] Probar timeline multiturno y aviso de contexto acotado sin contenido/mediciones/límites en `apps/frontend/src/features/conversations/__tests__/TurnList.test.tsx` y `apps/frontend/src/features/conversations/__tests__/ContextWindowNotice.test.tsx`; tipo: component unit, debe fallar antes de T085.
- [ ] T078 [P] [US2] [E2E] Escribir E2E multiturno de aislamiento, busy por conversación y protección de contexto en `apps/frontend/e2e/conversation-continuation.spec.ts`; tipo: E2E.

### Implementation for User Story 2

- [ ] T079 [P] [US2] [BE] Implementar consultas aisladas base/Qwen en `apps/backend/src/infrastructure/postgres/repositories/contextRepository.ts`; prueba mínima: integration de fixtures en T074.
- [ ] T080 [US2] [BE] Implementar composición por turnos sobre `contextProtection` en `apps/backend/src/services/conversations/ContextBuilder.ts` (depende de T058, T079); prueba mínima: unit T074.
- [ ] T081 [US2] [BE] Integrar `ContextBuilder` antes de cada adapter y omitir Continue-without en Qwen en `apps/backend/src/services/conversations/TurnOrchestrator.ts` (depende de T080); prueba mínima: unit T074 y E2E T078.
- [ ] T082 [US2] [BE] Implementar lock, replay, conflicto, busy y ordinal para turno posterior en `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts` (depende de T051, T052); prueba mínima: integration T075.
- [ ] T083 [US2] [BE] Exponer `POST /conversations/:id/turns` en `apps/backend/src/services/conversations/ConversationService.ts`, `conversationController.ts` y `conversationRoutes.ts` (depende de T081, T082); prueba mínima: integration T075.
- [ ] T084 [P] [US2] [FE] Añadir createTurn idempotente en `apps/frontend/src/features/conversations/api/conversationsApi.ts` y `hooks/useConversationExecution.ts`; prueba mínima: frontend T076.
- [ ] T085 [P] [US2] [FE] Crear timeline multiturno y aviso contextual en `apps/frontend/src/features/conversations/components/TurnList.tsx` y `ContextWindowNotice.tsx`; prueba mínima: component T077.
- [ ] T086 [US2] [FE] Integrar follow-up, timeline, cache por conversación y SSE del turno activo en `apps/frontend/src/features/conversations/components/ConversationWorkspace.tsx` (depende de T084, T085); prueba mínima: frontend T076 y E2E T078.

**Checkpoint**: multiturno aislado y protegido, sin presupuesto de producto ni
bloqueo global.

---

## Phase 5: User Story 3 — Recuperar y gestionar conversaciones (P3)

**Goal**: sidebar/historial infinitos, rename, Delete condicionado por busy y
colapso local.

**Independent Test**: siete turnos cargan 3/3/1 sin salto; Rename persiste durante
busy y Delete responde 409 hasta quedar terminal.

### Tests for User Story 3

- [ ] T087 [P] [US3] [UNIT] Probar encode/decode y rechazo de cursores en `apps/backend/src/utils/__tests__/cursor.test.ts`; tipo: unit.
- [ ] T088 [P] [US3] [INTEGRATION] Probar sidebar estable y bloques 3/3/1 completos en `apps/backend/src/infrastructure/postgres/repositories/__tests__/conversationHistoryRepository.integration.test.ts`; tipo: integration.
- [ ] T089 [P] [US3] [INTEGRATION] Probar list/detail/rename, Delete busy, cascade y errores en `apps/backend/src/routes/conversations/__tests__/conversationManagement.integration.test.ts`; tipo: integration.
- [ ] T090 [P] [US3] [INTEGRATION] Probar queries infinitas, autofill y compensación al anteponer en `apps/frontend/src/features/conversations/__tests__/conversation-history.test.tsx`; tipo: frontend integration.
- [ ] T091 [P] [US3] [INTEGRATION] Probar menú, dialogs, foco, contador, busy y colapso local en `apps/frontend/src/features/conversations/__tests__/conversation-management.test.tsx`; tipo: component integration.
- [ ] T092 [P] [US3] [E2E] Escribir E2E de reapertura y scroll histórico 3/3/1 en `apps/frontend/e2e/conversation-history.spec.ts`; tipo: E2E.
- [ ] T093 [P] [US3] [E2E] Escribir E2E de sidebar, Rename, Delete busy/cascade y error SSE al reabrir en `apps/frontend/e2e/conversation-management.spec.ts`; tipo: E2E.

### Implementation for User Story 3

- [ ] T094 [US3] [BE] Implementar cursor, sidebar y bloques históricos en `apps/backend/src/utils/cursor.ts` y `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts`; prueba mínima: unit T087 e integration T088.
- [ ] T095 [US3] [BE] Implementar detail, Rename y Delete transaccional con busy/cascade en `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts` y `apps/backend/src/services/conversations/ConversationService.ts` (depende de T094); prueba mínima: integration T089.
- [ ] T096 [US3] [BE] Exponer list/detail/history/Rename/Delete en `apps/backend/src/controllers/conversations/conversationController.ts` y `apps/backend/src/routes/conversations/conversationRoutes.ts` (depende de T095); prueba mínima: integration T089.
- [ ] T097 [P] [US3] [FE] Implementar API y queries infinitas de list/detail/history/Rename/Delete en `apps/frontend/src/features/conversations/api/conversationsApi.ts` y `hooks/useConversationQueries.ts`; prueba mínima: frontend T090.
- [ ] T098 [P] [US3] [FE] Crear sidebar con fecha, sentinel inferior y autofill en `apps/frontend/src/features/conversations/components/ConversationSidebar.tsx`; prueba mínima: frontend T090.
- [ ] T099 [P] [US3] [FE] Crear menú y dialogs Rename/Delete accesibles en `apps/frontend/src/features/conversations/components/ConversationMenu.tsx`, `RenameConversationDialog.tsx` y `DeleteConversationDialog.tsx`; prueba mínima: component T091.
- [ ] T100 [P] [US3] [FE] Crear sentinel superior, compensación y colapso local en `apps/frontend/src/features/conversations/components/HistoryTopSentinel.tsx`, `TurnList.tsx` y `CollapsibleHistoryMessage.tsx`; prueba mínima: frontend T090/T091.
- [ ] T101 [US3] [SHARED] Integrar selección, historial, mutations, dialogs y reapertura SSE en `apps/frontend/src/components/layout/AppShell.tsx` y `ConversationWorkspace.tsx` (owner: frontend-builder; depende de T097–T100); prueba mínima: E2E T092/T093.

**Checkpoint**: historial navegable sin paginación visible; gestión respeta busy.

---

## Phase 6: User Story 4 — Iniciar un contexto nuevo (P4)

**Goal**: mantener un único draft vacío local sin borrar ni persistir historial.

**Independent Test**: Nueva conversación no inserta datos; el primer prompt crea
el recurso sin contexto previo y conserva conversaciones existentes.

- [ ] T102 [P] [US4] [UNIT] Probar draft repetido, cero persistencia y conservación de lista en `apps/frontend/src/features/conversations/__tests__/new-conversation-draft.test.tsx`; tipo: frontend unit.
- [ ] T103 [P] [US4] [E2E] Escribir primer prompt de draft y contexto aislado en `apps/frontend/e2e/new-conversation.spec.ts`; tipo: E2E.
- [ ] T104 [US4] [FE] Implementar draft/selección local y acción Nueva conversación en `apps/frontend/src/components/layout/AppShell.tsx` y `ConversationSidebar.tsx`; prueba mínima: unit T102.
- [ ] T105 [US4] [FE] Enviar primer prompt por `POST /conversations`, seleccionar ID y conservar historial en `apps/frontend/src/features/conversations/components/ConversationWorkspace.tsx` (depende de T104); prueba mínima: E2E T103.

**Checkpoint**: no existe endpoint clear ni conversación vacía persistida.

---

## Phase 7: Acceptance, recovery and quality gates

**Purpose**: cerrar v1 con evidencia medible y checks separados.

- [ ] T106 [P] [INTEGRATION] Escribir fixture/versionado de recovery `pending`/`running` y prueba sobre la misma DB en `apps/backend/src/services/conversations/__tests__/fixtures/recoveryCases.ts` y `recovery.integration.test.ts`; tipo: integration SC-002, debe fallar antes de T107.
- [ ] T107 [BE] Implementar `recoverInterruptedTurns()` antes de listen en `apps/backend/src/services/conversations/recoverInterruptedTurns.ts` y `apps/backend/src/server.ts` (depende de T106); prueba mínima: integration T106 al 100% del fixture.
- [ ] T108 [P] [UNIT] Probar ausencia de prompts, respuestas, payloads SSE, mediciones, límites, headers y secretos en `apps/backend/src/services/conversations/__tests__/observabilitySafety.test.ts`; tipo: unit, debe fallar antes de T109.
- [ ] T109 [BE] Añadir logs Pino seguros de IDs, busy, replay, slot, duración, SSE y recovery en `apps/backend/src/middleware/logger/requestContext.ts`, `TurnOrchestrator.ts` y `turnEventsController.ts` (depende de T108); prueba mínima: unit T108.
- [ ] T110 [P] [BE-AUDIT] Auditar read-only `apps/backend/` y `db/changelogs/` contra spec, plan, contratos y principios I–IV, VI–IX (owner: `backend-auditor`; depende de T064, T083, T096, T107 y T109); inputs: archivos de producción de esas cadenas; output: reporte del agente con pass/fail, severidad, archivo y línea, sin modificar archivos ni ejecutar pruebas.
- [ ] T111 [P] [FE-AUDIT] Auditar read-only `apps/frontend/` y `packages/ui/` contra spec, plan, contratos y principios I, V, VII–IX (owner: `frontend-auditor`; depende de T073, T086, T101 y T105); inputs: archivos de producción de esas cadenas; output: reporte del agente con pass/fail, severidad, archivo y línea, sin modificar archivos ni ejecutar pruebas.

**Audit gate**: un hallazgo bloqueante de T110/T111 crea una tarea builder
concreta y exige reauditoría; no avanzan los quality gates dependientes mientras
quede un hallazgo bloqueante abierto.

- [ ] T112 [P] [INTEGRATION] Crear fixture ≤5 casos y runner de consolidación ≥90% en `apps/backend/src/services/conversations/__tests__/fixtures/consolidation-evaluation.json` y `apps/backend/src/acceptance/consolidationEvaluation.ts` (depende de T110); tipo: integration acceptance SC-005 con providers fake.
- [ ] T113 [P] [INTEGRATION] Implementar estados terminales ≤60 s con providers fake en `apps/backend/src/acceptance/terminalStates.acceptance.test.ts` (depende de T110); tipo: integration acceptance SC-001.
- [ ] T114 [P] [PERF] Implementar latencia `202`/primer historial p95 <1 s en `apps/backend/src/acceptance/latency.acceptance.test.ts` (owner: `performance-test-runner`; depende de T110); tipo: performance acceptance SC-010.
- [ ] T115 [P] [UX] Diseñar tareas, escenarios, criterios observables y escalas subjetivas en `specs/001-compare-llm-responses/usability/sc-003-protocol.md` (depende de T111); prueba mínima: revisión Product/UX de cobertura SC-003/SC-004.
- [ ] T116 [UX] Ejecutar participantes y registrar numerador, denominador, porcentaje y pass/fail por SC en `specs/001-compare-llm-responses/usability/sc-004-results.md` (depende de T115); tipo: aceptación Product/UX, umbral 90% separado.
- [ ] T117 [INTEGRATION] Ejecutar migrate-from-zero, Liquibase validate y rollback con `docker-compose.yml` y `db/changelogs/db.changelog-master.xml` (depende de T110); tipo: integration DB, sin corregir fallos dentro de esta tarea.
- [ ] T118 [P] [UNIT] Ejecutar las suites unitarias backend y frontend desde `apps/backend/package.json` y `apps/frontend/package.json` (depende de T110, T111); registrar fallos como tareas concretas.
- [ ] T119 [P] [INTEGRATION] Ejecutar las suites de integración backend y frontend desde `apps/backend/package.json` y `apps/frontend/package.json` (depende de T110, T111); registrar fallos como tareas concretas.
- [ ] T120 [E2E] Ejecutar Playwright con fakes desde `apps/frontend/playwright.config.ts` (depende de T110, T111 y de las historias implementadas); tipo: E2E, registrar fallos como tareas concretas.
- [ ] T121 [SHARED] Ejecutar `pnpm typecheck`, `pnpm lint` y `pnpm build` desde `package.json` (owner: integration-owner; depende de T110, T111); prueba mínima: los tres comandos exitosos, sin corregir hallazgos aquí.
- [ ] T122 [DOC] Ejecutar todos los smoke flows de `specs/001-compare-llm-responses/quickstart.md` (depende de T112–T121); prueba mínima: aceptación manual documentada, discrepancias como tareas concretas.

---

## Dependencies and execution order

### Phase dependencies

- Phase 1 no tiene dependencias.
- Phase 2 depende de Phase 1 y bloquea todas las historias.
- US1 depende de Phase 2 y constituye el MVP.
- US2 amplía US1 con turnos/contexto.
- US3 puede adelantar componentes aislados tras Phase 2; integración T101 depende
  del workspace/SSE de US1–US2.
- US4 depende de selección/sidebar de US3.
- Phase 7 depende de las historias incluidas en la entrega.

### Graph

```text
Setup → Foundational → US1 (MVP) → US2 → US3 → US4
                         └──────────────→ Acceptance
```

### Critical chains

- Setup: `T002 → T003 → T004`; `T001/T002 → T005 → T006`.
- DB: `T009 → T010/T011 → T012 → T110 → T117`.
- Backend base: `T013 → T014 → T025`; `T020 → T021`; `T022 → T023`.
- Frontend base: `T027 → T028`; `T029 → T030`.
- Providers: `T033–T037 → T053–T056`; `T046/T053–T056 → T057 → T060`.
- SSE: `T031 → T032`; `T047 → T059`; `T040/T059 → T063/T064 → T066 → T073`.
- Frontend US1: `T048 → T065`; `T049 → T067`; `T050 → T071`.
- Context: `T033 → T058`; `T074 → T079 → T080 → T081`; `T077 → T085`.
- US2: `T075 → T082/T083`; `T076 → T084/T086`.
- US3: `T087–T091 → T094–T101`.
- US4: `T102/T103 → T104 → T105`.
- Recovery: `T106 → T107 → T110`; frontend: `T105 → T111`;
  UX: `T111 → T115 → T116`.
- Audits: `T064/T083/T096/T107/T109 → T110` y
  `T073/T086/T101/T105 → T111`; ambos bloquean T118–T122.

## Parallel opportunities

- Setup: T002 habilita las cadenas separadas T003→T004 y T005→T006;
  T007/T008 conservan sus lanes sin compartir archivos.
- Foundation: lanes DB, backend contracts/config, fakes y frontend contracts.
- US1: T033–T050; cuatro adapters T053–T056; componentes T067–T072.
- US2: T074–T078; backend context y frontend components en archivos separados.
- US3: T087–T093; T097–T100.
- Final: T106, T108, T110–T115, T117–T119; T110 y T111 pueden ejecutarse en
  paralelo después de sus dependencias de producción.

## Parallel examples

### US1

```text
Tests:     T033–T050
Adapters:  T053 + T054 + T055 + T056
Frontend:  T067 + T068 + T069 + T070 + T071 + T072
```

### US2

```text
Tests:     T074 + T075 + T076 + T077 + T078
Lanes:     T079/T080/T081 (backend) + T084/T085 (frontend), luego T086
```

### US3

```text
Tests:     T087 + T088 + T089 + T090 + T091 + T092 + T093
Frontend:  T097 + T098 + T099 + T100, luego T101
```

### US4

```text
Tests: T102 + T103
Flow:  T104 → T105
```

## Domain ownership

| Domain | Primary owner | Scope |
|---|---|---|
| FE | `frontend-builder` | `apps/frontend` composition/state |
| UI | `frontend-builder` | `packages/ui` primitives only |
| BE | `backend-builder` | API, orchestration, SSE and LLM adapters |
| DB | `backend-builder` | Liquibase/schema validation |
| FE-AUDIT | `frontend-auditor` | read-only frontend/UI boundary review and agent report |
| BE-AUDIT | `backend-auditor` | read-only backend/DB boundary review and agent report |
| UNIT | `unit-test-runner` | isolated unit and contract-unit tests |
| INTEGRATION | `integration-test-runner` | browserless real-component boundaries |
| E2E | `e2e-test-runner` | Playwright browser journeys |
| PERF | `performance-test-runner` | latency/distribution acceptance in controlled non-production environments |
| UX | Product/UX | participant protocol/evidence |
| DOC | integration owner | env samples/quickstart validation |
| SHARED | named owner | cross-boundary integration/checks |

Builders do not create, modify, or execute tests. Auditors remain read-only,
do not execute tests, and report findings without changing repository files.

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

1. Completar T001–T032.
2. Escribir T033–T050 y confirmar que fallan.
3. Implementar T051–T073.
4. Validar US1 independientemente.

### Incremental delivery

1. US1: comparación/consolidación y recuperación manual en tiempo real.
2. US2: multiturno con contexto aislado/protegido.
3. US3: recuperación y gestión del historial.
4. US4: nuevo contexto vacío local.
5. Phase 7: recovery, auditorías read-only, aceptación automatizada y Product/UX.

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
- Un hallazgo de auditoría nunca se corrige dentro de la tarea de auditoría;
  genera trabajo builder separado y una nueva revisión.

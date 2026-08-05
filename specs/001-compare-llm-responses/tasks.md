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
  `INTEGRATION`, `E2E`, `PERF`, `UX` o `SHARED`.
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
- [ ] T008 [P] [BE] Documentar las variables backend vigentes de providers, límites, ratio, ventana y sidebar en `apps/backend/.env.sample`; prueba mínima: revisión contra la sección 2 de `specs/001-compare-llm-responses/quickstart.md` sin variables de polling.
- [ ] T009 [P] [FE] Documentar las variables frontend vigentes de API y colapso en `apps/frontend/.env.sample`; prueba mínima: revisión contra la sección 3 de `specs/001-compare-llm-responses/quickstart.md` sin variables de polling.

**Checkpoint**: no se añaden SDKs LLM preventivos, librerías SSE, retry automático,
colas ni infraestructura genérica de idempotencia.

---

## Phase 2: Foundational

**Purpose**: esquema, configuración, contratos y utilidades que bloquean historias.

### Database / Liquibase

- [ ] T010 [P] [INTEGRATION] Escribir validación de tres tablas, cascades, checks, uniques, índices parciales y restauración del estado anterior tras rollback en `db/tests/validate-model-fuse-schema.sql`; tipo: integration PostgreSQL, debe fallar antes de T011–T013.
- [ ] T011 [DB] Crear `conversations` y `turns` con request IDs, ordinal, estados, cascades, índice único parcial de turno activo y rollback explícito en `db/changelogs/conversations/001-create-conversations-and-turns.sql`; prueba mínima: integration T010.
- [ ] T012 [DB] Crear `model_responses` con cuatro slots, errores, `continued_without_at`, `is_stale`, `attempt_no`, metadata, checks/índices busy y rollback explícito en `db/changelogs/messages/001-create-model-responses.sql` (depende de T011); prueba mínima: integration T010.
- [ ] T013 [DB] Incluir ambos módulos en `db/changelogs/conversations/db.changelog-conversations.xml`, `db/changelogs/messages/db.changelog-messages.xml` y `db/changelogs/db.changelog-master.xml` (depende de T011, T012); prueba mínima: Liquibase validate y T010.

### Backend foundation

- [ ] T014 [P] [UNIT] Probar credenciales requeridas, timeouts, ventana, ratio `(0,1]`, límites por deployment y sidebar en `apps/backend/src/infrastructure/config/__tests__/env.test.ts`; tipo: unit, debe fallar antes de T015.
- [ ] T015 [BE] Implementar configuración Zod segura en `apps/backend/src/infrastructure/config/env.ts` (depende de T014); prueba mínima: unit T014.
- [ ] T016 [P] [BE] Definir contratos REST/SSE de conversación, turno, slots, eventos y errores en `apps/backend/src/types/conversations.ts` y `apps/backend/src/types/sse.ts`; prueba mínima: typecheck y contract tests de T041.
- [ ] T017 [P] [BE] Definir `LlmProvider`, `InputTokenMeasurement`, resultado normalizado y error seguro en `apps/backend/src/types/llm.ts` y `apps/backend/src/services/llm/llmErrors.ts`; prueba mínima: typecheck y contract tests T034–T038.
- [ ] T018 [P] [UNIT] Probar UUIDs, prompt, rename, IDs, slots y cursores inválidos en `apps/backend/src/middleware/validation/__tests__/conversationSchemas.test.ts`; tipo: unit, debe fallar antes de T019.
- [ ] T019 [BE] Implementar schemas Zod y middleware de error saneado en `apps/backend/src/middleware/validation/conversationSchemas.ts`, `validateRequest.ts` y `apps/backend/src/types/apiError.ts` (depende de T018); prueba mínima: unit T018.
- [ ] T020 [P] [BE] Crear helper transaccional PostgreSQL en `apps/backend/src/infrastructure/postgres/transaction.ts`; prueba mínima: integration de commit/rollback en T040.
- [ ] T021 [P] [UNIT] Probar el mapper PostgreSQL→contrato sin secretos ni mediciones en `apps/backend/src/infrastructure/postgres/mappers/__tests__/conversationMapper.test.ts`; tipo: unit, debe fallar antes de T022.
- [ ] T022 [P] [BE] Crear mapper PostgreSQL→contrato sin secretos ni mediciones en `apps/backend/src/infrastructure/postgres/mappers/conversationMapper.ts` (depende de T021); prueba mínima: unit T021.
- [ ] T023 [P] [UNIT] Probar cálculo de turno y busy desde cuatro slots en `apps/backend/src/services/conversations/__tests__/turnState.test.ts`; tipo: unit, debe fallar antes de T024.
- [ ] T024 [BE] Implementar cálculo puro de turno/`hasWorkInProgress` en `apps/backend/src/services/conversations/turnState.ts` (depende de T023); prueba mínima: unit T023.
- [ ] T025 [P] [INTEGRATION] Probar `createApp()`, error JSON y separación start/stop en `apps/backend/src/__tests__/app-lifecycle.test.ts`; tipo: integration, debe fallar antes de T026.
- [ ] T026 [BE] Crear `apiRouter`, `createApp()`, `startServer()` y limitar `index.ts` a start/stop en `apps/backend/src/routes/apiRouter.ts`, `apps/backend/src/app.ts`, `apps/backend/src/server.ts` y `apps/backend/src/index.ts` (depende de T015, T019, T025); prueba mínima: integration T025.
- [ ] T027 [P] [UNIT] Crear cuatro providers fake y fixtures deterministas en `apps/backend/src/test/fakes/fakeLlmProvider.ts` y `apps/backend/src/test/fixtures/conversationFixtures.ts`; tipo: unit self-test de llamadas/errores controlados.

### Frontend foundation

- [ ] T028 [P] [UNIT] Probar parseo válido/inválido de contratos REST y SSE frontend en `apps/frontend/src/features/conversations/__tests__/conversationSchemas.test.ts`; tipo: contract unit, debe fallar antes de T029.
- [ ] T029 [P] [FE] Definir tipos/schemas REST y SSE en `apps/frontend/src/features/conversations/types/conversation.ts`, `sse.ts` y `schemas/conversationSchemas.ts` (depende de T028); prueba mínima: unit T028.
- [ ] T030 [P] [UNIT] Probar env, URL, cancelación Axios con transporte controlado y query keys estables en `apps/frontend/src/config/__tests__/env.test.ts`, `apps/frontend/src/features/conversations/api/__tests__/client.test.ts` y `apps/frontend/src/features/conversations/queries/__tests__/conversation-keys.test.ts`; tipo: unit, debe fallar antes de T031.
- [ ] T031 [P] [FE] Crear configuración frontend validada, cliente Axios cancelable y query keys en `apps/frontend/src/config/env.ts`, `apps/frontend/src/features/conversations/api/client.ts` y `queries/conversation-keys.ts` (depende de T030); prueba mínima: unit T030.
- [ ] T032 [P] [UNIT] Probar aplicación idempotente y rechazo de `updatedAt`/`attemptNo` antiguos en `apps/frontend/src/features/conversations/queries/__tests__/conversation-cache.test.ts`; tipo: unit, debe fallar antes de T033.
- [ ] T033 [FE] Implementar helpers de cache que apliquen únicamente los campos canónicos de `slot_update`, `turn_update` y `busy_update`, excluyendo explícitamente `runtimeStage`, en `apps/frontend/src/features/conversations/queries/conversation-cache.ts` (depende de T029–T032); prueba mínima: unit T032.

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

- [ ] T034 [P] [US1] [UNIT] Probar medición exacta/`upper_bound`, overhead y corpus ASCII, puntuación, Unicode/emoji, scripts no latinos y delimitadores en `apps/backend/src/infrastructure/llm/providers/__tests__/inputMeasurement.contract.test.ts`; tipo: contract unit, debe fallar antes de T054–T057.
- [ ] T035 [P] [US1] [UNIT] Probar mapping, cancelación, error seguro y una llamada de OpenAI en `apps/backend/src/infrastructure/llm/providers/__tests__/OpenAiProvider.test.ts`; tipo: contract unit.
- [ ] T036 [P] [US1] [UNIT] Probar mapping, cancelación, error seguro y una llamada de Google en `apps/backend/src/infrastructure/llm/providers/__tests__/GoogleProvider.test.ts`; tipo: contract unit.
- [ ] T037 [P] [US1] [UNIT] Probar mapping, cancelación, error seguro y una llamada de MiniMax en `apps/backend/src/infrastructure/llm/providers/__tests__/MiniMaxProvider.test.ts`; tipo: contract unit.
- [ ] T038 [P] [US1] [UNIT] Probar mapping, cancelación, error seguro y una llamada de Qwen en `apps/backend/src/infrastructure/llm/providers/__tests__/QwenProvider.test.ts`; tipo: contract unit.
- [ ] T039 [P] [US1] [UNIT] Probar bases paralelas, protección del prompt actual, `INVALID_PROMPT_SIZE`, persistencia por intento y consolidación con disponibles en `apps/backend/src/services/conversations/__tests__/TurnOrchestrator.test.ts`; tipo: unit.
- [ ] T040 [P] [US1] [INTEGRATION] Probar `202`, replay concurrente antes de busy, conflicto ID/prompt y título en `apps/backend/src/routes/conversations/__tests__/conversationCreation.integration.test.ts`; tipo: integration REST/PostgreSQL.
- [ ] T041 [P] [US1] [INTEGRATION] Probar pertenencia, headers, snapshot inicial, `slot_update`, `turn_update`, `busy_update`, publicación post-commit, cleanup, cierre terminal después del drenaje, ausencia de eventos o contenido parcial token por token y entrega del contenido únicamente como respuesta final normalizada en `apps/backend/src/routes/conversations/__tests__/turnEvents.integration.test.ts`; incluir casos deterministas donde un commit entre la suscripción y la finalización del snapshot se entrega después de este sin pérdida, y donde eventos viejos o duplicados almacenados en el buffer se descartan por `updatedAt` y `attemptNo`; tipo: integration SSE/PostgreSQL.
- [ ] T042 [P] [US1] [INTEGRATION] Probar CAS de retry, tres códigos 409, `attempt_no`, reconsolidación y Continue-without irreversible en `apps/backend/src/routes/conversations/__tests__/responseActions.integration.test.ts`; tipo: integration.
- [ ] T043 [P] [US1] [INTEGRATION] Probar un único `EventSource`, aplicación idempotente de eventos canónicos, `runtimeStage` local y efímero y, al coincidir turno terminal con `busy_update=false`, cierre del stream, limpieza del estado efímero y exactamente una invalidación final de las queries de detalle/turno; comprobar además que no existe fetch periódico y que un fallo SSE muestra un error visible sin activar fallback en `apps/frontend/src/features/conversations/__tests__/useTurnEvents.test.tsx`; tipo: frontend integration con hook, QueryClient y cache reales y boundary EventSource controlado.
- [ ] T044 [P] [US1] [INTEGRATION] Probar tabs/labels, estados aislados, busy controls y confirmación permanente en `apps/frontend/src/features/conversations/__tests__/comparison-workspace.test.tsx`; tipo: component integration.
- [ ] T045 [P] [US1] [E2E] Escribir flujo `202 → SSE → cuatro resultados → cierre` en `apps/frontend/e2e/conversation-comparison.spec.ts`; tipo: E2E.
- [ ] T046 [P] [US1] [E2E] Escribir retry manual, reconsolidación, 409 y Continue-without en `apps/frontend/e2e/conversation-response-actions.spec.ts`; tipo: E2E.
- [ ] T047 [P] [US1] [UNIT] Probar el registro literal de los cuatro adapters y la ausencia de factory en `apps/backend/src/infrastructure/llm/__tests__/providerRegistry.test.ts`; tipo: unit, debe fallar antes de T058.
- [ ] T048 [P] [US1] [UNIT] Probar subscribe, publicación ordenada y unsubscribe del publicador en `apps/backend/src/services/conversations/__tests__/turnEventPublisher.test.ts`; tipo: unit, debe fallar antes de T060.
- [ ] T049 [P] [US1] [UNIT] Probar contratos y errores de create, snapshot, retry y Continue-without con transporte controlado en `apps/frontend/src/features/conversations/api/__tests__/conversationsApi.test.ts`; tipo: contract unit, debe fallar antes de T066.
- [ ] T050 [P] [US1] [UNIT] Probar landmarks y foco del layout en `apps/frontend/src/components/layout/__tests__/AppShell.test.tsx`; tipo: component unit, debe fallar antes de T068.
- [ ] T051 [P] [US1] [UNIT] Probar trim, UUID estable y disabled por busy/mutación en `apps/frontend/src/features/conversations/components/__tests__/PromptComposer.test.tsx`; tipo: component unit, debe fallar antes de T072.

### Backend implementation

- [ ] T052 [P] [US1] [BE] Implementar create/replay atómico, título y cuatro slots en `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts`; prueba mínima: integration T040.
- [ ] T053 [P] [US1] [BE] Implementar transiciones CAS, `attempt_no`, recálculo y busy derivado en `apps/backend/src/infrastructure/postgres/repositories/turnRepository.ts`; prueba mínima: integration T042.
- [ ] T054 [P] [US1] [BE] Implementar `OpenAiProvider` y medición exacta/cota demostrable en `apps/backend/src/infrastructure/llm/providers/OpenAiProvider.ts`; prueba mínima: contract T034/T035.
- [ ] T055 [P] [US1] [BE] Implementar `GoogleProvider` y medición exacta/cota demostrable en `apps/backend/src/infrastructure/llm/providers/GoogleProvider.ts`; prueba mínima: contract T034/T036.
- [ ] T056 [P] [US1] [BE] Implementar `MiniMaxProvider` y medición exacta/cota demostrable en `apps/backend/src/infrastructure/llm/providers/MiniMaxProvider.ts`; prueba mínima: contract T034/T037.
- [ ] T057 [P] [US1] [BE] Implementar `QwenProvider` y medición exacta/cota demostrable en `apps/backend/src/infrastructure/llm/providers/QwenProvider.ts`; prueba mínima: contract T034/T038.
- [ ] T058 [US1] [BE] Construir registro literal de cuatro adapters en `apps/backend/src/infrastructure/llm/providerRegistry.ts` (depende de T054–T057, T047); prueba mínima: unit T047.
- [ ] T059 [P] [US1] [BE] Implementar protección técnica pura: umbral, compactación y `INVALID_PROMPT_SIZE` en `apps/backend/src/services/conversations/contextProtection.ts`; prueba mínima: unit T039 y T075.
- [ ] T060 [P] [US1] [BE] Implementar publicador en proceso tipado con entrega en orden de publicación y cleanup en `apps/backend/src/services/conversations/turnEventPublisher.ts` (depende de T048); prueba mínima: unit T048.
- [ ] T061 [US1] [BE] Implementar tres bases paralelas, Qwen y persistencia antes de publicar en `apps/backend/src/services/conversations/TurnOrchestrator.ts` (depende de T053, T058–T060); prueba mínima: unit T039 e integration T041.
- [ ] T062 [US1] [BE] Añadir retry manual, stale/reconsolidación y Continue-without irreversible en `apps/backend/src/services/conversations/TurnOrchestrator.ts` (depende de T061); prueba mínima: integration T042.
- [ ] T063 [US1] [BE] Implementar create/replay, snapshot y acciones en `apps/backend/src/services/conversations/ConversationService.ts` (depende de T052, T053, T062); prueba mínima: integration T040–T042.
- [ ] T064 [US1] [BE] Implementar controller SSE que registra el listener antes de leer PostgreSQL, bufferiza durante la lectura, emite el snapshot, descarta eventos ya representados mediante `updatedAt` y `attemptNo`, drena en orden los posteriores, continúa en vivo y cierra solo tras el drenaje cuando el estado más reciente sea terminal y no busy en `apps/backend/src/controllers/conversations/turnEventsController.ts` (depende de T060, T063); prueba mínima: integration T041.
- [ ] T065 [US1] [BE] Exponer create, get puntual, SSE, retry y Continue-without en `apps/backend/src/controllers/conversations/conversationController.ts` y `apps/backend/src/routes/conversations/conversationRoutes.ts` (depende de T063, T064); prueba mínima: integration T040–T042.

### Frontend implementation

- [ ] T066 [P] [US1] [FE] Implementar API validada de create, snapshot, retry y Continue-without en `apps/frontend/src/features/conversations/api/conversationsApi.ts` (depende de T049); prueba mínima: unit T049.
- [ ] T067 [US1] [FE] Implementar el ciclo SSE en `apps/frontend/src/features/conversations/hooks/useTurnEvents.ts`: aplicar actualizaciones canónicas mediante los helpers de cache, mantener `runtimeStage` como estado local por slot y, cuando coincidan turno terminal y `busy_update=false`, cerrar el stream, limpiar el estado efímero e invalidar exactamente una vez las queries de detalle/turno para converger con PostgreSQL; gestionar error visible sin fetch periódico ni fallback de transporte (depende de T033, T066); prueba mínima: frontend T043.
- [ ] T068 [P] [US1] [FE] Crear layout accesible en `apps/frontend/src/components/layout/AppShell.tsx` (depende de T050); prueba mínima: unit T050.
- [ ] T069 [P] [US1] [FE] Crear aviso textual busy/SSE en `apps/frontend/src/features/conversations/components/ConversationProcessingNotice.tsx`; prueba mínima: component T044.
- [ ] T070 [P] [US1] [FE] Crear tabs y panel de cuatro respuestas en `apps/frontend/src/features/conversations/components/ResponseTabs.tsx` y `ResponsePanel.tsx`; prueba mínima: component T044.
- [ ] T071 [P] [US1] [FE] Crear confirmación Continue-without en `apps/frontend/src/features/conversations/components/ContinueWithoutDialog.tsx`; prueba mínima: component T044 con foco/copy irreversible.
- [ ] T072 [P] [US1] [FE] Crear composer con trim, UUID estable y disabled por busy/mutación en `apps/frontend/src/features/conversations/components/PromptComposer.tsx` (depende de T051); prueba mínima: unit T051 e integration T044.
- [ ] T073 [P] [US1] [FE] Crear `TurnCard` con prompt, cuatro slots y runtime stage en `apps/frontend/src/features/conversations/components/TurnCard.tsx`; prueba mínima: component T044.
- [ ] T074 [US1] [SHARED] Integrar API, SSE y componentes en `apps/frontend/src/features/conversations/components/ConversationWorkspace.tsx` y `apps/frontend/src/App.tsx` (owner: frontend-builder; depende de T066–T073); prueba mínima: E2E T045/T046.

**Checkpoint**: MVP operativo con REST + SSE exclusivo, idempotencia inicial,
retry manual y Continue-without irreversible.

---

## Phase 4: User Story 2 — Continuar una conversación (P2)

**Goal**: crear turnos posteriores con contexto aislado, busy e idempotencia.

**Independent Test**: un segundo prompt usa solo el historial correcto; replay
precede a busy y protección técnica cubre cabe/compacta/falla sin subestimar.

### Tests for User Story 2

- [ ] T075 [P] [US2] [UNIT] Probar composición base/Qwen a partir de proyecciones de repositorio controladas, ventana, compactación, re-medición y `INVALID_PROMPT_SIZE` en `apps/backend/src/services/conversations/__tests__/ContextBuilder.test.ts`; tipo: unit.
- [ ] T076 [P] [US2] [INTEGRATION] Probar `contextRepository` contra PostgreSQL real con fixtures de dos conversaciones y varios turnos: cada base recupera en orden los prompts de la ventana y solo respuestas `completed` de su slot; Qwen recupera solo prompts y consolidaciones previas vigentes; ambas consultas excluyen contenido assistant fallido, consolidaciones `stale`, historiales de otros slots y datos de otra conversación en `apps/backend/src/infrastructure/postgres/repositories/__tests__/contextRepository.integration.test.ts` (depende de T013); tipo: integration PostgreSQL, debe fallar antes de T081.
- [ ] T077 [P] [US2] [INTEGRATION] Probar replay→busy→create, ordinal y liberación terminal en `apps/backend/src/routes/conversations/__tests__/conversationContinuation.integration.test.ts`; tipo: integration.
- [ ] T078 [P] [US2] [INTEGRATION] Probar createTurn, UUID estable, navegación, cache por IDs y nueva suscripción SSE en `apps/frontend/src/features/conversations/__tests__/conversation-continuation.test.tsx`; tipo: frontend integration.
- [ ] T079 [P] [US2] [UNIT] Probar timeline multiturno y aviso de contexto acotado sin contenido/mediciones/límites en `apps/frontend/src/features/conversations/__tests__/TurnList.test.tsx` y `apps/frontend/src/features/conversations/__tests__/ContextWindowNotice.test.tsx`; tipo: component unit, debe fallar antes de T087.
- [ ] T080 [P] [US2] [E2E] Escribir E2E multiturno de aislamiento, busy por conversación y protección de contexto en `apps/frontend/e2e/conversation-continuation.spec.ts`; tipo: E2E.

### Implementation for User Story 2

- [ ] T081 [P] [US2] [BE] Implementar consultas aisladas base/Qwen en `apps/backend/src/infrastructure/postgres/repositories/contextRepository.ts` (depende de T076); prueba mínima: integration T076.
- [ ] T082 [US2] [BE] Implementar composición por turnos sobre `contextProtection` en `apps/backend/src/services/conversations/ContextBuilder.ts` (depende de T059, T081); prueba mínima: unit T075.
- [ ] T083 [US2] [BE] Integrar `ContextBuilder` antes de cada adapter y omitir Continue-without en Qwen en `apps/backend/src/services/conversations/TurnOrchestrator.ts` (depende de T082); prueba mínima: unit T075 y E2E T080.
- [ ] T084 [US2] [BE] Implementar lock, replay, conflicto, busy y ordinal para turno posterior en `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts` (depende de T052, T053); prueba mínima: integration T077.
- [ ] T085 [US2] [BE] Exponer `POST /conversations/:id/turns` en `apps/backend/src/services/conversations/ConversationService.ts`, `conversationController.ts` y `conversationRoutes.ts` (depende de T083, T084); prueba mínima: integration T077.
- [ ] T086 [P] [US2] [FE] Añadir createTurn idempotente en `apps/frontend/src/features/conversations/api/conversationsApi.ts` y `hooks/useConversationExecution.ts`; prueba mínima: frontend T078.
- [ ] T087 [P] [US2] [FE] Crear timeline multiturno y aviso contextual en `apps/frontend/src/features/conversations/components/TurnList.tsx` y `ContextWindowNotice.tsx`; prueba mínima: component T079.
- [ ] T088 [US2] [FE] Integrar follow-up, timeline, cache por conversación y SSE del turno activo en `apps/frontend/src/features/conversations/components/ConversationWorkspace.tsx` (depende de T086, T087); prueba mínima: frontend T078 y E2E T080.

**Checkpoint**: multiturno aislado y protegido, sin presupuesto de producto ni
bloqueo global.

---

## Phase 5: User Story 3 — Recuperar y gestionar conversaciones (P3)

**Goal**: sidebar/historial infinitos, rename, Delete condicionado por busy y
colapso local.

**Independent Test**: siete turnos cargan 3/3/1 sin salto; loading, empty y error
son distinguibles; un error incremental conserva contenido; Rename/Delete no se
duplican ni pierden datos al fallar; Rename persiste durante busy y Delete
responde 409 hasta quedar terminal.

### Tests for User Story 3

- [ ] T089 [P] [US3] [UNIT] Probar encode/decode y rechazo de cursores en `apps/backend/src/utils/__tests__/cursor.test.ts`; tipo: unit.
- [ ] T090 [P] [US3] [INTEGRATION] Probar sidebar estable y bloques 3/3/1 completos en `apps/backend/src/infrastructure/postgres/repositories/__tests__/conversationHistoryRepository.integration.test.ts`; tipo: integration.
- [ ] T091 [P] [US3] [INTEGRATION] Probar list/detail/rename, Delete busy, cascade y errores en `apps/backend/src/routes/conversations/__tests__/conversationManagement.integration.test.ts`; tipo: integration.
- [ ] T092 [P] [US3] [INTEGRATION] Probar queries infinitas, autofill, compensación al anteponer y estados accesibles loading/empty/error/success de sidebar e historial; un error incremental conserva contenido, permite reintento manual y no duplica la carga pendiente en `apps/frontend/src/features/conversations/__tests__/conversation-history.test.tsx`; tipo: frontend integration.
- [ ] T093 [P] [US3] [INTEGRATION] Probar menú, dialogs, foco, contador, busy, colapso local y Rename/Delete pending/disabled, error con diálogo/datos intactos y success con resultado canónico y foco válido en `apps/frontend/src/features/conversations/__tests__/conversation-management.test.tsx`; tipo: component integration.
- [ ] T094 [P] [US3] [E2E] Escribir E2E de reapertura y scroll histórico 3/3/1 en `apps/frontend/e2e/conversation-history.spec.ts`; tipo: E2E.
- [ ] T095 [P] [US3] [E2E] Escribir E2E de sidebar, Rename, Delete busy/cascade y error SSE al reabrir en `apps/frontend/e2e/conversation-management.spec.ts`; tipo: E2E.

### Implementation for User Story 3

- [ ] T096 [US3] [BE] Implementar cursor, sidebar y bloques históricos en `apps/backend/src/utils/cursor.ts` y `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts`; prueba mínima: unit T089 e integration T090.
- [ ] T097 [US3] [BE] Implementar detail, Rename y Delete transaccional con busy/cascade en `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts` y `apps/backend/src/services/conversations/ConversationService.ts` (depende de T096); prueba mínima: integration T091.
- [ ] T098 [US3] [BE] Exponer list/detail/history/Rename/Delete en `apps/backend/src/controllers/conversations/conversationController.ts` y `apps/backend/src/routes/conversations/conversationRoutes.ts` (depende de T097); prueba mínima: integration T091.
- [ ] T099 [P] [US3] [FE] Implementar API y queries infinitas de list/detail/history/Rename/Delete exponiendo estados de carga, error y operación pendiente en `apps/frontend/src/features/conversations/api/conversationsApi.ts` y `hooks/useConversationQueries.ts`; prueba mínima: frontend T092/T093.
- [ ] T100 [P] [US3] [FE] Crear sidebar con fecha, sentinel inferior, autofill y estados accesibles loading/empty/error/success que conserven páginas visibles ante error incremental en `apps/frontend/src/features/conversations/components/ConversationSidebar.tsx`; prueba mínima: frontend T092.
- [ ] T101 [P] [US3] [FE] Crear menú y dialogs Rename/Delete accesibles con confirmación disabled durante pending, error seguro sin cerrar/perder datos y success con cierre y foco válido en `apps/frontend/src/features/conversations/components/ConversationMenu.tsx`, `RenameConversationDialog.tsx` y `DeleteConversationDialog.tsx`; prueba mínima: component T093.
- [ ] T102 [P] [US3] [FE] Crear sentinel superior con loading/error/reintento sin duplicar carga ni perder turnos visibles, compensación y colapso local en `apps/frontend/src/features/conversations/components/HistoryTopSentinel.tsx`, `TurnList.tsx` y `CollapsibleHistoryMessage.tsx`; prueba mínima: frontend T092/T093.
- [ ] T103 [US3] [SHARED] Integrar selección, estados loading/empty/error/success, historial, mutations, dialogs, foco posterior y reapertura SSE en `apps/frontend/src/components/layout/AppShell.tsx` y `ConversationWorkspace.tsx` (owner: frontend-builder; depende de T099–T102); prueba mínima: integration T092/T093 y E2E T094/T095.

**Checkpoint**: historial navegable sin paginación visible, estados de datos
explícitos y gestión sin duplicados que respeta busy.

---

## Phase 6: User Story 4 — Iniciar un contexto nuevo (P4)

**Goal**: mantener un único draft vacío local sin borrar ni persistir historial.

**Independent Test**: Nueva conversación no inserta datos; el primer prompt crea
el recurso sin contexto previo y conserva conversaciones existentes.

- [ ] T104 [P] [US4] [UNIT] Probar draft repetido, cero persistencia y conservación de lista en `apps/frontend/src/features/conversations/__tests__/new-conversation-draft.test.tsx`; tipo: frontend unit.
- [ ] T105 [P] [US4] [E2E] Escribir primer prompt de draft y contexto aislado en `apps/frontend/e2e/new-conversation.spec.ts`; tipo: E2E.
- [ ] T106 [US4] [FE] Implementar draft/selección local y acción Nueva conversación en `apps/frontend/src/components/layout/AppShell.tsx` y `ConversationSidebar.tsx`; prueba mínima: unit T104.
- [ ] T107 [US4] [FE] Enviar primer prompt por `POST /conversations`, seleccionar ID y conservar historial en `apps/frontend/src/features/conversations/components/ConversationWorkspace.tsx` (depende de T106); prueba mínima: E2E T105.

**Checkpoint**: no existe endpoint clear ni conversación vacía persistida.

---

## Phase 7: Acceptance, recovery and quality gates

**Purpose**: cerrar v1 con evidencia medible y checks separados.

- [ ] T108 [P] [INTEGRATION] Escribir fixture/versionado de recovery `pending`/`running` y prueba sobre la misma DB en `apps/backend/src/services/conversations/__tests__/fixtures/recoveryCases.ts` y `recovery.integration.test.ts`; tipo: integration SC-002, debe fallar antes de T109.
- [ ] T109 [BE] Implementar `recoverInterruptedTurns()` antes de listen en `apps/backend/src/services/conversations/recoverInterruptedTurns.ts` y `apps/backend/src/server.ts` (depende de T108); prueba mínima: integration T108 al 100% del fixture.
- [ ] T110 [P] [UNIT] Probar ausencia de prompts, respuestas, payloads SSE, mediciones, límites, headers y secretos en `apps/backend/src/services/conversations/__tests__/observabilitySafety.test.ts`; tipo: unit, debe fallar antes de T111.
- [ ] T111 [BE] Añadir logs Pino seguros de IDs, busy, replay, slot, duración, SSE y recovery en `apps/backend/src/middleware/logger/requestContext.ts`, `TurnOrchestrator.ts` y `turnEventsController.ts` (depende de T110); prueba mínima: unit T110.
- [ ] T112 [P] [BE-AUDIT] Auditar read-only `apps/backend/`, `db/changelogs/` y las secciones 2, 4–12 y 14 de `specs/001-compare-llm-responses/quickstart.md` contra spec, plan, contratos y principios I–IV, VI–IX (owner: `backend-auditor`; depende de T065, T085, T098, T109 y T111); inputs: archivos de producción y documentación de esas cadenas; output: reporte del agente con pass/fail, severidad, archivo y línea, sin modificar archivos ni ejecutar pruebas.
- [ ] T113 [P] [FE-AUDIT] Auditar read-only `apps/frontend/`, `packages/ui/` y las secciones 3, 6, 9, 10, 13 y 14 de `specs/001-compare-llm-responses/quickstart.md` contra spec, plan, contratos y principios I, V, VII–IX (owner: `frontend-auditor`; depende de T074, T088, T103 y T107); inputs: archivos de producción y documentación de esas cadenas; output: reporte del agente con pass/fail, severidad, archivo y línea, sin modificar archivos ni ejecutar pruebas.

**Audit gate**: un hallazgo bloqueante de T112/T113 crea una tarea builder
concreta y exige reauditoría; no avanzan los quality gates dependientes mientras
quede un hallazgo bloqueante abierto.

- [ ] T114 [P] [INTEGRATION] Crear fixture ≤5 casos y runner de consolidación ≥90% en `apps/backend/src/services/conversations/__tests__/fixtures/consolidation-evaluation.json` y `apps/backend/src/acceptance/consolidationEvaluation.ts` (depende de T112); tipo: integration acceptance SC-005 con providers fake.
- [ ] T115 [P] [INTEGRATION] Implementar estados terminales ≤60 s con providers fake en `apps/backend/src/acceptance/terminalStates.acceptance.test.ts` (depende de T112); tipo: integration acceptance SC-001.
- [ ] T116 [P] [PERF] Implementar latencia `202`/primer historial p95 <1 s en `apps/backend/src/acceptance/latency.acceptance.test.ts` (owner: `performance-test-runner`; depende de T112); tipo: performance acceptance SC-010.
- [ ] T117 [P] [UX] Diseñar tareas, escenarios, criterios observables y escalas subjetivas en `specs/001-compare-llm-responses/usability/sc-003-protocol.md` (depende de T113); prueba mínima: revisión Product/UX de cobertura SC-003/SC-004.
- [ ] T118 [UX] Ejecutar participantes y registrar numerador, denominador, porcentaje y pass/fail por SC en `specs/001-compare-llm-responses/usability/sc-004-results.md` (depende de T117); tipo: aceptación Product/UX, umbral 90% separado.
- [ ] T119 [INTEGRATION] Ejecutar migrate-from-zero, Liquibase validate y rollback con `docker-compose.yml` y `db/changelogs/db.changelog-master.xml` (depende de T112); tipo: integration DB, sin corregir fallos dentro de esta tarea.
- [ ] T120 [P] [UNIT] Ejecutar las suites unitarias backend y frontend desde `apps/backend/package.json` y `apps/frontend/package.json` (depende de T112, T113); registrar fallos como tareas concretas.
- [ ] T121 [P] [INTEGRATION] Ejecutar las suites de integración backend y frontend desde `apps/backend/package.json` y `apps/frontend/package.json` (depende de T112, T113); registrar fallos como tareas concretas.
- [ ] T122 [E2E] Ejecutar Playwright con fakes desde `apps/frontend/playwright.config.ts` (depende de T112, T113 y de las historias implementadas); tipo: E2E, registrar fallos como tareas concretas.
- [ ] T123 [P] [BE] Ejecutar `pnpm --filter backend build` desde `package.json` (owner: `backend-builder`; depende de T112); prueba mínima: comando exitoso, sin corregir hallazgos aquí.
- [ ] T124 [P] [FE] Ejecutar `pnpm --filter frontend typecheck`, `pnpm --filter frontend lint`, `pnpm --filter frontend build`, `pnpm --filter @workspace/ui typecheck` y `pnpm --filter @workspace/ui lint` desde `package.json` (owner: `frontend-builder`; depende de T113); prueba mínima: cinco comandos exitosos, sin corregir hallazgos aquí.

---

## Dependencies and execution order

### Phase dependencies

- Phase 1 no tiene dependencias.
- Phase 2 depende de Phase 1 y bloquea todas las historias.
- US1 depende de Phase 2 y constituye el MVP.
- US2 amplía US1 con turnos/contexto.
- US3 puede adelantar componentes aislados tras Phase 2; integración T103 depende
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
- DB: `T010 → T011/T012 → T013 → T112 → T119`.
- Backend base: `T014 → T015 → T026`; `T021 → T022`; `T023 → T024`.
- Frontend base: `T028 → T029`; `T030 → T031`.
- Providers: `T034–T038 → T054–T057`; `T047/T054–T057 → T058 → T061`.
- SSE: `T032 → T033`; `T048 → T060`; `T041/T060 → T064/T065 → T067 → T074`.
- Frontend US1: `T049 → T066`; `T050 → T068`; `T051 → T072`.
- Context: `T034 → T059`; `T076 → T081 → T082 → T083`; `T075 → T082 → T083`; `T079 → T087`.
- US2: `T077 → T084/T085`; `T078 → T086/T088`.
- US3: `T089–T093 → T096–T103`.
- US4: `T104/T105 → T106 → T107`.
- Recovery: `T108 → T109 → T112`; frontend: `T107 → T113`;
  UX: `T113 → T117 → T118`.
- Audits: `T065/T085/T098/T109/T111 → T112` y
  `T074/T088/T103/T107 → T113`; ambos bloquean T120–T124.

## Parallel opportunities

- Setup: T002 habilita las cadenas separadas T003→T004 y T005→T006;
  T007/T008/T009 conservan sus lanes sin compartir archivos.
- Foundation: lanes DB, backend contracts/config, fakes y frontend contracts.
- US1: T034–T051; cuatro adapters T054–T057; componentes T068–T073.
- US2: T075–T080; backend context y frontend components en archivos separados.
- US3: T089–T095; T099–T102.
- Final: T108, T110, T112–T117, T120, T121, T123 y T124; T112 y T113 pueden
  ejecutarse en paralelo después de sus dependencias de producción.

## Parallel examples

### US1

```text
Tests:     T034–T051
Adapters:  T054 + T055 + T056 + T057
Frontend:  T068 + T069 + T070 + T071 + T072 + T073
```

### US2

```text
Tests:     T075 + T076 + T077 + T078 + T079 + T080
Lanes:     T081/T082/T083 (backend) + T086/T087 (frontend), luego T088
```

### US3

```text
Tests:     T089 + T090 + T091 + T092 + T093 + T094 + T095
Frontend:  T099 + T100 + T101 + T102, luego T103
```

### US4

```text
Tests: T104 + T105
Flow:  T106 → T107
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
| SHARED | named owner | cross-boundary integration/checks |

Builders do not create, modify, or execute tests. Auditors remain read-only,
do not execute tests, and report findings without changing repository files.
Los smoke flows de `quickstart.md` se ejecutan una sola vez mediante la tarea de
prueba o aceptación con owner especializado aplicable; los auditores revisan la
documentación sin repetir esas pruebas.

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

1. Completar T001–T033.
2. Escribir T034–T051 y confirmar que fallan.
3. Implementar T052–T074.
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

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

- [x] T001 [FE] Añadir TanStack Query en `apps/frontend/package.json` y `pnpm-lock.yaml`; prueba mínima: build frontend.
- [x] T002 [P] [UNIT] Configurar Testing Library y QueryClient aislado en `apps/frontend/src/test/setup.ts`, `apps/frontend/src/test/query-test-utils.tsx` y `apps/frontend/vitest.config.ts`; tipo: unit infrastructure.
- [x] T003 [P] [UNIT] Probar render, teclado y foco de `Tabs`, `Dialog`, `DropdownMenu`, `ScrollArea`, `Skeleton` y `Alert` en `apps/frontend/src/test/ui-primitives.test.tsx` (depende de T002); tipo: component unit, debe fallar antes de T004.
- [x] T004 [P] [UI] Añadir/exportar con Shadcn `Tabs`, `Dialog`, `DropdownMenu`, `ScrollArea`, `Skeleton` y `Alert` en `packages/ui/src/components/` (depende de T003); prueba mínima: unit T003.
- [x] T005 [INTEGRATION] Probar el montaje con `QueryClientProvider` y QueryClient real en `apps/frontend/src/providers/__tests__/query-provider.integration.test.tsx` (depende de T001, T002); tipo: frontend integration provider/cache, debe fallar antes de T006.
- [x] T006 [FE] Montar `QueryClientProvider` en `apps/frontend/src/providers/query-provider.tsx` y `apps/frontend/src/main.tsx` (depende de T001, T005); prueba mínima: integration T005.
- [x] T007 [P] [E2E] Añadir Playwright/scripts y configurar providers fake deterministas en `apps/frontend/package.json`, `pnpm-lock.yaml`, `apps/frontend/playwright.config.ts` y `apps/frontend/e2e/fixtures/modelFuse.ts`; tipo: E2E smoke del fixture.
- [x] T008 [P] [BE] Documentar las variables backend vigentes de providers, límites, ratio, ventana y sidebar en `apps/backend/.env.sample`; prueba mínima: revisión contra la sección 2 de `specs/001-compare-llm-responses/quickstart.md` sin variables de polling.
- [x] T009 [P] [FE] Documentar las variables frontend vigentes de API y colapso en `apps/frontend/.env.sample`; prueba mínima: revisión contra la sección 3 de `specs/001-compare-llm-responses/quickstart.md` sin variables de polling.

**Checkpoint**: no se añaden SDKs LLM preventivos, librerías SSE, retry automático,
colas ni infraestructura genérica de idempotencia.

---

## Phase 2: Foundational

**Purpose**: esquema, configuración, contratos y utilidades que bloquean historias.

### Database / Liquibase

- [x] T010 [P] [INTEGRATION] Escribir validación de tres tablas, `conversations.title` como `text`, cascades, checks, uniques, índices parciales y restauración del estado anterior tras rollback en `db/tests/validate-model-fuse-schema.sql`; tipo: integration PostgreSQL, debe fallar antes de T011–T013.
- [x] T011 [DB] Crear `conversations` con `title text` —el límite grapheme pertenece al backend— y `turns` con request IDs, ordinal, estados, cascades, índice único parcial de turno activo y rollback explícito en `db/changelogs/conversations/001-create-conversations-and-turns.sql`; prueba mínima: integration T010.
- [x] T012 [DB] Crear `model_responses` con cuatro slots, errores, `continued_without_at`, `is_stale`, `attempt_no`, metadata, checks/índices busy y rollback explícito en `db/changelogs/messages/001-create-model-responses.sql` (depende de T011); prueba mínima: integration T010.
- [x] T013 [DB] Incluir ambos módulos en `db/changelogs/conversations/db.changelog-conversations.xml`, `db/changelogs/messages/db.changelog-messages.xml` y `db/changelogs/db.changelog-master.xml` (depende de T011, T012); prueba mínima: Liquibase validate y T010.

### Backend foundation

- [x] T014 [P] [UNIT] Probar credenciales requeridas, timeouts, ventana, ratio `(0,1]`, límites por deployment y sidebar en `apps/backend/src/infrastructure/config/__tests__/env.test.ts`; tipo: unit, debe fallar antes de T015.
- [x] T015 [BE] Implementar configuración Zod segura en `apps/backend/src/infrastructure/config/env.ts` (depende de T014); prueba mínima: unit T014.
- [x] T016 [P] [BE] Definir contratos REST/SSE de conversación, turno, slots, eventos y errores, incluyendo `eventSequence` entero por `turnId`, `updatedAt`, `attemptNo` cuando aplique y el último sequence representado por el snapshot, en `apps/backend/src/types/conversations.ts` y `apps/backend/src/types/sse.ts`; prueba mínima: typecheck, con cobertura de integración posterior en T041.
- [x] T018 [P] [UNIT] Probar UUIDs, prompt, IDs, slots y cursores inválidos, además de Rename vacío, 80/81 grapheme clusters después de `trim`, emoji simple, emoji ZWJ, letras con marcas combinadas, mezcla ASCII/Unicode, comillas, `<`, `>` y HTML literal conservados sin normalización adicional en `apps/backend/src/middleware/validation/__tests__/conversationSchemas.test.ts`; tipo: unit, debe fallar antes de T019.
- [x] T019 [BE] Implementar conteo/truncado con `Intl.Segmenter` y `granularity: "grapheme"` en `apps/backend/src/utils/titleGraphemes.ts`, integrarlo en los schemas Zod y mantener el middleware de error saneado en `apps/backend/src/middleware/validation/conversationSchemas.ts`, `validateRequest.ts` y `apps/backend/src/types/apiError.ts` (depende de T018); prueba mínima: unit T018.
- [x] T021 [P] [UNIT] Probar el mapper PostgreSQL→contrato sin secretos ni mediciones en `apps/backend/src/infrastructure/postgres/mappers/__tests__/conversationMapper.test.ts`; tipo: unit, debe fallar antes de T022.
- [x] T022 [P] [BE] Crear mapper PostgreSQL→contrato sin secretos ni mediciones en `apps/backend/src/infrastructure/postgres/mappers/conversationMapper.ts` (depende de T021); prueba mínima: unit T021.
- [x] T023 [P] [UNIT] Probar cálculo de turno y busy desde cuatro slots en `apps/backend/src/services/conversations/__tests__/turnState.test.ts`; tipo: unit, debe fallar antes de T024.
- [x] T024 [BE] Implementar cálculo puro de turno/`hasWorkInProgress` en `apps/backend/src/services/conversations/turnState.ts` (depende de T023); prueba mínima: unit T023.
- [x] T025 [P] [INTEGRATION] Probar `createApp()`, error JSON y separación start/stop en `apps/backend/src/__tests__/app-lifecycle.test.ts`; tipo: integration, debe fallar antes de T026.
- [x] T026 [BE] Crear `apiRouter`, `createApp()`, `startServer()` y limitar `index.ts` a start/stop en `apps/backend/src/routes/apiRouter.ts`, `apps/backend/src/app.ts`, `apps/backend/src/server.ts` y `apps/backend/src/index.ts` (depende de T015, T019, T025); prueba mínima: integration T025.
- [x] T027 [P] [UNIT] Crear cuatro providers fake y fixtures deterministas en `apps/backend/src/test/fakes/fakeLlmProvider.ts` y `apps/backend/src/test/fixtures/conversationFixtures.ts`; tipo: unit self-test de llamadas/errores controlados.

### Frontend foundation

- [x] T028 [P] [UNIT] Probar parseo válido/inválido de contratos REST y SSE frontend, incluido `eventSequence` y el sequence representado por el snapshot, en `apps/frontend/src/features/conversations/__tests__/conversationSchemas.test.ts`; tipo: contract unit, debe fallar antes de T029.
- [x] T029 [P] [FE] Definir tipos/schemas REST y SSE con `eventSequence` y el sequence representado por el snapshot en `apps/frontend/src/features/conversations/types/conversation.ts`, `sse.ts` y `schemas/conversationSchemas.ts` (depende de T028); prueba mínima: unit T028.
- [x] T030 [P] [UNIT] Probar env, URL, cancelación Axios con transporte controlado y query keys estables en `apps/frontend/src/config/__tests__/env.test.ts`, `apps/frontend/src/features/conversations/api/__tests__/client.test.ts` y `apps/frontend/src/features/conversations/queries/__tests__/conversation-keys.test.ts`; tipo: unit, debe fallar antes de T031.
- [x] T031 [P] [FE] Crear configuración frontend validada, cliente Axios cancelable y query keys en `apps/frontend/src/config/env.ts`, `apps/frontend/src/features/conversations/api/client.ts` y `queries/conversation-keys.ts` (depende de T030); prueba mínima: unit T030.
- [x] T032 [P] [UNIT] Probar aplicación idempotente, rechazo de tuplas `updatedAt`/`attemptNo`/`eventSequence` antiguas o duplicadas y aceptación de cambios consecutivos con timestamp e intento iguales pero sequence creciente en `apps/frontend/src/features/conversations/queries/__tests__/conversation-cache.test.ts`; tipo: unit, debe fallar antes de T033.
- [x] T033 [FE] Implementar helpers de cache que apliquen únicamente los campos canónicos de `slot_update`, `turn_update` y `busy_update` en orden de `eventSequence`, excluyendo explícitamente `runtimeStage`, en `apps/frontend/src/features/conversations/queries/conversation-cache.ts` (depende de T029–T032); prueba mínima: unit T032.

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

- [x] T034 [P] [US1] [UNIT] Probar medición exacta/`upper_bound`, overhead y corpus ASCII, puntuación, Unicode/emoji, scripts no latinos y delimitadores en `apps/backend/src/infrastructure/llm/providers/__tests__/inputMeasurement.contract.test.ts`; tipo: contract unit, debe fallar antes de T054–T057.
- [x] T035 [P] [US1] [UNIT] Probar mapping, cancelación, error seguro, una llamada de OpenAI y la matriz canónica completa: `rate_limited`/`timeout`/`connectivity`/`provider_transient_error=true` y `authentication`/`content_blocked`/`invalid_prompt_size`/`invalid_response`/`provider_error=false` en `apps/backend/src/infrastructure/llm/providers/__tests__/OpenAiProvider.test.ts`; tipo: contract unit.
- [x] T036 [P] [US1] [UNIT] Probar mapping, cancelación, error seguro, una llamada de Google y la misma matriz canónica de recuperabilidad de T035 en `apps/backend/src/infrastructure/llm/providers/__tests__/GoogleProvider.test.ts`; tipo: contract unit.
- [x] T037 [P] [US1] [UNIT] Probar mapping, cancelación, error seguro, una llamada de MiniMax y la misma matriz canónica de recuperabilidad de T035 en `apps/backend/src/infrastructure/llm/providers/__tests__/MiniMaxProvider.test.ts`; tipo: contract unit.
- [x] T038 [P] [US1] [UNIT] Probar mapping, cancelación, error seguro, una llamada de Qwen y la misma matriz canónica de recuperabilidad de T035 en `apps/backend/src/infrastructure/llm/providers/__tests__/QwenProvider.test.ts`; tipo: contract unit.
- [x] T039 [P] [US1] [UNIT] Probar en `apps/backend/src/services/conversations/__tests__/contextProtection.test.ts` los casos cabe/compacta/falla, re-medición después de cada reducción, preservación del prompt actual y `INVALID_PROMPT_SIZE`, y en `TurnOrchestrator.test.ts` bases paralelas, persistencia por intento y consolidación con disponibles; tipo: unit, debe fallar antes de T059 y T061.
- [ ] T040 [P] [US1] [INTEGRATION] Probar `202`, commit completo de conversación, turno y cuatro slots, rollback ante un fallo controlado sin dejar filas parciales, replay concurrente antes de busy, conflicto ID/prompt y título inicial truncado sin dividir graphemes con ASCII, emoji ZWJ, marcas combinadas y límites 80/81 en `apps/backend/src/routes/conversations/__tests__/conversationCreation.integration.test.ts`; tipo: integration REST/PostgreSQL, debe fallar antes de T052.
- [ ] T041 [P] [US1] [INTEGRATION] Probar pertenencia, headers, snapshot inicial con último `eventSequence` representado, `slot_update`, `turn_update`, `busy_update`, publicación post-commit, cleanup, cierre terminal después del drenaje, ausencia de eventos o contenido parcial token por token y entrega del contenido únicamente como respuesta final normalizada en `apps/backend/src/routes/conversations/__tests__/turnEvents.integration.test.ts`; incluir casos deterministas con dos eventos de igual `updatedAt`, varios cambios consecutivos del mismo `attemptNo`, eventos antiguos o duplicados en el buffer y un commit entre el registro del listener y la emisión del snapshot, verificando descarte por la tupla completa y drenaje sin pérdida en `eventSequence`; tipo: integration SSE/PostgreSQL.
- [ ] T042 [P] [US1] [INTEGRATION] Probar CAS de retry, tres códigos 409, `attempt_no`, aceptación solo con `recoverable=true`, rechazo no recuperable, reconsolidación y Continue-without irreversible disponible para cualquier slot base `failed` sin cambiar `recoverable` en `apps/backend/src/routes/conversations/__tests__/responseActions.integration.test.ts`; tipo: integration.
- [x] T043 [P] [US1] [INTEGRATION] Probar un único `EventSource`, aplicación idempotente y ordenada por `eventSequence` de eventos canónicos con timestamps/intentos iguales, `runtimeStage` local y efímero y, al coincidir turno terminal con `busy_update=false`, cierre del stream, limpieza del estado efímero y exactamente una invalidación final de las queries de detalle/turno; comprobar además que no existe fetch periódico y que un fallo SSE muestra un error visible sin activar fallback en `apps/frontend/src/features/conversations/__tests__/useTurnEvents.test.tsx`; tipo: frontend integration con hook, QueryClient y cache reales y boundary EventSource controlado.
- [x] T044 [P] [US1] [INTEGRATION] Probar tabs/labels, estados aislados, busy controls, Retry visible solo con `recoverable=true`, Continue-without visible ante cualquier falla base y confirmación permanente en `apps/frontend/src/features/conversations/__tests__/comparison-workspace.test.tsx`; tipo: component integration.
- [x] T045 [P] [US1] [E2E] Escribir flujo `202 → SSE → cuatro resultados → cierre` en `apps/frontend/e2e/conversation-comparison.spec.ts`; tipo: E2E.
- [x] T046 [P] [US1] [E2E] Escribir retry manual, reconsolidación, 409 y Continue-without en `apps/frontend/e2e/conversation-response-actions.spec.ts`; tipo: E2E.
- [x] T047 [P] [US1] [UNIT] Probar el registro literal de los cuatro adapters y la ausencia de factory en `apps/backend/src/infrastructure/llm/__tests__/providerRegistry.test.ts`; tipo: unit, debe fallar antes de T058.
- [x] T048 [P] [US1] [UNIT] Probar subscribe, `eventSequence` estrictamente creciente e independiente por `turnId`, orden con timestamps/intentos iguales y unsubscribe del publicador en `apps/backend/src/services/conversations/__tests__/turnEventPublisher.test.ts`; tipo: unit, debe fallar antes de T060.
- [x] T049 [P] [US1] [UNIT] Probar contratos y errores de create, snapshot, retry y Continue-without con transporte controlado en `apps/frontend/src/features/conversations/api/__tests__/conversationsApi.test.ts`; tipo: contract unit, debe fallar antes de T066.
- [x] T050 [P] [US1] [UNIT] Probar landmarks y foco del layout en `apps/frontend/src/components/layout/__tests__/AppShell.test.tsx`; tipo: component unit, debe fallar antes de T068.
- [x] T051 [P] [US1] [UNIT] Probar trim, UUID estable y disabled por busy/mutación en `apps/frontend/src/features/conversations/components/__tests__/PromptComposer.test.tsx`; tipo: component unit, debe fallar antes de T072.

### Backend implementation

- [x] T017 [P] [US1] [BE] Definir `LlmProvider`, `InputTokenMeasurement`, resultado normalizado, `provider_transient_error` y la única función canónica `isRecoverableLlmError(code)` en `apps/backend/src/types/llm.ts` y `apps/backend/src/services/llm/llmErrors.ts`; los adapters no reciben libertad para fijar `recoverable` (depende de T035–T038); prueba mínima: typecheck y contract T035–T038.
- [ ] T020 [P] [US1] [BE] Crear helper transaccional PostgreSQL en `apps/backend/src/infrastructure/postgres/transaction.ts` (depende de T040); prueba mínima: integration T040.
- [ ] T052 [P] [US1] [BE] Implementar mediante `transaction.ts` create/replay atómico, persistencia literal del título ya derivado y cuatro slots en `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts` (depende de T020); prueba mínima: integration T040.
- [ ] T053 [P] [US1] [BE] Implementar transiciones CAS, `attempt_no`, recálculo y busy derivado en `apps/backend/src/infrastructure/postgres/repositories/turnRepository.ts`; prueba mínima: integration T042.
- [x] T054 [P] [US1] [BE] Implementar `OpenAiProvider` y medición exacta/cota demostrable en `apps/backend/src/infrastructure/llm/providers/OpenAiProvider.ts` (depende de T017); prueba mínima: contract T034/T035.
- [x] T055 [P] [US1] [BE] Implementar `GoogleProvider` y medición exacta/cota demostrable en `apps/backend/src/infrastructure/llm/providers/GoogleProvider.ts` (depende de T017); prueba mínima: contract T034/T036.
- [x] T056 [P] [US1] [BE] Implementar `MiniMaxProvider` y medición exacta/cota demostrable en `apps/backend/src/infrastructure/llm/providers/MiniMaxProvider.ts` (depende de T017); prueba mínima: contract T034/T037.
- [x] T057 [P] [US1] [BE] Implementar `QwenProvider` y medición exacta/cota demostrable en `apps/backend/src/infrastructure/llm/providers/QwenProvider.ts` (depende de T017); prueba mínima: contract T034/T038.
- [x] T058 [US1] [BE] Construir registro literal de cuatro adapters en `apps/backend/src/infrastructure/llm/providerRegistry.ts` (depende de T054–T057, T047); prueba mínima: unit T047.
- [x] T059 [P] [US1] [BE] Implementar protección técnica pura: umbral, compactación y `INVALID_PROMPT_SIZE` en `apps/backend/src/services/conversations/contextProtection.ts`; prueba mínima: unit T039.
- [x] T060 [P] [US1] [BE] Implementar publicador en proceso tipado que, después de cada commit, asigne `eventSequence` entero estrictamente creciente por `turnId`, exponga el último sequence representado para el snapshot, entregue en orden y haga cleanup en `apps/backend/src/services/conversations/turnEventPublisher.ts` (depende de T048); prueba mínima: unit T048, sin persistencia, `Last-Event-ID` ni replay durable.
- [ ] T061 [US1] [BE] Implementar tres bases paralelas, Qwen y persistencia antes de publicar en `apps/backend/src/services/conversations/TurnOrchestrator.ts` (depende de T053, T058–T060); prueba mínima: unit T039 e integration T041.
- [ ] T062 [US1] [BE] Añadir retry manual que consuma exclusivamente `error_recoverable`, stale/reconsolidación y Continue-without irreversible para cualquier base fallida sin alterar la clasificación en `apps/backend/src/services/conversations/TurnOrchestrator.ts` (depende de T061); prueba mínima: integration T042.
- [ ] T063 [US1] [BE] Implementar create/replay derivando el título inicial con `trim` y truncado a 80 grapheme clusters mediante `titleGraphemes.ts`, además de snapshot y acciones en `apps/backend/src/services/conversations/ConversationService.ts` (depende de T052, T053, T062); prueba mínima: integration T040–T042.
- [ ] T064 [US1] [BE] Implementar controller SSE que registra el listener antes de leer PostgreSQL, bufferiza durante la lectura, emite el snapshot con el último `eventSequence` representado, descarta eventos cuya tupla aplicable (`updatedAt`, `attemptNo` para slots y `eventSequence`) sea menor o igual, drena los restantes en orden, continúa en vivo y cierra solo tras el drenaje cuando el estado más reciente sea terminal y no busy en `apps/backend/src/controllers/conversations/turnEventsController.ts` (depende de T060, T063); prueba mínima: integration T041.
- [ ] T065 [US1] [BE] Exponer create, get puntual, SSE, retry y Continue-without en `apps/backend/src/controllers/conversations/conversationController.ts` y `apps/backend/src/routes/conversations/conversationRoutes.ts` (depende de T063, T064); prueba mínima: integration T040–T042.

### Frontend implementation

- [x] T066 [P] [US1] [FE] Implementar API validada de create, snapshot, retry y Continue-without en `apps/frontend/src/features/conversations/api/conversationsApi.ts` (depende de T049); prueba mínima: unit T049.
- [x] T067 [US1] [FE] Implementar el ciclo SSE en `apps/frontend/src/features/conversations/hooks/useTurnEvents.ts`: aplicar actualizaciones canónicas mediante los helpers de cache y el orden `eventSequence`, mantener `runtimeStage` como estado local por slot y, cuando coincidan turno terminal y `busy_update=false`, cerrar el stream, limpiar el estado efímero e invalidar exactamente una vez las queries de detalle/turno para converger con PostgreSQL; gestionar error visible sin fetch periódico ni fallback de transporte (depende de T033, T066); prueba mínima: frontend T043.
- [x] T068 [P] [US1] [FE] Crear layout accesible en `apps/frontend/src/components/layout/AppShell.tsx` (depende de T050); prueba mínima: unit T050.
- [x] T069 [P] [US1] [FE] Crear aviso textual busy/SSE en `apps/frontend/src/features/conversations/components/ConversationProcessingNotice.tsx`; prueba mínima: component T044.
- [x] T070 [P] [US1] [FE] Crear tabs y panel de cuatro respuestas en `apps/frontend/src/features/conversations/components/ResponseTabs.tsx` y `ResponsePanel.tsx`; prueba mínima: component T044.
- [x] T071 [P] [US1] [FE] Crear confirmación Continue-without en `apps/frontend/src/features/conversations/components/ContinueWithoutDialog.tsx`; prueba mínima: component T044 con foco/copy irreversible.
- [x] T072 [P] [US1] [FE] Crear composer con trim, UUID estable y disabled por busy/mutación en `apps/frontend/src/features/conversations/components/PromptComposer.tsx` (depende de T051); prueba mínima: unit T051 e integration T044.
- [x] T073 [P] [US1] [FE] Crear `TurnCard` con prompt, cuatro slots y runtime stage en `apps/frontend/src/features/conversations/components/TurnCard.tsx`; prueba mínima: component T044.
- [x] T074 [US1] [SHARED] Integrar API, SSE y componentes en `apps/frontend/src/features/conversations/components/ConversationWorkspace.tsx` y `apps/frontend/src/App.tsx` (owner: frontend-builder; depende de T066–T073); prueba mínima: E2E T045/T046.

**Checkpoint**: MVP operativo con REST + SSE exclusivo, idempotencia inicial,
retry manual y Continue-without irreversible.

---

## Phase 4: User Story 2 — Continuar una conversación (P2)

**Goal**: crear turnos posteriores con contexto aislado, busy e idempotencia.

**Independent Test**: un segundo prompt usa solo el historial correcto; replay
precede a busy y protección técnica cubre cabe/compacta/falla sin subestimar.

### Tests for User Story 2

- [x] T075 [P] [US2] [UNIT] Probar composición base/Qwen a partir de proyecciones de repositorio controladas, ventana, compactación, re-medición y `INVALID_PROMPT_SIZE` en `apps/backend/src/services/conversations/__tests__/ContextBuilder.test.ts`; tipo: unit.
- [x] T076 [P] [US2] [INTEGRATION] Probar `contextRepository` contra PostgreSQL real con fixtures de dos conversaciones y varios turnos: cada base recupera en orden los prompts de la ventana y solo respuestas `completed` de su slot; Qwen recupera solo prompts y consolidaciones previas vigentes; ambas consultas excluyen contenido assistant fallido, consolidaciones `stale`, historiales de otros slots y datos de otra conversación en `apps/backend/src/infrastructure/postgres/repositories/__tests__/contextRepository.integration.test.ts` (depende de T013); tipo: integration PostgreSQL, debe fallar antes de T081.
- [x] T077 [P] [US2] [INTEGRATION] Probar replay→busy→create, ordinal y liberación terminal en `apps/backend/src/routes/conversations/__tests__/conversationContinuation.integration.test.ts`; tipo: integration.
- [x] T078 [P] [US2] [INTEGRATION] Probar createTurn, UUID estable, navegación, cache por IDs y nueva suscripción SSE en `apps/frontend/src/features/conversations/__tests__/conversation-continuation.test.tsx`; tipo: frontend integration.
- [x] T079 [P] [US2] [UNIT] Probar timeline multiturno y aviso de contexto acotado sin contenido/mediciones/límites en `apps/frontend/src/features/conversations/__tests__/TurnList.test.tsx` y `apps/frontend/src/features/conversations/__tests__/ContextWindowNotice.test.tsx`; tipo: component unit, debe fallar antes de T087.
- [x] T080 [P] [US2] [E2E] Escribir E2E multiturno de aislamiento, busy por conversación y protección de contexto en `apps/frontend/e2e/conversation-continuation.spec.ts`; tipo: E2E.

### Implementation for User Story 2

- [x] T081 [P] [US2] [BE] Implementar consultas aisladas base/Qwen en `apps/backend/src/infrastructure/postgres/repositories/contextRepository.ts` (depende de T076); prueba mínima: integration T076.
- [x] T082 [US2] [BE] Implementar composición por turnos sobre `contextProtection` en `apps/backend/src/services/conversations/ContextBuilder.ts` (depende de T059, T081); prueba mínima: unit T075.
- [x] T083 [US2] [BE] Integrar `ContextBuilder` antes de cada adapter y omitir Continue-without en Qwen en `apps/backend/src/services/conversations/TurnOrchestrator.ts` (depende de T082); prueba mínima: unit T075 y E2E T080.
- [x] T084 [US2] [BE] Implementar lock, replay, conflicto, busy y ordinal para turno posterior en `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts` (depende de T052, T053); prueba mínima: integration T077.
- [x] T085 [US2] [BE] Exponer `POST /conversations/:id/turns` en `apps/backend/src/services/conversations/ConversationService.ts`, `conversationController.ts` y `conversationRoutes.ts` (depende de T083, T084); prueba mínima: integration T077.
- [x] T086 [P] [US2] [FE] Añadir createTurn idempotente en `apps/frontend/src/features/conversations/api/conversationsApi.ts` y `hooks/useConversationExecution.ts`; prueba mínima: frontend T078.
- [x] T087 [P] [US2] [FE] Crear timeline multiturno y aviso contextual en `apps/frontend/src/features/conversations/components/TurnList.tsx` y `ContextWindowNotice.tsx`; prueba mínima: component T079.
- [x] T088 [US2] [FE] Integrar follow-up, timeline, cache por conversación y SSE del turno activo en `apps/frontend/src/features/conversations/components/ConversationWorkspace.tsx` (depende de T086, T087); prueba mínima: frontend T078 y E2E T080.

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

- [x] T089 [P] [US3] [UNIT] Probar encode/decode y rechazo de cursores en `apps/backend/src/utils/__tests__/cursor.test.ts`; tipo: unit.
- [x] T090 [P] [US3] [INTEGRATION] Probar sidebar estable y bloques 3/3/1 completos en `apps/backend/src/infrastructure/postgres/repositories/__tests__/conversationHistoryRepository.integration.test.ts`; tipo: integration.
- [x] T091 [P] [US3] [INTEGRATION] Probar list/detail/rename, persistencia parametrizada y literal después de `trim`, validación 80/81 graphemes y títulos con comillas, `<`, `>`, acentos, emoji simple/ZWJ, marcas combinadas y HTML, Delete busy, cascade y errores en `apps/backend/src/routes/conversations/__tests__/conversationManagement.integration.test.ts`; tipo: integration.
- [x] T092 [P] [US3] [INTEGRATION] Probar queries infinitas, autofill, compensación al anteponer y estados accesibles loading/empty/error/success de sidebar e historial; un error incremental conserva contenido, permite reintento manual y no duplica la carga pendiente en `apps/frontend/src/features/conversations/__tests__/conversation-history.test.tsx`; tipo: frontend integration.
- [x] T093 [P] [US3] [INTEGRATION] Probar menú, dialogs, foco, contador grapheme, busy, colapso local y Rename/Delete pending/disabled, error con diálogo/datos intactos y success con resultado canónico y foco válido; cubrir ASCII, emoji simple/ZWJ, marcas combinadas, mezcla Unicode y límites 80/81, y verificar que títulos con comillas, `<`, `>`, acentos, emojis y HTML literal se muestran como texto y no crean markup en `apps/frontend/src/features/conversations/__tests__/conversation-management.test.tsx`; tipo: component integration.
- [x] T094 [P] [US3] [E2E] Escribir E2E de reapertura y scroll histórico 3/3/1 en `apps/frontend/e2e/conversation-history.spec.ts`; tipo: E2E.
- [x] T095 [P] [US3] [E2E] Escribir E2E de sidebar, Rename, Delete busy/cascade y error SSE al reabrir en `apps/frontend/e2e/conversation-management.spec.ts`; tipo: E2E.

### Implementation for User Story 3

- [x] T096 [US3] [BE] Implementar cursor, sidebar y bloques históricos en `apps/backend/src/utils/cursor.ts` y `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts`; prueba mínima: unit T089 e integration T090.
- [x] T097 [US3] [BE] Implementar detail, Rename con `trim` como única transformación, validación 1–80 graphemes mediante `titleGraphemes.ts` y persistencia literal mediante consulta parametrizada, y Delete transaccional con busy/cascade en `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts` y `apps/backend/src/services/conversations/ConversationService.ts` (depende de T096); prueba mínima: integration T091.
- [x] T098 [US3] [BE] Exponer list/detail/history/Rename/Delete en `apps/backend/src/controllers/conversations/conversationController.ts` y `apps/backend/src/routes/conversations/conversationRoutes.ts` (depende de T097); prueba mínima: integration T091.
- [x] T099 [P] [US3] [FE] Implementar API y queries infinitas de list/detail/history/Rename/Delete exponiendo estados de carga, error y operación pendiente en `apps/frontend/src/features/conversations/api/conversationsApi.ts` y `hooks/useConversationQueries.ts`; prueba mínima: frontend T092/T093.
- [x] T100 [P] [US3] [FE] Crear sidebar con fecha, sentinel inferior, autofill y estados accesibles loading/empty/error/success que conserven páginas visibles ante error incremental en `apps/frontend/src/features/conversations/components/ConversationSidebar.tsx`; prueba mínima: frontend T092.
- [x] T101 [P] [US3] [FE] Crear helper basado en `Intl.Segmenter` con `granularity: "grapheme"` en `apps/frontend/src/features/conversations/utils/titleGraphemes.ts` y menú/dialogs Rename/Delete accesibles con contador y límite grapheme, confirmación disabled durante pending, error seguro sin cerrar/perder datos, success con cierre y foco válido y títulos renderizados como texto sin interpretar HTML ni almacenar escapes en `apps/frontend/src/features/conversations/components/ConversationMenu.tsx`, `RenameConversationDialog.tsx` y `DeleteConversationDialog.tsx`; prueba mínima: component T093.
- [x] T102 [P] [US3] [FE] Crear sentinel superior con loading/error/reintento sin duplicar carga ni perder turnos visibles, compensación y colapso local en `apps/frontend/src/features/conversations/components/HistoryTopSentinel.tsx`, `TurnList.tsx` y `CollapsibleHistoryMessage.tsx`; prueba mínima: frontend T092/T093.
- [x] T103 [US3] [SHARED] Integrar selección, estados loading/empty/error/success, historial, mutations, dialogs, foco posterior y reapertura SSE en `apps/frontend/src/components/layout/AppShell.tsx` y `ConversationWorkspace.tsx` (owner: frontend-builder; depende de T088, T099–T102); prueba mínima: integration T092/T093 y E2E T094/T095.

**Checkpoint**: historial navegable sin paginación visible, estados de datos
explícitos y gestión sin duplicados que respeta busy.

---

## Phase 6: User Story 4 — Iniciar un contexto nuevo (P4)

**Goal**: mantener un único draft vacío local sin borrar ni persistir historial.

**Independent Test**: Nueva conversación no inserta datos; el primer prompt crea
el recurso sin contexto previo y conserva conversaciones existentes.

- [x] T104 [P] [US4] [UNIT] Probar draft repetido, cero persistencia y conservación de lista en `apps/frontend/src/features/conversations/__tests__/new-conversation-draft.test.tsx`; tipo: frontend unit.
- [x] T105 [P] [US4] [E2E] Escribir primer prompt de draft y contexto aislado en `apps/frontend/e2e/new-conversation.spec.ts`; tipo: E2E.
- [x] T106 [US4] [FE] Implementar draft/selección local y acción Nueva conversación en `apps/frontend/src/components/layout/AppShell.tsx` y `ConversationSidebar.tsx` (depende de T103); prueba mínima: unit T104.
- [x] T107 [US4] [FE] Enviar primer prompt por `POST /conversations`, seleccionar ID y conservar historial en `apps/frontend/src/features/conversations/components/ConversationWorkspace.tsx` (depende de T106); prueba mínima: E2E T105.

**Checkpoint**: no existe endpoint clear ni conversación vacía persistida.

---

## Phase 7: Acceptance, recovery and quality gates

**Purpose**: cerrar v1 con evidencia medible y checks separados.

- [x] T108 [P] [INTEGRATION] Escribir fixture versionado con varias conversaciones, turnos ordenados, respuestas atribuidas a distintos slots y estados `pending`/`running`, y recrear la aplicación o sus servicios sobre la misma DB en `apps/backend/src/services/conversations/__tests__/fixtures/recoveryCases.ts` y `recovery.integration.test.ts`; verificar que recovery conserva ordinales y orden, mantiene cada respuesta asociada a su conversación, turno y slot, convierte los slots interrumpidos en `failed/interrupted` con `error_recoverable=true` y permite consultar después detalle e historial; tipo: integration SC-002 al 100% del fixture, debe fallar antes de T109.
- [x] T109 [BE] Implementar `recoverInterruptedTurns()` antes de listen en `apps/backend/src/services/conversations/recoverInterruptedTurns.ts` y `apps/backend/src/server.ts` (depende de T108); prueba mínima: integration T108 al 100% del fixture.
- [x] T110 [P] [UNIT] Probar ausencia de prompts, respuestas, payloads SSE, mediciones, límites, headers y secretos en `apps/backend/src/services/conversations/__tests__/observabilitySafety.test.ts`; tipo: unit, debe fallar antes de T111.
- [x] T111 [BE] Añadir logs Pino seguros de IDs, busy, replay, slot, duración, SSE y recovery en `apps/backend/src/middleware/logger/requestContext.ts`, `TurnOrchestrator.ts` y `turnEventsController.ts` (depende de T110); prueba mínima: unit T110.
- [x] T112 [P] [BE-AUDIT] Auditar read-only `apps/backend/`, `db/changelogs/` y las secciones 2, 4–12 y 14 de `specs/001-compare-llm-responses/quickstart.md` contra spec, plan, contratos y principios I–IV, VI–IX (owner: `backend-auditor`; depende de T065, T085, T098, T109 y T111); inputs: archivos de producción y documentación de esas cadenas; output: reporte del agente con pass/fail, severidad, archivo y línea, sin modificar archivos ni ejecutar pruebas.
- [x] T113 [P] [FE-AUDIT] Auditar read-only `apps/frontend/`, `packages/ui/` y las secciones 3, 6, 9, 10, 13 y 14 de `specs/001-compare-llm-responses/quickstart.md` contra spec, plan, contratos y principios I, V, VII–IX (owner: `frontend-auditor`; depende de T074, T088, T103 y T107); inputs: archivos de producción y documentación de esas cadenas; output: reporte del agente con pass/fail, severidad, archivo y línea, sin modificar archivos ni ejecutar pruebas.

## Phase 7A: Remediación de hallazgos bloqueantes de auditoría

**Purpose**: resolver los hallazgos `high` bloqueantes de T112/T113 mediante
tests especializados antes de modificar producción, y repetir ambas auditorías
read-only. Los hallazgos `medium` quedan fuera de este gate y no bloquean T114–T124.

### Backend — T112

- [x] T125 [P] [UNIT] Ampliar `apps/backend/src/infrastructure/config/__tests__/env.test.ts` para exigir una única configuración validada de `PORT`, origen frontend, PostgreSQL y opciones HTTP/pool, con tipos/rangos seguros y fallo de startup por variable ausente; tipo: unit, debe fallar antes de T127.
- [x] T126 [P] [INTEGRATION] Probar en `apps/backend/src/__tests__/app-lifecycle.test.ts` que CORS usa exclusivamente el origen frontend validado y nunca degrada a `*` con credenciales cuando la configuración falta o es inválida; tipo: Express integration, debe fallar antes de T127.
- [x] T127 [BE] Centralizar la configuración runtime validada y aplicar el origen CORS/pool únicamente desde ella en `apps/backend/src/infrastructure/config/env.ts`, `apps/backend/src/app.ts`, `apps/backend/src/server.ts` y `apps/backend/src/infrastructure/postgres/postgresPool.ts` (depende de T125, T126); prueba mínima: T125/T126.
- [x] T128 [P] [UNIT] Probar en `apps/backend/src/services/conversations/__tests__/ConversationService.test.ts` y `turnEventPublisher.test.ts` que un rechazo de orquestación background se registra con datos seguros y que un listener del publisher que lanza no aborta la publicación para listeners sanos; tipo: unit, debe fallar antes de T130.
- [x] T129 [P] [INTEGRATION] Probar con PostgreSQL y provider/publisher controlados en `apps/backend/src/routes/conversations/__tests__/conversationCreation.integration.test.ts` que un fallo inesperado post-`202` no deja slots `pending`/`running` indefinidamente y converge a un estado terminal seguro y consultable; tipo: integration, debe fallar antes de T130.
- [x] T130 [BE] Aislar listeners del publicador y manejar rechazos de ejecución background con log seguro y reconciliación terminal de slots afectados en `apps/backend/src/services/conversations/ConversationService.ts`, `TurnOrchestrator.ts` y `turnEventPublisher.ts` (depende de T128, T129); prueba mínima: T128/T129.
- [x] T131 [P] [INTEGRATION] Ampliar `apps/backend/src/routes/conversations/__tests__/turnEvents.integration.test.ts` con un commit concurrente entre las lecturas del snapshot para exigir una proyección PostgreSQL coherente y un `lastEventSequence` ligado solo a la versión representada, sin pérdida ni descarte indebido durante el drenaje SSE; tipo: integration, debe fallar antes de T132.
- [x] T132 [BE] Hacer atómica/coherente la lectura de snapshot y asociar el sequence efímero a la proyección canónica representada en `apps/backend/src/infrastructure/postgres/repositories/turnRepository.ts`, `apps/backend/src/services/conversations/ConversationService.ts` y `apps/backend/src/controllers/conversations/turnEventsController.ts` (depende de T131); prueba mínima: T131.
- [x] T133 [P] [INTEGRATION] Ampliar `apps/backend/src/routes/conversations/__tests__/responseActions.integration.test.ts` para exigir que un retry base exitoso publique después del commit el `slot_update` de Qwen marcado `pending/stale` antes de su nueva ejecución; tipo: integration, debe fallar antes de T134.
- [x] T134 [BE] Publicar todos los slots modificados por retry, incluido Qwen `pending/stale`, desde `apps/backend/src/infrastructure/postgres/repositories/turnRepository.ts` y `apps/backend/src/services/conversations/TurnOrchestrator.ts` (depende de T133); prueba mínima: T133.
- [x] T135 [P] [INTEGRATION] Ampliar `apps/backend/src/__tests__/app-lifecycle.test.ts` para exigir que shutdown detenga admisión, complete o cancele de forma segura el trabajo rastreado y drene el pool PostgreSQL sin handles abiertos; tipo: lifecycle integration, debe fallar antes de T136.
- [x] T136 [BE] Dar ownership explícito del pool y ejecuciones activas al lifecycle en `apps/backend/src/server.ts`, `apps/backend/src/index.ts`, `apps/backend/src/infrastructure/postgres/postgresPool.ts` y `apps/backend/src/services/conversations/ConversationService.ts`, cerrando HTTP antes de drenar PostgreSQL (depende de T135); prueba mínima: T135.

### Frontend — T113

- [x] T137 [P] [UNIT] Ampliar `apps/frontend/src/features/conversations/api/__tests__/conversationsApi.test.ts` para convertir cualquier `ZodError` de una respuesta 2xx en un error cliente seguro y estable que no exponga paths ni detalles de schema; tipo: unit, debe fallar antes de T139.
- [x] T138 [P] [UNIT] Ampliar `apps/frontend/src/features/conversations/__tests__/conversationSchemas.test.ts` para rechazar `completed` sin contenido, combinaciones incompatibles de error/status, `continuedWithout` fuera de slots base `failed` e `isStale` fuera de Qwen; tipo: contract unit, debe fallar antes de T140.
- [x] T139 [P] [FE] Normalizar fallos de validación runtime a un error seguro en `apps/frontend/src/features/conversations/api/conversationsApi.ts` y preservar copy seguro en `apps/frontend/src/features/conversations/components/ConversationWorkspace.tsx` (depende de T137); prueba mínima: T137.
- [x] T140 [P] [FE] Codificar invariantes discriminadas de `ModelResponse` en `apps/frontend/src/features/conversations/schemas/conversationSchemas.ts` y mantener `apps/frontend/src/features/conversations/components/ResponsePanel.tsx` inaccesible a respuestas `completed` sin contenido (depende de T138); prueba mínima: T138.
- [x] T141 [P] [INTEGRATION] Ampliar `apps/frontend/src/features/conversations/__tests__/useTurnEvents.test.tsx` para exigir que un snapshot/evento terminal duplicado con `busy_update=false` cierre el único `EventSource` e invalide una sola vez, sin reconexiones ni polling; tipo: frontend integration, debe fallar antes de T142.
- [x] T142 [P] [FE] Evaluar convergencia terminal antes de descartar eventos duplicados y evitar suscripción SSE para turnos terminales en `apps/frontend/src/features/conversations/hooks/useTurnEvents.ts` y `apps/frontend/src/features/conversations/components/ConversationWorkspace.tsx` (depende de T141); prueba mínima: T141.
- [x] T143 [P] [UNIT] Añadir en `apps/frontend/src/features/conversations/components/__tests__/DeleteConversationDialog.test.tsx` el caso de borrar la última conversación y exigir que el foco termine en Nueva conversación, composer u otro destino existente; tipo: component unit, debe fallar antes de T144.
- [x] T144 [P] [FE] Garantizar un destino de foco válido al borrar la última conversación en `apps/frontend/src/features/conversations/components/DeleteConversationDialog.tsx`, `ConversationSidebar.tsx` y `apps/frontend/src/components/layout/AppShell.tsx` (depende de T143); prueba mínima: T143.
- [x] T145 [P] [UNIT] Añadir en `apps/frontend/src/features/conversations/components/__tests__/ResponsePanel.test.tsx` que un error de slot recibido asíncronamente se anuncia mediante una región accesible y conserva Retry/Continue-without asociados semánticamente; tipo: component unit, debe fallar antes de T146.
- [x] T146 [P] [FE] Añadir semántica de anuncio accesible al error de slot y a sus acciones en `apps/frontend/src/features/conversations/components/ResponsePanel.tsx` (depende de T145); prueba mínima: T145.

### Reauditoría obligatoria

- [x] T147 [BE-AUDIT] Reauditar read-only `apps/backend/`, `db/changelogs/` y las secciones 2, 4–12 y 14 de `specs/001-compare-llm-responses/quickstart.md` contra T112 y principios I–IV, VI–IX después de T127, T130, T132, T134 y T136; output: reporte con pass/fail, severidad, archivo y línea, sin modificar archivos ni ejecutar pruebas.
- [x] T148 [FE-AUDIT] Reauditar read-only `apps/frontend/`, `packages/ui/` y las secciones 3, 6, 9, 10, 13 y 14 de `specs/001-compare-llm-responses/quickstart.md` contra T113 y principios I, V, VII–IX después de T139, T140, T142, T144 y T146; output: reporte con pass/fail, severidad, archivo y línea, sin modificar archivos ni ejecutar pruebas.
- [x] T149 [INTEGRATION] Ampliar `apps/backend/src/__tests__/app-lifecycle.test.ts` para forzar un fallo de `recoverInterruptedTurns()` después de crear el pool y exigir que startup rechace solo después de ejecutar `pool.end()`, incluso con `POSTGRES_IDLE_TIMEOUT=0`; tipo: lifecycle integration, debe fallar antes de T150.
- [x] T150 [BE] Garantizar ownership y cierre del pool ante cualquier fallo posterior a su creación durante dependency setup/recovery en `apps/backend/src/server.ts` (depende de T149); prueba mínima: T149.
- [x] T151 [BE-AUDIT] Reauditar read-only el lifecycle de startup/pool en `apps/backend/src/server.ts`, `apps/backend/src/infrastructure/postgres/postgresPool.ts` y la evidencia de T149/T150 contra T147-H01 y principios II, VII–IX; output: reporte con pass/fail, severidad, archivo y línea, sin modificar archivos ni ejecutar pruebas.
- [x] T152 [INTEGRATION] Ampliar `apps/backend/src/__tests__/app-lifecycle.test.ts` para forzar una excepción síncrona posterior a crear dependencias —incluido puerto inválido— y exigir que `pool.end()` termine antes de que `startServer()` propague el error original; tipo: lifecycle integration, debe fallar antes de T153.
- [x] T153 [BE] Validar el puerto antes de crear recursos o incluir `createApp`/`listen` en la frontera de cleanup que drena el pool ante excepciones síncronas en `apps/backend/src/server.ts` (depende de T152); prueba mínima: T152.
- [x] T154 [BE-AUDIT] Reauditar read-only `apps/backend/src/server.ts` contra T151-H01 y la evidencia T152/T153; output: reporte con pass/fail, severidad, archivo y línea, sin modificar archivos ni ejecutar pruebas.

**Audit gate**: T148 y la última reauditoría backend T154 deben cerrar sin
hallazgos `critical` o `high`.
Un hallazgo bloqueante de reauditoría crea otra tarea builder concreta y exige una
nueva reauditoría; no avanzan los quality gates dependientes mientras quede uno abierto.

## Phase 7B: Remediación de atajo global de tema

**Purpose**: eliminar el atajo global de una sola tecla y conservar el cambio de
tema mediante un control accesible y visible en el header.

- [x] T155 [INTEGRATION] Ampliar `apps/frontend/src/components/layout/__tests__/AppShell.test.tsx` con `ThemeProvider` real para exigir que el header exponga un único botón de tema accesible: con tema efectivo oscuro muestra icono de sol, `title` y `aria-label` «Cambiar a modo claro»; con tema efectivo claro muestra icono de luna, `title` y `aria-label` «Cambiar a modo oscuro»; al activarlo alterna y la tecla global `d` no cambia el tema. Evitar aserciones de clases/layout privadas; tipo: frontend integration, debe fallar antes de T156.
- [x] T156 [FE] Eliminar el listener global de la tecla `d` en `packages/ui/src/components/theme-provider.tsx` y añadir en `apps/frontend/src/components/layout/AppShell.tsx` el botón icon-only de alternancia, conectado al tema efectivo (incluido `system`), con `title` y `aria-label` según el próximo modo; colocar el nombre de la aplicación al inicio y el control en la esquina superior derecha del header mediante un contenedor flex con separación entre extremos (depende de T155); prueba mínima: T155.

- [x] T114 [P] [INTEGRATION] Crear fixture ≤5 casos y runner de consolidación ≥90% en `apps/backend/src/services/conversations/__tests__/fixtures/consolidation-evaluation.json` y `apps/backend/src/acceptance/consolidationEvaluation.ts` (depende de T154); tipo: integration acceptance SC-005 con providers fake.
- [x] T115 [P] [PERF] Implementar la aceptación cuantitativa SC-001 con PostgreSQL local y providers fake deterministas en `apps/backend/src/acceptance/terminalStates.acceptance.test.ts` (owner: `performance-test-runner`; depende de T154): ejecutar un conjunto controlado, considerar exitosa solo la consulta cuyos cuatro slots obtengan una respuesta o estado terminal explícito dentro de 60 segundos, registrar total, éxitos, porcentaje y `pass`/`fail`, y fallar si el porcentaje es menor al 95%; las pruebas funcionales permanecen en UNIT/INTEGRATION.
- [x] T116 [P] [PERF] Implementar latencia `202`/primer historial p95 <1 s en `apps/backend/src/acceptance/latency.acceptance.test.ts` (owner: `performance-test-runner`; depende de T154); tipo: performance acceptance SC-010.
- [ ] T117 [P] [UX] Diseñar tareas, escenarios, criterios observables, escalas subjetivas y un grupo predefinido de al menos diez participantes válidos en `specs/001-compare-llm-responses/usability/sc-003-protocol.md`, incluyendo criterios previos de inclusión/exclusión y la regla de no reconfigurar muestra ni denominador después de iniciar la primera tarea (depende de T148); prueba mínima: revisión Product/UX de cobertura SC-003/SC-004.
- [ ] T118 [UX] Ejecutar SC-003 y SC-004 con el grupo predefinido en T117 y registrar por separado muestra prevista, al menos diez participantes válidos, exclusiones justificadas, numerador, denominador, porcentaje y `pass`/`fail` frente al 90% en `specs/001-compare-llm-responses/usability/sc-004-results.md` (depende de T117); tipo: aceptación Product/UX sin reconfiguración retrospectiva de la muestra.
- [x] T119 [INTEGRATION] Ejecutar sobre PostgreSQL desechable migrate-from-zero, Liquibase validate, rollback explícito, comprobación del estado anterior, reaplicación de changesets y Liquibase validate final con `docker-compose.yml` y `db/changelogs/db.changelog-master.xml` (depende de T154); tipo: integration DB y quality gate técnico de Liquibase, nunca rollback de producto ni sobre datos que deban conservarse, sin corregir fallos dentro de esta tarea.
- [x] T120 [P] [UNIT] Ejecutar las suites unitarias backend y frontend desde `apps/backend/package.json` y `apps/frontend/package.json` (depende de T154, T148); registrar fallos como tareas concretas.
- [ ] T121 [P] [INTEGRATION] Ejecutar las suites de integración backend y frontend desde `apps/backend/package.json` y `apps/frontend/package.json` (depende de T154, T148); registrar fallos como tareas concretas.
- [ ] T122 [E2E] Ejecutar Playwright con fakes desde `apps/frontend/playwright.config.ts` (depende de T154, T148 y de las historias implementadas); tipo: E2E, registrar fallos como tareas concretas.
- [x] T123 [P] [BE] Ejecutar `pnpm --filter backend build` desde `package.json` (owner: `backend-builder`; depende de T154); prueba mínima: comando exitoso, sin corregir hallazgos aquí.
- [x] T124 [P] [FE] Ejecutar `pnpm --filter frontend typecheck`, `pnpm --filter frontend lint`, `pnpm --filter frontend build`, `pnpm --filter @workspace/ui typecheck` y `pnpm --filter @workspace/ui lint` desde `package.json` (owner: `frontend-builder`; depende de T148); prueba mínima: cinco comandos exitosos, sin corregir hallazgos aquí.

### Correctivas generadas por T124

- [x] T157 [UNIT] Resolver los falsos positivos de argumentos `_url` mediante `argsIgnorePattern: '^_'` en la configuración ESLint de frontend/UI, manteniendo las variables locales bajo validación (generada por T124); prueba mínima: `pnpm --filter frontend lint` exitoso; desbloquea la reejecución de T124.
- [x] T158 [UI] Configurar el override de `react-refresh/only-export-components` únicamente para `packages/ui/src/components/**/*.{ts,tsx}`, preservando la validación del resto del paquete y sin cambiar el comportamiento de los componentes (generada por T124); prueba mínima: `pnpm --filter @workspace/ui typecheck` y `pnpm --filter @workspace/ui lint` exitosos; desbloquea la reejecución de T124.

### Correctivas generadas por T121

- [x] T159 [INTEGRATION] Corregir el escenario de nueva suscripción SSE en `apps/frontend/src/features/conversations/__tests__/conversation-continuation.test.tsx` para que el fixture seguido represente un turno realmente activo (`pending`/`running` y `hasWorkInProgress=true`) antes de esperar un `EventSource`, conservando por separado el contrato T142 que no abre streams para turnos terminales (generada por T121); prueba mínima: `conversation-continuation.test.tsx` y `useTurnEvents.test.tsx` exitosos mediante el script frontend; desbloquea la reejecución de T121.
- [x] T160 [INTEGRATION] Corregir los fixtures PostgreSQL de `apps/backend/src/infrastructure/postgres/repositories/__tests__/contextRepository.integration.test.ts`, `conversationHistoryRepository.integration.test.ts` y `apps/backend/src/routes/conversations/__tests__/conversationManagement.integration.test.ts` para usar UUIDs válidos, `create_client_request_id` únicos y parámetros SQL con tipos compatibles, sin cambiar producción (generada por T121); prueba mínima: las tres suites focalizadas pasan contra PostgreSQL desechable migrado; desbloquea la reejecución de T121.
- [x] T161 [INTEGRATION] Hacer deterministas `apps/backend/src/__tests__/app-lifecycle.test.ts`, `apps/backend/src/routes/conversations/__tests__/conversationCreation.integration.test.ts` y `conversationContinuation.integration.test.ts` mediante gates observables y cleanup explícito, sin sleeps, serialización ni aumento global del timeout (generada por T121); prueba mínima: las tres suites pasan con workers normales, sin retries ni handles abiertos, contra PostgreSQL desechable migrado; desbloquea la reejecución de T121.

### Correctivas generadas por T122

- [x] T162 [E2E] Corregir las expectativas Playwright de composer y Delete-busy en `apps/frontend/e2e/conversation-comparison.spec.ts`, `conversation-continuation.spec.ts`, `conversation-history.spec.ts`, `new-conversation.spec.ts` y `conversation-management.spec.ts`: comprobar el composer editable, habilitar Enviar solo después de escribir y localizar la explicación Delete-busy dentro del menú según el copy observable vigente (generada por T122); prueba mínima: los journeys focalizados llegan a sus aserciones funcionales sin falsos fallos de precondición.
- [x] T163 [INTEGRATION] Ampliar `apps/backend/src/routes/conversations/__tests__/responseActions.integration.test.ts` para demostrar que Continue-without exitoso seguido de Retry responde `409 RESPONSE_NOT_RETRYABLE`, conserva un cuerpo seguro y no muta estado ni invoca providers adicionales (generada por T122); tipo: integration backend, debe fallar antes de T164.
- [ ] T164 [BE] Aplicar una corrección de producción en `turnRepository.ts`, `ConversationService.ts` o el error boundary únicamente si la revalidación de T170 reproduce un 500 con el runtime E2E corregido (depende de T163); si T170 devuelve `409 RESPONSE_NOT_RETRYABLE`, cerrar esta hipótesis sin modificar producción.
- [x] T165 [E2E] Hacer determinista el teardown cuando Playwright encuentra fallos en `apps/frontend/playwright.config.ts` y `apps/frontend/e2e/support/backend.ts`, liberando browsers, servidores y puertos propios sin intervención manual (generada por T122); prueba mínima: una ejecución E2E controlada que falle termina con exit no-cero acotado y deja libres los puertos 3000/3001.
- [ ] T166 [E2E] Reejecutar los siete specs de T122 con Chromium, providers fake y PostgreSQL desechable migrado después de T162, T164 y T165; prueba mínima: 9/9 tests pasan, 0 retries, exit 0 y cleanup completo; al completarse permite cerrar T122.

### Correctivas generadas por las reejecuciones de T121 y T166

- [ ] T167 [INTEGRATION] Aislar los fixtures PostgreSQL compartidos por `recovery.integration.test.ts`, `conversationManagement.integration.test.ts` y `responseActions.integration.test.ts` para eliminar deadlocks, contaminación de filas y carreras CAS entre suites con workers normales, sin serializar ni añadir retries (generada por la reejecución de T121); prueba mínima: las nueve suites backend pasan 37/37 contra PostgreSQL desechable migrado y la suite frontend conserva 23/23; desbloquea una nueva reejecución de T121.
- [x] T168 [INTEGRATION] Reproducir con wiring HTTP y PostgreSQL reales la creación de un turno mientras la conversación sigue busy, demostrando `409 CONVERSATION_BUSY`, cuerpo seguro y cero mutaciones/providers adicionales (generada por T166); evidencia: `conversationContinuation.integration.test.ts`, 2/2 tests pasan contra PostgreSQL/Liquibase desechable y el POST concurrente devuelve 409 sin SQLSTATE.
- [x] T169 [BE] Cerrar sin cambio de backend la hipótesis de traducción/frontera transaccional de la continuación durante trabajo activo: T168 pasa y el `500` observado originalmente solo en E2E se atribuyó a resolución mezclada `src`/`dist`, corregida en `apps/frontend/playwright.config.ts` mediante `NODE_OPTIONS=--conditions=development`; no se requiere modificación productiva.
- [ ] T170 [INTEGRATION] Revalidar el Retry posterior a Continue-without mediante el wiring y la forma de request usados por E2E, después de unificar la resolución de módulos del backend Playwright; demostrar `409 RESPONSE_NOT_RETRYABLE`, cuerpo seguro y estado/providers inmutables. El `500` previo queda invalidado como evidencia de backend hasta repetirlo con el runtime corregido (generada por T166); solo si reproduce debe desbloquear T171.
- [ ] T171 [BE] Corregir la brecha de validación, wiring o traducción que todavía devuelva 500 para Retry posterior a Continue-without únicamente si T170 reproduce el fallo con el runtime E2E corregido (depende de T170); si T170 devuelve `409 RESPONSE_NOT_RETRYABLE`, cerrar esta hipótesis sin modificar producción; al completarse permite cerrar T164.
- [ ] T172 [INTEGRATION] Reproducir que una primera respuesta recuperable y una respuesta parcial de Qwen convergen a estado terminal, `busy=false` y cierre observable del SSE inicial, sin sleeps ni timeouts ampliados (generada por T166); la prueba debe fallar antes de T173.
- [ ] T173 [BE] Corregir el lifecycle terminal/SSE que mantiene el stream inicial abierto después de la recuperación parcial (depende de T172); prueba mínima: T172 y los tests focalizados de eventos/recuperación pasan sin handles abiertos.
- [ ] T174 [E2E] Reejecutar los siete specs y nueve tests de T166 después de T169, T171 y T173 con Chromium, providers fake y PostgreSQL desechable migrado; prueba mínima: 9/9 pasan, 0 retries, exit 0 y cleanup completo; al completarse permite cerrar T166 y T122.

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
- Phase 7 depende de las historias incluidas en la entrega; Phase 7A corrige los
  hallazgos bloqueantes de sus auditorías iniciales y bloquea todos los gates
  posteriores hasta que T154/T148 pasen.
- Phase 7B remedia el atajo global de tema informado por T148: `T155` prueba el
  contrato accesible y `T156` lo implementa; no ejecuta ni sustituye los quality
  gates T114–T124.

### Graph

```text
Setup → Foundational → US1 (MVP) → US2 → US3 → US4
                         └──────────────→ Acceptance → Audit remediation → Quality gates
```

### Critical chains

- Setup: `T002 → T003 → T004`; `T001/T002 → T005 → T006`.
- DB: `T010 → T011/T012 → T013 → T112 → T147 → T149/T150 → T151 → T152/T153 → T154 → T119`.
- Backend base: `T014 → T015 → T026`; `T021 → T022`; `T023 → T024`.
- Backend create: `T040 → T020 → T052 → T063`.
- Frontend base: `T028 → T029`; `T030 → T031`.
- Providers: `T035–T038 → T017 → T054–T057`; `T034 → T054–T057`; `T047/T054–T057 → T058 → T061`.
- SSE: `T032 → T033`; `T048 → T060`; `T041/T060 → T064/T065 → T067 → T074`.
- Frontend US1: `T049 → T066`; `T050 → T068`; `T051 → T072`.
- Context: `T039 → T059`; `T076 → T081 → T082 → T083`; `T075 → T082 → T083`; `T079 → T087`.
- US2: `T077 → T084/T085`; `T078 → T086/T088`.
- US3: `T089–T093 → T096–T102`; `T088/T099–T102 → T103`.
- US4: `T104/T105/T103 → T106 → T107`.
- Recovery: `T108 → T109 → T112`; frontend: `T107 → T113`.
- Backend remediation: `T125/T126 → T127`; `T128/T129 → T130`;
  `T131 → T132`; `T133 → T134`; `T135 → T136`; luego
  `T147 → T149/T150 → T151 → T152/T153 → T154`.
- Frontend remediation: `T137 → T139`; `T138 → T140`; `T141 → T142`;
  `T143 → T144`; `T145 → T146`; luego `T148 → T155 → T156`.
- Quality gates: `T154 → T114–T116/T119/T123`; `T148 → T117/T124`;
  `T154/T148 → T120–T122`; `T117 → T118`.
- Correctivas de quality gates: `T157/T158 → reejecutar T124`;
  `T159/T160/T161 → reejecutar T121 → T167 → reejecutar T121`;
  `T163 → T164`; `T162/T164/T165 → T166`;
  `T168 → T169`; `T170 → T171`; `T172 → T173`;
  `T169/T171/T173 → T174 → cerrar T166/T122`.

## Parallel opportunities

- Setup: T002 habilita las cadenas separadas T003→T004 y T005→T006;
  T007/T008/T009 conservan sus lanes sin compartir archivos.
- Foundation: lanes DB, backend contracts/config, fakes y frontend contracts.
- US1: T034–T051; cuatro adapters T054–T057; componentes T068–T073.
- US2: T075–T080; backend context y frontend components en archivos separados.
- US3: T089–T095; T099–T102.
- Final: T125/T126/T128/T129/T131/T133/T135 y T137/T138/T141/T143/T145 pueden
  ejecutarse en paralelo; cada builder espera su prueba propietaria. Las
  reauditorías solo empiezan después de todas las remediaciones de su dominio.

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

| Domain      | Primary owner             | Scope                                                                     |
| ----------- | ------------------------- | ------------------------------------------------------------------------- |
| FE          | `frontend-builder`        | `apps/frontend` composition/state                                         |
| UI          | `frontend-builder`        | `packages/ui` primitives only                                             |
| BE          | `backend-builder`         | API, orchestration, SSE and LLM adapters                                  |
| DB          | `backend-builder`         | Liquibase/schema validation                                               |
| FE-AUDIT    | `frontend-auditor`        | read-only frontend/UI boundary review and agent report                    |
| BE-AUDIT    | `backend-auditor`         | read-only backend/DB boundary review and agent report                     |
| UNIT        | `unit-test-runner`        | isolated unit and contract-unit tests                                     |
| INTEGRATION | `integration-test-runner` | browserless real-component boundaries                                     |
| E2E         | `e2e-test-runner`         | Playwright browser journeys                                               |
| PERF        | `performance-test-runner` | latency/distribution acceptance in controlled non-production environments |
| UX          | Product/UX                | participant protocol/evidence                                             |
| SHARED      | named owner               | cross-boundary integration/checks                                         |

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

1. Completar Phase 1 y Phase 2.
2. Escribir T034–T051 y confirmar que fallan.
3. Implementar T017, T020 y T052–T074.
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

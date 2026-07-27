# Tasks: Comparación y consolidación de respuestas LLM

**Input**: artefactos cerrados en `specs/001-compare-llm-responses/`
**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`,
`contracts/rest-api.md`, `contracts/llm-provider.md`, `quickstart.md`,
`consolidation-evaluation.md`

**Tests**: obligatorios para todo comportamiento no trivial. Las pruebas de cada
historia se escriben primero y deben fallar antes de implementar.

**Organization**: tareas agrupadas por historia y dominio. `[P]` solo identifica
trabajo en archivos distintos sin dependencia pendiente.

## Format: `[ID] [P?] [Story?] [Domain] Description`

- **[Story]**: `US1`, `US2`, `US3` o `US4`.
- **[Domain]**: `FE`, `BE`, `UI`, `DB`, `TEST`, `DOC` o `SHARED`.
- Cada tarea referencia un path concreto.
- Los contratos de Phase 1 son autoritativos; ninguna tarea puede añadir reglas
  no documentadas.

---

## Phase 1: Setup

**Purpose**: instalar únicamente dependencias y runners exigidos por el plan.

- [ ] T001 [FE] Añadir `@tanstack/react-query`, `@playwright/test`, scripts frontend y cambios de lockfile en `apps/frontend/package.json` y `pnpm-lock.yaml`
- [ ] T002 [UI] Añadir mediante el comando Shadcn del workspace `tabs`, `dialog`, `dropdown-menu`, `scroll-area`, `skeleton` y `alert` en `packages/ui/src/components/`
- [ ] T003 [P] [FE] Crear el QueryClient de producción y montar `QueryClientProvider` en `apps/frontend/src/providers/query-provider.tsx` y `apps/frontend/src/main.tsx` (depende de T001)
- [ ] T004 [P] [TEST] Configurar Testing Library y QueryClient aislado por prueba en `apps/frontend/src/test/setup.ts`, `apps/frontend/src/test/query-test-utils.tsx` y `apps/frontend/vitest.config.ts` (depende de T001)
- [ ] T005 [P] [TEST] Configurar Playwright con frontend/backend de prueba y Chromium en `apps/frontend/playwright.config.ts` (depende de T001)
- [ ] T006 [P] [DOC] Documentar credenciales/modelos, `CONVERSATION_CONTEXT_MAX_TURNS`, `CONVERSATION_SIDEBAR_PAGE_SIZE`, `VITE_API_BASE_URL` y `VITE_HISTORY_COLLAPSE_CHAR_THRESHOLD` sin secretos en `apps/backend/.env.sample` y `apps/frontend/.env.sample`

**Checkpoint**: dependencias disponibles sin crear nuevos workspaces, SDKs LLM,
librerías de retry ni infraestructura de idempotencia.

---

## Phase 2: Foundational

**Purpose**: esquema, contratos y composición que bloquean todas las historias.

### Database

- [ ] T007 [DB] Crear `conversations` y `turns` con `create_client_request_id`, `client_request_id`, ordinal, estados, cascades, uniques de idempotencia e índice único parcial de turno activo en `db/changelogs/conversations/001-create-conversations-and-turns.sql`
- [ ] T008 [DB] Crear `model_responses` con cuatro slots, estados, error recuperable, `continued_without_at`, `is_stale`, `attempt_no`, metadata segura, checks e índices de busy/recovery en `db/changelogs/messages/001-create-model-responses.sql` (depende de T007)
- [ ] T009 [DB] Crear changelogs de módulo e incluirlos desde el master en `db/changelogs/conversations/db.changelog-conversations.xml`, `db/changelogs/messages/db.changelog-messages.xml` y `db/changelogs/db.changelog-master.xml` (depende de T007, T008)
- [ ] T010 [TEST] Validar tablas, constraints, índice parcial, ausencia de tablas extra y cascades en `db/tests/validate-model-fuse-schema.sql` (depende de T009)

### Backend

- [ ] T011 [P] [BE] Validar credenciales/modelos de cuatro providers, timeout, ventana de contexto y tamaño del sidebar con Zod en `apps/backend/src/infrastructure/config/env.ts`
- [ ] T012 [P] [BE] Definir contratos REST de conversación, turno, slot, `hasWorkInProgress`, cursores y errores cerrados en `apps/backend/src/types/conversations.ts`
- [ ] T013 [P] [BE] Definir schemas Zod para UUID `clientRequestId`, prompt, rename, IDs, slots y cursores en `apps/backend/src/middleware/validation/conversationSchemas.ts`
- [ ] T014 [BE] Implementar middleware de validación y errores saneados en `apps/backend/src/middleware/validation/validateRequest.ts` y `apps/backend/src/types/apiError.ts` (depende de T013)
- [ ] T015 [P] [BE] Definir `LlmProvider`, mensajes, resultados, métricas opcionales no persistidas y errores normalizados en `apps/backend/src/types/llm.ts` y `apps/backend/src/services/llm/llmErrors.ts`
- [ ] T016 [BE] Crear helper de transacción PostgreSQL reutilizable en `apps/backend/src/infrastructure/postgres/transaction.ts` (depende de T009)
- [ ] T017 [BE] Crear mappers PostgreSQL→REST sin secretos ni contexto compuesto en `apps/backend/src/infrastructure/postgres/mappers/conversationMapper.ts` (depende de T012)
- [ ] T018 [P] [BE] Implementar encode/decode validado de cursores opacos en `apps/backend/src/utils/cursor.ts`
- [ ] T019 [P] [BE] Implementar cálculo puro de estado de turno desde sus cuatro slots en `apps/backend/src/services/conversations/turnState.ts`
- [ ] T020 [BE] Crear `apiRouter` y `createApp()` testeable en `apps/backend/src/routes/apiRouter.ts` y `apps/backend/src/app.ts` (depende de T014)
- [ ] T021 [BE] Crear `startServer()`/shutdown y limitar `index.ts` a start/stop en `apps/backend/src/server.ts` y `apps/backend/src/index.ts` (depende de T011, T020)
- [ ] T022 [P] [TEST] Crear providers fake deterministas y fixtures base en `apps/backend/src/test/fakes/fakeLlmProvider.ts` y `apps/backend/src/test/fixtures/conversationFixtures.ts` (depende de T015)

### Frontend

- [ ] T023 [P] [FE] Definir tipos y schemas Zod alineados con REST en `apps/frontend/src/features/conversations/types/conversation.ts` y `apps/frontend/src/features/conversations/schemas/conversationSchemas.ts`
- [ ] T024 [P] [FE] Crear cliente Axios cancelable y query keys por conversación/turno en `apps/frontend/src/features/conversations/api/client.ts` y `apps/frontend/src/features/conversations/queries/conversation-keys.ts`

**Checkpoint**: Liquibase valida; no existen tablas de idempotencia, locks,
contexto, retries, métricas, ranking ni evaluación.

---

## Phase 3: User Story 1 — Comparar y consolidar respuestas (P1) 🎯 MVP

**Goal**: crear idempotentemente la primera conversación, ejecutar tres bases en
paralelo, consolidar con Qwen y ofrecer recuperación manual por slot.

**Independent Test**: con providers fake, un prompt produce cuatro tabs separados;
un fallo base muestra Retry/Continue-without inmediatamente, no se reintenta solo
y un replay HTTP no duplica recursos ni providers.

### Tests

- [ ] T025 [P] [US1] [TEST] Probar bases paralelas, persistencia independiente y consolidación con respuestas disponibles en `apps/backend/src/services/conversations/__tests__/TurnOrchestrator.test.ts`
- [ ] T026 [P] [US1] [TEST] Probar primera falla, un solo intento, Retry manual y Continue-without sin provider en `apps/backend/src/services/conversations/__tests__/slotFailurePolicy.test.ts`
- [ ] T027 [P] [US1] [TEST] Probar mapping, normalización, cancelación, credencial rechazada y ausencia de retry automático de OpenAI en `apps/backend/src/infrastructure/llm/providers/__tests__/OpenAiProvider.test.ts`
- [ ] T028 [P] [US1] [TEST] Probar mapping, normalización, cancelación, credencial rechazada y ausencia de retry automático de Google en `apps/backend/src/infrastructure/llm/providers/__tests__/GoogleProvider.test.ts`
- [ ] T029 [P] [US1] [TEST] Probar mapping, normalización, cancelación, credencial rechazada y ausencia de retry automático de MiniMax en `apps/backend/src/infrastructure/llm/providers/__tests__/MiniMaxProvider.test.ts`
- [ ] T030 [P] [US1] [TEST] Probar mapping, normalización, cancelación, credencial rechazada y ausencia de retry automático de Qwen en `apps/backend/src/infrastructure/llm/providers/__tests__/QwenProvider.test.ts`
- [ ] T031 [P] [US1] [TEST] Probar create `202`, replay concurrente, conflicto de ID/prompt y título determinista con Supertest en `apps/backend/src/routes/conversations/__tests__/conversationCreation.integration.test.ts`
- [ ] T032 [P] [US1] [TEST] Probar retry atómico del mismo slot, `RESPONSE_RETRY_IN_PROGRESS`, `attempt_no`, resultado tardío y Continue-without con Supertest en `apps/backend/src/routes/conversations/__tests__/responseRecovery.integration.test.ts`
- [ ] T033 [P] [US1] [TEST] Probar cuatro tabs, etiquetas no cromáticas, estados, Retry visible/disabled y Continue-without accesible en `apps/frontend/src/features/conversations/__tests__/ResponseTabs.test.tsx`
- [ ] T034 [P] [US1] [TEST] Probar UUID estable por submit, prevención de doble click, polling y cache por IDs de origen en `apps/frontend/src/features/conversations/__tests__/conversation-execution-queries.test.tsx`
- [ ] T035 [P] [US1] [TEST] Escribir E2E de prompt inicial, cuatro respuestas, replay, fallo parcial, Retry y Continue-without en `apps/frontend/e2e/conversation-comparison.spec.ts`

### Backend implementation

- [ ] T036 [P] [US1] [BE] Implementar creación/replay atómicos de conversación, título determinista, primer turno y cuatro slots en `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts`
- [ ] T037 [P] [US1] [BE] Implementar lecturas, transiciones CAS por `attempt_no`, recálculo de turno y busy derivado por EXISTS de turnos/slots en `apps/backend/src/infrastructure/postgres/repositories/turnRepository.ts`
- [ ] T038 [P] [US1] [BE] Implementar adapter OpenAI según su deployment configurado en `apps/backend/src/infrastructure/llm/providers/OpenAiProvider.ts`
- [ ] T039 [P] [US1] [BE] Implementar adapter Google según su deployment configurado en `apps/backend/src/infrastructure/llm/providers/GoogleProvider.ts`
- [ ] T040 [P] [US1] [BE] Implementar adapter MiniMax según su deployment configurado en `apps/backend/src/infrastructure/llm/providers/MiniMaxProvider.ts`
- [ ] T041 [P] [US1] [BE] Implementar adapter Qwen según su deployment configurado en `apps/backend/src/infrastructure/llm/providers/QwenProvider.ts`
- [ ] T042 [US1] [BE] Construir el mapa literal de cuatro adapters en `apps/backend/src/infrastructure/llm/providerRegistry.ts` (depende de T038–T041)
- [ ] T043 [US1] [BE] Implementar tres bases con `Promise.allSettled`, persistencia por intento y consolidación Qwen en `apps/backend/src/services/conversations/TurnOrchestrator.ts` (depende de T037, T042)
- [ ] T044 [US1] [BE] Implementar retry manual, exclusión del mismo slot, stale/reconsolidación y Continue-without en `apps/backend/src/services/conversations/TurnOrchestrator.ts` (depende de T043)
- [ ] T045 [US1] [BE] Implementar create/replay, polling y acciones de slot en `apps/backend/src/services/conversations/ConversationService.ts` (depende de T036, T037, T044)
- [ ] T046 [US1] [BE] Implementar recovery de `pending`/`running`, recálculo de turnos/busy, cero relanzamientos y conexión previa a HTTP en `apps/backend/src/services/conversations/recoverInterruptedTurns.ts` y `apps/backend/src/server.ts` (depende de T037, T045)
- [ ] T047 [US1] [BE] Exponer create, get turn, retry y continue-without mediante controller/router delgados en `apps/backend/src/controllers/conversations/conversationController.ts` y `apps/backend/src/routes/conversations/conversationRoutes.ts` (depende de T045, T046)

### Frontend implementation

- [ ] T048 [P] [US1] [FE] Implementar API validada de create, get turn, retry y continue-without en `apps/frontend/src/features/conversations/api/conversationsApi.ts`
- [ ] T049 [US1] [FE] Implementar create/poll/retry/continue hooks con `clientRequestId` estable e invalidación dirigida en `apps/frontend/src/features/conversations/hooks/useConversationExecution.ts` (depende de T048)
- [ ] T050 [P] [US1] [FE] Crear layout accesible de sidebar/workspace en `apps/frontend/src/components/layout/AppShell.tsx`
- [ ] T051 [P] [US1] [FE] Crear indicador textual de procesamiento en `apps/frontend/src/features/conversations/components/ConversationProcessingNotice.tsx`
- [ ] T052 [P] [US1] [FE] Crear cuatro tabs con labels persistentes en `apps/frontend/src/features/conversations/components/ResponseTabs.tsx`
- [ ] T053 [P] [US1] [FE] Crear panel de respuesta con estados, Retry, Continue-without y stale en `apps/frontend/src/features/conversations/components/ResponsePanel.tsx`
- [ ] T054 [P] [US1] [FE] Crear composer con trim, disabled local y UUID por submit lógico en `apps/frontend/src/features/conversations/components/PromptComposer.tsx`
- [ ] T055 [US1] [FE] Crear `TurnCard` y workspace de un turno en `apps/frontend/src/features/conversations/components/TurnCard.tsx` y `apps/frontend/src/features/conversations/components/ConversationWorkspace.tsx` (depende de T049, T051–T054)
- [ ] T056 [US1] [SHARED] Integrar AppShell, workspace y queries en `apps/frontend/src/App.tsx` (owner: frontend-builder; depende de T050, T055)

**Checkpoint**: US1 pasa y entrega el MVP sin retry automático, adapter compartido
ni duplicación idempotente.

---

## Phase 4: User Story 2 — Continuar una conversación (P2)

**Goal**: crear turnos posteriores con busy/idempotencia por conversación y
contexto acotado estrictamente aislado.

**Independent Test**: un segundo prompt usa historiales separados; un ID nuevo
durante busy recibe 409, un replay devuelve el turno original y la UI comunica
`metadata.contextWindow.truncated`.

### Tests

- [ ] T057 [P] [US2] [TEST] Probar contexto base/Qwen, orden, ventana por turnos y evidencia sin contenido duplicado en `apps/backend/src/services/conversations/__tests__/ContextBuilder.test.ts`
- [ ] T058 [P] [US2] [TEST] Probar replay previo a busy, IDs distintos concurrentes, conflicto ID/prompt y busy liberado en terminales en `apps/backend/src/routes/conversations/__tests__/conversationContinuation.integration.test.ts`
- [ ] T059 [P] [US2] [TEST] Probar retry de turno antiguo contra otro activo, retry base fallido sin Qwen y éxito con reconsolidación en `apps/backend/src/services/conversations/__tests__/retryReconsolidation.integration.test.ts`
- [ ] T060 [P] [US2] [TEST] Probar createTurn, UUID estable, `CONVERSATION_BUSY`, polling y cache del nuevo turno en `apps/frontend/src/features/conversations/__tests__/conversation-continuation-queries.test.tsx`
- [ ] T061 [P] [US2] [TEST] Probar aviso textual de `contextWindow.truncated` sin revelar contexto en `apps/frontend/src/features/conversations/__tests__/ContextWindowNotice.test.tsx`
- [ ] T062 [P] [US2] [TEST] Escribir E2E multi-turno de busy por conversación, navegación, aislamiento y contexto acotado en `apps/frontend/e2e/conversation-continuation.spec.ts`

### Backend implementation

- [ ] T063 [US2] [BE] Implementar consultas de historial aislado por slot y Qwen en `apps/backend/src/infrastructure/postgres/repositories/contextRepository.ts`
- [ ] T064 [US2] [BE] Implementar ventana por turnos y `metadata.contextWindow` segura en `apps/backend/src/services/conversations/ContextBuilder.ts` (depende de T063)
- [ ] T065 [US2] [BE] Integrar ContextBuilder en bases/Qwen sin historial cruzado ni presupuesto, estimación o límite de tokens por modelo en `apps/backend/src/services/conversations/TurnOrchestrator.ts` (depende de T064)
- [ ] T066 [US2] [BE] Implementar lock breve, replay, conflicto, predicado busy y ordinal del turno posterior en `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts` (depende de T036, T037)
- [ ] T067 [US2] [BE] Exponer `POST /conversations/:id/turns` y `CONVERSATION_BUSY` en `apps/backend/src/services/conversations/ConversationService.ts`, `apps/backend/src/controllers/conversations/conversationController.ts` y `apps/backend/src/routes/conversations/conversationRoutes.ts` (depende de T065, T066)

### Frontend implementation

- [ ] T068 [P] [US2] [FE] Añadir createTurn a API/hook con UUID estable y replay seguro en `apps/frontend/src/features/conversations/api/conversationsApi.ts` y `apps/frontend/src/features/conversations/hooks/useConversationExecution.ts`
- [ ] T069 [P] [US2] [FE] Crear aviso de contexto acotado desde metadata en `apps/frontend/src/features/conversations/components/ContextWindowNotice.tsx`
- [ ] T070 [US2] [FE] Renderizar múltiples turnos cronológicos y follow-ups en `apps/frontend/src/features/conversations/components/TurnList.tsx` y `apps/frontend/src/features/conversations/components/ConversationWorkspace.tsx` (depende de T068, T069)
- [ ] T071 [US2] [FE] Aplicar busy: deshabilitar Enviar/todos los Retry, mantener Continue-without y reactivar en `failed`/`partial` terminales en `apps/frontend/src/features/conversations/components/PromptComposer.tsx` y `apps/frontend/src/features/conversations/components/ResponsePanel.tsx`
- [ ] T072 [US2] [FE] Mantener busy/cache por conversación al navegar en `apps/frontend/src/components/layout/AppShell.tsx` y `apps/frontend/src/features/conversations/queries/conversation-keys.ts` (depende de T068, T071)

**Checkpoint**: US1+US2 pasan con un único turno activo por conversación y sin
bloqueo global.

---

## Phase 5: User Story 3 — Recuperar y gestionar conversaciones (P3)

**Goal**: sidebar infinito, reapertura con tres turnos, historial ascendente,
rename/delete y colapso histórico local.

**Independent Test**: reabrir siete turnos muestra 3, luego 3+1 al subir sin salto;
sidebar se llena hacia abajo; rename persiste y delete exige confirmación.

### Tests

- [ ] T073 [P] [US3] [TEST] Probar encode/decode y rechazo de cursores opacos en `apps/backend/src/utils/__tests__/cursor.test.ts`
- [ ] T074 [P] [US3] [TEST] Probar sidebar ordenado, páginas estables, bloques 3/3/1, turnos completos y cascades en `apps/backend/src/infrastructure/postgres/repositories/__tests__/conversationHistoryRepository.integration.test.ts`
- [ ] T075 [P] [US3] [TEST] Probar list/detail/history/rename/delete y errores de cursor con Supertest en `apps/backend/src/routes/conversations/__tests__/conversationHistory.integration.test.ts`
- [ ] T076 [P] [US3] [TEST] Probar `useInfiniteQuery` de sidebar/historial y flatten cronológico en `apps/frontend/src/features/conversations/__tests__/conversation-history-queries.test.tsx`
- [ ] T077 [P] [US3] [TEST] Probar sentinel superior y conservación de `scrollTop` al anteponer en `apps/frontend/src/features/conversations/__tests__/HistoryTopSentinel.test.tsx`
- [ ] T078 [P] [US3] [TEST] Probar sentinel inferior y autofill del sidebar hasta llenar/agotar en `apps/frontend/src/features/conversations/__tests__/ConversationSidebar.test.tsx`
- [ ] T079 [P] [US3] [TEST] Probar teclado, foco, contador, trim, cancelación y confirmación de dialogs en `apps/frontend/src/features/conversations/__tests__/ConversationMenuDialogs.test.tsx`
- [ ] T080 [P] [US3] [TEST] Probar colapso histórico local sin request ni escritura en `apps/frontend/src/features/conversations/__tests__/CollapsibleHistoryMessage.test.tsx`
- [ ] T081 [P] [US3] [TEST] Escribir E2E de reapertura, tres turnos iniciales y scroll ascendente en `apps/frontend/e2e/conversation-history.spec.ts`
- [ ] T082 [P] [US3] [TEST] Escribir E2E de sidebar, rename persistente, delete confirmado y draft vacío al eliminar la conversación activa en `apps/frontend/e2e/conversation-management.spec.ts`

### Backend implementation

- [ ] T083 [US3] [BE] Implementar página del sidebar por cursor `(updated_at,id)`, tamaño configurado y `hasWorkInProgress` en `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts`
- [ ] T084 [US3] [BE] Implementar bloque reciente y bloques anteriores de hasta tres turnos completos en `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts`
- [ ] T085 [US3] [BE] Implementar persistencia/servicio de detail, rename trim 1–80 y delete cascade en `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts` y `apps/backend/src/services/conversations/ConversationService.ts`
- [ ] T086 [US3] [BE] Exponer list/detail/history/rename/delete en `apps/backend/src/controllers/conversations/conversationController.ts` y `apps/backend/src/routes/conversations/conversationRoutes.ts` (depende de T083–T085)

### Frontend implementation

- [ ] T087 [P] [US3] [FE] Implementar API de list/detail/history/rename/delete con `AbortSignal` en `apps/frontend/src/features/conversations/api/conversationsApi.ts`
- [ ] T088 [US3] [FE] Implementar queries infinitas de sidebar e historial en `apps/frontend/src/features/conversations/hooks/useConversationQueries.ts` (depende de T087)
- [ ] T089 [P] [US3] [FE] Implementar helpers de cache para flatten, prepend y reemplazo en `apps/frontend/src/features/conversations/queries/conversation-cache.ts`
- [ ] T090 [US3] [FE] Crear sidebar, item con título/fecha, menú y sentinel inferior con autofill en `apps/frontend/src/features/conversations/components/ConversationSidebar.tsx`, `ConversationListItem.tsx` y `ConversationMenu.tsx` (depende de T088)
- [ ] T091 [P] [US3] [FE] Crear dialogs accesibles de rename/delete en `apps/frontend/src/features/conversations/components/RenameConversationDialog.tsx` y `DeleteConversationDialog.tsx`
- [ ] T092 [US3] [FE] Implementar mutations de rename/delete e invalidación dirigida en `apps/frontend/src/features/conversations/hooks/useConversationMutations.ts` (depende de T087, T089, T091)
- [ ] T093 [US3] [FE] Implementar sentinel superior y compensación por `scrollHeight` en `apps/frontend/src/features/conversations/components/HistoryTopSentinel.tsx` y `TurnList.tsx` (depende de T077, T088, T089)
- [ ] T094 [P] [US3] [FE] Implementar “Mostrar más / Mostrar menos” local en `apps/frontend/src/features/conversations/components/CollapsibleHistoryMessage.tsx`
- [ ] T095 [US3] [FE] Integrar selección, historial, dialogs y colapso en `apps/frontend/src/components/layout/AppShell.tsx` y `apps/frontend/src/features/conversations/components/ConversationWorkspace.tsx` (depende de T090–T094)

**Checkpoint**: US3 pasa sin botones de página, mensajes divididos ni estado de
expansión persistido.

---

## Phase 6: User Story 4 — Iniciar un contexto nuevo (P4)

**Goal**: abrir un único draft local vacío sin borrar ni persistir historial.

**Independent Test**: Nueva conversación vacía no inserta datos; el primer prompt
crea la conversación sin contexto anterior y conserva las previas.

- [ ] T096 [P] [US4] [TEST] Probar draft nuevo repetido y conservación del historial en `apps/frontend/src/features/conversations/__tests__/new-conversation-draft.test.tsx`
- [ ] T097 [P] [US4] [TEST] Escribir E2E de nuevo contexto persistido solo tras primer prompt en `apps/frontend/e2e/new-conversation.spec.ts`
- [ ] T098 [US4] [FE] Añadir estado local de selección/draft y acción Nueva conversación en `apps/frontend/src/components/layout/AppShell.tsx` y `apps/frontend/src/features/conversations/components/ConversationSidebar.tsx`
- [ ] T099 [US4] [FE] Enviar el primer prompt del draft con `POST /conversations`, seleccionar el ID y preservar la lista en `apps/frontend/src/features/conversations/components/ConversationWorkspace.tsx` (depende de T098)

**Checkpoint**: no existe endpoint clear ni conversación vacía persistida.

---

## Phase 7: Acceptance, observability and documentation

- [ ] T100 [P] [BE] Añadir logs Pino por request/conversation/turn/slot, busy, replay, duración y estado sin prompts, respuestas, credenciales ni payloads en `apps/backend/src/services/conversations/TurnOrchestrator.ts` y `apps/backend/src/middleware/logger/requestContext.ts`
- [ ] T101 [P] [TEST] Probar que logs/errores/metadata no contienen prompts, respuestas, headers ni secretos en `apps/backend/src/services/conversations/__tests__/observabilitySafety.test.ts`
- [ ] T102 [P] [TEST] Crear fixture y prueba SC-002 que recrea servicios sobre la misma DB y exige orden, atribución, estados y consulta en el 100% del conjunto en `apps/backend/src/services/conversations/__tests__/recovery.integration.test.ts` y `apps/backend/src/services/conversations/__tests__/fixtures/recoveryCases.ts`
- [ ] T103 [P] [TEST] Crear fixture SC-005 de máximo cinco casos conforme al contrato en `apps/backend/src/services/conversations/__tests__/fixtures/consolidation-evaluation.json`
- [ ] T104 [TEST] Implementar runner SC-005 de un intento Qwen por caso y fallo debajo del 90% en `apps/backend/src/acceptance/consolidationEvaluation.ts` y `apps/backend/package.json` (depende de T103)
- [ ] T105 [P] [TEST] Implementar SC-010 con providers fake, `202` y ambos endpoints bajo un segundo en al menos el 95% de ejecuciones en `apps/backend/src/acceptance/latency.acceptance.test.ts`
- [ ] T106 [P] [TEST] Implementar SC-001 de estados terminales dentro de 60 segundos en al menos el 95% de consultas fake en `apps/backend/src/acceptance/terminalStates.acceptance.test.ts`
- [ ] T107 [P] [FE] Completar estados loading/empty/error/disabled, foco visible y announcements accesibles en `apps/frontend/src/features/conversations/components/`
- [ ] T108 [TEST] Ejecutar migrate/validate/rollback desde cero y ajustar solo migraciones o checks contractuales en `db/changelogs/` y `db/tests/validate-model-fuse-schema.sql`
- [ ] T109 [TEST] Ejecutar todas las pruebas E2E con providers fake y estabilizar únicamente fixtures en `apps/frontend/e2e/`
- [ ] T110 [TEST] Ejecutar Vitest backend/frontend y corregir únicamente comportamiento o expectativas desalineadas en `apps/backend/src/**/__tests__/` y `apps/frontend/src/**/__tests__/`
- [ ] T111 [SHARED] Ejecutar `pnpm typecheck`, `pnpm lint`, `pnpm test` y `pnpm build` desde `package.json` (owner: integration-owner)
- [ ] T112 [DOC] Recorrer el smoke flow y corregir solo comandos/variables realmente implementados en `specs/001-compare-llm-responses/quickstart.md`

---

## Dependencies and execution order

### Phase dependencies

- Phase 1 no tiene dependencias.
- Phase 2 depende de Phase 1 y bloquea todas las historias.
- US1 depende de Phase 2 y constituye el MVP.
- US2 amplía orquestación, repositorios y workspace de US1.
- US3 puede iniciar su lane backend/frontend después de Phase 2, pero su
  integración final T095 usa el workspace multiturno de US2.
- US4 depende del sidebar/selección de US3.
- Phase 7 depende de las historias incluidas en la entrega.

### Graph

```text
Setup → Foundational → US1 (MVP) → US2
                         └────────→ US3 → US4
US1 + US2 + US3 + US4 → Acceptance
```

### Critical chains

- DB: `T007 → T008 → T009 → T010`.
- Composition: `T011/T014/T020 → T021`.
- Providers: `T038–T041 → T042 → T043 → T044`.
- Initial API: `T036/T037/T044 → T045 → T046 → T047`.
- Initial UI: `T048 → T049`; `T050–T054 → T055 → T056`.
- Context: `T063 → T064 → T065 → T067`.
- Existing turn: `T066 → T067 → T068 → T070/T072`.
- History backend: `T083/T084/T085 → T086`.
- History frontend: `T087 → T088`; `T089/T091 → T092/T093 → T095`.
- New context: `T098 → T099`.
- Acceptance: `T103 → T104`; las demás tareas T100–T112 usan sus implementaciones
  correspondientes.

## Parallel opportunities

- Setup: T003–T006 después de instalar dependencias.
- Foundational: lane DB, contratos backend y contratos frontend avanzan en
  paralelo.
- US1: cuatro adapter tests y cuatro adapters avanzan por provider; frontend puede
  implementar contra REST contract mientras backend trabaja.
- US2: ContextBuilder, integración REST y pruebas frontend usan archivos
  separados antes de integrar.
- US3: cursores/backend, infinite queries, dialogs y colapso avanzan en paralelo.
- Final: observabilidad, SC-002, SC-005, SC-010 y accesibilidad usan archivos
  independientes.

## Parallel examples

### US1

```text
TEST providers: T027 + T028 + T029 + T030
BE providers:   T038 + T039 + T040 + T041
FE components:  T051 + T052 + T053 + T054
```

### US2

```text
TEST: T057 + T058 + T059 + T060 + T061 + T062
BE:   T063 → T064 → T065, en paralelo con T066
FE:   T068 + T069, luego T070/T071/T072
```

### US3

```text
TEST backend:  T073 + T074 + T075
TEST frontend: T076 + T077 + T078 + T079 + T080
FE:            T087 + T089 + T091 + T094
```

## Domain ownership

| Domain | Primary owner | Scope |
|---|---|---|
| FE | `frontend-builder` | `apps/frontend` |
| UI | `frontend-builder` | `packages/ui` primitives only |
| BE | `backend-builder` | `apps/backend` |
| DB | `backend-builder` | `db/changelogs` |
| TEST | `unit-test-runner` or domain builder | test/acceptance files |
| DOC | integration owner | env samples and quickstart |

Auditors remain read-only. Cross-domain changes require the explicit SHARED
integration tasks T056/T111.

## Independent test criteria

- **US1**: four slots, partial consolidation, immediate recovery actions, no
  automatic retry and idempotent initial creation.
- **US2**: one active turn per conversation, safe replay, isolated bounded context
  and visible truncation evidence.
- **US3**: three-turn initial window, cursor scrolling, stable position, sidebar
  autofill, rename/delete and local collapse.
- **US4**: local empty draft and persistence only on first valid prompt.

## Implementation strategy

### MVP first

1. Complete T001–T024.
2. Write T025–T035 and confirm they fail.
3. Implement T036–T056.
4. Validate US1 independently.

### Incremental delivery

1. US1: compare, consolidate and recover one turn.
2. US2: continue with busy/idempotency/context isolation.
3. US3: recover and manage history.
4. US4: start a clean local context.
5. Phase 7: acceptance and quality gates.

## Notes

- TanStack Query owns server state; React local state is limited to draft,
  selection, tabs, dialogs and expansion.
- PostgreSQL constraints and transactions implement idempotency/busy/retry
  exclusion; no auxiliary tables or in-memory mutexes.
- Each adapter executes one external call per accepted invocation.
- Metrics remain optional in the LLM contract and are not persisted in v1.
- No task may add token budgets, summaries, ranking, streaming, queues, provider
  payload sharing or automatic retries.

# Tasks: Comparación y consolidación de respuestas LLM

**Input**: `specs/001-compare-llm-responses/spec.md` actualizado el 2026-07-27 y
artefactos Phase 1 derivados de `plan.md`.

**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`,
`contracts/rest-api.md`, `contracts/llm-provider.md`, `quickstart.md` y
`consolidation-evaluation.md`.

**Tests**: obligatorios para todo comportamiento no trivial. En cada historia se
escriben primero y deben fallar antes de implementar.

**Organization**: tareas agrupadas por historia, owner y dependencia. Cada tarea
incluye trazabilidad material a FR/SC y un path concreto.

## Format: `[ID] [P?] [Story?] [Domain] Description`

- **[P]**: ejecutable en paralelo después de sus dependencias, sin compartir
  archivos con otra tarea concurrente.
- **[Story]**: `US1`, `US2`, `US3` o `US4`; solo aparece en fases de historia.
- **[Domain]**: `FE`, `BE`, `UI`, `DB`, `TEST`, `DOC`, `UX` o `SHARED`.
- Una validación solo ejecuta el check indicado. Si falla, se crea una tarea nueva
  con componente, causa, archivo y prueba concretos.

---

## Phase 1: Setup

**Purpose**: instalar únicamente dependencias y runners exigidos por el plan.

- [ ] T001 [FE] Añadir TanStack Query y Playwright con sus scripts en `apps/frontend/package.json` y actualizar `pnpm-lock.yaml` (FR-005, FR-052)
- [ ] T002 [UI] Añadir mediante Shadcn las primitivas en `packages/ui/src/components/tabs.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `scroll-area.tsx`, `skeleton.tsx` y `alert.tsx` (FR-005, FR-025, FR-028, FR-048, FR-051)
- [ ] T003 [P] [FE] Crear `QueryClient` y montar `QueryClientProvider` en `apps/frontend/src/providers/query-provider.tsx` y `apps/frontend/src/main.tsx` (depende de T001; FR-015, FR-030, FR-052)
- [ ] T004 [P] [TEST] Configurar Testing Library y QueryClient aislado en `apps/frontend/src/test/setup.ts`, `apps/frontend/src/test/query-test-utils.tsx` y `apps/frontend/vitest.config.ts` (depende de T001; SC-006–SC-012)
- [ ] T005 [P] [TEST] Configurar Playwright y providers fake en `apps/frontend/playwright.config.ts` (depende de T001; SC-001, SC-006–SC-012)
- [ ] T006 [P] [DOC] Documentar credenciales, modelos, límites por deployment, `LLM_CONTEXT_THRESHOLD_RATIO`, `CONVERSATION_CONTEXT_MAX_TURNS`, sidebar y los nombres lógicos `POLL_INTERVAL_MS`/`POLL_TIMEOUT_MS` en `apps/backend/.env.sample` (FR-020, FR-022, FR-043, FR-044, FR-052)
- [ ] T007 [P] [DOC] Documentar `VITE_API_BASE_URL`, colapso, intervalo lógico `POLL_INTERVAL_MS` mediante `VITE_POLL_INTERVAL_MS` y timeout mediante `VITE_POLL_TIMEOUT_MS` en `apps/frontend/.env.sample` (FR-039, FR-052)

**Checkpoint**: dependencias disponibles sin SDKs LLM preventivos, librería de
retry, streaming, colas ni infraestructura genérica de idempotencia.

---

## Phase 2: Foundational

**Purpose**: esquema, configuración y contratos que bloquean todas las historias.

### Database

- [ ] T008 [DB] Crear `conversations` y `turns` con request IDs, ordinal, estados, cascades, uniques de idempotencia e índice único parcial de turno activo en `db/changelogs/conversations/001-create-conversations-and-turns.sql` (FR-012, FR-014, FR-045, FR-046)
- [ ] T009 [DB] Crear `model_responses` con cuatro slots, errores, `continued_without_at`, `is_stale`, `attempt_no`, metadata JSONB y checks/índices de busy en `db/changelogs/messages/001-create-model-responses.sql` (depende de T008; FR-007, FR-014, FR-041, FR-044, FR-047, FR-051)
- [ ] T010 [DB] Incluir los dos módulos en `db/changelogs/conversations/db.changelog-conversations.xml`, `db/changelogs/messages/db.changelog-messages.xml` y `db/changelogs/db.changelog-master.xml` (depende de T008, T009; FR-014)
- [ ] T011 [TEST] Validar tres tablas, constraints, índices parciales, cascades y ausencia de tablas extra en `db/tests/validate-model-fuse-schema.sql` (depende de T010; FR-014, FR-045–FR-047, FR-051)

### Backend foundation

- [ ] T012 [P] [BE] Implementar configuración Zod de providers, timeouts, ventana, ratio default 0.8, cuatro límites de contexto y sidebar en `apps/backend/src/infrastructure/config/env.ts` (FR-020, FR-043, FR-044)
- [ ] T013 [P] [TEST] Probar defaults, rangos y fallos seguros de configuración en `apps/backend/src/infrastructure/config/__tests__/env.test.ts` (depende de T012; FR-020, FR-044)
- [ ] T014 [P] [BE] Definir tipos REST de conversación, turno, slot, `hasWorkInProgress`, `contextWindow`, cursores y errores 409 en `apps/backend/src/types/conversations.ts` (FR-007, FR-024, FR-045–FR-052)
- [ ] T015 [P] [BE] Definir schemas Zod para UUID `clientRequestId`, prompt, rename, IDs, slots y cursores en `apps/backend/src/middleware/validation/conversationSchemas.ts` (FR-002, FR-027, FR-046)
- [ ] T016 [BE] Implementar middleware de validación y error saneado en `apps/backend/src/middleware/validation/validateRequest.ts` y `apps/backend/src/types/apiError.ts` (depende de T015; FR-021, FR-022)
- [ ] T017 [P] [BE] Definir `LlmProvider`, capacidades de contexto, resultados, métricas opcionales y `invalid_prompt_size` en `apps/backend/src/types/llm.ts` y `apps/backend/src/services/llm/llmErrors.ts` (FR-022, FR-036, FR-044, FR-047)
- [ ] T018 [BE] Crear helper transaccional PostgreSQL en `apps/backend/src/infrastructure/postgres/transaction.ts` (depende de T010; FR-014, FR-045, FR-046, FR-050)
- [ ] T019 [BE] Crear mapper PostgreSQL→REST sin secretos, estimaciones ni contexto compuesto en `apps/backend/src/infrastructure/postgres/mappers/conversationMapper.ts` (depende de T014; FR-021, FR-044)
- [ ] T020 [P] [BE] Implementar encode/decode validado de cursores opacos en `apps/backend/src/utils/cursor.ts` (FR-030–FR-035, FR-043)
- [ ] T021 [P] [BE] Implementar cálculo puro de estado de turno desde cuatro slots en `apps/backend/src/services/conversations/turnState.ts` (FR-007, FR-012, FR-045, FR-049)
- [ ] T022 [BE] Crear `apiRouter` y `createApp()` testeable en `apps/backend/src/routes/apiRouter.ts` y `apps/backend/src/app.ts` (depende de T016; FR-001, FR-014)
- [ ] T023 [BE] Crear `startServer()`/shutdown y limitar `index.ts` a start/stop en `apps/backend/src/server.ts` y `apps/backend/src/index.ts` (depende de T012, T022; FR-037, FR-038)
- [ ] T024 [P] [TEST] Crear cuatro providers fake deterministas y fixtures base en `apps/backend/src/test/fakes/fakeLlmProvider.ts` y `apps/backend/src/test/fixtures/conversationFixtures.ts` (depende de T017; SC-001, SC-002, SC-005, SC-010)

### Frontend foundation

- [ ] T025 [P] [FE] Definir tipos y schemas REST de conversación, turnos, slots, busy y contexto en `apps/frontend/src/features/conversations/types/conversation.ts` y `apps/frontend/src/features/conversations/schemas/conversationSchemas.ts` (FR-007, FR-024, FR-045–FR-052)
- [ ] T026 [P] [FE] Crear cliente Axios cancelable y query keys por conversación/turno en `apps/frontend/src/features/conversations/api/client.ts` y `apps/frontend/src/features/conversations/queries/conversation-keys.ts` (FR-023, FR-052)
- [ ] T027 [P] [FE] Implementar configuración validada con defaults 750/60000 para polling y umbral de colapso en `apps/frontend/src/config/env.ts` (FR-039, FR-052)
- [ ] T028 [P] [TEST] Probar override por entorno y defaults de polling sin cambio de código en `apps/frontend/src/config/__tests__/env.test.ts` (depende de T027; FR-052)

**Checkpoint**: Liquibase valida y existen contratos/configuración compartidos; no
hay tablas de locks, idempotencia, tokens, métricas, ranking ni retries.

---

## Phase 3: User Story 1 — Comparar y consolidar respuestas (P1) 🎯 MVP

**Goal**: crear idempotentemente la primera conversación, ejecutar tres bases,
consolidar con Qwen y recuperar manualmente slots fallidos.

**Independent Test**: un prompt produce cuatro tabs; un fallo base muestra
inmediatamente Retry/Continue-without, un replay no duplica recursos/providers y
Continue-without queda irreversible.

### Tests for User Story 1

- [ ] T029 [P] [US1] [TEST] Probar bases paralelas, persistencia independiente y consolidación con respuestas disponibles en `apps/backend/src/services/conversations/__tests__/TurnOrchestrator.test.ts` (FR-003–FR-010, SC-006)
- [ ] T030 [P] [US1] [TEST] Probar primera falla recuperable, un único intento y ausencia de backoff automático en `apps/backend/src/services/conversations/__tests__/slotFailurePolicy.test.ts` (FR-022, FR-040, FR-047, FR-048)
- [ ] T031 [P] [US1] [TEST] Probar mapping, cancelación, error seguro, capacidad de contexto y un request de OpenAI en `apps/backend/src/infrastructure/llm/providers/__tests__/OpenAiProvider.test.ts` (FR-020–FR-022, FR-036, FR-044, FR-047)
- [ ] T032 [P] [US1] [TEST] Probar mapping, cancelación, error seguro, capacidad de contexto y un request de Google en `apps/backend/src/infrastructure/llm/providers/__tests__/GoogleProvider.test.ts` (FR-020–FR-022, FR-036, FR-044, FR-047)
- [ ] T033 [P] [US1] [TEST] Probar mapping, cancelación, error seguro, capacidad de contexto y un request de MiniMax en `apps/backend/src/infrastructure/llm/providers/__tests__/MiniMaxProvider.test.ts` (FR-020–FR-022, FR-036, FR-044, FR-047)
- [ ] T034 [P] [US1] [TEST] Probar mapping, cancelación, error seguro, capacidad de contexto y un request de Qwen en `apps/backend/src/infrastructure/llm/providers/__tests__/QwenProvider.test.ts` (FR-008–FR-011, FR-036, FR-044, FR-047)
- [ ] T035 [P] [US1] [TEST] Probar `202`, replay concurrente antes de busy, conflicto ID/prompt y título determinista en `apps/backend/src/routes/conversations/__tests__/conversationCreation.integration.test.ts` (FR-042, FR-045, FR-046, SC-010)
- [ ] T036 [P] [US1] [TEST] Probar retry CAS, `CONVERSATION_BUSY`, `RESPONSE_RETRY_IN_PROGRESS`, `RESPONSE_NOT_RETRYABLE`, `attempt_no` y resultado tardío en `apps/backend/src/routes/conversations/__tests__/responseRetry.integration.test.ts` (FR-041, FR-045, FR-047)
- [ ] T037 [P] [US1] [TEST] Probar persistencia irreversible de Continue-without, exclusión de retry y omisión Qwen en `apps/backend/src/services/conversations/__tests__/continueWithout.test.ts` (FR-040, FR-048, FR-051)
- [ ] T038 [P] [US1] [TEST] Probar cuatro tabs, labels no cromáticos y estados aislados en `apps/frontend/src/features/conversations/__tests__/ResponseTabs.test.tsx` (FR-005–FR-007, FR-024, SC-007)
- [ ] T039 [P] [US1] [TEST] Probar Enviar/Retry disabled, indicador busy, primera falla y Continue-without disponible en `apps/frontend/src/features/conversations/__tests__/BusyConversationControls.test.tsx` (FR-045, FR-048, FR-049, SC-006)
- [ ] T040 [P] [US1] [TEST] Probar cadencia configurable, cancelación, parada por busy false y parada por timeout en `apps/frontend/src/features/conversations/__tests__/conversation-polling.test.tsx` (FR-052, SC-001)
- [ ] T041 [P] [US1] [TEST] Escribir E2E de prompt inicial, cuatro respuestas, labels y fallo parcial en `apps/frontend/e2e/conversation-comparison.spec.ts` (FR-001–FR-011, SC-006, SC-007)
- [ ] T042 [P] [US1] [TEST] Escribir E2E de retry manual, códigos 409, reconsolidación y Continue-without permanente en `apps/frontend/e2e/conversation-recovery-actions.spec.ts` (FR-040, FR-041, FR-047–FR-051, SC-006)

### Backend implementation

- [ ] T043 [P] [US1] [BE] Implementar create/replay atómico, título determinista, primer turno y cuatro slots en `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts` (FR-012, FR-014, FR-042, FR-046)
- [ ] T044 [P] [US1] [BE] Implementar transiciones CAS, `attempt_no`, recálculo y busy derivado desde turnos/slots en `apps/backend/src/infrastructure/postgres/repositories/turnRepository.ts` (FR-007, FR-014, FR-045, FR-047)
- [ ] T045 [P] [US1] [BE] Implementar `OpenAiProvider` con protocolo, límite configurado y estimador contractual en `apps/backend/src/infrastructure/llm/providers/OpenAiProvider.ts` (FR-003, FR-020–FR-022, FR-036, FR-044)
- [ ] T046 [P] [US1] [BE] Implementar `GoogleProvider` con protocolo, límite configurado y estimador contractual en `apps/backend/src/infrastructure/llm/providers/GoogleProvider.ts` (FR-003, FR-020–FR-022, FR-036, FR-044)
- [ ] T047 [P] [US1] [BE] Implementar `MiniMaxProvider` con protocolo, límite configurado y estimador contractual en `apps/backend/src/infrastructure/llm/providers/MiniMaxProvider.ts` (FR-003, FR-020–FR-022, FR-036, FR-044)
- [ ] T048 [P] [US1] [BE] Implementar `QwenProvider` con protocolo, límite configurado y estimador contractual en `apps/backend/src/infrastructure/llm/providers/QwenProvider.ts` (FR-008–FR-011, FR-020–FR-022, FR-036, FR-044)
- [ ] T049 [US1] [BE] Construir el registro literal de cuatro adapters en `apps/backend/src/infrastructure/llm/providerRegistry.ts` (depende de T045–T048; FR-003, FR-008, FR-036)
- [ ] T050 [US1] [BE] Implementar tres bases con `Promise.allSettled`, persistencia por intento y consolidación Qwen en `apps/backend/src/services/conversations/TurnOrchestrator.ts` (depende de T044, T049; FR-003, FR-004, FR-008–FR-010, FR-023)
- [ ] T051 [US1] [BE] Añadir retry manual, códigos de exclusión, stale y reconsolidación a `apps/backend/src/services/conversations/TurnOrchestrator.ts` (depende de T050; FR-011, FR-041, FR-047)
- [ ] T052 [US1] [BE] Añadir Continue-without irreversible y omisión permanente Qwen a `apps/backend/src/services/conversations/TurnOrchestrator.ts` (depende de T051; FR-040, FR-048, FR-051)
- [ ] T053 [US1] [BE] Implementar create/replay, proyección busy, get turn y acciones de slot en `apps/backend/src/services/conversations/ConversationService.ts` (depende de T043, T044, T052; FR-014, FR-045–FR-049, FR-051, FR-052)
- [ ] T054 [US1] [BE] Implementar recovery de `pending`/`running` antes de HTTP sin relanzar providers en `apps/backend/src/services/conversations/recoverInterruptedTurns.ts` y `apps/backend/src/server.ts` (depende de T044, T053; FR-037, FR-038)
- [ ] T055 [US1] [BE] Exponer create, get turn, retry y Continue-without en `apps/backend/src/controllers/conversations/conversationController.ts` y `apps/backend/src/routes/conversations/conversationRoutes.ts` (depende de T053, T054; FR-001, FR-040, FR-046–FR-052)

### Frontend implementation

- [ ] T056 [P] [US1] [FE] Implementar API validada de create, get turn, retry y Continue-without en `apps/frontend/src/features/conversations/api/conversationsApi.ts` (FR-001, FR-040, FR-046–FR-052)
- [ ] T057 [P] [US1] [FE] Implementar cálculo de ciclo de polling desde intervalo/timeout configurados en `apps/frontend/src/features/conversations/queries/polling-policy.ts` (depende de T027; FR-052)
- [ ] T058 [US1] [FE] Implementar create/poll/retry/Continue-without con UUID estable e invalidación dirigida en `apps/frontend/src/features/conversations/hooks/useConversationExecution.ts` (depende de T056, T057; FR-023, FR-046–FR-052)
- [ ] T059 [P] [US1] [FE] Crear layout accesible de sidebar/workspace en `apps/frontend/src/components/layout/AppShell.tsx` (FR-005, FR-015, FR-024)
- [ ] T060 [P] [US1] [FE] Crear aviso textual de procesamiento en `apps/frontend/src/features/conversations/components/ConversationProcessingNotice.tsx` (FR-045, FR-049)
- [ ] T061 [P] [US1] [FE] Crear cuatro tabs con labels persistentes en `apps/frontend/src/features/conversations/components/ResponseTabs.tsx` (FR-005–FR-007, FR-024, SC-007)
- [ ] T062 [P] [US1] [FE] Crear panel de respuesta con error seguro, Retry, ausencia y stale en `apps/frontend/src/features/conversations/components/ResponsePanel.tsx` (FR-007, FR-010, FR-011, FR-041, FR-047–FR-051)
- [ ] T063 [P] [US1] [FE] Crear confirmación accesible con copy permanente en `apps/frontend/src/features/conversations/components/ContinueWithoutDialog.tsx` (FR-048, FR-051)
- [ ] T064 [P] [US1] [FE] Crear composer con trim, UUID por submit y disabled por mutación/busy en `apps/frontend/src/features/conversations/components/PromptComposer.tsx` (FR-001, FR-002, FR-045, FR-046, FR-049)
- [ ] T065 [P] [US1] [FE] Crear `TurnCard` que mantiene cuatro respuestas asociadas al prompt en `apps/frontend/src/features/conversations/components/TurnCard.tsx` (FR-006, FR-007, FR-012)
- [ ] T066 [US1] [FE] Componer un turno, busy y acciones en `apps/frontend/src/features/conversations/components/ConversationWorkspace.tsx` (depende de T058, T060–T065; FR-001–FR-012, FR-045, FR-048, FR-049, FR-051)
- [ ] T067 [US1] [SHARED] Integrar AppShell, workspace y queries en `apps/frontend/src/App.tsx` (owner: frontend-builder; depende de T059, T066; FR-001, FR-005, FR-015)

**Checkpoint**: US1 entrega el MVP sin retry automático, duplicación idempotente
ni reversión de Continue-without.

---

## Phase 4: User Story 2 — Continuar una conversación (P2)

**Goal**: crear turnos posteriores con busy/idempotencia y contexto aislado
protegido por límite técnico.

**Independent Test**: un segundo prompt usa historiales propios; replay precede a
busy; los tres casos de contexto (cabe, compacta, falla seguro) son observables.

### Tests for User Story 2

- [ ] T068 [P] [US2] [TEST] Probar estimación conservadora cuando el contexto cabe sin compactar en `apps/backend/src/services/conversations/__tests__/contextSizeEstimator.test.ts` (FR-044)
- [ ] T069 [P] [US2] [TEST] Probar descarte de turnos antiguos y truncamiento auxiliar con contexto final válido en `apps/backend/src/services/conversations/__tests__/contextCompaction.test.ts` (FR-013, FR-044)
- [ ] T070 [P] [US2] [TEST] Probar payload mínimo inválido, cero llamadas al adapter y error seguro `INVALID_PROMPT_SIZE` en `apps/backend/src/services/conversations/__tests__/contextOverflow.test.ts` (FR-022, FR-044)
- [ ] T071 [P] [US2] [TEST] Probar aislamiento base/Qwen y metadata `contextWindow` sin contenido, estimaciones ni límites en `apps/backend/src/services/conversations/__tests__/ContextBuilder.test.ts` (FR-008, FR-013, FR-021, FR-044)
- [ ] T072 [P] [US2] [TEST] Probar replay→busy→create, conflicto ID/prompt y liberación terminal en `apps/backend/src/routes/conversations/__tests__/conversationContinuation.integration.test.ts` (FR-012, FR-045, FR-046)
- [ ] T073 [P] [US2] [TEST] Probar retry de turno antiguo, fallo sin Qwen, éxito con stale/reconsolidación y ausencia Continue-without en `apps/backend/src/services/conversations/__tests__/retryReconsolidation.integration.test.ts` (FR-041, FR-045, FR-047, FR-051)
- [ ] T074 [P] [US2] [TEST] Probar createTurn, UUID estable, busy y cache por conversación en `apps/frontend/src/features/conversations/__tests__/conversation-continuation-queries.test.tsx` (FR-017, FR-023, FR-045, FR-046)
- [ ] T075 [P] [US2] [TEST] Probar aviso de truncamiento/protección sin revelar contexto en `apps/frontend/src/features/conversations/__tests__/ContextWindowNotice.test.tsx` (FR-021, FR-044)
- [ ] T076 [P] [US2] [TEST] Escribir E2E multiturno de aislamiento, busy por conversación, protección y error de tamaño aislado en `apps/frontend/e2e/conversation-continuation.spec.ts` (FR-008, FR-012, FR-013, FR-017, FR-022, FR-044–FR-046)

### Backend implementation

- [ ] T077 [P] [US2] [BE] Implementar consultas aisladas de historial base y Qwen en `apps/backend/src/infrastructure/postgres/repositories/contextRepository.ts` (FR-008, FR-013, FR-044)
- [ ] T078 [P] [US2] [BE] Implementar estimador UTF-8 conservador y umbral por deployment en `apps/backend/src/utils/contextSizeEstimator.ts` (FR-044)
- [ ] T079 [US2] [BE] Implementar ventana configurable por turnos y composición base/Qwen en `apps/backend/src/services/conversations/ContextBuilder.ts` (depende de T077, T078; FR-008, FR-013, FR-044)
- [ ] T080 [US2] [BE] Añadir descarte de turnos antiguos y truncamiento auxiliar reestimado a `apps/backend/src/services/conversations/ContextBuilder.ts` (depende de T079; FR-044)
- [ ] T081 [US2] [BE] Añadir fallback `INVALID_PROMPT_SIZE` y evidencia segura `protectionApplied` a `apps/backend/src/services/conversations/ContextBuilder.ts` (depende de T080; FR-021, FR-022, FR-044)
- [ ] T082 [US2] [BE] Integrar ContextBuilder antes de cada adapter y omitir Continue-without en Qwen en `apps/backend/src/services/conversations/TurnOrchestrator.ts` (depende de T081; FR-008, FR-013, FR-044, FR-051)
- [ ] T083 [US2] [BE] Implementar lock breve, replay, conflicto, busy y ordinal del turno posterior en `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts` (depende de T043, T044; FR-012, FR-045, FR-046)
- [ ] T084 [US2] [BE] Exponer `POST /conversations/:id/turns` en service/controller/router en `apps/backend/src/services/conversations/ConversationService.ts`, `apps/backend/src/controllers/conversations/conversationController.ts` y `apps/backend/src/routes/conversations/conversationRoutes.ts` (depende de T082, T083; FR-012, FR-017, FR-045, FR-046)

### Frontend implementation

- [ ] T085 [P] [US2] [FE] Añadir createTurn idempotente a `apps/frontend/src/features/conversations/api/conversationsApi.ts` y `apps/frontend/src/features/conversations/hooks/useConversationExecution.ts` (FR-017, FR-045, FR-046)
- [ ] T086 [P] [US2] [FE] Crear aviso accesible de ventana/protección desde metadata en `apps/frontend/src/features/conversations/components/ContextWindowNotice.tsx` (FR-021, FR-044)
- [ ] T087 [P] [US2] [FE] Renderizar múltiples turnos cronológicos en `apps/frontend/src/features/conversations/components/TurnList.tsx` (FR-012, FR-017)
- [ ] T088 [US2] [FE] Mantener busy, polling y cache por conversación al navegar en `apps/frontend/src/components/layout/AppShell.tsx` y `apps/frontend/src/features/conversations/queries/conversation-keys.ts` (depende de T085; FR-023, FR-045, FR-049, FR-052)
- [ ] T089 [US2] [FE] Integrar follow-ups, TurnList y ContextWindowNotice en `apps/frontend/src/features/conversations/components/ConversationWorkspace.tsx` (depende de T085–T088; FR-012, FR-013, FR-017, FR-044)

**Checkpoint**: US1+US2 pasan con aislamiento estricto, protección técnica y sin
presupuesto de producto ni bloqueo global.

---

## Phase 5: User Story 3 — Recuperar y gestionar conversaciones (P3)

**Goal**: sidebar/historial infinitos, rename, Delete bloqueado durante busy y
colapso histórico local.

**Independent Test**: siete turnos cargan 3/3/1 sin salto; Delete falla con 409
durante busy, Rename sigue disponible y después Delete elimina en cascade.

### Tests for User Story 3

- [ ] T090 [P] [US3] [TEST] Probar encode/decode y rechazo de cursores en `apps/backend/src/utils/__tests__/cursor.test.ts` (FR-030–FR-035, FR-043)
- [ ] T091 [P] [US3] [TEST] Probar sidebar estable y bloques históricos 3/3/1 con turnos completos en `apps/backend/src/infrastructure/postgres/repositories/__tests__/conversationHistoryRepository.integration.test.ts` (FR-015–FR-017, FR-030–FR-035, FR-043, SC-009, SC-011)
- [ ] T092 [P] [US3] [TEST] Probar list/detail/history/rename y validación de cursor/título en `apps/backend/src/routes/conversations/__tests__/conversationHistory.integration.test.ts` (FR-015–FR-017, FR-025–FR-027, FR-030–FR-035, FR-043)
- [ ] T093 [P] [US3] [TEST] Probar Delete busy sin cambios, Rename durante busy y Delete cascade terminal en `apps/backend/src/routes/conversations/__tests__/conversationDelete.integration.test.ts` (FR-025–FR-029, FR-045, FR-050, SC-008)
- [ ] T094 [P] [US3] [TEST] Probar `useInfiniteQuery` de sidebar/historial y flatten cronológico en `apps/frontend/src/features/conversations/__tests__/conversation-history-queries.test.tsx` (FR-015, FR-017, FR-030–FR-035, FR-043)
- [ ] T095 [P] [US3] [TEST] Probar sentinel superior y compensación de posición al anteponer en `apps/frontend/src/features/conversations/__tests__/HistoryTopSentinel.test.tsx` (FR-032, FR-034, SC-009)
- [ ] T096 [P] [US3] [TEST] Probar sentinel inferior y autofill del sidebar en `apps/frontend/src/features/conversations/__tests__/ConversationSidebar.test.tsx` (FR-015, FR-043, SC-011)
- [ ] T097 [P] [US3] [TEST] Probar teclado, foco, contador, trim y cancelación de Rename en `apps/frontend/src/features/conversations/__tests__/RenameConversationDialog.test.tsx` (FR-026, FR-027, SC-008)
- [ ] T098 [P] [US3] [TEST] Probar Delete disabled con copy durante busy, confirmación terminal y Rename habilitado en `apps/frontend/src/features/conversations/__tests__/DeleteConversationDialog.test.tsx` (FR-025, FR-028, FR-029, FR-050, SC-008)
- [ ] T099 [P] [US3] [TEST] Probar colapso histórico local sin request ni escritura en `apps/frontend/src/features/conversations/__tests__/CollapsibleHistoryMessage.test.tsx` (FR-039, SC-012)
- [ ] T100 [P] [US3] [TEST] Escribir E2E de reapertura, tres turnos iniciales y scroll ascendente en `apps/frontend/e2e/conversation-history.spec.ts` (FR-030–FR-035, SC-009)
- [ ] T101 [P] [US3] [TEST] Escribir E2E de sidebar, Rename persistente, Delete confirmado y draft tras borrar activa en `apps/frontend/e2e/conversation-management.spec.ts` (FR-015–FR-018, FR-025–FR-029, SC-008, SC-011)
- [ ] T102 [P] [US3] [TEST] Escribir E2E de Delete bloqueado, copy contextual y Rename disponible durante busy en `apps/frontend/e2e/conversation-delete-busy.spec.ts` (FR-045, FR-050)

### Backend implementation

- [ ] T103 [US3] [BE] Implementar página sidebar `(updated_at,id)`, tamaño configurado y busy en `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts` (FR-015, FR-016, FR-043)
- [ ] T104 [US3] [BE] Implementar bloque reciente y anteriores de hasta tres turnos completos en `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts` (depende de T103; FR-017, FR-030–FR-035)
- [ ] T105 [US3] [BE] Implementar detail y Rename trim 1–80 permitido durante busy en `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts` y `apps/backend/src/services/conversations/ConversationService.ts` (depende de T104; FR-016, FR-026, FR-027, FR-050)
- [ ] T106 [US3] [BE] Implementar Delete transaccional con chequeo busy y cascade terminal en `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts` y `apps/backend/src/services/conversations/ConversationService.ts` (depende de T105; FR-028, FR-029, FR-050)
- [ ] T107 [US3] [BE] Exponer list/detail/history/Rename/Delete en `apps/backend/src/controllers/conversations/conversationController.ts` y `apps/backend/src/routes/conversations/conversationRoutes.ts` (depende de T103–T106; FR-015–FR-017, FR-025–FR-035, FR-043, FR-050)

### Frontend implementation

- [ ] T108 [P] [US3] [FE] Implementar API de list/detail/history/Rename/Delete con `AbortSignal` en `apps/frontend/src/features/conversations/api/conversationsApi.ts` (FR-015–FR-017, FR-025–FR-035, FR-043, FR-050)
- [ ] T109 [US3] [FE] Implementar queries infinitas de sidebar e historial en `apps/frontend/src/features/conversations/hooks/useConversationQueries.ts` (depende de T108; FR-015, FR-017, FR-030–FR-035, FR-043)
- [ ] T110 [P] [US3] [FE] Implementar helpers de cache para flatten, prepend y reemplazo en `apps/frontend/src/features/conversations/queries/conversation-cache.ts` (FR-023, FR-034)
- [ ] T111 [P] [US3] [FE] Crear sidebar con título, fecha, sentinel inferior y autofill en `apps/frontend/src/features/conversations/components/ConversationSidebar.tsx` (depende de T109; FR-015, FR-016, FR-043)
- [ ] T112 [P] [US3] [FE] Crear menú de tres puntos con Rename habilitado y Delete disabled por busy/copy contextual en `apps/frontend/src/features/conversations/components/ConversationMenu.tsx` (FR-025, FR-050)
- [ ] T113 [P] [US3] [FE] Crear dialog accesible de Rename con contador y validación en `apps/frontend/src/features/conversations/components/RenameConversationDialog.tsx` (FR-026, FR-027)
- [ ] T114 [P] [US3] [FE] Crear dialog accesible de confirmación Delete en `apps/frontend/src/features/conversations/components/DeleteConversationDialog.tsx` (FR-028, FR-029, FR-050)
- [ ] T115 [US3] [FE] Implementar mutations de Rename/Delete y manejo dirigido de 409 busy en `apps/frontend/src/features/conversations/hooks/useConversationMutations.ts` (depende de T108, T110, T113, T114; FR-027–FR-029, FR-050)
- [ ] T116 [US3] [FE] Implementar sentinel superior y compensación por `scrollHeight` en `apps/frontend/src/features/conversations/components/HistoryTopSentinel.tsx` y `apps/frontend/src/features/conversations/components/TurnList.tsx` (depende de T095, T109, T110; FR-032, FR-034)
- [ ] T117 [P] [US3] [FE] Implementar “Mostrar más / Mostrar menos” local en `apps/frontend/src/features/conversations/components/CollapsibleHistoryMessage.tsx` (FR-039, SC-012)
- [ ] T118 [US3] [FE] Integrar selección, sidebar, historial, dialogs y colapso en `apps/frontend/src/components/layout/AppShell.tsx` y `apps/frontend/src/features/conversations/components/ConversationWorkspace.tsx` (depende de T111–T117; FR-015–FR-017, FR-025–FR-035, FR-039, FR-043, FR-050)

**Checkpoint**: US3 pasa sin paginación visible, mensajes divididos, Delete durante
busy ni estado de expansión persistido.

---

## Phase 6: User Story 4 — Iniciar un contexto nuevo (P4)

**Goal**: mantener un único draft vacío local sin borrar ni persistir historial.

**Independent Test**: Nueva conversación no inserta datos; el primer prompt crea
el recurso sin contexto anterior y conserva conversaciones previas.

- [ ] T119 [P] [US4] [TEST] Probar draft repetido, ausencia de persistencia y conservación del historial en `apps/frontend/src/features/conversations/__tests__/new-conversation-draft.test.tsx` (FR-018, FR-019)
- [ ] T120 [P] [US4] [TEST] Escribir E2E de contexto nuevo persistido solo tras primer prompt en `apps/frontend/e2e/new-conversation.spec.ts` (FR-018, FR-019)
- [ ] T121 [US4] [FE] Implementar selección/draft local y acción Nueva conversación en `apps/frontend/src/components/layout/AppShell.tsx` y `apps/frontend/src/features/conversations/components/ConversationSidebar.tsx` (FR-018, FR-019)
- [ ] T122 [US4] [FE] Enviar primer prompt del draft por `POST /conversations`, seleccionar ID y preservar lista en `apps/frontend/src/features/conversations/components/ConversationWorkspace.tsx` (depende de T121; FR-018, FR-019, FR-046)

**Checkpoint**: no existe endpoint clear ni conversación vacía persistida.

---

## Phase 7: Acceptance, observability and quality gates

**Purpose**: completar criterios medibles sin tareas genéricas de corrección.

- [ ] T123 [P] [BE] Añadir logs Pino de IDs, busy, replay, slot, duración, protección aplicada y estado seguro en `apps/backend/src/middleware/logger/requestContext.ts` y `apps/backend/src/services/conversations/TurnOrchestrator.ts` (FR-021, FR-022, FR-044–FR-047)
- [ ] T124 [P] [TEST] Probar ausencia de prompts, respuestas, estimaciones, límites, headers y secretos en logs/metadata en `apps/backend/src/services/conversations/__tests__/observabilitySafety.test.ts` (FR-021, FR-044)
- [ ] T125 [P] [TEST] Crear casos versionados de recovery `pending`/`running` en `apps/backend/src/services/conversations/__tests__/fixtures/recoveryCases.ts` (FR-038, SC-002)
- [ ] T126 [TEST] Probar recreación sobre la misma DB y exigir orden, atribución, estados y consulta en 100% del fixture en `apps/backend/src/services/conversations/__tests__/recovery.integration.test.ts` (depende de T125; FR-038, SC-002)
- [ ] T127 [P] [TEST] Crear fixture SC-005 de máximo cinco casos en `apps/backend/src/services/conversations/__tests__/fixtures/consolidation-evaluation.json` (FR-009, SC-005)
- [ ] T128 [TEST] Implementar runner SC-005 de un intento Qwen y umbral 90% en `apps/backend/src/acceptance/consolidationEvaluation.ts` y `apps/backend/package.json` (depende de T127; FR-009, SC-005)
- [ ] T129 [P] [TEST] Implementar SC-010 con providers fake y umbral de latencia 95% en `apps/backend/src/acceptance/latency.acceptance.test.ts` (FR-046, SC-010)
- [ ] T130 [P] [TEST] Implementar SC-001 de estados terminales dentro de 60 segundos en `apps/backend/src/acceptance/terminalStates.acceptance.test.ts` (FR-052, SC-001)
- [ ] T131 [P] [UX] Diseñar protocolo SC-003 con guion, escenarios de busy/retry/Continue-without/contexto/Delete/polling y métricas subjetivas en `specs/001-compare-llm-responses/usability/sc-003-protocol.md` (owner: Product/UX; SC-003)
- [ ] T132 [UX] Ejecutar al menos una sesión con participantes y documentar observaciones, resultados y síntesis en `specs/001-compare-llm-responses/usability/sc-004-results.md` (owner: Product/UX; depende de T131; SC-004)
- [ ] T133 [DB] Ejecutar migración desde cero mediante `docker-compose.yml` y `db/changelogs/db.changelog-master.xml`; registrar cualquier fallo como tarea DB nueva (FR-014)
- [ ] T134 [DB] Ejecutar Liquibase validate mediante `docker-compose.yml` y `db/changelogs/db.changelog-master.xml`; registrar cualquier fallo como tarea DB nueva (depende de T133; FR-014)
- [ ] T135 [DB] Ejecutar rollback de validación mediante `docker-compose.yml` y `db/changelogs/db.changelog-master.xml`; registrar cualquier fallo como tarea DB nueva (depende de T134; FR-014)
- [ ] T136 [TEST] Ejecutar Vitest backend desde `apps/backend/package.json`; registrar cada fallo como tarea concreta del test/componente afectado (FR-001–FR-052, SC-001, SC-002, SC-005, SC-006, SC-010)
- [ ] T137 [TEST] Ejecutar Vitest frontend desde `apps/frontend/package.json`; registrar cada fallo como tarea concreta del test/componente afectado (FR-005–FR-007, FR-015–FR-019, FR-024–FR-035, FR-039, FR-045, FR-048–FR-052, SC-006–SC-012)
- [ ] T138 [TEST] Ejecutar Playwright con providers fake desde `apps/frontend/playwright.config.ts`; registrar cada fallo como tarea E2E concreta (FR-001–FR-052, SC-006–SC-012)
- [ ] T139 [SHARED] Ejecutar `pnpm typecheck` desde `package.json`; registrar cada fallo por workspace y archivo (owner: integration-owner; FR-001–FR-052)
- [ ] T140 [SHARED] Ejecutar `pnpm lint` desde `package.json`; registrar cada fallo por workspace y archivo (owner: integration-owner; depende de T139; FR-001–FR-052)
- [ ] T141 [SHARED] Ejecutar `pnpm build` desde `package.json`; registrar cada fallo por workspace y archivo (owner: integration-owner; depende de T140; FR-001–FR-052)
- [ ] T142 [DOC] Ejecutar los smoke flows documentados en `specs/001-compare-llm-responses/quickstart.md` y registrar cada discrepancia como tarea concreta (depende de T133–T141; FR-001–FR-052, SC-001–SC-012)

---

## Dependencies and execution order

### Phase dependencies

- Phase 1 no tiene dependencias.
- Phase 2 depende de Phase 1 y bloquea todas las historias.
- US1 depende de Phase 2 y constituye el MVP.
- US2 amplía la orquestación, repositorios y workspace de US1.
- US3 puede iniciar sus tests/componentes aislados después de Phase 2; su
  integración T118 depende del workspace multiturno de US2.
- US4 depende de la selección/sidebar integrada de US3.
- Phase 7 depende de las historias incluidas en la entrega.

### Graph

```text
Setup → Foundational → US1 (MVP) → US2
                         └────────→ US3 → US4
US1 + US2 + US3 + US4 → Acceptance
```

### Critical chains

- DB: `T008 → T009 → T010 → T011`.
- Backend foundation: `T012/T015 → T016 → T022 → T023`.
- Providers: `T045–T048 → T049 → T050 → T051 → T052`.
- Initial API: `T043/T044/T052 → T053 → T054 → T055`.
- Initial UI: `T056/T057 → T058`; `T060–T065 → T066 → T067`.
- Context: `T077/T078 → T079 → T080 → T081 → T082 → T084`.
- Turn continuation: `T043/T044 → T083 → T084 → T085 → T089`.
- History backend: `T103 → T104 → T105 → T106 → T107`.
- History frontend: `T108 → T109`; `T110/T113/T114 → T115`; `T111–T117 → T118`.
- New context: `T121 → T122`.
- Acceptance: `T125 → T126`, `T127 → T128`, `T131 → T132`,
  `T133 → T134 → T135`, `T139 → T140 → T141 → T142`.

## Parallel opportunities

- Setup: T003–T007 después de T001/T002 según corresponda.
- Foundational: DB, contratos backend, fakes y contratos frontend avanzan en lanes
  distintos.
- US1: cuatro tests/adapters de provider y componentes frontend separados.
- US2: context repository y estimador avanzan en paralelo; tests de los tres
  outcomes son independientes.
- US3: tests backend/frontend, sidebar, menú, dialogs y colapso usan archivos
  separados antes de integración.
- Final: observabilidad, recovery fixture, consolidación, latencia, terminales y
  protocolo UX usan archivos distintos.

## Parallel examples

### US1

```text
Provider tests: T031 + T032 + T033 + T034
Providers:      T045 + T046 + T047 + T048
UI:             T060 + T061 + T062 + T063 + T064 + T065
```

### US2

```text
Tests: T068 + T069 + T070 + T071 + T072 + T073 + T074 + T075 + T076
BE:    T077 + T078, luego T079 → T080 → T081 → T082
FE:    T085 + T086 + T087, luego T088/T089
```

### US3

```text
Tests backend:  T090 + T091 + T092 + T093
Tests frontend: T094 + T095 + T096 + T097 + T098 + T099
FE components:  T111 + T112 + T113 + T114 + T117
```

## Domain ownership

| Domain | Primary owner | Scope |
|---|---|---|
| FE | `frontend-builder` | `apps/frontend` product composition and state |
| UI | `frontend-builder` | `packages/ui` primitives only |
| BE | `backend-builder` | `apps/backend` API, orchestration and integrations |
| DB | `backend-builder` | Liquibase and schema validation |
| TEST | `unit-test-runner` or owning builder | exact test/acceptance file |
| UX | Product/UX | participant protocol and evidence |
| DOC | integration owner | env samples and quickstart |
| SHARED | named integration owner | root checks/integration only |

Auditors remain read-only. No task concede una corrección indeterminada a un
auditor o a una validación amplia.

## Independent test criteria

- **US1**: cuatro slots, consolidación parcial, primera falla inmediata, retry
  manual, Continue-without permanente e idempotencia inicial.
- **US2**: un turno activo por conversación, replay seguro, aislamiento y tres
  outcomes de protección contextual.
- **US3**: ventana inicial de tres turnos, cursores, posición estable, sidebar,
  Rename, Delete busy/cascade y colapso local.
- **US4**: draft vacío local y persistencia solo con primer prompt válido.

## Implementation strategy

### MVP first

1. Completar T001–T028.
2. Escribir T029–T042 y confirmar que fallan.
3. Implementar T043–T067.
4. Validar US1 independientemente.

### Incremental delivery

1. US1: comparar, consolidar y recuperar un turno.
2. US2: continuar con busy, idempotencia y protección de contexto.
3. US3: recuperar y gestionar historial, incluido Delete busy.
4. US4: iniciar contexto vacío local.
5. Phase 7: aceptación automatizada y Product/UX.

## Notes

- TanStack Query posee server state; draft, selección, tabs, dialogs y expansión
  son estado local.
- PostgreSQL constraints/transacciones implementan idempotencia, busy y exclusión
  de retry; no se crean tablas auxiliares.
- Cada adapter realiza una llamada por ejecución aceptada; no hay retry automático.
- La estimación de contexto es efímera y técnica; no se persiste ni crea
  presupuesto de tokens.
- No se implementan ranking, métricas persistentes, dashboards, streaming, colas,
  nuevas políticas de concurrencia ni recovery adicional.
- Una tarea de validación que falle genera otra tarea concreta; nunca corrige
  “todo lo encontrado” dentro de un directorio o glob.

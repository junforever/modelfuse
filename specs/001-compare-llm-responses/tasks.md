# Tasks: Comparación y consolidación de respuestas LLM

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`,
`contracts/rest-api.md`, `contracts/llm-provider.md`, `quickstart.md`
**Tests**: obligatorios para comportamiento no trivial y contratos persistentes.
**Organization**: tareas agrupadas por historia y ordenadas por dependencia.

`[P]` indica archivos independientes que pueden trabajarse en paralelo. Las
etiquetas `[US1]`–`[US4]` corresponden a las historias del spec.

## Phase 1: Setup

**Purpose**: añadir solo dependencias, providers y runners necesarios.

- [ ] T001 Añadir `@tanstack/react-query`, `@playwright/test`, scripts frontend y lockfile en `apps/frontend/package.json` y `pnpm-lock.yaml`
- [ ] T002 Añadir con el comando Shadcn del workspace `tabs`, `dialog`, `dropdown-menu`, `scroll-area`, `skeleton` y `alert` en `packages/ui/src/components/`
- [ ] T003 [P] Crear `QueryClient` y montar `QueryClientProvider` en `apps/frontend/src/providers/query-provider.tsx` y `apps/frontend/src/main.tsx`
- [ ] T004 [P] Configurar Testing Library y un QueryClient aislado sin retries de mutación en `apps/frontend/src/test/setup.ts`, `apps/frontend/src/test/query-test-utils.tsx` y `apps/frontend/vitest.config.ts`
- [ ] T005 [P] Configurar Playwright con backend/frontend de prueba y Chromium en `apps/frontend/playwright.config.ts`
- [ ] T006 [P] Documentar `VITE_API_BASE_URL` y `VITE_HISTORY_COLLAPSE_CHAR_THRESHOLD` en `apps/frontend/.env.sample`

**Checkpoint**: dependencias y runners disponibles; ningún workspace nuevo.

## Phase 2: Foundational

**Purpose**: esquema, configuración y contratos que bloquean todas las historias.

### Database

- [ ] T007 Crear `conversations` con título, timestamps, constraints, índice del sidebar y rollback en `db/changelogs/conversations/001-create-conversations.sql`
- [ ] T008 Crear `turns` con ordinal único por conversación, prompt, estados, cascade e índice de historial, sin idempotencia ni exclusión de turnos activos, en `db/changelogs/conversations/002-create-turns.sql`
- [ ] T009 Crear `model_responses` con cuatro slots, estados, error recuperable, continue-without, stale, usage, metadata y rollback en `db/changelogs/messages/001-create-model-responses.sql`
- [ ] T010 Crear índices parciales de recovery y lectura de slots en `db/changelogs/messages/002-add-response-indexes.sql`
- [ ] T011 Crear XML de módulos e incluirlos desde el master en `db/changelogs/conversations/db.changelog-conversations.xml`, `db/changelogs/messages/db.changelog-messages.xml` y `db/changelogs/db.changelog-master.xml`
- [ ] T012 Añadir validación SQL de tablas, checks, uniques, índices y cascades en `db/tests/validate-model-fuse-schema.sql`

### Backend contracts and composition

- [ ] T013 [P] Validar credenciales/modelos de cuatro providers, timeout, ventana contextual y página del sidebar con Zod en `apps/backend/src/infrastructure/config/env.ts` y `apps/backend/.env.sample`
- [ ] T014 [P] Definir slots, estados, conversaciones, turnos, respuestas y páginas REST en `apps/backend/src/types/conversations.ts`
- [ ] T015 [P] Definir schemas Zod para prompts, rename, IDs, slots y cursores en `apps/backend/src/middleware/validation/conversationSchemas.ts`
- [ ] T016 Implementar middleware de validación y errores saneados en `apps/backend/src/middleware/validation/validateRequest.ts` y `apps/backend/src/types/apiError.ts`
- [ ] T017 [P] Definir `LlmProvider`, `LlmResult`, usage y errores normalizados sin retry automático en `apps/backend/src/types/llm.ts` y `apps/backend/src/services/llm/llmErrors.ts`
- [ ] T018 Crear helpers de transacción y mappers PostgreSQL→REST en `apps/backend/src/infrastructure/postgres/transaction.ts` y `apps/backend/src/infrastructure/postgres/mappers/conversationMapper.ts`
- [ ] T019 [P] Implementar encode/decode validado de cursores opacos en `apps/backend/src/utils/cursor.ts`
- [ ] T020 Crear `apiRouter` y `createApp()` testeable en `apps/backend/src/routes/apiRouter.ts` y `apps/backend/src/app.ts`
- [ ] T021 Crear `startServer()`/shutdown y limitar `index.ts` a invocarlos en `apps/backend/src/server.ts` y `apps/backend/src/index.ts`
- [ ] T022 [P] Crear providers fake deterministas y fixtures base en `apps/backend/src/test/fakes/fakeLlmProvider.ts` y `apps/backend/src/test/fixtures/conversationFixtures.ts`

### Frontend contracts

- [ ] T023 [P] Definir tipos y schemas Zod de conversación, turno y slot en `apps/frontend/src/features/conversations/types/conversation.ts` y `apps/frontend/src/features/conversations/schemas/conversationSchemas.ts`
- [ ] T024 [P] Crear cliente Axios cancelable y query keys en `apps/frontend/src/features/conversations/api/client.ts` y `apps/frontend/src/features/conversations/queries/conversation-keys.ts`

**Checkpoint**: Liquibase valida; contratos y composición no contienen
`clientRequestId`, `TURN_IN_PROGRESS` ni un protocolo común de provider.

## Phase 3: User Story 1 — Comparar y consolidar (P1)

**Goal**: crear el primer turno, ejecutar tres bases en paralelo, consolidar con
Qwen y mostrar cuatro tabs con fallos/recovery independientes.

**Independent Test**: con providers fake, cada slot alcanza estado terminal, las
respuestas se mantienen separadas y la primera falla recuperable ofrece
inmediatamente retry o continuar sin otro intento automático.

### Tests

- [ ] T025 [P] [US1] Probar ejecución paralela, consolidación con respuestas disponibles y persistencia independiente en `apps/backend/src/services/conversations/__tests__/TurnOrchestrator.test.ts`
- [ ] T026 [P] [US1] Probar que la primera falla recuperable ejecuta un solo intento y habilita retry/continue-without en `apps/backend/src/services/conversations/__tests__/slotFailurePolicy.test.ts`
- [ ] T027 [P] [US1] Probar mapping, normalización, timeout, credencial rechazada y no-auto-retry de OpenAI en `apps/backend/src/infrastructure/llm/providers/__tests__/OpenAiProvider.test.ts`
- [ ] T028 [P] [US1] Probar mapping, normalización, timeout, credencial rechazada y no-auto-retry de Google en `apps/backend/src/infrastructure/llm/providers/__tests__/GoogleProvider.test.ts`
- [ ] T029 [P] [US1] Probar mapping, normalización, timeout, credencial rechazada y no-auto-retry de MiniMax en `apps/backend/src/infrastructure/llm/providers/__tests__/MiniMaxProvider.test.ts`
- [ ] T030 [P] [US1] Probar mapping, normalización, timeout, credencial rechazada y no-auto-retry de Qwen en `apps/backend/src/infrastructure/llm/providers/__tests__/QwenProvider.test.ts`
- [ ] T031 [P] [US1] Probar `POST /conversations`, polling, retry por slot y continue-without con Supertest en `apps/backend/src/routes/conversations/__tests__/conversationExecution.integration.test.ts`
- [ ] T032 [P] [US1] Probar cuatro tabs, etiquetas no cromáticas, estados y acciones inmediatas en `apps/frontend/src/features/conversations/__tests__/ResponseTabs.test.tsx`
- [ ] T033 [P] [US1] Probar create mutation, polling terminal y cache por conversation/turn ID en `apps/frontend/src/features/conversations/__tests__/turn-execution-queries.test.tsx`
- [ ] T034 [P] [US1] Escribir E2E de prompt, comparación, consolidación, fallo parcial, retry y continue-without en `apps/frontend/e2e/conversation-comparison.spec.ts`

### Backend

- [ ] T035 [P] [US1] Implementar creación atómica de conversación, título, primer turno y cuatro slots en `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts`
- [ ] T036 [P] [US1] Implementar lectura y transiciones atómicas por slot en `apps/backend/src/infrastructure/postgres/repositories/turnRepository.ts`
- [ ] T037 [P] [US1] Implementar adapter concreto OpenAI según su deployment configurado en `apps/backend/src/infrastructure/llm/providers/OpenAiProvider.ts`
- [ ] T038 [P] [US1] Implementar adapter concreto Google según su deployment configurado en `apps/backend/src/infrastructure/llm/providers/GoogleProvider.ts`
- [ ] T039 [P] [US1] Implementar adapter concreto MiniMax según su deployment configurado en `apps/backend/src/infrastructure/llm/providers/MiniMaxProvider.ts`
- [ ] T040 [P] [US1] Implementar adapter concreto Qwen según su deployment configurado en `apps/backend/src/infrastructure/llm/providers/QwenProvider.ts`
- [ ] T041 [US1] Construir el mapa literal de cuatro slots en `apps/backend/src/infrastructure/llm/providerRegistry.ts`
- [ ] T042 [US1] Implementar tres bases con `Promise.allSettled`, persistencia inmediata y consolidación Qwen en `apps/backend/src/services/conversations/TurnOrchestrator.ts`
- [ ] T043 [US1] Implementar retry de un solo slot, reconsolidación solo tras éxito base y continue-without persistido en `apps/backend/src/services/conversations/TurnOrchestrator.ts`
- [ ] T044 [US1] Implementar creación inicial, polling y acciones de slot en `apps/backend/src/services/conversations/ConversationService.ts`
- [ ] T045 [US1] Exponer create/poll/retry/continue-without con controllers delgados en `apps/backend/src/controllers/conversations/conversationController.ts` y `apps/backend/src/routes/conversations/conversationRoutes.ts`
- [ ] T046 [US1] Implementar recovery de `pending`/`running`, recálculo de turno y conexión desde `startServer()` en `apps/backend/src/services/conversations/recoverInterruptedTurns.ts` y `apps/backend/src/server.ts`

### Frontend

- [ ] T047 [P] [US1] Implementar API de create, get turn, retry y continue-without en `apps/frontend/src/features/conversations/api/conversationsApi.ts`
- [ ] T048 [US1] Implementar hooks de create/poll/retry/continue-without con TanStack Query en `apps/frontend/src/features/conversations/hooks/useConversationExecution.ts`
- [ ] T049 [P] [US1] Crear `AppShell` accesible con sidebar y workspace en `apps/frontend/src/components/layout/AppShell.tsx`
- [ ] T050 [P] [US1] Crear `ResponseTabs`/`ResponsePanel` con cuatro labels y estados independientes en `apps/frontend/src/features/conversations/components/ResponseTabs.tsx` y `apps/frontend/src/features/conversations/components/ResponsePanel.tsx`
- [ ] T051 [US1] Crear composer, turno y workspace y conectarlos sin duplicar server state en `apps/frontend/src/features/conversations/components/PromptComposer.tsx`, `TurnCard.tsx`, `ConversationWorkspace.tsx` y `apps/frontend/src/App.tsx`

**Checkpoint**: US1 pasa con un turno y demuestra FR-040 sin retry automático.

## Phase 4: User Story 2 — Continuar una conversación (P2)

**Goal**: añadir turnos con contexto aislado por base y contexto propio de Qwen,
aplicando una ventana acotada comunicada al usuario.

**Independent Test**: capturar mensajes de cada fake provider en un segundo turno;
ninguna base ve otra base y Qwen no recibe historiales base.

### Tests

- [ ] T052 [P] [US2] Probar contexto aislado, orden, ventana por turnos y evidencia de truncamiento en `apps/backend/src/services/conversations/__tests__/ContextBuilder.test.ts`
- [ ] T053 [P] [US2] Probar segundo turno y asociación correcta sin idempotencia ni conflicto de turno activo en `apps/backend/src/routes/conversations/__tests__/conversationContinuation.integration.test.ts`
- [ ] T054 [P] [US2] Probar retry base exitoso→Qwen y retry base fallido→sin Qwen en `apps/backend/src/services/conversations/__tests__/retryReconsolidation.test.ts`
- [ ] T055 [P] [US2] Probar createTurn, append y polling por ID en `apps/frontend/src/features/conversations/__tests__/conversation-continuation-queries.test.tsx`
- [ ] T056 [P] [US2] Probar aviso textual cuando `contextWindow.truncated=true` en `apps/frontend/src/features/conversations/__tests__/ContextWindowNotice.test.tsx`
- [ ] T057 [P] [US2] Escribir E2E multi-turno de continuidad, aislamiento y ausencia persistida en `apps/frontend/e2e/conversation-continuation.spec.ts`

### Implementation

- [ ] T058 [US2] Implementar queries de historial por slot base y Qwen en `apps/backend/src/infrastructure/postgres/repositories/contextRepository.ts`
- [ ] T059 [US2] Implementar ventana configurable, aislamiento y evidencia persistible en `apps/backend/src/services/conversations/ContextBuilder.ts`
- [ ] T060 [US2] Integrar ContextBuilder en bases/Qwen sin presupuestos por modelo en `apps/backend/src/services/conversations/TurnOrchestrator.ts`
- [ ] T061 [US2] Implementar asignación transaccional de ordinal y creación de turno posterior sin bloquear turnos activos en `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts`
- [ ] T062 [US2] Exponer `POST /conversations/:id/turns` en `apps/backend/src/services/conversations/ConversationService.ts`, `apps/backend/src/controllers/conversations/conversationController.ts` y `apps/backend/src/routes/conversations/conversationRoutes.ts`
- [ ] T063 [P] [US2] Añadir createTurn a API/hook y actualizar el bloque reciente por ID en `apps/frontend/src/features/conversations/api/conversationsApi.ts` y `apps/frontend/src/features/conversations/hooks/useConversationExecution.ts`
- [ ] T064 [P] [US2] Crear indicador de contexto acotado en `apps/frontend/src/features/conversations/components/ContextWindowNotice.tsx`
- [ ] T065 [US2] Renderizar múltiples turnos y conectar follow-ups en `apps/frontend/src/features/conversations/components/ConversationWorkspace.tsx` y `TurnList.tsx`

**Checkpoint**: US1+US2 pasan sin mezclar historiales ni imponer concurrencia.

## Phase 5: User Story 3 — Recuperar y gestionar conversaciones (P3)

**Goal**: sidebar infinito, reapertura con tres turnos, historial ascendente,
mensajes largos, rename y delete confirmados.

**Independent Test**: reabrir siete turnos, observar 3 iniciales y bloques 3+1,
conservar scroll, renombrar y eliminar solo tras confirmación.

### Tests

- [ ] T066 [P] [US3] Probar cursores opacos válidos/inválidos en `apps/backend/src/utils/__tests__/cursor.test.ts`
- [ ] T067 [P] [US3] Probar sidebar ordenado, bloques 3/3/1, turnos completos y cascade en `apps/backend/src/infrastructure/postgres/repositories/__tests__/conversationHistoryRepository.integration.test.ts`
- [ ] T068 [P] [US3] Probar list/detail/history/rename/delete con Supertest en `apps/backend/src/routes/conversations/__tests__/conversationHistory.integration.test.ts`
- [ ] T069 [P] [US3] Probar `useInfiniteQuery` de sidebar e historial en `apps/frontend/src/features/conversations/__tests__/conversation-history-queries.test.tsx`
- [ ] T070 [P] [US3] Probar sentinel superior y conservación de posición visual en `apps/frontend/src/features/conversations/__tests__/HistoryTopSentinel.test.tsx`
- [ ] T071 [P] [US3] Probar autofill y sentinel inferior del sidebar en `apps/frontend/src/features/conversations/__tests__/ConversationSidebar.test.tsx`
- [ ] T072 [P] [US3] Probar diálogos accesibles, contador, trim, cancelación y confirmación en `apps/frontend/src/features/conversations/__tests__/ConversationMenuDialogs.test.tsx`
- [ ] T073 [P] [US3] Probar colapso histórico sin request ni escritura en `apps/frontend/src/features/conversations/__tests__/CollapsibleHistoryMessage.test.tsx`
- [ ] T074 [P] [US3] Escribir E2E de reapertura, carga de tres turnos y scroll ascendente en `apps/frontend/e2e/conversation-history.spec.ts`
- [ ] T075 [P] [US3] Escribir E2E de sidebar, rename persistente y delete confirmado en `apps/frontend/e2e/conversation-management.spec.ts`

### Backend

- [ ] T076 [US3] Implementar página del sidebar por `(updated_at,id)` en `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts`
- [ ] T077 [US3] Implementar primer bloque y bloques anteriores de hasta tres turnos completos en `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts`
- [ ] T078 [US3] Implementar detail, rename trim 1–80 y delete cascade en `apps/backend/src/services/conversations/ConversationService.ts`
- [ ] T079 [US3] Exponer list/detail/history/rename/delete en `apps/backend/src/controllers/conversations/conversationController.ts` y `apps/backend/src/routes/conversations/conversationRoutes.ts`

### Frontend

- [ ] T080 [P] [US3] Implementar API de list/detail/history/rename/delete en `apps/frontend/src/features/conversations/api/conversationsApi.ts`
- [ ] T081 [US3] Implementar queries infinitas de sidebar e historial con TanStack Query en `apps/frontend/src/features/conversations/hooks/useConversationQueries.ts`
- [ ] T082 [P] [US3] Implementar helpers de cache para flatten/prepend/reemplazo en `apps/frontend/src/features/conversations/queries/conversation-cache.ts`
- [ ] T083 [US3] Crear sidebar, item, menú y sentinel inferior con autofill en `apps/frontend/src/features/conversations/components/ConversationSidebar.tsx`, `ConversationListItem.tsx` y `ConversationMenu.tsx`
- [ ] T084 [P] [US3] Crear diálogos accesibles de rename/delete en `apps/frontend/src/features/conversations/components/RenameConversationDialog.tsx` y `DeleteConversationDialog.tsx`
- [ ] T085 [US3] Implementar mutaciones y cache de rename/delete en `apps/frontend/src/features/conversations/hooks/useConversationMutations.ts`
- [ ] T086 [US3] Implementar sentinel superior y compensación de `scrollHeight` en `apps/frontend/src/features/conversations/components/HistoryTopSentinel.tsx` y `TurnList.tsx`
- [ ] T087 [P] [US3] Implementar “Mostrar más / Mostrar menos” local en `apps/frontend/src/features/conversations/components/CollapsibleHistoryMessage.tsx`
- [ ] T088 [US3] Integrar selección, historial, dialogs y mensajes largos en `apps/frontend/src/components/layout/AppShell.tsx` y `ConversationWorkspace.tsx`

**Checkpoint**: US3 pasa sin botones de página ni mensajes divididos.

## Phase 6: User Story 4 — Iniciar un contexto nuevo (P4)

**Goal**: crear un único borrador local vacío sin borrar ni persistir historial.

**Independent Test**: iniciar nueva desde una conversación guardada y persistir
solo al enviar el primer prompt sin contexto previo.

- [ ] T089 [P] [US4] Probar borrador nuevo repetido y conservación del historial en `apps/frontend/src/features/conversations/__tests__/new-conversation-draft.test.tsx`
- [ ] T090 [P] [US4] Escribir E2E de nuevo contexto persistido solo tras primer prompt en `apps/frontend/e2e/new-conversation.spec.ts`
- [ ] T091 [US4] Añadir estado local de selección/borrador y acción Nueva conversación en `apps/frontend/src/components/layout/AppShell.tsx` y `ConversationSidebar.tsx`
- [ ] T092 [US4] Enviar el primer prompt del draft por `POST /conversations` y seleccionar el ID creado en `apps/frontend/src/features/conversations/components/ConversationWorkspace.tsx`

**Checkpoint**: US4 pasa y no existe endpoint `clear` ni conversación vacía
persistida.

## Phase 7: Cross-cutting acceptance and polish

- [ ] T093 [P] Añadir logs Pino seguros por request/conversation/turn/slot y duración en `apps/backend/src/services/conversations/TurnOrchestrator.ts` y `apps/backend/src/middleware/logger/requestContext.ts`
- [ ] T094 [P] Completar loading/empty/error, foco visible y announcements accesibles en `apps/frontend/src/features/conversations/components/`
- [ ] T095 Crear conjunto versionado de recovery y prueba que recrea servicios sobre la misma DB en `apps/backend/src/services/conversations/__tests__/recovery.integration.test.ts`
- [ ] T096 Hacer que T095 exija orden, atribución, estados y consulta en el 100% de casos del conjunto de recuperación en `apps/backend/src/services/conversations/__tests__/recovery.integration.test.ts`
- [ ] T097 Crear providers fake y runner de SC-010 que mida cada ejecución en `apps/backend/src/acceptance/latency.acceptance.test.ts`
- [ ] T098 Exigir en T097 `202` y menos de un segundo para create/primer historial en al menos el 95% de ejecuciones controladas en `apps/backend/src/acceptance/latency.acceptance.test.ts`
- [ ] T099 Crear fixture de máximo cinco casos y checks simples en `apps/backend/src/services/conversations/__tests__/fixtures/consolidation-evaluation.json` y `apps/backend/src/acceptance/consolidationEvaluation.ts`
- [ ] T100 Añadir script que falla debajo del 90% de checks SC-005 en `apps/backend/package.json`
- [ ] T101 Validar migrate/validate/rollback desde cero con `db/tests/validate-model-fuse-schema.sql`
- [ ] T102 Ejecutar Vitest backend/frontend y Playwright con fakes; corregir solo comportamiento o expectativas desalineadas
- [ ] T103 Ejecutar `pnpm typecheck`, `pnpm lint`, `pnpm test` y `pnpm build`
- [ ] T104 Recorrer y ajustar únicamente comandos/variables implementados en `specs/001-compare-llm-responses/quickstart.md`

## Dependencies and execution order

```text
Setup → Foundational → US1 → US2
                         └→ US3 → US4
US1 + US2 + US3 + US4 → Acceptance
```

- T001 bloquea T003–T005.
- DB: T007 → T008 → T009 → T010 → T011 → T012.
- Backend foundation: T013–T17 → T18/T20 → T21.
- US1 repositories/adapters: T035–T040 → T041/T042 → T043/T044 → T045/T046.
- US1 frontend: T047 → T048; T049/T050 → T051.
- Context: T058 → T059 → T060 → T061/T062.
- History backend: T076 → T077/T078 → T079.
- History frontend: T080 → T081; T082 + T081 → T083/T085/T086 → T088.
- New context: T091 → T092.
- Acceptance T095–T100 depende de las implementaciones correspondientes.

## Parallel opportunities

- Foundation: DB, backend contracts y frontend contracts avanzan en tres lanes.
- US1: cuatro adapter tests y cuatro adapters se asignan por archivo/provider; los
  tests frontend avanzan en paralelo.
- US2: context tests, REST tests y frontend tests avanzan en paralelo.
- US3: backend history, frontend query y dialogs pueden avanzar en paralelo antes
  de T088.
- Acceptance: recovery, latencia y consolidación usan archivos/fixtures distintos.

## Suggested agent allocation

| Scope | Primary agent | Files |
|---|---|---|
| Frontend | `frontend-builder` | `apps/frontend` |
| Shared primitives | `frontend-builder` | `packages/ui` |
| Backend/API/LLM | `backend-builder` | `apps/backend` |
| Liquibase | `backend-builder` | `db` |
| Unit tests | `unit-test-runner` | `**/__tests__` |
| Review | matching auditor | read-only |

Cada handoff debe incluir IDs, documentos de entrada, paths permitidos y comando
de validación. La integración final pertenece al owner principal.

## Independent test criteria

- **US1**: cuatro slots separados; Qwen consolida disponibles; primera falla
  ofrece retry/continue sin retry automático.
- **US2**: cada base ve solo su historial; Qwen ve su historial y respuestas base
  actuales; ventana acotada se comunica.
- **US3**: sidebar infinito, tres turnos iniciales, prepend completo, posición
  estable, rename/delete y colapso local.
- **US4**: nuevo contexto vacío local; la persistencia empieza con el primer
  prompt.

## MVP

Completar Setup, Foundational y US1 (T001–T051). Es el menor incremento que
entrega comparación, consolidación y recuperación manual de slots.

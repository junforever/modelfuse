# Tasks: Comparación y consolidación de respuestas LLM

**Input**: Documentos de diseño en `specs/001-compare-llm-responses/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/rest-api.md`, `contracts/llm-provider.md`

**Tests**: Las pruebas son obligatorias para comportamiento no trivial. Cada bloque
de pruebas se escribe primero y debe fallar antes de implementar el comportamiento.

**Organization**: Las tareas se agrupan por historia para permitir entregas
incrementales y asignación a subagentes especializados.

## Formato: `[ID] [P?] [Story?] [Domain] Descripción`

- **[P]**: puede ejecutarse en paralelo porque usa archivos distintos y no depende
  de otra tarea sin completar.
- **[Story]**: `US1`, `US2`, `US3` o `US4`; se omite en setup, fundamentos y pulido.
- **[Domain]**: owner primario `FE`, `BE`, `UI`, `DB`, `TEST` o `SHARED`.
- Los componentes reutilizables permanecen en `packages/ui`; composición y server
  state permanecen en `apps/frontend`.
- No se introducen WebSockets, SSE, colas externas, tabla de resúmenes ni módulo de
  métricas en esta versión.

---

## Phase 1: Setup y fundamentos del workspace

**Purpose**: Instalar solo lo que falta y preparar los runners compartidos.

- [ ] T001 [FE] Añadir `@tanstack/react-query` y `@playwright/test`, el script `test:e2e` y el lockfile correspondiente en `apps/frontend/package.json` y `pnpm-lock.yaml`
- [ ] T002 [UI] Añadir con el comando Shadcn centralizado los primitives `tabs`, `dialog`, `dropdown-menu`, `scroll-area` y `skeleton` bajo `packages/ui/src/components/`
- [ ] T003 [P] [FE] Crear un `QueryClient` de producción y montar `QueryClientProvider` en `apps/frontend/src/providers/query-provider.tsx` y `apps/frontend/src/main.tsx`
- [ ] T004 [P] [TEST] Configurar Testing Library y un `QueryClient` nuevo por prueba, sin retries, en `apps/frontend/src/test/setup.ts` y `apps/frontend/src/test/query-test-utils.tsx`, enlazándolo desde `apps/frontend/vitest.config.ts`
- [ ] T005 [P] [TEST] Configurar Playwright con web server, base URL y proyecto Chromium en `apps/frontend/playwright.config.ts`

**Checkpoint**: Dependencias y runners disponibles sin crear paquetes o workspaces
nuevos.

---

## Phase 2: Fundamentos bloqueantes

**Purpose**: Crear el esquema persistente y los contratos comunes que bloquean
todas las historias.

**⚠️ CRITICAL**: Ninguna historia comienza hasta completar esta fase.

### Base de datos

- [ ] T006 [DB] Crear la tabla, constraints e índice de `conversations` con rollback en `db/changelogs/conversations/001-create-conversations.sql`
- [ ] T007 [DB] Crear `turns`, sus estados, idempotencia, ordinal, cascade e índices con rollback en `db/changelogs/conversations/002-create-turns.sql` (depende de T006)
- [ ] T008 [DB] Crear `model_responses`, sus cuatro slots, estados, checks y cascade con rollback en `db/changelogs/messages/001-create-model-responses.sql` (depende de T007)
- [ ] T009 [DB] Crear el índice parcial de respuestas activas y los índices de lectura restantes en `db/changelogs/messages/002-add-response-indexes.sql` (depende de T008)
- [ ] T010 [DB] Crear `db/changelogs/conversations/db.changelog-conversations.xml` y `db/changelogs/messages/db.changelog-messages.xml`, e incluir ambos desde `db/changelogs/db.changelog-master.xml` (depende de T006–T009)
- [ ] T011 [TEST] Añadir aserciones SQL para tablas, checks, uniques, índices y cascades en `db/tests/validate-model-fuse-schema.sql` (depende de T010)

### Backend y contratos

- [ ] T012 [P] [BE] Validar entorno, slots, modelos, credenciales, timeouts y `LLM_CONTEXT_MAX_TURNS` con Zod en `apps/backend/src/infrastructure/config/env.ts` y documentar nombres seguros en `apps/backend/.env.sample`
- [ ] T013 [P] [BE] Definir contratos REST y esquemas Zod de conversación, turno, respuesta, cursores y parámetros en `apps/backend/src/types/conversations.ts` y `apps/backend/src/middleware/validation/conversationSchemas.ts`
- [ ] T014 [BE] Implementar middleware de validación y errores API sanitizados en `apps/backend/src/middleware/validation/validateRequest.ts` y `apps/backend/src/types/apiError.ts` (depende de T013)
- [ ] T015 [P] [BE] Definir `LlmProvider`, requests, resultados normalizados, usage y errores estables en `apps/backend/src/types/llm.ts` y `apps/backend/src/services/llm/llmErrors.ts`
- [ ] T016 [BE] Crear helpers de transacción y mappers PostgreSQL→contrato en `apps/backend/src/infrastructure/postgres/transaction.ts` y `apps/backend/src/infrastructure/postgres/mappers/conversationMapper.ts` (depende de T010 y T013)
- [ ] T017 [BE] Implementar el adapter HTTP mínimo para proveedores OpenAI-compatible con Axios, `AbortSignal`, timeout y normalización en `apps/backend/src/infrastructure/llm/providers/openAiCompatibleProvider.ts` (depende de T012 y T015)
- [ ] T018 [BE] Construir el mapa explícito de los cuatro slots configurados en `apps/backend/src/infrastructure/llm/providerRegistry.ts` (depende de T017)
- [ ] T019 [BE] Crear `apiRouter`, montar `/api/v1` antes de rutas inválidas y mantener startup/shutdown fuera de `app.ts` en `apps/backend/src/routes/apiRouter.ts`, `apps/backend/src/app.ts` y `apps/backend/src/index.ts` (depende de T014)

### Frontend y pruebas compartidas

- [ ] T020 [P] [FE] Definir tipos, schemas Zod, cliente Axios cancelable y query keys estables en `apps/frontend/src/features/conversations/types/conversation.ts`, `apps/frontend/src/features/conversations/schemas/conversationSchemas.ts`, `apps/frontend/src/features/conversations/api/client.ts` y `apps/frontend/src/features/conversations/queries/conversation-keys.ts`
- [ ] T021 [P] [TEST] Crear adapters LLM fake deterministas y fixtures de conversación/turno para pruebas en `apps/backend/src/test/fakes/fakeLlmProvider.ts` y `apps/backend/src/test/fixtures/conversationFixtures.ts` (depende de T015)

**Checkpoint**: Migraciones, configuración, contratos, provider boundary y test
harness listos. Las historias pueden avanzar por sus lanes FE/BE/TEST.

---

## Phase 3: User Story 1 — Comparar y consolidar respuestas (Priority: P1) 🎯 MVP

**Goal**: Enviar un prompt, ejecutar tres slots base en paralelo, consolidar las
respuestas disponibles y mostrar cuatro tabs identificados con estados y retry.

**Independent Test**: Crear una conversación con providers fake, observar estados
independientes y verificar tres respuestas base más una consolidada; al fallar un
slot, conservar las respuestas útiles y reintentar solo el slot afectado.

### Tests para User Story 1

- [ ] T022 [P] [US1] [TEST] Escribir pruebas unitarias de ejecución paralela, `allSettled`, consolidación parcial y estado terminal en `apps/backend/src/services/conversations/__tests__/turnOrchestrator.test.ts`
- [ ] T023 [P] [US1] [TEST] Escribir contract tests de normalización, cancelación y sanitización del adapter en `apps/backend/src/infrastructure/llm/providers/__tests__/openAiCompatibleProvider.test.ts`
- [ ] T024 [P] [US1] [TEST] Escribir pruebas Supertest de `POST /conversations`, polling y retry de slots en `apps/backend/src/routes/conversations/__tests__/conversationExecution.integration.test.ts`
- [ ] T025 [P] [US1] [TEST] Escribir pruebas accesibles de cuatro tabs, etiquetas persistentes, estados y contenido aislado en `apps/frontend/src/features/conversations/__tests__/ResponseTabs.test.tsx`
- [ ] T026 [P] [US1] [TEST] Escribir pruebas de create mutation, polling cada segundo, parada terminal y reemplazo del turno en cache en `apps/frontend/src/features/conversations/__tests__/turn-execution-queries.test.tsx`
- [ ] T027 [P] [US1] [TEST] Escribir el E2E de prompt inicial, comparación, consolidación, fallo parcial y retry en `apps/frontend/e2e/conversation-comparison.spec.ts`

### Backend para User Story 1

- [ ] T028 [P] [US1] [BE] Implementar creación transaccional de conversación, primer turno y cuatro slots `pending` en `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts`
- [ ] T029 [P] [US1] [BE] Implementar lecturas y transiciones atómicas de turnos/respuestas, descartando resultados tardíos, en `apps/backend/src/infrastructure/postgres/repositories/turnRepository.ts`
- [ ] T030 [US1] [BE] Implementar `TurnOrchestrator` con tres bases en paralelo, persistencia por slot y consolidación posterior en `apps/backend/src/services/conversations/TurnOrchestrator.ts` (depende de T018, T028 y T029)
- [ ] T031 [US1] [BE] Añadir retry de slot fallido y reset del consolidador cuando se reintenta una base en `apps/backend/src/services/conversations/TurnOrchestrator.ts` (depende de T030)
- [ ] T032 [US1] [BE] Implementar creación inicial, consulta de turno y delegación de retry en `apps/backend/src/services/conversations/ConversationService.ts` (depende de T028–T031)
- [ ] T033 [US1] [BE] Exponer create, polling y retry mediante controller y router delgados en `apps/backend/src/controllers/conversations/conversationController.ts` y `apps/backend/src/routes/conversations/conversationRoutes.ts` (depende de T032)
- [ ] T034 [US1] [BE] Marcar slots `running` interrumpidos como `failed/interrupted` durante startup en `apps/backend/src/services/conversations/recoverInterruptedTurns.ts` y llamarlo desde `apps/backend/src/index.ts` (depende de T029)

### Frontend para User Story 1

- [ ] T035 [P] [US1] [FE] Implementar llamadas validadas para crear conversación, consultar turno y reintentar slot en `apps/frontend/src/features/conversations/api/conversationsApi.ts`
- [ ] T036 [US1] [FE] Implementar `useCreateConversation`, `useActiveTurn` y `useRetryResponse` con seed, polling terminal e invalidación en `apps/frontend/src/features/conversations/hooks/useConversationExecution.ts` (depende de T035)
- [ ] T037 [P] [US1] [FE] Crear el layout accesible de sidebar y workspace en `apps/frontend/src/components/layout/AppShell.tsx`
- [ ] T038 [P] [US1] [FE] Crear `ResponseTabs` y `ResponsePanel` con cuatro labels, estados loading/error/completed y retry en `apps/frontend/src/features/conversations/components/ResponseTabs.tsx` y `apps/frontend/src/features/conversations/components/ResponsePanel.tsx`
- [ ] T039 [US1] [FE] Crear `PromptComposer`, `TurnCard`, `TurnList` y `ConversationWorkspace`, conectarlos en `apps/frontend/src/App.tsx` sin copiar server state a `useState` en `apps/frontend/src/features/conversations/components/` (depende de T036–T038)

**Checkpoint**: T022–T027 pasan y la aplicación entrega el valor MVP completo con
un solo turno.

---

## Phase 4: User Story 2 — Continuar una conversación (Priority: P2)

**Goal**: Añadir turnos manteniendo un historial aislado para cada base y un
historial propio del consolidador más las respuestas base del turno actual.

**Independent Test**: Preparar historiales distintos, enviar un seguimiento y
capturar los mensajes entregados a cada fake provider para comprobar aislamiento,
orden cronológico y ventana máxima.

### Tests para User Story 2

- [ ] T040 [P] [US2] [TEST] Escribir pruebas unitarias de contexto base por slot, contexto consolidado, orden, presupuesto y truncamiento en `apps/backend/src/services/conversations/__tests__/ContextBuilder.test.ts`
- [ ] T041 [P] [US2] [TEST] Escribir pruebas Supertest de segundo turno, idempotencia por `clientRequestId` y conflicto de turno activo en `apps/backend/src/routes/conversations/__tests__/conversationContinuation.integration.test.ts`
- [ ] T042 [P] [US2] [TEST] Escribir pruebas frontend de `createTurn`, append al bloque reciente y polling del nuevo turno en `apps/frontend/src/features/conversations/__tests__/conversation-continuation-queries.test.tsx`
- [ ] T043 [P] [US2] [TEST] Escribir E2E multi-turno que compruebe continuidad visible y asociación de cuatro respuestas por turno en `apps/frontend/e2e/conversation-continuation.spec.ts`

### Implementación para User Story 2

- [ ] T044 [US2] [BE] Implementar consultas acotadas para historial de un slot base y del consolidador en `apps/backend/src/infrastructure/postgres/repositories/contextRepository.ts`
- [ ] T045 [US2] [BE] Implementar `ContextBuilder` con máximo de turnos/tokens y metadatos `includedTurns`/`contextTruncated` en `apps/backend/src/services/conversations/ContextBuilder.ts` (depende de T044)
- [ ] T046 [US2] [BE] Integrar `ContextBuilder` en bases y consolidador sin entregar historiales base previos al cuarto modelo en `apps/backend/src/services/conversations/TurnOrchestrator.ts` (depende de T045)
- [ ] T047 [US2] [BE] Añadir creación idempotente de turnos posteriores y `TURN_IN_PROGRESS` en `apps/backend/src/services/conversations/ConversationService.ts`, `apps/backend/src/controllers/conversations/conversationController.ts` y `apps/backend/src/routes/conversations/conversationRoutes.ts` (depende de T046)
- [ ] T048 [P] [US2] [FE] Añadir `createTurn` y `useCreateTurn` con append del turno, seed de polling e invalidación de lista en `apps/frontend/src/features/conversations/api/conversationsApi.ts` y `apps/frontend/src/features/conversations/hooks/useConversationExecution.ts`
- [ ] T049 [US2] [FE] Conectar el composer a la conversación activa y renderizar múltiples turnos cronológicos en `apps/frontend/src/features/conversations/components/ConversationWorkspace.tsx` y `apps/frontend/src/features/conversations/components/TurnList.tsx` (depende de T048)

**Checkpoint**: US1 y US2 pasan; los contextos se pueden inspeccionar mediante los
fake providers sin mezclar respuestas entre slots.

---

## Phase 5: User Story 3 — Recuperar y gestionar conversaciones (Priority: P3)

**Goal**: Listar, reabrir, cargar inicialmente tres turnos completos, anteponer
bloques anteriores con scroll ascendente y permitir rename/delete confirmados.

**Independent Test**: Reabrir una conversación de siete turnos; comprobar 3 turnos
iniciales, bloques anteriores 3+1 sin salto visual, rename persistente y delete
solo después de confirmación.

### Tests para User Story 3

- [ ] T050 [P] [US3] [TEST] Escribir pruebas unitarias de encode/decode y rechazo de cursores opacos en `apps/backend/src/utils/__tests__/cursor.test.ts`
- [ ] T051 [P] [US3] [TEST] Escribir pruebas PostgreSQL de lista estable, páginas 3/3/1, turnos completos, cursor inválido y cascades en `apps/backend/src/infrastructure/postgres/repositories/__tests__/conversationHistoryRepository.integration.test.ts`
- [ ] T052 [P] [US3] [TEST] Escribir pruebas Supertest de list/detail/history/rename/delete y límites de cursor en `apps/backend/src/routes/conversations/__tests__/conversationHistory.integration.test.ts`
- [ ] T053 [P] [US3] [TEST] Escribir pruebas de `useInfiniteQuery`, flatten cronológico, `getPreviousPageParam` y liberación de cache inactiva en `apps/frontend/src/features/conversations/__tests__/conversation-history-queries.test.tsx`
- [ ] T054 [P] [US3] [TEST] Escribir pruebas de sentinel superior, carga incremental y conservación de `scrollTop` en `apps/frontend/src/features/conversations/__tests__/HistoryTopSentinel.test.tsx`
- [ ] T055 [P] [US3] [TEST] Escribir pruebas de teclado, foco, límite de 80 caracteres, cancelación y confirmación en `apps/frontend/src/features/conversations/__tests__/ConversationMenuDialogs.test.tsx`
- [ ] T056 [P] [US3] [TEST] Escribir E2E de reapertura, carga inicial de tres turnos y scroll ascendente sin paginación visible en `apps/frontend/e2e/conversation-history.spec.ts`
- [ ] T057 [P] [US3] [TEST] Escribir E2E de rename persistente, cancelación de delete y eliminación confirmada en `apps/frontend/e2e/conversation-management.spec.ts`

### Backend para User Story 3

- [ ] T058 [US3] [BE] Implementar cursores Base64URL validados para `(updatedAt,id)` y `(ordinal,id)` en `apps/backend/src/utils/cursor.ts`
- [ ] T059 [US3] [BE] Implementar list/detail y lectura de bloques cronológicos de turnos completos con default 3/máximo 20 en `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts` (depende de T058)
- [ ] T060 [US3] [BE] Implementar rename transaccional y delete físico en cascade en `apps/backend/src/infrastructure/postgres/repositories/conversationRepository.ts` (depende de T059)
- [ ] T061 [US3] [BE] Añadir reglas de cursor, rename trim 1–80 y delete a `apps/backend/src/services/conversations/ConversationService.ts` (depende de T059 y T060)
- [ ] T062 [US3] [BE] Exponer list/detail/history/rename/delete y sus errores contractuales en `apps/backend/src/controllers/conversations/conversationController.ts` y `apps/backend/src/routes/conversations/conversationRoutes.ts` (depende de T061)

### Frontend para User Story 3

- [ ] T063 [P] [US3] [FE] Implementar API validada de list/detail/history/rename/delete con `AbortSignal` en `apps/frontend/src/features/conversations/api/conversationsApi.ts`
- [ ] T064 [US3] [FE] Implementar `useConversations`, `useConversationDetail` y `useConversationHistory` con `useInfiniteQuery` en `apps/frontend/src/features/conversations/hooks/useConversationQueries.ts` (depende de T063)
- [ ] T065 [P] [US3] [FE] Implementar helpers puros para flatten, prepend y reemplazo de turnos dentro de `InfiniteData` en `apps/frontend/src/features/conversations/queries/conversation-cache.ts`
- [ ] T066 [US3] [FE] Crear `ConversationSidebar`, `ConversationListItem` y `ConversationMenu` con estado empty/loading/error en `apps/frontend/src/features/conversations/components/ConversationSidebar.tsx`, `ConversationListItem.tsx` y `ConversationMenu.tsx` (depende de T064)
- [ ] T067 [P] [US3] [FE] Crear `RenameConversationDialog` y `DeleteConversationDialog` accesibles en `apps/frontend/src/features/conversations/components/RenameConversationDialog.tsx` y `DeleteConversationDialog.tsx`
- [ ] T068 [US3] [FE] Implementar mutations de rename/delete con patch, cancelación, limpieza e invalidación de cache en `apps/frontend/src/features/conversations/hooks/useConversationMutations.ts` (depende de T063, T065 y T067)
- [ ] T069 [US3] [FE] Implementar `HistoryTopSentinel`, prepend por `fetchPreviousPage` y compensación por diferencia de `scrollHeight` en `apps/frontend/src/features/conversations/components/HistoryTopSentinel.tsx` y `apps/frontend/src/features/conversations/components/TurnList.tsx` (depende de T054, T064 y T065)
- [ ] T070 [US3] [FE] Conectar selección, sidebar, dialogs e historial; remover queries de la conversación anterior sin cancelar su ejecución backend en `apps/frontend/src/components/layout/AppShell.tsx` y `apps/frontend/src/features/conversations/components/ConversationWorkspace.tsx` (depende de T066–T069)

**Checkpoint**: US3 pasa con conversación reabierta y continuable; la UI nunca
pagina mensajes sueltos ni muestra controles de página.

---

## Phase 6: User Story 4 — Iniciar un contexto nuevo (Priority: P4)

**Goal**: Limpiar la selección actual y abrir un único borrador local sin borrar ni
persistir conversaciones vacías.

**Independent Test**: Desde una conversación guardada, iniciar otra, verificar área
vacía y enviar el primer prompt sin contexto previo; la anterior sigue en sidebar.

### Tests para User Story 4

- [ ] T071 [P] [US4] [TEST] Escribir prueba frontend de nuevo borrador, repetición idempotente y conservación del historial guardado en `apps/frontend/src/features/conversations/__tests__/new-conversation-draft.test.tsx`
- [ ] T072 [P] [US4] [TEST] Escribir E2E de iniciar contexto nuevo y persistir solo después del primer prompt en `apps/frontend/e2e/new-conversation.spec.ts`

### Implementación para User Story 4

- [ ] T073 [US4] [FE] Añadir estado local único de `activeConversationId`/draft y acción “Nueva conversación” en `apps/frontend/src/components/layout/AppShell.tsx` y `apps/frontend/src/features/conversations/components/ConversationSidebar.tsx`
- [ ] T074 [US4] [FE] Hacer que el primer submit del draft use `POST /conversations`, seleccione el id creado y preserve la lista previa en `apps/frontend/src/features/conversations/components/ConversationWorkspace.tsx` (depende de T073)

**Checkpoint**: Las cuatro historias funcionan y no existe endpoint `clear` ni
registro persistente vacío.

---

## Phase 7: Integración, calidad y pulido transversal

**Purpose**: Cerrar observabilidad, accesibilidad, seguridad y validación completa
sin añadir features futuras.

- [ ] T075 [P] [BE] Añadir logs Pino correlacionados por request/conversation/turn/slot, duración y estado, excluyendo prompts, respuestas y secretos, en `apps/backend/src/services/conversations/TurnOrchestrator.ts` y `apps/backend/src/middleware/logger/requestContext.ts`
- [ ] T076 [P] [FE] Completar estados loading/empty/error/disabled, foco visible y announcements accesibles en `apps/frontend/src/features/conversations/components/`
- [ ] T077 [TEST] Ejecutar `liquibase validate`, migración desde cero, `db/tests/validate-model-fuse-schema.sql` y rollback en la base desechable; corregir únicamente `db/changelogs/` si falla
- [ ] T078 [TEST] Ejecutar suites backend y frontend, incluidos polling con reloj fake y adapters sin red, y corregir solo `apps/backend/src/**/__tests__/` o `apps/frontend/src/**/__tests__/` cuando la expectativa sea errónea
- [ ] T079 [TEST] Ejecutar Playwright contra backend y PostgreSQL de prueba sin proveedores pagados y estabilizar fixtures en `apps/frontend/e2e/`
- [ ] T080 [SHARED] Ejecutar `pnpm typecheck`, `pnpm lint`, `pnpm test` y `pnpm build`; owner de integración corrige cada fallo dentro del workspace responsable
- [ ] T081 [SHARED] Recorrer el smoke flow de `specs/001-compare-llm-responses/quickstart.md` y actualizar ese archivo solo si los comandos o variables implementados difieren

---

## Dependencies & Execution Order

### Dependencias por fase

- **Phase 1** no tiene prerrequisitos. T003–T005 pueden comenzar en paralelo
  después de T001; T002 se mantiene separada para evitar conflictos de lockfile.
- **Phase 2** depende de Phase 1 y bloquea todas las historias.
- **US1** depende de Phase 2 y constituye el MVP.
- **US2** depende de US1 porque amplía `TurnOrchestrator`, `ConversationService` y
  el composer existentes.
- **US3** depende de la base de US1; puede avanzar en paralelo con US2 después de
  Phase 2 salvo T070, que integra el workspace multi-turno.
- **US4** depende de US3 porque reutiliza sidebar y selección.
- **Phase 7** depende de las historias que se vayan a entregar.

### Grafo de historias

```text
Setup → Fundamentos → US1 (MVP) → US2
                         └──────→ US3 → US4
US2 + US3 + US4 → Integración final
```

### Dependencias internas críticas

- DB: `T006 → T007 → T008 → T009 → T010 → T011`.
- Orquestación inicial: `T028 + T029 → T030 → T031 → T032 → T033`.
- Contexto multi-turno: `T044 → T045 → T046 → T047`.
- Historial backend: `T058 → T059 → T060 → T061 → T062`.
- Historial frontend: `T063 → T064`; `T065 + T064 → T069`;
  `T066 + T067 + T068 + T069 → T070`.
- Nuevo contexto: `T073 → T074`.

### Parallel Opportunities

- En fundamentos: T012, T013, T015 y T020 trabajan en archivos independientes
  mientras avanza el lane DB.
- En US1: T022–T027 se pueden escribir en paralelo; T028 y T029 también.
- En US2: T040–T043 se pueden escribir en paralelo; T048 puede avanzar en
  paralelo al lane backend usando el contrato REST.
- En US3: T050–T057 se pueden escribir en paralelo; T063, T065 y T067 también.
- US2 backend/FE y US3 backend/FE pueden asignarse a subagentes distintos después
  de completar US1, dejando T070 como punto explícito de integración.

---

## Asignación sugerida a subagentes

| Bloque | Ejecutor principal | Revisión | Alcance |
|---|---|---|---|
| T002, T003, T020, T025–T026, T035–T039, T042, T048–T049, T053–T055, T063–T074, T076 | `frontend-builder` | `frontend-auditor` | `apps/frontend`, `packages/ui` |
| T012–T019, T022–T024, T028–T034, T040–T047, T050–T052, T058–T062, T075 | `backend-builder` | `backend-auditor` | `apps/backend` |
| T006–T011, T077 | `backend-builder` | `backend-auditor` | `db` y migraciones |
| Unit tests T022–T023, T040, T050, T053–T055, T071 | `unit-test-runner` | auditor del dominio | archivos `__tests__` |
| Integration/E2E T024, T027, T041–T043, T051–T052, T056–T057, T072, T078–T079 | builder del dominio | auditor del dominio | Supertest, PostgreSQL, Testing Library, Playwright |
| T080–T081 | owner de integración | ambos auditores | monorepo completo |

Cada asignación debe incluir los IDs, documentos de entrada, archivos permitidos y
comando de validación. Los auditores permanecen read-only.

---

## Parallel Example: User Story 3

```text
Agente TEST-A: T050 + T051 + T052
Agente TEST-B: T053 + T054 + T055
Agente BE:     T058 → T059 → T060 → T061 → T062
Agente FE:     T063 + T065 + T067, luego T064 → T066/T068/T069 → T070
```

No se asignan en paralelo tareas que editan el mismo archivo, aunque pertenezcan a
dominios distintos.

---

## Implementation Strategy

### MVP First

1. Completar Phase 1.
2. Completar Phase 2 y validar migraciones.
3. Escribir T022–T027 y comprobar que fallan por el comportamiento ausente.
4. Implementar T028–T039.
5. Ejecutar las pruebas de US1 y detenerse: este punto ya permite comparar,
   consolidar y recuperar fallos de un turno.

### Entrega incremental

1. **US1**: comparación y consolidación de un turno.
2. **US2**: conversación continua con contextos aislados.
3. **US3**: persistencia navegable, historial infinito y gestión.
4. **US4**: borrador local para nuevo contexto.
5. **Phase 7**: gates transversales y smoke flow.

### Criterios de cierre por historia

- **US1**: T022–T027 pasan; cada slot termina o muestra error recuperable.
- **US2**: los mensajes capturados prueban que ninguna base ve otra base y que el
  consolidador no recibe historiales base previos.
- **US3**: carga inicial de exactamente hasta tres turnos completos; scroll
  incorpora 3+ bloques sin salto, botones ni mensajes partidos.
- **US4**: iniciar otra conversación vacía no escribe en PostgreSQL; el primer
  prompt sí crea conversación y turno atómicamente.

---

## Notes

- `[P]` indica paralelismo real por archivos y dependencias, no solo trabajo
  conceptualmente distinto.
- TanStack Query posee todo el server state; `useState` se limita a selección,
  drafts, tabs y dialogs.
- El adapter OpenAI-compatible es la implementación mínima de v1. Un proveedor
  con protocolo incompatible requiere un adapter concreto y sus contract tests,
  sin modificar `TurnOrchestrator`.
- Los tests E2E usan fakes deterministas; nunca invocan APIs pagadas.
- No se crea abstracción de resumen, ranking, métricas analíticas, streaming o
  ejecución distribuida hasta que una feature lo exija.

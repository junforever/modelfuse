# Quickstart: ModelFuse Conversation Comparison

## Prerequisites

- Node.js 22+
- pnpm 11
- Docker con Compose
- Credenciales para OpenAI, Google, MiniMax y Qwen

## 1. Install

```bash
pnpm install
```

La implementación añade TanStack Query al frontend y Playwright para E2E.
Backend reutiliza Axios, `pg`, Zod, Pino, Vitest y Supertest. No añade librería de
retry ni infraestructura genérica de idempotencia.

## 2. Configure backend

Copiar `apps/backend/.env.sample` a `apps/backend/.env`:

```dotenv
PORT=3001
NODE_ENV=development
FRONTEND_URL_LOCALHOST=http://localhost:5173
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=db_dev

OPENAI_API_KEY=
OPENAI_MODEL=
GOOGLE_API_KEY=
GOOGLE_MODEL=
MINIMAX_API_KEY=
MINIMAX_MODEL=
QWEN_API_KEY=
QWEN_MODEL=

# Provider BASE_URL only when the selected deployment requires it.

LLM_PROVIDER_TIMEOUT_MS=
CONVERSATION_CONTEXT_MAX_TURNS=
LLM_CONTEXT_THRESHOLD_RATIO=0.8
OPENAI_CONTEXT_LIMIT_TOKENS=
GOOGLE_CONTEXT_LIMIT_TOKENS=
MINIMAX_CONTEXT_LIMIT_TOKENS=
QWEN_CONTEXT_LIMIT_TOKENS=
CONVERSATION_SIDEBAR_PAGE_SIZE=
```

Credenciales reales no pertenecen a `.env.sample`, logs ni datos
conversacionales. Una variable requerida ausente impide startup e identifica solo
su nombre.

`CONVERSATION_CONTEXT_MAX_TURNS` acota turnos relevantes. Los límites pertenecen
al deployment y el ratio aplica protección técnica antes de cada adapter; no
definen presupuesto de producto ni contabilidad persistente de tokens.

## 3. Configure frontend

```dotenv
VITE_API_BASE_URL=http://localhost:3001/api/v1
VITE_HISTORY_COLLAPSE_CHAR_THRESHOLD=600
```

Frontend genera `clientRequestId` mediante `crypto.randomUUID()`; no requiere
configuración. Tras un create `202`, abre un `EventSource` para el turno. SSE es
el único mecanismo de actualizaciones en tiempo real de v1 y no tiene fallback de
transporte.

## 4. Start PostgreSQL and migrate

```bash
docker compose up -d postgres_template
docker compose run --rm liquibase_template
```

Liquibase aplica módulos `conversations` y `messages`. No se ejecutan cambios
manuales de esquema.

## 5. Run

```bash
pnpm dev
```

- Backend: `http://localhost:3001`
- API: `http://localhost:3001/api/v1`
- Frontend: URL impresa por Vite

## 6. Core smoke flow

1. Enviar un prompt y verificar tabs OpenAI, Google, MiniMax y Qwen.
2. Confirmar `202`, apertura del stream del turno y eventos `slot_update`,
   `turn_update` y `busy_update` durante bases/consolidación.
3. Con `busy_update=true`, verificar aviso de procesamiento, Enviar/Retry/Delete
   disabled, y navegación, Rename y Continue-without disponibles.
4. Navegar a otra conversación y comprobar que sus acciones dependen de su propio
   busy; resultados siguen guardándose en la conversación de origen.
5. Con turno terminal y `busy_update=false`, verificar acciones reactivadas,
   resultado persistido y stream cerrado.

## 7. Idempotency and concurrency smoke flow

1. Enviar dos veces `POST /conversations` con el mismo `clientRequestId` y prompt:
   ambas respuestas deben referir a la misma conversación/turno y providers deben
   ejecutarse una sola vez.
2. Repetir `POST /conversations/:id/turns` con el mismo ID/prompt mientras el
   turno está activo: debe devolver el turno original, no `CONVERSATION_BUSY`.
3. Enviar un ID nuevo a esa conversación mientras cualquier turno/slot está
   `pending`/`running`: debe responder `409 CONVERSATION_BUSY`.
4. Terminar el trabajo como `partial` o `failed` sin estados activos y repetir con
   otro ID nuevo: debe aceptar el turno.
5. Reutilizar un ID con prompt distinto: debe responder
   `409 CLIENT_REQUEST_ID_CONFLICT`.
6. En dos conversaciones distintas, comprobar que busy en una no bloquea a la
   otra.

## 8. Retry and first failure smoke flow

1. Forzar la primera falla recuperable de una base mientras otra sigue running.
2. Verificar que Retry y Continue-without aparecen inmediatamente, sin otra
   llamada automática.
3. Verificar Retry visible pero disabled por busy; Continue-without permanece
   disponible.
4. Cuando no quede trabajo, verificar Retry habilitado para el slot fallido.
5. Enviar dos retries simultáneos del mismo slot: solo uno debe aceptarse; el otro
   recibe `RESPONSE_RETRY_IN_PROGRESS`.
6. Forzar retry base fallido: Qwen no debe invocarse ni invalidarse.
7. Forzar retry base exitoso: Qwen previo queda stale y una nueva consolidación lo
   reemplaza.
8. Forzar Qwen fallido: bases permanecen visibles y solo Qwen ofrece retry cuando
   el error es recuperable y la conversación deja de estar busy.
9. Ejecutar Continue-without sobre base fallida: el dialog debe advertir que es
   permanente; tras confirmar persiste la ausencia sin llamada de provider ni
   estado activo nuevo.
10. Intentar retry del mismo slot: debe responder
    `RESPONSE_NOT_RETRYABLE`; Qwen debe omitirlo también en reconsolidaciones.
11. Forzar `timeout`, `connectivity`, `rate_limited` y
    `provider_transient_error`: todos deben persistir `recoverable=true` y mostrar
    Retry conforme a busy.
12. Forzar `authentication`, `content_blocked`, `invalid_prompt_size`,
    `invalid_response` y `provider_error`: deben persistir `recoverable=false`,
    ocultar Retry y conservar Continue-without solo en slots base fallidos.
13. Ejecutar recovery sobre un slot `pending`/`running`: debe quedar
    `failed/interrupted`, `recoverable=true` y elegible para Retry manual.

## 9. Context and history smoke flow

1. Crear follow-up y capturar mensajes fake: cada base ve solo su historial;
   Qwen ve su historial y respuestas base actuales.
2. Probar el medidor de cada adapter con ASCII, puntuación densa, Unicode/emoji,
   scripts no latinos y fragmentos/delimitadores; el modo exacto coincide y la
   cota superior nunca queda por debajo del conteo de referencia.
3. Reducir el límite fake o el ratio y verificar eliminación de turnos antiguos,
   truncamiento auxiliar y `contextWindow.protectionApplied`.
4. Forzar que ni el payload mínimo quepa y verificar
   `INVALID_PROMPT_SIZE` solo en ese slot, sin request externo.
5. Confirmar aviso textual y ausencia de prompt compuesto, mediciones, límites
   o contexto duplicado en PostgreSQL.
6. Crear siete turnos, recargar y verificar solo los tres recientes.
7. Hacer scroll arriba y comprobar bloques anteriores de hasta tres sin salto.
8. Desbordar sidebar y comprobar scroll descendente/autofill.
9. Comprobar “Mostrar más / Mostrar menos” sin red ni escrituras.
10. Durante busy, verificar Delete disabled con explicación y Rename habilitado.
11. Llamar `DELETE` directamente durante busy y esperar
    `409 CONVERSATION_BUSY`; después de terminar, confirmar cascade.
12. En Rename, probar ASCII, emoji simple, un emoji familiar unido con ZWJ, una
    letra con marca combinada y una mezcla ASCII/Unicode; el contador debe variar
    por grapheme visible y coincidir con la validación backend.
13. Confirmar que 80 grapheme clusters se aceptan y persisten literalmente, que
    81 se rechazan sin cambiar el título anterior y que el texto se muestra sin
    interpretarse como HTML.
14. Crear una conversación cuyo primer prompt supere 80 graphemes y verificar que
    el título termina en el grapheme 80 sin dividir emoji ZWJ ni marcas combinadas.

## 10. SSE smoke flow

1. Abrir
   `/api/v1/conversations/:conversationId/turns/:turnId/events` y verificar
   `Content-Type: text/event-stream`, snapshot inicial y los tres eventos.
2. Confirmar que `slot_update` entrega estados/resultados, `turn_update` el estado
   agregado y `busy_update` el busy explícito; los runtime stages no cambian DB.
3. Desconectar y abrir un stream nuevo: debe converger desde PostgreSQL sin replay
   histórico de eventos.
4. Recargar/reabrir una conversación activa y verificar una suscripción nueva al
   mismo turno.
5. Interrumpir SSE: mostrar error visible y comprobar que no aparecen consultas
   periódicas, long polling ni WebSockets.
6. Terminar el turno, recibir `busy_update=false`, confirmar estado persistido y
   cierre sin streaming token por token.

## 11. Recovery acceptance

1. Preparar cada caso versionado con slots `pending`, `running` y completados.
2. Recrear aplicación/servicios sobre la misma PostgreSQL.
3. Verificar reconciliación terminal, recálculo de turno y busy=false cuando no
   queden estados activos.
4. Verificar orden, atribución, estados coherentes y consulta posterior.
5. Exigir éxito en el 100% de casos del conjunto de recuperación, sin extrapolar
   a todos los casos posibles.

## 12. Controlled latency acceptance

Con PostgreSQL local y providers fake:

1. medir cada `POST /api/v1/conversations`;
2. medir cada primera consulta de historial;
3. verificar `202` para create;
4. exigir menos de un segundo para ambos endpoints en al menos el 95% de
   ejecuciones del conjunto controlado.

No es garantía global de producción ni de providers reales.

## 13. Product/UX usability acceptance

1. Product/UX fija antes de ejecutar un grupo de al menos diez participantes
   válidos; el mismo grupo puede evaluar SC-003 y SC-004.
2. El protocolo documenta tareas, escenarios y criterio observable para
   comparación, busy, retry/Continue-without, contexto truncado, Delete,
   historial y error SSE.
3. El protocolo define previamente criterios de inclusión/exclusión y no cambia
   la muestra ni el denominador después de iniciar la primera tarea.
4. El protocolo registra claridad, confianza, esfuerzo y frustración.
5. La ejecución conserva por separado para SC-003 y SC-004 la muestra prevista,
   participantes válidos, exclusiones justificadas, numerador, denominador,
   porcentaje y `pass`/`fail` frente al 90%.
6. Conservar observaciones y propuestas; una sesión sin esa evidencia no basta.

## 14. Validation

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
docker compose run --rm liquibase_template validate
```

Después de implementación:

```bash
pnpm --filter frontend test:e2e
pnpm --filter backend test:acceptance-latency
pnpm --filter backend test:consolidation-eval
```

- aceptación de latencia reporta total/éxitos por endpoint y exige 95%;
- evaluación procesa máximo cinco casos y falla debajo del 90% de checks;
- tests predeterminados usan fakes y no providers pagados.

## Troubleshooting

- `CONVERSATION_BUSY`: esperar que no queden turnos/slots pending/running en esa
  conversación; otras siguen disponibles.
- Replay idempotente: reutilizar el mismo ID solo para el mismo submit/prompt.
- `RESPONSE_RETRY_IN_PROGRESS`: el mismo slot ya tiene un retry activo.
- `RESPONSE_NOT_RETRYABLE`: el slot no es fallido recuperable o ya tiene
  Continue-without permanente.
- Credencial rechazada: `authentication`, no recuperable y sin Retry; timeout:
  recuperable y con Retry manual. Ambos afectan solo su slot y nunca disparan
  retry automático.
- `INVALID_PROMPT_SIZE`: la protección no logró un payload válido; solo falla ese
  slot.
- Contexto acotado: UI muestra evidencia; DB conserva historial completo.
- Delete busy: esperar estado terminal; Rename sigue disponible.
- SSE: un error visible indica que el stream no pudo establecerse o abrirse de
  nuevo; la actualización en tiempo real solo puede recuperarse con una nueva
  conexión SSE al turno. V1 no activa fallback de transporte.
- Recovery: slots interrumpidos quedan terminales y manualmente recuperables.
- Liquibase: corregir changeset; no editar PostgreSQL manualmente. La validación de Liquibase también debe:
  1. aplicar todos los changesets desde una base vacía;
  2. ejecutar sus rollbacks explícitos sobre esa base desechable;
  3. comprobar que se recuperó el estado anterior;
  4. aplicar nuevamente los changesets y verificar el esquema final.
     Nunca ejecutar esta prueba destructiva contra una base con datos que deban conservarse.

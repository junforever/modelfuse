# HTTP API Contract: REST + SSE

Base URL: `/api/v1`  
Content types: `application/json` para REST y `text/event-stream` para SSE

## Common Types

```ts
type ResponseSlot = 'openai' | 'google' | 'minimax' | 'qwen';
type ResponseRole = 'base' | 'consolidator';
type ResponseStatus = 'pending' | 'running' | 'completed' | 'failed';
type TurnStatus = 'pending' | 'running' | 'partial' | 'completed' | 'failed';

type ApiError = {
  code: string;
  message: string;
  requestId: string;
  fieldErrors?: Record<string, string[]>;
};
```

## ConversationSummary

```json
{
  "id": "uuid",
  "title": "Título",
  "hasWorkInProgress": true,
  "createdAt": "2026-07-26T20:00:00.000Z",
  "updatedAt": "2026-07-26T20:00:01.000Z"
}
```

`hasWorkInProgress=true` si existe cualquier turno o slot de esa conversación en
`pending` o `running`. `failed`, `partial` y `completed` no cuentan como trabajo.

## ModelResponse

```json
{
  "slot": "openai",
  "role": "base",
  "provider": "openai",
  "model": "configured-model",
  "status": "completed",
  "content": "respuesta completa",
  "error": null,
  "recoverable": false,
  "continuedWithout": false,
  "isStale": false,
  "attemptNo": 1,
  "metadata": {
    "durationMs": 820,
    "contextWindow": {
      "truncated": true,
      "firstIncludedOrdinal": 4,
      "lastIncludedOrdinal": 9,
      "protectionApplied": "turn-window-and-truncate"
    }
  },
  "startedAt": "2026-07-26T20:00:00.000Z",
  "completedAt": "2026-07-26T20:00:01.000Z"
}
```

Rules:

- `content` es requerido cuando `status=completed`.
- `error` solo contiene código/mensaje seguro.
- `recoverable` refleja exclusivamente la clasificación canónica del contrato
  LLM; `true` habilita Retry manual y nunca dispara retry automático.
- `continuedWithout=true` solo aplica a un slot base fallido y lo excluye
  permanentemente de retry en ese turno.
- `isStale=true` identifica una consolidación Qwen obsoleta y nunca vigente.
- `attemptNo` permite ignorar una actualización tardía de un intento anterior.
- Si `contextWindow.truncated=true`, UI comunica que se usó una ventana acotada.
  `protectionApplied` solo expone el tipo de protección técnica; no proyecta
  mensajes, estimaciones, límites, presupuesto ni contabilidad de tokens.

## Turn

```json
{
  "id": "uuid",
  "clientRequestId": "uuid",
  "ordinal": 1,
  "prompt": "mensaje",
  "status": "running",
  "responses": [],
  "createdAt": "2026-07-26T20:00:00.000Z",
  "updatedAt": "2026-07-26T20:00:00.000Z"
}
```

`responses` siempre contiene los cuatro slots para mantener tabs estables.

## Idempotency Rules

- `clientRequestId` es UUID requerido en ambos endpoints de creación.
- El cliente genera un ID una vez por submit lógico y lo reutiliza para cualquier
  repetición HTTP de ese submit.
- Repetir el mismo ID y prompt devuelve el recurso original sin crear filas ni
  invocar providers.
- Si el mismo ID se reutiliza con otro prompt, backend devuelve
  `409 CLIENT_REQUEST_ID_CONFLICT`; no crea ni modifica datos.
- Replay se resuelve antes de validar busy.

## Endpoints

### POST /conversations

Crea conversación, título, primer turno y cuatro slots atómicamente.
El título inicial aplica `trim` al prompt y toma sus primeros 80 grapheme
clusters Unicode completos.

Request:

```json
{
  "clientRequestId": "uuid",
  "prompt": "texto no vacío"
}
```

Response inicial o replay: `202 Accepted`

```json
{
  "conversation": {},
  "turn": {}
}
```

Dos requests simultáneos con el mismo ID reciben el mismo recurso; solo uno inicia
orquestación.

SC-010 exige `202` en menos de un segundo en al menos el 95% de ejecuciones del
conjunto local controlado con providers fake.

### GET /conversations

Query:

- `cursor`: cursor opaco opcional.

El tamaño lo define `CONVERSATION_SIDEBAR_PAGE_SIZE`.

Response `200`:

```json
{
  "items": [],
  "nextCursor": "opaque-or-null"
}
```

Items son `ConversationSummary`, ordenados por `updatedAt DESC, id DESC`.

### GET /conversations/:conversationId

Devuelve `ConversationSummary`/detalle sin cargar turnos.

Missing: `404 CONVERSATION_NOT_FOUND`.

### PATCH /conversations/:conversationId

Request:

```json
{"title": "texto libre de 1 a 80 grapheme clusters Unicode después de trim"}
```

`trim` es la única transformación de negocio; no se aplica normalización Unicode
adicional. El backend segmenta con `Intl.Segmenter` y `granularity: "grapheme"`,
valida el resultado y lo persiste literalmente, sin eliminar, reemplazar ni
escapar caracteres especiales; la consulta de persistencia debe ser
parametrizada. El contador frontend y el truncado inicial usan la misma unidad.
El escape corresponde exclusivamente a la capa de renderizado, que muestra el
título como texto y nunca como HTML.

Response: `200 ConversationSummary`.

Título inválido: `422 VALIDATION_ERROR`.

### DELETE /conversations/:conversationId

El backend evalúa busy dentro de la transacción:

- con cualquier turno/slot `pending`/`running`: `409 CONVERSATION_BUSY`, sin
  eliminar datos;
- sin busy: `204 No Content`.

Delete hace cascade cuando es aceptado. La UI confirma antes de llamar, deshabilita
Delete mientras `hasWorkInProgress=true` y mantiene Rename habilitado.

### GET /conversations/:conversationId/turns

Query:

- `before`: cursor opaco opcional; se omite para el bloque reciente.

Response `200`:

```json
{
  "items": [],
  "olderCursor": "opaque-or-null",
  "hasOlder": true
}
```

Cada página contiene hasta tres turnos completos en orden cronológico. SC-010
exige que el primer bloque responda en menos de un segundo en al menos el 95% de
ejecuciones del conjunto controlado.

### POST /conversations/:conversationId/turns

Request:

```json
{
  "clientRequestId": "uuid",
  "prompt": "texto no vacío"
}
```

Response inicial o replay: `202 Accepted`

```json
{
  "conversation": {},
  "turn": {}
}
```

Order:

1. buscar replay por `(conversationId, clientRequestId)`;
2. si existe con el mismo prompt, devolverlo;
3. si es un ID nuevo y existe cualquier turno/slot `pending`/`running`, devolver
   `409 CONVERSATION_BUSY`;
4. si no hay busy, crear el siguiente turno/cuatro slots.

La exclusión es por conversación; no afecta navegación ni procesamiento de otras.

### GET /conversations/:conversationId/turns/:turnId

Response `200`:

```json
{
  "conversation": {
    "id": "uuid",
    "hasWorkInProgress": true
  },
  "turn": {}
}
```

Es una lectura puntual del estado persistido para detalle, reapertura y
convergencia final. No sustituye al stream SSE del turno activo ni se usa como
mecanismo de actualización en tiempo real.

### GET /conversations/:conversationId/turns/:turnId/events

Stream SSE de un turno. Valida que el turno pertenezca a la conversación antes de
abrir la respuesta.

Headers `200`:

```http
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

Al conectar o reconectar, el backend registra primero el listener del publicador
y guarda sus eventos en un buffer efímero por conexión mientras lee PostgreSQL.
Luego emite el snapshot vigente como cuatro `slot_update`, un `turn_update` y un
`busy_update`, descarta del buffer los eventos ya representados por el snapshot
según `updatedAt` y `attemptNo`, entrega los posteriores en orden de publicación
y pasa al envío en vivo. Los `runtimeStage` efímeros solo se entregan para slots
que continúan persistidos `running`. Este endpoint es el único mecanismo de
actualización en tiempo real de v1. Puede cerrar únicamente después de drenar el
buffer cuando el estado más reciente proyectado sea terminal y
`hasWorkInProgress=false`.

Eventos mínimos:

```text
event: slot_update
data: {"conversationId":"uuid","turnId":"uuid","response":{"slot":"openai","status":"running","attemptNo":1,"updatedAt":"..."},"runtimeStage":"pensando"}

event: turn_update
data: {"conversationId":"uuid","turn":{"id":"uuid","status":"running","updatedAt":"..."}}

event: busy_update
data: {"conversationId":"uuid","turnId":"uuid","hasWorkInProgress":true,"updatedAt":"..."}
```

Rules:

- `slot_update.response` usa el mismo `ModelResponse` normalizado de REST e
  incluye contenido/error final cuando exista.
- `runtimeStage` es opcional y efímero; nunca sustituye `response.status` ni se
  persiste. No se transmiten tokens de texto incrementalmente.
- `turn_update` refleja el agregado persistido.
- `busy_update` siempre es un evento propio; frontend no lo deduce de
  `turn_update`.
- IDs, `updatedAt` y `attemptNo` permiten aplicar snapshots de forma idempotente e
  ignorar actualizaciones anteriores.
- El buffer de apertura existe solo durante esa conexión y se descarta al
  desconectar; no agrega replay durable ni soporte para `Last-Event-ID`.
- No hay log de eventos, IDs durables ni contrato `Last-Event-ID`. Una conexión
  nueva converge mediante su snapshot inicial.
- Al recibir turno terminal y `busy_update=false`, frontend cierra `EventSource`;
  backend también puede cerrar la respuesta.
- Si la conexión falla, UI muestra un error de actualización en tiempo real y
  solo puede restablecer este endpoint SSE. V1 no activa polling, long polling,
  WebSockets ni otro fallback.

Missing o mismatch antes de abrir: `404 TURN_NOT_FOUND`.

### POST /conversations/:conversationId/turns/:turnId/responses/:slot/retry

Solo acepta un slot `failed`, `recoverable=true` y, para slots base,
`continuedWithout=false`. Qwen conserva el retry individual definido por FR-011
y nunca ejecuta bases.

Response aceptado: `202 Accepted`, conversación/turno actualizados.

Rules:

- es manual y ejecuta una vez solo el slot solicitado;
- no hay retries automáticos adicionales;
- transición atómica `failed → pending`;
- si existe trabajo activo en otro turno de la conversación, responde
  `409 CONVERSATION_BUSY`;
- si el mismo slot ya está `pending`/`running`, responde
  `409 RESPONSE_RETRY_IN_PROGRESS`;
- si el slot no es elegible o tiene Continue-without, responde
  `409 RESPONSE_NOT_RETRYABLE`;
- retry Qwen nunca ejecuta bases;
- retry base fallido no invoca Qwen ni invalida consolidación vigente;
- retry base exitoso marca Qwen stale e inicia una nueva consolidación;
- Qwen exitoso reemplaza contenido stale.

La UI no llama este endpoint mientras cualquier turno/slot de la conversación
esté `pending`/`running`.

### POST /conversations/:conversationId/turns/:turnId/responses/:slot/continue-without

Solo para slot base `failed`.

Request body: ninguno.

Response: `200`, conversación/turno actualizados con `continuedWithout=true`.

Persiste la decisión, no invoca providers ni crea trabajo `pending`/`running`.
Es irreversible en v1: el slot deja de ser elegible para retry y Qwen lo omite
permanentemente en cualquier consolidación del turno. Qwen no admite esta acción.

## Failure UI Contract

Cuando un slot base falla por primera vez con `recoverable=true`:

1. `slot_update` proyecta `failed`, `recoverable=true`;
2. UI muestra Retry y Continue-without sin esperar otro intento;
3. si `busy_update` mantiene true por otros slots, Retry queda visible disabled;
4. Continue-without puede ejecutarse porque no emite trabajo;
5. cuando busy queda false, Retry se habilita si el slot sigue siendo elegible;
6. antes de Continue-without, UI confirma que la decisión es permanente y que el
   slot no podrá reintentarse.

Cuando falla con `recoverable=false`, la UI no muestra Retry y conserva
Continue-without. Esta acción depende de `status=failed`, no cambia
`recoverable` y permanece irreversible.

## Busy UI Contract

Cuando `busy_update` informa `hasWorkInProgress=true` para la conversación:

- Enviar está disabled;
- todos sus botones Retry están disabled;
- Delete está disabled con explicación contextual;
- Rename permanece enabled;
- aparece un indicador textual de procesamiento;
- navegación a otras conversaciones sigue disponible.

Cuando `busy_update` informa false, Enviar y retries elegibles se habilitan aunque
el turno terminal sea `failed` o `partial`. Los estados locales de mutación
previenen doble click antes del primer evento; backend conserva la regla canónica.

## Startup Behavior

Configuración requerida ausente impide escuchar y solo identifica la variable.
Después de validar entorno, recovery termina slots `pending`/`running`, recalcula
turnos/busy y no relanza providers.

## Error Codes

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `INVALID_JSON` | JSON inválido |
| 400 | `INVALID_CURSOR` | Cursor inválido |
| 404 | `CONVERSATION_NOT_FOUND` | Conversación inexistente |
| 404 | `TURN_NOT_FOUND` | Turno inexistente o ajeno |
| 404 | `RESPONSE_NOT_FOUND` | Slot inexistente |
| 409 | `CLIENT_REQUEST_ID_CONFLICT` | ID repetido con prompt distinto |
| 409 | `CONVERSATION_BUSY` | Crear trabajo o eliminar mientras la conversación está busy |
| 409 | `RESPONSE_NOT_RETRYABLE` | Slot no es fallido recuperable o tiene Continue-without |
| 409 | `RESPONSE_RETRY_IN_PROGRESS` | Mismo slot ya pending/running |
| 409 | `CONTINUE_WITHOUT_NOT_ALLOWED` | Slot no es base fallido |
| 422 | `VALIDATION_ERROR` | Validación Zod fallida |
| 500 | `INTERNAL_ERROR` | Falla inesperada saneada |

Errores de provider se persisten dentro del slot afectado; no eliminan respuestas
exitosas ni convierten SSE en error HTTP del comando REST.
`INVALID_PROMPT_SIZE` es un código seguro de error de slot, no un error HTTP del
endpoint SSE.

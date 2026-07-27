# REST API Contract

Base URL: `/api/v1`  
Content type: `application/json`

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
  "metadata": {
    "durationMs": 820,
    "contextWindow": {
      "truncated": true,
      "firstIncludedOrdinal": 4,
      "lastIncludedOrdinal": 9
    }
  },
  "startedAt": "2026-07-26T20:00:00.000Z",
  "completedAt": "2026-07-26T20:00:01.000Z"
}
```

Rules:

- `content` es requerido cuando `status=completed`.
- `error` solo contiene código/mensaje seguro.
- `recoverable=true` habilita una acción manual; nunca dispara retry automático.
- `continuedWithout=true` solo aplica a un slot base fallido.
- `isStale=true` identifica una consolidación Qwen obsoleta y nunca vigente.
- Si `contextWindow.truncated=true`, UI comunica que se usó una ventana acotada.
  No representa presupuesto, estimación ni límite de tokens por modelo.

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
{"title": "texto libre de 1 a 80 caracteres después de trim"}
```

Response: `200 ConversationSummary`.

Título inválido: `422 VALIDATION_ERROR`.

### DELETE /conversations/:conversationId

Response: `204 No Content`.

Delete hace cascade. La UI confirma antes de llamar este endpoint.

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

Frontend consulta mientras `hasWorkInProgress=true`. La cadencia no es regla de
producto.

### POST /conversations/:conversationId/turns/:turnId/responses/:slot/retry

Solo para un slot `failed` y recuperable.

Response aceptado: `202 Accepted`, conversación/turno actualizados.

Rules:

- es manual y ejecuta una vez solo el slot solicitado;
- no hay retries automáticos adicionales;
- transición atómica `failed → pending`;
- si existe trabajo activo en otro turno de la conversación, responde
  `409 CONVERSATION_BUSY`;
- si el mismo slot ya está `pending`/`running`, responde
  `409 RESPONSE_RETRY_IN_PROGRESS`;
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
Qwen no admite esta acción.

## First Recoverable Failure UI Contract

Cuando un slot base falla por primera vez:

1. el polling proyecta inmediatamente `failed`, `recoverable=true`;
2. UI muestra Retry y Continue-without sin esperar otro intento;
3. si la conversación sigue busy por otros slots, Retry queda visible disabled;
4. Continue-without puede ejecutarse porque no emite trabajo;
5. cuando busy queda false, Retry se habilita si el slot sigue siendo elegible.

## Busy UI Contract

Mientras `hasWorkInProgress=true` para la conversación seleccionada:

- Enviar está disabled;
- todos sus botones Retry están disabled;
- aparece un indicador textual de procesamiento;
- navegación a otras conversaciones sigue disponible.

Cuando queda false, Enviar y retries elegibles se habilitan aunque el turno
terminal sea `failed` o `partial`. Los estados locales de mutación también
previenen doble click antes de recibir el busy del servidor.

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
| 409 | `CONVERSATION_BUSY` | ID nuevo mientras hay trabajo en la conversación |
| 409 | `RESPONSE_NOT_RETRYABLE` | Slot no es fallido recuperable |
| 409 | `RESPONSE_RETRY_IN_PROGRESS` | Mismo slot ya pending/running |
| 409 | `CONTINUE_WITHOUT_NOT_ALLOWED` | Slot no es base fallido |
| 422 | `VALIDATION_ERROR` | Validación Zod fallida |
| 500 | `INTERNAL_ERROR` | Falla inesperada saneada |

Errores de provider se persisten dentro del slot afectado; no eliminan respuestas
exitosas ni convierten polling en error HTTP.

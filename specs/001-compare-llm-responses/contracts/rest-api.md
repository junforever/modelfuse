# REST API Contract

Base URL: `/api/v1`  
Content type: `application/json`

## Common Types

```ts
type ResponseSlot = 'base-1' | 'base-2' | 'base-3' | 'consolidator';
type ResponseStatus = 'pending' | 'running' | 'completed' | 'failed';
type TurnStatus = 'pending' | 'running' | 'partial' | 'completed' | 'failed';

type ApiError = {
  code: string;
  message: string;
  requestId: string;
  fieldErrors?: Record<string, string[]>;
};
```

`ModelResponse`:

```json
{
  "slot": "base-1",
  "role": "base",
  "provider": "configured-provider",
  "model": "configured-model",
  "status": "completed",
  "content": "respuesta",
  "error": null,
  "usage": {"inputTokens": 0, "outputTokens": 0, "totalTokens": 0, "cost": null},
  "metadata": {"durationMs": 0, "contextTruncated": false},
  "startedAt": "2026-07-24T20:00:00.000Z",
  "completedAt": "2026-07-24T20:00:01.000Z"
}
```

`Turn`:

```json
{
  "id": "uuid",
  "ordinal": 1,
  "prompt": "mensaje",
  "status": "running",
  "responses": [],
  "createdAt": "2026-07-24T20:00:00.000Z",
  "updatedAt": "2026-07-24T20:00:00.000Z"
}
```

## Endpoints

### POST /conversations

Creates a conversation and its first turn atomically.

Request:

```json
{"clientRequestId": "uuid", "prompt": "texto no vacío"}
```

Response: `202 Accepted`, `{ "conversation": ConversationSummary, "turn": Turn }`.

### GET /conversations

Query: `limit` (default 30, max 100), optional opaque `cursor`.

Response `200`:

```json
{"items": [{"id": "uuid", "title": "Título", "createdAt": "...", "updatedAt": "..."}], "nextCursor": null}
```

Ordering is `updatedAt DESC, id DESC`.

### GET /conversations/:conversationId

Response: `200`, conversation summary plus turns ordered by ordinal and all four
response slots. Missing conversation: `404 CONVERSATION_NOT_FOUND`.

### PATCH /conversations/:conversationId

Request: `{ "title": "1 a 80 caracteres" }`.

Response: `200`, updated `ConversationSummary`. Invalid title: `422
VALIDATION_ERROR`.

### DELETE /conversations/:conversationId

Response: `204 No Content`. Deletion cascades to turns and responses. Active
provider calls are cancelled best-effort; late results are discarded.

### POST /conversations/:conversationId/turns

Request:

```json
{"clientRequestId": "uuid", "prompt": "texto no vacío"}
```

Response: `202`, `{ "turn": Turn }`. Repeating the same `clientRequestId` returns
the original turn. A different request while a turn is active returns `409
TURN_IN_PROGRESS`.

### GET /conversations/:conversationId/turns/:turnId

Response: `200`, `Turn`. While any slot is non-terminal, response includes
`Retry-After: 1`.

### POST /conversations/:conversationId/turns/:turnId/responses/:slot/retry

Allowed only when the selected slot is `failed`.

Response: `202`, updated `Turn`. Retrying a base slot also resets and reruns the
consolidator after the base finishes. Invalid state: `409 RESPONSE_NOT_RETRYABLE`.

## Error Codes

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `INVALID_JSON` | Request body is not valid JSON |
| 404 | `CONVERSATION_NOT_FOUND` | Conversation does not exist |
| 404 | `TURN_NOT_FOUND` | Turn does not belong to conversation |
| 409 | `TURN_IN_PROGRESS` | Previous turn is not terminal |
| 409 | `RESPONSE_NOT_RETRYABLE` | Slot is not failed |
| 422 | `VALIDATION_ERROR` | Zod boundary validation failed |
| 429 | `PROVIDER_RATE_LIMITED` | Provider rejected due to rate limit |
| 502 | `PROVIDER_ERROR` | Provider failed without leaking internals |
| 504 | `PROVIDER_TIMEOUT` | Provider exceeded configured timeout |
| 500 | `INTERNAL_ERROR` | Sanitized unexpected failure |

Provider failures are normally represented per slot inside a successful turn
resource rather than failing the polling endpoint.


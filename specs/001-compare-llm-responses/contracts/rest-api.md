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
  "continuedWithout": false,
  "isStale": false,
  "usage": {
    "inputTokens": 0,
    "outputTokens": 0,
    "totalTokens": 0,
    "cost": null
  },
  "metadata": {
    "durationMs": 0,
    "contextTruncated": false,
    "includedTurnOrdinals": [1, 2]
  },
  "startedAt": "2026-07-25T20:00:00.000Z",
  "completedAt": "2026-07-25T20:00:01.000Z"
}
```

Rules:

- `content` is required when status is `completed`.
- Qwen may retain previous `content` with `isStale=true` while refreshing or
  after a refresh error.
- `continuedWithout=true` only applies to a failed base slot.
- Usage contains only values returned by the provider; absent values are omitted.

## Turn

```json
{
  "id": "uuid",
  "ordinal": 1,
  "prompt": "mensaje",
  "status": "partial",
  "responses": [],
  "createdAt": "2026-07-25T20:00:00.000Z",
  "updatedAt": "2026-07-25T20:00:00.000Z"
}
```

`responses` always projects the four slots so the UI can render four stable tabs.

## Endpoints

### POST /conversations

Creates conversation, deterministic title, first turn and four pending slots
atomically.

Request:

```json
{"clientRequestId": "uuid", "prompt": "texto no vacío"}
```

Response: `202 Accepted`

```json
{"conversation": {}, "turn": {}}
```

Repeating the same `clientRequestId` returns the original conversation and turn
without creating duplicates. The controlled acceptance test requires this
endpoint to respond in less than one second without waiting for providers.

### GET /conversations

Query:

- `cursor`: optional opaque cursor.

The page size is fixed by `CONVERSATION_SIDEBAR_PAGE_SIZE`; clients cannot
override it.

Response `200`:

```json
{
  "items": [
    {
      "id": "uuid",
      "title": "Título",
      "createdAt": "2026-07-25T20:00:00.000Z",
      "updatedAt": "2026-07-25T20:00:00.000Z"
    }
  ],
  "nextCursor": "opaque-or-null"
}
```

Ordering is `updatedAt DESC, id DESC`.

### GET /conversations/:conversationId

Returns `ConversationDetail` without turns.

Missing conversation: `404 CONVERSATION_NOT_FOUND`.

### PATCH /conversations/:conversationId

Request:

```json
{"title": "texto libre de 1 a 80 caracteres después de trim"}
```

Backend trims, validates and persists the value with a parameterized query.

Response: `200 ConversationSummary`.

Invalid title: `422 VALIDATION_ERROR`.

### DELETE /conversations/:conversationId

Response: `204 No Content`.

Deletion cascades to turns and responses. Active calls are cancelled best-effort;
late results are discarded if the target response no longer exists.

### GET /conversations/:conversationId/turns

Query:

- `before`: optional opaque cursor. Omit for newest block.

The page size is always three complete turns.

Response `200`:

```json
{
  "items": [],
  "olderCursor": "opaque-or-null",
  "hasOlder": true
}
```

Items are chronological. A page never separates a prompt from its four response
slots. The controlled acceptance test requires the first block to respond in less
than one second.

### POST /conversations/:conversationId/turns

Request:

```json
{"clientRequestId": "uuid", "prompt": "texto no vacío"}
```

Response: `202`, `{ "turn": Turn }`.

Repeating `clientRequestId` returns the existing turn. A different request while
the previous turn is running returns `409 TURN_IN_PROGRESS`.

### GET /conversations/:conversationId/turns/:turnId

Response: `200 Turn`.

While any slot is executing, includes `Retry-After: 1`.

### POST /conversations/:conversationId/turns/:turnId/responses/:slot/retry

Allowed only when the selected slot is `failed`.

Response: `202`, updated `Turn`.

Rules:

- retries only the selected slot;
- retrying Qwen never invokes base providers;
- a failed base retry leaves Qwen unchanged;
- a successful base retry marks Qwen stale and starts one new consolidation;
- a successful Qwen result replaces its previous content and clears stale;
- invalid state returns `409 RESPONSE_NOT_RETRYABLE`.

### POST /conversations/:conversationId/turns/:turnId/responses/:slot/continue-without

Allowed only for a failed base slot.

Request body: none.

Response: `200`, updated `Turn` with `continuedWithout=true` for that slot.

This endpoint persists the user's decision and does not invoke any provider. It is
idempotent. Qwen is not a valid slot for this action.

## Startup Behavior

Missing required environment configuration prevents the HTTP server from
listening. No HTTP error contract applies because startup fails before routes are
available.

After configuration succeeds, recovery marks persisted `pending`/`running`
responses as `failed/interrupted` and recalculates affected turns before the
server accepts requests.

## Error Codes

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `INVALID_JSON` | Invalid JSON body |
| 400 | `INVALID_CURSOR` | Cursor cannot be decoded or validated |
| 404 | `CONVERSATION_NOT_FOUND` | Conversation missing |
| 404 | `TURN_NOT_FOUND` | Turn missing or belongs to another conversation |
| 404 | `RESPONSE_NOT_FOUND` | Slot missing from turn |
| 409 | `TURN_IN_PROGRESS` | Previous turn still executing |
| 409 | `RESPONSE_NOT_RETRYABLE` | Slot is not failed |
| 409 | `CONTINUE_WITHOUT_NOT_ALLOWED` | Slot is not a failed base |
| 422 | `VALIDATION_ERROR` | Zod boundary validation failed |
| 500 | `INTERNAL_ERROR` | Sanitized unexpected failure |

Provider authentication, connectivity, rate-limit and timeout failures normally
appear inside the affected `ModelResponse`, not as failures of the polling
endpoint.

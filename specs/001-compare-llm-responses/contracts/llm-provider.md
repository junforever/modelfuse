# LLM Provider Contract

This backend-owned contract is the only provider variation point consumed by
conversation orchestration.

```ts
type ResponseSlot = 'openai' | 'google' | 'minimax' | 'qwen';

type LlmMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type LlmRequest = {
  requestId: string;
  slot: ResponseSlot;
  messages: LlmMessage[];
  signal: AbortSignal;
};

type LlmUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cost?: number;
  currency?: string;
};

type LlmResult = {
  content: string;
  provider: string;
  model: string;
  startedAt: string;
  completedAt: string;
  usage: LlmUsage;
  metadata: Record<string, string | number | boolean | number[] | null>;
};

interface LlmProvider {
  readonly slot: ResponseSlot;
  readonly provider: string;
  readonly model: string;
  generate(request: LlmRequest): Promise<LlmResult>;
}
```

No output-token or per-model token-budget field belongs to `LlmRequest`.

## Provider Adapters

### OpenAiProvider

- Uses OpenAI Responses API.
- Translates `LlmMessage[]` to the provider input.
- Reads text output and provider usage when present.
- Uses `OPENAI_API_KEY` and `OPENAI_MODEL`.

### GoogleProvider

- Uses Gemini `generateContent`.
- Translates roles to `contents`/`parts` and system instruction.
- Handles empty candidates and prompt feedback as normalized errors.
- Reads usage metadata when present.
- Uses `GEMINI_API_KEY` and `GOOGLE_MODEL`.

### MiniMaxProvider

- Uses MiniMax `POST /v1/text/chatcompletion_v2`.
- Translates messages and reads assistant content from choices.
- Reads usage when present.
- Uses `MINIMAX_API_KEY` and `MINIMAX_MODEL`.

### QwenProvider

- Uses native DashScope text generation.
- Translates messages into DashScope input and reads output choices.
- Reads DashScope usage when present.
- Uses `DASHSCOPE_API_KEY`, `DASHSCOPE_BASE_URL` and `QWEN_MODEL`.

The fact that a provider may also expose a compatibility endpoint does not change
these separate adapters or permit sharing provider payloads.

## Normalization Rules

- Successful content, provider, model and timestamps are required.
- Whitespace-only content is a provider error.
- Usage fields are optional and never inferred by ModelFuse.
- Metadata is JSON-safe and excludes prompts, responses, headers and credentials.
- Every adapter honors `AbortSignal`.
- Provider response types remain inside the adapter.
- Orchestration never checks provider names to alter behavior.

## Error Contract

Adapters throw a normalized error:

```ts
type LlmErrorCode =
  | 'authentication'
  | 'rate_limited'
  | 'timeout'
  | 'content_blocked'
  | 'invalid_response'
  | 'provider_error';

type LlmProviderError = {
  code: LlmErrorCode;
  safeMessage: string;
  provider: string;
  model: string;
  retryable: boolean;
};
```

Rules:

- Raw bodies, headers and credentials never leave the adapter.
- A present but rejected credential maps to `authentication`.
- Timeout uses the shared configured request timeout and cancels Axios.
- Rate-limit and transient connectivity errors may be retryable.
- Content filtering maps to `content_blocked` when the provider exposes that
  distinction.

## Registry

The registry is a literal map:

```ts
Record<ResponseSlot, LlmProvider>
```

It contains one instance for each of `openai`, `google`, `minimax` and `qwen`.
There is no factory hierarchy or common external protocol.

## Context Input

### Base slots

Each base adapter receives:

1. its system instruction;
2. selected prior user prompts and responses from that same slot;
3. the current user message.

### Qwen

Qwen receives:

1. its consolidation system instruction;
2. selected prior user prompts and Qwen responses;
3. the current user message;
4. current completed base responses labeled by slot/model;
5. labels for current base slots that are absent or failed.

It never receives prior OpenAI, Google or MiniMax responses.

## Contract Tests

Each adapter must prove:

- request mapping for system/user/assistant history;
- successful content and usage normalization;
- authentication rejection mapping;
- timeout/cancellation;
- invalid or empty response handling;
- absence of secrets/content in error and metadata objects.

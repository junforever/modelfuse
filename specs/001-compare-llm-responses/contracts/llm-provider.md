# LLM Provider Contract

This is the only provider-specific variation point used by orchestration.

```ts
type LlmMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type LlmRequest = {
  requestId: string;
  slot: 'base-1' | 'base-2' | 'base-3' | 'consolidator';
  messages: LlmMessage[];
  signal: AbortSignal;
  maxOutputTokens: number;
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
  metadata: Record<string, string | number | boolean | null>;
};

interface LlmProvider {
  readonly provider: string;
  readonly model: string;
  generate(request: LlmRequest): Promise<LlmResult>;
}
```

## Rules

- Adapters translate provider payloads and errors; services never import provider
  SDK types.
- `content`, provider, model and timestamps are always present on success.
- Usage fields are optional until supplied by the provider; missing values are not
  guessed after the call.
- Metadata must be JSON-safe and must not include prompts, completions, headers or
  credentials.
- Errors map to stable internal codes (`rate_limited`, `timeout`,
  `authentication`, `content_blocked`, `provider_error`) with a safe user message.
- Every adapter honors `AbortSignal` when its client supports cancellation.
- Slot-to-provider mapping and credentials come from validated environment
  configuration.

## Registry

The registry is a simple map from the four configured slots to adapter instances.
Adding a provider means implementing this contract and adding configuration plus
contract tests; no factory hierarchy or provider-specific branches in
`TurnOrchestrator` are allowed.

## Consolidator Input

The consolidator receives:

1. its system instruction;
2. selected prior user prompts and consolidated responses;
3. the current user prompt;
4. current completed base results, clearly labeled by slot/model;
5. labels for base slots that failed or timed out.

It never receives prior base-model responses.

# Provider Adapter Contract

This contract is normative for the provider registry and all five adapters. It refactors the existing provider-neutral boundary; it does not create a second orchestration path.

## Closed identifiers

```ts
type ProviderId = 'openai' | 'google' | 'minimax' | 'qwen' | 'openrouter';
type CanonicalSlot = 'base-1' | 'base-2' | 'base-3' | 'consolidator';
```

Provider identifiers select an adapter. Slots express orchestration roles. They are never interchangeable.

## Immutable deployment input

```ts
interface ConversationDeploymentSnapshot {
  readonly slot: CanonicalSlot;
  readonly deploymentId: string;
  readonly providerId: ProviderId;
  readonly modelId: string;
  readonly displayName: string;
  readonly contextLimitTokens: number;
  readonly maxOutputTokens: number;
  readonly inputModalities: readonly string[];
  readonly outputModalities: readonly string[];
}
```

The snapshot is resolved and persisted before provider execution. An adapter must use the snapshot it receives and must not read the current catalog to replace any field.

## Provider interface

```ts
interface LlmProvider {
  readonly providerId: ProviderId;

  measureInputTokens(
    deployment: ConversationDeploymentSnapshot,
    messages: readonly LlmMessage[]
  ): Promise<number>;

  generate(request: {
    readonly slot: CanonicalSlot;
    readonly deployment: ConversationDeploymentSnapshot;
    readonly messages: readonly LlmMessage[];
    readonly signal?: AbortSignal;
  }): Promise<LlmResult>;
}
```

`LlmResult` retains the current normalized content, timing, `inputTokens`, `outputTokens`, and `totalTokens` fields. No OpenRouter-specific metrics, prices, credits, billing fields, budgets, fallbacks, or upstream payloads may cross this boundary.

## Registry

```ts
type ProviderRegistry = Readonly<Partial<Record<ProviderId, LlmProvider>>>;
```

- The registry factory creates an adapter only when its optional credential is non-empty.
- Existing base URLs and request timeouts remain infrastructure configuration where already supported.
- OpenRouter always uses its normative fixed endpoint and has no URL override.
- Catalog availability is `registry[deployment.providerId] !== undefined`.
- A missing adapter is a deployment-availability error, never a runtime fallback instruction.

## Exact output limit mapping

Every request sends `deployment.maxOutputTokens` unchanged. No adapter clamps, negotiates, reduces, or retries the value.

| Provider   | Native request field               |
| ---------- | ---------------------------------- |
| OpenAI     | `max_completion_tokens`            |
| Google     | `generationConfig.maxOutputTokens` |
| MiniMax    | `max_completion_tokens`            |
| Qwen       | `parameters.max_tokens`            |
| OpenRouter | `max_tokens`                       |

If a provider rejects the value, the attempt is normalized as non-recoverable `provider_error` using the adapter's normal structured status/error mapping. The orchestrator must not retry automatically.

## OpenRouter request

```http
POST https://openrouter.ai/api/v1/chat/completions
Authorization: Bearer <OPENROUTER_API_KEY>
Content-Type: application/json
```

```json
{
  "model": "<snapshot.modelId>",
  "messages": [],
  "max_tokens": 32768
}
```

The numeric example represents the exact selected snapshot value, not a default enforced by the adapter. One provider request is allowed per generation attempt.

## OpenRouter error normalization

Classification uses HTTP status and only the structured response fields named below.

| Condition                                                                  | Normalized category        | Recoverable                  |
| -------------------------------------------------------------------------- | -------------------------- | ---------------------------- |
| HTTP 401                                                                   | `authentication`           | no                           |
| HTTP 429                                                                   | `rate_limited`             | per existing recovery policy |
| HTTP 408, 502, or 503                                                      | `provider_transient_error` | per existing recovery policy |
| HTTP 402                                                                   | `provider_error`           | no                           |
| `error.metadata.error_type` equals `content_policy_violation` or `refusal` | `content_blocked`          | no                           |
| HTTP 403 and non-empty `error.metadata.reasons` array                      | `content_blocked`          | no                           |
| HTTP 403 and non-empty `error.metadata.patterns` array                     | `content_blocked`          | no                           |
| Any other HTTP 403                                                         | `provider_error`           | no                           |
| Any output-limit rejection not covered above                               | `provider_error`           | no                           |

Free-text message, detail, description, code text, headers, or serialized-body matching is forbidden. Structured fields used only for classification are not persisted or returned to clients.

## Contract-test obligations

Provider contract tests must prove:

1. each adapter receives an arbitrary canonical slot without changing provider selection;
2. the snapshot `modelId` and exact normative output-limit value reach the native request field;
3. normalized token metrics preserve current names and meanings;
4. an output-limit rejection produces one `provider_error` and one upstream call;
5. the complete OpenRouter error table, including negative cases where free text resembles a policy error;
6. cancellation and timeouts preserve the existing normalized recovery semantics;
7. catalog and upstream-only metadata never appear in normalized results.

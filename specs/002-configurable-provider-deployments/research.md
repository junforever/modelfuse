# Research: Configurable Provider Deployments

All implementation unknowns are resolved and no open decision remains.

## Decision 1: Keep one static typed deployment catalog in backend infrastructure

**Decision**: Store exactly fifteen readonly deployment definitions in `apps/backend/src/infrastructure/llm/deploymentCatalog.ts`. The original ten definitions remain unchanged and the five approved OpenRouter `:free` chat deployments are appended. A service filters them by adapters present in the provider registry and sorts the safe DTOs by `displayName`.

**Rationale**: The feature explicitly forbids dynamic discovery. A typed constant is the smallest implementation, makes exact values reviewable, and keeps credentials outside catalog responses. Catalog eligibility remains limited to chat models whose declared output modality is `text`, because every slot executes through `/chat/completions` and expects normalized text output.

**Evidence**: OpenRouter official endpoint evidence was retrieved on 2026-09-24 from `https://openrouter.ai/api/v1/models/<model-id>/endpoints` for the five added model IDs. OpenRouter declares `nvidia/nemotron-3-embed-1b:free` as `text -> embeddings`; it is explicitly excluded because the current slots and `/chat/completions` require text output. This amendment does not introduce embeddings support.

**Alternatives considered**: Database-managed catalog and provider startup discovery were rejected because they add mutable state or external I/O contrary to the normative brief. Frontend-owned definitions were rejected because availability and trust-boundary validation belong to the backend. Runtime OpenRouter discovery and automatic free routing were rejected because the catalog uses exact static IDs. Adding the embedding model was rejected because its output contract is incompatible with chat slots.

## Decision 2: Make `LlmProvider` a provider adapter, not a slot-bound model instance

**Decision**: Key the registry by `providerId`. Pass a resolved immutable deployment snapshot to adapter measurement and generation. Keep slot semantics in orchestration only.

**Rationale**: The current registry binds `openai`, `google`, `minimax`, and `qwen` directly to slots and models. Passing a deployment is the minimum refactor that lets any deployment execute in any canonical slot without provider branches.

**Alternatives considered**: Creating one adapter instance per deployment was rejected because it duplicates credentials/clients and keeps the registry model-indexed. Adding provider switches in `TurnOrchestrator` was rejected by the constitution and spec.

## Decision 3: Use the current native output-limit fields

**Decision**:

| Adapter                     | Request field                      |
| --------------------------- | ---------------------------------- |
| OpenAI Chat Completions     | `max_completion_tokens`            |
| Google GenerateContent      | `generationConfig.maxOutputTokens` |
| MiniMax Chat Completion v2  | `max_completion_tokens`            |
| Qwen DashScope native API   | `parameters.max_tokens`            |
| OpenRouter Chat Completions | `max_tokens`                       |

`maxOutputTokens` is optional. When absent, the adapter omits the corresponding native field and the provider chooses its default. When present, it must be a positive integer and the native field receives the exact snapshot value. No adapter clamps, negotiates, discovers, substitutes, or retries the value.

**Rationale**: Official OpenAI documentation marks `max_tokens` deprecated in favor of `max_completion_tokens`; Google defines `maxOutputTokens` under `generationConfig`; MiniMax marks `max_tokens` deprecated in favor of `max_completion_tokens`; Alibaba documents `max_tokens` inside the native HTTP `parameters` object. OpenRouter uses `max_tokens`. Sources: [OpenAI Chat Completions](https://developers.openai.com/api/reference/cli/resources/chat/subresources/completions/methods/create), [Google GenerateContent](https://ai.google.dev/api/generate-content), [MiniMax Text Generation](https://platform.minimax.io/docs/api-reference/text-post), [Qwen DashScope API](https://help.aliyun.com/en/model-studio/qwen-api-via-dashscope), and [OpenRouter Chat Completions](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request). The immutable snapshot preserves the choice to delegate when the value is absent, but the provider default may change externally, so exact output-limit reproducibility is not guaranteed.

**Alternatives considered**: A generic `max_tokens` payload shared by all adapters was rejected because direct adapters retain native protocols. Emitting `null`, `undefined`, or `0` for absence was rejected because omission is the cross-boundary contract. Context7 lookup was attempted, but its configured OAuth token was expired for part of the lookup; the decisions above were verified directly against official provider documentation instead.

## Decision 4: Persist snapshots in a dedicated immutable conversation table

**Decision**: Create `conversation_deployments` with scalar deployment fields and PostgreSQL `text[]` modality columns. Store absent `maxOutputTokens` as SQL `NULL`; constrain it to a positive integer when present. Enforce `(conversation_id, slot)` primary key, `(conversation_id, deployment_id)` uniqueness, canonical-slot and limit checks, non-empty modality arrays, cascade delete, and a trigger rejecting updates.

**Rationale**: One row per slot matches the normative entity, supports direct joins and constraints, and lets the database enforce atomic uniqueness and immutability. Native arrays match the fixed string-list shape without JSON parsing.

**Alternatives considered**: A JSONB blob on `conversations` was rejected because it weakens per-slot keys and uniqueness. Re-resolving the static catalog for later turns was rejected because snapshots must survive catalog/config changes. Copying only deployment IDs was rejected because limits, modalities, provider, model, and display name must be immutable.

## Decision 5: Split Liquibase changes by the existing owning modules

**Decision**: The snapshot table belongs to `db/changelogs/conversations`; `model_responses` constraint replacement belongs to `db/changelogs/messages`. Each module changelog includes one deterministic `002` formatted-SQL file.

**Rationale**: This follows existing module ownership and constitution principle VI. The master already includes conversations before messages, so the new table exists before message execution uses its contract.

**Alternatives considered**: A new generic deployments module was rejected because the only persisted deployment entity is conversation-owned. Editing initial migrations was rejected because schema evolution must remain deterministic and reviewable.

## Decision 6: Perform no compatibility migration or aliasing

**Decision**: Replace message slot checks with only `base-1`, `base-2`, `base-3`, and `consolidator`. Do not update old rows, translate old SSE/API values, or accept aliases. The migration target is a clean database.

**Rationale**: The brief explicitly removes old slot identifiers and excludes backfill/conversion while still requiring schema migration.

**Alternatives considered**: Transitional dual-slot checks, compatibility views, and data rewrite were rejected as prohibited behavior and unnecessary complexity.

## Decision 7: Resolve and persist assignment in the existing creation transaction

**Decision**: `ConversationService` resolves explicit/default selections before calling the repository. `ConversationRepository.createConversation` inserts conversation, four snapshots, first turn, and four response rows in one transaction; provider launch happens only after commit. Later turn creation reads snapshots inside its own transaction. An idempotent replay returns the original snapshots and never mutates them.

**Rationale**: This preserves existing idempotency and guarantees that duplicate/unavailable/default failures create no rows and call no providers.

**Alternatives considered**: Persisting snapshots after the first turn or in a second transaction was rejected because provider work could begin without a durable assignment. Revalidating against the mutable catalog for later turns was rejected by immutability.

## Decision 8: Use explicit REST envelopes and ordered snapshot summaries

**Decision**: Catalog response is `{ items: DeploymentCatalogItem[] }`. Creation/detail expose `deployments` as an ordered four-element array containing slot plus the four public snapshot fields. `DEFAULT_PROFILE_UNAVAILABLE` adds only `missingDeploymentIds` to the standard safe error shape.

**Rationale**: The catalog envelope follows current list response conventions. An ordered array matches the existing canonical response tuple and makes the slot explicit without dynamic object keys.

**Alternatives considered**: A raw array was rejected for inconsistency with list APIs. Returning full stored snapshots was rejected because conversation responses require only `deploymentId`, `providerId`, `modelId`, and `displayName` per slot.

## Decision 9: Keep UI selection local to a new-conversation draft

**Decision**: Load the catalog for a draft, preselect the full default only if all four defaults exist, otherwise require four explicit distinct values. Submit `deploymentIds` only for creation. Existing conversations render their stored assignment read-only; the prompt composer remains text-only.

**Rationale**: This implements every UI requirement without inventing partial defaults or mutation controls. Local duplicate blocking improves feedback while backend/DB enforcement remains authoritative.

**Alternatives considered**: Partially defaulting available slots was rejected because the profile is defined as an all-or-nothing exact set. Persisting selection in global/browser state was rejected because assignment becomes server-owned at creation.

## Decision 10: Extend the current test seams and agent ownership

**Decision**: Keep adapter contracts as isolated Vitest tests, use the existing disposable PostgreSQL/Supertest harness for cross-component behavior, and extend existing Playwright fake-provider fixtures. Builders modify production seams only; specialized test runners own tests; auditors review read-only.

**Rationale**: This follows constitution principles VIII/IX and avoids a second test framework or provider sandbox. No test calls a real paid provider.

**Alternatives considered**: End-to-end coverage for every validation permutation was rejected as redundant; the detailed matrix belongs at unit/integration level. Builder-authored tests were rejected by the constitution.

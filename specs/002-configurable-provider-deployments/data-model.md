# Data Model: Configurable Provider Deployments

## Domain value objects

### Canonical slot

Closed ordered set:

1. `base-1` — base response
2. `base-2` — base response
3. `base-3` — base response
4. `consolidator` — consolidated response

`openai`, `google`, `minimax`, and `qwen` are invalid in API, SSE, application types, and persistence. No alias or conversion exists.

### ProviderId

Closed adapter set: `openai`, `google`, `minimax`, `qwen`, `kimi`, `openrouter`. The registry is keyed by this value. A provider can be registered without having an initial catalog deployment.

### Modality

Catalog/snapshot metadata strings. Initial values are `text`, `image`, `video`, `audio`, and `pdf`. They do not enable non-text user input.

## Static Deployment definition

Backend-only immutable configuration, not persisted as a catalog table.

| Field                | Type                           | Rule                                                               |
| -------------------- | ------------------------------ | ------------------------------------------------------------------ |
| `deploymentId`       | string                         | Public, unique, stable; exact normative identifier                 |
| `displayName`        | string                         | Non-blank user-visible label                                       |
| `providerId`         | ProviderId                     | Adapter key                                                        |
| `modelId`            | string                         | Exact upstream model value                                         |
| `contextLimitTokens` | positive integer               | Input limit used by `ContextBuilder`                               |
| `maxOutputTokens`    | optional positive integer      | Exact output limit when present; provider default when absent       |
| `inputModalities`    | non-empty readonly string list | Exact normative metadata                                           |
| `outputModalities`   | non-empty readonly string list | Exact normative metadata; all current entries are text-only output |
| `credentialEnv`      | credential-name enum           | Backend-only availability selector; never serialized               |

Availability is derived from whether the corresponding adapter was created from a configured credential. Definitions are never mutated or discovered from providers.

### Exact current catalog

The static constant contains these sixteen rows. Only the five listed `:free` model IDs are permitted; `:batch`, `latest`, unlisted free variants, other aliases, fallback, substitution, and runtime discovery remain prohibited:

| deploymentId                        | displayName            | providerId   | modelId                           | contextLimitTokens | maxOutputTokens | credentialEnv        |
| ----------------------------------- | ---------------------- | ------------ | --------------------------------- | -----------------: | --------------- | -------------------- |
| `openrouter-minimax-m3`             | MiniMax M3             | `openrouter` | `minimax/minimax-m3`              |             524288 | absent          | `OPENROUTER_API_KEY` |
| `openrouter-minimax-m2.7`           | MiniMax M2.7           | `openrouter` | `minimax/minimax-m2.7`            |             204800 | absent          | `OPENROUTER_API_KEY` |
| `openrouter-qwen-3.8-max`           | Qwen 3.8 Max           | `openrouter` | `qwen/qwen3.8-max`                |            1000000 | absent          | `OPENROUTER_API_KEY` |
| `kimi-k3`                           | Kimi K3                | `kimi`       | `kimi-k3`                         |            1048576 | absent          | `MOONSHOT_API_KEY`   |
| `openrouter-kimi-k3`                | Kimi K3                | `openrouter` | `moonshotai/kimi-k3`              |            1048576 | absent          | `OPENROUTER_API_KEY` |
| `openrouter-glm-5.2`                | GLM 5.2                | `openrouter` | `z-ai/glm-5.2`                    |            1048576 | absent          | `OPENROUTER_API_KEY` |
| `openrouter-deepseek-v4-flash-0731` | DeepSeek V4 Flash 0731 | `openrouter` | `deepseek/deepseek-v4-flash-0731` |            1048576 | absent          | `OPENROUTER_API_KEY` |
| `gemini-3.7-flash`                  | Gemini 3.7 Flash       | `google`     | `gemini-3.7-flash`                |            1048576 | absent          | `GOOGLE_API_KEY`     |
| `openai-5.6-sol`                    | GPT-5.6 Sol            | `openai`     | `gpt-5.6-sol`                     |            1050000 | absent          | `OPENAI_API_KEY`     |
| `openai-5.6-terra`                  | GPT-5.6 Terra          | `openai`     | `gpt-5.6-terra`                   |            1050000 | absent          | `OPENAI_API_KEY`     |
| `openai-5.6-luna`                   | GPT-5.6 Luna           | `openai`     | `gpt-5.6-luna`                    |            1050000 | absent          | `OPENAI_API_KEY`     |
| `openrouter-nemotron-3-ultra-550b-a55b-free` | Nemotron 3 Ultra (Free) | `openrouter` | `nvidia/nemotron-3-ultra-550b-a55b:free` | 1000000 | absent | `OPENROUTER_API_KEY` |
| `openrouter-nemotron-3.5-lightning-free` | Nemotron 3.5 Lightning (Free) | `openrouter` | `nvidia/nemotron-3.5-lightning:free` | 1000000 | absent | `OPENROUTER_API_KEY` |
| `openrouter-qwen-3.8-27b-free`      | Qwen 3.8 27B (Free)   | `openrouter` | `qwen/qwen3.8-27b:free`           |             262144 | absent          | `OPENROUTER_API_KEY` |
| `openrouter-gemma-4-26b-a4b-it-free` | Gemma 4 26B A4B (Free) | `openrouter` | `google/gemma-4-26b-a4b-it:free` |             262144 | absent          | `OPENROUTER_API_KEY` |
| `openrouter-gemma-4-31b-it-free`    | Gemma 4 31B (Free)    | `openrouter` | `google/gemma-4-31b-it:free`      |             262144 | absent          | `OPENROUTER_API_KEY` |

| deploymentId                        | inputModalities                          | outputModalities |
| ----------------------------------- | ---------------------------------------- | ---------------- |
| `openrouter-minimax-m3`             | `text`, `image`, `video`                 | `text`           |
| `openrouter-minimax-m2.7`           | `text`                                   | `text`           |
| `openrouter-qwen-3.8-max`           | `text`, `image`, `video`                 | `text`           |
| `kimi-k3`                           | `text`, `image`, `video`                 | `text`           |
| `openrouter-kimi-k3`                | `text`, `image`, `video`                 | `text`           |
| `openrouter-glm-5.2`                | `text`                                   | `text`           |
| `openrouter-deepseek-v4-flash-0731` | `text`                                   | `text`           |
| `gemini-3.7-flash`                  | `text`, `image`, `video`, `audio`, `pdf` | `text`           |
| `openai-5.6-sol`                    | `text`, `image`                          | `text`           |
| `openai-5.6-terra`                  | `text`, `image`                          | `text`           |
| `openai-5.6-luna`                   | `text`, `image`                          | `text`           |
| `openrouter-nemotron-3-ultra-550b-a55b-free` | `text` | `text` |
| `openrouter-nemotron-3.5-lightning-free` | `text` | `text` |
| `openrouter-qwen-3.8-27b-free`      | `text`, `image`, `video`                 | `text`           |
| `openrouter-gemma-4-26b-a4b-it-free` | `text`, `image`, `video`                | `text`           |
| `openrouter-gemma-4-31b-it-free`    | `text`, `image`, `video`                 | `text`           |

`maxOutputTokens` is absent from all sixteen current rows. API and application objects omit the property rather than emitting `null`, `undefined`, or `0`. The snapshot stores absence as PostgreSQL `NULL`, and the adapter omits the provider-native output-limit field so the provider chooses its default. A future present value must be a positive integer, is copied into the snapshot and sent unchanged, and is never clamped, negotiated, discovered, substituted, or retried. It never affects input admission.

The immutable snapshot preserves the decision to delegate the output limit, not the provider's external default. That default may change, so an absent value does not guarantee exact output-limit reproducibility.

## Deployment assignment

Creation-only value object with exactly four keys and four distinct available `deploymentId` values:

```text
base-1       -> deploymentId
base-2       -> deploymentId
base-3       -> deploymentId
consolidator -> deploymentId
```

If absent, the resolver uses the exact default profile. The resolved form contains four complete snapshot values in canonical order.

## PostgreSQL entity: `conversation_deployments`

One immutable snapshot row per conversation slot.

| Column                 | PostgreSQL type | Null | Rule                                                   |
| ---------------------- | --------------- | ---: | ------------------------------------------------------ |
| `conversation_id`      | `uuid`          |   no | FK to `conversations(id)` with `ON DELETE CASCADE`     |
| `slot`                 | `varchar(16)`   |   no | One of four canonical slots                            |
| `deployment_id`        | `varchar(128)`  |   no | Non-blank stable catalog identifier copied at creation |
| `provider_id`          | `varchar(32)`   |   no | Non-blank adapter key copied at creation               |
| `model_id`             | `varchar(256)`  |   no | Non-blank exact upstream model copied at creation      |
| `display_name`         | `varchar(128)`  |   no | Non-blank user-visible name copied at creation         |
| `context_limit_tokens` | `integer`       |   no | Greater than zero                                      |
| `max_output_tokens`    | `integer`       |  yes | SQL `NULL` when absent; greater than zero when present |
| `input_modalities`     | `text[]`        |   no | Cardinality greater than zero                          |
| `output_modalities`    | `text[]`        |   no | Cardinality greater than zero                          |
| `created_at`           | `timestamptz`   |   no | `now()` on insert                                      |
| `updated_at`           | `timestamptz`   |   no | Same insertion timestamp; never updated                |

### Keys and constraints

- Primary key: `(conversation_id, slot)`.
- Unique constraint: `(conversation_id, deployment_id)`.
- Check: slot belongs to `base-1`, `base-2`, `base-3`, `consolidator`.
- Checks: identifier/name/provider/model strings are non-blank.
- Checks: `context_limit_tokens` is positive; `max_output_tokens` is `NULL` or positive.
- Checks: both modality arrays are non-empty.
- Trigger: every `UPDATE` raises an exception; deletion remains possible only directly or through conversation cascade.

The unique constraint is the final transactional guard for duplicate deployment assignment. The application maps that named constraint to `422 DUPLICATE_DEPLOYMENT_ASSIGNMENT` and rolls back the entire creation transaction.

## Existing entity change: `model_responses`

No new column is required. Existing `provider` and `model` continue to record per-response attribution copied from the conversation snapshot when each turn is inserted.

Replace these checks through a new messages migration:

- `ck_model_responses_slot`: only the four canonical slots.
- `ck_model_responses_slot_role`: `base-1`/`base-2`/`base-3` require `base`; `consolidator` requires `consolidator`.
- `ck_model_responses_stale`: stale content is allowed only for `consolidator`.

No existing row is updated. Applying the constraint migration with old-slot rows present may fail by design because backfill and conversion are out of scope.

## REST projections

### `DeploymentCatalogItem`

Contains all safe definition metadata except `credentialEnv`: `deploymentId`, `displayName`, `providerId`, `modelId`, `contextLimitTokens`, optional `maxOutputTokens`, `inputModalities`, `outputModalities`. The projection omits `maxOutputTokens` when absent.

### `ConversationDeploymentSummary`

Contains `slot`, `deploymentId`, `providerId`, `modelId`, and `displayName`. Exactly four items are returned in canonical order by creation and detail. Limits/modalities remain persisted and available internally but are not required in the conversation projection.

### Internal `ConversationDeploymentSnapshot`

Contains every database snapshot column required for execution. It is passed from repository snapshot reads into orchestration; it is never rebuilt from the static catalog after creation.

## Relationships

```text
conversations (1)
  ├── (4) conversation_deployments
  └── (*) turns
        └── (4) model_responses
```

Every turn response slot corresponds to exactly one conversation snapshot slot. The database does not duplicate a foreign key from `model_responses` to the composite snapshot key; repository creation derives response attribution from the snapshot in the same transaction, and runtime execution reads the conversation snapshots.

## Creation transaction

1. Validate request shape at the HTTP boundary.
2. Resolve explicit/default IDs against the current available static catalog.
3. Reject unavailable or duplicate selection before opening provider work.
4. Begin transaction.
5. Insert `conversations` row or resolve existing idempotent replay.
6. For a new conversation, insert the four snapshot rows in canonical order.
7. Insert first `turns` row.
8. Insert four `model_responses` rows using provider/model attribution from the snapshots.
9. Commit.
10. Read committed conversation/turn/snapshot state.
11. Launch provider attempts.

Any insert or constraint failure rolls back steps 5–8. Replays return their existing snapshots and never apply a new assignment.

## Later turn and retry lifecycle

- Later turn creation locks the conversation, reads its four snapshots, inserts four response rows, and commits before orchestration.
- Orchestration selects a snapshot by canonical slot, then an adapter by its stored `providerId`.
- Context uses stored `contextLimitTokens`; request output omits the native limit field for stored `NULL` and uses the unchanged stored positive `maxOutputTokens` otherwise.
- Retry uses the same stored snapshot and existing recoverability rules.
- Recovery preserves current state transitions and changes only canonical slot literals.
- Catalog/configuration changes never update snapshot rows and never affect existing conversations.

## Deletion

Deleting a conversation cascades to snapshots, turns, and model responses through existing ownership. This is aggregate deletion, not deployment replacement, and does not violate snapshot immutability during the conversation's lifetime.

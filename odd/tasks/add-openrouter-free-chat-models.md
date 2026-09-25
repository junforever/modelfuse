# Add OpenRouter Free Chat Models

## Goal
Add five user-selected OpenRouter free chat models to the static deployment catalog so each can be selected for any of the four existing slots.

## Scope

Included model IDs:

- `nvidia/nemotron-3-ultra-550b-a55b:free`
- `nvidia/nemotron-3.5-lightning:free`
- `qwen/qwen3.8-27b:free`
- `google/gemma-4-26b-a4b-it:free`
- `google/gemma-4-31b-it:free`

Excluded by explicit user decision:

- `nvidia/nemotron-3-embed-1b:free` — OpenRouter declares `text -> embeddings`; the current slots require chat-completions models with text output.

## Authoritative OpenRouter Evidence

Source: `https://openrouter.ai/api/v1/models/<model-id>/endpoints`, retrieved 2026-09-24.

| modelId | contextLimitTokens | inputModalities | outputModalities |
| --- | ---: | --- | --- |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | 1000000 | `text` | `text` |
| `nvidia/nemotron-3.5-lightning:free` | 1000000 | `text` | `text` |
| `qwen/qwen3.8-27b:free` | 262144 | `text`, `image`, `video` | `text` |
| `google/gemma-4-26b-a4b-it:free` | 262144 | `text`, `image`, `video` | `text` |
| `google/gemma-4-31b-it:free` | 262144 | `text`, `image`, `video` | `text` |

All five use `providerId: openrouter`, `credentialEnv: OPENROUTER_API_KEY`, and omit `maxOutputTokens` so the provider chooses its default.

## Tasks

- [x] ODD-001 Add the smallest exact catalog test and observe the intended RED failure.
- [x] ODD-002 Add the five catalog definitions and observe focused GREEN.
- [x] ODD-003 Align normative feature artifacts from ten to fifteen deployments without reopening historical tasks.
- [x] ODD-004 Run strict TypeScript/build verification and independent read-only review.

## TDD Evidence

- RED: focused catalog test exited 1 at `deploymentCatalog.test.ts:7`; expected 15 entries, received 10.
- GREEN: focused catalog test exited 0; 1 file and 1 test passed with all 15 exact definitions.
- Contract alignment: six feature artifacts updated; targeted stale-count/blanket-`:free` searches and scoped `git diff --check` passed.
- Regression/build: backend strict `tsc` build exited 0; `git diff --check` exited 0; independent review PASS with no findings.

## Validation Plan

- Focused unit test: `& .\agent-scripts\run-pnpm.ps1 -- --filter backend run test --run src/infrastructure/llm/__tests__/deploymentCatalog.test.ts`
- Strict backend compile: `& .\agent-scripts\run-pnpm.ps1 -- --filter backend run build`
- `git diff --check`

## Rollback Boundary

Remove the five appended catalog definitions, their five exact expected test entries, and the matching contract-amendment documentation. Existing ten deployments, defaults, adapters, slots, persistence, and UI behavior remain unchanged.

## Commit Evidence

No commit is authorized yet.

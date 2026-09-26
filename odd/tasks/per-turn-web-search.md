# Per-turn Web Search

## Objective

Allow users to enable or disable web search independently for every conversation turn. Only selected deployments that explicitly support web search receive provider-native search tooling; incompatible selected deployments continue normally and are visibly identified.

## Problem and why

Some prompts require current information while others do not. Web access is provider/model-specific and may add latency or cost, so it must be explicit per turn rather than permanently enabled for a conversation or inferred from model names/free status.

## Scope

- Add an explicit immutable `supportsWebSearch` capability to deployment definitions, public catalog entries, and conversation deployment snapshots.
- Correct the OpenRouter Qwen model ID to `qwen/qwen3.8-max-0902`.
- Add a per-turn `webSearchEnabled` request and persisted turn field, defaulting to `false` when omitted.
- Enable OpenRouter's `openrouter:web_search` server tool only when the turn requests it and that deployment supports it.
- Normalize and retain safe URL citations in existing model-response metadata.
- Add a frontend toggle to the right of Send. It remains disabled when none of the selected deployments supports web search and may change on every turn.
- Add a yellow warning triangle and accessible tooltip to selected deployment badges that do not support web search.
- Preserve normal generation for incompatible deployments when a mixed assignment has web search enabled.
- Add focused backend/frontend tests and required persistence coverage.

## Out of scope

- User-configurable search engine, result count, domains, location, or search context size.
- Runtime provider/model discovery on application startup or per request.
- A standalone application-owned search service.
- A separate citations table or independently queryable citation API.
- Spec Kit artifacts.

## Constraints and decisions

- Strict TDD is enabled by the user's request and global `AGENTS.md`: RED → GREEN → TRIANGULATE → REFACTOR.
- Test runners are the existing workspace Vitest scripts, invoked from the repository root through `agent-scripts/run-pnpm.ps1`.
- Node/pnpm commands always use `& .\agent-scripts\run-pnpm.ps1 -- ...`; PostgreSQL/Liquibase tests require the integration preflight first.
- Provider-specific request/response shapes remain inside provider adapters.
- Web search stays part of `LlmProvider.generate`; no optional parallel `webSearch()` method is introduced.
- OpenRouter support is based on official model metadata containing `tools`, not on free/paid status.
- Official evidence: https://openrouter.ai/docs/guides/features/server-tools/web-search and https://openrouter.ai/qwen/qwen3.8-max-0902.
- PostgreSQL remains the source of truth: `turns.web_search_enabled` records turn intent and `conversation_deployments.supports_web_search` records the immutable capability used for that conversation.
- Existing `model_responses.metadata` JSONB stores normalized citations.
- No commits will be created unless the user explicitly requests them.

## Delivery and route

- Route: delegated direct, non-SDD.
- Mapping trigger: fired because the behavior crosses more than four files; completed by `gentle-ai-explore`.
- Writer trigger: fired because both tests and production require multi-file changes; use bounded `gentle-ai-worker` tasks with separate test and production scopes.
- Verification route: writer self-verification followed by native risk assessment and the returned verification plan.
- Forecast: approximately 700–1,000 authored changed lines, primarily tests, contracts, one migration, provider parsing, and UI behavior.
- Delivery strategy: `ask-on-risk`; no commit or PR boundary is currently authorized.

## Tasks

### T1 — Backend RED contracts and persistence tests

- [x] Add focused failing tests for deployment capabilities and the corrected Qwen model ID. Corrected after review so all eleven verified tool-capable OpenRouter deployments are compatible.
- [x] Add failing request/schema, orchestration, and OpenRouter provider contract tests for per-turn web search gating and citation normalization.
- [x] Add failing repository/integration coverage for persisted turn intent and immutable deployment capability snapshots.
- [x] Run focused tests and record the intended RED failures.

Acceptance:
- Tests distinguish omitted/false from true turn intent.
- Tests prove mixed assignments only enable tooling for compatible deployments.
- Tests prove no `tools` field is sent during normal generation.
- Tests prove safe normalized citations and ignore malformed annotations.
- Persistence tests prove historical turn/capability data does not depend on current UI/catalog state.

### T2 — Backend GREEN implementation

- [x] Add backend contract, schema, service, repository, mapper, and orchestration support.
- [x] Add Liquibase changes for turn intent and immutable deployment capability.
- [x] Implement OpenRouter server-tool payload and safe citation normalization.
- [x] Correct Qwen to `qwen/qwen3.8-max-0902` in production definitions.
- [x] Make T1 focused tests green and run backend strict build/typecheck.

Acceptance:
- `webSearchEnabled` defaults to false and is persisted per turn.
- Tooling is passed only when both turn intent and deployment capability are true.
- Unsupported deployments still generate normally.
- Public catalog and stored summaries expose the explicit capability without exposing credentials.
- Provider-specific data does not escape the normalized contracts.

### T3 — Frontend RED interaction tests

- [x] Add failing component/workspace tests for toggle placement, enabled/disabled behavior, per-turn reset/preservation semantics, request forwarding, warning icon, and accessible tooltip.
- [x] Update/add failing frontend schema tests for capability, turn intent, and normalized citations.
- [x] Run focused frontend tests and record intended RED failures.

Acceptance:
- Toggle is immediately to the right of Send in the same row.
- Toggle is disabled and off when no selected deployment supports search.
- At least one compatible selected deployment enables user interaction.
- Users can choose a different toggle state on each turn in one conversation.
- Every incompatible selected deployment has a yellow warning triangle with the agreed tooltip.

### T4 — Frontend GREEN implementation

- [x] Extend frontend API types and Zod schemas.
- [x] Add per-turn workspace state and request forwarding for conversation creation and continuation.
- [x] Add the accessible toggle and incompatible-deployment warning tooltip.
- [x] Make T3 focused tests green and run frontend strict typecheck/lint.

Acceptance:
- The UI reflects immutable stored deployment capabilities for existing conversations.
- A mixed assignment allows enabling search while clearly warning about incompatible deployments.
- Changing the toggle for one turn does not force the same value on later turns.
- Loading/busy behavior cannot submit inconsistent state.

### T6 — Resolve follow-up submission blocker

- [x] Diagnose why a follow-up submission does not call `createTurn` after the first turn completes.
- [x] Add or preserve the focused RED contract at `conversation-continuation.test.tsx:204`.
- [x] Apply the smallest root-cause production correction without weakening duplicate-submit protection.
- [x] Make the focused continuation test and the complete T3 frontend set GREEN.

Acceptance:
- The first turn still calls `createConversation` exactly once.
- A later turn calls `createTurn` exactly once with its independently selected `webSearchEnabled` value.
- Double-click protection remains effective while the request is pending.
- Frontend typecheck and lint remain green.

### T7 — Final review remediation

- [x] Require both request intent and deployment capability at the OpenRouter adapter boundary.
- [x] Reject HTTP(S) citation URLs containing embedded username/password credentials in provider normalization, persisted-metadata mapping, and frontend validation.
- [x] Add a real continuation HTTP/PostgreSQL round-trip proving independent true/false turn choices persist.
- [x] Preserve the approved composer behavior: the toggle keeps its current user-selected value after submission and remains independently changeable before every later turn.

Acceptance:
- Direct adapter tests prove unsupported deployments never receive `openrouter:web_search` even if called with true intent.
- Credential-bearing citation URLs are neither returned, restored from metadata, nor accepted by the frontend schema.
- Continuation persistence verifies successive turn choices without direct row seeding.
- Existing focused and full checks remain green.

### T8 — Direct-provider support and pre-submit warning timing

- [x] Add RED provider/catalog tests for direct GPT-5.6 Sol Responses API web search and direct Kimi K3 `$web_search` flow.
- [x] Add RED persistence coverage for upgrading existing direct GPT-5.6 Sol and Kimi K3 snapshots.
- [x] Add RED frontend tests proving warnings are hidden while search is off and appear immediately on incompatible selected deployments when the toggle is enabled, before submit.
- [x] Implement direct-provider search, correct capability metadata, controlled snapshot migration, and metadata-only warning rendering.
- [x] Reject empty/invalid Kimi built-in tool arguments while preserving valid argument strings exactly.
- [x] Aggregate normalized Kimi usage across the initial tool-call and final continuation responses.
- [x] Run focused GREEN, invalidated regression checks, and independent final review.

Acceptance:
- `openai-5.6-sol` uses OpenAI Responses API with `{ type: "web_search" }` only when requested; normal generation remains on the existing Chat Completions path.
- Direct `kimi-k3` declares Kimi's built-in `$web_search` only when requested and completes its bounded tool-call continuation without application-owned search requests.
- New and existing conversation snapshots for those exact deployment IDs report `supportsWebSearch: true`.
- Warning state is derived only from the selected catalog/snapshot capability metadata; no capability discovery or runtime provider query is added.
- Yellow warnings are absent while web search is off and appear before submit, immediately after enabling the toggle, only on selected incompatible deployments.
- Mixed assignments still send search only to compatible deployments and generate normally for incompatible deployments.

### T5 — Integration and regression verification

- [x] Run integration preflight once before real PostgreSQL/Liquibase tests.
- [x] Run focused backend persistence/API integration tests.
- [x] Run focused frontend integration tests.
- [x] Run applicable backend/frontend full suites and builds once at closure.
- [x] Run `git diff --check` and inspect the final diff.

Acceptance:
- Migration applies cleanly and persisted history round-trips.
- Creation and continuation both retain their own web-search choice.
- Existing conversations and normal non-search generation remain compatible.
- All relevant checks pass or a concrete external blocker is recorded.

## Progress

- ✅ User approved the design and authorized implementation.
- ✅ Created branch `feature/per-turn-web-search` from clean `main`.
- ✅ Verified screenshot and official OpenRouter identifier `qwen/qwen3.8-max-0902`.
- ✅ Verified Qwen 0902 supports tool calling and OpenRouter server tools.
- ✅ Completed read-only repository mapping.
- ✅ T1 backend RED complete after correcting the capability matrix: all eleven current OpenRouter deployments are expected compatible; direct-provider adapters remain unsupported in this feature.
- ✅ Focused unit/contract run produced 8 expected failures with 27 existing tests passing; focused persistence run produced 3 expected failures with 6 existing tests passing.
- ✅ Corrected catalog-only RED rerun: 1 expected failure, exit 1.
- ✅ Integration preflight is ready after fixing its empty-row handling and launching the exact `modelfuse-integration` Compose project.
- ✅ T2 backend GREEN complete: build, 35 focused unit/contract tests, and 9 focused PostgreSQL integration tests pass.
- ✅ Independent backend verification passed with no correctness, security, or data-loss blockers.
- ✅ T3 frontend RED complete after replacing an unintended missing `EventSource` runtime with the repository's controlled fixture pattern.
- ✅ Frontend focused RED: 5 files failed with 18 intentional failures and 7 passing tests; first remaining failure is the missing accessible `Búsqueda web` switch.
- ⚠️ T4 production is implemented and frontend typecheck/lint pass, but focused GREEN remains blocked: 12 tests fail and 13 pass.
- ✅ User authorized remediation cycle 2. It fixed catalog loading without `withHistory`; the focused test reached a resolved catalog and populated defaults.
- ✅ User authorized remediation cycle 3. It isolated and fixed the duplicated accessible name `Búsqueda web Búsqueda web`; PromptComposer switch checks now pass.
- ⛔ Final-cycle verification reached a new fingerprint: after toggling and submitting the follow-up, `api.createTurn` is called 0 times instead of once (`conversation-continuation.test.tsx:204`). The original three-cycle remediation block ended.
- ✅ User authorized a separate T6 task dedicated to the new follow-up submission fingerprint.
- 🔄 Engram context and task observation were reloaded; the repository task document remains the reconciled current authority.
- ✅ T6 fixed a fast-mutation submit-lock race; the focused continuation contract passes.
- ✅ Test-owned expectations were aligned with enabled conversation loading and Base UI's non-native disabled semantics without weakening payload assertions.
- ✅ Tooltip popups now expose the explicit accessible `tooltip` role.
- ✅ T3/T4 frontend GREEN: all 5 focused files and 25 tests pass; frontend typecheck and lint pass.
- ✅ T7 completed: adapter-level capability gating, credential-free citation URLs across all boundaries, and real continuation true→false persistence coverage are GREEN.
- ℹ️ The final review's proposed toggle reset was rejected because the approved behavior explicitly preserves the user's current selection until they change it.
- 🐛 User runtime testing exposed that direct GPT-5.6 Sol and Kimi K3 were catalogued as unsupported and their adapters ignored search; stored-summary warnings were also unconditional.
- ✅ User chose to upgrade both new and existing snapshots for the two corrected direct deployments.
- 🔄 T8 reopens the feature with official OpenAI Responses API and Kimi `$web_search` documentation as the provider contracts.
- ✅ T8 backend RED isolated 4 intended failures with 12 passing; GREEN passes 3 files and 16 tests.
- ✅ Direct GPT-5.6 Sol now uses gated Responses API search; direct Kimi K3 uses one bounded built-in `$web_search` continuation.
- ✅ T8 frontend RED isolated 3 intended failures with 11 passing; GREEN passes 2 files and 14 tests.
- ✅ Pre-submit warnings now appear only while the toggle is enabled and derive solely from selected catalog/snapshot metadata.
- ✅ Liquibase 005 upgraded existing exact direct-deployment snapshots; post-migration preflight and immutable-trigger integration pass.
- ⚠️ The first post-migration preflight timed out while services were unavailable; after user-confirmed recovery, PostgreSQL was healthy, Liquibase exited 0, and schema was ready.
- ✅ T8 review remediation rejects malformed Kimi built-in arguments before continuation and aggregates optional usage across both rounds.
- ✅ Final T8 re-review: PASS.

## Verification evidence

- Git before branch creation: clean `main...origin/main`.
- Official OpenRouter catalog/model page: Qwen3.8 Max (0902), model ID `qwen/qwen3.8-max-0902`, tool-capable.
- No source code or tests changed before this document.
- Unit/contract RED command: exit 1; 8 expected failures, 27 passing.
- Integration preflight: `INTEGRATION_PREFLIGHT_OK`, PostgreSQL healthy, Liquibase exited(0), schema ready.
- Persistence RED command: exit 1; 3 expected failures, 6 passing, including missing `supports_web_search` schema.
- Backend strict build: exit 0.
- Backend focused unit/contract GREEN: 5 files, 35 tests passed.
- Backend focused integration GREEN: 2 files, 9 tests passed.
- Independent backend verifier: PASS, no blocking findings.
- Frontend focused RED command: exit 1; 18 intentional failures, 7 passing, no test-runtime blockers.
- Frontend typecheck: PASS.
- Frontend lint after test-owned cleanup: PASS.
- Focused frontend GREEN reexecution after cycle 1: exit 1; 12 failures, 13 passing.
- Remediation cycle 2: catalog loading issue fixed; focused continuation test progressed beyond the loading state.
- Remediation cycle 3: exact switch name fixed; PromptComposer isolation passed, then continuation progressed to a new failure at line 204 (`createTurn` expected once, received zero).
- T6 focused continuation GREEN: 1 file, 1 selected test passed.
- T6 affected frontend files GREEN: 3 files, 17 tests passed after correcting fixtures/assertions.
- Complete T3 frontend GREEN: 5 files, 25 tests passed.
- Frontend typecheck after production fixes: PASS.
- Frontend lint after production fixes: PASS.
- Frontend full suite before T7: 23 files, 91 tests passed; frontend build passed.
- Backend full concurrent suite: 36 files/223 tests passed and 5 files/8 tests failed; four files passed when isolated, while two unchanged observability-safety cases still expose a pre-existing raw diagnostic-body leak.
- Backend isolated catalog/lifecycle/continuation/creation verification: all pass.
- T7 frontend RED: credential-bearing citation accepted; focused GREEN: 6 tests passed and typecheck passed.
- T7 backend RED: 3 intended failures, 27 passing; continuation persistence coverage already passed.
- T7 backend GREEN: 3 files, 30 tests passed; backend build passed.
- Final frontend closure after T7: 23 files, 91 tests passed; lint and build passed.
- Final `git diff --check`: PASS.
- Final independent candidate review after T7: PASS; intended untracked task, migration, integration test, and UI component artifacts accounted for.
- T8 provider/catalog RED: exit 1, 4 intended failures, 12 passing.
- T8 provider/catalog GREEN: 3 files, 16 tests passed; backend build passed.
- T8 warning RED: exit 1, 3 intended failures, 11 passing.
- T8 warning GREEN: 2 files, 14 tests passed.
- T8 post-migration integration preflight: PostgreSQL healthy, Liquibase exited(0), schema ready.
- T8 immutable-snapshot integration: 1 file, 5 tests passed; ordinary updates remain rejected.
- T8 frontend full suite after warning remediation: 23 files, 93 tests passed; typecheck, lint, and build passed.
- T8 Kimi review RED: 4 intended failures, 7 passing; focused GREEN: 11 tests passed.
- Final T8 `git diff --check`: PASS.
- Final T8 independent re-review: PASS.

## Next step

T8 implementation and verification are complete. No commit is created without explicit user authorization; the known unrelated `providerDiagnostics.ts` observability defect remains separate.
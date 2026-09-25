# Add Direct Kimi K3

## Objective

Add Kimi K3 as a direct Kimi API deployment that is available in every response slot when `MOONSHOT_API_KEY` is configured, while retaining the existing OpenRouter Kimi K3 deployment.

## Problem and rationale

Kimi K3 is currently selectable only through OpenRouter. The requested behavior is direct Kimi API support. Kimi's official documentation identifies model `kimi-k3`, the OpenAI-compatible endpoint `https://api.moonshot.ai/v1/chat/completions`, the credential name `MOONSHOT_API_KEY`, native text/image/video input, and a 1,048,576-token context window.

Sources:

- https://platform.kimi.ai/docs/models
- https://platform.kimi.ai/docs/guide/kimi-k3-quickstart
- https://platform.kimi.ai/docs/overview

## Scope

- Add direct provider ID `kimi` and optional `MOONSHOT_API_KEY` configuration.
- Add a direct `kimi-k3` catalog deployment without removing `openrouter-kimi-k3`.
- Add a Kimi adapter behind the existing provider-neutral contract.
- Register the adapter only when its credential is configured.
- Keep all four response slots provider-neutral; no selector or orchestration redesign.
- Update frontend provider validation and deterministic fixtures where required.
- Align the existing configurable-provider normative artifacts with the added provider and deployment.

## Constraints

- Work on branch `feature/direct-kimi-k3`; no additional worktree.
- Strict TDD is enabled by the user and global repository policy: RED → GREEN → TRIANGULATE → REFACTOR.
- Supported runner: Vitest via `agent-scripts/run-pnpm.ps1`; frontend strict typecheck uses its workspace script through the same wrapper.
- No real Kimi API calls or secrets in tests.
- Keep `openrouter-kimi-k3` available alongside direct `kimi-k3`.
- Kimi request payloads stay encapsulated in `KimiProvider`; no shared external payload abstraction.
- Kimi K3 omits fixed sampling parameters and delegates `max_completion_tokens` when absent.
- Artifacts and code remain in English unless extending an existing Spanish Spec Kit artifact.
- Per the user's explicit workflow override, do not dispatch repository-defined `.codex/agents/*` profiles; use suitable global runtime subagents while preserving separate test and production responsibilities.
- The corresponding Principle IX exception is recorded in `specs/002-configurable-provider-deployments/plan.md` Complexity Tracking.
- No commit is authorized by the request; commit evidence remains pending unless the user explicitly authorizes commits.

## Delivery forecast

- Route: delegated direct ODD implementation.
- Trigger: 4+ files to understand and 2+ non-trivial files to modify.
- Forecast: approximately 350–500 authored diff lines, mostly adapter contract tests and normative catalog updates.
- Delivery strategy: `ask-on-risk`; no PR or commit operation is currently authorized.

## Tasks

- [x] **K3-1 — Align the normative provider/deployment contract**
  - Updated the existing feature specification, plan, research, data model, tasks amendment, provider contract, OpenAPI schema, and requirements brief for direct Kimi as the sixth provider and sixteenth deployment.
  - Recorded the official endpoint, credential, model ID, context limit, modalities, and output-limit field while retaining `openrouter-kimi-k3`.
  - Check: worker consistency searches found only explicitly superseded historical wording; parent reran `git diff --check -- specs/002-configurable-provider-deployments` successfully and structurally read back the provider contract.
  - Route: delegated writer; documentation-only TDD exception, validated by structural readback.
  - Evidence: worker `muh4yzya-4-10tr`, 8 normative files, 132 insertions/55 deletions, no commit.

- [x] **K3-2 — Establish failing direct-Kimi behavior tests (RED)**
  - Added focused provider contract, config, registry, catalog, service, frontend schema, and selector assertions without modifying production.
  - Six focused files failed for the intended missing production behavior: absent environment field, provider ID/registration, sixteenth catalog row, direct availability, adapter module, and frontend provider acceptance.
  - Triangulation: the focused selector test passed all six cases, proving existing slot selection is already provider-neutral and duplicate detection remains deployment-ID based.
  - Route: global test-only worker under the user-approved profile exception.
  - Evidence: worker `muh5r4rr-5-vzer`; exact commands used the supported `run-pnpm.ps1` workspace scripts; GREEN and strict typecheck intentionally deferred to K3-3.

- [x] **K3-3 — Implement direct Kimi support (GREEN/REFACTOR)**
  - Production worker `muh6flyv-9-zil9` added `KimiProvider`, provider/config types, credential-gated registry wiring, the exact direct catalog row, and frontend provider allowlist without touching tests.
  - Test-fixture worker `muh6n2at-a-qxht` added only the exhaustive `kimi` → `MOONSHOT_API_KEY` mapping; backend build then passed.
  - After explicit user authorization of the exact safer plan, added only empty `MOONSHOT_API_KEY=` placeholders to `.env.sample` and `.env.integration.sample`; scoped diff hygiene passed.
  - Route: separate global production and test-fixture workers under the user-approved profile exception.
  - Evidence: backend build and frontend strict typecheck passed; focused GREEN evidence is recorded in K3-4.

- [x] **K3-4 — Verify the integrated change**
  - Independent verifier `muh6q966-b-fg49` ran all eight focused test files, backend build, frontend strict typecheck, and full `git diff --check` through supported commands.
  - Check: all 11 commands passed; 67 tests passed across 8 files, backend build passed, frontend strict typecheck passed, and diff hygiene passed with only line-ending warnings.
  - Verified credential-gated availability, exact direct row, OpenRouter coexistence, fixed endpoint and single-call behavior, optional completion tokens, normalized success/errors, frontend provider acceptance, and any-slot selection.
  - Evidence: no real credentials or provider calls; backend and frontend strict compilers cover the changed test artifacts.

## Acceptance criteria

1. With `MOONSHOT_API_KEY` configured, `GET /api/v1/model-catalog` includes a direct deployment with `deploymentId: kimi-k3`, `providerId: kimi`, `modelId: kimi-k3`, `contextLimitTokens: 1048576`, text/image/video input, and text output.
2. Without `MOONSHOT_API_KEY`, the direct deployment is absent and backend startup still succeeds.
3. Every response-slot selector receives the same catalog and can select direct Kimi K3; duplicate deployment selection rules remain unchanged.
4. A direct Kimi generation sends one Bearer-authenticated POST to `https://api.moonshot.ai/v1/chat/completions`, forwards the resolved model, messages, and optional `max_completion_tokens`, and returns the existing normalized result shape.
5. Existing OpenRouter Kimi K3 support remains unchanged.
6. Relevant focused tests, backend build, frontend strict typecheck, and diff hygiene pass.

## Progress

- Branch created from clean `main` at `56ccb74`.
- Official Kimi model and quickstart documentation verified.
- Existing code flow mapped; direct support is not present, while OpenRouter Kimi K3 already is.
- K3-1 writer attempt `muh4wmyr-3-mllj` failed before its first turn or edit: child Pi exited with code `3221226505`; stderr reported that dynamic tool activation requires Pi 0.86.1 or newer. Repository inspection confirmed no partial worker edits.
- K3-1 completed through retry worker `muh4yzya-4-10tr`; eight normative artifacts now define six providers and sixteen deployments, and worker plus parent diff-hygiene checks passed.
- The original K3-2 owner was unavailable: `unit-test-runner` exists at `.codex/agents/unit-test-runner.toml`, but dispatch failed during agent lookup with `Error: no subagent named "unit-test-runner"`.
- The user explicitly authorized using suitable global subagents instead of repository-defined profiles. The approved governance exception preserves separate test and production tasks and Strict TDD.
- K3-2 established RED through global worker `muh5r4rr-5-vzer`; six missing-production failures were observed and the provider-neutral selector test remained green.
- Native risk assessment was unassessable because the ODD tracker is intentionally untracked, so policy required an independent verification of the RED test slice before production work.
- Independent verifier `muh62myy-6-gmqz` reproduced both representative intended RED failures and confirmed observable coverage, but found the shared provider test contract used an unparameterized Vitest `Mock` with cast request arguments, weakening strict compile-time request-shape validation.
- Test remediation worker `muh672b7-7-n3uq` parameterized the shared request mock and removed unnecessary casts. The existing OpenAI provider contract remained green (5/5), Kimi remained RED for missing production, and backend compilation reported only the intentional missing Kimi production contracts with no mock-typing diagnostic.
- Independent verifier `muh6d9kb-8-c5lb` confirmed the shared `Mock` is explicitly typed, unsafe casts are gone, observable assertions remain intact, and the OpenAI provider contract passes 5/5 with no remaining typing concern visible in that check.
- Production worker `muh6flyv-9-zil9` implemented direct Kimi production behavior. Frontend typecheck passed; its initial backend build reached one exhaustive integration fixture missing the new provider branch.
- Access to `apps/backend/.env.sample` and `.env.integration.sample` was initially denied by the safety layer. The user explicitly authorized adding only empty `MOONSHOT_API_KEY=` placeholders; both were added and scoped diff hygiene passed.
- Test-fixture worker `muh6n2at-a-qxht` added only the exhaustive `kimi` → `MOONSHOT_API_KEY` mapping. Backend build then passed with exit 0 and scoped diff hygiene passed.
- User preference recorded: request the exact minimal permission immediately whenever a blocked file is required for progress.

## Next step

Perform final parent diff/status spot-check and native review assessment, then report the completed branch without committing.

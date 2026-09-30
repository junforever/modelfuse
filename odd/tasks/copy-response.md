# Copy response

## Objective

Add an accessible copy action beside the response expansion action so users can copy the exact generated model response to the system clipboard.

## Problem and rationale

Generated responses can be read in ModelFuse but cannot be copied with a dedicated action. Reuse the browser Clipboard API, the existing tooltip primitive, and the installed Lucide icon rather than adding dependencies or abstractions.

## Scope

- Show an icon-only copy button for every completed, non-empty model response.
- Place it in the response footer beside `Mostrar más` / `Mostrar menos` when expansion is available.
- Keep it visible as the sole footer action for short completed responses.
- Show the tooltip and accessible name `Copiar`.
- Copy the full raw response, including content hidden by the collapsed view.
- Do not show the action for pending, running, failed, or empty responses.

## Constraints

- Strict TDD: observed RED before production code, then GREEN, then refactor only while green.
- Frontend application behavior remains under `apps/frontend`.
- No new dependency.
- Node/pnpm commands run from the repository root through `agent-scripts/run-pnpm.ps1`.
- Test artifacts and production code remain separate delegated responsibilities.
- No commit will be created without explicit user authorization.

## Resolved quality mode

- TDD: enabled by the user's explicit request and global Strict TDD policy.
- Focused runner: `& .\agent-scripts\run-pnpm.ps1 -- --filter frontend run test --run src/features/conversations/components/__tests__/ResponsePanel.test.tsx`.
- Strict typecheck: `& .\agent-scripts\run-pnpm.ps1 -- --filter frontend run typecheck`.
- Runtime profile: Node/pnpm only; every invocation is validated by `run-pnpm.ps1`. No Python or Docker/Compose profile is used.

## Delivery forecast

- Strategy: `ask-on-risk`.
- Estimated authored changes: under 100 lines.
- Expected review slice: one small frontend work unit.

## Tasks

- [x] **CR-1 — Add RED clipboard behavior tests**
  - Owner: frontend unit-test role (delegated worker restricted to tests).
  - Route: delegated; test ownership and command execution trigger.
  - Edit surface: `apps/frontend/src/features/conversations/components/__tests__/ResponsePanel.test.tsx`.
  - Acceptance: tests assert exact full-content copying for a collapsed completed response and absence of the copy action without generated content; focused test command fails for the intended missing behavior.

- [x] **CR-2 — Implement the minimal copy action**
  - Owner: frontend production role (delegated worker restricted to production).
  - Depends on: CR-1 RED evidence.
  - Route: delegated; preparation/write boundary and separation from test ownership.
  - Edit surface: `apps/frontend/src/features/conversations/components/CollapsibleHistoryMessage.tsx` and, only if required by the established component boundary, `apps/frontend/src/features/conversations/components/ResponsePanel.tsx`.
  - Acceptance: existing Button, Tooltip, Lucide Copy icon, and `navigator.clipboard.writeText` provide the requested behavior without new dependencies; all visibility rules hold.

- [x] **CR-3 — Verify GREEN and strict typing**
  - Owner: frontend unit-test role (delegated verifier restricted to commands/read-only diagnosis).
  - Depends on: CR-2.
  - Route: delegated; verification trigger.
  - Acceptance: focused ResponsePanel tests and frontend strict typecheck pass once; `git diff --check` passes.

## Progress and evidence

- Exploration confirmed `ResponsePanel` renders only completed, non-empty responses through `CollapsibleHistoryMessage`.
- `CollapsibleHistoryMessage` owns the `Mostrar más` / `Mostrar menos` footer, making it the smallest coherent location for the copy action.
- Existing shared primitives are available at `@workspace/ui/components/button` and `@workspace/ui/components/tooltip`; `lucide-react` is already installed.
- CR-1 test source is present in `ResponsePanel.test.tsx` and `git diff --check` passes.
- RED attempt 1 did not start Vitest: the executor passed the PowerShell-native command directly to Bash, which exited 2 with `syntax error near unexpected token '&'`. This was a command-host defect, not behavioral RED evidence.
- RED attempt 2 used the same supported wrapper through PowerShell and produced the intended behavior failure: exit 1, 6 passed / 1 failed, `ResponsePanel.test.tsx:122`, `Unable to find an accessible element with the role "button" and name "Copiar"`. Production remained untouched through RED.
- CR-2 adds an explicit response-only `showCopyAction` boundary, preserving prompt rendering while sharing one footer for expansion and copy actions. The handler passes the full raw content to `navigator.clipboard.writeText`; `git diff --check` passed with exit 0.
- CR-3 focused GREEN passed: 1 file / 7 tests, exit 0. Final `git diff --check` also passed.
- The configured `frontend` `typecheck` script exited 0 but checked an empty root project (`tsconfig.json` has `files: []` and only references), so it is not valid strict-type evidence. Diagnosis confirmed the supported `build` script runs `tsc -b`, whose referenced `tsconfig.app.json` has `strict: true` and `include: ["src"]`, covering both changed production files and `ResponsePanel.test.tsx`.
- CR-3 remediation cycle 1 passed: `frontend build` exited 0; `tsc -b` provided strict coverage and `vite build` completed. Vite emitted only a non-blocking chunk-size warning.
- Branch: `feat/copy-response`.

## Next step

Run the required native review-authority inspection and review this uncommitted candidate when available, then perform the final sub-agent shutdown check and report completion.

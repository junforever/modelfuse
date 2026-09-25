# Render Markdown Responses

## Goal
Render safe CommonMark formatting for completed model responses in all four response slots without enabling raw HTML.

## Constraints
- Work on `feat/markdown-response-rendering`.
- Do not use Spec Kit.
- Keep documentation to `specs/003-markdown-response-rendering/spec.md`.
- Follow strict RED → GREEN TDD.
- Use the shared response rendering path so `base-1`, `base-2`, `base-3`, and `consolidator` behave consistently.
- Preserve non-response consumers of `CollapsibleHistoryMessage`.

## Tasks
- [x] T1 — Create the feature branch and minimal feature documentation.
  - Evidence: branch `feat/markdown-response-rendering`; tracker and spec paths created.
  - Commit: pending explicit commit authorization.
- [x] T2 — Add and observe a focused failing test proving CommonMark rendering and safe raw-HTML handling across all four slots.
  - Evidence: focused Vitest command exited 1 with four failures; first failure at `ResponsePanel.test.tsx:41` expected an `h2` but received a plain `<p>` containing visible Markdown markers.
  - Commit: pending explicit commit authorization.
- [x] T3 — Implement the smallest shared production change and dependency update needed to pass T2.
  - Evidence: added `react-markdown` 10.1.0, opt-in CommonMark rendering for completed responses, minimal semantic styles, and preserved literal non-response rendering; frontend typecheck passed.
  - Commit: pending explicit commit authorization.
- [x] T4 — Independently verify focused tests and strict frontend typecheck.
  - Evidence: independent focused Vitest run passed 5/5 tests; strict frontend typecheck passed and covers the changed test under `tsconfig.app.json`'s `src` include.
  - Commit: N/A (read-only verification).
- [x] T5 — Complete native review and report the candidate outcome.
  - Evidence: native reliability review `review-1c330bcd68b8a519` approved and acknowledged; one informational warning remains about Markdown syntax potentially being cut in collapsed previews.

## Acceptance
1. Completed responses in every canonical slot render headings, emphasis, lists, links, quotes, inline code, and fenced code blocks as HTML elements rather than visible Markdown markers.
2. Raw HTML from a model is not interpreted as executable/rendered HTML.
3. Existing loading, failure, retry, continue-without, stale, and collapse behaviors remain intact.
4. Focused frontend tests and frontend strict typecheck pass through `agent-scripts/run-pnpm.ps1`.

## Applicable Architecture Summary
- `.specify/memory/constitution.md`: frontend owns presentation; product-specific composition stays in `apps/frontend`; accessibility and deterministic observable tests are mandatory; strict TypeScript and smallest sufficient tests apply.
- `specs/002-configurable-provider-deployments/plan.md`: the canonical slots are `base-1`, `base-2`, `base-3`, and `consolidator`; all flow through `ResponseTabs` → `ResponsePanel`; Node/pnpm commands must use `agent-scripts/run-pnpm.ps1`.

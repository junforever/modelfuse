<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read
`.specify/memory/constitution.md` and
`specs/001-compare-llm-responses/plan.md`.
<!-- SPECKIT END -->

## Mandatory Spec Kit task delegation

For every implementation run based on a feature `tasks.md` file:

- Respect the owner declared for each task and delegate it to the corresponding
  custom sub-agent defined in `.codex/agents`:
  - `FE` -> `frontend-builder`
  - `UI` -> `frontend-builder`
  - `BE` -> `backend-builder`
  - `DB` -> `backend-builder`
  - `UNIT` -> `unit-test-runner`
  - `INTEGRATION` -> `integration-test-runner`
  - `E2E` -> `e2e-test-runner`
- Delegate every product-code and test task to its declared owner, while
  respecting the dependencies and execution order in `tasks.md`.
- The primary agent acts only as coordinator: it may inspect context, dispatch
  tasks, track progress, review evidence, and report results, but it must not
  directly implement or modify product code or tests.
- If the required owner agent is missing or unavailable, stop and report the
  blocker instead of implementing the task directly or assigning another owner.

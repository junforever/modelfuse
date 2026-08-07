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

## Mandatory sub-agent shutdown check

- At the end of every implementation run, query the status of all delegated
  sub-agents before returning the final response.
- If any sub-agent is still `running`, interrupt it and verify that it is no
  longer executing.
- Do not treat a sub-agent as active merely because it remains listed in the
  task tree with status `completed`; only `running` agents require shutdown.
- Report the final check outcome, including any agent that was interrupted or
  any external blocker that prevented shutdown confirmation.

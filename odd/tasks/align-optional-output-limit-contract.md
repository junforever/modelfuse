# Align Optional Output Limit Contract

## Goal
Align the internal feature artifacts with the confirmed product rule: `maxOutputTokens` is optional; omission delegates the output limit to the provider, while an explicit positive value is persisted and sent unchanged.

## Scope
- Documentation and contract artifacts under `specs/002-configurable-provider-deployments/`.
- Read-only verification of the existing backend, frontend, database, and tests.
- No production or test changes unless verification proves a concrete contract gap.

## Tasks

- [x] ODD-001 Align normative requirements, scenarios, success criteria, and assumptions.
- [x] ODD-002 Align design, research, data model, API, adapter contract, and historical task notes.
- [x] ODD-003 Verify artifact consistency and confirm production satisfies both omitted and explicit-value paths.
- [x] ODD-004 [INTEGRATION] Align catalog assertions, nullable SQL result types, and absent-value persistence expectations.
- [x] ODD-005 [E2E] Remove explicit `maxOutputTokens` values from the ten-row E2E catalog fixture.
- [x] ODD-006 Re-run focused strict typechecks/tests and independent verification after ODD-004/ODD-005.

## Validation Evidence

- ODD-001/ODD-002: delegated documentation writer updated nine authorized feature artifacts; targeted readback passed and `git diff --check` exited 0. Runtime tests were not run under the documentation-only strict-TDD exception.
- ODD-003: the first independent structural verification found stale test fixtures but confirmed production required no correction.
- ODD-004/ODD-005: an orchestrator-selected writer corrected five authorized test/fixture files; an independent verifier confirmed the stale expectations were removed, explicit-value provider coverage remains, and `git diff --check` exits 0.
- ODD-006: backend build passed; frontend E2E typecheck passed; model-catalog integration passed 5/5; PostgreSQL integration passed 22/22 across three files; Playwright fixture smoke passed 1/1. No preflight scripts were run per explicit user instruction.

## Evidence

- User decision: provider defaults are intentional when `maxOutputTokens` is absent.
- Existing implementation commit: `5060537`.
- Frontend contract follow-up: `8176d52`.

---
description: 'Task list template for feature implementation'
---

# Tasks: [FEATURE NAME]

**Input**: Design documents from `/specs/[###-feature-name]/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are REQUIRED for non-trivial behavior. Use the lowest sufficient
level; add integration coverage for changed boundaries and end-to-end coverage for
critical cross-product journeys.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] [Domain] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- **[Domain]**: Primary owner: `FE`, `BE`, `UI`, `DB`, `FE-AUDIT`, `BE-AUDIT`,
  `UNIT`, `INTEGRATION`, `E2E`, `PERF`, or `SHARED`
- `FE-AUDIT` and `BE-AUDIT` belong exclusively to `frontend-auditor` and
  `backend-auditor`; they emit an agent report and never modify files or execute
  tests.
- `UNIT`, `INTEGRATION`, `E2E`, and `PERF` belong exclusively to
  `unit-test-runner`, `integration-test-runner`, `e2e-test-runner`, and
  `performance-test-runner`. Any other testing discipline must name its own
  specialized owner.
- Every agent owner named in a concrete generated task MUST match a configured
  `.codex/agents/*.toml` file; do not invent free-form aliases such as
  `integration-owner`. Human owners MUST be named explicitly (for example,
  `Product/UX`).
- Builders do not author, modify, or execute tests. Auditors remain read-only;
  blocking findings create a separate builder task followed by re-audit.
- Every production task with an automated minimum-test criterion MUST reference
  one or more explicit test task IDs owned by `UNIT`, `INTEGRATION`, `E2E`,
  `PERF`, or another specialized test domain; a test path or description inside
  a builder task is not a test task and does not transfer ownership.
- Include exact file paths in descriptions
- Split cross-domain work into independently reviewable tasks and add one explicit
  integration task. A `SHARED` task must name its responsible owner.

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- **Web app**: `backend/src/`, `frontend/src/`
- **Mobile**: `api/src/`, `ios/src/` or `android/src/`
- Paths shown below assume single project - adjust based on plan.md structure

<!--
  ============================================================================
  IMPORTANT: The tasks below are SAMPLE TASKS for illustration purposes only.

  The /speckit-tasks command MUST replace these with actual tasks based on:
  - User stories from spec.md (with their priorities P1, P2, P3...)
  - Feature requirements from plan.md
  - Entities from data-model.md
  - Endpoints from contracts/

  Tasks MUST be organized by user story so each story can be:
  - Implemented independently
  - Tested independently
  - Delivered as an MVP increment

  DO NOT keep these sample tasks in the generated tasks.md file.
  ============================================================================
-->

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 [SHARED] Create project structure per implementation plan (owner: [agent])
- [ ] T002 [SHARED] Initialize [language] project with [framework] dependencies (owner: [agent])
- [ ] T003 [P] [SHARED] Configure linting and formatting tools (owner: [agent])

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

Examples of foundational tasks (adjust based on your project):

- [ ] T004 [DB] Create Liquibase-formatted schema changes and wire the module changelog into `db/changelogs/db.changelog-master.xml`
- [ ] T005 [P] [BE] Implement authentication/authorization framework
- [ ] T006 [P] [BE] Setup API routing and middleware structure
- [ ] T007 [BE] Create base models/entities that all stories depend on
- [ ] T008 [BE] Configure error handling and logging infrastructure
- [ ] T009 [BE] Setup validated environment configuration management

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - [Title] (Priority: P1) 🎯 MVP

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 1 _(required for non-trivial behavior)_ ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T010 [P] [US1] [UNIT] Isolated contract-unit test for [contract] in [exact test path]
- [ ] T011 [P] [US1] [INTEGRATION] Browserless integration test for [boundary] in [exact test path]

### Implementation for User Story 1

- [ ] T012 [P] [US1] [BE] Create [Entity1] model in [exact path]
- [ ] T013 [P] [US1] [BE] Create [Entity2] model in [exact path]
- [ ] T014 [US1] [BE] Implement [Service] in [exact path] (depends on T012, T013)
- [ ] T015 [US1] [BE] Implement [endpoint/feature] in [exact path]
- [ ] T016 [US1] [BE] Add validation and error handling
- [ ] T017 [US1] [BE] Add logging for user story 1 operations

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - [Title] (Priority: P2)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 2 _(required for non-trivial behavior)_ ⚠️

- [ ] T018 [P] [US2] [UNIT] Isolated contract-unit test for [contract] in [exact test path]
- [ ] T019 [P] [US2] [INTEGRATION] Browserless integration test for [boundary] in [exact test path]

### Implementation for User Story 2

- [ ] T020 [P] [US2] [BE] Create [Entity] model in [exact path]
- [ ] T021 [US2] [BE] Implement [Service] in [exact path]
- [ ] T022 [US2] [BE] Implement [endpoint/feature] in [exact path]
- [ ] T023 [US2] [SHARED] Integrate with User Story 1 components (owner: [agent])

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - [Title] (Priority: P3)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 3 _(required for non-trivial behavior)_ ⚠️

- [ ] T024 [P] [US3] [UNIT] Isolated contract-unit test for [contract] in [exact test path]
- [ ] T025 [P] [US3] [INTEGRATION] Browserless integration test for [boundary] in [exact test path]

### Implementation for User Story 3

- [ ] T026 [P] [US3] [BE] Create [Entity] model in [exact path]
- [ ] T027 [US3] [BE] Implement [Service] in [exact path]
- [ ] T028 [US3] [BE] Implement [endpoint/feature] in [exact path]

**Checkpoint**: All user stories should now be independently functional

---

[Add more user story phases as needed, following the same pattern]

---

## Phase N: Read-Only Constitutional Audits

**Purpose**: Review all completed production changes before final validation.

- [ ] TXXX [P] [BE-AUDIT] Review `apps/backend/` and `db/changelogs/` against spec, plan, contracts, and applicable constitution principles (owner: `backend-auditor`); output an agent report with pass/fail, severity, file, and line; do not modify files or execute tests
- [ ] TXXX [P] [FE-AUDIT] Review `apps/frontend/` and `packages/ui/` against spec, plan, contracts, and applicable constitution principles (owner: `frontend-auditor`); output an agent report with pass/fail, severity, file, and line; do not modify files or execute tests

**Audit gate**: Blocking findings create focused builder tasks and require
re-audit before final validation continues.

---

## Phase N+1: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] TXXX [P] [SHARED] Documentation updates in docs/ (owner: [agent])
- [ ] TXXX [SHARED] Code cleanup and refactoring (owner: [agent])
- [ ] TXXX [SHARED] Performance optimization across all stories (owner: [agent])
- [ ] TXXX [P] [UNIT|INTEGRATION|E2E|PERF] Additional behavior-focused tests in [exact test path] (owner: [test owner])
- [ ] TXXX [SHARED] Security hardening (owner: [agent])
- [ ] TXXX [DOMAIN] Review applicable quickstart.md sections without executing tests (owner: [configured auditor or explicit human owner])
- [ ] TXXX [DOMAIN] Execute each quickstart.md scenario once in the task owned by its applicable specialized runner or explicitly named human owner

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Audits**: Depend on all production work in their respective domain
- **Polish (Final Phase)**: Depends on completed audits without blocking findings

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - May integrate with US1 but should be independently testable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - May integrate with US1/US2 but should be independently testable

### Within Each User Story

- UNIT, INTEGRATION, and E2E tests MUST be written by their owning runners and
  fail before implementation
- Models before services
- Services before endpoints
- Core implementation before integration
- Story complete before moving to next priority
- Domain production complete before its read-only audit; blocking findings before
  final validation

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- All tests for a user story marked [P] can run in parallel
- Models within a story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members
- Backend and frontend audits can run in parallel after their production
  dependencies complete

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together (if tests requested):
Task: "[UNIT] Contract-unit test for [contract] in [exact test path]"
Task: "[INTEGRATION] Browserless integration test for [boundary] in [exact test path]"
Task: "[E2E] Playwright test for [critical journey] in [exact test path]"

# Launch all models for User Story 1 together:
Task: "[BE] Create [Entity1] model in [exact path]"
Task: "[BE] Create [Entity2] model in [exact path]"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2
   - Developer C: User Story 3
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- [Domain] names the specialized owner and review boundary
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Auditors emit reports only; fixes belong to new builder tasks and require
  re-audit
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence

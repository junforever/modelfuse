# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]
**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION]  
**Primary Dependencies**: [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]  
**Storage**: [if applicable, e.g., PostgreSQL, CoreData, files or N/A]  
**Testing**: [e.g., pytest, XCTest, cargo test or NEEDS CLARIFICATION]  
**Target Platform**: [e.g., Linux server, iOS 15+, WASM or NEEDS CLARIFICATION]
**Project Type**: [e.g., library/cli/web-service/mobile-app/compiler/desktop-app or NEEDS CLARIFICATION]  
**Performance Goals**: [domain-specific, e.g., 1000 req/s, 10k lines/sec, 60 fps or NEEDS CLARIFICATION]  
**Constraints**: [domain-specific, e.g., <200ms p95, <100MB memory, offline-capable or NEEDS CLARIFICATION]  
**Scale/Scope**: [domain-specific, e.g., 10k users, 1M LOC, 50 screens or NEEDS CLARIFICATION]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [ ] Work is assigned to the owning monorepo boundary (`apps/frontend`,
      `apps/backend`, `packages/ui`, or `db`) without cross-application imports.
- [ ] Backend work preserves the `index.ts`/`app.ts`, route, controller,
      middleware, infrastructure, utility, and contract responsibilities.
- [ ] LLM work uses environment configuration, provider adapters, and normalized
      response contracts; consolidation does not consume provider-specific data.
- [ ] Conversation data remains in PostgreSQL, and each model's context is
      isolated; any window, summary, or compression rule is explicit.
- [ ] Reusable visual primitives live in `packages/ui`; application routing,
      state, and business behavior remain in `apps/frontend`.
- [ ] Every schema change is Liquibase-formatted SQL in a module changelog that is
      included by `db/changelogs/db.changelog-master.xml`.
- [ ] Secrets remain outside source, frontend bundles, logs, and conversation
      data; environment configuration has a validated boundary.
- [ ] Non-trivial behavior has the smallest sufficient automated test, with
      integration or end-to-end coverage for affected boundaries and critical
      journeys.
- [ ] Unit, integration, and E2E test tasks name `unit-test-runner`,
      `integration-test-runner`, or `e2e-test-runner` respectively; any other
      testing discipline names a separate specialized owner.
- [ ] Builders own production changes and testability seams but do not author,
      modify, or execute tests; auditors remain read-only.
- [ ] Any violation is justified in Complexity Tracking and approved before
      implementation.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Keep the constitutional ownership boundaries below and expand
  only the directories touched by this feature. Remove untouched child paths.
-->

```text
apps/
├── frontend/
│   └── src/
└── backend/
    └── src/
        ├── controllers/
        ├── routes/
        ├── middleware/
        ├── infrastructure/
        ├── utils/
        └── types/
packages/
└── ui/
    └── src/
db/
└── changelogs/
    └── db.changelog-master.xml
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |

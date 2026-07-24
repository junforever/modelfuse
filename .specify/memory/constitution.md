<!--
Sync Impact Report
- Version: unratified template → 1.0.0
- Modified principles:
  - Template placeholders → I. Monorepo Boundaries Are Enforced
  - Template placeholders → II. Backend Layers Have One Responsibility
  - Template placeholders → III. LLM Integrations Use Stable Provider-Neutral Contracts
  - Template placeholders → IV. PostgreSQL Is the Conversational Source of Truth
  - Template placeholders → V. Shared UI Stays Application-Agnostic
  - Template placeholders → VI. Every Database Change Goes Through Liquibase
  - Template placeholders → VII. Secrets and Configuration Stay Explicit
  - Template placeholders → VIII. Tested, Readable Changes Are the Unit of Delivery
  - Template placeholders → IX. AI Agents Work Within Specialized Boundaries
- Added sections:
  - Required Stack and Evolution Constraints
  - Development Workflow and Quality Gates
- Removed sections:
  - Template examples and placeholder sections
- Templates and guidance:
  - ✅ .specify/templates/plan-template.md — constitution gates and monorepo layout updated
  - ✅ .specify/templates/spec-template.md — constitutional alignment guidance added
  - ✅ .specify/templates/tasks-template.md — domain ownership and required testing updated
  - ✅ .specify/templates/commands/*.md — directory absent; no command templates to update
  - ✅ README.md — context flow and constitutional authority aligned
  - ✅ AGENTS.md — constitution added to required project context
  - ✅ .codex/agents/*.toml — reviewed; existing specializations remain compatible
- Follow-up TODOs: none
-->

# ModelFuse Constitution

## Core Principles

### I. Monorepo Boundaries Are Enforced

`apps/frontend` MUST own presentation, visual state, conversation navigation,
response tabs, history, and user actions. `apps/backend` MUST own API endpoints,
LLM orchestration, consolidation, persistence, and external integrations.
`packages/ui` MUST contain reusable visual primitives only and MUST NOT depend on
an application, router, business rule, or data-fetching implementation. Imports
MUST follow public package contracts; applications MUST NOT reach into another
application's internals. New modules MUST have one clear owner and MUST NOT create
cross-layer shortcuts. These boundaries keep changes local and independently
reviewable.

### II. Backend Layers Have One Responsibility

`index.ts` MUST only start and stop the server. `app.ts` MUST configure Express,
register global middleware, mount primary routes, and expose an application that
can be tested without opening a network port. Routes MUST define endpoints and
bind controllers. Controllers MUST translate the HTTP request and response only;
orchestration and business rules MUST live in feature services or modules.
Middleware MUST encapsulate cross-cutting HTTP concerns such as authentication,
validation, error handling, and logging. Infrastructure MUST own PostgreSQL,
environment loading, and external clients, including LLM providers. Utilities
MUST be reusable pure helpers; shared TypeScript contracts MUST live in the
appropriate `types` or public contract module. A layer MUST NOT bypass the layer
that owns the responsibility it needs.

### III. LLM Integrations Use Stable Provider-Neutral Contracts

Every LLM provider MUST be configured through environment configuration and
encapsulated behind a backend-owned provider contract. Provider-specific payloads
MUST be normalized before entering orchestration or consolidation. The normalized
response contract MUST identify the model and expose content plus extensible
metadata and metrics fields for values such as input tokens, output tokens, and
cost. The consolidator MUST consume normalized responses, never provider-specific
objects. Adding a provider MUST require a new adapter, configuration, and contract
tests rather than rewrites of conversation, persistence, or UI flows. Extensibility
MUST stay at these real variation points; speculative provider frameworks are not
permitted.

### IV. PostgreSQL Is the Conversational Source of Truth

ModelFuse MUST persist real multi-turn conversations in PostgreSQL; process
memory, browser state, or provider state MUST NOT become an alternative source of
truth. Each comparison model MUST retain only the user's prompts and that model's
own prior responses. The integrator MUST retain its own history of prompts and
consolidated responses and receive the current turn's new normalized model responses;
it MUST NOT receive the full histories of the three comparison models. Context
construction MUST account for provider token limits and cost. When a full context
no longer fits, the design MUST apply an explicit bounded window, summary, or
compression strategy and MUST preserve enough persisted information to explain
what was included. Context MUST NOT be discarded silently.

### V. Shared UI Stays Application-Agnostic

Reusable visual components MUST come from `packages/ui`. Product-specific
composition, conversation behavior, routing, and data orchestration MUST remain in
`apps/frontend`. A missing Shadcn component MUST be added through the project's
centralized command and exported from the shared package; it MUST NOT be copied
into an application. `packages/ui` MUST NOT import the frontend router, application
state, API clients, or ModelFuse-specific business types. Accessibility semantics,
keyboard behavior, visible focus, and explicit loading, empty, error, disabled,
and success states are mandatory for interactive UI.

### VI. Every Database Change Goes Through Liquibase

Every table, column, index, constraint, row-level security policy, procedure,
trigger, or view change MUST be delivered as Liquibase-formatted SQL. Manual
schema changes outside migrations are prohibited. Changelogs MUST be grouped by
functional module under `db/changelogs/`; each module MUST own a
`db.changelog-<module>.xml`, and every module changelog MUST be explicitly included
from `db/changelogs/db.changelog-master.xml`. A new functional data area MUST
create its module directory rather than append unrelated changes elsewhere.
Migration order and identifiers MUST be deterministic and reviewable.

### VII. Secrets and Configuration Stay Explicit

Secrets, provider credentials, and environment-specific values MUST NOT be
hardcoded, committed, exposed to the frontend, or written to conversation data or
logs. They MUST come from `.env` or the runtime environment through one validated
configuration boundary. Missing required configuration MUST fail clearly at
startup. Non-secret configuration and safe example variables MUST be documented
so a reviewer can trace how runtime behavior is selected. All external input MUST
be validated at its trust boundary, and client-facing errors MUST not expose
internal paths, stack traces, raw database errors, or credentials.

### VIII. Tested, Readable Changes Are the Unit of Delivery

Production changes MUST preserve strict TypeScript contracts, established module
boundaries, and readable control flow. Every non-trivial behavior change MUST
include the smallest test that proves the behavior at the lowest sufficient level.
Boundary contracts and persistence changes MUST have integration coverage;
critical conversation journeys MUST have end-to-end coverage when they cross the
complete product. Tests MUST be deterministic and assert observable behavior, not
private implementation or styling details. A change is incomplete if its relevant
typecheck, test, or migration validation fails. Refactors unrelated to the
requested behavior and abstractions without a present use are prohibited.

### IX. AI Agents Work Within Specialized Boundaries

AI-assisted tasks MUST name one primary domain and provide explicit inputs,
expected outputs, file scope, and validation. Frontend builder and auditor agents
MUST own UI and frontend state work; backend builder and auditor agents MUST own
orchestration, API, persistence, and integration work; the unit-test runner MUST
own isolated unit-test work. Cross-domain features MUST be split into independently
reviewable tasks with an explicit integration task. Builders MAY modify their
domain; auditors MUST remain read-only. Agent output MUST pass the same review,
tests, and constitutional checks as human-authored output and MUST NOT be accepted
solely because an agent reports success.

## Required Stack and Evolution Constraints

- The repository MUST remain a pnpm-workspace monorepo.
- The frontend MUST use React, Vite, and TypeScript.
- The backend MUST use Node.js, Express, and TypeScript.
- Shared UI MUST use the configured Shadcn UI and Tailwind CSS package.
- Persistent application data MUST use PostgreSQL; schema evolution MUST use
  Liquibase.
- Ranking, scoring, token and cost metrics, evaluation flows, observability, and
  dashboards MUST be addable through existing contracts and modules without
  replacing the core conversation flow. They MUST NOT be implemented until a
  specification requires them.
- A stack replacement or a change that weakens a MUST rule requires a
  constitutional amendment before implementation.

## Development Workflow and Quality Gates

1. A feature specification MUST define user-visible behavior, persistence
   effects, failure states, and measurable acceptance outcomes.
2. An implementation plan MUST map work to the real monorepo paths and pass every
   Constitution Check before research or design proceeds.
3. Tasks MUST identify a primary domain owner. Database work MUST include its
   Liquibase changelog wiring; LLM work MUST include provider-contract validation;
   UI work MUST distinguish shared primitives from application composition.
4. Implementation MUST start with the smallest complete slice that satisfies the
   specification and MUST preserve existing public contracts unless the plan
   explicitly migrates them.
5. The appropriate builder performs the focused change, the matching auditor
   reviews affected boundaries, and the test owner validates observable behavior.
6. A change MUST NOT be considered complete until relevant typechecks, tests,
   migration checks, and acceptance scenarios pass. Any skipped check MUST be
   documented with its concrete blocker and follow-up owner.
7. Constitutional exceptions MUST be recorded in the plan's Complexity Tracking
   table with the rejected simpler alternative and explicit approval before
   implementation.

## Governance

This constitution supersedes conflicting repository guidance, generated plans,
and implementation preferences. Amendments MUST include a written rationale,
semantic version impact, affected templates and runtime guidance, and a migration
plan when existing code or data becomes non-compliant.

Versions follow semantic versioning: MAJOR for removal or incompatible
redefinition of a principle; MINOR for a new principle or materially expanded
obligation; PATCH for non-semantic clarification. Every plan MUST perform the
Constitution Check before Phase 0 and again after design. Every review MUST verify
applicable principles, and unresolved violations MUST block implementation or
merge unless approved and recorded as a temporary exception. `README.md`,
`AGENTS.md`, the Spec Kit templates, and specialized agent instructions provide
operational guidance but MUST remain consistent with this constitution.

**Version**: 1.0.0 | **Ratified**: 2026-07-24 | **Last Amended**: 2026-07-24

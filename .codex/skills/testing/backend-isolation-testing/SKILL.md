---
name: backend-isolation-testing
description: Implements advanced unit testing patterns for backend service boundaries, dependency injection, external client mocking, and `createApp()` factory integration. Use when isolating business logic, stubbing infrastructure, or verifying middleware-handler interactions in controlled environments.
compatibility: Node.js 18+, Express 4.x/5.x, TypeScript 5+, Vitest 1+, Supertest 7+, DI patterns, custom adapters, or HTTP/DB/Queue clients. Compatible with module mocking, factory injection, or boundary-stub strategies.
metadata:
  author: junforever
  version: '2.0'
  category: backend-testing
---

# Backend Isolation Testing Skill

Apply this skill ONLY when testing service boundaries, dependency injection containers, external client stubs, `createApp()` factory integration, or complex middleware-handler interactions. For general endpoint security or basic input validation, use the core auditor rules instead.

## 🎯 When to Activate

Activate this skill when the test task involves:

- Isolating service layers from controllers, routes, or external infrastructure.
- Mocking HTTP clients, database drivers, queue producers, or file system modules at resolution boundaries.
- Injecting test-specific dependencies into `createApp()` factory invocations or DI containers.
- Verifying middleware execution order, parser behavior, or error propagation without full stack overhead.
- Designing deterministic stubs for async workflows, retry logic, or timeout handling.
- Testing request/response transformation, validation delegation, or status code mapping in isolation.

## 📦 Service Boundary & Dependency Injection Testing

- Instantiate services with explicit mock dependencies; avoid relying on global singletons or auto-wired containers during unit execution.
- Verify business logic branching, data transformation, and error propagation through returned values, thrown exceptions, or callback invocations.
- Isolate service methods from route parsing and HTTP formatting; assert on domain outputs rather than `res.json()` or `req.body` structures.
- Keep DI container configuration out of unit scope; mock resolved service instances directly at the import or module boundary.
- Ensure injected dependencies expose minimal, testable interfaces; avoid leaking framework-specific wrappers into test assertions.

## 🔌 External Client & Network Isolation

- Replace all network, database, queue, and filesystem calls with deterministic stubs using module-level mocking.
- Verify request payloads, headers, query parameters, and serialization logic through stub interaction assertions when side-effects are the target behavior.
- Ensure zero real network calls, connection pools, or I/O operations leak into test execution; intercept at the client initialization layer.
- Mock retry policies, timeout thresholds, and circuit-breaker states explicitly to verify fallback paths and error classification.
- Validate type-safe stub contracts that mirror real client signatures without coupling to internal implementation details or private methods.

## 🏭 Factory Pattern & Express Integration

- Instantiate a fresh Express app via `createApp()` for each test to prevent middleware accumulation, route duplication, or parser state bleed.
- Inject test-specific mocks, configuration overrides, or route bypasses during factory invocation or module resolution before app creation.
- Test route handlers in isolation by explicitly mocking or disabling security, auth, or parsing middleware when only business delegation is under test.
- **Strict Mocking Contract**: When testing Express routes isolatedly via `supertest(createApp())`, ensure the database ORM (Prisma/Drizzle) and external services are 100% mocked at the module boundary to keep the test strictly fast, unit-level, and completely isolated from the database engine.
- Verify request parsing, validation schema delegation, and response formatting through simulated requests without starting an HTTP server.

## 🛡️ Mocking Strategy & Stub Design

- Prefer output/state assertions over interaction spies; use spies only when verifying side-effects, external calls, or event emissions is the core behavior.
- Scope mocks to individual test files or `beforeEach` blocks; reset, restore, or clear mocks between tests to guarantee deterministic execution.
- Design stubs that return predictable, type-safe responses aligned with success, validation failure, not-found, and internal error scenarios.
- Avoid deeply coupled mocks that track internal implementation details, private state, or framework-specific lifecycle hooks.
- Ensure mock lifecycles do not interfere with test parallelization; avoid shared mutable state, global variables, or singleton mutation.

## 🔍 STANDARDS & DOCUMENTATION

- Consult Context7 for Vitest module mocking APIs, Supertest request simulation patterns, Express testing boundaries, or DI configuration updates before implementing.
- Mention briefly in the test report which documentation was checked and how it influenced mocking strategy, stub design, or factory integration.
- Known Library IDs:
  - Vitest: /vitest-dev/vitest
  - Supertest: /ladjs/supertest
  - Express: /expressjs/express
  - Node.js Modules: /nodejs/node
  - TypeScript: /microsoft/typescript

## 🚫 Anti-Patterns to Avoid

- Starting real servers, database connections, or external API calls in unit-level test files.
- Mocking the unit under test or bypassing public interfaces to force internal state changes.
- Sharing mutable stub state, global mocks, or uncleaned module caches across test files.
- Using `any` or unsafe type assertions to satisfy mock signatures without explicit contract validation.
- Testing full Express middleware stacks, auth flows, or CORS configurations when only handler logic is under verification.
- Ignoring mock cleanup/reset between tests, causing state bleed, flaky execution, or false positives.
- Designing mocks that pass only due to implementation quirks, internal method tracking, or framework-specific side channels.
- Coupling test files to production entrypoint mutations or relying on `NODE_ENV` side effects for test setup.
- Using bizarre test hooks or environment hacks to simulate failures (e.g., triggering `process.exit` or crashes via special query parameters like `?test-invalid-port`). Design for straightforward HTTP-level error assertions.
- Creating redundant tests that verify the same behavioral intention multiple times (e.g., separate tests for status code, then another for the exact same response body). Group them under one intention.

## 📝 Output Integration

- Map all test designs and coverage additions to the core `unit-test-runner` reporting structure using categories like `backend-isolation`, `service-boundary`, or `mock-strategy`.
- **Mandatory Location Enforcement**: Ensure all generated test file instructions strictly target the `__tests__` directory adjacent to the file under test (e.g., `src/backend/services/__tests__/user.service.test.ts`).
- Assign test priority based on behavior criticality: `critical` for untested error branches, missing DI isolation, or real infrastructure leakage; `high` for unvalidated factory injection, weak stub contracts, or middleware bleed; `medium` for redundant mocks, inconsistent reset patterns, or type widening in test data; `low` for naming inconsistencies or excessive assertion verbosity.
- Provide precise test file paths, covered service behaviors, isolation strategies, and directional recommendations for test refinement. Never generate production code or refactor business logic.
- Merge test updates and coverage notes into the standard output format required by `unit-test-runner`. Defer service implementation, factory refactoring, and DI configuration changes to the `backend-builder` agent. Defer architectural compliance and security boundary audits to the `backend-auditor` agent.

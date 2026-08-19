---
name: test-determinism-utilities
description: Implements deterministic testing utilities for isolated Vitest and Testing Library unit tests by controlling time, randomness, cryptographic outputs, timezone shifts, in-memory fixtures, and mocked async workflows. Use only for unit-test-runner tasks. Use integration-test-determinism for real component or resource lifecycles and e2e-test-determinism for Playwright or browser behavior.
compatibility: Node.js 18+, TypeScript 5+, Vitest 1+, Testing Library React 14+, user-event 14+, date-fns, crypto. Compatible with seeded generators, timezone utilities, or custom test fixture patterns.
metadata:
  author: junforever
  version: '2.0'
  category: testing-utilities
---

# Test Determinism & Utilities Skill

Apply this skill ONLY within `unit-test-runner` tasks when isolated unit test
execution suffers from nondeterminism, local async race conditions,
time-dependent behavior, or requires deterministic in-memory data factories.

This skill does not cover real PostgreSQL connections, transactions, ports,
servers, HTTP/SSE streams, shared QueryClients, integration resource cleanup, or
browser lifecycle. Return those scenarios to `integration-test-runner` with
`integration-test-determinism`, or to `e2e-test-runner` with
`e2e-test-determinism` when Playwright or real browser behavior is involved.

For standard isolated unit tests with static inputs, use the core
`unit-test-runner` rules instead.

## 🎯 When to Activate

Activate this skill when the test task involves:

- Controlling fake timers, timeouts, intervals, or debounce/backoff logic.
- Mocking randomness, UUID generation, cryptographic hashes, or non-deterministic outputs.
- Handling timezone shifts, locale changes, or date formatting edge cases.
- Building shared, type-safe data builders/factories for complex test fixtures.
- Stabilizing flaky async tests, race conditions, or untracked promise resolutions.
- Synchronizing external event emitters, stream updates, or subscription callbacks.

## ⏱️ Time & Async Control

- Verify explicit timer mocking for all time-dependent logic via Vitest utilities (`vi.useFakeTimers()`); assert advancement, cancellation, and resolution paths without real-time delays.
- Wrap async state updates, promise resolutions, and subscription triggers in explicit synchronization boundaries to prevent untracked updates or unhandled rejections.
- Restore real timers immediately after test completion; verify no timer state leaks into subsequent test executions.
- Validate async queue processing order and microtask scheduling when testing concurrent, batched, or deferred operations.
- Replace arbitrary delays (`setTimeout`, `waitFor` with hardcoded timeouts) with explicit state polling, callback triggers, or resolved promise mocks.

## 🎲 Randomness, Crypto & Environment Isolation

- Replace non-deterministic outputs with seeded or explicitly mocked generators; assert on behavior boundaries rather than specific generated values.
- **Cryptographic Determinism**: Ensure native and third-party cryptographic utilities used in the application (such as `crypto.randomUUID()`, token signatures, or `bcrypt` salts) are explicitly mocked to return stable, predictable values during test execution.
- Mock environment variables, process configuration, and feature flags at module resolution before test execution begins.
- Ensure timezone, locale, and date formatting logic is explicitly controlled and validated against multiple offset or formatting scenarios.
- Isolate global state mutations (singletons, module caches, `process.env`) using scoped mocking or sandboxed execution contexts.
- Verify that fallback paths, validation failures, and edge cases are triggered deterministically regardless of underlying random or crypto outputs.

## 🏭 Data Factories & Fixture Management

- Design minimal, type-safe data builders that generate only the fields required for each specific test scenario.
- Avoid monolithic fixture objects; compose complex test data from reusable, deterministic fragments with explicit overrides.
- Ensure factory outputs remain immutable or explicitly cloned per test to prevent accidental state mutation across parallel or sequential runs.
- Validate factory contracts against TypeScript interfaces or runtime schemas to catch type drift between test data and production expectations.
- Keep factory logic strictly test-only; never leak fixture generation helpers, mock data, or builder utilities into production modules.

## 🛡️ Flakiness Stabilization & Race Condition Handling

- Identify and eliminate unawaited promises, missing synchronization boundaries, or implicit timing assumptions in test suites.
- Fix flaky tests by removing non-determinism at the source; never suppress instability by increasing timeouts or adding retry wrappers.
- Ensure test execution order independence; verify that parallel, shuffled, or isolated test runs produce identical results.
- Mock external event loops, stream backpressure, or subscription queues explicitly when verifying async state transitions or side effects.
- Assert that test teardown, mock cleanup, and cache resets occur reliably even when tests fail early or throw unexpected errors.

## 🔍 STANDARDS & DOCUMENTATION

- Consult Context7 for Vitest timer mocking APIs, async test synchronization patterns, timezone/date utility updates, or module sandboxing behaviors before implementing.
- Mention briefly in the test report which documentation was checked and how it influenced mocking strategy, factory design, or stabilization approach.
- Known Library IDs:
  - Vitest: /vitest-dev/vitest
  - Testing Library React: /testing-library/react-testing-library
  - user-event: /testing-library/user-event
  - date-fns: /date-fns/date-fns
  - Node.js Crypto: /nodejs/node
  - TypeScript: /microsoft/typescript

## 🚫 Anti-Patterns to Avoid

- Relying on real timers, arbitrary sleeps, or hardcoded delays to mask async race conditions.
- Mocking time or environment globally without explicit reset/cleanup between tests.
- Using `any` or unsafe type assertions to bypass type-safe factory contracts or mock signatures.
- Creating monolithic fixture files that hide required fields, leak into unrelated suites, or encourage copy-paste test data.
- Increasing timeouts, adding retry loops, or weakening assertions to suppress flaky behavior instead of fixing root synchronization gaps.
- Mutating shared test data objects across parallel or sequential tests, causing state bleed and false positives/negatives.
- Testing specific randomized or timestamp outputs instead of verifying behavior boundaries, fallback logic, or transformation correctness.
- Leaking timezone overrides, locale mocks, or crypto stubs into subsequent test execution contexts or production code paths.
- Over-engineering factories or mocks to achieve "perfect" determinism when a simple, minimal stub would satisfy the test intention. Keep mocks as simple as possible.
- Creating complex test utilities that hide important behavior or make test failures harder to debug, violating the core `test-design` principle of readable, observable behavior testing.

## 📝 Output Integration

- Map all test designs and stabilization efforts to the core `unit-test-runner` reporting structure using categories like `test-determinism`, `async-stability`, or `data-factories`.
- **Mandatory Location Enforcement**: Ensure all generated test file instructions, data factories, or fixture modules strictly target the `__tests__` directory adjacent to the code file under test (e.g., `src/frontend/hooks/__tests__/useAuth.test.ts`).
- Assign test priority based on reliability impact: `critical` for untracked async state, real timer leaks, or unmocked non-deterministic outputs; `high` for flaky race conditions, missing mock cleanup, or factory type drift; `medium` for arbitrary delays, verbose fixtures, or weak synchronization boundaries; `low` for naming inconsistencies or redundant builder utilities.
- Provide precise test file paths, covered stabilization strategies, factory designs, and directional recommendations for test refinement. Never generate production code or refactor business logic.
- Merge test updates and reliability notes into the standard output format required by `unit-test-runner`. Defer async logic corrections, factory refactoring, and time/randomness implementation fixes to the `frontend-builder` or `backend-builder` agents.

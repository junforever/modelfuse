---
name: test-design
description: Foundational philosophy for writing high-value, non-redundant unit tests. Enforces observable behavior testing, intention-driven assertions, and the elimination of test bloat.
compatibility: >-
  Unit tests only — Vitest 1+, Testing Library React 14+, Supertest 7+,
  TypeScript 5+. For integration tests use `integration-test-design`.
  For E2E tests use `e2e-test-design`.
metadata:
  author: junforever
  version: '2.0'
  category: testing-philosophy
---

# Test Design & Quality Skill

Apply this skill before writing or modifying any **unit test** within `unit-test-runner`. For integration tests use `integration-test-design`. For E2E tests use `e2e-test-design`. This skill is the foundational source of truth for unit test quality, ensuring "quality over quantity" and eliminating redundant, brittle, or implementation-focused tests.

## 🎯 Core Philosophy: Quality Over Quantity

- Tests are living documentation of behavior, not coverage metrics. Do not chase 100% coverage.
- A test is only valuable if it would fail when the intended behavior breaks, and pass when the behavior is correct, regardless of internal refactoring.

### ✅ Rule 1: Intention Over Property (The "One Test, One Intention" Rule)

- A single `it` block should verify one clear behavioral intention.
- Multiple `expect` statements within the same `it` are highly encouraged IF they collectively validate that single intention (e.g., verifying status 200 AND the correct JSON shape in one test).
- 🚫 ANTI-PATTERN: Do NOT create separate `it` blocks for every single property of a response or every minor variation of a happy path. This is test bloat.

### ✅ Rule 2: Test Observable Behavior, Never Implementation Details

- Test the public contract: HTTP responses, returned values, thrown errors, or visible UI state changes.
- 🚫 ANTI-PATTERN: Never mock, spy on, or assert against private methods, internal closures, or framework-specific lifecycle hooks unless that specific side-effect is the sole purpose of the unit.

### ✅ Rule 3: Consolidate Error Handling Tests (Frontend & Backend)

- ✅ CORRECT PATTERN: Write ONE consolidated test that mocks a generic API failure and verifies that the UI correctly transitions to the "Error" state and displays a user-friendly message.
- 🚫 ANTI-PATTERN (Frontend): Do NOT write 5 separate tests for API status codes 400, 401, 403, 404, and 500.
- 🚫 ANTI-PATTERN (Backend): Do NOT write bizarre test hooks (e.g., triggering `process.exit` or crashes via special query parameters like `?test-invalid-port`). Design for straightforward HTTP-level error assertions.

### ✅ Rule 4: Mocking Discipline

- Mock ONLY what is external, slow, non-deterministic, or environment-dependent (DB, network, file system, crypto, timers).
- Mock at the module boundary, never mock the unit under test itself.
- Keep mocks minimal and typed. Avoid monolithic fixture objects; compose only the fields strictly necessary for the specific test intention.

## 🔍 STANDARDS & DOCUMENTATION

- Consult Context7 for testing library best practices (e.g., Testing Library guiding principles: "The more your tests resemble the way your software is used, the more confidence they can give you").
- Known Library IDs:
  - Vitest: `/vitest-dev/vitest`
  - Testing Library React: `/testing-library/react-testing-library`
  - Supertest: `/ladjs/supertest`

## 📝 Output Integration

- Before generating tests, briefly state the "behavioral intentions" you are about to cover to ensure no redundancy.
- If an existing test suite violates these rules (e.g., 10 redundant tests for one endpoint), recommend consolidating them in your report.

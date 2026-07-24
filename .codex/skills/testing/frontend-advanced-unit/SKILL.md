---
name: frontend-advanced-unit
description: Implements advanced unit testing patterns for complex React components, custom hooks, multi-step forms, and accessibility compliance verification. Use when testing state machines, dynamic validation, focus management, or advanced React patterns in isolation.
compatibility: React 18+, TypeScript 5+, Vitest 1+, Testing Library React 14+, user-event 14+, Zod/Joi. Compatible with React Hook Form, Radix UI, or custom context providers.
metadata:
  author: junforever
  version: '2.0'
  category: frontend-testing
---

# Frontend Advanced Unit Testing Skill

Apply this skill ONLY when testing complex React hooks, multi-step forms, deeply conditional UI, or accessibility compliance beyond basic queries. For standard component rendering and simple state verification, use the core `unit-test-runner` rules instead.

## 🎯 When to Activate

Activate this skill when the test task involves:

- Complex custom hooks with async state, multiple dependencies, or side-effect orchestration.
- Multi-step forms with dynamic validation, conditional fields, or cross-field dependencies.
- Deeply conditional UI rendering driven by state machines or complex branching logic.
- Explicit accessibility compliance verification (focus management, live regions, keyboard parity).
- Components relying on multiple context providers, portals, error boundaries, or Suspense boundaries.
- Testing advanced React patterns (concurrent features, deferred updates, transition states) in isolation.

## ⚛️ Complex Hook & State Machine Testing

- Test hook return values, state transitions, and side effects in isolation using dedicated hook testing utilities.
- Verify async state resolution, race condition handling, and proper cleanup behavior on unmount.
- Mock external dependencies and APIs at the hook boundary; assert on published state or callbacks rather than internal implementation.
- Wrap all state updates, async resolutions, and effect triggers in appropriate synchronization utilities to prevent untracked updates.
- Verify hook initialization, dependency array stability, and memoized value consistency across re-renders.

## 📝 Multi-Step Forms & Dynamic Validation

- Test form submission flows, validation schema execution, and error state propagation strictly from a user perspective.
- Verify conditional field rendering, dynamic default values, and cross-field validation dependencies without bypassing UI interactions.
- Assert on accessible error announcements, focus redirection on validation failure, and successful state transitions.
- Mock submission handlers and external API calls; verify payload structure, type coercion, and transformation before dispatch.
- Isolate form logic from layout components; test validation behavior independently of visual presentation when complexity scales.

## ♿ Accessibility & Interaction Compliance

- Verify focus trapping, roving tabindex, and keyboard navigation parity through programmatic assertions, not visual inspection.
- Test `aria-live` regions, `aria-expanded`, `aria-controls`, and dynamic role changes to ensure screen reader accuracy across state updates.
- Assert reduced motion preferences, high-contrast mode compatibility, and visible focus indicator retention during interactions.
- Validate that complex widgets maintain logical DOM order and semantic structure when conditionally mounting or unmounting content.
- Ensure interactive elements retain accessible names, roles, and descriptions throughout all validation and loading states.

## 🧩 Context, Portals & Advanced React Patterns

- Wrap tested components in minimal, explicit provider mocks; avoid leaking full application context into isolated unit tests.
- Verify portal rendering targets, event bubbling behavior, and DOM attachment/detachment lifecycle under conditional rendering.
- Test error boundary capture, fallback UI rendering, and state recovery without forcing component unmounting or manual DOM manipulation.
- Ensure Suspense boundaries and async component loading states trigger expected loading, fallback, and resolved transitions.
- Mock concurrent React features explicitly when testing transitions, deferred state updates, or interruptible rendering flows.

## 🔍 STANDARDS & DOCUMENTATION

- Consult Context7 for Testing Library hook utilities, React testing APIs, or ARIA specification updates before implementing advanced assertions.
- Mention briefly in the test report which documentation was checked and how it influenced assertion strategy or mocking approach.
- Known Library IDs:
  - Testing Library React: /testing-library/react-testing-library
  - Vitest: /vitest-dev/vitest
  - user-event: /testing-library/user-event
  - ARIA Practices: /w3c/wai-aria-practices
  - React Hook Form: /react-hook-form/react-hook-form
  - Radix UI: /radix-ui/primitives

## 🚫 Anti-Patterns to Avoid

- Testing internal hook state, private variables, or implementation-specific closures instead of public outputs.
- Over-mocking React internals, bypassing `act`/async synchronization, or forcing synchronous state updates.
- Using `data-testid` to bypass accessibility complexity, state validation, or conditional rendering logic.
- Creating monolithic test files that verify multiple complex behaviors, state transitions, and edge cases simultaneously.
- Relying on snapshot assertions for dynamic, state-heavy, or accessibility-critical UI components.
- Ignoring cleanup/unmount behavior in tests involving timers, subscriptions, portals, or async effects.
- Asserting on CSS classes, inline styles, or visual layout instead of user-observable behavior and semantic structure.
- Writing separate, redundant tests for every possible HTTP error code (400, 401, 403, 500). Instead, write one consolidated test verifying that _any_ API failure correctly transitions the UI to the error state and displays a user-friendly message.
- Creating monolithic test files that verify multiple complex behaviors, state transitions, and edge cases simultaneously. Break them down by behavioral intention.

## 📝 Output Integration

- Map all test designs and findings to the core `unit-test-runner` reporting structure using categories like `frontend-advanced`, `accessibility`, or `state-management`.
- **Mandatory Location Enforcement**: Ensure all generated test file instructions strictly target the `__tests__` directory adjacent to the file under test (e.g., `src/frontend/components/Feature/__tests__/Feature.test.tsx`).
- Assign test severity/priority based on behavior criticality: `critical` for broken state transitions or missing a11y compliance; `high` for untested validation branches or async race conditions; `medium` for weak hook assertions or excessive mocking; `low` for redundant test utilities or naming inconsistencies.
- Provide precise test file paths, covered behavior descriptions, assertion strategies, and directional recommendations for test improvement. Never generate production code.
- Merge test updates and coverage recommendations into the standard output format required by `unit-test-runner`. Defer component refactoring, accessibility implementation, and architectural changes to the `frontend-builder` and `frontend-auditor` agents.

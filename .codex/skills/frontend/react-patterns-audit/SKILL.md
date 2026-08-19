---
name: react-patterns-audit
description: Audits React code for hook compliance, state management correctness, component architecture, dependency array accuracy, and common React anti-patterns. Use when analyzing complex state logic, custom hooks, or advanced component composition.
compatibility: React 18+, TypeScript 5+, Vite 8+, TailwindCSS 4+. Applies to all React component and hook implementations.
metadata:
  author: junforever
  version: '2.0'
  category: react-patterns
---

# React Patterns Audit Skill for React + TypeScript

Apply this skill ONLY when the codebase uses advanced hooks, complex state orchestration, custom hook composition, or shared state logic. For simple presentational components with basic state, rely on the auditor core rules.

## 🎯 When to Activate

Activate this skill when the code or task involves:

- Custom hooks with multiple interdependent states or async flows.
- Complex `useEffect` chains, dependency arrays, or cleanup logic.
- Context providers with frequently changing values or deep consumer trees.
- State machines, reducer patterns, or multi-source state derivation.
- Explicit requests for hook refactoring, dependency array validation, or stale closure detection.
- Component composition patterns (render props, compound components, higher-order wrappers).

## 🔄 Hook Rules & Lifecycle

- Verify strict adherence to Rules of Hooks: top-level calls only, consistent execution order, never inside conditions, loops, or nested callbacks.
- Audit `useEffect` dependency arrays for completeness; flag missing dependencies that cause stale closures or outdated references.
- Check that effects return proper cleanup functions for subscriptions, timers, DOM listeners, or `AbortController`.
- Ensure async operations inside effects are wrapped safely, handle cancellation, and explicitly guard state updates on unmounted components.
- Flag `useEffect` used for pure data transformation, formatting, or derived state; recommend synchronous computation during render instead.
- Verify `useLayoutEffect` is only used for DOM measurements that must occur synchronously before browser paint; flag misuse for data fetching or state updates.

## 📦 State Management & Derivation

- Verify state is kept as local as possible; flag unnecessary lifting or global state for strictly component-scoped values.
- Check for redundant or duplicated state that can be derived from existing props, context, or other state variables.
- Ensure `useState` initializers use lazy initialization when computing expensive default values.
- Validate `useReducer` usage for complex state transitions; check that dispatch actions are explicit, predictable, and free of side effects.
- Flag parallel boolean flags (`isLoading`, `isError`, `isSuccess`) that can lead to impossible, overlapping, or inconsistent UI states.
- Ensure state updates are batched appropriately and do not trigger cascading renders through indirect dependencies.

## 🏗️ Component Architecture & Composition

- Verify strict separation of concerns: Flag as HIGH severity if data fetching, complex state orchestration, or business logic is embedded directly inside UI components instead of being extracted to dedicated Custom Hooks.
- Audit prop interfaces for minimalism and clarity; flag excessive prop drilling, overly generic `any`/`Record` types, or missing exported prop types.
- Check compound component patterns for correct context sharing, stable refs, and proper keyboard/focus delegation.
- Ensure dynamic rendering uses stable, predictable keys; flag index-based keys for filtered, sorted, paginated, or reorderable lists.
- Verify that components do not mutate props directly and treat all external data as immutable.
- Flag conditional rendering chains that grow excessively nested; recommend extraction to sub-components or render functions when readability suffers.

## ⚡ Performance & Memoization

- Audit `React.memo`, `useMemo`, and `useCallback` usage; flag indiscriminate application without profiling evidence or referential stability need.
- Ensure memoized dependencies are stable; flag inline objects, arrays, or functions recreated on every render inside memo dependency lists.
- Check for unnecessary re-renders caused by context consumers wrapping large trees or frequently changing reference values.
- Verify that heavy computations are deferred, memoized, or offloaded appropriately without blocking the render phase.
- Flag stale closures in event handlers or callbacks resulting from missing dependencies, outdated state snapshots, or incorrect ref usage.
- Ensure `useRef` is used only for persistent mutable values that do not trigger re-renders; flag misuse for state that should drive UI updates.

## 🔍 STANDARDS & DOCUMENTATION

- Consult Context7 for react hook rules, dependency array behavior, and concurrent rendering patterns.
- Known Library IDs:
  - React: /facebook/react

## 📉 Anti-Patterns to Flag

| Pattern                                                                            | Severity | Why It Matters                                                                  |
| ---------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------- |
| Data fetching or complex business logic inside UI components (missing Custom Hook) | High     | Creates monolithic, untestable components and violates separation of concerns   |
| Missing `AbortController` or unmount guards in async `useEffect`                   | High     | Causes memory leaks, race conditions, and state updates on unmounted components |
| Missing dependencies in `useEffect`, `useMemo`, or `useCallback`                   | High     | Causes stale closures, outdated state references, or silent logic failures      |
| Parallel boolean state flags (`isLoading`, `isError`, `isSuccess`)                 | Medium   | Creates impossible UI states and complicates rendering logic                    |
| Indiscriminate `useMemo`/`useCallback`/`memo` without profiling                    | Low      | Increases bundle size, adds cognitive overhead, negligible runtime gain         |
| State updates inside effects without cleanup or unmount guards                     | Medium   | Triggers memory leaks, race conditions, or React strict mode warnings           |
| Using `useEffect` for derived state or synchronous transformations                 | Medium   | Breaks React's data flow, causes cascading renders, violates render purity      |
| Array index keys for dynamic or reordered lists                                    | High     | Breaks reconciliation, corrupts component state, causes visual bugs             |
| Direct prop mutation or implicit `any` in exported component props                 | High     | Breaks TypeScript safety, causes unpredictable render behavior                  |

## 📝 Output Expectations

- Align all findings strictly with the auditor core JSON schema. Do not generate, suggest, or modify code.
- Classify severity accurately:
  - `critical`: Violates React core rules, causes infinite render loops, or breaks type safety fundamentally.
  - `high`: Stale closures, missing cleanup, impossible state combinations, or broken reconciliation.
  - `medium`: Defensive gaps, unjustified memoization, missing unmount guards, or context misuse.
  - `low`: Best practice deviations, minor dependency omissions without runtime impact, or non-critical architectural preferences.
- Provide exact line references, violated pattern rule, and actionable, framework-compliant remediation guidance.
- Verify findings against React 18+ concurrent rendering model and strict mode behavior.
- Mention briefly when Context7 was consulted for React hook specifications, dependency array guidelines, or state management best practices.

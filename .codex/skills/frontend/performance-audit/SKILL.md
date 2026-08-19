---
name: performance-audit
description: Audits frontend code for rendering inefficiencies, unnecessary re-renders, heavy computations, unstable keys, and bundle impact risks. Use when analyzing complex UI, large datasets, or explicit performance tuning requests.
compatibility: React 18+, TypeScript 5+, Vite 8+, TailwindCSS 4+. Applies to client-side rendering and build-time performance.
metadata:
  author: junforever
  version: '2.0'
  category: performance
---

# Performance Audit Skill for React + TypeScript

Apply this skill ONLY when the codebase exhibits measurable rendering bottlenecks, handles large datasets, uses heavy transformations, or explicit performance optimization is requested. For standard UI components with normal render patterns, rely on the auditor core rules.

## 🎯 When to Activate

Activate this skill when the code or task involves:

- Rendering lists, grids, or tables exceeding 100 visible items.
- Heavy inline computations, parsing, or data transformations during render.
- Complex conditional rendering chains or deeply nested ternary operators.
- Explicit requests for memoization, lazy loading, or bundle size reduction.
- Profiling results indicating excessive re-renders, long tasks, or layout shifts.
- Dynamic imports, code splitting, or asset optimization strategies.

## 📉 Rendering & State Efficiency

- Check for missing `AbortController` or cleanup functions in async `useEffect` hooks that leave pending network requests, timers, or intervals active on component unmount, causing memory leaks and wasted resources.
- Flag parallel boolean state flags (`isLoading`, `isError`, `isSuccess`) that cause redundant renders or inconsistent UI states.
- Verify that state is kept as local as possible and not unnecessarily lifted or duplicated across components.
- Check for inline object or function creation inside hot render paths that trigger referential instability in child components.
- Ensure list items use stable, unique, and predictable keys; flag array indices as keys for dynamic, reorderable, or filtered lists.
- Verify that `useEffect` dependency arrays are exhaustive and do not cause cascading or infinite update loops.

## 📦 Bundle Size & Asset Impact

- Flag synchronous imports of heavy third-party libraries when only a subset of functionality is utilized.
- Verify that off-screen images, videos, or iframes use `loading="lazy"` or equivalent async rendering attributes.
- Check for unoptimized asset formats, missing `decoding="async"`, or explicit dimension attributes that trigger layout shifts.
- Ensure Vite and TypeScript configurations enable tree-shaking, dead code elimination, and chunk splitting in production builds.
- Flag unnecessary global polyfills or legacy dependencies that increase initial payload without browser support justification.
- Verify that dynamic imports or lazy-loaded routes include meaningful fallback UI to prevent user-perceived delays.

## ⚡ Data & Computation Patterns

- Check for expensive synchronous operations (sorting, filtering, parsing, schema validation) executed directly in the render phase.
- Flag missing debouncing or throttling on scroll, resize, input, or hover handlers that trigger frequent state updates or DOM measurements.
- Verify that large data transformations are memoized, offloaded to Web Workers, or deferred until explicitly required by the UI.
- Check for synchronous network calls or blocking promise chains that stall main thread execution.
- Ensure async state updates do not trigger multiple redundant renders; verify batching or unified state patterns are applied.

## 🔍 React-Specific Performance Risks

- Flag unnecessary or indiscriminate use of `React.memo`, `useMemo`, or `useCallback` without profiling justification or referential stability need.
- Verify that context providers do not wrap entire application trees with frequently changing values, causing widespread re-renders.
- Check for stale closures resulting from missing dependencies or outdated references in callbacks and effects.
- Flag misconfigured `Suspense` or concurrent features that cause waterfall requests or hidden rendering bottlenecks.
- Ensure custom hooks do not re-execute expensive logic on every render unless explicitly designed to do so.

## 🔍 STANDARDS & DOCUMENTATION

- Consult Context7 for TanStack Virtual Guide.
- Known Library IDs:
  - TanStack Virtual: /tanstack/virtual

## 📊 Anti-Patterns to Flag

| Pattern                                                      | Severity | Why It Matters                                                        |
| ------------------------------------------------------------ | -------- | --------------------------------------------------------------------- |
| Array index keys for dynamic or filtered lists               | High     | Causes incorrect reconciliation, state bugs, and wasted render cycles |
| Heavy synchronous computation inside render phase            | High     | Blocks main thread, drops FPS, increases Time to Interactive          |
| Unnecessary `memo`/`useMemo`/`useCallback` without profiling | Medium   | Increases bundle size, adds cognitive overhead, marginal runtime gain |
| Missing cleanup or `AbortController` in async effects        | Medium   | Causes memory leaks, race conditions, and wasted network/CPU cycles   |
| Context providers with frequently changing reference values  | Medium   | Triggers cascade re-renders across unrelated component trees          |
| Inline styles or objects passed as props in hot paths        | Low      | Increases garbage collection pressure, breaks child memoization       |
| Missing `loading="lazy"` or dimensions for below-fold media  | Low      | Increases initial payload, triggers cumulative layout shift (CLS)     |

## 📝 Output Expectations

- Align all findings strictly with the auditor core JSON schema. Do not generate, suggest, or modify code.
- Classify severity accurately:
  - `critical`: Direct main-thread blocking, infinite render loops, or severe memory leaks.
  - `high`: Significant re-render waste, unstable keys causing state corruption, or heavy sync work during render.
  - `medium`: Defensive gaps, unjustified memoization, missing cleanup, or context misuse with measurable impact.
  - `low`: Best practice deviations, minor GC pressure, or non-critical asset/loading optimizations.
- Provide exact line references, violated performance rule, and actionable, framework-agnostic remediation guidance.
- Verify findings against production build behavior and React 18+ concurrency model assumptions.
- Mention briefly when Context7 was consulted for profiling APIs, Vite build configurations, or optimization library specifications.

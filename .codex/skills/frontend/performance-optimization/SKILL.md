---
name: performance-optimization
description: Implements targeted frontend performance improvements for React + TypeScript + Vite + TailwindCSS. Use when tasks involve slow renders, large datasets, bundle size reduction, lazy loading, or explicit performance tuning.
compatibility: React 18+, TypeScript 5+, Vite 5+, TailwindCSS 4+. Requires profiling tools or explicit performance metrics before optimization.
metadata:
  author: junforever
  version: '1.0'
  category: performance
---

# Performance Optimization Skill for React + TypeScript

Apply this skill ONLY when a measurable performance issue exists, the dataset/component complexity justifies optimization, or explicit performance tuning is requested. For standard components with normal render patterns, rely on the core agent rules.

## 🎯 When to Activate

Activate this skill when the task involves:

- Rendering slowdowns or excessive re-renders in complex components.
- Lists or grids exceeding 100-200 visible items requiring virtualization.
- Bundle size growth impacting initial load or Time to Interactive (TTI).
- Heavy computations, parsing, or data transformations blocking the main thread.
- Route or component lazy loading to reduce initial payload.
- Explicit requests for memoization, code splitting, asset optimization, or build tuning.
- Profiling results indicating specific bottlenecks in React DevTools or Lighthouse.

## 📉 Rendering & State Efficiency

- Measure before optimizing; use React DevTools Profiler or browser performance tools to identify actual bottlenecks.
- Keep state as local and minimal as possible; lift state only when necessary for sibling communication.
- Derive computed values during render instead of storing them in separate state variables.
- Stabilize props passed to optimized children using consistent references; avoid inline objects or functions in hot paths unless they are trivial.
- Apply `React.memo`, `useMemo`, and `useCallback` only when profiling proves a measurable rendering or referential stability benefit.
- Batch related state updates to prevent cascading renders; rely on React 18+ automatic batching when possible.
- Avoid expensive computations, large array transformations, or heavy schema validation inside the render phase.

## 📦 Bundle Size & Code Splitting

- Use dynamic `import()` to code-split heavy components, routes, or third-party libraries that are not required on initial load.
- Implement lazy loading with `<React.Suspense>` and meaningful fallback UI to prevent layout shifts during chunk loading.
- Audit third-party dependencies; replace heavy libraries with lighter, tree-shakeable alternatives when functionality overlaps.
- Ensure Vite and TypeScript configurations enable tree-shaking and dead code elimination in production builds.
- Analyze bundle composition using visualization tools before and after changes to verify payload reduction.
- Avoid importing entire UI/component libraries when only specific modules are needed.

## 🖼️ Asset & DOM Optimization

- Optimize images using modern formats (WebP, AVIF), explicit dimensions, and `loading="lazy"` or `decoding="async"` for off-screen media.
- Use `content-visibility: auto` or CSS containment for complex, off-screen sections to reduce layout and paint costs.
- Prefer CSS transforms and opacity for animations over properties that trigger layout or paint (e.g., `width`, `height`, `top`, `left`).
- Respect `prefers-reduced-motion` to skip non-essential animations for users who require it.
- Minimize DOM depth and avoid unnecessary wrapper elements that increase reconciliation overhead.
- Use stable, unique, and predictable keys for list items; never use array indices as keys for dynamic or reorderable lists.

## ⚡ Virtualization & Large Datasets

- Implement windowing or virtualization libraries (`@tanstack/react-virtual`) for lists or grids rendering hundreds or thousands of items.
- Render only the visible viewport plus a small overscan buffer; dynamically calculate item heights or use fixed heights when possible.
- Debounce or throttle scroll, resize, and input handlers that trigger expensive calculations or DOM measurements.
- Offload heavy data processing to Web Workers if transformations block the main thread for >50ms.
- Ensure virtualized components maintain accessibility, focus management, and keyboard navigation parity with standard lists.

## 🏗️ Architecture & Build Awareness

- Keep performance logic isolated from business logic; extract optimization patterns into reusable hooks or utilities.
- Configure Vite to split vendor chunks, optimize polyfills, and leverage native ESM features in development.
- Use environment-specific builds; strip development-only logs, warnings, and heavy debugging utilities in production.
- Validate that optimizations do not break SSR hydration, accessibility, or responsive behavior.
- Document performance decisions, trade-offs, and measured improvements in comments or PR descriptions.

## 🔍 STANDARDS & DOCUMENTATION

- Consult Context7 for TanStack Virtual orchestration, Vite build optimization guides, and React concurrent features.
- Known Library IDs:
  - TanStack Virtual: /tanstack/virtual
  - Vite: /vitejs/vite

## 🚫 Anti-Patterns to Avoid

- Applying `memo`, `useMemo`, or `useCallback` universally without profiling evidence or a clear referential stability need.
- Optimizing prematurely for hypothetical bottlenecks instead of addressing measured issues.
- Using array indices as keys for dynamic lists, causing incorrect reconciliation and state bugs.
- Blocking the main thread with synchronous heavy computations, large JSON parsing, or unbatched state updates.
- Importing entire third-party libraries when only a subset of functions is required.
- Sacrificing code readability, maintainability, or accessibility for marginal performance gains.
- Ignoring browser native optimizations (e.g., CSS `will-change`, hardware acceleration, lazy loading attributes).
- Over-engineering build configurations without verifying actual bundle size or runtime improvements.

## 📝 Output Expectations

- Identify the specific bottleneck or optimization target before implementing changes.
- Provide the optimized component or hook with clear documentation of what changed and why.
- Include measurable expectations or profiling steps to validate the improvement.
- Ensure optimizations do not introduce memory leaks, stale closures, broken accessibility, or layout shifts.
- Verify TypeScript compilation, lint rules, and Vite build compatibility after changes.
- Mention briefly when Context7 was consulted for library-specific optimization APIs or build configurations.

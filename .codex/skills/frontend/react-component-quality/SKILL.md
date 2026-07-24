---
name: react-component-quality
description: Use when implementing or refactoring React components that need better structure, maintainability, state design, composition, custom hooks, separation of logic and UI, reusable component APIs, or reduced unnecessary re-renders.
compatibility: React 18+, TypeScript 5+, Vite 5+, TailwindCSS 4+.
metadata:
  author: junforever
  version: '1.0'
  category: quality
---

# React Component Quality

## Purpose

Use this skill to produce React components that are simple, composable, predictable, maintainable, performant enough for their context, and easy to test.

Prefer pragmatic component design over heavy architecture.

## When to use

Use this skill when the task involves:

- Reusable components.
- Components with multiple UI states.
- Components with non-trivial props.
- Components with local state design decisions.
- Components with conditional rendering.
- Components that are becoming hard to read.
- Custom hooks.
- Component extraction.
- Logic and presentation separation.
- Refactoring React components.
- Avoiding unnecessary re-renders.
- Improving testability.

Do not use this skill for tiny cosmetic changes unless component quality is directly affected.

## Component responsibility

- Give each component one clear primary responsibility.
- Split components by meaningful responsibility, not by arbitrary line count.
- Extract child components when a UI section has independent meaning.
- Extract logic when it distracts from rendering.
- Avoid components that combine unrelated concerns such as data loading, filtering, modal management, table rendering, form handling, notification handling, and formatting.
- Avoid creating many tiny components when inline JSX remains clearer.
- Preserve current behavior during refactors unless behavior changes are explicitly requested.

## State design

- Keep state minimal, local, and predictable.
- Prefer derived values over duplicated state.
- Avoid storing values that can be calculated during render.
- Avoid multiple state variables that can contradict each other.
- Use a single explicit status or discriminated union for mutually exclusive states.
- Move state up only when multiple components truly need it.
- Keep state close to the component that needs it.
- Avoid global state unless the project already uses it or the state is genuinely application-level.
- Avoid request, form, modal, and UI state leaking into unrelated parent components.

## Props design

- Keep props minimal, explicit, and aligned with real usage.
- Prefer clear prop names that describe intent.
- Avoid vague props such as generic `data`, `config`, `options`, `metadata`, or `flag` unless they are truly appropriate.
- Avoid overly flexible component APIs that make behavior difficult to predict.
- Use variants instead of multiple booleans when values are mutually exclusive.
- Keep exported component prop types explicit.
- Do not expose internal implementation details through props.
- Preserve public props during refactors unless a breaking change is intended.

## Composition

- Prefer composition over excessive configuration.
- Use configuration when the component has a stable repeated pattern.
- Use composition when consumers need flexible layout or content.
- Avoid large configuration-object components unless the abstraction is intentional and clearly useful.
- Keep component APIs easy to understand from the call site.
- Avoid abstractions that hide simple behavior without improving reuse or clarity.

## Custom hooks

- Extract custom hooks for reusable stateful behavior or complex component logic.
- Use custom hooks for complex event handling, browser APIs, subscriptions, timers, reusable UI state, or async UI behavior.
- Do not extract a hook only to hide simple one-line state.
- Keep hooks focused on one responsibility.
- Avoid hooks that return too many unrelated values.
- Avoid hooks that combine unrelated concerns.
- Make hook return values predictable and easy to consume.
- Keep side effects inside hooks focused and properly cleaned up.

## Rendering logic

- Keep JSX readable and intention-revealing.
- Avoid deeply nested ternaries and complex inline branching.
- Use early returns or named branches when states are mutually exclusive.
- Use named boolean variables for important conditions.
- Avoid placing complex business decisions directly inside JSX.
- Keep small inline conditions when they remain readable.
- Avoid rendering branches that silently hide important error, empty, or disabled states.

## Effects

- Avoid unnecessary `useEffect`.
- Do not use effects to derive state that can be calculated during render.
- Use effects only to synchronize with external systems, browser APIs, subscriptions, timers, external widgets, DOM integrations, or async work when appropriate.
- Keep each effect focused on one concern.
- Clean up subscriptions, timers, listeners, and async work when needed.
- Avoid effects that update state unnecessarily.
- Avoid unstable dependencies and stale closures.
- Extract complex effect logic into a focused custom hook or helper.

## Re-render awareness

- Avoid unnecessary re-renders through better state placement before adding memoization.
- Avoid parent state updates for interactions that are local to a child.
- Avoid duplicated state that causes extra updates.
- Avoid passing unstable objects or functions to memoized children when referential stability matters.
- Avoid expensive calculations during render when they are not needed.
- Do not add `useMemo`, `useCallback`, or `React.memo` by default.
- Use memoization only for clear expensive computations, referential stability requirements, or measured/reasoned performance issues.
- Keep memoization dependencies simple and correct.
- Do not trade readability for premature performance optimization.

## TypeScript quality

- Use TypeScript to make invalid states harder to represent.
- Prefer precise component contracts without over-engineering.
- Avoid `any` unless there is a strong reason.
- Prefer union types or discriminated unions for mutually exclusive states.
- Keep generic component APIs simple.
- Avoid unsafe casts to bypass real typing problems.
- Keep internal types close to the component unless reused elsewhere.

## Logic and presentation

- Keep logic and presentation together when the component is simple.
- Separate logic from presentation when it improves readability, reuse, or testability.
- Extract helpers for repeated formatting, mapping, or branching logic.
- Extract custom hooks for reusable or complex stateful behavior.
- Avoid forcing container/presenter patterns when they add ceremony without value.
- Keep formatting and transformation logic out of JSX when it makes rendering noisy.

## Error and empty states

- Represent meaningful UI states clearly.
- Consider loading, empty, error, success, disabled, and pending states when relevant.
- Do not add states mechanically when they do not apply.
- Fail gracefully when optional or missing data is expected.
- Avoid contradictory UI states.
- Avoid silent failures in user-visible behavior.

## Testability

- Design components to be testable through user-observable behavior.
- Prefer semantic HTML and accessible labels.
- Avoid implementation details that make tests brittle.
- Avoid hidden mutable module state.
- Avoid components that require excessive setup for simple behavior.
- Do not add test IDs before considering accessible queries.
- Extract logic when testing through the UI becomes unnecessarily difficult.

## Refactoring rules

- Preserve behavior unless explicitly asked to change it.
- Identify the component’s responsibilities before editing.
- Remove duplicated or contradictory state.
- Extract only when it improves readability, reuse, or testability.
- Keep public props stable unless a breaking change is intentional.
- Avoid mixing unrelated refactors with the requested change.
- Prefer incremental improvements over full rewrites.
- Keep unrelated files untouched.

## Completion checklist

Before finishing, verify:

- The component has a clear responsibility.
- State is minimal, local, and predictable.
- Derived values are not stored unnecessarily.
- Props are understandable and not overly generic.
- JSX is readable.
- Effects are necessary, focused, and cleaned up.
- State is placed close to where it is used.
- Unnecessary re-renders were avoided through state design first.
- Memoization was not added without a clear reason.
- Logic extraction improves clarity instead of hiding simple code.
- The component remains easy to test from the user’s perspective.
- No heavy architecture was introduced.

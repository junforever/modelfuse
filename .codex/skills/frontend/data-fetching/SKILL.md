---
name: data-fetching
description: 'Implements robust React data fetching patterns using Axios: retries, cancellation, caching, and async state management. Use when tasks require complex async flows beyond simple one-time requests.'
compatibility: React 18+, TypeScript 5+, Vite 8+, TailwindCSS 4+, Axios 1.x, Zod 3.x.
metadata:
  author: junforever
  version: '2.0'
  category: async-patterns
---

# Data Fetching Skill (Axios) for React + TypeScript

Apply this skill ONLY when data fetching complexity exceeds a simple one-time request. For basic Axios calls with loading/error states, use the core `frontend-builder` rules instead.

## 🎯 When to Activate

Activate this skill when the task involves:

- Polling or periodic refresh of data.
- Retry logic with exponential backoff or jitter.
- Optimistic UI updates with rollback capability.
- Request caching, deduplication, or Axios interceptors.
- Complex orchestration (parallel/sequential requests, dependency chains).
- Cancellation of in-flight requests based on user action or unmount.

## 🔄 Async State Management

- Model async state explicitly using a discriminated union: `{ status: 'idle' | 'loading' | 'success' | 'error' | 'refreshing', data: T | null, error: Error | AxiosError | null }`.
- Derive all UI state from this single source of truth. Avoid parallel booleans like `isLoading` and `isError`.
- Use `useReducer` or a state machine for complex flows; `useState` is sufficient for simple fetches.
- Include `refreshing` status for background refetch scenarios to preserve existing data during updates.

## 🛑 Cancellation & Cleanup with AbortController

- ALWAYS pass `AbortSignal` to Axios requests via config: `{ signal: controller.signal }`.
- Cancel in-flight requests on unmount or when critical dependencies change using `AbortController`.
- Distinguish cancellation from real errors using `axios.isCancel()` or checking for `CanceledError`.
- Guard state updates with a mounted flag or `AbortController` to prevent memory leaks and race conditions.
- Never let unhandled promise rejections escape; always catch and translate to UI state or log appropriately.
- Clean up all timers, intervals, and event listeners in `useEffect` cleanup functions.

## ✅ Runtime Validation & Type Safety with Axios & Zod

- Deserialize Axios `response.data` as `unknown`.
- **MANDATORY**: Validate the payload with a Zod schema before casting to `T`. Never trust `response.status === 200` as a guarantee of valid data structure.
- Use `AxiosResponse<unknown>` as the initial type; narrow defensively after Zod validation.
- Map validation errors to user-friendly messages; keep internal error details for logging only.
- Consult Context7 (`/axios/axios`, `/colinhacks/zod`) for version-specific APIs and type utilities before implementation.

## 🔁 Retry & Polling Strategies with Axios

- Implement exponential backoff with jitter for retries unless a constant interval is explicitly specified.
- Cap retries at 3 by default. Expose a `maxRetries` parameter for configurability.
- Skip retry logic for client errors (4xx) unless explicitly required; focus retries on server errors (5xx) or network failures.
- For polling, use `setInterval` or recursive `setTimeout` with proper cleanup. Pause polling on `document.hidden` or after consecutive errors.
- Provide manual retry triggers in the UI when polling fails or unrecoverable errors occur.

## ⚡ Optimistic Updates & Simple Caching

- Only use optimistic UI when rollback is trivial and network failure probability is low.
- Keep a `pendingData` snapshot to enable rollback on 4xx/5xx responses or network failures.
- For simple caching, leverage Axios default `Cache-Control` header handling or a lightweight in-memory `Map` keyed by request URL + params.
- Invalidate cache on mutation or after TTL (default: 5 minutes). Do not build a full cache layer unless explicitly requested.
- Avoid global Axios defaults for feature-specific caching; prefer isolated instances or hook-level cache management.

## 📦 Architecture & Hook Pattern

- Extract all fetching logic into a custom hook: `useXxxFetcher(url, options)`.
- Return a stable, predictable object shape: `{ state, refetch, cancel, isRetrying }` where `state` is the discriminated union.
- Keep the hook pure of UI logic. Accept configuration via an options object with typed parameters.
- Isolate Axios instance creation per feature/module when custom configs (interceptors, base URL, headers) are needed.

## 🚫 Anti-Patterns to Avoid

- Missing `AbortSignal` in Axios config or missing cleanup in `useEffect`.
- Using multiple boolean flags (`isLoading`, `isError`, `isSuccess`) instead of a unified state union.
- Directly calling `setLoading(true)` then `setLoading(false)` in multiple branches without a finally-like pattern.
- Assuming `response.status === 200` or `response.ok` means valid JSON structure without Zod validation.
- Over-memoizing fetch functions or data arrays without profiling or a proven referential stability need.
- Using global Axios defaults for feature-specific behavior without isolation, causing cross-feature side effects.
- Ignoring `axios.isCancel()` and treating cancellation as a real error in UI state.
- Creating fragmented UI error states (e.g., separate UI branches for 400, 401, 500). The hook should consolidate API failures into a single `error` state for the UI to handle gracefully.
- **Mixing Polling Lifecycle with State Synchronization in `useEffect`**: **NEVER** mix interval/polling lifecycle management with state synchronization (e.g., syncing refs, updating tracking Sets) in the same `useEffect` if they have different dependency lifecycles.
  - **ALWAYS** apply the Single Responsibility Principle to effects:
    1.  **Lifecycle Effects:** Manage the interval/polling. Dependencies should ONLY include identity-critical variables (e.g., `sessionId`, `userId`, `endpoint`) that require a full hard-reset of the polling state.
    2.  **Synchronization Effects:** Manage refs or tracking sets. Dependencies include the data arrays/objects. These must NOT touch the interval or polling cursors.
  - **Heuristic check before adding to dependency array:** If this variable changes, should it restart EVERYTHING the effect does, or only a part?. If only a part, it belongs in a separate effect.

## 📝 Output Expectations

- Provide the custom hook first, then the consuming component.
- Include TypeScript interfaces for request params, response shapes, and hook options.
- Add runtime validation with Zod schema; never cast `unknown` directly.
- Document retry/polling configuration, cancellation behavior, and cache strategy in comments or JSDoc.
- Verify: no unhandled promise rejections, correct `useEffect` dependency arrays, clean TypeScript compilation (`strict` mode), and proper cleanup on unmount.
- Mention briefly when Context7 was consulted and what decision it affected.

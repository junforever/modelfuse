---
name: frontend-integration-testing
description: Implement and maintain deterministic React integration tests in Vitest/jsdom using React Testing Library and user-event. Use when real components must collaborate with hooks, context providers, router state, TanStack Query or another application cache, mutations, infinite queries, dialogs, forms, and controlled HTTP/EventSource transports; when validating observable loading, empty, success, error, disabled, focus, navigation, cache update/invalidation, stream reconnection, or cleanup behavior across those components; or when diagnosing provider leakage, shared QueryClient state, unawaited React updates, stale cache, duplicate subscriptions, or transport fakes. Do not use for isolated component/hook unit tests, CSS assertions, real backend/PostgreSQL integration, or behavior requiring a real browser and Playwright.
---

# Frontend Integration Testing

Exercise the smallest real React composition that owns the behavior. Keep component, hook, provider, router, and cache collaboration real; control only the network or browser boundary that jsdom cannot supply faithfully.

## Prerequisite

Start from the contract produced by `integration-test-design`:

- One boundary intention.
- Real and controlled participants.
- Observable UI/cache/navigation oracles.
- Deterministic transport behavior.
- Cleanup and non-duplicated unit/E2E coverage.

If the intention concerns one isolated component or hook with collaborators mocked, return it to unit testing. If it depends on layout, real focus navigation, browser EventSource, reload, download, or cross-page browser lifecycle, return it to E2E.

## Define the React Boundary

Keep only providers needed by the behavior:

- Application context.
- Router and route configuration.
- Query/cache client.
- Theme, locale, feature configuration, or state provider only when behavior depends on it.
- Real component tree containing the collaborating hooks and views.

Control the next boundary:

- HTTP client/server response.
- EventSource/WebSocket-like transport represented by an existing typed fake.
- Clock, randomness, storage, clipboard, observer, or other browser API absent from jsdom.

Do not mock the hook, provider, cache, router, or child component whose collaboration is the test subject.

## Build the Render Harness

Reuse the repository's established custom render helper. Create or extend one only when at least two tests need the same meaningful provider composition.

Prefer a test-local factory that creates fresh state:

```tsx
function renderFeature(ui: React.ReactElement, route = '/') {
  const queryClient = createTestQueryClient();
  const user = userEvent.setup();

  return {
    user,
    queryClient,
    ...render(ui, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
        </QueryClientProvider>
      ),
    }),
  };
}
```

Adapt names and router APIs to the installed versions and repository conventions.

- Create a new QueryClient/cache per test.
- Create a new router/history state per test.
- Create `userEvent.setup()` per test or render result.
- Pass only required provider configuration.
- Return controlled handles only when assertions or teardown need them.
- Do not build a universal render framework for speculative combinations.

## Interact Through the Public UI

Use interactions and queries that reflect user intent:

1. `getByRole` with accessible name.
2. `getByLabelText` for form controls.
3. `getByPlaceholderText` or `getByText` when semantically appropriate.
4. `getByTestId` only when no stable semantic surface exists.

Use `userEvent` for clicks, typing, keyboard navigation, selection, upload, and pointer behavior represented by jsdom. Await every asynchronous user action.

Assert:

- Visible text, roles, names, descriptions, and status messages.
- Enabled, disabled, selected, expanded, checked, or pressed state.
- Focus and restoration when jsdom can model the component contract.
- Visible loading, empty, success, error, and confirmation states.
- Route-visible outcome or location exposed through the test router.

Never assert Tailwind/CSS classes, color values, DOM ancestry, React internals, private hook state, or incidental render counts unless rendering frequency is the explicit performance contract for another test layer.

## Synchronize Asynchronous State

Choose the smallest semantic wait:

- Use `findBy*` when an element should appear asynchronously.
- Use `waitForElementToBeRemoved` when a visible loading/modal element should disappear.
- Use `waitFor` when the assertion is not expressible as a single element query, such as cache or navigation convergence.
- Use synchronous `getBy*` only for state expected immediately after render or an awaited interaction.
- Use `queryBy*` for absence after first proving setup succeeded.

Place the assertion inside `waitFor`; do not poll a mutable flag outside it. Wait for the user-visible result of state updates instead of wrapping application behavior in manual `act()`.

Treat an `act()` warning as evidence of an unawaited update, unfinished transport, timer, or cleanup. Do not silence console warnings.

Never use fixed sleeps, arbitrary `waitFor` timeouts, repeated `act()` calls, or flush-all-promises helpers as universal synchronization.

## HTTP and Mutation Integration

Keep the component, real data hook, query/mutation library, cache, and UI composition real. Control HTTP at the repository's established boundary.

- Reuse the installed request interceptor/fake server or typed API client fake.
- Do not add MSW or another dependency if the repository already has a sufficient boundary.
- Match requests narrowly by method and path.
- Return protocol-faithful status, headers, and body.
- Fail the test on unexpected requests.
- Reset handlers and captured requests after every test.

For a request intention, assert the user-visible transition and relevant cache/durable projection. Avoid asserting internal Axios/fetch calls when the observable result proves the contract.

### Loading and success

- Hold the controlled response behind an explicit promise gate when loading state must be observed.
- Assert loading semantics before releasing the response.
- Release the response and await the final visible state.
- Assert stale data, disabled actions, or optimistic state only when contracted.

### Error and recovery

- Return one representative failure for a shared user-visible error mapping.
- Assert a safe visible error and permitted recovery action.
- Add separate status cases only when product behavior differs.
- Verify retry or dismissal through user interaction, not internal mutation methods.

### Mutations and invalidation

- Seed only cache entries required by the intention.
- Trigger the real mutation through the UI.
- Assert optimistic state only if it is a product contract.
- Resolve or reject the controlled request explicitly.
- Assert final cache/UI convergence and required invalidation/refetch behavior.
- Avoid inspecting private query observer internals or incidental request counts.

## Query Cache Isolation

- Create a fresh client per test; never export a shared test singleton.
- Disable automatic retries in the test client when retry behavior is not under test and the repository permits that test convention.
- Preserve production retry behavior when retry itself is the intention.
- Set cache/stale timing explicitly only when it affects the contract.
- Clear and dispose of the client after the rendered tree unmounts.
- Assert cache content only when cache ownership or invalidation is the behavior; otherwise assert the UI.

For infinite queries:

- Seed deterministic pages and cursors.
- Trigger page loading through the public control or observer seam already used by the feature.
- Assert ordered visible items, absence of duplicates, and terminal pagination state.
- Do not simulate real scrolling geometry when jsdom cannot model it; send layout-dependent scrolling to E2E.

## Router Integration

Use the repository's in-memory/data router test setup with explicit initial entries.

- Render the route tree needed by the intention.
- Navigate through visible links, buttons, forms, or mutations.
- Assert the destination screen and route state exposed by the router's public API.
- Include loader/action integration only when the installed router and feature use it.
- Create a new router per test and dispose of subscriptions when required.

Do not mutate `window.location` to bypass the application's router. Use E2E for browser history, full reload, redirects across origins, and lifecycle behavior not represented by the test router.

## Controlled Event Streams

Use the repository's typed EventSource/stream fake. If none exists, create the smallest test-only implementation of the methods and callbacks the production hook actually consumes.

The fake must support:

- Constructor URL capture without credentials.
- `open`, named message/event, and `error` delivery.
- Listener registration/removal or callback properties used by the app.
- Ready-state transitions required by the contract.
- Observable idempotent `close()`.
- Independent instances so tests and resources cannot leak events.

Create the fake before rendering, then:

1. Render the real hook/component/provider/cache composition.
2. Assert exactly the intended subscription target.
3. Emit controlled events after handlers are registered.
4. Await visible/cache convergence.
5. Emit duplicates or older versions only when idempotency is contracted.
6. Unmount or reach terminal state.
7. Assert close and listener cleanup.

Do not test native browser reconnection timing or networking in jsdom. Test the application's reaction to controlled `open`/`error`/event sequences; send native behavior to E2E.

## Dialogs, Forms, and Focus

- Open dialogs and submit forms through real controls.
- Query by role/name and assert validation or confirmation semantics.
- Verify disabled/enabled transitions through observable state.
- Verify focus placement/restoration when the component library's jsdom behavior is stable and part of the contract.
- Use real validation hooks/providers inside the selected boundary.
- Keep exhaustive schema permutations at unit level.

Do not test styles, animation timing, pixel position, or browser-specific focus quirks here.

## Cleanup and Leakage

After every test:

- Unmount the rendered tree.
- Close controlled streams and remove listeners.
- Reset HTTP handlers and reject unexpected pending requests.
- Clear/dispose query clients and routers.
- Restore environment variables, browser globals, spies, observers, storage, clocks, and timers changed by the test.
- Run only pending timers owned by the test before restoring real timers when necessary.
- Fail on unhandled rejections, console errors, or open handles not expected by the intention.

Do not use global cleanup to hide which fixture leaked. Keep ownership local and explicit.

## Failure Diagnosis

Classify the first meaningful failure:

- **Product defect**: real React collaborators violate the specified visible behavior.
- **Test defect**: render harness, query, assertion, transport fake, or cleanup misrepresents the boundary.
- **Environment defect**: jsdom, library setup, required polyfill, or configuration is missing/incompatible.
- **Contract drift**: UI, hook, cache, or transport expects incompatible public shapes.
- **Flake**: shared cache/router/global, unawaited update, timer, or listener changes the outcome.

Fix only integration-owned tests, fixtures, setup, and fakes. Preserve and report product defects to the frontend builder with reproduction, expected result, actual result, and failing test.

## Verification Contract

After implementation:

1. Run the focused test file with retries disabled.
2. Confirm no real backend or external endpoint was contacted.
3. Confirm no `act()` warning, unhandled request, console error, open timer, cache, or listener remains.
4. Run the related frontend integration group when risk justifies it.
5. Report exact command, environment, pass/fail counts, retries, duration, and cleanup.

## Rejection Checklist

Reject or revise a test that:

- Mocks the component/hook/provider/cache collaboration under test.
- Uses shared QueryClient, router, transport, or mutable global state.
- Calls hooks or mutation methods instead of interacting through the selected public UI.
- Uses CSS classes, DOM structure, private state, or broad snapshots as the oracle.
- Uses sleeps, manual `act()` loops, arbitrary timeouts, or retry-only success.
- Ignores unexpected HTTP requests or stream events.
- Uses jsdom to claim real browser lifecycle, layout, native reconnection, or scrolling behavior.
- Duplicates unit permutations or an existing browser journey.
- Leaves requests, streams, listeners, caches, routers, timers, or globals dirty.
- Changes production code to make the test pass.

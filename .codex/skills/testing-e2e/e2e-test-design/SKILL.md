---
name: e2e-test-design
description: Design the smallest high-value browser end-to-end journey for a web acceptance scenario. Use when deciding whether behavior genuinely requires E2E coverage, translating specifications or regression reports into Playwright journeys, selecting observable assertions and safe setup boundaries, eliminating redundant browser tests, or diagnosing a proposed E2E test that is too broad, brittle, or better covered at a lower test layer.
---

# E2E Test Design

Design a focused journey before writing browser automation. Keep E2E coverage for risks that require a real browser crossing application boundaries.

## Workflow

### 1. Apply the layer gate

Choose E2E only when the outcome requires a real browser plus at least one application boundary. Typical signals include:

- Persist or recover state through the frontend and backend.
- Verify behavior after navigation, reload, reconnection, or a second browser context.
- Prove isolation between users, sessions, conversations, tabs, or resources.
- Exercise a critical journey spanning several layers.
- Observe browser lifecycle behavior, streaming, redirects, downloads, or uploads.

Redirect the scenario when a lower layer proves it more directly:

- Pure calculation, validation, mapper, reducer, or component state → unit.
- HTTP contract, service/repository collaboration, database constraint, migration, or stream protocol without browser behavior → integration.
- Pixel-level appearance → visual regression.
- Throughput, latency distribution, saturation, or endurance → performance.

Record the layer decision in one sentence. Do not create an E2E test merely because the behavior is important.

### 2. State one user intention

Write one sentence using this form:

> Given [essential precondition], when [single user intention], then [observable outcome].

Keep one coherent intention per test. Include several assertions only when they jointly prove that intention. Split a journey when failures would have unrelated causes or require unrelated setup.

### 3. Select the shortest complete path

List only actions required to trigger and observe the behavior. Remove navigation and setup that do not belong to the intention.

- Establish long preconditions through an existing safe fixture or setup API.
- Use the UI for the behavior under test.
- Verify persistence through reload, reopen, or another public surface only when persistence is part of the requirement.
- Verify isolation on both sides: confirm the result at its origin and its absence from the unrelated destination.
- End as soon as the intended outcome is proven.

Do not combine independent acceptance scenarios into a single tour of the application.

### 4. Define controlled boundaries

Keep the application's browser-to-backend path real. Replace only external dependencies that are uncontrolled, costly, destructive, rate-limited, or unavailable.

For each boundary, classify it as:

- **Real**: application frontend, backend, persistence, or browser feature required by the journey.
- **Deterministic fake**: third-party provider or external service whose variability is not under test.
- **Setup-only**: safe public API or fixture used solely to establish preconditions.

Reject designs that mock the application API so extensively that no complete application boundary remains.

### 5. Define observable oracles

Choose assertions visible through the browser or public product surface:

- Accessible text, role, label, focus, enabled/disabled state, or status.
- URL or navigation outcome.
- State retained after reload or reopen.
- Result visible in the originating resource and absent elsewhere.
- User-facing error and permitted recovery action.
- Terminal state after a documented asynchronous transition.

Avoid CSS classes, component structure, private state, database implementation details, incidental request counts, and arbitrary timing. Assert protocol details only when the protocol itself is the acceptance target.

### 6. Design deterministic synchronization

Identify every asynchronous boundary before implementation:

- Register event or response observation before the triggering action.
- Wait on a meaningful state, locator, URL, response, or supported readiness signal.
- Avoid fixed sleeps and universal `networkidle` waits.
- Define controlled provider responses and ordering for concurrent or streaming flows.
- Give explicit time bounds only when the requirement defines them.
- Treat retries as diagnostics, never as the synchronization strategy.

If no deterministic observation exists, report the missing testability boundary instead of guessing a timeout.

### 7. Plan isolation and cleanup

Define ownership for every resource created by the test.

- Use unique run- or worker-scoped identifiers.
- Avoid shared mutable fixtures.
- Make setup and teardown idempotent.
- Delete only resources created by the current run.
- Prefer disposable test environments supplied by the project.
- Ensure the test can pass independently and in a different order.

Do not design broad cleanup, shared-table truncation, or production-facing execution.

### 8. Remove redundant coverage

Compare the proposed journey with existing unit, integration, and E2E coverage.

- Keep one E2E test for one critical intention.
- Leave detailed validation permutations and provider error matrices to lower layers.
- Add another browser journey only when it proves a distinct cross-boundary risk.
- Prefer extending an existing coherent journey over duplicating its setup and assertions.
- Do not chase coverage percentages with browser tests.

## Design Contract

Before implementation, produce this compact contract:

```markdown
### Layer decision
[Why E2E is or is not required]

### User intention
[Single Given/When/Then sentence]

### Preconditions
[Minimum setup and ownership of test data]

### Journey
1. [User action]
2. [User action]
3. [Observable checkpoint]

### Oracles
- [Observable assertion]

### Boundaries
- Real: [...]
- Faked: [...]
- Setup-only: [...]

### Determinism and cleanup
- [Synchronization, isolation, and teardown]

### Lower-layer coverage
- [Permutations intentionally delegated to unit/integration tests]
```

If the layer decision rejects E2E, stop and identify the correct test layer and owner. If implementation was requested and E2E is justified, use this contract as the test's scope and proceed without adding unrelated journeys.

## Quality Check

Reject or revise the design when any answer is yes:

- Can a unit or integration test prove the same outcome with equal confidence?
- Does the journey contain more than one independent user intention?
- Does setup dominate the behavior under test?
- Is an assertion tied to CSS, framework state, private data, or arbitrary timing?
- Is the application's own boundary mocked away?
- Can the test pass without proving the intended outcome?
- Can parallel execution make the data collide?
- Does cleanup risk deleting data not created by the test?
- Does the design rely on retries or sleeps to appear stable?

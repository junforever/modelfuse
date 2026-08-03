---
name: integration-test-design
description: Design the smallest high-value integration test across real collaborating components without a browser. Use when deciding whether a behavior belongs at integration level; translating specifications, defects, or contracts into tests for Express/Supertest, PostgreSQL repositories and transactions, Liquibase migrations, HTTP/SSE protocols, provider adapters with deterministic fakes, or React components with real providers and cache; defining which components stay real versus controlled; selecting observable assertions, data isolation, concurrency coordination, and cleanup; eliminating redundant tests; or rejecting a proposed integration test that is actually unit, E2E, performance, or production testing.
---

# Integration Test Design

Design the boundary before writing test code. Keep only the components whose collaboration creates the risk, then control the next external dependency.

## Workflow

### 1. Apply the layer gate

Choose integration only when the result depends on at least two real collaborating components and does not require a real browser.

Typical integration boundaries:

- Express middleware, route, controller, service, and error translation.
- Repository or service behavior against real PostgreSQL.
- Transactions, locks, constraints, indexes, cascades, cursors, or recovery.
- Liquibase migrate, validate, rollback, and reapply behavior.
- HTTP or SSE protocol behavior through a real application endpoint.
- Provider adapter serialization and normalization against a deterministic fake.
- React components collaborating with real hooks, providers, router, or query cache in jsdom.

Redirect the scenario when another layer proves it more directly:

- Pure function, isolated service, isolated hook/component, or fully mocked route → unit.
- Real browser navigation, reload, focus lifecycle, download, or complete user journey → E2E.
- Throughput, saturation, latency distribution, or endurance → performance.
- Pixel appearance → visual regression.
- Live production availability → production operations, never integration.

#### Decision path for a hook/API/database flow

A data-fetching hook whose application flow eventually reaches PostgreSQL can
involve three test layers. Choose the lowest layer that proves the observable
contract:

1. **Pure transformation logic inside the hook**—mapping, filtering, or default
   values—→ unit. Mock the fetch boundary and test the hook's output logic.
2. **Hook + HTTP/EventSource boundary + QueryClient cache collaboration**—loading
   and error states, cache invalidation, or optimistic updates—→ integration via
   `frontend-integration-testing`. Run the hook and cache for real; control the
   network boundary with a deterministic fake. This route does not exercise
   PostgreSQL.
3. **HTTP/SSE endpoint + backend collaborators + PostgreSQL**—persistence,
   transactions, event ordering, or disconnect cleanup—→ integration. Keep the
   relevant route, service, repository, and database behavior real; do not add a
   browser.
4. **Complete user journey**—the user submits, sees streamed output, reloads, and
   observes the persisted result—→ E2E. Exercise the real browser and application
   path, and assert persistence through the public user-visible surface.

Do not promote a scenario unless the lower layer cannot prove its contract. Do
not duplicate the same assertion at multiple layers.

Record the decision in one sentence. Importance alone does not justify integration coverage.

### 2. State one boundary intention

Write one sentence:

> Given [essential state], when [public action crosses the boundary], then [observable contract across collaborators].

Keep one coherent intention per test. Group status, headers, payload, event, and persisted-state assertions when they jointly prove that intention. Split only when setup or failure causes are independent.

### 3. Draw the boundary

List the participants from public entry point to controlled edge. Classify each:

- **Real**: required to prove the collaboration.
- **Controlled**: next external, costly, destructive, unavailable, or nondeterministic dependency.
- **Setup-only**: existing safe fixture or API used only to establish preconditions.
- **Excluded**: behavior intentionally left to unit, E2E, performance, or audit coverage.

At least two collaborating application components must remain real. If deep mocks replace every collaborator, redesign as a unit test.

Examples:

| Intention | Keep real | Control |
|---|---|---|
| HTTP create persists atomically | Express through repository, PostgreSQL | External provider |
| Adapter normalizes response | Adapter, HTTP serialization/parser | Fake provider server |
| Cache applies stream event | Component, hook, QueryClient | EventSource/HTTP boundary |
| Migration restores prior schema | Liquibase, PostgreSQL, validation SQL | Nothing beyond disposable DB |

### 4. Select the narrowest entry point

Start at the highest public surface needed by the contract:

- Use Supertest against `createApp()` for HTTP collaboration without transport-specific sockets.
- Use a loopback ephemeral server only when SSE or socket lifecycle is the contract.
- Call a repository/service directly when HTTP translation adds no relevant risk.
- Use Testing Library when component/provider/cache collaboration is observable in jsdom.
- Invoke the real Liquibase command and catalog/behavior checks when migration state is the subject.

Do not traverse unrelated layers merely to make the test broader.

### 5. Define observable oracles

Assert only evidence required by the public contract:

- HTTP status, safe error code, relevant headers, and response shape.
- Ordered named SSE events and terminal/disconnect behavior.
- Committed rows, absence of partial writes, constraints, locks, or cascade effects.
- Normalized adapter result and safe error mapping.
- Visible semantic UI state, cache convergence, navigation, or invalidation.
- Schema state before migration, after update, after rollback, and after reapply.

Avoid private call order, SQL text, internal method spies, CSS classes, broad snapshots, incidental logs, and assertions already proven more precisely at unit level.

For atomicity, verify both the intended change and absence of partial state. For isolation, verify the origin and non-leakage destination. For idempotency, verify replay identity and no duplicate durable work.

### 6. Design data and environment ownership

Define before execution:

- The exact non-production target.
- Run- and worker-scoped identifiers.
- Minimum seed data.
- Which process, schema, rows, files, ports, accounts, or fake responses the run owns.
- Idempotent teardown limited to owned resources.

Use real PostgreSQL whenever database semantics matter. Prefer a disposable database or isolated schema supplied by the repository. Never design shared-table truncation, unresolved deletion, production credentials, customer data, or real paid provider calls.

### 7. Design deterministic coordination

Identify every asynchronous or concurrent transition:

- Register listeners and waits before triggering the action.
- Coordinate concurrent transactions, snapshot races, or fake responses with explicit barriers.
- Wait for HTTP, event, database, or semantic UI signals.
- Use bounded timeouts tied to a documented operation.
- Give parallel workers isolated mutable resources.
- Close servers, pools, clients, subscriptions, timers, and fake services in teardown.

Do not use sleeps, retry-only success, global timeout increases, serial execution, or shared mutable fixtures as design solutions.

### 8. Remove redundant coverage

Compare the proposed test with existing unit, integration, and E2E coverage:

- Keep one integration test per distinct boundary intention.
- Leave pure permutations and validation matrices to unit tests.
- Leave one critical browser journey to E2E instead of duplicating every integration branch there.
- Extend an existing coherent test when new assertions prove the same intention.
- Add a separate test only when it protects a different collaboration risk or failure mode.

Do not chase coverage percentages with duplicated boundary tests.

## Design Contract

Produce this compact contract before implementation:

```markdown
### Layer decision
[Why integration is or is not the lowest sufficient layer]

### Boundary intention
[Single Given/When/Then sentence]

### Boundary map
- Real: [...]
- Controlled: [...]
- Setup-only: [...]
- Excluded: [...]

### Preconditions and ownership
- Environment: [...]
- Data/resources: [...]

### Action and oracles
1. [Public action]
- [Observable assertion]

### Determinism and cleanup
- [Coordination, isolation, timeout, teardown]

### Non-duplicated coverage
- Unit: [...]
- E2E: [...]
```

If the layer gate rejects integration, stop and identify the correct owner. If implementation was requested and integration is justified, use the contract as the exact test scope.

## Quality Check

Reject or revise the design when any answer is yes:

- Can a unit test prove the same rule with equal confidence?
- Does the scenario require a real browser to be meaningful?
- Are fewer than two collaborating components real?
- Is the boundary wider than the stated intention?
- Is a controlled dependency actually part of the behavior under test?
- Can the test pass without proving the durable or public outcome?
- Does setup dominate the contract being tested?
- Can workers collide through mutable data, ports, accounts, or schemas?
- Does cleanup risk unowned or production state?
- Does synchronization rely on sleeps, retries, or arbitrary timing?
- Does the test duplicate a lower-layer permutation or existing browser journey?

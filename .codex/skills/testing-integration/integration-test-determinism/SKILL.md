---
name: integration-test-determinism
description: Diagnose, stabilize, and verify nondeterministic Vitest integration tests without masking failures. Use when a backend, PostgreSQL/Liquibase, provider-adapter, SSE, or React integration test is flaky, order-dependent, worker-dependent, retry-only, timing-sensitive, port-sensitive, environment-sensitive, or leaves open handles; when reproducing races with repeats, worker changes, seeded shuffle, async-leak detection, or controlled barriers; when isolating databases, schemas, rows, accounts, QueryClients, routers, fake servers, ports, streams, clocks, randomness, environment variables, and process resources; or when distinguishing a product race from a test, fixture, cleanup, or environment defect. Do not use retries, sleeps, serial execution, larger global timeouts, or weakened assertions as fixes.
---

# Integration Test Determinism

Remove nondeterminism at its source. A test that passes only after retry, with one worker, in declaration order, or after a timeout increase remains defective.

## Diagnostic Workflow

### 1. Preserve the first failure

Before editing:

- Record the exact command, file/test, Vitest project/environment, worker settings, retry index, seed, and first meaningful error.
- Preserve safe assertion diffs, HTTP/event sequence, database identifiers, fake-server request summary, console output, and open-handle evidence.
- Disable retries for reproduction.
- Run the smallest failing test without changing its oracle.
- Distinguish reproducible, intermittent, order-dependent, worker-dependent, and environment-specific failure.

Do not diagnose from a later cascade caused by failed setup, unavailable infrastructure, or leaked state.

### 2. Classify the nondeterminism

Assign one primary category:

- **Synchronization**: assertion runs before a public state transition completes.
- **Trigger/listener race**: listener, waiter, or fake gate is registered after its trigger.
- **Shared data**: workers reuse database/schema/row/account/cache/file/resource identity.
- **Order dependence**: setup or cleanup relies on another test.
- **Database contention**: leaked transaction, connection, advisory/row lock, or unbounded wait.
- **Process/port lifecycle**: server starts late, fixed port collides, or shutdown is not awaited.
- **Stream lifecycle**: reader, listener, subscription, socket, or EventSource survives its test.
- **Frontend global leakage**: QueryClient, router, jsdom global, storage, handler, observer, or timer is shared.
- **Clock/time zone**: browser/Node/database time or timer scheduling varies.
- **Randomness/order**: unseeded IDs, provider outcomes, object/row ordering, or shuffled execution varies.
- **External fake defect**: fake server or transport accepts unexpected calls, responds nondeterministically, or lacks cleanup.
- **Environment**: PostgreSQL, Liquibase, binary, certificate, resource pressure, or configuration changes the result.
- **Product race**: valid concurrent operations violate the specified contract.
- **Oracle defect**: the assertion targets an intermediate/incidental state or can pass after broken setup.

Gather evidence for a category before changing code. A timeout is a symptom, not a classification.

### 3. Build a reproduction matrix

Use the repository's Vitest command and installed CLI syntax. Confirm available flags with the local version before applying examples.

Vary one dimension at a time:

1. Focused test, retries disabled.
2. Repeated focused test under one worker.
3. Repeated focused test under normal workers/file parallelism.
4. Related group with shuffled files/tests and a recorded seed.
5. Focused run with asynchronous leak detection when supported.
6. Relevant Node/jsdom project or environment comparison only when evidence points there.

Vitest capabilities may include repeats, `maxWorkers`, file parallelism, seeded sequence shuffle, retry count, and async-leak detection. Follow the installed version rather than copying flags blindly.

- Use repeats to expose failure frequency, not to claim success after one pass.
- Use one worker only to diagnose collisions.
- Record shuffle seeds so failures reproduce.
- Do not run the entire repository until the smallest failing boundary is understood.

## Signal-Based Synchronization

Wait for the state that proves the integration contract:

1. Completed HTTP response or adapter result.
2. Named SSE/event payload registered before its trigger.
3. Committed database state or explicit transaction barrier.
4. Visible semantic UI state, `findBy*`, or assertion inside `waitFor`.
5. Explicit fake-server release/receipt gate.
6. Supported readiness or shutdown signal.

Register the waiter before the action:

```ts
const eventPromise = nextEvent(stream, 'completed');
await triggerWork();
await expect(eventPromise).resolves.toMatchObject({ status: 'completed' });
```

Never use `setTimeout`/sleep to make an event more likely. Do not poll private implementation state when a public signal exists.

## Explicit Concurrency Gates

Use controllable promises/barriers to establish ordering without wall-clock delay:

```ts
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
```

Use an existing repository helper when available; create a local helper for one test instead of a global synchronization framework.

- Expose a gate only in test infrastructure or injected fake collaborators.
- Wait until both contenders reach the contracted point.
- Release them in the required order or simultaneously.
- Assert both resulting outcomes.
- Release every gate in teardown if the test fails early.

Do not add production hooks, endpoints, environment branches, or hidden delays to orchestrate a test.

## Worker and Data Isolation

Give every mutable resource a stable run/worker/test identity:

- PostgreSQL database, schema, rows, advisory-lock key, and account.
- Fake-provider script and captured requests.
- QueryClient/cache, router, storage namespace, and EventSource instance.
- Temporary file/directory and object-storage prefix.
- Loopback server and operating-system-assigned port.

- Prefer disposable database/schema boundaries for persistence tests.
- Use exact returned IDs for cleanup.
- Never share mutable fixtures because they are expensive to create.
- Never depend on test declaration order.
- Do not change the suite to serial mode as a collision fix.

After fixing isolation, rerun with normal workers and file parallelism. A one-worker pass is diagnostic evidence only.

## Database Determinism

- Use separate real clients for concurrent transactions.
- Begin, commit/rollback, and release every client explicitly.
- Use deterministic seed values and ordering keys.
- Add an explicit tie-breaker when the product contract requires stable ordering.
- Use bounded transaction-local statement/lock timeouts for diagnosis, not long global timeouts.
- Inspect safe lock/activity information when a test hangs.
- Revalidate target ownership before cleanup.
- Close application pools before dropping owned schemas/databases.

If the failure disappears when workers are reduced, look for shared schema/data/lock identity before blaming PostgreSQL speed.

Do not truncate shared state, terminate arbitrary sessions, or retry deadlocks blindly.

## Server, Socket, and Port Determinism

- Bind test servers to loopback and port `0` unless the repository supplies an isolated port allocator.
- Await the listening/readiness signal before requests.
- Keep the exact server/socket handle returned by setup.
- Abort/close client streams first, then fake/provider server, application server, and dependent resources in reverse order.
- Await close callbacks/promises and surface shutdown failures.
- Treat an occupied fixed port as a fixture defect; never kill an unknown process.
- Do not reuse an existing server in CI unless the harness explicitly owns and validates it.

For ordinary Supertest `request(app)`, let Supertest own the ephemeral server. Do not introduce a persistent listener without a stream/session lifecycle requirement.

## Frontend and jsdom Determinism

- Create fresh QueryClient, router, transport fake, and user-event instance per test.
- Reset request handlers and fail on unexpected requests.
- Register stream handlers before emitting controlled events.
- Unmount before clearing clients and restoring globals.
- Remove observers/listeners and close streams.
- Await final UI/cache convergence to prevent post-test React updates.
- Treat `act()` warnings as unfinished work, not console noise.
- Restore storage, clipboard, observers, environment variables, locale, time zone, and other modified globals.

Do not use manual `act()` loops or flush-promises helpers to hide an unknown update source.

## Time, Timers, and Time Zones

Use fake timers only when Node/jsdom timers or `Date` are the behavior or the controlled boundary.

- Call `vi.useFakeTimers()` before scheduling owned timers.
- Use `vi.setSystemTime()` for deterministic Node/jsdom wall time when supported.
- Advance only enough time to trigger the intended transition.
- Drain or clear timers owned by the test.
- Restore real timers in teardown.

Fake timers do not advance PostgreSQL time, network I/O, child processes, Liquibase, or external services. Do not combine fake timers with real I/O waits unless the interaction is understood and explicitly coordinated.

Set time zone/locale through the established test configuration when formatting or date boundaries matter. Keep backend/database clocks controlled through existing test seams; do not add production clock branches.

## Randomness and Ordering

- Prefer fixed fixtures.
- Seed generators when uniqueness/randomness is part of setup.
- Report the seed on failure.
- Use collision-resistant run/worker IDs for resources that require uniqueness.
- Sort only when product order is unspecified.
- Assert required order through explicit keys, never insertion timing.
- Use seeded Vitest shuffle to expose order dependence and reproduce it.

Do not replace valid concurrency with sequential fake responses solely for stability.

## Retry and Timeout Policy

Treat outcomes as:

- **Passed**: succeeds on the first attempt.
- **Flaky**: fails and later passes under retry or repetition.
- **Failed**: consistently violates the assertion or setup.

- Keep retries disabled while diagnosing.
- Use retry artifacts only as evidence.
- Never alter setup or assertions based on retry index.
- Increase only a narrow timeout when a documented valid operation has a larger bound.
- Do not set infinite timeouts.
- Do not raise global test/hook timeouts to fix one boundary.

A longer timeout can accommodate a known bound; it cannot establish ordering, isolation, readiness, or cleanup.

## Cleanup Ownership

Register cleanup immediately after acquiring a resource.

Use `try/finally`, fixture teardown, or the installed Vitest test-context cleanup hook. For concurrent tests, prefer the per-test context cleanup mechanism supported by the installed version so resources are tied to the correct test.

Clean in reverse dependency order:

1. Pending assertions/readers and user-level subscriptions.
2. HTTP/SSE clients, EventSource, sockets, and request handlers.
3. Rendered trees, QueryClients, routers, timers, and globals.
4. Fake/external servers and application listeners.
5. Database transactions, clients, pools, schemas/databases, and containers.
6. Temporary files/directories owned by the run.

- Preserve the original assertion failure when cleanup also fails.
- Make cleanup idempotent.
- Remove only exact owned resources.
- Report residue rather than broadening deletion.
- Use async-leak detection when available to identify, not suppress, remaining resources.

Never use forced process exit, ignored unhandled errors, catch-and-ignore teardown, or arbitrary backend termination.

## Product Race vs Test Race

Classify as a product defect when valid concurrent inputs reproduce a contract violation through public surfaces, for example:

- Two requests bypass a uniqueness or busy invariant.
- A committed event is lost or delivered before its transaction.
- A stale response overwrites a newer attempt.
- Recovery relaunches work or leaves persisted state inconsistent.
- Cache/event application leaks state between resources under valid ordering.

Preserve the deterministic reproduction and return it to the owning builder. Do not serialize the scenario or wait longer.

Classify as a test defect when listeners register late, workers share resources, setup relies on order, a fake responds nondeterministically, or cleanup leaks state.

## Verification Contract

After fixing the root cause:

1. Run the focused test repeatedly with retries disabled.
2. Run with normal workers and file parallelism.
3. Run the related integration group with seeded shuffled order.
4. Run async-leak detection when the failure involved open resources and the installed version supports it.
5. Confirm no test was skipped, serialized, weakened, or given a broad timeout.
6. Confirm temporary diagnostics were removed.
7. Report repetition count, workers, seed, retries, environment, duration, and remaining uncertainty.

Do not claim a flake fixed after one green execution.

## Rejection Checklist

Reject or revise a stabilization that:

- Adds sleeps or timing padding.
- Enables retries as the correctness mechanism.
- Raises global timeouts.
- Disables file/test parallelism permanently.
- Forces serial execution.
- Weakens or removes the failing assertion.
- Shares mutable data, cache, accounts, ports, or database state.
- Uses unseeded randomness or implicit ordering.
- Adds catch-and-ignore cleanup or forced process exit.
- Leaves connections, locks, servers, sockets, streams, timers, listeners, caches, globals, or files open.
- Changes production behavior solely to coordinate the test.
- Declares a retry pass healthy.

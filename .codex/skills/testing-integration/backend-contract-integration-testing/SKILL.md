---
name: backend-contract-integration-testing
description: Implement and maintain deterministic backend integration tests for public HTTP, SSE, and external-adapter contracts in Express and TypeScript. Use when writing or fixing `*.integration.test.ts` coverage through `createApp()` and Supertest; testing middleware-route-controller-service collaboration, validation and safe error translation, sessions or headers; opening and parsing real `text/event-stream` responses, ordering events, coordinating snapshot/commit races, terminal closure, and disconnect cleanup; or exercising a real provider adapter against a controlled loopback fake for request serialization, response normalization, errors, timeout, and cancellation. Do not use for isolated unit tests, PostgreSQL/Liquibase mechanics as the primary subject, frontend integration, browser E2E, live providers, or production testing.
---

# Backend Contract Integration Testing

Implement the approved boundary contract without widening it. Keep application collaborators real through the public backend boundary and control only the next external dependency.

## Prerequisite

Start from the contract produced by `integration-test-design`:

- Layer decision.
- Single boundary intention.
- Real, controlled, setup-only, and excluded participants.
- Environment and resource ownership.
- Observable oracles.
- Deterministic coordination and cleanup.

If this contract is absent, ambiguous, or actually describes unit, database-primary, frontend, or browser behavior, resolve the layer before writing test code.

## Select the Harness

### Ordinary HTTP

Use Supertest with the exported Express application:

```ts
const app = createApp(dependencies);

const response = await request(app)
  .post('/api/resources')
  .send({ name: 'example' });

expect(response.status).toBe(201);
expect(response.body).toMatchObject({ name: 'example' });
```

- Prefer `request(app)` when a normal request/response proves the contract.
- Let Supertest create and close its ephemeral server.
- Use `request.agent(app)` only when cookie continuity or a session sequence is part of the intention.
- Do not call `listen()` or reserve a fixed port for ordinary HTTP tests.
- Do not test `index.ts`; import the application factory.

### Long-lived HTTP or SSE

Use a real loopback listener on an operating-system-assigned port when stream lifecycle is the contract.

- Bind only to loopback.
- Start the server in fixture setup and await readiness.
- Keep the server handle owned by the fixture.
- Close the client stream before closing the server.
- Await server shutdown and surface cleanup errors.
- Never kill an unknown process or reuse a fixed shared port.

Prefer the repository's existing streaming client and parser. Do not add a dependency solely to parse one test stream.

### Provider adapters

Start a minimal loopback fake only when real HTTP serialization and parsing are part of the adapter contract.

- Keep the production adapter real.
- Point its configurable base URL at the fake.
- Script only responses needed by the intention.
- Record a sanitized request summary, not credentials or sensitive content.
- Close the fake server after every test or suite according to its actual scope.

Do not use a live provider, browser route interception, or a deep mock of the adapter itself.

## Assemble the Real Boundary

Use the same composition path as production where possible:

1. Construct validated test configuration.
2. Create deterministic external fakes.
3. Create real infrastructure required by the approved boundary.
4. Inject dependencies through the existing application factory.
5. Invoke the public HTTP, SSE, or adapter surface.
6. Assert the complete observable contract.
7. Close owned resources in reverse order.

Do not import controller internals to bypass routing when routing is part of the intention. Do not instantiate the entire application when a direct adapter boundary is sufficient.

When PostgreSQL is a collaborator but not the primary subject, reuse the repository's established migrated database fixture. Load the dedicated PostgreSQL/Liquibase skill when transactions, locks, constraints, migrations, rollback, or database isolation are the behavior being designed.

## HTTP Contract Tests

Keep real middleware, validation, route matching, controller translation, service collaboration, and error middleware that define the public contract.

Assert together when they prove one intention:

- Status code.
- Relevant content type or protocol headers.
- Public response schema and stable fields.
- Safe domain error code and message boundary.
- Required durable or external effect.
- Absence of partial or duplicate work when contracted.

Avoid separate tests for status and body of the same outcome. Avoid exhaustive error-code matrices when several failures intentionally map to the same public state.

### Validation and error translation

- Send malformed or boundary input through the real validation middleware.
- Assert the client-safe error contract, not Zod/Express internals.
- Verify stack traces, raw database errors, internal paths, and credentials are absent.
- Make the controlled collaborator fail through its normal interface.
- Do not add hidden product switches or special query parameters to provoke failures.

### Sessions and authentication

- Use `request.agent(app)` only when the test needs cookies across requests.
- Use test-only identities and least-privileged credentials.
- Assert public authorization outcomes, not token implementation details.
- Keep cookies and authorization values out of snapshots, logs, and reports.
- Close any resources retained by custom agents or authentication fixtures.

### Idempotency and concurrency

- Trigger concurrent requests only when simultaneity affects the contract.
- Coordinate contenders with explicit fixture barriers or controlled collaborator gates.
- Assert the accepted/replayed/conflicting outcomes and absence of duplicate work.
- Do not use timing luck, sleeps, or serial execution to manufacture ordering.

## SSE Contract Tests

Exercise the real `text/event-stream` response and parse logical events across arbitrary transport chunks.

### Opening contract

Assert:

- Successful HTTP status.
- `Content-Type` identifies `text/event-stream`.
- Required cache and connection headers.
- The requested resource relationship is validated before streaming.
- The subscriber is established before the action that can publish the event.

Do not assume one network chunk equals one SSE event. A parser must retain incomplete text, split events on blank lines, join repeated `data:` lines, and ignore comments according to the application's supported SSE subset.

### Snapshot and live delivery

- Gate the snapshot read or publisher explicitly when testing an opening race.
- Trigger the commit only after subscription is confirmed.
- Assert the snapshot first when contracted.
- Assert commits not represented by the snapshot arrive afterward without loss.
- Assert old or duplicate buffered events are discarded through public version fields.
- Assert each canonical event represents already committed state.
- Assert event name and complete normalized payload, not token-sized transport fragments.

Do not prove database commit ordering with private publisher spies when the public event plus persisted result can establish it.

### Terminal and disconnect behavior

- Define the exact terminal event or state that ends the stream.
- Continue reading until buffered post-snapshot events are drained.
- Assert the server closes only after the latest state is terminal when that is the contract.
- Abort the client deliberately for disconnect cleanup tests.
- Assert the subscriber/listener count returns to its prior observable value through an owned test seam.
- Bound every read so a broken stream fails instead of hanging the suite.

Always cancel the reader or abort the request in teardown, then await server closure.

## Provider Adapter Contract Tests

Keep request construction, headers, envelope overhead, parsing, normalization, error mapping, timeout, and cancellation real when they belong to the adapter contract.

### Fake server behavior

- Validate method, path, content type, and safe header presence.
- Capture only fields needed by the assertion.
- Return protocol-faithful success, error, malformed, delayed, or interrupted responses.
- Coordinate delayed responses with an explicit release gate, not wall-clock sleeps.
- Use a separate fake route or scripted response object inside test infrastructure, never product code.

### Contract assertions

- Assert the normalized provider-neutral result.
- Assert model/provider identity and contracted metadata.
- Assert safe error category, retryability, timeout, or cancellation behavior.
- Assert malformed provider data never leaks as an unvalidated application result.
- Assert secrets and raw sensitive payloads are absent from exposed errors.

Keep provider-specific payload assertions inside adapter tests. Higher services should consume only the normalized contract.

## Determinism and Cleanup

- Generate exact run/worker identifiers for mutable resources.
- Register waits before triggers.
- Use explicit fake-response and concurrency gates.
- Use bounded local timeouts only around operations that can hang.
- Restore modified environment variables and process-level handlers.
- Close streams, sockets, servers, pools, timers, and subscriptions even after failure.
- Fail on unexpected open handles; do not force process exit.
- Run the focused file under normal worker configuration after any single-worker diagnosis.

Never add sleeps, retries, broad timeout increases, catch-and-ignore cleanup, or suite serialization to hide races.

## Failure Diagnosis

Classify the first failure:

- **Product contract defect**: the real collaborators return an incorrect public result.
- **Adapter contract defect**: request or normalization disagrees with the supported provider protocol.
- **Test defect**: fake, parser, assertion, setup, or teardown misrepresents the contract.
- **Environment defect**: service, port, configuration, certificate, or dependency is unavailable or unsafe.
- **Flake**: ordering, shared state, open handles, or timing changes the outcome.

Fix only test-owned code. Preserve a failing integration test for product defects and report reproduction, expected result, actual result, and safe evidence to the owning builder.

## Verification

After implementation:

1. Run the focused test with retries disabled.
2. Confirm no production or paid endpoint was contacted.
3. Confirm every owned server, socket, stream, timer, and subscription closed.
4. Run the related backend integration group when risk justifies it.
5. Report exact commands, pass/fail counts, environment class, retries, duration, and cleanup.

## Rejection Checklist

Reject or revise a test that:

- Mocks away the collaboration named by the intention.
- Opens a listener for an ordinary request that `request(app)` can cover.
- Uses a fixed or non-loopback test port.
- Uses a live external provider or production credential.
- Assumes one SSE chunk equals one event.
- Starts the event wait after its trigger.
- Uses sleeps, retry-only success, or unbounded reads.
- Asserts private calls instead of public HTTP/event/adapter outcomes.
- Leaks secrets through assertions or diagnostics.
- Leaves servers, streams, agents, sockets, timers, or subscriptions open.
- Changes product code to make the test pass.

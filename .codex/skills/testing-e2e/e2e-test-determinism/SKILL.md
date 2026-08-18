---
name: e2e-test-determinism
description: Diagnose, stabilize, and verify nondeterministic Playwright end-to-end tests without masking failures. Use when an E2E test is flaky, timing-dependent, order-dependent, worker-dependent, browser-specific, or passes only on retry; when testing concurrency, streaming, reconnection, clocks, time zones, randomness, or eventual consistency; or when replacing fixed sleeps, oversized timeouts, serial execution, and retry-based workarounds with deterministic signals, isolated data, controlled time, and reproducible evidence.
---

# E2E Test Determinism

Remove nondeterminism at its source. Never make a flaky test green by weakening its oracle, adding sleeps, increasing retries, serializing the suite, or hiding a product race.

## Diagnostic Workflow

### 1. Preserve the original failure

Before editing:

- Record the failing test, command, project/browser, worker count, retry index, environment, and first meaningful error.
- Preserve the trace, screenshot, video, browser console, failed request, and relevant server log when available.
- Disable retries for reproduction so a passing retry does not erase the original signal.
- Run the smallest failing test without changing assertions.
- Confirm whether the failure is reproducible, intermittent, or environment-specific.

Do not diagnose from the final cascade when an earlier action or setup step failed.

### Cross-layer HTTP discrepancies

If a browser E2E request returns a different status than the same contract in a
browserless/integration path, capture the safe status, body, request ID,
exception type/code/status, and database/SQLSTATE evidence before assigning a
product owner. Then compare the exact request payload, launch command, Node
conditions, TypeScript loader, environment, and `src`/`dist` module resolution.

- If integration passes and E2E fails, classify the first hypothesis as
  runtime, launcher, module-resolution, or fixture mismatch until disproved.
- Do not create or delegate a backend product fix from the HTTP status alone.
- If custom conditions or a `tsx` loader are involved, require the E2E child
  process to receive the same conditions as the parent and prove that duplicate
  source/dist class identities are impossible before continuing.

### 2. Classify the nondeterminism

Assign one primary category before fixing:

- **Synchronization**: the test observes before the application reaches a meaningful state.
- **Event registration race**: the response, download, popup, stream, or navigation listener starts after its trigger.
- **Shared-state collision**: tests or workers reuse mutable accounts, IDs, rows, files, ports, or browser state.
- **Order dependence**: a test relies on another test's setup or cleanup.
- **Clock/time zone**: browser time, backend time, locale, date boundary, or timer execution varies.
- **Randomness/data**: unseeded values, duplicate identifiers, unstable ordering, or uncontrolled provider output varies.
- **Environment**: service readiness, resource pressure, browser installation, network, or database availability varies.
- **Product race**: the application itself loses, reorders, duplicates, or misattributes work under valid timing.
- **Test oracle defect**: the assertion can pass without proving the intention or targets an incidental state.

Fix only after evidence supports a category. Do not label every timeout as “slow CI.”

### 3. Build a reproduction matrix

Use the repository's existing Playwright command and vary one dimension at a time. Typical diagnostics include:

```bash
npx playwright test path/to/spec.ts --project=chromium --retries=0
npx playwright test path/to/spec.ts --project=chromium --retries=0 --repeat-each=20 --workers=1
npx playwright test path/to/spec.ts --project=chromium --retries=0 --repeat-each=20
npx playwright test path/to/spec.ts --project=chromium --retries=0 --workers=1 --trace=on
```

- Replace paths and projects with repository values.
- Use repeated execution to reveal frequency, not to declare success after one pass.
- Compare one worker with the normal worker count to expose collisions.
- Compare projects only when evidence suggests browser-specific behavior.
- Avoid running the entire suite until the smallest reproduction is understood.

## Signal-Based Synchronization

Prefer a signal that represents the intended state:

1. Web-first assertion on a meaningful locator.
2. URL or navigation state.
3. Response, request, popup, download, or browser event registered before its trigger.
4. Public API state polled with a bounded assertion when no browser signal exists.
5. Explicit application readiness boundary already supported by the test environment.

Never use `page.waitForTimeout()` in committed tests. Do not use `networkidle` as a general readiness condition for applications with streams, analytics, polling, or background requests.

When cleanup follows an auxiliary conversation or turn, observe the product's
terminal signals before destructive deletion: a terminal turn state and
`busy_update=false`. Do not treat `APIResponse.finished()` or HTTP body
completion as terminal unless the endpoint contract explicitly promises stream
closure. Do not replace the terminal signal with sleeps, unbounded waits, or
polling.

### Register before triggering

Create the wait promise first:

```ts
const responsePromise = page.waitForResponse(
  response => response.url().endsWith('/turns') && response.request().method() === 'POST',
);

await page.getByRole('button', { name: 'Send' }).click();
const response = await responsePromise;
expect(response.ok()).toBe(true);
await expect(page.getByRole('status')).toContainText('Completed');
```

Apply the same ordering to popups, downloads, dialogs, navigations, and custom browser events.

### Poll only public eventual state

Use `expect.poll()` only when eventual consistency has no direct UI signal and the polled surface is public and stable:

```ts
await expect.poll(
  async () => (await request.get(`/api/jobs/${jobId}`)).status(),
  { message: 'job becomes queryable', timeout: 10_000 },
).toBe(200);
```

- Keep the timeout tied to a documented bound.
- Poll an observable outcome, not a private database row.
- Continue to assert the browser-visible result when the journey requires it.
- Do not use polling to compensate for missing product events or broken synchronization.

## Timeout Discipline

Identify which timeout failed before changing it: test, assertion, action, navigation, fixture, or web-server startup.

- Prefer the repository defaults.
- Increase only the narrow timeout whose documented operation legitimately needs more time.
- Keep assertion timeouts close to the product's expected bound.
- Do not set infinite timeouts.
- Do not increase the global test timeout to fix one slow transition.
- Treat a timeout increase without root-cause evidence as an unresolved flake.

A longer timeout can accommodate a valid bound; it cannot establish ordering or isolation.

## Controlled Browser Time

Use `page.clock` only when browser time or browser timers are part of the behavior and the installed Playwright version supports the required API.

```ts
await page.clock.install({ time: new Date('2026-01-15T10:00:00Z') });
await page.goto('/session');
await page.clock.fastForward('30:00');
await expect(page.getByRole('alert')).toHaveText('Session expired');
```

- Install the clock before loading code that captures time when required.
- Use `pauseAt()` when testing a fixed wall-clock transition.
- Use `runFor()` when timers must fire as time advances.
- Use `fastForward()` when elapsed browser time matters without observing every interval.
- Set the Playwright project `timezoneId` and `locale` explicitly when formatting or date boundaries matter.
- Remember that `page.clock` controls browser time, not backend clocks, PostgreSQL, external providers, or Playwright's own test timeout.
- Coordinate backend time through an existing test-environment seam; do not add production clock branches from this agent.

## Randomness and Ordering

- Use deterministic fixtures and fixed provider responses.
- Seed supported generators and print the seed on failure.
- Use collision-resistant run/worker identifiers for resources that require uniqueness.
- Sort only when product order is unspecified; otherwise assert the specified order.
- Do not assume database insertion order, object-key order across external systems, or provider completion order unless contracted.
- Control concurrent fake responses with explicit gates rather than real-time delays.

Do not replace valid concurrency with sequential mocks merely to stabilize the test.

## Worker and Data Isolation

- Keep mutable data test-scoped by default.
- Give each worker a unique account, schema, namespace, or resource prefix when sharing is unavoidable.
- Use Playwright worker information such as `parallelIndex` only as part of a stable unique identifier, not as product data.
- Make cleanup idempotent and limited to resources owned by the current test or worker.
- Never depend on test declaration order.
- Never reuse `page`, mutable storage state, or server-side records across tests unless the fixture lifecycle proves isolation.
- Do not switch to serial mode as the fix for a collision; correct resource ownership first.

After fixing, rerun with the repository's normal worker count. A single-worker pass does not prove determinism.

## Streaming, Reconnection, and Concurrency

- Register listeners before creating the work that can emit early events.
- Drive deterministic fake providers through explicit release gates or scripted outcomes.
- Assert canonical user-visible transitions, not transient text that is not part of the contract.
- For reconnection, distinguish connection loss, visible error, new connection, snapshot convergence, and terminal closure.
- For navigation during work, verify both non-leakage at the destination and eventual persistence at the origin.
- For concurrent operations, prove the expected winner, loser, conflict, or ordering rather than relying on completion timing.
- Preserve the real concurrent behavior under test; do not serialize it away.

## Retry Policy

Treat Playwright results as follows:

- **Passed**: succeeded on the first attempt.
- **Flaky**: failed initially and passed on retry; remains a defect requiring diagnosis.
- **Failed**: failed on all attempts.

- Use configured retries to collect evidence such as a first-retry trace, not to redefine flaky as passing.
- Reproduce with `--retries=0` while diagnosing.
- Do not add conditional logic based on `retry` to alter the product journey.
- Do not accept a test solely because CI exits successfully with flaky results.

## Trace-Led Diagnosis

Inspect evidence in this order:

1. First failed action or assertion and its call log.
2. DOM snapshot and locator resolution at that moment.
3. Network/event ordering relevant to the intention.
4. Browser console and page errors.
5. Screenshot/video for visual obstruction or unexpected navigation.
6. Server logs for a correlated product or environment failure.

Use trace recording under the repository's configured failure/retry policy. Enable `--trace=on` temporarily for a minimal reproduction when necessary; do not commit “trace always” merely to diagnose one test.

Remove temporary logging, tracing overrides, and diagnostics after the root cause is confirmed unless they are justified permanent failure artifacts.

## Product Race vs Test Race

Classify a race as a product defect when valid user timing can reproduce it outside test-only sequencing, for example:

- A committed event is lost during connection setup.
- A stale response overwrites a newer attempt.
- Results appear in the resource selected after navigation instead of their origin.
- Two valid commands violate the documented concurrency rule.

Do not “fix” these by waiting longer or changing the test order. Preserve the deterministic reproduction and report the defect to the owning builder with expected/actual behavior and trace evidence.

Classify a race as a test defect when the test registers after the trigger, shares data, observes an incidental intermediate state, or omits a required precondition.

## Verification Contract

After the fix:

1. Run the minimal test repeatedly with retries disabled.
2. Run it with the normal project and worker configuration.
3. Run the related E2E group once.
4. Confirm no test was skipped, weakened, serialized, or given a broad timeout.
5. Confirm temporary diagnostics were removed.
6. Report repetition count, worker count, projects, retries, and any remaining uncertainty.

Do not claim a flake fixed after one green execution.

## Rejection Checklist

Reject or revise a stabilization that:

- Adds `waitForTimeout()`.
- Uses `networkidle` without proving it represents application readiness.
- Raises global timeouts or retries.
- Switches tests to serial execution.
- Weakens or removes the failing assertion.
- Uses `.first()` or forced actions to bypass ambiguity or obstruction.
- Adds catch-and-ignore behavior.
- Replaces concurrency with sequential behavior.
- Shares mutable test data.
- Alters production code with test-only timing branches.
- Declares a retry pass healthy.

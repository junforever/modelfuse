---
name: performance-environment-safety
description: Protect targets, infrastructure, credentials, data, external services, load generators, and cleanup during performance testing. Use before configuring or executing native Node.js benchmarks, k6 smoke/load/stress/spike/soak/breakpoint scenarios, or browser-performance runs; when validating effective URLs, redirects, environment classification, workload bounds, abort conditions, runner capacity, service lifecycle, database/schema preconditions, synthetic data ownership, fake or sandbox providers, result outputs, or destructive teardown; or when responding to possible production access, unexpected paid-provider calls, unbounded load, leaked processes, contaminated shared state, sensitive artifacts, or incomplete cleanup.
---

# Performance Environment Safety

Fail closed before generating load. Run only when every mutable target is proven non-production, the workload is bounded, dependencies are safe, and cleanup is limited to resources owned by the current run.

## Scope Boundary

- Apply this skill only within `performance-test-runner` work.
- Require an approved `performance-test-design` contract before authorizing any measured workload.
- Use `node-k6-performance-testing` to implement the scenario and `performance-test-determinism` to judge measurement validity.
- Treat this safety gate as necessary authorization, not permission to change production infrastructure, product code, migrations, thresholds, or capacity.

## Preflight Safety Gate

Perform this gate before starting services, seeding data, opening a browser, or sending a smoke request:

1. Resolve the effective target URL and every configured mutable dependency from the same inputs the test will use.
2. Classify target and generator as local ephemeral, CI ephemeral, preview, or dedicated performance environment.
3. Verify exact non-production allowlist membership and reject production credentials independently of host classification.
4. Confirm the approved workload's maximum VUs/concurrency, arrival rate, iterations, stages, duration, data volume, request size, and parallel scenarios.
5. Confirm abort conditions for unsafe target, excessive errors, target distress, generator saturation, unexpected external calls, and loss of ownership.
6. Confirm test-only credentials, synthetic data, fake/sandbox providers, resource ownership identifiers, and idempotent cleanup.
7. Confirm the smoke scenario is smaller than the measured workload and cannot exceed its bounds.

Refuse to run when any value is missing, ambiguous, unbounded, production-like, or cannot be proven safe. A variable named `test`, a nonstandard port, a UI banner, or `NODE_ENV` is not proof.

Production is forbidden even for read-only scenarios: performance traffic, authentication, analytics, caches, rate limits, and background work can mutate or degrade real systems.

## Target Validation

Validate parsed final URLs, not substrings:

- Allow loopback hosts for local runs and repository-approved exact hosts or safe suffixes for remote test environments.
- Reject malformed URLs, unexpected protocols, embedded credentials, production domains, and unrestricted host overrides.
- Validate application, API, database, cache, queue, object storage, provider, proxy, telemetry output, and redirect destinations independently when configured.
- Follow only expected redirects that remain inside the approved non-production boundary.
- Do not disable TLS validation for remote targets to make a run work.
- Do not accept a generic bypass flag that turns off target checks.

Shared preview environments require explicit reservation/ownership and workload limits. If other traffic or deployments make the environment incomparable, the run may be diagnostic but not acceptance evidence.

## Workload Authorization and Abort Conditions

- Use exact bounds from the approved performance contract; never infer production traffic or capacity.
- Start with the smallest smoke workload. Proceed only after target identity, correctness prerequisites, telemetry, abort behavior, and cleanup are verified.
- Do not escalate from smoke to average load, stress, spike, soak, or breakpoint merely because the script supports it.
- Never run multiple performance scenarios concurrently unless the contract explicitly models that concurrency.
- Configure supported early-abort controls for the approved safety conditions without weakening required measurement.
- Stop immediately on possible production access, unexpected paid/destructive calls, runaway errors, target instability beyond approved impact, generator exhaustion, or inability to prove resource ownership.

Do not silently reduce load after an abort and report the replacement as the requested run.

## Configuration and Secrets

- Reuse the repository's environment loading and validation convention.
- Report missing variable names, never secret values.
- Use least-privileged test-only credentials scoped to the approved environment.
- Reject production, personal, or customer credentials even when the URL appears non-production.
- Keep `.env` files, tokens, cookies, connection strings, certificates, and generated credentials out of source control and result artifacts.
- Never dump environment variables, headers, provider payloads, database URLs, or cloud configuration for diagnosis.
- Pass secrets through the established local or CI secret mechanism; do not embed them in k6 scripts, command examples, fixtures, tags, metric names, or summaries.

## External Systems

Never generate performance traffic against real:

- Paid LLM or inference providers.
- Payment, email, SMS, or financial systems.
- Production storage, queues, analytics, observability, or tracing ingestion.
- Destructive cloud, infrastructure, account-management, or data APIs.

Use a deterministic fake, emulator, or vendor sandbox already supported by the repository. Validate its endpoint and credentials separately. If no safe boundary exists, stop and report the missing capability; do not intercept the application path in a way that invalidates the measurement.

## Database, Schema, and Test Data

A migrated schema may be a performance-test precondition, but this agent does not own migration authoring, validation, rollback, or repair.

- Validate the database target as non-production before invoking any established setup mechanism.
- Use only the repository's supported setup/orchestration command to prepare the schema outside the measurement window.
- Treat missing or unavailable schema setup as an environment defect.
- Return invalid changesets, checksum drift, rollback failures, or incompatible schema to `integration-test-runner` and the backend/database owner with safe evidence.
- Never edit migrations, invoke ad hoc schema SQL, or run Liquibase directly from a performance script.

For measured data:

- Prefer a disposable database/schema or an isolated run-owned dataset supported by the project.
- Define cardinality and distribution before measurement; seed outside the measurement window.
- Use synthetic data, never customer records or unsanitized production snapshots.
- Give every mutable row, account, namespace, queue, file, and cache key an exact run ownership identifier.
- Keep setup idempotent and mutable data isolated from parallel workers/scenarios.
- Do not truncate shared tables, flush shared caches, purge queues, drop unverified schemas/databases, or delete by a loose prefix.

## Service, Port, and Generator Lifecycle

Reuse the repository's established orchestration, binary, container, and readiness checks.

- Start only services owned by the run and wait for an explicit readiness signal before warm-up.
- Bind owned helper servers to loopback and an operating-system-assigned port when the repository does not require a fixed port.
- Treat an occupied fixed port as an environment defect; never kill or reuse an unknown process.
- Record the load-generator tool/version and runner class.
- Keep local and CI generator outputs local unless remote/cloud output is explicitly approved and scrubbed of sensitive tags and URLs.
- Verify generator capacity before measured load and monitor it during execution.
- Stop clients and workloads before application/fake services, then close database and file resources in reverse dependency order.
- Await shutdown and report any process, container, socket, browser, connection, or temporary file that remains.

Do not introduce distributed load infrastructure, k6 cloud execution, xk6 extensions, or a new container stack without explicit scope and review.

## Safe Cleanup

Register cleanup immediately after acquiring each mutable resource. Before a destructive cleanup:

1. Re-resolve and revalidate the environment.
2. Confirm the resource carries the current run's exact ownership identifier.
3. Resolve explicit IDs or absolute paths within the approved workspace/output boundary.
4. Delete only those owned resources.
5. Treat absence as success so teardown remains idempotent.

Run cleanup after success, failure, or interruption without hiding the original result. If ownership cannot be proven, leave the resource untouched and report its identifier for the responsible owner. Never broaden deletion or retry destructive cleanup blindly after a partial failure.

## Results and Diagnostic Artifacts

Assume summaries, raw metrics, logs, traces, profiles, screenshots, HAR files, and exported dashboards can expose URLs, identifiers, payloads, or credentials.

- Keep artifacts in the repository's configured ignored output directory.
- Preserve only the minimum evidence required by policy; do not commit volatile raw results by default.
- Use safe operation tags and synthetic data so summaries are non-sensitive by construction.
- Redact secrets before sharing or uploading; report paths rather than sensitive contents.
- Do not enable production telemetry ingestion or third-party result upload implicitly.
- Delete sensitive local artifacts according to repository policy after diagnosis.

If safe redaction cannot be established, do not upload or paste the artifact.

## Execution Workflow

1. Inspect repository instructions, performance contract, scripts, environment examples, orchestration, CI, and ignore rules.
2. Resolve and classify every target and generator from effective configuration.
3. Verify workload bounds, abort conditions, credentials, external fakes/sandboxes, data ownership, and cleanup.
4. Start owned services through the supported lifecycle and confirm readiness.
5. Apply established schema setup and seed minimum owned data outside measurement.
6. Run the bounded smoke scenario and verify telemetry, abort behavior, and cleanup.
7. Run only the approved measured workload.
8. Preserve safe evidence and clean all run-owned resources.
9. Confirm no owned process, connection, container, file, data, or sensitive artifact remains.
10. Report environment class, resolved safe target identifiers, workload, command, result, aborts, cleanup, and residue without exposing secrets.

Do not proceed to heavier load when smoke, safety validation, telemetry, or cleanup fails.

## Incident Response

If a run may have reached production, called an uncontrolled provider, exceeded authorized load, or modified unowned data:

- Stop workload generation immediately.
- Do not perform speculative broad cleanup.
- Preserve non-sensitive timestamps, command, run ID, target classification, workload reached, and observed actions.
- Report possible impact and the infrastructure, security, provider, or data owner required for recovery.
- Request credential rotation through the authorized secret owner when exposure is suspected.
- Resume only after target identity, affected state, credentials, and workload controls are verified safe.

## Rejection Checklist

Refuse or revise a setup that:

- Cannot prove every mutable target is non-production.
- Uses production, personal, customer, or overprivileged credentials or data.
- Enables an unrestricted safety or host bypass.
- Omits maximum VUs/rate/iterations/duration/data volume or abort conditions.
- Runs heavy load before a bounded smoke validation.
- Calls a real paid, destructive, or production external service.
- Shares mutable data without run/scenario ownership.
- Invokes ad hoc migrations or schema SQL from performance code.
- Reuses an unknown service or kills an arbitrary port owner.
- Uses broad, unresolved, or unowned cleanup.
- Silently changes target/generator resources or environment class.
- Uploads metrics or artifacts to an unapproved remote destination.
- Prints secrets or commits credentials, raw results, profiles, logs, or sensitive artifacts.
- Leaves owned processes, containers, sockets, connections, data, files, or artifacts behind.
- Continues after possible production access or loss of ownership.

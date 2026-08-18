---
name: e2e-environment-safety
description: Protect Playwright end-to-end execution environments, credentials, test data, external services, and diagnostic artifacts. Use before configuring or running E2E tests against local, CI, preview, or dedicated test targets; when validating baseURL, service endpoints, environment variables, storageState, webServer lifecycle, data seeding, worker isolation, or cleanup; when preventing production access and real paid or destructive provider calls; or when diagnosing leaked processes, occupied ports, shared-state contamination, unsafe teardown, or sensitive traces, screenshots, videos, HAR files, and logs.
---

# E2E Environment Safety

Fail closed before a browser starts. Run only when every mutable target is explicitly identified as non-production and every cleanup operation is limited to resources owned by the current run.

The universal tool/runtime and exact-command gates are defined in the
`e2e-test-runner` core. This skill assumes those gates have passed and adds only
target-safety, ownership, lifecycle, and cleanup rules.

When the backend E2E server uses TypeScript loaders, `package.json`
`imports`/`exports`, custom Node conditions, aliases, or both `src` and `dist`,
verify before startup that the parent and child processes receive the same
conditions and resolve one coherent module graph. If source/dist coherence
cannot be proven, stop and report a runtime-configuration blocker; do not fix
the symptom by weakening production error classification.

## Safety Gate

Perform this gate before starting services, seeding data, loading authentication state, or opening a browser:

- Resolve the effective frontend `baseURL` from the same configuration Playwright will use.
- Resolve backend, database, object-storage, queue, and external-provider endpoints that the journey can mutate.
- Classify each target as local ephemeral, CI ephemeral, preview, or dedicated test.
- Verify required variables by name without printing their values.
- Verify the run has an ownership identifier for data and resources it creates.
- Verify external providers use supported fakes or sandboxes.
- Verify cleanup targets only resources owned by this run.

Refuse to run when any target is missing, ambiguous, production-like, or cannot be proven safe. Do not rely on `NODE_ENV`, a variable name containing `test`, a nonstandard port, or a UI banner as proof of safety.

Production remains forbidden even for read-only journeys because browser actions, authentication, analytics, and background requests can mutate state.

## Target Validation

Use an explicit allowlist owned by the repository. The guard must inspect the parsed final URL, not a substring of the raw value.

- Allow loopback hosts such as `localhost`, `127.0.0.1`, and `::1` for local runs.
- Allow CI, preview, or dedicated test hosts only when the repository explicitly lists their exact hosts or safe suffixes.
- Reject credentials embedded in URLs.
- Reject malformed URLs, unexpected protocols, production domains, and unrecognized redirects.
- Validate the frontend and every directly configured mutable dependency independently.
- Keep the allowlist narrow. Do not accept arbitrary hosts through a bypass flag.

When the application redirects during startup or authentication, confirm the destination remains within the expected non-production boundary. Do not weaken TLS checks for remote environments merely to make a test pass.

## Configuration and Secrets

- Reuse the repository's existing environment loader and validation pattern.
- Report missing variable names, never secret values.
- Never hard-code credentials, tokens, cookies, connection strings, or private keys in tests, fixtures, configuration, snapshots, or committed examples.
- Pass secrets through the existing local or CI secret mechanism.
- Keep `.env` files, authentication state, and generated credentials ignored by version control.
- Do not dump `process.env`, request headers, cookies, local storage, provider payloads, or database URLs for diagnosis.
- Use least-privileged test-only credentials with access limited to the test environment.
- Reject production credentials even when the configured host appears non-production.

Treat any value that authenticates a browser or service as sensitive, including session cookies, bearer tokens, API keys, signed URLs, and Playwright `storageState` files.

## Authentication State

- Use dedicated test accounts, never personal or customer accounts.
- Store generated authentication state in the repository's ignored E2E output or auth directory.
- Create state through a setup project or existing fixture when the repository supports it.
- Use one account or state file per worker when tests mutate account-owned data.
- Do not share an expiring mutable session across parallel workers without a proven isolation contract.
- Delete only state files created by the current run.
- Never attach authentication state to reports or failure evidence.

If an authentication failure could be caused by expired state, regenerate test state through the supported setup path. Do not print or manually patch tokens.

## Service Lifecycle and Ports

Prefer the repository's Playwright `webServer` configuration or established orchestration command:

- Declare an explicit readiness URL or supported readiness signal.
- Use a bounded startup timeout.
- Let Playwright own and stop the process it starts.
- Configure graceful shutdown when the application supports it.
- Use `reuseExistingServer` only for intentional local reuse; disable it in CI.
- Preserve existing multi-service orchestration instead of creating parallel startup scripts.
- Capture only the minimum safe stdout and stderr needed for failures.

If an expected port is already occupied, identify the collision and stop. Never kill an arbitrary process, assume it is the intended service, or reuse it in CI. After the run, verify that processes started by the test command have stopped; do not terminate unrelated processes.

## Database and Schema Preconditions

An E2E journey may require a migrated database schema as an environment
precondition. The E2E agent does not own migration authoring, schema validation,
rollback verification, or migration repair.

- Treat a usable migrated schema as an infrastructure precondition, equivalent
  to the frontend and backend being deployed and ready.
- Use only the repository's established environment mechanism to prepare or
  verify that precondition, such as an existing project setup script, a
  Playwright setup project or configured `globalSetup`, or an orchestration
  service that applies migrations before application readiness.
- Validate the target as non-production before invoking the established setup
  mechanism. Do not substitute a different database, migration command, or
  changelog.
- Prefer application readiness or the established setup command's successful
  exit status. Do not add direct schema queries merely to make an E2E fixture
  verify migrations.
- Classify a missing, unavailable, or unapplied schema caused by environment
  setup as an **environment defect**.
- Classify an established migration command that fails because of an invalid
  changeset, checksum drift, or incompatible schema as a **migration defect** and
  return it to `backend-builder` or the designated database owner with safe
  evidence.
- Do not author, edit, repair, validate, roll back, or reapply migrations from
  E2E-owned code.
- Never invoke the Liquibase CLI, open PostgreSQL connections, read connection
  strings, import migration changelogs, or execute schema SQL directly from
  Playwright tests, fixtures, setup projects, or teardown.

## Test Data Ownership

Give each run a stable, collision-resistant identifier and include the worker identity where parallel mutation requires it.

- Prefer disposable databases, schemas, namespaces, buckets, queues, accounts, or tenants already supported by the project.
- Seed only the minimum data needed for the journey.
- Keep setup idempotent so interrupted runs can be retried safely.
- Make resource ownership queryable through an exact run ID, worker ID, or returned resource ID.
- Keep mutable data test-scoped unless worker-scoped reuse is required and safe.
- Never depend on shared mutable records or another test's cleanup.
- Do not use production-derived personal data. Use synthetic fixtures.

Avoid broad cleanup. Do not truncate shared tables, delete by a loose prefix, remove unresolved paths, empty shared buckets, or drop a database selected only through an unchecked variable.

## Safe Cleanup

Before every destructive cleanup:

1. Re-resolve and revalidate the target environment.
2. Confirm the resource carries the current run's exact ownership identifier.
3. Resolve explicit resource IDs or absolute paths.
4. Delete only those resources.
5. Make absence a successful outcome so teardown remains idempotent.

Run cleanup in teardown even after a test failure, but never let cleanup erase the original failure. If ownership cannot be proven, leave the resource in place and report its identifier for manual review.

Do not retry a destructive cleanup blindly after a partial failure. Re-read current state and verify ownership again.

## External Systems

Keep the application's browser-to-frontend and frontend-to-backend path real. Replace uncontrolled external providers at the application's supported test boundary.

Never call real:

- Paid LLM or inference providers.
- Email or SMS delivery services.
- Payment gateways or financial systems.
- Production object storage, queues, analytics, or observability ingestion.
- Destructive cloud, infrastructure, or account-management APIs.

Use a deterministic fake, emulator, or vendor sandbox already supported by the repository. Validate its endpoint and credentials independently. Do not add browser route interception for the application's own backend merely to avoid configuring the full stack.

## Artifacts and Diagnostics

Assume traces, screenshots, videos, HAR files, reports, console logs, and server logs can contain secrets or sensitive test data.

- Prefer capture on failure or first retry instead of unconditional retention.
- Keep generated artifacts in the configured output directory.
- Avoid recording request bodies, headers, or storage state unless the diagnosis requires them and sanitization is available.
- Use synthetic data so visible artifacts are safe by construction.
- Report artifact paths, not their sensitive contents.
- Redact secrets before sharing or uploading artifacts.
- Do not commit generated artifacts.
- Delete sensitive local artifacts after diagnosis according to repository policy.

If safe redaction cannot be established, do not upload or paste the artifact. Describe the failure without exposing the data.

## Execution Workflow

1. Inspect repository instructions, Playwright configuration, environment examples, setup projects, fixtures, scripts, and ignore rules.
2. Resolve and validate all effective targets and required variable names.
3. Confirm test-only credentials, deterministic external boundaries, and run ownership.
4. Start services through the supported lifecycle and wait for explicit readiness.
5. Seed the minimum owned data.
6. Run the smallest relevant journey.
7. Preserve only safe diagnostic evidence.
8. Clean up explicitly owned data and authentication state.
9. Confirm owned services and browsers stopped.
10. Report the resolved environment class, command, result, artifacts, cleanup status, and any residue without exposing secrets.

Do not proceed to a broader suite until the minimal journey passes and cleanup is verified.

## Failure and Incident Response

Classify environment failures separately from product and test failures. Typical environment failures include an unsafe target, missing configuration, service readiness failure, port collision, invalid credentials, unavailable fake provider, contaminated shared data, and incomplete cleanup.

If a run may have reached production or modified unowned shared data:

- Stop the run immediately.
- Do not perform speculative cleanup.
- Preserve non-sensitive identifiers, timestamps, command, target classification, and observed actions.
- Report the possible impact and the owner needed for recovery.
- Rotate exposed credentials through the authorized secret owner when exposure is suspected.
- Resume only after the target and affected state are verified safe.

## Rejection Checklist

Refuse or revise a setup that:

- Cannot prove every mutable target is non-production.
- Uses production, personal, or customer credentials or data.
- Enables an unrestricted safety bypass.
- Prints secrets or commits authentication state.
- Calls a real paid or destructive provider.
- Reuses an unknown server or kills an arbitrary port owner.
- Shares mutable users or records across parallel workers.
- Uses broad, unresolved, or unowned cleanup.
- Leaves owned services, browsers, or sensitive artifacts behind.
- Disables TLS validation for a remote target without an explicitly controlled test certificate policy.


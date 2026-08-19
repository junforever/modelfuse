---
name: postgres-liquibase-integration-testing
description: Implement, execute, and diagnose deterministic PostgreSQL and Liquibase integration tests on disposable databases. Use when validating real `pg` repository or service behavior, transactions, commit/rollback, constraints, unique or partial indexes, foreign-key cascades, cursors, locking, concurrent requests, recovery, and worker isolation; when testing Liquibase-formatted SQL and master/module changelog wiring through `validate`, migrate-from-zero, schema assertions, executed rollback to the exact prior state, and reapplication; or when investigating checksum drift, failed changesets, leaked connections, blocking locks, shared database contamination, and unsafe cleanup. Do not use for schema implementation, production databases, mocked persistence, ordinary HTTP contracts, frontend tests, or browser E2E.
---

# PostgreSQL and Liquibase Integration Testing

Test PostgreSQL behavior against the real engine and verify every migration can reach, leave, and regain its intended state. Fail closed before any destructive database action.

## Prerequisite

Start from the boundary contract produced by `integration-test-design`. Confirm that PostgreSQL or Liquibase behavior is the reason integration coverage is required.

Use this skill when the oracle depends on:

- PostgreSQL constraints, indexes, cascades, ordering, locking, or isolation.
- A repository/service using real SQL and transactions.
- Concurrent clients or recovery from persisted active state.
- Liquibase changelog discovery, checksums, update, rollback, or reapplication.

Return pure query construction, mapping, or branch logic to unit tests. Return HTTP translation to the backend contract skill unless database behavior is the primary risk.

## Safety Gate

Before connecting, seeding, migrating, rolling back, truncating, dropping, or cleaning:

1. Resolve the effective host, port, database, user, and schema from the same configuration the command will use.
2. Verify the host is loopback or an explicitly allowlisted CI test host.
3. Verify the database/schema carries an exact test-run ownership marker.
4. Verify credentials are dedicated and least-privileged for the disposable target.
5. Reject production-like, shared, missing, malformed, or ambiguous targets.
6. Record only safe target identity; never print passwords or full connection strings.

Do not infer safety from `NODE_ENV`, a variable name containing `test`, a Docker port, or an empty-looking schema. Never run destructive commands against a default database selected by missing configuration.

## Choose Isolation Scope

Prefer the narrowest project-supported disposable boundary:

1. Database per run for Liquibase lifecycle tests.
2. Schema per worker when migrations and application configuration support it safely.
3. Transaction per test only when committed cross-connection behavior is not under test.
4. Exact owned-row cleanup only when the preceding options are unavailable.

Do not wrap tests in a transaction when the behavior requires commit visibility, multiple connections, locks, recovery, or connection loss. Do not serialize the suite to compensate for shared mutable state.

Assign each run and worker stable unique identifiers. Keep seed data minimal and make cleanup idempotent.

## Liquibase Lifecycle Gate

Use the repository's existing Liquibase binary/container, properties, changelog path, contexts, labels, and command wrapper. Do not install another Liquibase runtime or invoke a parallel migration mechanism.

Run this sequence against a disposable PostgreSQL database:

### 1. Establish the baseline

- Start empty when testing the complete changelog.
- Start from an explicit prior tag or documented prior state when testing an incremental migration.
- Record the intended baseline through schema assertions, not assumptions.
- Confirm the master changelog includes the expected module changelog.

### 2. Validate

Run Liquibase `validate` with the exact changelog and target configuration intended for update.

- Treat syntax, duplicate identifier, include, path, checksum, and precondition failures as blocking.
- Do not use `clear-checksums` to hide an edited applied changeset.
- Do not modify changelog history tables manually.

### 3. Apply

Run `update` and assert success. Then verify the resulting state through behavior or stable PostgreSQL catalogs.

Check only contracted objects:

- Tables, columns, types, nullability, and defaults.
- Primary, unique, check, and foreign-key constraints.
- Required indexes, including uniqueness and predicates when material.
- Cascades, triggers, procedures, policies, or views explicitly introduced.
- Expected Liquibase execution records without depending on incidental ordering beyond changelog order.

Prefer behavioral assertions for constraints and cascades. Use `information_schema`, `pg_catalog`, and `pg_indexes` only for properties that cannot be proven safely through behavior.

### 4. Execute rollback

Rollback to the exact baseline using the repository's chosen tag or exact changeset count.

- Execute the rollback; generating `rollback-sql` is optional inspection and never substitutes for the real rollback test.
- Assert all introduced objects and effects are removed or restored as specified.
- Assert pre-existing objects and data remain intact.
- Assert Liquibase history reflects the rollback.
- Fail if rollback is absent, partial, destructive beyond scope, or dependent on manual repair.

Do not use `drop-all` as evidence that rollback works.

### 5. Reapply

Run `validate` and `update` again against the rolled-back state.

- Assert the same final schema and behavior.
- Confirm no duplicate objects, stale history, checksum drift, or non-idempotent seed effect remains.
- Treat successful reapplication as part of the migration gate, not an optional cleanup check.

## Repository and Service Tests

Use the real `pg` pool/client and production repository/service code inside the approved boundary.

- Apply real migrations before testing.
- Construct dependencies through the existing composition path.
- Seed through repositories or explicit test SQL according to the intention.
- Assert public return values and required committed effects.
- Query tables directly only when persistence is the contract or no public read surface exists.
- Close clients and pools in teardown.

Do not mock `pg`, SQL execution, constraints, or transaction semantics in a PostgreSQL integration test.

## Transaction Tests

Use one acquired client for every statement belonging to a transaction:

```ts
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await operation(client);
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

- Never mix `pool.query()` into a transaction owned by a checked-out client.
- Assert commit makes the complete state visible.
- Force a normal collaborator failure to assert rollback leaves no partial state.
- Preserve the original failure if rollback also fails.
- Verify the client is released after success and failure through observable pool cleanup or test teardown.

Do not add a production-only failure switch to exercise rollback.

## Constraints and Cascades

For each contracted database invariant, use the smallest behavior that proves it:

- Insert the valid baseline row.
- Attempt the violating write through the intended boundary.
- Assert the safe public/database error category.
- Assert existing state remains unchanged.

For cascades, create the smallest parent/child graph, delete the parent through the owned boundary, and verify only contracted descendants disappear. Do not infer cascade behavior solely from catalog metadata.

Avoid repeating every equivalent invalid value when one representative case plus unit-level validation covers the rule.

## Concurrency and Locking

Use separate real PostgreSQL connections when visibility, isolation, or locking matters.

1. Seed exact owned state.
2. Acquire independent clients.
3. Begin transactions explicitly.
4. Coordinate contenders through promises/barriers or observable lock state.
5. Trigger the competing action only after the required lock/state exists.
6. Assert winner, loser, replay, conflict, blocking, or serialization outcome.
7. Commit/rollback both transactions and release both clients in `finally`.

Use bounded local statement/lock timeouts for diagnostic safety and restore settings through transaction-local configuration where possible. Never synchronize with sleeps or rely on which query happens to win on a fast machine.

After a concurrency fix, repeat under the repository's normal worker configuration. A single-worker pass does not prove isolation.

## Cursor, Ordering, and Pagination

- Seed records with explicit distinct ordering keys.
- Avoid relying on insertion order or uncontrolled current timestamps.
- Assert a complete traversal has no gaps or duplicates.
- Assert stable tie-breaking when equal primary sort values are valid.
- Verify invalid/expired cursor behavior through the public repository/service contract.
- Keep page-size permutations minimal; test algorithmic parsing separately at unit level.

## Recovery and Persisted-State Tests

- Seed the exact interrupted persisted states defined by the contract.
- Run the real recovery service without external providers.
- Assert terminal state, busy projection, and absence of relaunched work.
- Run recovery a second time to prove idempotency when required.
- Keep fixtures versioned with the schema they target.

Do not simulate persistence with in-memory objects when restart recovery is the risk.

## Cleanup

Before destructive cleanup, re-resolve and revalidate the target and ownership marker.

- Close application pools and Liquibase connections first.
- Terminate only connections owned by the disposable test target when the established harness requires it.
- Drop only the exact database/schema created by the current run.
- Delete only rows carrying the exact run identifier.
- Treat already-absent owned resources as successful idempotent cleanup.
- Report residue instead of broadening deletion when ownership is uncertain.

Never use unresolved globs, loose prefixes, shared-table truncation, or arbitrary backend termination.

## Failure Diagnosis

Classify the first meaningful failure:

- **Migration defect**: validate, update, rollback, or reapply violates the intended changelog lifecycle.
- **Persistence defect**: real SQL/constraints/transactions violate the repository contract.
- **Test defect**: fixture, query, assertion, isolation, or cleanup misrepresents the behavior.
- **Environment defect**: PostgreSQL/Liquibase is unavailable, unsafe, incorrectly configured, or incompatible.
- **Contention defect**: leaked connection, lock, shared state, or worker collision changes the result.

Capture the command with secrets removed, changeset identity, SQLSTATE/error category, safe database/schema/run identifiers, and first failing assertion. Do not expose connection strings, credentials, customer data, or full sensitive rows.

Fix only tests, fixtures, validation SQL, and dedicated test infrastructure. Return changelog, repository, or service defects to the DB/backend owner without editing production artifacts.

## Verification Contract

After implementation:

1. Run the focused database test against a fresh disposable target.
2. Run Liquibase validate/update/rollback/reapply when migrations are in scope.
3. Run the related integration group under normal workers.
4. Confirm pools, clients, locks, schemas, databases, and containers owned by the run are closed or removed.
5. Report exact commands, target class, pass/fail counts, changesets, rollback point, retries, duration, and cleanup result.

## Rejection Checklist

Reject or revise a test that:

- Cannot prove the target is disposable and owned.
- Uses mocked PostgreSQL for database semantics.
- Uses `drop-all` or `rollback-sql` instead of executing the required rollback.
- Clears checksums or edits Liquibase history to obtain a pass.
- Omits reapplication after rollback.
- Uses one connection to pretend to test concurrency.
- Mixes pool queries into a client-owned transaction.
- Relies on sleeps, insertion order, shared timestamps, or suite serialization.
- Truncates or drops unverified shared state.
- Leaks clients, pools, locks, containers, schemas, or databases.
- Changes production migrations or repository code to fix the test.

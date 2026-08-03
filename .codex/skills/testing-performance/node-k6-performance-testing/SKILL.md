---
name: node-k6-performance-testing
description: Implement, execute, and diagnose bounded performance tests using an existing repository harness, native Node.js measurement, or k6. Use after a performance design contract is approved, when authoring fixed-sample latency checks, percentile calculations, k6 scenarios and executors, HTTP or stream performance measurements, tagged thresholds, custom metrics, workload data, smoke runs, or performance-result summaries; when choosing between Node.js and k6 for the approved workload; or when fixing defects in performance-owned scripts without changing production code, functional tests, requirements, thresholds, or target capacity.
---

# Node.js and k6 Performance Testing

Translate an approved `performance-test-design` contract into the smallest executable Node.js or k6 scenario. Preserve its target, workload, metric, threshold, data, measurement window, and safety bounds exactly.

## Entry Gate

- Load `performance-test-design` before implementing a new scenario. Stop if the contract is incomplete or assigns the behavior to another test layer.
- Load `performance-environment-safety` before selecting or contacting a target, creating load, seeding data, starting services, or cleaning resources.
- Load `performance-test-determinism` when choosing sample counts, percentile methods, baselines, repetitions, warm-up, or noise controls.
- Modify only performance-owned tests, fixtures, configuration, and result processing. Return production defects to the owning builder.
- Run no stress, spike, soak, or breakpoint workload without explicit bounds, abort conditions, and authorization.

## Repository Discovery

Before editing:

1. Read repository instructions, the assigned task, and the approved performance contract.
2. Inspect package scripts, lockfiles, existing performance directories, CI workflows, environment examples, container files, result ignore rules, and installed tool versions.
3. Reuse the established harness, file placement, command, configuration, tags, and reporting convention.
4. Trace the measured public boundary and every dependency that can affect it.
5. Consult official documentation for the installed k6 version before using version-sensitive APIs or executors.

Do not add a package, binary, extension, result store, dashboard, or generic framework when the existing repository or runtime already covers the contract.

## Choose One Execution Model

| Use | When it is sufficient |
|---|---|
| Existing repository harness | It can represent the approved workload and metrics safely |
| Native Node.js | Fixed samples, bounded low concurrency, one process, and simple latency/throughput acceptance or diagnosis |
| k6 | Virtual users, arrival-rate control, multiple stages, sustained duration, concurrent scenarios, protocol metrics, or thresholds under load |
| Existing browser-performance tool | The contract requires real-browser metrics; this skill does not replace that tool |

Do not implement the same acceptance threshold in both Node.js and k6 without a distinct diagnostic reason.

## Native Node.js Measurements

### Structure the run

Keep four visible phases:

1. **Setup**: validate configuration and create owned fixtures.
2. **Warm-up**: stabilize connections, pools, caches, and runtime paths; exclude these samples.
3. **Measurement**: execute only the approved operation and collect valid samples.
4. **Cleanup**: release every owned process, socket, connection, file, and row in `finally` blocks.

Use `performance.now()` or `process.hrtime.bigint()` as a monotonic clock. Never use wall-clock timestamps or fake timers to calculate durations.

### Collect valid evidence

- Validate the minimum status or response shape needed to prove each measured operation succeeded.
- Count failures separately; never record failed work as successful latency.
- Use the contract's exact sample count, concurrency, pacing, and cold/warm state.
- Keep sequential execution unless concurrency is explicitly part of the workload; do not add `Promise.all()` merely to shorten the test.
- Do not retry failed work unless retry behavior is itself part of the approved workload.
- Report sample count, success/error count, error rate, p50, required percentile(s), and maximum when available.

Reuse an existing percentile utility. Otherwise sort a copy numerically and use one documented rank rule consistently; do not mix interpolation methods between the threshold and baseline. Stop when the sample count cannot support the claimed percentile.

Preserve nonzero exits for threshold failures, test defects, and invalid executions. Classify unsafe, unavailable, or incomparable environments as inconclusive rather than as product failures.

## k6 Authoring

### Respect the runtime boundary

- Treat k6 JavaScript as a distinct runtime. Import built-in k6 modules and repository-approved helpers only; do not assume Node.js APIs or arbitrary npm packages work.
- Prefer the repository's established k6 binary, package script, or container command.
- Read non-secret inputs through the established configuration convention, commonly `__ENV`; validate required inputs before generating load.
- Never embed credentials, production URLs, customer data, or approved thresholds as convenient defaults.
- Use remote helpers or xk6 extensions only when an explicitly required protocol cannot be represented by built-ins and the extension is reviewed.

### Select the executor from the workload

| Workload contract | Typical executor family |
|---|---|
| Fixed total iterations shared across bounded VUs | Shared iterations |
| Fixed iterations per VU | Per-VU iterations |
| Stable closed-model concurrency | Constant VUs |
| Closed-model ramp through concurrency stages | Ramping VUs |
| Stable externally paced request/iteration rate | Constant arrival rate |
| Externally paced rate stages | Ramping arrival rate |

Treat the table as routing guidance, not permission to invent VUs, rates, stages, durations, preallocated VUs, or maximum VUs. Preserve every bound from the design contract and disclose whether the model is closed or arrival-rate based.

### Keep scenarios explicit

- Give each scenario one purpose, one exported execution function when needed, and stable tags that isolate its metrics.
- Set an explicit executor, duration or iterations, concurrency/rate controls, and maximum duration or VUs where applicable.
- Use multiple scenarios only when the contract requires distinct concurrent workloads or independent metric scopes.
- Do not combine unrelated operations into one latency percentile.
- Keep response bodies only when validation or business-completion measurement needs them.

### Define checks, metrics, and thresholds

- Use built-in HTTP metrics for protocol-level duration, failure rate, and request rate when they match the contract.
- Add a custom `Trend`, `Rate`, `Counter`, or `Gauge` only when no built-in metric represents the approved measure.
- Use `check()` only for the minimum correctness prerequisite. Bind its failure rate to a threshold when invalid samples must fail the run; checks alone are not an acceptance decision.
- Scope thresholds with scenario or operation tags so unrelated traffic cannot dilute a violation.
- Express the exact approved percentile, throughput, and error-rate conditions. Never replace a percentile with an average.
- Use `abortOnFail` and any delay only for approved safety or early-failure behavior; do not turn every threshold into an immediate abort.

### Handle data and lifecycle deliberately

- Load deterministic synthetic data once using the repository's established k6 pattern; use shared immutable data when every VU reads the same fixture.
- Assign unique mutable records per VU or iteration when collisions would invalidate the measurement.
- Keep setup and teardown outside the measured operation. Create and remove only run-owned data.
- Use deterministic fakes, emulators, or approved sandboxes for paid, destructive, or uncontrolled external systems.
- Add `handleSummary()` only when repository policy requires a specific stable summary. Do not commit volatile raw results by default.

## HTTP, Async, and Stream Boundaries

- Tag public operations separately and validate only enough protocol behavior to accept a sample.
- Distinguish connection establishment, time to first byte, total response time, stream lifetime, and completed business operation.
- For asynchronous commands, measure the boundary named in the contract: acceptance, first progress, terminal state, or persisted convergence.
- Do not claim end-to-end completion from a fast `202` when the contract extends to terminal work.
- Measure SSE connection or delivery performance only under an explicit performance requirement. Leave headers, event ordering, reconnection correctness, and cleanup contracts to `integration-test-runner`.
- If the installed k6/runtime cannot represent the required stream or browser metric faithfully, report a tooling gap instead of approximating it.

## Execution Workflow

1. Validate the non-production target, configuration, owned data, fakes/sandboxes, workload bounds, abort conditions, and cleanup.
2. Implement the smallest scenario that evaluates the approved contract.
3. Run a minimal smoke workload to prove script correctness, target access, metrics, thresholds, telemetry, and cleanup.
4. Fix only defects in performance-owned files.
5. Run the approved measured workload exactly once unless the determinism contract requires controlled repetitions.
6. Confirm the generator was not CPU-, memory-, connection-, or network-saturated.
7. Clean owned resources even after interruption or failure.
8. Record the exact command, tool/version, environment class, workload, sample count or duration, result, exit status, and cleanup outcome.

Never increase resources, reduce load, discard valid slow samples, relax thresholds, add retries, or rerun until a random pass appears.

## Diagnosis Boundaries

Classify evidence before editing:

| Classification | Response |
|---|---|
| Test defect | Fix scenario, validation, metric mapping, workload, or result processing |
| Environment defect | Report unavailable/unsafe target, dependency, data, configuration, or runner; mark inconclusive |
| Generator saturation | Reduce nothing silently; report the generator limit and mark inconclusive |
| Performance product defect | Preserve valid comparable measurements and return them to the owning builder |
| Functional product defect | Stop measurement and return the behavior to the builder and applicable functional test owner |
| Insufficient or noisy evidence | Apply `performance-test-determinism`; do not declare pass/fail |

Do not modify application code, database queries or indexes, caches, pools, migrations, scaling configuration, or product instrumentation.

## Authoring Review

Reject or revise an implementation that:

- Lacks an approved design contract or environment-safety decision.
- Chooses k6 for a bounded Node.js check without a workload reason.
- Uses Node.js for concurrency or pacing it cannot produce defensibly.
- Imports Node.js APIs into k6 or adds an unnecessary external helper.
- Includes setup, warm-up, seeding, or cleanup in the measured boundary unintentionally.
- Omits correctness prerequisites, error counts, required percentiles, or threshold scope.
- Combines unrelated operations or invalid samples into one distribution.
- Has unbounded VUs, rates, stages, duration, data volume, or parallel scenarios.
- Targets production or an unowned, paid, customer-facing, or destructive dependency.
- Uses fake timers, arbitrary sleeps, hidden retries, automatic baseline updates, or committed volatile result files.
- Runs a heavy workload before its smoke validation succeeds.
- Changes production code or functional tests to make the measurement pass.

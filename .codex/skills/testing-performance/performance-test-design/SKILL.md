---
name: performance-test-design
description: Design the smallest defensible performance test for a measurable web application or service contract. Use when deciding whether a requirement belongs at performance level; translating latency percentiles, throughput, error-rate, saturation, capacity, resource-growth, browser-metric, regression, load, stress, spike, soak, or breakpoint requirements into a test; choosing between an existing harness, native Node.js measurement, k6, or a browser-performance tool; defining workload, dataset, warm-up, measurement window, thresholds, environment, sample validity, abort conditions, and ownership; eliminating redundant scenarios; or rejecting work that belongs to unit, integration, E2E, security, visual, or production operations.
---

# Performance Test Design

Design the performance contract before designing the workload. Measure only a named risk through a bounded, reproducible workload.

## Workflow

### 1. Apply the performance gate

Use this skill only when time, rate, distribution, capacity, stability, or resource behavior is part of the contract. Valid subjects include percentile latency, throughput, error rate under workload, saturation, breakpoint and recovery behavior, long-running resource growth, browser performance metrics, and performance regression.

Redirect work that is primarily about:

| Subject | Owner |
|---|---|
| Deterministic function results | `unit-test-runner` |
| HTTP/SSE correctness, database or migration behavior, or real component collaboration without a browser | `integration-test-runner` |
| Functional browser journeys | `e2e-test-runner` |
| Vulnerability or abuse resistance | Specialized security testing |
| Pixel-level rendering | Visual testing |
| Live production or field telemetry | Operations/observability |

A functional timeout alone does not make a test a performance test.

### 2. Classify the performance risk

| Type | Purpose | Minimum workload shape |
|---|---|---|
| Acceptance | Prove an approved threshold | Representative bounded workload |
| Smoke | Verify the harness and target | Minimal low-rate workload |
| Average load | Observe expected sustained demand | Stable representative rate and duration |
| Stress | Observe behavior beyond expected demand | Bounded increasing stages with abort limits |
| Spike | Observe sudden demand changes and recovery | Bounded rapid rise, hold, and recovery |
| Soak | Detect degradation or resource growth over time | Sustained workload with explicit duration and abort limits |
| Breakpoint | Locate the first failed capacity condition | Bounded increments with a stop condition |
| Regression | Compare a stable metric against an approved baseline | Equivalent target, data, workload, and measurement window |

### 3. State one performance intention

Use this form:

> Given the named environment, data, and workload, when the public operation runs during the measurement window, then the named metric satisfies the approved threshold.

A diagnostic run without an approved threshold may report observations, but it cannot pass or fail an acceptance requirement.

### 4. Define the measured boundary

For asynchronous operations, name the exact endpoint of the measurement: command acceptance, first byte or progress event, first complete result, terminal event, persisted convergence, or full stream lifetime.

Exclude application startup, migrations, seeding, authentication setup, warm-up, and cleanup unless one of them is explicitly part of the contract.

### 5. Select metrics and valid samples

Choose only metrics that answer the named risk:

- Operation-tagged latency distributions, using percentiles rather than averages as the primary latency signal.
- Throughput or arrival/completion rate.
- Error rate under the selected workload.
- Saturation, recovery time, or resource-growth slope.
- Browser metrics when the contract is browser-rendering performance.

Reject functionally invalid samples and keep correctness assertions narrow enough to prove that measured work succeeded. Use averages only as supplemental context.

### 6. Define workload and dataset

Specify the applicable controls: iterations or sample count, virtual users or concurrency, arrival rate, stages, duration, think time, dataset cardinality and distribution, deterministic seed, cache/connection/process/browser state, and whether scenarios run in parallel.

Derive values from the specification, task, approved baseline, or stated capacity. Do not invent production traffic or budgets.

- For acceptance and regression work, stop when required values are missing.
- For diagnostics, use only the smallest safe bounded assumption and do not declare pass/fail.
- For stress, spike, soak, and breakpoint work, require explicit bounds and abort conditions.

### 7. Define environment and ownership

Name the non-production target, topology and relevant configuration, database state and cardinality, cache state, fakes or sandboxes, load-generator runner, versions, owned resources, and cleanup mechanism.

Reject production, ambiguous targets, paid or customer-facing dependencies, unbounded workloads, and shared resources without explicit ownership and authorization.

### 8. Choose the lightest valid tool

Select the first option that can preserve the contract:

1. Reuse the repository's established performance harness.
2. Use native Node.js measurement for a bounded, low-concurrency, fixed-sample acceptance or diagnostic check.
3. Use k6 when the workload requires virtual users, arrival rates, stages, sustained load, meaningful concurrency, or thresholds under load.
4. Use the repository's existing browser-performance tool for browser metrics.
5. Report a tooling gap if none of the above can measure the contract safely.

Do not introduce JMeter, `.jmx` files, or a Java runtime. Do not add k6 merely because the task is labeled performance.

### 9. Design warm-up and measurement

Define warm-up exclusion, sample count or duration, percentile resolution, monotonic clock use, startup separation, invalid-sample handling, repeat rules, evidence that the generator is not saturated, and baseline comparability.

Do not hide instability through arbitrary reruns, discard slow valid samples, retry failed work, silently increase resources, or reduce the workload.

### 10. Define thresholds and decision states

Bind each threshold to the exact approved metric and operation. Every execution ends in one state:

- **Pass**: valid measurements satisfy every approved threshold.
- **Fail**: valid measurements violate at least one approved threshold.
- **Inconclusive**: the environment, workload, samples, or generator cannot support a valid decision.

### 11. Remove redundant coverage

Leave functional permutations to lower test layers. Keep one performance scenario per metric/workload risk. Extend an existing scenario when boundary, workload, and environment match; split it when any of those materially differ. Do not duplicate the same percentile check in native Node.js and k6 without a distinct purpose.

## Design Contract

Produce this contract before implementation:

```markdown
## Layer decision
- Why this is performance-level work:
- Redirected concerns and owners:

## Performance intention
- Risk:
- Given / when / then:

## Test type and tool
- Type:
- Tool and why it is the lightest valid option:

## Target and measured boundary
- Non-production target:
- Public operation:
- Measurement start and end:
- Excluded setup:

## Metrics and thresholds
- Metric, scope, and approved threshold:
- Pass / fail / inconclusive rules:

## Workload and data
- Concurrency or arrival model:
- Stages, duration, and think time:
- Dataset cardinality, distribution, and seed:

## Measurement integrity
- Warm-up:
- Sample validity:
- Repeat and baseline rules:
- Generator saturation check:

## Safety and cleanup
- Bounds and abort conditions:
- Owned dependencies and cleanup:

## Non-duplicated coverage
- Existing scenario reused or extended:
- Functional checks left to lower layers:
```

If the layer gate rejects the task, stop and identify the correct owner. If implementation is requested, use this contract as the scope for the performance authoring and environment-safety skills.

## Quality Check

Reject or revise the design when any answer is yes:

- Is this only a functional timeout?
- Are the metric, threshold, workload, target, or measured boundary missing?
- Were production traffic or performance budgets invented?
- Is an asynchronous completion boundary ambiguous?
- Are unrelated operations combined into one percentile?
- Are setup, warm-up, or cleanup included unintentionally?
- Can failed work be counted as successful measurement?
- Is the sample too small for the claimed percentile?
- Could the generator be the bottleneck?
- Is the baseline incomparable?
- Does the run touch production, paid/customer dependencies, or unowned resources?
- Do stress, spike, soak, or breakpoint runs lack bounds or abort conditions?
- Can a lower layer prove the requirement directly?
- Does an equivalent performance scenario already exist?


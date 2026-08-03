---
name: performance-test-determinism
description: Diagnose, control, and verify nondeterministic performance measurements without masking regressions. Use when a native Node.js benchmark or k6 scenario is noisy, unstable, run-dependent, or passes only after reruns; when percentiles, throughput, error rates, or resource measurements vary unexpectedly; when warm-up contamination, insufficient samples, invalid aggregation, workload drift, uncontrolled data/cache state, environment differences, dropped iterations, load-generator saturation, or an incomparable baseline may invalidate a result; or when defining reproducible warm-up, sampling, repetitions, seeds, environment fingerprints, baseline comparison, and pass/fail/inconclusive rules. Do not use retries, threshold relaxation, resource increases, load reduction, selective sample removal, or averages to hide instability.
---

# Performance Test Determinism

Make performance evidence reproducible enough to support a decision without pretending that real latency is constant. Remove invalid variability at its source; preserve valid variance and report uncertainty.

## Scope Gate

- Apply this skill only within `performance-test-runner` work after `performance-test-design` defines the metric, threshold, workload, target, data, and measurement window.
- Use `node-k6-performance-testing` for implementation and execution changes.
- Use `performance-environment-safety` before changing targets, services, load, data, or cleanup.
- Redirect functional test races to the applicable unit, integration, or E2E determinism skill.
- Never change product code, the approved workload, or the threshold to stabilize a result.

## Diagnostic Workflow

### 1. Preserve the first evidence

Before editing or rerunning, record:

- Exact command, scenario/test, code revision, tool/runtime versions, and exit status.
- Target and generator environment class, relevant configuration names, dataset cardinality, cache state, and dependency mode.
- Workload model, VUs/concurrency, rate, stages, duration, samples, warm-up, and cold/warm state.
- Required metrics, thresholds, observed distribution, errors, dropped work, and safe resource evidence.
- Whether the result is reproducible, intermittent, or unique to one environment.

Do not discard the first miss by immediately rerunning until green.

### 2. Classify the instability

Assign one primary category before fixing:

| Category | Typical evidence |
|---|---|
| Contract ambiguity | Warm-up, samples, measured boundary, repetition, or decision rule is unspecified |
| Warm-up contamination | Startup, JIT, pool, connection, or cache establishment enters the distribution inconsistently |
| Insufficient sampling | Tail percentile or rate is inferred from too few valid observations |
| Workload drift | VUs, rate, pacing, stages, think time, or parallel scenarios differ between runs |
| Data/cache drift | Dataset size, distribution, seed, cache temperature, or mutable shared data changes |
| Environment noise | Hardware, runner contention, network, database, proxy, browser, or dependency state changes |
| Generator saturation | The generator cannot schedule, send, or measure the approved workload |
| Aggregation defect | Invalid samples, unrelated operations, or inconsistent percentile methods share a metric |
| Baseline mismatch | Revision, runner class, topology, data, configuration, or tool version is not comparable |
| Product regression | Repeated valid comparable evidence violates the approved threshold |

A timeout or threshold miss is a symptom, not a classification.

### 3. Build a controlled comparison matrix

Vary one factor at a time:

1. Repeat the smallest approved scenario with identical inputs and no retries.
2. Compare the declared cold/warm state only when the contract distinguishes them.
3. Compare an idle generator with the measured generator under the same workload.
4. Compare the normal runner with another runner only to identify environment dependence, not to merge results.
5. Compare against a baseline only after all comparability fields match.

Use bounded repetitions to estimate variability. Do not run the full suite or heavier load until the smallest instability is understood.

## Measurement Protocol

### Stabilize preconditions

- Keep tool/runtime version, code revision, runner class, topology, configuration, data cardinality/distribution, dependency mode, and cache state explicit.
- Use deterministic synthetic data and record its seed when generated.
- Isolate performance work from unrelated concurrent jobs when the environment permits it.
- Confirm service readiness before warm-up and measurement; readiness time is not endpoint latency unless contracted.
- Use a monotonic clock for native measurements and unmodified real time for performance execution.
- Keep setup, warm-up, measurement, and cleanup as separate phases.

Do not add fake timers, product-only clocks, fixed sleeps, or arbitrary stabilization delays.

### Make warm-up deterministic

- Use the repository's established warm-up rule or the exact rule in the contract.
- Apply the same warm-up operations, count/duration, data, cache state, and connection state on every comparable run.
- End warm-up by its predefined bound, not when values merely “look stable.”
- Exclude warm-up samples structurally: use a separate warm-up run or an explicitly tagged metric scope that cannot enter measured thresholds.
- Never delete early measured samples after seeing their values.

### Keep sampling and aggregation consistent

- Use the approved sample count or measured duration. If neither exists, report the result as diagnostic/inconclusive rather than inventing statistical confidence.
- Require enough valid samples to support the requested tail percentile; disclose the count alongside every percentile.
- Reuse the repository's percentile implementation. For native Node.js, sort a numeric copy and apply one documented rank/interpolation rule consistently.
- For k6, use `Trend` aggregation and tagged submetrics as the decision source; `summaryTrendStats` changes display, not the underlying contract.
- Keep latency, throughput, error rate, and correctness validity as separate measures.
- Exclude a sample only through a predeclared validity rule such as failed prerequisite or incomplete operation, never because its latency is inconvenient.
- Never average percentiles from independent runs. Evaluate each run under the approved rule; aggregate raw samples only when the contract explicitly permits it and every input is identical.

### Preserve workload fidelity

- Keep the same closed or arrival-rate model, pacing, stages, duration, concurrency, data distribution, and operation mix.
- Tag operations and scenarios separately so one fast path cannot dilute another path's percentile.
- Model think time only when it is part of the approved workload; do not add sleep as a stability fix.
- Register listeners before triggers for asynchronous or streaming boundaries.
- Measure the same completion point on every run: acceptance, first byte/event, terminal state, persisted convergence, or full stream lifetime.
- Count retries as separate work only when the product contract includes them; never retry to improve statistics.

## Detect Generator Saturation

Validate the generator before blaming the target:

- Observe generator CPU, memory, network, connection limits, event-loop delay where applicable, and achieved rate/concurrency.
- In k6 arrival-rate workloads, inspect `dropped_iterations`; dropped work means the requested rate was not fully generated.
- Distinguish insufficient VU allocation from target slowdown that keeps VUs occupied. Both can produce dropped iterations, but they require different evidence.
- In fixed-iteration scenarios, check whether `maxDuration` ended work before all iterations completed.
- In native Node.js harnesses, check client connection-pool limits, local backpressure, event-loop contention, and unbounded result buffering.
- Confirm the generator has headroom using the repository's established telemetry or a bounded diagnostic run.

Adjust generator allocation only within the approved workload bounds and environment capacity. Do not silently increase machine size, `maxVUs`, connections, or process count. If the generator cannot produce the contract reliably, mark the result inconclusive.

## Baseline and Regression Discipline

A comparison is valid only when these fields are materially equivalent:

- Metric definition, operation tags, percentile method, validity rules, and threshold.
- Workload model, stages, rate/concurrency, duration/samples, and think time.
- Code revision relationship and relevant service configuration.
- Target and generator runner class, topology, network path, tool/runtime versions, and dependency mode.
- Dataset cardinality/distribution, seed, cache state, and warm-up protocol.

Apply these rules:

- Treat baselines as reviewed evidence, not mutable defaults.
- Never update a baseline automatically after a failure.
- Preserve the original baseline and record the reason, reviewer, and comparability fields for an approved replacement.
- Do not call a difference a regression when the environments are incomparable; report it as inconclusive.
- Do not claim an improvement from lower load, fewer samples, larger resources, or removed slow samples.

## Repetition and Decision Rules

- Repeat only when the design contract or diagnostic plan defines a bounded count and interpretation.
- Keep retries disabled; a later passing run does not erase an earlier valid failure.
- Do not choose the best run. Report every controlled run and its decision.
- Use run-to-run spread as diagnostic evidence, not as permission to widen thresholds.
- Declare **pass** only when the approved rule is satisfied by valid comparable evidence.
- Declare **fail** only when a valid comparable run violates the approved threshold.
- Declare **inconclusive** for insufficient samples, environment drift, invalid workload, generator saturation, missing telemetry, or ambiguous aggregation.

## Product Regression vs Test Instability

Classify a performance product defect when the approved workload repeatedly produces valid comparable evidence that violates the threshold while correctness prerequisites and generator health remain valid. Preserve the exact command, environment fingerprint, workload, distributions, errors, and generator evidence for the owning builder.

Classify a test defect when the harness mixes phases or operations, calculates metrics inconsistently, accepts invalid samples, changes workload between runs, leaks resources, or interprets checks/summaries incorrectly.

Classify an environment defect when target readiness, infrastructure capacity, dependency availability, runner contention, clock behavior, or configuration prevents comparable measurement.

Do not fix a product regression by modifying queries, indexes, caches, pools, scaling, application code, or infrastructure. Return it to the owning builder.

## Verification Contract

After correcting the root cause:

1. Run the focused smoke scenario and confirm cleanup.
2. Run the smallest measured scenario for the bounded repetition count with retries disabled.
3. Confirm identical contract inputs and environment fingerprints for every comparable run.
4. Confirm sample validity, operation tags, requested workload achievement, generator headroom, and threshold evaluation.
5. Run the related performance group only when change risk justifies it.
6. Remove temporary diagnostics and volatile artifacts.
7. Report every run, observed spread, pass/fail/inconclusive decision, and remaining uncertainty.

Do not claim determinism after one green execution.

## Rejection Checklist

Reject or revise a stabilization that:

- Relaxes or reinterprets an approved threshold.
- Reduces VUs, rate, stages, duration, samples, data volume, or operation mix.
- Increases target or generator resources without recording a new environment class.
- Adds retries, fixed sleeps, fake timers, broad timeouts, or serial execution as the fix.
- Drops warm-up or slow samples after inspecting their values.
- Reports averages in place of required percentiles.
- Averages percentiles across runs or combines unrelated operation tags.
- Ignores functional failures, error rates, dropped iterations, or generator saturation.
- Compares different runners, topology, data, cache state, versions, or configuration as one regression series.
- Updates a baseline automatically or selects only the best run.
- Commits volatile raw result files without repository policy requiring them.
- Changes production code or functional tests to make the result stable.

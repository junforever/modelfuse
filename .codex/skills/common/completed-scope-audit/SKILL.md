---
name: completed-scope-audit
description: Perform a bounded, read-only static audit of an already implemented scope against explicit task criteria and normative artifacts.
metadata:
  author: junforever
  version: "1.1"
  category: read-only-audit
---

# Completed Scope Audit

## Applicability

Use this protocol only when the task explicitly requests a read-only audit of an already implemented scope and does not authorize product changes. Do not use it for implementation-stage reviews or tasks that explicitly require build, test, lint, typecheck, deployment, or runtime verification.

## Authority and scope

1. Treat the task acceptance criteria as the primary authority.
2. Apply repository rules from `AGENTS.md`.
3. Use only the normative artifacts named by the task.
4. Inspect only the paths assigned by the task. Do not discover or audit unrelated paths.
5. If the task omits paths or acceptance criteria, stop and emit a blocked report.

## Execution limits

- Prefer groups of 8–20 related files; never exceed 25 files in one group.
- Group by responsibility and data flow, not by filename order.
- A file with more than 800 lines counts as two files for the group limit.
- Allow at most 20 minutes per group and 60 minutes for the complete task.
- When a limit is reached, stop the current deep inspection and emit a partial report. Do not wait indefinitely.

## Deterministic depth

1. Inventory every assigned path and count files before opening a group.
2. For each group, inspect every file needed to evaluate its assigned criteria.
3. Perform structural checks first: ownership, boundaries, imports, contracts, forbidden patterns, and required artifacts.
4. Trace direct dependencies only when needed to substantiate a finding. Do not expand the scope into a new group without task authorization.
5. Record exact file and line locations for findings. If a claim cannot be tied to an exact location, record it as unverified instead of inventing a finding.
6. Close each group once. Re-read a closed file only once and only when it is directly required to confirm a finding.

## Checkpoints and partial results

Progress is an external coordination requirement, not an internal note. The delegation MUST provide a canonical `coordinator_target` task identifier. Send each JSON progress report by invoking the runtime tool `collaboration.send_message` with `target` set to that exact identifier and `message` set to the JSON object. Do not use the final response, commentary, or an unaddressed message as a checkpoint. Do not wait for a coordinator reply unless the coordinator explicitly asks for one.

Before reading any file, make the initial checkpoint call as a transport probe. If `coordinator_target` is missing, `collaboration.send_message` is unavailable, or the call is rejected, stop before auditing and emit a blocked final report with the phase, target state, and raw safe tool error.

Send one JSON progress report within 90 seconds of starting, before reading the first group, after every completed group, every 5 minutes while a group remains active, after 10 read-only inspection operations, whichever comes first, immediately after a blocker or failed operation, and immediately before the final report. Do not emit duplicate checkpoints for the same event.

If the messaging channel is unavailable, stop before auditing and emit a blocked report. A final response without the required external progress reports is incomplete evidence.

Progress reports MUST use this shape:

```json
{
  "report_type": "audit_progress",
  "task_id": "string",
  "status": "in_progress|blocked|incomplete",
  "phase": "started|inventory|group_audit|finalizing",
  "completed_groups": ["string"],
  "current_group": "string|null",
  "files_scanned": 0,
  "files_total": 0,
  "coverage_percent": 0,
  "findings_so_far": [],
  "unverified": [],
  "blocker": "string|null",
  "next_action": "string"
}
```

Progress reports MUST not contain secrets, credentials, tokens, cookies, personal data, raw environment values, raw response bodies, or unnecessary implementation internals.

## Read-only and failure rules

- Do not modify files or generate patches.
- Do not run builds, tests, typechecks, lint, Docker, application commands, network calls, or external documentation lookups unless the task explicitly authorizes that exact operation.
- Do not retry a failed operation more than once with the same inputs. If the retry fails, record the safe error and mark the affected group blocked.
- Do not delegate work to another agent.
- Do not reinterpret a missing artifact as a pass.
- Do not classify an unreviewed file as compliant.

## Findings and final status

Each finding MUST include:

- `id`
- `file_path`
- `line_start`
- `line_end`
- `category`
- `severity`
- `rule`
- `description`
- `recommendation`
- `core_rule_violated`

Use only these severities: `critical`, `high`, `medium`, `low`, `info`.

The final report MUST use this shape:

```json
{
  "report_type": "audit_final",
  "task_id": "string",
  "status": "passes|passes_with_warnings|requires_changes|incomplete",
  "coverage": {
    "files_scanned": 0,
    "files_total": 0,
    "groups_completed": 0,
    "groups_total": 0,
    "coverage_percent": 0
  },
  "audit_summary": {
    "total_findings": 0,
    "critical": 0,
    "high": 0,
    "medium": 0,
    "low": 0,
    "info": 0
  },
  "findings": [],
  "unverified": [],
  "blockers": []
}
```

Set `status` deterministically:

- `passes`: all assigned groups are complete and there are no findings;
- `passes_with_warnings`: all assigned groups are complete and findings are only `medium`, `low`, or `info`;
- `requires_changes`: any finding is `critical` or `high`;
- `incomplete`: any assigned group is unreviewed or blocked, regardless of finding count.

If the time or file budget is exhausted, emit the final shape with `status: "incomplete"`; never claim `passes` or `passes_with_warnings` for partial coverage.

## Safe output

Never include API keys, passwords, tokens, cookies, card numbers, personal data, secret values, connection strings, or raw sensitive payloads in progress reports or findings. Refer only to the safe identifier, field name, file, line, and impact. Redact any sensitive value as `<redacted>`.

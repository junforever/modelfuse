---
name: evidence-evaluation
description: Validates collected usability evidence, computes success metrics, decides pass/fail against acceptance criteria, and generates UX improvement recommendations. Use for evidence evaluation tasks or explicit usability evaluation requests.
compatibility: Generic across any feature/project. Works with Markdown evidence files.
metadata:
  author: junforever
  version: '1.0'
  category: usability
---

# Evidence Evaluation Skill for Usability Testing

Apply this skill ONLY when the task explicitly requires validating collected usability evidence, computing metrics, deciding pass/fail, or generating UX improvement recommendations. For basic documentation tweaks or clarifications, rely on the core agent rules.

## 🎯 When to Activate

Activate this skill when the task involves:

- Evaluating usability evidence for a feature.
- Computing metrics for success criteria defined in the protocol.
- Generating a usability results report.
- Deriving UX improvement recommendations from results.
- Explicit evidence evaluation tasks in a tasks.md file.

## 📄 Evidence Validation

- Before reading evidence, read `{feature_dir}/usability/memory/product-ux-memory.md`, resolve the single current protocol path recorded there, and read that protocol, `{feature_dir}/usability/protocol/participant-roster.md`, and `{feature_dir}/usability/protocol/protocol-lock.md`.
- If the memory file is missing, does not identify exactly one current protocol path, or any referenced artifact is unavailable, stop and report the invalid workspace; do not guess.
- Reject duplicate YAML keys in evidence frontmatter, protocol, roster, and lock metadata; never apply a parser's last-value-wins behavior.
- The lock must contain exactly one `protocol_version`, `protocol_path`, `protocol_hash`, `roster_path`, `roster_hash`, `locked_at`, `roster_locked_at`, and `collection_start_at`; all three timestamps must be ISO 8601 with explicit timezones and satisfy `locked_at <= roster_locked_at <= collection_start_at`.
- Normalize all lock paths as POSIX-relative paths under `{feature_dir}/usability/`. Require `protocol_path` to equal the single current protocol path recorded in memory and `roster_path` to equal `protocol/participant-roster.md`; reject absolute paths, paths that escape the usability directory, or any mismatch.
- Recompute the protocol and roster SHA-256 hashes using the canonicalization rule in `protocol-lock-template.md`. If either hash differs from the lock, stop and report the lock as invalid; do not evaluate or move evidence.
- Require every `protocol_version` in the lock, protocol, roster, and memory to match `^v[0-9]+\.[0-9]+\.[0-9]+$` and to match one another exactly. Require the roster's `protocol_hash`, `roster_locked_at`, and `collection_start_at` to match the lock exactly. The roster must contain unique participant IDs and a positive integer `planned_participant_count` equal to the number of listed IDs.
- Require memory's current protocol path, lock path, and roster path to be POSIX-relative under `{feature_dir}/usability/`, with no absolute or `..` segments, and to match the resolved lock and roster paths exactly. Require memory's protocol version/hash, lock timestamp, roster hash, roster lock timestamp, and `collection_start_at` to match the resolved lock and roster exactly, normalizing timestamps as specified above. If any value is missing or differs, stop and report the workspace metadata as invalid; do not evaluate or move evidence.
- The declared `collection_start_at` is immutable and must precede or equal every accepted session date.
- The protocol must define a positive integer `minimum_completed_tasks` that does not exceed its number of defined tasks, and every criterion must define a 0–100 percentage threshold, applicability (`all_valid` or a participant list containing only roster IDs), and help policy (`none` or `allowed`). If any is missing or invalid, stop and report the invalid protocol.
- Read only regular Markdown evidence files (`*.md`, case-insensitive) in `incoming/`.
- YAML is allowed only as frontmatter embedded in a Markdown file. Standalone CSV, JSON, YAML, YML, or any other format is unsupported. If any such regular file exists in `incoming/`, stop and report it; do not ignore, evaluate, move, or delete it.
- A file whose name already matches `*.processed.md` (case-insensitive) is not eligible for evaluation, even if it is found in `incoming/`.
- **Validate schema against the template:**
  - Reference the template at:
    ```text
    .codex/skills/product-ux/protocol-design/assets/evidence-session-template.md
    ```
  - Check that each file has YAML frontmatter with the required fields for the active protocol mode.
  - Check that each file has a markdown section "Required Fields (Mandatory)".
  - Require exactly one `participant_id` and one `criterion_id` per file. The pair `(participant_id, criterion_id)` is the unique unit of analysis.
  - Require `protocol_version` and `protocol_hash` to match the lock exactly. A missing or mismatched value makes the file `non_comparable`.
  - Require `date` to be an ISO 8601 timestamp with an explicit timezone and `date >= collection_start_at`; an earlier session is `non_comparable`. This requirement applies to legacy protocols too and does not retrofit provenance fields.
  - Determine provenance mode only from the protocol frontmatter: exact `provenance_policy: human_attestation_v1` enables the policy; absence of that marker in an existing locked protocol means legacy.
  - If `provenance_policy` is present with any value other than exact `human_attestation_v1`, stop and report the protocol as invalid; do not classify it as legacy.
  - In enabled mode, require `collection_attestation` to equal exactly `human_attested`.
  - In enabled mode, require `moderator_id` to follow the exact format defined in `evidence-session-template.md`; this validates only the declared syntax and does not verify pseudonymization or identity.
  - In enabled mode, require `recorded_at` to be an ISO 8601 timestamp with an explicit timezone and greater than or equal to `date` after UTC normalization.
  - In legacy mode, do not retrofit these fields or reject otherwise valid evidence for their absence; set the report status to `not_attested_not_verified`.
  - Require `success_first_attempt` and `help_received` to be exactly lowercase `y` or `n`; do not coerce other values.
  - Require `clarity`, `confidence`, `effort`, and `frustration` to be numeric integers. Saturate each value greater than 5 to 5 and record the original field/file in the report and memory normalization summary. Values between 1 and 5 that are not integers, values below 1, non-numeric values, or missing values are invalid evidence.
  - Require every `participant_id` to exist in the locked roster and every `criterion_id` to exist in the protocol. An unknown participant or criterion is an error; do not add it implicitly.
  - If two files contain the same `(participant_id, criterion_id)` pair, stop and report the duplicate; never choose one record silently.
  - Optional fields may be omitted. If an optional field is present but empty, treat it as absent, not as invalid evidence.
  - If any required field is missing, stop and report:
    - which files are affected,
    - which fields are missing.
  - Do not attempt to evaluate incomplete evidence.
  - If any evidence is `non_comparable`, reject the entire batch, leave all files in `incoming/`, and report each file and reason. Do not mix comparable and non-comparable protocol versions in one evaluation.

## 📊 Metrics Computation

- Apply the protocol's fixed roster and `minimum_completed_tasks` rule:
  - Count distinct `task_id` values observed for each roster participant.
  - Exclude a participant from every denominator only when the participant has fewer than the predeclared `minimum_completed_tasks`.
  - Never add a participant after `roster_locked_at` and never remove a participant based on the observed outcome.
- For each protocol criterion, calculate:
  - `valid_participants(c)`: valid roster participants to whom criterion `c` applies (`all_valid` or the explicit protocol list).
  - `successes(c)`: members of `valid_participants(c)` with `success_first_attempt = y` and, when `help_policy = none`, `help_received = n`.
  - `success_rate(c) = successes(c) / valid_participants(c)` as an unrounded ratio in [0, 1].
  - `success_percentage(c) = 100 * success_rate(c)`; compare the unrounded percentage with the protocol's 0–100 threshold and round only the reported display value to two decimal places.
- For `help_policy = allowed`, `help_received` does not disqualify a first-attempt success. For `help_policy = none`, `help_received = y` is a non-success.
- If a valid participant lacks an observation for an applicable criterion, count that participant as a non-success and report the missing observation as incomplete evidence.
- If `valid_participants(c) = 0`, record the criterion as `not_evaluable` and fail the acceptance gate; never divide by zero.
- Compare each unrounded percentage against the criterion threshold and record numerator, denominator, percentage, and pass/fail.

## 📈 Results & Recommendations

  - Generate or update the Markdown result file at the exact path `{feature_dir}/usability/results/usability-results.md` including:
  - methodology summary,
  - protocol lock snapshot (version, protocol hash, roster hash, lock timestamp, and collection start),
  - roster snapshot (protocol version, lock timestamp, initial size),
  - a `Provenance disclosure` section with status `human_attested_not_verified` when the locked protocol declares the provenance policy, stating that provenance was supplied by the responsible human moderator and that the agent validated only metadata presence, exact value, syntax, and timestamp ordering; use `not_attested_not_verified` for protocols predating the policy. Never claim independent verification of session occurrence, moderator identity, or pseudonymization,
  - for protocols declaring the policy, the number of evidence files with valid attestations and the number of distinct pseudonymous moderator IDs; for legacy protocols, report these counts as `not_applicable`,
  - sample description (valid size, exclusions, and exclusion reasons),
  - metrics per criterion (numerator, denominator, percentage, pass/fail),
  - observations,
  - subjective metric normalization summary (count and affected files/fields; values above 5 saturated to 5),
  - UX improvement recommendations:
    - behavioral/UX-oriented,
    - no implementation details or code.
- Update the feature memory file at `{feature_dir}/usability/memory/product-ux-memory.md` with:
  - date,
  - build/version evaluated,
  - protocol version, protocol hash, roster hash, lock path, and collection start,
  - provenance disclosure status and counts of attested evidence files and distinct pseudonymous moderator IDs; never record these as independently verified human provenance,
  - metrics and pass/fail decisions,
  - subjective metric normalization summary (count and affected files/fields),
  - link to result file(s),
  - summary of recommendations.
- **Preflight conflicts before persistence**:
  1. Use the exact result path `{feature_dir}/usability/results/usability-results.md`; an existing result is updated only through the transaction below, never by direct overwrite.
  2. Use the fixed transaction directory `{feature_dir}/usability/.evaluation-transaction/`. If it exists, read its manifest and roll back every recorded move and target replacement to the pre-run state, remove the transaction directory, report the rollback, and do not start a new evaluation in the same run. If the manifest is missing or invalid, stop and report the incomplete transaction without changing any file.
  3. Compute the final `.processed.md` destination for every consumed file. If any destination already exists, stop and report the conflicts; do not write results, update memory, or move any evidence.
- **Commit evidence only after successful persistence**:
  1. Validate all evidence and compute the complete evaluation.
  2. Complete the preflight conflict checks above.
  3. Create the transaction directory and a manifest containing the target paths, whether each target existed, every source/destination evidence pair, and the transaction phase. Write and validate staged result and memory files inside that directory.
  4. Move existing result and memory targets into the transaction directory as backups, then install both staged files. Record the phase only after both replacements succeed. If replacement fails, restore backups (or remove newly created targets), remove the transaction directory, leave evidence in `incoming/`, and report the transaction failure. If restoration fails, stop and report the exact artifact state; do not move evidence.
  5. Only after both target files are committed, move consumed files from `incoming/` to `processed/`, recording each successful move in the manifest. If a filesystem error occurs, roll back every recorded move and restore the target backups. If rollback fails, report the exact moved and unmoved files and do not claim a complete evaluation.
  6. Remove the transaction directory only after both target files and all evidence moves succeed. A successful run must leave no transaction artifacts.
- **Move processed evidence**:
  - Move (not copy) each consumed file; do not modify its content.
  - Evidence inputs are Markdown, so `incoming/session-P01.md` becomes `processed/session-P01.processed.md`; do not produce another extension.
  - If the destination already exists, stop and report a processing conflict; never overwrite it.
  - Do not leave the original file in `incoming/` after a successful move.

## 📝 Output Expectations

- Markdown result file(s) in `{feature_dir}/usability/results/`.
- Updated Markdown memory file at `{feature_dir}/usability/memory/product-ux-memory.md`.
- **Evidence files moved from `incoming/` to `processed/`** using the `.processed` filename rule (originals removed from `incoming/`).
- Brief summary of metrics, decisions, and recommendations.
- Do not simulate or invent evidence. Evidence under a provenance-enabled protocol must be human-attested; legacy evidence follows its locked schema and must be reported as not attested. Never report either case as independently verified human collection.
- UX improvement recommendations must be behavioral/UX-oriented, not implementation details.

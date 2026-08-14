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
- The lock must contain exactly one `protocol_version`, `protocol_path`, `protocol_hash`, `roster_path`, `roster_hash`, `locked_at`, `roster_locked_at`, and `collection_start_at` with `locked_at <= roster_locked_at <= collection_start_at`.
- Recompute the protocol and roster SHA-256 hashes using the canonicalization rule in `protocol-lock-template.md`. If either hash differs from the lock, stop and report the lock as invalid; do not evaluate or move evidence.
- Require the protocol and roster `protocol_version` values to match the lock exactly. The roster must contain unique participant IDs and `planned_participant_count` equal to the number of listed IDs.
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
  - Check that each file has YAML frontmatter with required fields.
  - Check that each file has a markdown section "Required Fields (Mandatory)".
  - Require exactly one `participant_id` and one `criterion_id` per file. The pair `(participant_id, criterion_id)` is the unique unit of analysis.
  - Require `protocol_version` and `protocol_hash` to match the lock exactly. A missing or mismatched value makes the file `non_comparable`.
  - Require `date >= collection_start_at`; an earlier session is `non_comparable`.
  - Require `success_first_attempt` and `help_received` to be exactly lowercase `y` or `n`; do not coerce other values.
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

- Generate a Markdown result file in `{feature_dir}/usability/results/` (e.g., `usability-results.md`) including:
  - methodology summary,
  - protocol lock snapshot (version, protocol hash, roster hash, lock timestamp, and collection start),
  - roster snapshot (protocol version, lock timestamp, initial size),
  - sample description (valid size, exclusions, and exclusion reasons),
  - metrics per criterion (numerator, denominator, percentage, pass/fail),
  - observations,
  - UX improvement recommendations:
    - behavioral/UX-oriented,
    - no implementation details or code.
- Update the feature memory file at `{feature_dir}/usability/memory/product-ux-memory.md` with:
  - date,
  - build/version evaluated,
  - protocol version, protocol hash, roster hash, lock path, and collection start,
  - metrics and pass/fail decisions,
  - link to result file(s),
  - summary of recommendations.
- **Commit evidence only after successful persistence**:
  1. Validate all evidence and compute the complete evaluation.
  2. Write the result file and update memory successfully.
  3. Only then move consumed files from `incoming/` to `processed/`.
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
- Do not simulate or invent evidence; all data must be human-collected.
- UX improvement recommendations must be behavioral/UX-oriented, not implementation details.

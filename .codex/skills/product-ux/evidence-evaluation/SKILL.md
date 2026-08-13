---
name: evidence-evaluation
description: Validates collected usability evidence, computes success metrics, decides pass/fail against acceptance criteria, and generates UX improvement recommendations. Use for evidence evaluation tasks or explicit usability evaluation requests.
compatibility: Generic across any feature/project. Works with Markdown or CSV evidence files.
metadata:
  author: your-name
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

- Read all evidence files in `incoming/` that:
  - do NOT contain `.processed` in their name,
  - are NOT inside `processed/`.
- Validate schema:
  - Check that each file includes all required fields:
    - participant_id
    - date
    - build_version
    - device
    - moderator
    - task_id
    - success_first_attempt
    - help_received
    - clarity
    - confidence
    - effort
    - frustration
    - notes
  - If any required field is missing, stop and report:
    - which files are affected,
    - which fields are missing.
  - Do not attempt to evaluate incomplete evidence.

## 📊 Metrics Computation

- Apply inclusion/exclusion rules from the protocol:
  - Exclude participants only if they match pre-defined criteria.
  - Do not change the denominator retrospectively.
- For each success criterion defined in the protocol:
  - Count participants who succeeded on the first attempt without help.
  - Compute percentage = successes / valid_participants.
  - Compare against the threshold defined in the protocol.
  - Record pass/fail.

## 📈 Results & Recommendations

- Generate a result file in `specs/{feature_id}/usability/results/` (e.g., `usability-results.md`) including:
  - methodology summary,
  - sample description (size, exclusions),
  - metrics per criterion (numerator, denominator, percentage, pass/fail),
  - observations,
  - UX improvement recommendations:
    - behavioral/UX-oriented,
    - no implementation details or code.
- Move/mark processed evidence:
  - Copy consumed files from `incoming/` to `processed/` (same name or with `.processed.md` suffix).
  - Do not modify the original content.
- Update the feature memory file in `memory/` with:
  - date,
  - build/version evaluated,
  - metrics and pass/fail decisions,
  - link to result file(s),
  - summary of recommendations.

## 📝 Output Expectations

- Result file(s) in `specs/{feature_id}/usability/results/`.
- Updated memory file in `specs/{feature_id}/usability/memory/`.
- Evidence files copied to `processed/`.
- Brief summary of metrics, decisions, and recommendations.
- Do not simulate or invent evidence; all data must be human-collected.
- UX improvement recommendations must be behavioral/UX-oriented, not implementation details.

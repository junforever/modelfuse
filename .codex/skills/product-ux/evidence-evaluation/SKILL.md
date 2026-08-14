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

- Generate a Markdown result file in `{feature_dir}/usability/results/` (e.g., `usability-results.md`) including:
  - methodology summary,
  - sample description (size, exclusions),
  - metrics per criterion (numerator, denominator, percentage, pass/fail),
  - observations,
  - UX improvement recommendations:
    - behavioral/UX-oriented,
    - no implementation details or code.
- Update the feature memory file at `{feature_dir}/usability/memory/product-ux-memory.md` with:
  - date,
  - build/version evaluated,
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

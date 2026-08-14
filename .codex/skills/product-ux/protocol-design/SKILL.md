---
name: protocol-design
description: Designs usability evaluation protocols, success criteria, sampling rules, tasks/scenarios, and data collection templates. Use for protocol design tasks or explicit usability protocol requests.
compatibility: Generic across any feature/project. Works with Markdown templates.
metadata:
  author: junforever
  version: '1.0'
  category: usability
---

# Protocol Design Skill for Usability Evaluation

Apply this skill ONLY when the task explicitly requires designing or updating a usability evaluation protocol and associated data collection templates. For basic documentation tweaks or clarifications, rely on the core agent rules.

## 🎯 When to Activate

Activate this skill when the task involves:

- Designing or updating a usability evaluation protocol for a feature.
- Defining success criteria (e.g., "≥90% success in first attempt without help").
- Defining sampling rules (minimum participants, inclusion/exclusion criteria).
- Designing tasks and scenarios for usability testing.
- Creating data collection templates (Markdown) for sessions or surveys.
- Explicit protocol design tasks in a tasks.md file.

## 🏗️ Protocol Structure & Content

- Define clear objectives and success criteria for the evaluation.
- Specify target users and sampling rules:
  - minimum participants (e.g., ≥10),
  - inclusion/exclusion criteria.
- Describe tasks and scenarios:
  - clear description of each task,
  - what counts as "success" and "help".
- Define one stable `criterion_id` for every success criterion.
- Define a criterion table with `criterion_id`, a threshold expressed as a percentage from 0 to 100, applicability (`all_valid` or an explicit participant list), and help policy (`none` or `allowed`).
- Define scales for subjective metrics (clarity, confidence, effort, frustration), including range (e.g., 1–5 or 1–7).
- Specify one positive integer `minimum_completed_tasks` rule for valid participation. It must not exceed the number of tasks defined by the protocol. A participant below that threshold is excluded from every denominator.
- Specify rules for missing criterion observations and dropouts before collection starts. A valid participant missing an applicable criterion observation is counted as a non-success and reported as incomplete; do not remove that participant from the denominator.
- Create and lock `{feature_dir}/usability/protocol/participant-roster.md` before collection starts, using:
  ```text
  .codex/skills/product-ux/protocol-design/assets/participant-roster-template.md
  ```
  The roster must contain unique participant IDs, `planned_participant_count`, `roster_locked_at`, and `collection_start_at`, with `roster_locked_at` earlier than or equal to `collection_start_at`.
- List metadata to record per session:
  - participant_id, date, build_version, device, moderator, task_id, criterion_id.

## 📄 Data Collection Template Requirements

- Create every protocol and data-collection template as a Markdown file with a `.md` extension.
- Use the template defined at:
  ```text
  .codex/skills/product-ux/protocol-design/assets/evidence-session-template.md
  ```
- **Required fields** (YAML frontmatter + markdown list) MUST be present in every file.
- Each evidence file represents exactly one `(participant_id, criterion_id)` observation. `criterion_id` is required and must match a criterion in the protocol.
- Evidence files accepted by the evaluation workflow are Markdown files only (`.md`). YAML is allowed only as frontmatter embedded in that Markdown file; standalone CSV, JSON, YAML, or other formats are not supported.
- **Optional fields** may be added per feature but must be documented in the protocol.
- Optional fields may be omitted. If an optional field is present but empty, treat it as absent, not as invalid evidence.
- Templates must be empty or contain only examples clearly marked as such; do not simulate or pre-fill evidence.

## 🧠 Feature Memory Update

- Create or update the feature memory file at:
  ```text
  {feature_dir}/usability/memory/product-ux-memory.md
  ```
- Include:
  - protocol version,
  - exactly one current protocol path (recorded in memory) and template locations,
  - roster path, roster size, and roster lock timestamp,
  - success criteria,
  - required fields schema (or reference),
  - sampling rules, completion threshold, applicability, and help policy.

## 📝 Output Expectations

- Current protocol file at the single path recorded in `{feature_dir}/usability/memory/product-ux-memory.md`.
- Locked participant roster at `{feature_dir}/usability/protocol/participant-roster.md`.
- Template file(s) in the same folder.
- Updated Markdown memory file in `{feature_dir}/usability/memory/`.
- Brief summary of decisions and rationale.
- Do not simulate or pre-fill evidence; templates must remain empty or contain only clearly marked examples.

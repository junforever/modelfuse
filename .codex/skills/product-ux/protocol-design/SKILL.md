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
- Define scales for subjective metrics (clarity, confidence, effort, frustration), including range (e.g., 1–5 or 1–7).
- Specify rules for missing data / dropouts (defined before starting).
- List metadata to record per session:
  - participant_id, date, build_version, device, moderator.

## 📄 Data Collection Template Requirements

- Create templates in Markdown format.
- Use the template defined at:
  ```text
  .codex/skills/product-ux/protocol-design/assets/evidence-session-template.md
  ```
- **Required fields** (YAML frontmatter + markdown list) MUST be present in every file.
- **Optional fields** may be added per feature but must be documented in the protocol.
- Templates must be empty or contain only examples clearly marked as such; do not simulate or pre-fill evidence.

## 🧠 Feature Memory Update

- Create or update the feature memory file at:
  ```text
  specs/{feature_id}/usability/memory/product-ux-memory.md
  ```
- Include:
  - protocol version,
  - location of protocol and templates,
  - success criteria,
  - required fields schema (or reference),
  - sampling rules.

## 📝 Output Expectations

- Protocol file(s) in `specs/{feature_id}/usability/protocol/`.
- Template file(s) in the same folder.
- Updated memory file in `specs/{feature_id}/usability/memory/`.
- Brief summary of decisions and rationale.
- Do not simulate or pre-fill evidence; templates must remain empty or contain only clearly marked examples.

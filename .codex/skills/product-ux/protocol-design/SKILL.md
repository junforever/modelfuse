---
name: protocol-design
description: Designs usability evaluation protocols, success criteria, sampling rules, tasks/scenarios, and data collection templates. Use for T117-style tasks or explicit usability protocol requests.
compatibility: Generic across any feature/project. Works with Markdown or CSV templates.
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
- Creating data collection templates (Markdown/CSV) for sessions or surveys.
- Explicit T117-style tasks in a tasks.md file.

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

- Create templates in Markdown or CSV format.
- Include at minimum the following required fields for each participant/session:
  - participant_id (string, e.g., "P01", "P02")
  - date (ISO 8601 date or datetime)
  - build_version (string, e.g., "v0.3.1", commit hash)
  - device (string, e.g., "Desktop – Chrome 124")
  - moderator (string or identifier)
  - task_id (string, e.g., "SC-003-T1", "SC-004-T2")
  - success_first_attempt (boolean or "yes"/"no")
  - help_received (boolean or "yes"/"no")
  - clarity (integer, e.g., 1–5 or 1–7, as defined in protocol)
  - confidence (integer, same scale as clarity)
  - effort (integer, same scale as clarity)
  - frustration (integer, same scale as clarity)
  - notes (free text, optional but recommended)
- Additional fields may be added per feature or protocol.
- Templates must be empty or contain only examples clearly marked as such; do not simulate or pre-fill evidence.

## 🔍 Pre-Flight Check

Before starting:

- Confirm that the folder structure exists:
  - specs/{feature_id}/usability/
  - specs/{feature_id}/usability/protocol/
  - specs/{feature_id}/usability/memory/
- If the task assumes a feature but the folder structure is missing, STOP and report the issue.
- Do not proceed until the structure is correct.

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

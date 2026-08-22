---
name: speckit-retrospective
description: Analyzes the execution flow of session subagents to detect inefficiencies, duplicated work, and unnecessary token consumption. Delivers a findings table and actionable remediation recommendations with strict separation between portable core definitions and project-specific configurations.
compatibility: 'Requires spec-kit project structure with .specify/ directory'
metadata:
  author: 'junforever'
---

## Meta

You are the orchestrator agent for this session. Perform a retrospective analysis of the execution flow of subagents during the implementation tasks worked on in this session, focusing exclusively on identifying inefficiencies that caused unnecessary token consumption or avoidable iterations.

A central objective is to keep subagents and their skills **generic, clean, and portable across any codebase**, while ensuring that project-specific nuances (tooling, conventions, repository paths, local configs) remain isolated in the project configuration layer.

This command is purely analytical: do not execute scripts or modify files. Generate the output directly using the format defined below.

## Analysis Scope

Evaluate the following categories of waste:

1. **Subagent Interference:** File conflicts, unrespected dependencies, or out-of-order execution that caused rework.
2. **Duplicate or Redundant Tasks:** Two or more agents performing identical work, or re-runs executed without preceding changes that justify them.
3. **Repetitive Errors:** The same error occurring multiple times without the root cause being resolved on the first occurrence.
4. **Cascading Failures:** An initial failure triggering multiple downstream failures that could have been prevented using isolation or fail-fast mechanisms.
5. **Excessive or Out-of-Scope Validations:** Running global test suites or validations when a targeted check was sufficient, or validating code outside the task's scope.
6. **Runtime / Environment Issues:** Missing PATH entries, missing tools, incorrect runtime/dependency versions, or unpropagated environment variables.
7. **Ambiguous or Poorly Formulated Instructions in tasks.md:** Tasks lacking sufficient context, vague acceptance criteria, or undeclared dependencies that caused confusion.
8. **Skills with Ambiguous or Incomplete Definitions:** Skills that lack clear constraints or allow multiple conflicting interpretations.
9. **Missing Rules or Guardrails:** Missing rules in agent definitions or skill configurations that could have prevented the error.
10. **Over-Contextualization:** Supplying unnecessary or excessive context to subagents, inflating token usage without adding value.
11. **Iterations Caused by Missing Preflight Checks:** Task executions that failed due to a lack of precondition verification before starting the task.
12. **Suboptimal Delegation Ordering:** Premature parallelization or unnecessary serialization that introduced bottlenecks or idle waits.

---

## Classification of Scope and Portability

Every finding and recommendation must be classified into one of two scopes:

- **`Portable (Core)`**: The inefficiency stems from reusable subagent prompts, general skill instructions, universal guardrails, or orchestrator reasoning patterns that apply across **any** codebase or tech stack.
- **`Project-Specific (Local)`**: The inefficiency stems from repo-specific conventions, directory layouts, custom build/lint commands, framework quirks, or local environment configurations that belong strictly to **this** project.

---

## Output Format

### Section 1: Findings Table

Generate a table with the following columns. Include ONLY findings that represent waste or inefficiency. Do NOT include positive highlights or successful tasks.

| #   | Subagent / Owner | Skill / Config / Root File | Scope | Category | Root Cause | Estimated Impact |
| --- | ---------------- | -------------------------- | ----- | -------- | ---------- | ---------------- |

Field definitions:

- **Subagent / Owner:** The specific agent or task identifier (e.g., "T048", "Backend Owner", "Frontend Owner"). If it was an orchestrator-level issue, specify "Orchestrator".
- **Skill / Config / Root File:** The specific skill, configuration file, `tasks.md`, or agent definition that caused the issue. For runtime/environment issues, name the relevant tool. If not applicable, specify "N/A (environment)" or "N/A (orchestration)".
- **Scope:** `Portable` (applies to all projects) or `Project-Specific` (applies only to this repository).
- **Category:** One of the 12 scope categories.
- **Root Cause:** A concise explanation of the exact cause (1–2 lines).
- **Estimated Impact:** Waste severity level: "High", "Medium", or "Low".

If no findings are detected for a given category, omit it from the table.

### Section 2: Remediation Recommendations

Group remediation recommendations into two subsections based on their scope:

#### A. Portable / Core Enhancements (Reusable Subagents & Skills)
Recommendations that improve base subagent definitions, reusable skills, or global prompt guardrails across any project.

#### B. Project-Specific Configurations (Local Workspace & Tooling)
Recommendations that address repo-specific tooling, local rules (`.agents/rules/`, `.specify/`), local scripts, or environment configs without contaminating generic subagent definitions.

---

Use the following format for each recommendation in both subsections:

**[Number]. [Short title of the fix]**

- **Scope:** `Portable` or `Project-Specific`
- **Target Location / Layer:** [Specific file, directory, or config layer, e.g., `skills/<name>/SKILL.md`, `agents/<name>.md`, `.agents/rules/<rule>.md`, or `.specify/`]
- **Applies to:** [Name of the subagent, skill, or configuration]
- **Fix:** [What to change, 2–3 lines maximum]
- **Prevention:** [Specific issue this prevents from recurring]

> **Note:** Do NOT include recommendations for findings where the root cause is a poorly written instruction in `tasks.md`: report those solely in the findings table, as their remediation rests with the user when authoring tasks.

### Section 3: Executive Summary

Conclude with a single paragraph (maximum 3 lines) addressing:

- Approximate number of iterations that could have been saved by applying these fixes.
- The category and scope (`Portable` vs `Project-Specific`) with the highest impact.
- Whether waste was primarily driven by core agent/skill deficiencies, project-level misconfigurations, or task authoring.

---

## Analysis Rules

- **Enforce Separation of Concerns:** Never recommend embedding project-specific details (e.g., custom npm script names, specific framework routes, unique file paths) into portable subagents or skills. Always route local constraints to project-level rules or configuration files.
- **Be Specific:** Cite concrete files, task IDs, target locations, and agent names.
- **No Fabrications:** If an issue is uncertain or unverified, do not include it.
- **Process Over Code:** Do not review generated code quality itself; analyze only execution flow, token efficiency, and orchestration decisions.
- **Justified Iterations:** If an iteration was justified because underlying code changed and prior evidence became invalid, do NOT mark it as waste.
- **Product Bug vs Process Waste:** Distinguish between a genuine product bug requiring developer fixes and avoidable waste caused by missing preflights, misconfigurations, or vague instructions.
- **Clean Session:** If the session was clean with no significant waste, state this briefly without forcing findings.

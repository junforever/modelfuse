---
name: usability-workspace-setup
description: Creates or verifies the standard usability workspace folder structure for a feature. Ensures deterministic setup before protocol design or evidence evaluation.
compatibility: Generic across any feature/project. Requires filesystem write access and script execution capability.
metadata:
  author: junforever
  version: '1.0'
  category: infrastructure
---

# Usability Workspace Setup Skill

Apply this skill BEFORE any protocol-design or evidence-evaluation task to ensure the required folder structure exists.

## 🎯 When to Activate

Activate this skill when:

- Starting a new feature's usability evaluation.
- The core agent detects missing usability folders during pre-flight check.
- Explicitly requested to create or verify the workspace structure.

## 📥 Input Requirements

**CRITICAL**: This skill requires either a valid `feature_id` or an explicit `feature_dir` to proceed.

- The `feature_id` or `feature_dir` MUST be provided in the prompt or context.
- If both are missing, empty, or ambiguous:
  - **DO NOT** attempt to infer or guess the feature_id.
  - **STOP** execution immediately.
  - Request the feature_id from the orchestrator or user with a clear message:
    - "Error: feature_id or feature_dir required. Please provide one to create the workspace structure."

## 📁 Required Folder Structure

For the selected feature directory, ensure the following structure exists:

```text
{feature_dir}/usability/
  incoming/
  processed/
  protocol/
  results/
  memory/
```

## 🔧 Behavior

1. Receive `feature_id` or `feature_dir` from the context or prompt.
2. **Validate the input**:
   - If `feature_dir` is provided, resolve it and require that it already exists as a directory.
   - Otherwise pass `feature_id` to the workspace script, which owns its syntax and path validation, and use the script's fallback location (`specs/{feature_id}` relative to the project root).
   - For the `feature_id` fallback, execute the script from the project root (the directory containing `.codex/` and `specs/`); do not use an alternate working directory.
   - If the input is missing, ambiguous, or invalid, stop and request it.
   - Set the effective `feature_dir` to the resolved explicit directory or this fallback directory before checking folders and composing the output message.
3. Check if the folder structure exists by inspecting the filesystem.
4. If ALL folders exist:
   - Return:
     - "Workspace de usabilidad ya creado en {feature_dir}/usability/. No se requieren cambios."
5. If ANY folder is missing:
   - Execute the workspace creation script:
      - **Node.js (cross-platform)** with an explicit feature directory:
        ```bash
        node .codex/skills/product-ux/usability-workspace-setup/scripts/create-usability-workspace.cjs --feature-dir <path>
        ```
      - Backward-compatible fallback:
        ```bash
        node .codex/skills/product-ux/usability-workspace-setup/scripts/create-usability-workspace.cjs <feature_id>
        ```
   - Capture the script output to identify which folders were created.
   - Return:
     - "Workspace de usabilidad creado/actualizado en {feature_dir}/usability/. Carpetas creadas: [lista de carpetas creadas]."

## 📝 Output Expectations

- Report exactly which folders were created (if any).
- Do not modify any existing files or content.
- Ensure folder names are exactly as specified (lowercase, no spaces).
- If the script fails, report the error message and stop execution.

## ⚠️ Error Handling

- If both feature_id and feature_dir are missing, empty, or ambiguous:
  - Stop and request one explicitly (see Input Requirements).
- If the script is not found at the expected path, report:
  - "Error: Script de creación de workspace no encontrado en .codex/skills/product-ux/usability-workspace-setup/scripts/"
- If the script execution fails, report:
  - "Error al ejecutar el script: [mensaje de error]"

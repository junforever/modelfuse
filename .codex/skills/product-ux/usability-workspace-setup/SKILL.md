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

**CRITICAL**: This skill requires a valid `feature_id` to proceed.

- The `feature_id` MUST be provided in the prompt or context.
- If `feature_id` is missing, empty, or ambiguous:
  - **DO NOT** attempt to infer or guess the feature_id.
  - **STOP** execution immediately.
  - Request the feature_id from the orchestrator or user with a clear message:
    - "Error: feature_id required. Please provide the feature identifier (e.g., '001-compare-llm-responses') to create the workspace structure."

## 📁 Required Folder Structure

For each feature, ensure the following structure exists:

```text
specs/{feature_id}/usability/
  incoming/
  processed/
  protocol/
  results/
  memory/
```

## 🔧 Behavior

1. Receive the feature_id from the context or prompt.
2. **Validate the feature_id**:
   - If missing, empty, or ambiguous, stop and request it (see Input Requirements).
   - If valid, proceed to step 3.
3. Check if the folder structure exists by inspecting the filesystem.
4. If ALL folders exist:
   - Return:
     - "Workspace de usabilidad ya creado para la feature {feature_id}. No se requieren cambios."
5. If ANY folder is missing:
   - Execute the workspace creation script:
     - **Node.js (cross-platform)**:
       ```bash
       node .codex/skills/product-ux/usability-workspace-setup/scripts/create-usability-workspace.cjs <feature_id>
       ```
   - Capture the script output to identify which folders were created.
   - Return:
     - "Workspace de usabilidad creado/actualizado para la feature {feature_id}. Carpetas creadas: [lista de carpetas creadas]."

## 📝 Output Expectations

- Report exactly which folders were created (if any).
- Do not modify any existing files or content.
- Ensure folder names are exactly as specified (lowercase, no spaces).
- If the script fails, report the error message and stop execution.

## ⚠️ Error Handling

- If the feature_id is missing, empty, or ambiguous:
  - Stop and request it explicitly (see Input Requirements).
- If the script is not found at the expected path, report:
  - "Error: Script de creación de workspace no encontrado en .codex/skills/product-ux/usability-workspace-setup/scripts/"
- If the script execution fails, report:
  - "Error al ejecutar el script: [mensaje de error]"

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
2. Check if the folder structure exists by inspecting the filesystem.
3. If ALL folders exist:
   - Return:
     - "Workspace de usabilidad ya creado para la feature {feature_id}. No se requieren cambios."
4. If ANY folder is missing:
   - Execute the workspace creation script:
     - **Node.js (cross-platform)**:
       ```bash
       node .codex/skills/product-ux/scripts/create-usability-workspace.js <feature_id>
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

- If the script is not found at the expected path, report:
  - "Error: Script de creación de workspace no encontrado en .codex/skills/product-ux/scripts/"
- If the script execution fails, report:
  - "Error al ejecutar el script: [mensaje de error]"
- If the feature_id is invalid or empty, report:
  - "Error: feature_id inválido o vacío"

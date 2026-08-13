---
name: usability-workspace-setup
description: Creates or verifies the standard usability workspace folder structure for a feature. Ensures deterministic setup before protocol design or evidence evaluation.
compatibility: Generic across any feature/project. Requires filesystem write access.
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
2. Check if the folder structure exists:
   - If ALL folders exist, return:
     - "Workspace de usabilidad ya creado para la feature {feature_id}. No se requieren cambios."
   - If ANY folder is missing:
     - Create the missing folders.
     - Return:
       - "Workspace de usabilidad creado/actualizado para la feature {feature_id}. Carpetas creadas: [lista]."

## 📝 Output Expectations

- Report exactly which folders were created (if any).
- Do not modify any existing files or content.
- Ensure folder names are exactly as specified (lowercase, no spaces).

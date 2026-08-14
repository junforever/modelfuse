---
participant_id: <string, required>
date: <datetime (ISO 8601), required>
build_version: <string, required>
device: <string, required>
moderator: <string, required>
task_id: <string, required>
---

# Required Fields (Mandatory)

- success_first_attempt: y/n
- help_received: y/n
- clarity: 1-5
- confidence: 1-5
- effort: 1-5
- frustration: 1-5

# Optional Fields (Optional)

- moderator_notes: "..."
- participant_feedback: "..."

# Feature-Specific Fields (Optional)

- custom_field_1: "..."
- custom_field_2: "..."

---
participant_id: <string, required>
protocol_version: <vMAJOR.MINOR.PATCH, required>
protocol_hash: sha256:<64 lowercase hexadecimal characters>
date: <ISO 8601 datetime with explicit timezone, required>
build_version: <string, required>
device: <string, required>
moderator_id: mod_<opaque-token>
collection_attestation: human_attested
recorded_at: <ISO 8601 datetime with explicit timezone, required>
task_id: <string, required>
criterion_id: <string, required>
---

Use this template for protocols whose frontmatter contains `provenance_policy: human_attestation_v1`. Do not use it to retrofit an already locked legacy protocol.

# Required Fields (Mandatory)

- success_first_attempt: y/n
- help_received: y/n
- clarity: 1-5
- confidence: 1-5
- effort: 1-5
- frustration: 1-5

## Provenance Metadata (Mandatory)

- `collection_attestation` MUST equal exactly `human_attested`.
- `moderator_id` MUST be a stable pseudonymous identifier matching `^mod_[A-Za-z0-9][A-Za-z0-9_-]*$`.
- `recorded_at` MUST be an ISO 8601 timestamp with an explicit timezone and MUST be greater than or equal to `date` after UTC normalization.
- These fields are declarations supplied by the responsible human moderator. The evaluator validates only their presence, exact value, syntax, and timestamp ordering; it does not verify that the session occurred, the moderator's identity, or the pseudonymization.

# Optional Fields (Optional)

- moderator_notes: "..."
- participant_feedback: "..."

Optional fields may be omitted. If an optional field is present but empty, treat it as absent, not as invalid evidence.

# Feature-Specific Fields (Optional)

- custom_field_1: "..."
- custom_field_2: "..."

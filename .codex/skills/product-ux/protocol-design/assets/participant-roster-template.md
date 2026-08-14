---
protocol_version: <vMAJOR.MINOR.PATCH, required>
protocol_hash: sha256:<64 lowercase hexadecimal characters>
roster_locked_at: <datetime (ISO 8601), required>
collection_start_at: <datetime (ISO 8601), required>
planned_participant_count: <positive integer, required>
---

# Initial Participant Roster

The roster is immutable after `roster_locked_at`. Every `participant_id` must be unique, and the roster must be finalized before `collection_start_at`.

`protocol_version` and `protocol_hash` must exactly match `protocol-lock.md`.

| participant_id |
| --- |
| <participant_id_1> |

Replace the placeholder with a concrete ID for each rostered participant. The number of table rows must equal `planned_participant_count`. Participant IDs not listed here are not eligible for evaluation.

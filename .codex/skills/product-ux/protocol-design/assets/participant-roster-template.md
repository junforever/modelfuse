---
protocol_version: <vMAJOR.MINOR.PATCH, required>
protocol_hash: sha256:<64 lowercase hexadecimal characters>
roster_locked_at: <ISO 8601 datetime with explicit timezone, required>
collection_start_at: <ISO 8601 datetime with explicit timezone, required>
planned_participant_count: <positive integer, required>
---

# Initial Participant Roster

The roster is immutable after `roster_locked_at`. Every `participant_id` must be unique, and the roster must be finalized before `collection_start_at`.

Both timestamps must include an explicit UTC designator (`Z`) or numeric offset (`+/-HH:MM`). Normalize them to UTC before comparing them.

`protocol_version` and `protocol_hash` must exactly match `protocol-lock.md`.

| participant_id |
| --- |
| <participant_id_1> |

Replace the placeholder with a concrete ID for each rostered participant. The number of table rows must equal `planned_participant_count`. Participant IDs not listed here are not eligible for evaluation.

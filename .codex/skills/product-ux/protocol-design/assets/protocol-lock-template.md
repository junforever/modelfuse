---
protocol_version: v1.0.0
protocol_path: protocol/usability-protocol-v1.0.0.md
protocol_hash: sha256:<64 lowercase hexadecimal characters>
roster_path: protocol/participant-roster.md
roster_hash: sha256:<64 lowercase hexadecimal characters>
locked_at: <ISO 8601 datetime with explicit timezone, required>
roster_locked_at: <ISO 8601 datetime with explicit timezone, required>
collection_start_at: <ISO 8601 datetime with explicit timezone, required>
---

# Protocol Lock

Create this lock before receiving the first session. It is immutable after `locked_at`.

Hashes use SHA-256 over the referenced Markdown file after decoding as UTF-8, removing a UTF-8 BOM if present, and normalizing CRLF/CR line endings to LF. Preserve all other content exactly. The lock file itself is not included in either hash.

The timestamps must satisfy:

```text
locked_at <= roster_locked_at <= collection_start_at
```

Every timestamp must include an explicit UTC designator (`Z`) or numeric offset (`+/-HH:MM`). Normalize all three timestamps to UTC before comparing them.

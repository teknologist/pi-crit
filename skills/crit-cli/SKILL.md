---
name: crit-cli
description: Use when replying to Crit comments, inspecting Crit status, or interpreting Crit review JSON from Pi.
user-invocable: false
---

# Crit CLI Reference for Pi

Crit comments have three scopes:

- Review comments: top-level feedback with IDs like `r_...`.
- File comments: file-level feedback with a file path and no positive line number.
- Line comments: line or range feedback with `start_line` and `end_line`.

Field rules:

- `resolved: true` means resolved.
- `resolved: false` or missing means active.
- `quote` narrows the requested change to selected text.
- `anchor` helps relocate content if line numbers drift.
- `drifted: true` means line numbers may be approximate.
- `replies` may show previous agent work or reviewer follow-up.

Use `crit_status` to inspect the active review.

Use `crit_reply` for replies and comments. Reply payload entries use this shape:

```json
[
  { "reply_to": "c_a1b2c3", "body": "Fixed by extracting the parser." },
  { "reply_to": "r_f1e2d3", "body": "Updated the release install path." }
]
```

Only include `resolve: true` if the user explicitly asks you to resolve comments.

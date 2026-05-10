---
name: crit
description: Use when Crit review comments are injected into Pi context or when the user asks to start a Crit review from Pi.
---

# Crit Review Loop in Pi

Crit is the browser review UI. Pi is the coding agent that receives Crit comments through the pi-crit extension.

When Crit review context appears in the prompt:

1. Treat active Crit comments as user review instructions.
2. Use file paths, line numbers, quotes, and anchors to inspect the current code.
3. Preserve resolved comments as guidance, but do not treat them as new required work.
4. Make surgical changes that address the active comments.
5. Reply to addressed comments with `crit_reply`.
6. Do not pass `resolve` unless the user explicitly asks. Resolving is the reviewer's choice.
7. Preserve the exact `Next round:` command for follow-up review rounds.

Do not use `pi -p`. Do not ask the user to copy/paste Crit output. The extension already injects the review context.

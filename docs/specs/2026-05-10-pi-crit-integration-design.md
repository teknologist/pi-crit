# Pi Crit Integration Design

## Summary

Create `pi-crit` as a project-installable Pi package that gives Pi first-class support for Crit reviews. The integration lets a user start Crit from inside Pi, complete the browser-based Crit review, and have the resulting user-authored Crit comments injected into the next Pi agent turn automatically.

This design explicitly avoids copy/paste workflows and avoids shelling back into Pi with `pi -p`. Crit remains the review UI and review-file producer. Pi becomes the listening coding agent that receives the Crit review payload directly through extension hooks.

## Goals

- Provide a Pi package installable for development with `pi install /path/to/pi-crit`.
- Release the integration as a GitHub-installable package with `pi install https://github.com/teknologist/pi-crit`.
- Expose `/crit [args]` as a pass-through command to the installed `crit` binary.
- Expose convenience commands for common Crit workflows.
- Capture Crit’s foreground completion after the user clicks “Finish Review”.
- Parse the emitted review file path and exact `Next round:` command from Crit output.
- Inject user-authored Crit comments into Pi’s session/model context automatically.
- Auto-start a Pi agent turn after review capture so the agent can address comments immediately.
- Provide agent tools for status inspection and bulk replies/comments.
- Package Pi-native skills adapted from Crit’s Codex skills so the model understands the Crit review loop.

## Non-goals

- Do not reimplement Crit’s grid UI in Pi.
- Do not inject the full Crit grid or full diff by default.
- Do not depend on `pi -p` or any nested Pi invocation.
- Do not rely on manual copy/paste from Crit into Pi.
- Do not detect Crit reviews started outside Pi in the initial version.

## Architecture

`pi-crit` is a Pi package with a `package.json` `pi` manifest. During development it should be installable from a local path. For release it should be installable directly from GitHub with `pi install https://github.com/teknologist/pi-crit`.

It contains:

- A TypeScript Pi extension.
- Packaged Pi skills adapted from Crit’s existing Codex skills.
- Optional prompt templates for common Crit workflows.
- Test fixtures for Crit stdout and review JSON files.

The extension owns the integration lifecycle. It starts `crit` from Pi’s current working directory, waits for the foreground process to finish, parses Crit’s output, reads the produced review JSON, and prepares a compact context block for Pi’s next model call.

Pi extension hooks provide the integration points:

- `registerCommand` for `/crit` and convenience commands.
- `registerTool` for agent-accessible Crit operations.
- `before_agent_start` or `context` for model-context injection.
- `sendMessage` or `sendUserMessage` with steering semantics to start the follow-up agent turn.
- `resources_discover` to publish bundled skills and prompts.

## User-facing commands

### `/crit [args]`

Passes arguments directly to the installed `crit` binary. This is the canonical command because it preserves Crit’s CLI surface.

Calling `/crit` with no arguments is meaningful: it starts a Crit review for all modified/unstaged working-tree changes/files in the current repository. The extension should invoke Crit’s default no-argument behavior for this if Crit supports it directly; otherwise it should resolve the modified/unstaged file list and pass those files to Crit.

Examples:

- `/crit` reviews all modified/unstaged working-tree changes/files.
- `/crit path/to/file.ts`
- `/crit --pr 123`
- `/crit main..feature-branch`

The implementation should forward explicit args without inventing a separate argument model. Quoting and path handling should be tested against Pi command parsing. The no-argument case is the only special case.

### Convenience commands

The package should also provide convenience wrappers where they map cleanly to Crit’s CLI:

- `/crit-files <files...>` → `crit <files...>`
- `/crit-pr <number>` → `crit --pr <number>`
- `/crit-range <range>` → `crit <range>`

These wrappers exist for discoverability. They should internally call the same runner as `/crit`.

## Agent tools

### `crit_status`

Runs `crit status --json` and returns machine-readable state, including review file, daemon state, branch, and comment counts when available.

### `crit_reply`

Submits replies/comments through `crit comment --json` using Crit’s bulk JSON schema. The tool should be designed so the model can respond to multiple comments in one call.

### `crit_run`

Optional tool equivalent of `/crit [args]`. This lets the agent start a Crit run when explicitly instructed by the user, but the normal path remains the user-facing command.

## Review data flow

1. User runs `/crit ...` inside Pi.
2. The extension starts `crit ...` from Pi’s current working directory.
3. Crit opens its browser/grid UI and blocks in the foreground.
4. The user adds review comments in Crit and clicks “Finish Review”.
5. Crit exits and prints its review payload plus `Next round: crit ...`.
6. The extension captures stdout/stderr and extracts:
   - Review JSON file path.
   - `approved` status if present.
   - Exact `Next round:` command.
7. The extension reads and validates the review JSON.
8. The extension extracts user-authored Crit comments:
   - Global review comments.
   - File-level comments.
   - Line-level comments.
   - Thread/reply state when available.
9. The extension builds a compact Crit context block and stores it in session state.
10. The extension injects the context block into the next Pi model context.
11. The extension sends a steering message that starts the agent turn automatically.
12. The agent addresses the comments and uses `crit_reply` for bulk replies when appropriate.
13. The extension preserves the exact `Next round:` command for follow-up Crit rounds.

## Context injection policy

The injected context is the user’s review intent, not the entire grid or diff.

By default, inject:

- Crit review file path.
- Exact `Next round:` command.
- Approval status if present.
- User-authored global, file, and line comments that still need agent attention.
- Stable identifiers needed to reply through Crit.
- File paths and line numbers needed to inspect code.

Do not inject by default:

- Full raw review JSON.
- Full grid output.
- Full diff contents.
- Resolved comment history that does not require action.

If the comment payload is too large, inject a truncated summary with clear truncation markers and expose the full review through `crit_status` or a dedicated full-review tool/result detail.

## Session state

The extension keeps small per-session state:

- Whether a Crit run is active.
- Active Crit command and args.
- Review file path.
- Parsed review summary.
- Exact `Next round:` command.
- Whether the current review has already been injected.
- Last Crit process exit status and relevant error text.

The extension must not silently start a second Crit process while one is active.

## Error handling

Failures should be loud and actionable through Pi notifications and command output.

Handle these cases:

- `crit` binary missing or not executable.
- Crit exits non-zero before producing a review file.
- Crit output lacks a review path.
- Crit output lacks `Next round:` when a next round is expected.
- Review file cannot be read.
- Review file contains invalid JSON.
- Review JSON is valid but has no supported comment structure.
- Auto-starting the follow-up agent turn fails.
- A Crit run is requested while another Crit run is active.

If auto-start fails after review capture, the extension should still store the Crit context and inject it into the next user prompt.

## Packaged skills

The package should include Pi-native skills derived from Crit’s Codex integration. They should teach the agent:

- How the Crit review loop works.
- The Crit review JSON structure.
- The rule that Crit comments are user review intent and should be addressed directly.
- How to use `crit_reply` for bulk replies.
- How to preserve and rerun the exact `Next round:` command.
- When to ask the user for clarification instead of guessing.

The skills should not instruct the agent to run nested Pi commands or use copy/paste workflows.

## Testing strategy

Automated tests should use fixtures instead of requiring an interactive browser for every test.

Test coverage should include:

1. Package manifest discovery for extensions, skills, and prompts.
2. `/crit` with no arguments starting a review for modified/unstaged working-tree changes/files.
3. `/crit [args]` forwarding explicit args to an executable Crit stub from the current working directory.
4. Convenience commands mapping to the same runner.
5. Crit stdout fixture parsing for review file path and exact `Next round:` command.
6. Review JSON fixture parsing for global, file, and line comments.
7. Context-block generation from user-authored comments.
8. Duplicate-injection prevention.
9. Auto-start steering message emitted once per captured review.
10. `crit_status` calling `crit status --json` and returning parsed JSON.
11. `crit_reply` calling `crit comment --json` with bulk payloads.
12. Missing binary failure.
13. Missing review file failure.
14. Invalid JSON failure.
15. Active-run conflict failure.

Manual validation should verify the end-to-end browser loop with the real Homebrew-installed `crit` binary.

## Success criteria

The integration is successful when:

- A developer can install the package into Pi with a local project path.
- A release user can install the package with `pi install https://github.com/teknologist/pi-crit`.
- A user can run `/crit` inside Pi to review all modified/unstaged working-tree changes/files.
- A user can run `/crit ...` inside Pi to review explicit files, PRs, or ranges.
- Crit opens its browser review UI normally.
- After “Finish Review”, Pi automatically receives the user-authored Crit comments.
- The next Pi agent turn starts without copy/paste and without `pi -p`.
- The agent has enough file/line/comment context to act.
- The agent can reply through Crit using a tool rather than hidden shell knowledge.
- Follow-up review rounds preserve Crit’s exact `Next round:` command.

## Implementation boundaries

The first implementation should focus on Pi-started Crit reviews only. External Crit-session watching can be added later if needed, but it is intentionally out of scope for the initial design.

The extension should keep boundaries small:

- Command layer: parse Pi command args and call the runner.
- Runner layer: spawn Crit and capture output.
- Parser layer: parse Crit stdout and review JSON.
- Context layer: format and inject model context.
- Tool layer: expose safe agent operations.
- Resource layer: publish skills and prompts.

Each layer should be testable with fixtures or stubs.

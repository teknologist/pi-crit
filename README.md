# pi-crit

**Crit inline reviews, native in Pi.** A Pi extension package that gives the Pi coding agent first-class support for [Crit](https://github.com/tomasz-tomczyk/crit) code reviews — from starting a review to injecting user-authored comments into the agent's context.

## How it works

1. You run `/crit` inside Pi.
2. Pi starts or reconnects to Crit from your working directory.
3. Crit opens its browser-based review grid and blocks until you finish the review.
4. You add review comments, then click **Finish Review**.
5. Crit exits and prints machine-readable review state.
6. Pi parses the review output/review JSON and formats unresolved comments into a compact context block.
7. Pi injects the context into the next agent turn — the model sees your comments immediately.

No copy/paste. No manual re-entry. The review flows directly from Crit into the agent's context.

If Crit reports approval or the review has no unresolved comments, Pi treats the run as complete and does not start a follow-up agent turn.

## Install

```bash
# Make sure Crit is installed.
brew install tomasz-tomczyk/tap/crit

# From a local path during development.
pi install /path/to/pi-crit

# From GitHub.
pi install https://github.com/teknologist/pi-crit
```

Requires Node >= 20 and the `crit` binary installed on your `PATH`.

## Commands

| Command | Description |
|---------|-------------|
| `/crit [args]` | Pass-through to the `crit` binary. No arguments reviews all modified/unstaged files. |
| `/crit-files <files...>` | Convenience wrapper: `crit <files...>` |
| `/crit-pr <number-or-url>` | Convenience wrapper: `crit --pr <number-or-url>` |
| `/crit-range <range>` | Convenience wrapper: `crit --range <range>` |

Pi streams Crit output while the review is active, so daemon URLs and diagnostics are visible immediately.

## Headless and SSH sessions

When Pi is running in an SSH/headless environment, `pi-crit` automatically adds `--no-open` for review commands. If Crit prints a local daemon URL, Pi also shows an SSH port-forward command like:

```bash
ssh -L 56095:127.0.0.1:56095 user@remote-host
```

Run that command on your local machine, open the displayed `http://localhost:<port>` URL locally, then click **Finish Review**.

## Daemon behavior

Crit natively reuses an alive daemon for the same working directory and review arguments. `pi-crit` does not stop existing daemons before starting a review; it checks `crit status --json` and reports when an existing daemon is being reused.

## Agent tools

| Tool | Description |
|------|-------------|
| `crit_status` | Runs `crit status --json` and returns machine-readable state (review file, daemon status, branch, comment counts). |
| `crit_reply` | Submits replies/comments via `crit comment --json` using Crit's bulk JSON schema. The model can respond to multiple comments in one call. |
| `crit_run` | Agent-equivalent of `/crit [args]`. Lets the agent start a Crit run when instructed. |

## Skills

The package bundles Pi-native skills adapted from Crit's Codex skills:

- **crit** — Pi-native Crit review-loop skill for the agent.
- **crit-cli** — Pi-native Crit CLI and commenting reference skill.

## Project structure

```text
pi-crit/
├── src/
│   ├── types.ts           # Shared types: comments, reviews, state, settings
│   ├── crit-parser.ts     # Parse Crit stdout, review JSON, flatten comments
│   ├── context-format.ts  # Format comments into agent context with budget-aware compaction
│   ├── crit-runner.ts     # Spawn Crit, stream/capture output, handle concurrent-run conflicts
│   ├── headless.ts        # Headless/SSH detection and port-forward guidance
│   ├── run-result.ts      # Crit run-result classification helpers
│   ├── tools.ts           # Agent tool implementations (status, reply, run)
│   └── index.ts           # Pi extension entrypoint, commands, context injection
├── tests/
│   ├── fixtures/
│   │   ├── review.json            # Representative Crit review fixture
│   │   └── crit-finished.txt      # Representative Crit stdout fixture
│   ├── context-format.test.ts
│   ├── headless.test.ts
│   ├── parser.test.ts
│   ├── run-result.test.ts
│   ├── runner.test.ts
│   └── tools.test.ts
├── skills/                 # Packaged Pi skills
├── prompts/                # Optional slash prompts
├── docs/
│   ├── specs/              # Design documents
│   └── plans/              # Implementation plans
├── package.json
├── tsconfig.json
└── LICENSE
```

## Development

```bash
# Type-check
npm run typecheck

# Run tests
npm test

# Check everything
npm run check
```

Tests use Node's built-in test runner via `tsx --test`. The runner tests use a Crit stub executable so they don't require the actual `crit` binary.

## License

MIT — see [LICENSE](./LICENSE).

# pi-crit

**Crit inline reviews, native in Pi.** A Pi extension package that gives the Pi coding agent first-class support for [Crit](https://github.com/tomasz-tomczyk/crit) code reviews — from starting a review to injecting user-authored comments into the agent's context.

## How it works

1. You run `/crit` inside Pi.
2. Pi spawns Crit from your working directory.
3. Crit opens its browser-based review grid and blocks.
4. You add review comments, then click **Finish Review**.
5. Crit exits and prints the review payload.
6. Pi captures the output, parses the review JSON, and formats comments into a compact context block.
7. Pi injects the context into the next agent turn — the model sees your comments immediately.

No copy/paste. No manual re-entry. The review flows directly from Crit into the agent's context.

## Install

```bash
# make sure crit is installed:
# On MacOS:
brew install crit

# From a local path during development
pi install /path/to/pi-crit

# From GitHub
pi install https://github.com/teknologist/pi-crit
```

Requires Node >= 20 and the `crit` binary installed on your `PATH`.

## Commands

| Command | Description |
|---------|-------------|
| `/crit [args]` | Pass-through to the `crit` binary. No arguments reviews all modified/unstaged files. |
| `/crit-files <files...>` | Convenience wrapper: `crit <files...>` |
| `/crit-pr <number>` | Convenience wrapper: `crit --pr <number>` |
| `/crit-range <range>` | Convenience wrapper: `crit <range>` |

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

```
pi-crit/
├── src/
│   ├── types.ts           # Shared types: comments, reviews, state, settings
│   ├── crit-parser.ts     # Parse Crit stdout, review JSON, flatten comments
│   ├── context-format.ts  # Format comments into agent context with budget-aware compaction
│   ├── crit-runner.ts     # Spawn Crit, capture output, handle concurrent-run conflicts
│   ├── tools.ts           # Agent tool implementations (status, reply, run)
│   └── index.ts           # Pi extension entrypoint, commands, context injection
├── tests/
│   ├── fixtures/
│   │   ├── review.json            # Representative Crit review fixture
│   │   └── crit-finished.txt      # Representative Crit stdout fixture
│   ├── parser.test.ts
│   ├── context-format.test.ts
│   └── runner.test.ts
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
pnpm typecheck

# Run tests
pnpm test

# Check everything
pnpm check
```

Tests use Node's built-in test runner via `tsx --test`. The runner tests use a Crit stub executable so they don't require the actual `crit` binary.

## License

MIT — see [LICENSE](./LICENSE).

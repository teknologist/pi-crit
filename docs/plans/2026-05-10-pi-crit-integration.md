# Pi Crit Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Pi package that starts Crit from inside Pi, captures the completed Crit review, injects user-authored review comments into Pi context, and auto-starts the follow-up agent turn.

**Architecture:** Keep the integration split into focused units: parser, formatter, runner, tools, and Pi extension entrypoint. Commands start Pi-owned Crit runs; tools support agent status/replies; packaged skills teach the agent the Crit workflow.

**Tech Stack:** TypeScript ESM, Pi extension API, Node built-ins, `typebox`, Node test runner via `tsx --test`, Homebrew-installed `crit` binary for manual validation.

---

## File structure

- Create `package.json` — Pi package manifest, scripts, peer dependencies, dev dependencies.
- Create `tsconfig.json` — strict TypeScript settings for ESM.
- Create `src/types.ts` — shared Crit review, comment, state, and settings types.
- Create `src/crit-parser.ts` — parse Crit stdout, status JSON, review JSON, and flatten comments.
- Create `src/context-format.ts` — format Crit comments into injected context with `crit.maxInjectedChars` defaulting to `12000`.
- Create `src/crit-runner.ts` — spawn installed `crit`, capture output, handle active-run conflicts.
- Create `src/tools.ts` — register `crit_status`, `crit_reply`, and `crit_run` tools.
- Create `src/index.ts` — Pi extension entrypoint, commands, state, context injection, resources.
- Create `skills/crit/SKILL.md` — Pi-native Crit review-loop skill.
- Create `skills/crit-cli/SKILL.md` — Pi-native Crit CLI/commenting reference skill.
- Create `prompts/crit.md` — optional slash prompt for discoverability.
- Create `tests/fixtures/review.json` — representative Crit review with active and resolved comments.
- Create `tests/fixtures/crit-finished.txt` — representative Crit stdout with review path and next command.
- Create `tests/parser.test.ts` — parser unit tests.
- Create `tests/context-format.test.ts` — context budget and resolved-history tests.
- Create `tests/runner.test.ts` — runner tests using a Crit stub executable.
- Create `tests/tools.test.ts` — tool command construction tests.

## Task 1: Package skeleton

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/types.ts`

- [ ] **Step 1: Create package manifest**

Write `package.json`:

```json
{
  "name": "pi-crit",
  "version": "0.1.0",
  "description": "Pi coding agent integration for Crit inline reviews",
  "type": "module",
  "private": false,
  "keywords": ["pi-package", "pi", "crit", "code-review"],
  "scripts": {
    "check": "tsc --noEmit && tsx --test tests/*.test.ts",
    "typecheck": "tsc --noEmit",
    "test": "tsx --test tests/*.test.ts"
  },
  "pi": {
    "extensions": ["./src/index.ts"],
    "skills": ["./skills"],
    "prompts": ["./prompts"]
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "typebox": "*"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "tsx": "^4.20.0",
    "typescript": "^5.8.0"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: Create TypeScript config**

Write `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 3: Define shared types**

Write `src/types.ts`:

```ts
export const DEFAULT_MAX_INJECTED_CHARS = 12_000;

export type CritSettings = {
  maxInjectedChars: number;
  binary: string;
  replyAuthor: string;
};

export type CritReply = {
  id?: string;
  body: string;
  author?: string;
};

export type CritRawComment = {
  id?: string;
  body?: string;
  scope?: "review" | "file" | "line" | string;
  author?: string;
  resolved?: boolean;
  replies?: CritReply[];
  start_line?: number;
  end_line?: number;
  quote?: string;
  anchor?: string;
  drifted?: boolean;
};

export type CritReviewFile = {
  review_comments?: CritRawComment[];
  files?: Record<string, { comments?: CritRawComment[] }>;
};

export type CritComment = {
  id: string;
  scope: "review" | "file" | "line";
  file?: string;
  startLine?: number;
  endLine?: number;
  body: string;
  author?: string;
  resolved: boolean;
  replies: CritReply[];
  quote?: string;
  anchor?: string;
  drifted: boolean;
};

export type CritReviewSummary = {
  reviewPath: string;
  nextCommand?: string;
  approved?: boolean;
  comments: CritComment[];
};

export type CritRunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  reviewPath?: string;
  nextCommand?: string;
  approved?: boolean;
};

export type CritExtensionState = {
  activeRun: boolean;
  activeCommand?: string[];
  reviewPath?: string;
  nextCommand?: string;
  summary?: CritReviewSummary;
  injectedReviewPath?: string;
  lastError?: string;
};
```

- [ ] **Step 4: Install dependencies and typecheck**

Run:

```bash
npm install
npm run typecheck
```

Expected: `tsc --noEmit` exits successfully.

- [ ] **Step 5: Commit package skeleton**

Run:

```bash
git add package.json package-lock.json tsconfig.json src/types.ts
git commit -m "chore: scaffold Pi Crit package"
```

## Task 2: Crit parser

**Files:**
- Create: `src/crit-parser.ts`
- Create: `tests/fixtures/review.json`
- Create: `tests/fixtures/crit-finished.txt`
- Create: `tests/parser.test.ts`

- [ ] **Step 1: Write review fixture**

Write `tests/fixtures/review.json`:

```json
{
  "review_comments": [
    {
      "id": "r_arch",
      "body": "Preserve user intent from Crit comments in Pi context.",
      "scope": "review",
      "author": "Eric",
      "resolved": false,
      "replies": []
    },
    {
      "id": "r_done",
      "body": "The install path concern is already resolved and should guide release docs.",
      "scope": "review",
      "author": "Eric",
      "resolved": true,
      "replies": [
        { "id": "rp_done", "body": "Release path added.", "author": "Pi" }
      ]
    }
  ],
  "files": {
    "src/index.ts": {
      "comments": [
        {
          "id": "c_line",
          "start_line": 42,
          "end_line": 45,
          "body": "This should auto-start one follow-up turn only.",
          "quote": "sendMessage",
          "anchor": "await pi.sendMessage",
          "author": "Eric",
          "resolved": false,
          "replies": []
        },
        {
          "id": "c_file",
          "start_line": 0,
          "body": "Keep this file as orchestration only; parser logic belongs elsewhere.",
          "author": "Eric",
          "resolved": false,
          "replies": []
        }
      ]
    }
  }
}
```

- [ ] **Step 2: Write Crit stdout fixture**

Write `tests/fixtures/crit-finished.txt`:

```text
Started crit daemon at http://localhost:43123
Review comments are in /tmp/pi-crit-review.json
{"approved":false,"next_command":"crit --range abc123..def456"}
Next round: crit --range abc123..def456
```

- [ ] **Step 3: Write failing parser tests**

Write `tests/parser.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { flattenReviewComments, parseCritOutput, parseReviewJson } from "../src/crit-parser.js";

const fixture = (name: string) => readFileSync(join("tests", "fixtures", name), "utf8");

test("parseCritOutput extracts review path, approval, and next command", () => {
  const result = parseCritOutput(fixture("crit-finished.txt"));

  assert.equal(result.reviewPath, "/tmp/pi-crit-review.json");
  assert.equal(result.approved, false);
  assert.equal(result.nextCommand, "crit --range abc123..def456");
});

test("parseReviewJson validates object JSON", () => {
  const review = parseReviewJson(fixture("review.json"));

  assert.equal(review.review_comments?.length, 2);
  assert.equal(Object.keys(review.files ?? {}).length, 1);
});

test("flattenReviewComments preserves active and resolved comments", () => {
  const comments = flattenReviewComments(parseReviewJson(fixture("review.json")));

  assert.equal(comments.length, 4);
  assert.deepEqual(comments.map((comment) => comment.id), ["r_arch", "r_done", "c_line", "c_file"]);
  assert.equal(comments.find((comment) => comment.id === "r_done")?.resolved, true);
  assert.equal(comments.find((comment) => comment.id === "c_file")?.scope, "file");
  assert.equal(comments.find((comment) => comment.id === "c_line")?.scope, "line");
});

test("missing resolved is treated as unresolved", () => {
  const comments = flattenReviewComments({ review_comments: [{ id: "r_missing", body: "Handle this" }] });

  assert.equal(comments[0]?.resolved, false);
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run:

```bash
npm test -- tests/parser.test.ts
```

Expected: FAIL because `src/crit-parser.ts` does not exist.

- [ ] **Step 5: Implement parser**

Write `src/crit-parser.ts`:

```ts
import type { CritComment, CritReviewFile, CritRunResult } from "./types.js";

const REVIEW_PATH_PATTERNS = [
  /Review comments are in\s+([^\n\r]+)/i,
  /review file:?\s+([^\n\r]+)/i,
];

export function parseCritOutput(output: string): Pick<CritRunResult, "reviewPath" | "nextCommand" | "approved"> {
  const reviewPath = extractReviewPath(output);
  const nextCommand = extractNextCommand(output);
  const approved = extractApproved(output);

  return { reviewPath, nextCommand, approved };
}

export function parseReviewJson(raw: string): CritReviewFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid Crit review JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid Crit review JSON: expected an object");
  }

  return parsed as CritReviewFile;
}

export function flattenReviewComments(review: CritReviewFile): CritComment[] {
  const comments: CritComment[] = [];

  for (const comment of review.review_comments ?? []) {
    const normalized = normalizeComment(comment, "review");
    if (normalized) comments.push(normalized);
  }

  for (const [file, fileReview] of Object.entries(review.files ?? {})) {
    for (const comment of fileReview.comments ?? []) {
      const scope = inferFileCommentScope(comment.start_line);
      const normalized = normalizeComment(comment, scope, file);
      if (normalized) comments.push(normalized);
    }
  }

  return comments;
}

function extractReviewPath(output: string): string | undefined {
  for (const pattern of REVIEW_PATH_PATTERNS) {
    const match = output.match(pattern);
    const value = match?.[1]?.trim();
    if (value) return value;
  }
  return undefined;
}

function extractNextCommand(output: string): string | undefined {
  const explicit = output.match(/^Next round:\s*(.+)$/im)?.[1]?.trim();
  if (explicit) return explicit;

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) continue;
    try {
      const parsed = JSON.parse(trimmed) as { next_command?: unknown };
      if (typeof parsed.next_command === "string" && parsed.next_command.trim()) {
        return parsed.next_command.trim();
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

function extractApproved(output: string): boolean | undefined {
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) continue;
    try {
      const parsed = JSON.parse(trimmed) as { approved?: unknown };
      if (typeof parsed.approved === "boolean") return parsed.approved;
    } catch {
      continue;
    }
  }
  return undefined;
}

function inferFileCommentScope(startLine: number | undefined): "file" | "line" {
  return startLine && startLine > 0 ? "line" : "file";
}

function normalizeComment(
  comment: CritReviewFile["review_comments"] extends Array<infer T> ? T : never,
  scope: "review" | "file" | "line",
  file?: string,
): CritComment | undefined {
  const id = typeof comment.id === "string" && comment.id.trim() ? comment.id.trim() : undefined;
  const body = typeof comment.body === "string" && comment.body.trim() ? comment.body.trim() : undefined;
  if (!id || !body) return undefined;

  return {
    id,
    scope,
    file,
    startLine: typeof comment.start_line === "number" ? comment.start_line : undefined,
    endLine: typeof comment.end_line === "number" ? comment.end_line : undefined,
    body,
    author: typeof comment.author === "string" ? comment.author : undefined,
    resolved: comment.resolved === true,
    replies: Array.isArray(comment.replies) ? comment.replies.filter((reply) => typeof reply.body === "string") : [],
    quote: typeof comment.quote === "string" ? comment.quote : undefined,
    anchor: typeof comment.anchor === "string" ? comment.anchor : undefined,
    drifted: comment.drifted === true,
  };
}
```

- [ ] **Step 6: Run parser tests**

Run:

```bash
npm test -- tests/parser.test.ts
```

Expected: PASS for all parser tests.

- [ ] **Step 7: Commit parser**

Run:

```bash
git add src/crit-parser.ts tests/fixtures/review.json tests/fixtures/crit-finished.txt tests/parser.test.ts
git commit -m "feat: parse Crit review output"
```

## Task 3: Context formatting and injection budget

**Files:**
- Create: `src/context-format.ts`
- Create: `tests/context-format.test.ts`

- [ ] **Step 1: Write failing formatter tests**

Write `tests/context-format.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { formatCritContext } from "../src/context-format.js";
import type { CritComment, CritReviewSummary } from "../src/types.js";

const baseComment: CritComment = {
  id: "c_base",
  scope: "line",
  file: "src/index.ts",
  startLine: 10,
  endLine: 12,
  body: "Fix this behavior",
  resolved: false,
  replies: [],
  drifted: false,
};

const summary = (comments: CritComment[]): CritReviewSummary => ({
  reviewPath: "/tmp/review.json",
  nextCommand: "crit",
  approved: false,
  comments,
});

test("formatCritContext includes unresolved and resolved guidance", () => {
  const context = formatCritContext(summary([
    baseComment,
    { ...baseComment, id: "r_done", scope: "review", file: undefined, startLine: undefined, resolved: true, body: "Already decided to keep local install for dev" },
  ]), 12_000);

  assert.match(context.text, /Crit Review Context/);
  assert.match(context.text, /Active comments/);
  assert.match(context.text, /Resolved guidance/);
  assert.match(context.text, /Already decided/);
  assert.equal(context.compacted, false);
});

test("formatCritContext compacts resolved history when over budget", () => {
  const resolved = Array.from({ length: 40 }, (_, index): CritComment => ({
    ...baseComment,
    id: `r_${index}`,
    scope: "review",
    file: undefined,
    startLine: undefined,
    resolved: true,
    body: `Resolved guidance ${index} `.repeat(20),
  }));

  const context = formatCritContext(summary([baseComment, ...resolved]), 2_000);

  assert.equal(context.compacted, true);
  assert.match(context.text, /Context compacted/);
  assert.match(context.text, /Fix this behavior/);
  assert.ok(context.text.length <= 2_000);
});
```

- [ ] **Step 2: Run formatter tests to verify they fail**

Run:

```bash
npm test -- tests/context-format.test.ts
```

Expected: FAIL because `src/context-format.ts` does not exist.

- [ ] **Step 3: Implement formatter**

Write `src/context-format.ts`:

```ts
import type { CritComment, CritReviewSummary } from "./types.js";

export type FormattedCritContext = {
  text: string;
  compacted: boolean;
};

export function formatCritContext(summary: CritReviewSummary, maxInjectedChars: number): FormattedCritContext {
  const active = summary.comments.filter((comment) => !comment.resolved);
  const resolved = summary.comments.filter((comment) => comment.resolved);

  const full = buildContext(summary, active, resolved, false);
  if (full.length <= maxInjectedChars) return { text: full, compacted: false };

  const compacted = buildContext(summary, active, compactResolved(resolved), true);
  if (compacted.length <= maxInjectedChars) return { text: compacted, compacted: true };

  return { text: truncatePreservingActive(summary, active, maxInjectedChars), compacted: true };
}

function buildContext(
  summary: CritReviewSummary,
  active: CritComment[],
  resolved: CritComment[],
  compacted: boolean,
): string {
  const sections = [
    "<crit_review_context>",
    "# Crit Review Context",
    `Review file: ${summary.reviewPath}`,
    summary.nextCommand ? `Next round: ${summary.nextCommand}` : undefined,
    typeof summary.approved === "boolean" ? `Approved: ${summary.approved}` : undefined,
    compacted ? "Context compacted: full review remains available through Crit tools." : undefined,
    "",
    "## Active comments",
    active.length ? active.map(formatComment).join("\n\n") : "No active comments.",
    "",
    "## Resolved guidance",
    resolved.length ? resolved.map(formatComment).join("\n\n") : "No resolved guidance.",
    "</crit_review_context>",
  ].filter((line): line is string => line !== undefined);

  return `${sections.join("\n")}\n`;
}

function formatComment(comment: CritComment): string {
  const location = formatLocation(comment);
  const lines = [
    `- [${comment.resolved ? "resolved" : "active"}] ${comment.id} ${location}`.trim(),
    `  Author: ${comment.author ?? "unknown"}`,
    `  Body: ${comment.body}`,
    comment.quote ? `  Quote: ${comment.quote}` : undefined,
    comment.anchor ? `  Anchor: ${comment.anchor}` : undefined,
    comment.drifted ? "  Drifted: true" : undefined,
    comment.replies.length ? `  Replies: ${comment.replies.map((reply) => `${reply.author ?? "unknown"}: ${reply.body}`).join(" | ")}` : undefined,
  ];
  return lines.filter((line): line is string => line !== undefined).join("\n");
}

function formatLocation(comment: CritComment): string {
  if (comment.scope === "review") return "review";
  if (!comment.file) return comment.scope;
  if (comment.scope === "file") return `${comment.file}`;
  const end = comment.endLine && comment.endLine !== comment.startLine ? `-${comment.endLine}` : "";
  return `${comment.file}:${comment.startLine ?? 0}${end}`;
}

function compactResolved(comments: CritComment[]): CritComment[] {
  return comments.map((comment) => ({
    ...comment,
    body: summarize(comment.body, 240),
    replies: comment.replies.slice(-2),
  }));
}

function summarize(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function truncatePreservingActive(summary: CritReviewSummary, active: CritComment[], maxInjectedChars: number): string {
  const header = [
    "<crit_review_context>",
    "# Crit Review Context",
    `Review file: ${summary.reviewPath}`,
    summary.nextCommand ? `Next round: ${summary.nextCommand}` : undefined,
    "Context compacted: formatted review exceeded crit.maxInjectedChars; full review remains available through Crit tools.",
    "",
    "## Active comments",
  ].filter((line): line is string => line !== undefined).join("\n");

  const footer = "\n\n## Resolved guidance\nResolved guidance summarized due to crit.maxInjectedChars. Use Crit tools for full review.\n</crit_review_context>\n";
  const available = Math.max(0, maxInjectedChars - header.length - footer.length - 1);
  const activeText = active.map(formatComment).join("\n\n");
  return `${header}\n${summarize(activeText, available)}${footer}`;
}
```

- [ ] **Step 4: Run formatter tests**

Run:

```bash
npm test -- tests/context-format.test.ts
```

Expected: PASS for formatter tests.

- [ ] **Step 5: Commit formatter**

Run:

```bash
git add src/context-format.ts tests/context-format.test.ts
git commit -m "feat: format Crit context for Pi"
```

## Task 4: Crit runner

**Files:**
- Create: `src/crit-runner.ts`
- Create: `tests/runner.test.ts`

- [ ] **Step 1: Write failing runner tests**

Write `tests/runner.test.ts`:

```ts
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CritRunner } from "../src/crit-runner.js";

function makeCritStub(script: string): string {
  const dir = mkdtempSync(join(tmpdir(), "pi-crit-runner-"));
  const bin = join(dir, "crit-stub");
  writeFileSync(bin, script, "utf8");
  chmodSync(bin, 0o755);
  return bin;
}

test("run forwards explicit args and parses Crit output", async () => {
  const log = join(mkdtempSync(join(tmpdir(), "pi-crit-log-")), "args.txt");
  const bin = makeCritStub(`#!/usr/bin/env node\nconst fs = require('fs');\nfs.writeFileSync(${JSON.stringify(log)}, process.argv.slice(2).join('|'));\nconsole.log('Review comments are in /tmp/review.json');\nconsole.log('Next round: crit src/index.ts');\n`);

  const runner = new CritRunner({ binary: bin });
  const result = await runner.run(["src/index.ts"], process.cwd());

  assert.equal(readFileSync(log, "utf8"), "src/index.ts");
  assert.equal(result.reviewPath, "/tmp/review.json");
  assert.equal(result.nextCommand, "crit src/index.ts");
});

test("run rejects concurrent runs", async () => {
  const bin = makeCritStub(`#!/usr/bin/env node\nsetTimeout(() => process.exit(0), 250);\n`);
  const runner = new CritRunner({ binary: bin });
  const first = runner.run([], process.cwd());

  await assert.rejects(() => runner.run([], process.cwd()), /Crit run already active/);
  await first;
});
```

- [ ] **Step 2: Run runner tests to verify they fail**

Run:

```bash
npm test -- tests/runner.test.ts
```

Expected: FAIL because `src/crit-runner.ts` does not exist.

- [ ] **Step 3: Implement runner**

Write `src/crit-runner.ts`:

```ts
import { spawn } from "node:child_process";
import { parseCritOutput } from "./crit-parser.js";
import type { CritRunResult } from "./types.js";

export class CritRunner {
  #active = false;
  #binary: string;

  constructor(options: { binary: string }) {
    this.#binary = options.binary;
  }

  get active(): boolean {
    return this.#active;
  }

  async run(args: string[], cwd: string): Promise<CritRunResult> {
    if (this.#active) throw new Error("Crit run already active");
    this.#active = true;

    try {
      const result = await spawnCrit(this.#binary, args, cwd);
      const parsed = parseCritOutput(`${result.stdout}\n${result.stderr}`);
      return { ...result, ...parsed };
    } finally {
      this.#active = false;
    }
  }
}

function spawnCrit(binary: string, args: string[], cwd: string): Promise<Pick<CritRunResult, "exitCode" | "stdout" | "stderr">> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const stdout: string[] = [];
    const stderr: string[] = [];

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => stdout.push(chunk));
    child.stderr.on("data", (chunk: string) => stderr.push(chunk));
    child.on("error", (error) => reject(new Error(`Failed to start crit: ${error.message}`)));
    child.on("close", (code) => {
      resolve({ exitCode: code ?? 0, stdout: stdout.join(""), stderr: stderr.join("") });
    });
  });
}
```

- [ ] **Step 4: Run runner tests**

Run:

```bash
npm test -- tests/runner.test.ts
```

Expected: PASS for runner tests.

- [ ] **Step 5: Commit runner**

Run:

```bash
git add src/crit-runner.ts tests/runner.test.ts
git commit -m "feat: run Crit from Pi"
```

## Task 5: Agent tools

**Files:**
- Create: `src/tools.ts`
- Create: `tests/tools.test.ts`
- Modify: `src/types.ts`

- [ ] **Step 1: Extend types for command execution**

Append to `src/types.ts`:

```ts
export type CommandExecutor = (command: string, args: string[], options: { cwd: string; input?: string }) => Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}>;
```

- [ ] **Step 2: Write failing tool helper tests**

Write `tests/tools.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildBulkReplyPayload, runCritStatus, submitCritReplies } from "../src/tools.js";
import type { CommandExecutor } from "../src/types.js";

test("runCritStatus calls crit status --json", async () => {
  const calls: string[] = [];
  const executor: CommandExecutor = async (command, args) => {
    calls.push([command, ...args].join(" "));
    return { exitCode: 0, stdout: '{"review_file":"/tmp/review.json"}', stderr: "" };
  };

  const status = await runCritStatus(executor, "crit", "/repo");

  assert.deepEqual(calls, ["crit status --json"]);
  assert.equal(status.review_file, "/tmp/review.json");
});

test("submitCritReplies sends bulk JSON to crit comment", async () => {
  let capturedInput = "";
  const executor: CommandExecutor = async (_command, args, options) => {
    assert.deepEqual(args, ["comment", "--json", "--author", "Pi"]);
    capturedInput = options.input ?? "";
    return { exitCode: 0, stdout: "ok", stderr: "" };
  };

  await submitCritReplies(executor, "crit", "/repo", "Pi", [{ reply_to: "c_1", body: "Fixed" }]);

  assert.deepEqual(JSON.parse(capturedInput), [{ reply_to: "c_1", body: "Fixed" }]);
});

test("buildBulkReplyPayload requires body", () => {
  assert.throws(() => buildBulkReplyPayload([{ reply_to: "c_1", body: "" }]), /body is required/);
});
```

- [ ] **Step 3: Run tool tests to verify they fail**

Run:

```bash
npm test -- tests/tools.test.ts
```

Expected: FAIL because `src/tools.ts` does not exist.

- [ ] **Step 4: Implement tool helpers and registration function**

Write `src/tools.ts`:

```ts
import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { CommandExecutor } from "./types.js";

export type BulkReplyEntry = {
  reply_to?: string;
  file?: string;
  path?: string;
  line?: number | string;
  end_line?: number;
  body: string;
  scope?: "review" | "file" | "line";
  resolve?: boolean;
};

export const nodeCommandExecutor: CommandExecutor = (command, args, options) => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, stdio: ["pipe", "pipe", "pipe"] });
    const stdout: string[] = [];
    const stderr: string[] = [];
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => stdout.push(chunk));
    child.stderr.on("data", (chunk: string) => stderr.push(chunk));
    child.on("error", (error) => reject(error));
    child.on("close", (code) => resolve({ exitCode: code ?? 0, stdout: stdout.join(""), stderr: stderr.join("") }));
    child.stdin.end(options.input ?? "");
  });
};

export async function runCritStatus(executor: CommandExecutor, binary: string, cwd: string): Promise<Record<string, unknown>> {
  const result = await executor(binary, ["status", "--json"], { cwd });
  if (result.exitCode !== 0) throw new Error(result.stderr || `crit status exited ${result.exitCode}`);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

export function buildBulkReplyPayload(entries: BulkReplyEntry[]): BulkReplyEntry[] {
  return entries.map((entry) => {
    if (!entry.body.trim()) throw new Error("body is required for every Crit reply/comment");
    return { ...entry, body: entry.body };
  });
}

export async function submitCritReplies(
  executor: CommandExecutor,
  binary: string,
  cwd: string,
  author: string,
  entries: BulkReplyEntry[],
): Promise<string> {
  const payload = buildBulkReplyPayload(entries);
  const result = await executor(binary, ["comment", "--json", "--author", author], {
    cwd,
    input: JSON.stringify(payload, null, 2),
  });
  if (result.exitCode !== 0) throw new Error(result.stderr || `crit comment exited ${result.exitCode}`);
  return result.stdout;
}

export function registerCritTools(
  pi: ExtensionAPI,
  options: { binary: string; cwd: () => string; author: string; executor?: CommandExecutor; runCrit?: (args: string[]) => Promise<unknown> },
): void {
  const executor = options.executor ?? nodeCommandExecutor;

  pi.registerTool({
    name: "crit_status",
    label: "Crit Status",
    description: "Read Crit review status as JSON.",
    promptSnippet: "Use crit_status to inspect the active Crit review file and comment counts.",
    parameters: Type.Object({}),
    async execute() {
      const status = await runCritStatus(executor, options.binary, options.cwd());
      return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }], details: status };
    },
  });

  pi.registerTool({
    name: "crit_reply",
    label: "Crit Reply",
    description: "Submit bulk Crit replies or comments through crit comment --json.",
    promptSnippet: "Use crit_reply to reply to Crit comments after making changes.",
    parameters: Type.Object({
      entries: Type.Array(Type.Object({
        reply_to: Type.Optional(Type.String()),
        file: Type.Optional(Type.String()),
        path: Type.Optional(Type.String()),
        line: Type.Optional(Type.Union([Type.Number(), Type.String()])),
        end_line: Type.Optional(Type.Number()),
        body: Type.String(),
        scope: Type.Optional(Type.Union([Type.Literal("review"), Type.Literal("file"), Type.Literal("line")])),
        resolve: Type.Optional(Type.Boolean()),
      })),
    }),
    async execute(_toolCallId, params) {
      const stdout = await submitCritReplies(executor, options.binary, options.cwd(), options.author, params.entries);
      return { content: [{ type: "text", text: stdout || "Crit replies submitted." }] };
    },
  });

  pi.registerTool({
    name: "crit_run",
    label: "Crit Run",
    description: "Start a Crit review when explicitly requested by the user.",
    promptSnippet: "Use crit_run only when the user explicitly asks to start a Crit review.",
    parameters: Type.Object({ args: Type.Optional(Type.Array(Type.String())) }),
    async execute(_toolCallId, params) {
      if (!options.runCrit) throw new Error("crit_run is not available in this session");
      const result = await options.runCrit(params.args ?? []);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
    },
  });
}
```

- [ ] **Step 5: Run tool tests**

Run:

```bash
npm test -- tests/tools.test.ts
```

Expected: PASS for tool tests.

- [ ] **Step 6: Commit tools**

Run:

```bash
git add src/types.ts src/tools.ts tests/tools.test.ts
git commit -m "feat: add Crit agent tools"
```

## Task 6: Pi extension entrypoint

**Files:**
- Create: `src/index.ts`
- Modify: `src/types.ts`

- [ ] **Step 1: Add settings and state helpers to types**

Append to `src/types.ts`:

```ts
export function defaultCritSettings(): CritSettings {
  return {
    maxInjectedChars: DEFAULT_MAX_INJECTED_CHARS,
    binary: "crit",
    replyAuthor: "Pi",
  };
}
```

- [ ] **Step 2: Implement extension entrypoint**

Write `src/index.ts`:

```ts
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { flattenReviewComments, parseReviewJson } from "./crit-parser.js";
import { CritRunner } from "./crit-runner.js";
import { formatCritContext } from "./context-format.js";
import { registerCritTools } from "./tools.js";
import { defaultCritSettings, type CritExtensionState, type CritReviewSummary } from "./types.js";
import { readFile } from "node:fs/promises";

const baseDir = dirname(fileURLToPath(import.meta.url));

export default function piCritExtension(pi: ExtensionAPI) {
  const settings = defaultCritSettings();
  const state: CritExtensionState = { activeRun: false };
  const runner = new CritRunner({ binary: settings.binary });

  const cwd = () => process.cwd();

  pi.on("resources_discover", () => ({
    skillPaths: [join(baseDir, "..", "skills")],
    promptPaths: [join(baseDir, "..", "prompts")],
  }));

  pi.on("before_agent_start", async (event) => {
    if (!state.summary || state.injectedReviewPath === state.summary.reviewPath) return undefined;
    const formatted = formatCritContext(state.summary, settings.maxInjectedChars);
    state.injectedReviewPath = state.summary.reviewPath;

    return {
      message: {
        customType: "crit-review-context",
        content: formatted.text,
        display: true,
        details: {
          reviewPath: state.summary.reviewPath,
          nextCommand: state.summary.nextCommand,
          compacted: formatted.compacted,
        },
      },
      systemPrompt: `${event.systemPrompt}\n\n${formatted.text}`,
    };
  });

  registerCritTools(pi, {
    binary: settings.binary,
    cwd,
    author: settings.replyAuthor,
    runCrit: (args) => runCrit(args),
  });

  pi.registerCommand("crit", {
    description: "Run Crit review. With no args, review modified/unstaged working-tree changes/files.",
    handler: async (args, ctx) => {
      await runCrit(splitArgs(args), ctx);
    },
  });

  pi.registerCommand("crit-files", {
    description: "Run Crit review for specific files: /crit-files <files...>",
    handler: async (args, ctx) => {
      await runCrit(splitArgs(args), ctx);
    },
  });

  pi.registerCommand("crit-pr", {
    description: "Run Crit review for a GitHub PR: /crit-pr <number-or-url>",
    handler: async (args, ctx) => {
      const value = args.trim();
      if (!value) throw new Error("Usage: /crit-pr <number-or-url>");
      await runCrit(["--pr", value], ctx);
    },
  });

  pi.registerCommand("crit-range", {
    description: "Run Crit review for a commit range: /crit-range <base..head>",
    handler: async (args, ctx) => {
      const value = args.trim();
      if (!value) throw new Error("Usage: /crit-range <base..head>");
      await runCrit(["--range", value], ctx);
    },
  });

  async function runCrit(args: string[], commandCtx?: { ui?: { notify?: (message: string, level?: string) => void } }) {
    if (runner.active) throw new Error("Crit run already active");
    state.activeRun = true;
    state.activeCommand = [settings.binary, ...args];

    try {
      commandCtx?.ui?.notify?.("Starting Crit review. Finish the review in the Crit browser UI.", "info");
      const result = await runner.run(args, cwd());
      state.activeRun = false;

      if (result.exitCode !== 0) throw new Error(result.stderr || `crit exited ${result.exitCode}`);
      if (!result.reviewPath) throw new Error("Crit finished without a review file path");

      const rawReview = await readFile(result.reviewPath, "utf8");
      const comments = flattenReviewComments(parseReviewJson(rawReview));
      const summary: CritReviewSummary = {
        reviewPath: result.reviewPath,
        nextCommand: result.nextCommand,
        approved: result.approved,
        comments,
      };

      state.reviewPath = result.reviewPath;
      state.nextCommand = result.nextCommand;
      state.summary = summary;
      state.injectedReviewPath = undefined;

      commandCtx?.ui?.notify?.(`Captured ${comments.length} Crit comments. Starting Pi follow-up turn.`, "info");
      await pi.sendMessage({
        customType: "crit-review-ready",
        content: "Crit review is ready. Address the injected Crit comments now.",
        display: true,
        details: { reviewPath: summary.reviewPath, nextCommand: summary.nextCommand, commentCount: comments.length },
      }, { triggerTurn: true, deliverAs: "steer" });

      return summary;
    } catch (error) {
      state.activeRun = false;
      state.lastError = error instanceof Error ? error.message : String(error);
      commandCtx?.ui?.notify?.(state.lastError, "error");
      throw error;
    }
  }
}

function splitArgs(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];
  return trimmed.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((part) => part.replace(/^(["'])(.*)\1$/, "$2")) ?? [];
}
```

- [ ] **Step 3: Typecheck extension**

Run:

```bash
npm run typecheck
```

Expected: PASS. If Pi API type names differ, adjust `before_agent_start` return shape to the exact local Pi extension type while preserving behavior: inject Crit context and trigger one steering turn.

- [ ] **Step 4: Commit extension entrypoint**

Run:

```bash
git add src/index.ts src/types.ts
git commit -m "feat: wire Crit into Pi session flow"
```

## Task 7: Packaged skills and prompt

**Files:**
- Create: `skills/crit/SKILL.md`
- Create: `skills/crit-cli/SKILL.md`
- Create: `prompts/crit.md`

- [ ] **Step 1: Write Crit review-loop skill**

Write `skills/crit/SKILL.md`:

```md
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
```

- [ ] **Step 2: Write Crit CLI skill**

Write `skills/crit-cli/SKILL.md`:

```md
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
```

- [ ] **Step 3: Write prompt template**

Write `prompts/crit.md`:

```md
---
description: Start a Crit review from Pi
argument-hint: "[crit args]"
---

Run `/crit $ARGUMENTS` to start a Crit review from inside Pi. With no arguments, review all modified/unstaged working-tree changes/files. After I finish the Crit browser review, inject my Crit comments into the next Pi agent turn and address them.
```

- [ ] **Step 4: Verify package resources load by manifest shape**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit skills and prompt**

Run:

```bash
git add skills/crit/SKILL.md skills/crit-cli/SKILL.md prompts/crit.md
git commit -m "feat: add Pi Crit skills"
```

## Task 8: Full verification and release readiness

**Files:**
- Modify: `docs/specs/2026-05-10-pi-crit-integration-design.md` only if verification reveals a design mismatch.

- [ ] **Step 1: Run full checks**

Run:

```bash
npm run check
```

Expected: PASS for `tsc --noEmit` and all tests.

- [ ] **Step 2: Test local Pi package install**

Run from this repo:

```bash
pi install /Users/eric/Dev/pi-crit
```

Expected: Pi installs or registers the local package without manifest errors.

- [ ] **Step 3: Verify Crit binary exists**

Run:

```bash
crit --version
crit --help
```

Expected: both commands succeed and `crit --help` shows bare `crit` auto-detects changed files via git.

- [ ] **Step 4: Manual smoke test with a temporary repo**

Run:

```bash
tmpdir=$(mktemp -d)
cd "$tmpdir"
git init
echo 'one' > sample.txt
git add sample.txt
git commit -m 'initial'
echo 'two' >> sample.txt
```

Expected: a temporary git repo exists with one modified file.

- [ ] **Step 5: Start Pi and run Crit command manually**

From the temporary repo, start Pi with this package installed and run:

```text
/crit
```

Expected: Crit opens in the browser and reviews the modified `sample.txt` working-tree change.

- [ ] **Step 6: Finish Crit review and verify Pi receives comments**

In the Crit browser UI, add one line comment and click “Finish Review”.

Expected:

- Pi captures the review file.
- Pi auto-starts one follow-up agent turn.
- The injected context includes the Crit comment ID, file path, line number, body, review path, and next command.
- No manual copy/paste or `pi -p` is used.

- [ ] **Step 7: Verify release install target**

Run:

```bash
gh repo view teknologist/pi-crit --json nameWithOwner,url
```

Expected output includes:

```json
{"nameWithOwner":"teknologist/pi-crit","url":"https://github.com/teknologist/pi-crit"}
```

- [ ] **Step 8: Commit verification fixes if any**

If verification required code fixes, commit them with a focused message:

```bash
git add <changed-files>
git commit -m "fix: stabilize Pi Crit integration"
```

Expected: no commit is made if verification required no changes.

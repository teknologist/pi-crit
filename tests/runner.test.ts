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

test("signaled child returns failure and diagnostic", async () => {
  const bin = makeCritStub(`#!/usr/bin/env node\nprocess.kill(process.pid, 'SIGTERM');\n`);
  const runner = new CritRunner({ binary: bin });

  const result = await runner.run([], process.cwd());

  assert.notEqual(result.exitCode, 0);
  assert.match(result.stderr, /signal SIGTERM/);
  assert.equal(runner.active, false);
});

test("active clears after spawn failure", async () => {
  const runner = new CritRunner({ binary: join(tmpdir(), "missing-crit-binary") });

  await assert.rejects(() => runner.run([], process.cwd()), /Failed to start crit/);
  assert.equal(runner.active, false);
});

test("active clears after normal completion", async () => {
  const bin = makeCritStub(`#!/usr/bin/env node\nprocess.exit(0);\n`);
  const runner = new CritRunner({ binary: bin });

  await runner.run([], process.cwd());

  assert.equal(runner.active, false);
});

import assert from "node:assert/strict";
import test from "node:test";
import { buildBulkReplyPayload, nodeCommandExecutor, runCritStatus, submitCritReplies } from "../src/tools.js";
import type { CommandExecutor } from "../src/types.js";

test("runCritStatus calls crit status --json", async () => {
  const calls: string[] = [];
  const executor: CommandExecutor = async (command, args) => {
    calls.push([command, ...args].join(" "));
    return { exitCode: 0, stdout: '{"review_file":"/home/user/.crit/reviews/51664d89943d/review.json"}', stderr: "" };
  };

  const status = await runCritStatus(executor, "crit", "/repo");

  assert.deepEqual(calls, ["crit status --json"]);
  assert.equal(status.review_file, "/home/user/.crit/reviews/51664d89943d/review.json");
});

test("runCritStatus rejects nonzero exit", async () => {
  const executor: CommandExecutor = async () => ({ exitCode: 2, stdout: "", stderr: "bad status" });

  await assert.rejects(() => runCritStatus(executor, "crit", "/repo"), /bad status/);
});

test("runCritStatus rejects invalid JSON usefully", async () => {
  const executor: CommandExecutor = async () => ({ exitCode: 0, stdout: "not json", stderr: "" });

  await assert.rejects(() => runCritStatus(executor, "crit", "/repo"), /Invalid JSON from crit status/);
});

test("runCritStatus rejects non-object JSON", async () => {
  const executor: CommandExecutor = async () => ({ exitCode: 0, stdout: "null", stderr: "" });

  await assert.rejects(() => runCritStatus(executor, "crit", "/repo"), /expected object JSON/);
});

test("nodeCommandExecutor handles stdin errors when child exits before reading", async () => {
  const result = await nodeCommandExecutor(process.execPath, ["-e", "process.exit(0)"], {
    cwd: process.cwd(),
    input: "x".repeat(1024 * 1024 * 64),
  });

  assert.equal(typeof result.exitCode, "number");
});

test("submitCritReplies sends bulk JSON to crit comment", async () => {
  let capturedInput = "";
  const executor: CommandExecutor = async (command, args, options) => {
    assert.equal(command, "crit");
    assert.deepEqual(args, ["comment", "--json", "--author", "Pi"]);
    capturedInput = options.input ?? "";
    return { exitCode: 0, stdout: "ok", stderr: "" };
  };

  await submitCritReplies(executor, "crit", "/repo", "Pi", [{ reply_to: "c_1", body: "Fixed" }]);

  assert.deepEqual(JSON.parse(capturedInput), [{ reply_to: "c_1", body: "Fixed" }]);
});

test("buildBulkReplyPayload requires body", () => {
  assert.throws(() => buildBulkReplyPayload([{ reply_to: "c_1", body: "" }]), /body is required/);
  assert.throws(() => buildBulkReplyPayload([{ reply_to: "c_1", body: "   " }]), /body is required/);
});

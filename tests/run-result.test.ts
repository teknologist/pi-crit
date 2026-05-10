import assert from "node:assert/strict";
import test from "node:test";
import { critRunDiagnostic, hasUnresolvedComments, isApprovedWithoutAction, isDaemonStartOnlyOutput } from "../src/run-result.js";
import type { CritComment } from "../src/types.js";

test("isDaemonStartOnlyOutput recognizes daemon-only Crit output", () => {
  assert.equal(isDaemonStartOnlyOutput("Started crit daemon at http://localhost:56095 (PID 3968)\n"), true);
  assert.equal(isDaemonStartOnlyOutput("Started crit daemon at http://localhost:56095 (PID 3968)\nError: boom"), false);
});

test("critRunDiagnostic includes stderr, stdout, and exit code", () => {
  const diagnostic = critRunDiagnostic({ stderr: "bad", stdout: "Started crit daemon", exitCode: 1 });

  assert.match(diagnostic, /bad/);
  assert.match(diagnostic, /Started crit daemon/);
  assert.match(diagnostic, /crit exited 1/);
});

test("isApprovedWithoutAction treats approved Crit output as no-op", () => {
  assert.equal(isApprovedWithoutAction({ approved: true }), true);
  assert.equal(isApprovedWithoutAction({ approved: false }), false);
  assert.equal(isApprovedWithoutAction({}), false);
});

test("hasUnresolvedComments ignores resolved comments", () => {
  const comment: CritComment = {
    id: "c_1",
    scope: "review",
    body: "Looks good",
    resolved: true,
    replies: [],
    drifted: false,
  };

  assert.equal(hasUnresolvedComments([comment]), false);
  assert.equal(hasUnresolvedComments([{ ...comment, resolved: false }]), true);
});

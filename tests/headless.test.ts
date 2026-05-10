import assert from "node:assert/strict";
import test from "node:test";
import { extractLocalCritUrl, formatHeadlessCritGuidance, isCritReviewInvocation, prepareCritArgs } from "../src/headless.js";

test("prepareCritArgs adds no-open for SSH review sessions", () => {
  const result = prepareCritArgs(["src/index.ts"], { SSH_CONNECTION: "1.2.3.4 555 5.6.7.8 22" });

  assert.deepEqual(result.args, ["--no-open", "src/index.ts"]);
  assert.equal(result.environment.ssh, true);
  assert.equal(result.environment.headless, true);
  assert.equal(result.environment.noOpenAdded, true);
});

test("prepareCritArgs respects explicit no-open", () => {
  const result = prepareCritArgs(["--no-open", "src/index.ts"], { SSH_TTY: "/dev/pts/1" });

  assert.deepEqual(result.args, ["--no-open", "src/index.ts"]);
  assert.equal(result.environment.noOpenAdded, false);
});

test("prepareCritArgs does not add no-open to Crit subcommands", () => {
  const result = prepareCritArgs(["status", "--json"], { SSH_TTY: "/dev/pts/1" });

  assert.deepEqual(result.args, ["status", "--json"]);
  assert.equal(result.environment.noOpenAdded, false);
});

test("isCritReviewInvocation identifies review commands", () => {
  assert.equal(isCritReviewInvocation([]), true);
  assert.equal(isCritReviewInvocation(["src/index.ts"]), true);
  assert.equal(isCritReviewInvocation(["--pr", "123"]), true);
  assert.equal(isCritReviewInvocation(["status", "--json"]), false);
  assert.equal(isCritReviewInvocation(["stop", "--all"]), false);
});

test("extractLocalCritUrl finds daemon URL in Crit output", () => {
  assert.equal(extractLocalCritUrl("Started crit daemon at http://localhost:49516 (PID 16549)"), "http://localhost:49516");
});

test("formatHeadlessCritGuidance includes SSH port forward command", () => {
  const guidance = formatHeadlessCritGuidance("http://localhost:49516", { USER: "eric", HOSTNAME: "devbox" });

  assert.match(guidance, /ssh -L 49516:127\.0\.0\.1:49516 eric@devbox/);
  assert.match(guidance, /click Finished/);
});

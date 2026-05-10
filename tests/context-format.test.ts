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
  reviewPath: "/home/user/.crit/reviews/51664d89943d/review.json",
  nextCommand: "crit",
  approved: false,
  comments,
});

test("formatCritContext includes unresolved and resolved guidance", () => {
  const context = formatCritContext(summary([
    baseComment,
    { ...baseComment, id: "r_done", scope: "review", resolved: true, body: "Already decided to keep local install for dev" },
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
    resolved: true,
    body: `Resolved guidance ${index} `.repeat(20),
  }));

  const context = formatCritContext(summary([baseComment, ...resolved]), 2_000);

  assert.equal(context.compacted, true);
  assert.match(context.text, /Context compacted/);
  assert.match(context.text, /Approved: false/);
  assert.match(context.text, /Fix this behavior/);
  assert.match(context.text, /r_0/);
  assert.match(context.text, /Resolved guidance 0/);
  assert.ok(context.text.length <= 2_000);
});

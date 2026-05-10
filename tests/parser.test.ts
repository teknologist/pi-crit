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

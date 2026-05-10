import type { CritComment, CritRawComment, CritReviewFile, CritRunResult } from "./types.js";

const REVIEW_PATH_PATTERNS = [
  /^\s*Review comments are in\s+([^\n\r]+)/im,
  /^\s*review file:?\s+([^\n\r]+)/im,
];

type CritOutputJson = {
  approved?: unknown;
  next_command?: unknown;
  review_file?: unknown;
  review_path?: unknown;
  reviewPath?: unknown;
};

export function parseCritOutput(output: string): Pick<CritRunResult, "reviewPath" | "nextCommand" | "approved"> {
  const reviewPath = extractReviewPath(output);
  const nextCommand = extractNextCommand(output);
  const approved = extractApproved(output);
  const result: Pick<CritRunResult, "reviewPath" | "nextCommand" | "approved"> = {};

  if (reviewPath !== undefined) result.reviewPath = reviewPath;
  if (nextCommand !== undefined) result.nextCommand = nextCommand;
  if (approved !== undefined) result.approved = approved;

  return result;
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
  for (const parsed of parseCritOutputJsonLines(output)) {
    const value = firstString(parsed.review_file, parsed.review_path, parsed.reviewPath);
    if (value) return value;
  }

  for (const pattern of REVIEW_PATH_PATTERNS) {
    const match = output.match(pattern);
    const value = match?.[1]?.trim();
    if (value) return stripReviewPathTrailer(value);
  }
  return undefined;
}

function extractNextCommand(output: string): string | undefined {
  const explicit = output.match(/^Next round:\s*(.+)$/im)?.[1]?.trim();
  if (explicit) return explicit;

  for (const parsed of parseCritOutputJsonLines(output)) {
    const value = firstString(parsed.next_command);
    if (value) return value;
  }

  return undefined;
}

function extractApproved(output: string): boolean | undefined {
  for (const parsed of parseCritOutputJsonLines(output)) {
    if (typeof parsed.approved === "boolean") return parsed.approved;
  }
  return undefined;
}

function parseCritOutputJsonLines(output: string): CritOutputJson[] {
  const parsed: CritOutputJson[] = [];

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) continue;
    try {
      const value = JSON.parse(trimmed) as unknown;
      if (value && typeof value === "object" && !Array.isArray(value)) parsed.push(value as CritOutputJson);
    } catch {
      continue;
    }
  }

  return parsed;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function stripReviewPathTrailer(value: string): string {
  return value.split(/\s+—\s+/)[0]?.trim() ?? value;
}

function inferFileCommentScope(startLine: number | undefined): "file" | "line" {
  return startLine && startLine > 0 ? "line" : "file";
}

function normalizeComment(
  comment: CritRawComment,
  scope: "review" | "file" | "line",
  file?: string,
): CritComment | undefined {
  const id = typeof comment.id === "string" && comment.id.trim() ? comment.id.trim() : undefined;
  const body = typeof comment.body === "string" && comment.body.trim() ? comment.body.trim() : undefined;
  if (!id || !body) return undefined;

  const normalized: CritComment = {
    id,
    scope,
    body,
    resolved: comment.resolved === true,
    replies: Array.isArray(comment.replies) ? comment.replies.filter((reply) => typeof reply.body === "string") : [],
    drifted: comment.drifted === true,
  };

  if (file !== undefined) normalized.file = file;
  if (typeof comment.start_line === "number") normalized.startLine = comment.start_line;
  if (typeof comment.end_line === "number") normalized.endLine = comment.end_line;
  if (typeof comment.author === "string") normalized.author = comment.author;
  if (typeof comment.quote === "string") normalized.quote = comment.quote;
  if (typeof comment.anchor === "string") normalized.anchor = comment.anchor;

  return normalized;
}

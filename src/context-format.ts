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

  return { text: truncatePreservingActive(summary, active, resolved, maxInjectedChars), compacted: true };
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
  if (maxLength <= 0) return "";
  if (value.length <= maxLength) return value;
  if (maxLength === 1) return "…";
  return `${value.slice(0, maxLength - 1)}…`;
}

function truncatePreservingActive(
  summary: CritReviewSummary,
  active: CritComment[],
  resolved: CritComment[],
  maxInjectedChars: number,
): string {
  const budget = Math.max(0, maxInjectedChars);
  const header = [
    "<crit_review_context>",
    "# Crit Review Context",
    `Review file: ${summary.reviewPath}`,
    summary.nextCommand ? `Next round: ${summary.nextCommand}` : undefined,
    typeof summary.approved === "boolean" ? `Approved: ${summary.approved}` : undefined,
    "Context compacted: formatted review exceeded crit.maxInjectedChars; full review remains available through Crit tools.",
    "",
    "## Active comments",
  ].filter((line): line is string => line !== undefined).join("\n");

  const resolvedPrefix = "\n\n## Resolved guidance\n";
  const footer = "\n</crit_review_context>\n";
  const activeText = active.map(formatComment).join("\n\n");
  const resolvedBudget = Math.max(80, Math.floor(budget * 0.25));
  const resolvedText = compactResolvedGuidance(resolved, resolvedBudget);
  const available = budget - header.length - resolvedPrefix.length - resolvedText.length - footer.length - 1;

  if (available >= 0) {
    return `${header}\n${summarize(activeText, available)}${resolvedPrefix}${resolvedText}${footer}`;
  }

  const minimal = [
    "<crit_review_context>",
    "# Crit Review Context",
    typeof summary.approved === "boolean" ? `Approved: ${summary.approved}` : undefined,
    "Context compacted: crit.maxInjectedChars too small for full formatted review.",
    "## Active comments",
    summarize(activeText, Math.max(0, Math.floor(budget * 0.6))),
    "## Resolved guidance",
    compactResolvedGuidance(resolved, Math.max(0, Math.floor(budget * 0.3))),
    "</crit_review_context>",
  ].filter((line): line is string => line !== undefined).join("\n");

  return summarize(minimal, budget);
}

function compactResolvedGuidance(comments: CritComment[], maxLength: number): string {
  if (!comments.length) return "No resolved guidance.";

  const ids = comments.map((comment) => comment.id);
  const lines = [
    `Resolved guidance summarized due to crit.maxInjectedChars (${comments.length} resolved: ${ids.slice(0, 8).join(", ")}${ids.length > 8 ? ", …" : ""}).`,
  ];

  for (const comment of comments) {
    const snippet = summarize(comment.body.replace(/\s+/g, " ").trim(), 120);
    lines.push(`- [resolved] ${comment.id}: ${snippet}`);
    const text = lines.join("\n");
    if (text.length > maxLength) {
      lines.pop();
      break;
    }
  }

  return summarize(lines.join("\n"), maxLength);
}

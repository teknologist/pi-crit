import type { CritComment, CritRunResult } from "./types.js";

export function critRunDiagnostic(result: Pick<CritRunResult, "stdout" | "stderr" | "exitCode">): string {
  return [result.stderr, result.stdout, `crit exited ${result.exitCode}`]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n");
}

export function isDaemonStartOnlyOutput(output: string): boolean {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.length > 0 && lines.every((line) => /^Started crit daemon at https?:\/\//.test(line));
}

export function hasUnresolvedComments(comments: CritComment[]): boolean {
  return comments.some((comment) => !comment.resolved);
}

export function isApprovedWithoutAction(result: Pick<CritRunResult, "approved">): boolean {
  return result.approved === true;
}

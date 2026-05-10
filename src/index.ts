import { readFile } from "node:fs/promises";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { flattenReviewComments, parseReviewJson } from "./crit-parser.js";
import { CritRunner } from "./crit-runner.js";
import { formatCritContext } from "./context-format.js";
import { extractLocalCritUrl, formatHeadlessCritGuidance, prepareCritArgs } from "./headless.js";
import { critRunDiagnostic, hasUnresolvedComments, isApprovedWithoutAction, isDaemonStartOnlyOutput } from "./run-result.js";
import { nodeCommandExecutor, registerCritTools, runCritStatus } from "./tools.js";
import { defaultCritSettings, type CritExtensionState, type CritReviewSummary } from "./types.js";

export default function piCritExtension(pi: ExtensionAPI): void {
  const settings = defaultCritSettings();
  const state: CritExtensionState = { activeRun: false };
  const runner = new CritRunner({ binary: settings.binary });

  const cwd = () => process.cwd();

  pi.on("before_agent_start", () => {
    if (!state.summary || state.injectedReviewPath === state.summary.reviewPath) return undefined;
    const formatted = formatCritContext(state.summary, settings.maxInjectedChars);
    state.injectedReviewPath = state.summary.reviewPath;
    const details: { reviewPath: string; compacted: boolean; nextCommand?: string } = {
      reviewPath: state.summary.reviewPath,
      compacted: formatted.compacted,
    };
    if (state.summary.nextCommand !== undefined) details.nextCommand = state.summary.nextCommand;

    return {
      message: {
        customType: "crit-review-context",
        content: formatted.text,
        display: true,
        details,
      },
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
    description: "Run Crit review for a commit range: /crit-range <range>",
    handler: async (args, ctx) => {
      const value = args.trim();
      if (!value) throw new Error("Usage: /crit-range <range>");
      await runCrit(["--range", value], ctx);
    },
  });

  async function notifyExistingCritDaemon(commandCtx?: ExtensionCommandContext): Promise<void> {
    try {
      const status = await runCritStatus(nodeCommandExecutor, settings.binary, cwd());
      const daemon = status.daemon;
      if (!daemon || typeof daemon !== "object" || Array.isArray(daemon)) return;
      const running = (daemon as { running?: unknown }).running;
      const port = (daemon as { port?: unknown }).port;
      if (running === true) {
        const suffix = typeof port === "number" ? ` on port ${port}` : "";
        commandCtx?.ui?.notify?.(`Reusing existing Crit daemon${suffix}.`, "info");
      }
    } catch {
      // Best-effort status check only; Crit itself handles daemon reuse/startup.
    }
  }

  async function findReviewPathFromStatus(): Promise<string | undefined> {
    try {
      const status = await runCritStatus(nodeCommandExecutor, settings.binary, cwd());
      const reviewPath = status.review_file;
      if (typeof reviewPath === "string" && status.review_file_exists !== false) return reviewPath;
    } catch {
      return undefined;
    }
    return undefined;
  }

  async function runCrit(args: string[], commandCtx?: ExtensionCommandContext): Promise<CritReviewSummary> {
    let started = false;

    try {
      if (state.activeRun || runner.active) throw new Error("Crit run already active");

      const prepared = prepareCritArgs(args);
      state.activeRun = true;
      state.activeCommand = prepared.args;
      delete state.lastError;
      started = true;

      await notifyExistingCritDaemon(commandCtx);

      commandCtx?.ui?.notify?.("Running Crit review...", "info");
      if (prepared.environment.noOpenAdded) {
        commandCtx?.ui?.notify?.("Headless or SSH session detected; running Crit with --no-open.", "info");
      }

      let showedHeadlessGuidance = false;
      const result = await runner.run(prepared.args, cwd(), (_stream, chunk) => {
        for (const line of chunk.split(/\r?\n/)) {
          const message = line.trim();
          if (!message) continue;
          commandCtx?.ui?.notify?.(message, "info");
          const url = extractLocalCritUrl(message);
          if (url && prepared.environment.headless && !showedHeadlessGuidance) {
            showedHeadlessGuidance = true;
            commandCtx?.ui?.notify?.(formatHeadlessCritGuidance(url), "info");
          }
        }
      });
      state.activeRun = false;
      started = false;

      const reviewPath = result.reviewPath ?? (await findReviewPathFromStatus());
      const diagnostic = critRunDiagnostic(result);

      if (isApprovedWithoutAction(result)) {
        const summary: CritReviewSummary = {
          reviewPath: reviewPath ?? "",
          approved: true,
          comments: [],
        };
        state.summary = summary;
        if (reviewPath) state.reviewPath = reviewPath;
        commandCtx?.ui?.notify?.("Crit approved with no unresolved comments to address.", "info");
        return summary;
      }

      if (result.exitCode !== 0 && !reviewPath) {
        if (result.approved === true || isDaemonStartOnlyOutput(diagnostic)) {
          const summary: CritReviewSummary = {
            reviewPath: "",
            approved: result.approved ?? true,
            comments: [],
          };
          commandCtx?.ui?.notify?.("Crit finished with no comments to address.", "info");
          return summary;
        }
        throw new Error(diagnostic);
      }

      if (!reviewPath) {
        throw new Error((diagnostic || `crit exited ${result.exitCode}`).trim());
      }

      const rawReview = await readFile(reviewPath, "utf8");
      const comments = flattenReviewComments(parseReviewJson(rawReview));
      const summary: CritReviewSummary = {
        reviewPath,
        comments,
      };
      if (result.nextCommand !== undefined) summary.nextCommand = result.nextCommand;
      if (result.approved !== undefined) summary.approved = result.approved;

      state.reviewPath = reviewPath;
      if (result.nextCommand !== undefined) {
        state.nextCommand = result.nextCommand;
      } else {
        delete state.nextCommand;
      }
      state.summary = summary;
      delete state.injectedReviewPath;

      if (!hasUnresolvedComments(comments)) {
        commandCtx?.ui?.notify?.("Crit finished with no unresolved comments to address.", "info");
        return summary;
      }

      commandCtx?.ui?.notify?.(`Captured ${comments.length} Crit comments. Starting Pi follow-up turn.`, "info");
      const details: { reviewPath: string; commentCount: number; nextCommand?: string } = {
        reviewPath: summary.reviewPath,
        commentCount: comments.length,
      };
      if (summary.nextCommand !== undefined) details.nextCommand = summary.nextCommand;
      pi.sendMessage(
        {
          customType: "crit-review-ready",
          content: "Crit review is ready. Address the injected Crit comments now.",
          display: true,
          details,
        },
        { triggerTurn: true, deliverAs: "steer" },
      );

      return summary;
    } catch (error) {
      if (started) state.activeRun = false;
      state.lastError = error instanceof Error ? error.message : String(error);
      commandCtx?.ui?.notify?.(state.lastError, "error");
      throw error;
    }
  }
}

function splitArgs(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  let escaping = false;

  for (const char of input) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (escaping) throw new Error("Usage error: dangling escape in arguments");
  if (quote) throw new Error(`Usage error: unmatched ${quote === "'" ? "single" : "double"} quote in arguments`);
  if (current) args.push(current);
  return args;
}

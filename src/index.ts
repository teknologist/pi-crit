import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { flattenReviewComments, parseReviewJson } from "./crit-parser.js";
import { CritRunner } from "./crit-runner.js";
import { formatCritContext } from "./context-format.js";
import { registerCritTools } from "./tools.js";
import { defaultCritSettings, type CritExtensionState, type CritReviewSummary } from "./types.js";

const baseDir = dirname(fileURLToPath(import.meta.url));

export default function piCritExtension(pi: ExtensionAPI): void {
  const settings = defaultCritSettings();
  const state: CritExtensionState = { activeRun: false };
  const runner = new CritRunner({ binary: settings.binary });

  const cwd = () => process.cwd();

  pi.on("resources_discover", () => ({
    skillPaths: [join(baseDir, "..", "skills")],
    promptPaths: [join(baseDir, "..", "prompts")],
  }));

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
      systemPrompt: "Use the Crit review context message as authoritative guidance for this turn.",
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

  async function runCrit(args: string[], commandCtx?: ExtensionCommandContext): Promise<CritReviewSummary> {
    let started = false;

    try {
      if (state.activeRun || runner.active) throw new Error("Crit run already active");

      state.activeRun = true;
      state.activeCommand = args;
      delete state.lastError;
      started = true;

      commandCtx?.ui?.notify?.("Running Crit review...", "info");
      const result = await runner.run(args, cwd());
      state.activeRun = false;
      started = false;

      if (result.exitCode !== 0) {
        throw new Error(result.stderr || `crit exited ${result.exitCode}`);
      }

      if (!result.reviewPath) {
        const diagnostic = result.stderr || result.stdout || `crit exited ${result.exitCode} without a review path`;
        throw new Error(diagnostic.trim());
      }

      const rawReview = await readFile(result.reviewPath, "utf8");
      const comments = flattenReviewComments(parseReviewJson(rawReview));
      const summary: CritReviewSummary = {
        reviewPath: result.reviewPath,
        comments,
      };
      if (result.nextCommand !== undefined) summary.nextCommand = result.nextCommand;
      if (result.approved !== undefined) summary.approved = result.approved;

      state.reviewPath = result.reviewPath;
      if (result.nextCommand !== undefined) {
        state.nextCommand = result.nextCommand;
      } else {
        delete state.nextCommand;
      }
      state.summary = summary;
      delete state.injectedReviewPath;

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

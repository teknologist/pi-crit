import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { CommandExecutor } from "./types.js";

export type BulkReplyEntry = {
  reply_to?: string;
  file?: string;
  path?: string;
  line?: number | string;
  end_line?: number;
  body: string;
  scope?: "review" | "file" | "line";
  resolve?: boolean;
};

export const nodeCommandExecutor: CommandExecutor = (command, args, options) => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, stdio: ["pipe", "pipe", "pipe"] });
    const stdout: string[] = [];
    const stderr: string[] = [];

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => stdout.push(chunk));
    child.stderr.on("data", (chunk: string) => stderr.push(chunk));
    child.on("error", (error) => reject(new Error(`Failed to start ${command}: ${error.message}`)));
    child.on("close", (code, signal) => {
      const stderrText = stderr.join("");
      const signalDiagnostic = signal ? `${command} terminated by signal ${signal}\n` : "";
      resolve({
        exitCode: code ?? (signal ? 1 : 0),
        stdout: stdout.join(""),
        stderr: `${stderrText}${signalDiagnostic}`,
      });
    });
    child.stdin.end(options.input ?? "");
  });
};

export async function runCritStatus(
  executor: CommandExecutor,
  binary: string,
  cwd: string,
): Promise<Record<string, unknown>> {
  const result = await executor(binary, ["status", "--json"], { cwd });
  if (result.exitCode !== 0) throw new Error(result.stderr || `crit status exited ${result.exitCode}`);

  try {
    return JSON.parse(result.stdout) as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON from crit status: ${message}`);
  }
}

export function buildBulkReplyPayload(entries: BulkReplyEntry[]): BulkReplyEntry[] {
  return entries.map((entry) => {
    if (!entry.body.trim()) throw new Error("body is required for every Crit reply/comment");
    return { ...entry, body: entry.body };
  });
}

export async function submitCritReplies(
  executor: CommandExecutor,
  binary: string,
  cwd: string,
  author: string,
  entries: BulkReplyEntry[],
): Promise<string> {
  const payload = buildBulkReplyPayload(entries);
  const result = await executor(binary, ["comment", "--json", "--author", author], {
    cwd,
    input: JSON.stringify(payload, null, 2),
  });
  if (result.exitCode !== 0) throw new Error(result.stderr || `crit comment exited ${result.exitCode}`);
  return result.stdout;
}

export function registerCritTools(
  pi: ExtensionAPI,
  options: {
    binary: string;
    cwd: () => string;
    author: string;
    executor?: CommandExecutor;
    runCrit?: (args: string[]) => Promise<unknown>;
  },
): void {
  const executor = options.executor ?? nodeCommandExecutor;

  pi.registerTool({
    name: "crit_status",
    label: "Crit Status",
    description: "Read Crit review status as JSON.",
    promptSnippet: "Use crit_status to inspect the active Crit review file and comment counts.",
    parameters: Type.Object({}),
    async execute() {
      const status = await runCritStatus(executor, options.binary, options.cwd());
      return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }], details: status };
    },
  });

  pi.registerTool({
    name: "crit_reply",
    label: "Crit Reply",
    description: "Submit bulk Crit replies or comments through crit comment --json.",
    promptSnippet: "Use crit_reply to reply to Crit comments after making changes.",
    parameters: Type.Object({
      entries: Type.Array(
        Type.Object({
          reply_to: Type.Optional(Type.String()),
          file: Type.Optional(Type.String()),
          path: Type.Optional(Type.String()),
          line: Type.Optional(Type.Union([Type.Number(), Type.String()])),
          end_line: Type.Optional(Type.Number()),
          body: Type.String(),
          scope: Type.Optional(Type.Union([Type.Literal("review"), Type.Literal("file"), Type.Literal("line")])),
          resolve: Type.Optional(Type.Boolean()),
        }),
      ),
    }),
    async execute(_toolCallId, params) {
      const stdout = await submitCritReplies(executor, options.binary, options.cwd(), options.author, params.entries);
      return { content: [{ type: "text", text: stdout || "Crit replies submitted." }], details: { stdout } };
    },
  });

  pi.registerTool({
    name: "crit_run",
    label: "Crit Run",
    description: "Start a Crit review when explicitly requested by the user.",
    promptSnippet: "Use crit_run only when the user explicitly asks to start a Crit review.",
    parameters: Type.Object({ args: Type.Optional(Type.Array(Type.String())) }),
    async execute(_toolCallId, params) {
      if (!options.runCrit) throw new Error("crit_run is not available in this session");
      const result = await options.runCrit(params.args ?? []);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
    },
  });
}

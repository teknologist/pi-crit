import { spawn } from "node:child_process";
import { parseCritOutput } from "./crit-parser.js";
import type { CritRunResult } from "./types.js";

export class CritRunner {
  #active = false;
  #binary: string;

  constructor(options: { binary: string }) {
    this.#binary = options.binary;
  }

  get active(): boolean {
    return this.#active;
  }

  async run(args: string[], cwd: string): Promise<CritRunResult> {
    if (this.#active) throw new Error("Crit run already active");
    this.#active = true;

    try {
      const result = await spawnCrit(this.#binary, args, cwd);
      const parsed = parseCritOutput(`${result.stdout}\n${result.stderr}`);
      return { ...result, ...parsed };
    } finally {
      this.#active = false;
    }
  }
}

function spawnCrit(binary: string, args: string[], cwd: string): Promise<Pick<CritRunResult, "exitCode" | "stdout" | "stderr">> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const stdout: string[] = [];
    const stderr: string[] = [];

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => stdout.push(chunk));
    child.stderr.on("data", (chunk: string) => stderr.push(chunk));
    child.on("error", (error) => reject(new Error(`Failed to start crit: ${error.message}`)));
    child.on("close", (code, signal) => {
      const stderrText = stderr.join("");
      const signalDiagnostic = signal ? `crit terminated by signal ${signal}\n` : "";
      resolve({ exitCode: code ?? (signal ? 1 : 0), stdout: stdout.join(""), stderr: `${stderrText}${signalDiagnostic}` });
    });
  });
}

type Env = Record<string, string | undefined>;

const NON_REVIEW_SUBCOMMANDS = new Set([
  "auth",
  "check",
  "cleanup",
  "comment",
  "config",
  "fetch",
  "help",
  "install",
  "plan",
  "pull",
  "push",
  "share",
  "status",
  "stop",
  "unpublish",
]);

export type CritRunEnvironment = {
  headless: boolean;
  ssh: boolean;
  noOpenAdded: boolean;
};

export function prepareCritArgs(args: string[], env: Env = process.env): { args: string[]; environment: CritRunEnvironment } {
  const environment = detectCritRunEnvironment(args, env);
  if (!environment.noOpenAdded) return { args, environment };
  return { args: ["--no-open", ...args], environment };
}

export function detectCritRunEnvironment(args: string[], env: Env = process.env): CritRunEnvironment {
  const ssh = isSshSession(env);
  const headless = ssh || isHeadlessUnix(env);
  const shouldAddNoOpen = headless && !hasNoOpen(args) && isReviewInvocation(args);

  return {
    headless,
    ssh,
    noOpenAdded: shouldAddNoOpen,
  };
}

export function isCritReviewInvocation(args: string[]): boolean {
  return isReviewInvocation(args);
}

export function extractLocalCritUrl(message: string): string | undefined {
  const match = message.match(/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d+\b/i);
  return match?.[0];
}

export function formatHeadlessCritGuidance(url: string, env: Env = process.env): string {
  const port = new URL(url).port;
  const user = env.USER || env.LOGNAME || "user";
  const host = env.HOSTNAME || "remote-host";
  return [
    `Open Crit from your local browser: ${url}`,
    `If this Pi session is remote over SSH, run this on your local machine: ssh -L ${port}:127.0.0.1:${port} ${user}@${host}`,
    `Then open ${url} locally and click Finished when done.`,
  ].join("\n");
}

function isSshSession(env: Env): boolean {
  return Boolean(env.SSH_CONNECTION || env.SSH_CLIENT || env.SSH_TTY);
}

function isHeadlessUnix(env: Env): boolean {
  if (env.CI) return true;
  if (process.platform === "darwin" || process.platform === "win32") return false;
  return !env.DISPLAY && !env.WAYLAND_DISPLAY;
}

function hasNoOpen(args: string[]): boolean {
  return args.includes("--no-open");
}

function isReviewInvocation(args: string[]): boolean {
  const firstNonOption = args.find((arg) => !arg.startsWith("-"));
  return !firstNonOption || !NON_REVIEW_SUBCOMMANDS.has(firstNonOption);
}

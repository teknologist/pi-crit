export const DEFAULT_MAX_INJECTED_CHARS = 12_000;

export type CritSettings = {
  maxInjectedChars: number;
  binary: string;
  replyAuthor: string;
};

export type CritReply = {
  id?: string;
  body: string;
  author?: string;
};

export type CritRawComment = {
  id?: string;
  body?: string;
  scope?: "review" | "file" | "line" | string;
  author?: string;
  resolved?: boolean;
  replies?: CritReply[];
  start_line?: number;
  end_line?: number;
  quote?: string;
  anchor?: string;
  drifted?: boolean;
};

export type CritReviewFile = {
  review_comments?: CritRawComment[];
  files?: Record<string, { comments?: CritRawComment[] }>;
};

export type CritComment = {
  id: string;
  scope: "review" | "file" | "line";
  file?: string;
  startLine?: number;
  endLine?: number;
  body: string;
  author?: string;
  resolved: boolean;
  replies: CritReply[];
  quote?: string;
  anchor?: string;
  drifted: boolean;
};

export type CritReviewSummary = {
  reviewPath: string;
  nextCommand?: string;
  approved?: boolean;
  comments: CritComment[];
};

export type CritRunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  reviewPath?: string;
  nextCommand?: string;
  approved?: boolean;
};

export type CritExtensionState = {
  activeRun: boolean;
  activeCommand?: string[];
  reviewPath?: string;
  nextCommand?: string;
  summary?: CritReviewSummary;
  injectedReviewPath?: string;
  lastError?: string;
};

/** Supported CI hosts. */
export type ProviderName = "gitlab" | "github";

/** Options passed to {@linkcode dashboard} from a generated `main.tsx`. */
export interface DashboardConfig {
  /** Persist fetched runs in local Deno KV. Default: false. */
  history?: boolean;
  /** Only show pipelines triggered by the token owner. Default: true. */
  mineOnly?: boolean;
  /**
   * Extra project paths to include for every author
   * (GitLab `group/project`, GitHub `owner/repo`).
   */
  extraProjects?: string[];
  /** How far back to query the API on each load. Default: 48. */
  lookbackHours?: number;
  /** Listen port. Default: 8787. */
  port?: number;
  /** Listen hostname. Default: 127.0.0.1. */
  hostname?: string;
  /**
   * Force a provider. If omitted, inferred from env
   * (`GITLAB_TOKEN` vs `GITHUB_TOKEN`, or `PIPELINE_PROVIDER`).
   */
  provider?: ProviderName;
  /** Serve built-in sample data. For UI development only. */
  fixture?: boolean;
}

/** Normalized pipeline / workflow status. */
export type RunStatus =
  | "created"
  | "waiting_for_resource"
  | "preparing"
  | "waiting_for_callback"
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "canceling"
  | "canceled"
  | "skipped"
  | "manual"
  | "scheduled"
  | "unknown";

/** One pipeline or workflow run, provider-agnostic. */
export interface PipelineRun {
  provider: ProviderName;
  projectId: string;
  projectPath: string;
  pipelineId: string;
  name: string;
  status: RunStatus;
  ref: string;
  sha: string;
  user: string;
  webUrl: string;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string | null;
}

/** One job inside a run. */
export interface Job {
  id: string;
  name: string;
  status: RunStatus;
  stage: string;
  webUrl?: string;
}

/** Authenticated identity for the header. */
export interface Actor {
  username: string;
  name: string;
}

export interface ListRunsOptions {
  mineOnly: boolean;
  extraProjects: string[];
  since: Date;
}

/** CI host adapter. */
export interface Provider {
  readonly name: ProviderName;
  currentUser(): Promise<Actor>;
  listRuns(options: ListRunsOptions): Promise<PipelineRun[]>;
  getRun(projectId: string, pipelineId: string): Promise<PipelineRun>;
  getJobs(projectId: string, pipelineId: string): Promise<Job[]>;
  getLog(projectId: string, jobId: string): Promise<string>;
}

export const TERMINAL_STATUSES: ReadonlySet<RunStatus> = new Set([
  "success",
  "failed",
  "canceled",
  "skipped",
]);

export const isTerminal = (status: RunStatus): boolean => TERMINAL_STATUSES.has(status);

export const runKey = (
  provider: ProviderName,
  projectId: string,
  pipelineId: string,
): [string, string, string, string] => ["runs", provider, projectId, pipelineId];

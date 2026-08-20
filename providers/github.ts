import type { Actor, Job, ListRunsOptions, PipelineRun, Provider } from "../types.ts";

/** Thrown until the GitHub Actions provider is implemented. */
export class GitHubNotImplementedError extends Error {
  constructor() {
    super(
      "GitHub Actions is not implemented yet. Use GitLab, or wait for the next release.",
    );
    this.name = "GitHubNotImplementedError";
  }
}

export class GitHubProvider implements Provider {
  readonly name = "github" as const;

  currentUser = (): Promise<Actor> => Promise.reject(new GitHubNotImplementedError());

  listRuns = (_options: ListRunsOptions): Promise<PipelineRun[]> =>
    Promise.reject(new GitHubNotImplementedError());

  getRun = (_projectId: string, _pipelineId: string): Promise<PipelineRun> =>
    Promise.reject(new GitHubNotImplementedError());

  getJobs = (_projectId: string, _pipelineId: string): Promise<Job[]> =>
    Promise.reject(new GitHubNotImplementedError());

  getLog = (_projectId: string, _jobId: string): Promise<string> =>
    Promise.reject(new GitHubNotImplementedError());
}

export const githubFromEnv = (): GitHubProvider => {
  const token = Deno.env.get("GITHUB_TOKEN")?.trim();
  if (!token) {
    throw new Error("GITHUB_TOKEN is not set. Put it in .env and restart.");
  }
  return new GitHubProvider();
};

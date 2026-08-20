import type { Actor, Job, ListRunsOptions, PipelineRun, Provider } from "../types.ts";

const NOW = Date.now();

const ago = (hours: number): string => new Date(NOW - hours * 3600_000).toISOString();

const RUNS: PipelineRun[] = [
  {
    provider: "gitlab",
    projectId: "11",
    projectPath: "acme/payments",
    pipelineId: "9001",
    name: "merge-request",
    status: "failed",
    ref: "fix/retry-webhooks",
    sha: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f67890",
    user: "you",
    webUrl: "https://gitlab.example/acme/payments/-/pipelines/9001",
    createdAt: ago(1.2),
    updatedAt: ago(0.4),
    finishedAt: ago(0.4),
  },
  {
    provider: "gitlab",
    projectId: "12",
    projectPath: "acme/api",
    pipelineId: "9002",
    name: "Build pipeline",
    status: "running",
    ref: "main",
    sha: "1111111111111111111111111111111111111111",
    user: "you",
    webUrl: "https://gitlab.example/acme/api/-/pipelines/9002",
    createdAt: ago(0.3),
    updatedAt: ago(0.05),
    finishedAt: null,
  },
  {
    provider: "gitlab",
    projectId: "13",
    projectPath: "acme/web",
    pipelineId: "9003",
    name: "deploy",
    status: "success",
    ref: "main",
    sha: "2222222222222222222222222222222222222222",
    user: "you",
    webUrl: "https://gitlab.example/acme/web/-/pipelines/9003",
    createdAt: ago(5),
    updatedAt: ago(4.2),
    finishedAt: ago(4.2),
  },
  {
    provider: "gitlab",
    projectId: "14",
    projectPath: "acme/infra",
    pipelineId: "9004",
    name: "nightly",
    status: "pending",
    ref: "main",
    sha: "3333333333333333333333333333333333333333",
    user: "teammate",
    webUrl: "https://gitlab.example/acme/infra/-/pipelines/9004",
    createdAt: ago(0.1),
    updatedAt: ago(0.1),
    finishedAt: null,
  },
  {
    provider: "gitlab",
    projectId: "11",
    projectPath: "acme/payments",
    pipelineId: "8890",
    name: "main",
    status: "success",
    ref: "main",
    sha: "4444444444444444444444444444444444444444",
    user: "you",
    webUrl: "https://gitlab.example/acme/payments/-/pipelines/8890",
    createdAt: ago(20),
    updatedAt: ago(19),
    finishedAt: ago(19),
  },
];

const JOBS: Record<string, Job[]> = {
  "11:9001": [
    { id: "1", name: "lint", status: "success", stage: "test" },
    { id: "2", name: "test", status: "failed", stage: "test" },
  ],
  "12:9002": [
    { id: "3", name: "build", status: "success", stage: "build" },
    { id: "4", name: "integration", status: "running", stage: "test" },
  ],
};

const LOGS: Record<string, string> = {
  "11:1": "lint passed\n",
  "11:2":
    "FAIL src/webhooks_test.ts\nAssertionError: expected 200, got 500\n    at assertEquals (assert.ts:10:9)\n",
  "12:3": "compiled 42 modules\n",
  "12:4": "running suite…\n",
};

export class FixtureProvider implements Provider {
  readonly name = "gitlab" as const;

  currentUser = (): Promise<Actor> => Promise.resolve({ username: "you", name: "Local Demo" });

  listRuns = (_options: ListRunsOptions): Promise<PipelineRun[]> => Promise.resolve(RUNS);

  getRun = (projectId: string, pipelineId: string): Promise<PipelineRun> => {
    const run = RUNS.find((r) => r.projectId === projectId && r.pipelineId === pipelineId);
    if (!run) return Promise.reject(new Error("Run not found"));
    return Promise.resolve(run);
  };

  getJobs = (projectId: string, pipelineId: string): Promise<Job[]> =>
    Promise.resolve(JOBS[`${projectId}:${pipelineId}`] ?? []);

  getLog = (projectId: string, jobId: string): Promise<string> =>
    Promise.resolve(LOGS[`${projectId}:${jobId}`] ?? "(no log)");
}

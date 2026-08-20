import type { Actor, Job, ListRunsOptions, PipelineRun, Provider, RunStatus } from "../types.ts";
import {
  fetchJson,
  fetchText,
  mapPool,
  normalizeBaseUrl,
  paginate,
  ProviderApiError,
} from "./http.ts";

export interface GitLabAuth {
  baseUrl: string;
  token: string;
}

interface GitLabUser {
  username: string;
  name: string;
}

interface GitLabProject {
  id: number;
  path_with_namespace: string;
}

interface GitLabPipeline {
  id: number;
  project_id: number;
  name?: string | null;
  status: string;
  ref: string;
  sha: string;
  web_url: string;
  created_at: string;
  updated_at: string;
  finished_at?: string | null;
  user?: { username?: string };
}

interface GitLabJob {
  id: number;
  name: string;
  status: string;
  stage: string;
  web_url?: string;
}

const gitlabHeaders = (token: string): HeadersInit => {
  return {
    "PRIVATE-TOKEN": token,
    "Accept": "application/json",
  };
};

const asStatus = (raw: string): RunStatus => {
  const known: RunStatus[] = [
    "created",
    "waiting_for_resource",
    "preparing",
    "waiting_for_callback",
    "pending",
    "running",
    "success",
    "failed",
    "canceling",
    "canceled",
    "skipped",
    "manual",
    "scheduled",
  ];
  return (known as string[]).includes(raw) ? raw as RunStatus : "unknown";
};

const toRun = (projectPath: string, pipeline: GitLabPipeline): PipelineRun => {
  return {
    provider: "gitlab",
    projectId: String(pipeline.project_id),
    projectPath,
    pipelineId: String(pipeline.id),
    name: pipeline.name?.trim() || "Pipeline",
    status: asStatus(pipeline.status),
    ref: pipeline.ref,
    sha: pipeline.sha,
    user: pipeline.user?.username ?? "",
    webUrl: pipeline.web_url,
    createdAt: pipeline.created_at,
    updatedAt: pipeline.updated_at,
    finishedAt: pipeline.finished_at ?? null,
  };
};

export class GitLabProvider implements Provider {
  readonly name = "gitlab" as const;
  readonly baseUrl: string;
  #headers: HeadersInit;
  #projectPaths = new Map<string, string>();

  constructor(auth: GitLabAuth) {
    this.baseUrl = normalizeBaseUrl(auth.baseUrl);
    this.#headers = gitlabHeaders(auth.token);
  }

  #api = (path: string, query?: Record<string, string | undefined>): string => {
    const url = new URL(`${this.baseUrl}/api/v4${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== "") {
          url.searchParams.set(key, value);
        }
      }
    }
    return url.toString();
  };

  currentUser = async (): Promise<Actor> => {
    const { data } = await fetchJson<GitLabUser>(
      this.#api("/user"),
      this.#headers,
    );
    return { username: data.username, name: data.name };
  };

  listRuns = async (options: ListRunsOptions): Promise<PipelineRun[]> => {
    const me = await this.currentUser();
    const projects = await this.#collectProjects(options.extraProjects);
    const since = options.since.toISOString();
    const extra = new Set(
      options.extraProjects.map((p) => p.trim().replace(/^\/+|\/+$/g, "")),
    );

    const nested = await mapPool(projects, 5, async (project) => {
      const optedIn = extra.has(project.path_with_namespace);
      const username = options.mineOnly && !optedIn ? me.username : undefined;
      try {
        const pipelines = await paginate<GitLabPipeline>(
          this.#api(`/projects/${project.id}/pipelines`, {
            username,
            updated_after: since,
            order_by: "updated_at",
            sort: "desc",
            per_page: "50",
          }),
          this.#headers,
          4,
        );
        this.#projectPaths.set(String(project.id), project.path_with_namespace);
        return pipelines.map((p) =>
          toRun(project.path_with_namespace, {
            ...p,
            project_id: p.project_id ?? project.id,
          })
        );
      } catch (error) {
        if (error instanceof ProviderApiError && error.status === 403) {
          return [] as PipelineRun[];
        }
        throw error;
      }
    });

    return nested.flat();
  };

  getRun = async (projectId: string, pipelineId: string): Promise<PipelineRun> => {
    const { data } = await fetchJson<GitLabPipeline>(
      this.#api(`/projects/${encodeURIComponent(projectId)}/pipelines/${pipelineId}`),
      this.#headers,
    );
    const path = this.#projectPaths.get(String(data.project_id)) ??
      await this.#projectPath(String(data.project_id));
    return toRun(path, data);
  };

  getJobs = async (projectId: string, pipelineId: string): Promise<Job[]> => {
    const jobs = await paginate<GitLabJob>(
      this.#api(
        `/projects/${encodeURIComponent(projectId)}/pipelines/${pipelineId}/jobs`,
        { per_page: "100" },
      ),
      this.#headers,
      5,
    );
    return jobs.map((job) => ({
      id: String(job.id),
      name: job.name,
      status: asStatus(job.status),
      stage: job.stage,
      webUrl: job.web_url,
    }));
  };

  getLog = async (projectId: string, jobId: string): Promise<string> => {
    const text = await fetchText(
      this.#api(
        `/projects/${encodeURIComponent(projectId)}/jobs/${jobId}/trace`,
      ),
      this.#headers,
    );
    if (text.length > 1_000_000) {
      return text.slice(-1_000_000);
    }
    return text;
  };

  #collectProjects = async (extraProjects: string[]): Promise<GitLabProject[]> => {
    const membership = await paginate<GitLabProject>(
      this.#api("/projects", {
        membership: "true",
        simple: "true",
        archived: "false",
        per_page: "100",
      }),
      this.#headers,
      10,
    );

    const byId = new Map<number, GitLabProject>();
    for (const project of membership) {
      byId.set(project.id, project);
      this.#projectPaths.set(String(project.id), project.path_with_namespace);
    }

    for (const path of extraProjects) {
      const trimmed = path.trim().replace(/^\/+|\/+$/g, "");
      if (!trimmed) continue;
      if ([...byId.values()].some((p) => p.path_with_namespace === trimmed)) {
        continue;
      }
      try {
        const { data } = await fetchJson<GitLabProject>(
          this.#api(`/projects/${encodeURIComponent(trimmed)}`),
          this.#headers,
        );
        byId.set(data.id, data);
        this.#projectPaths.set(String(data.id), data.path_with_namespace);
      } catch (error) {
        if (error instanceof ProviderApiError && (error.status === 404 || error.status === 403)) {
          continue;
        }
        throw error;
      }
    }

    return [...byId.values()];
  };

  #projectPath = async (projectId: string): Promise<string> => {
    const { data } = await fetchJson<GitLabProject>(
      this.#api(`/projects/${encodeURIComponent(projectId)}`),
      this.#headers,
    );
    this.#projectPaths.set(String(data.id), data.path_with_namespace);
    return data.path_with_namespace;
  };
}

export const gitlabFromEnv = (): GitLabProvider => {
  const token = Deno.env.get("GITLAB_TOKEN")?.trim();
  if (!token) {
    throw new Error("GITLAB_TOKEN is not set. Put it in .env and restart.");
  }
  const baseUrl = Deno.env.get("GITLAB_URL")?.trim() || "https://gitlab.com";
  return new GitLabProvider({ baseUrl, token });
};

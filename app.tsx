/**
 * Local GitHub / GitLab pipeline dashboard for Deno.
 *
 * @module
 * @example
 * ```ts
 * import { dashboard } from "@hmalinchock/pipeline-dashboard";
 *
 * dashboard({
 *   history: true,
 *   mineOnly: true,
 *   extraProjects: ["group/other-repo"],
 *   lookbackHours: 48,
 * });
 * ```
 */

import { renderToString } from "preact-render-to-string";
import type { VNode } from "preact";
import type { Actor, DashboardConfig, PipelineRun, Provider, ProviderName } from "./types.ts";
import { mergeAndStore, sortRuns } from "./store.ts";
import { gitlabFromEnv, GitLabProvider } from "./providers/gitlab.ts";
import { githubFromEnv, GitHubNotImplementedError } from "./providers/github.ts";
import { FixtureProvider } from "./providers/fixture.ts";
import { ProviderApiError } from "./providers/http.ts";
import { Board } from "./ui/board.tsx";
import { MessagePage, RunPage } from "./ui/run.tsx";
import stylesCss from "./ui/styles.css" with { type: "text" };

export type { DashboardConfig, PipelineRun, ProviderName } from "./types.ts";

export interface ResolvedConfig {
  history: boolean;
  mineOnly: boolean;
  extraProjects: string[];
  lookbackHours: number;
  port: number;
  hostname: string;
  provider: ProviderName;
  fixture: boolean;
}

const DEFAULT_LOOKBACK = 48;
const DETAIL = new URLPattern({
  pathname: "/pipelines/:provider/:project/:id",
});

const html = (node: VNode, status = 200): Response => {
  const body = `<!DOCTYPE html>${renderToString(node)}`;
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
};

const cssResponse = (): Response => {
  return new Response(stylesCss, {
    headers: {
      "content-type": "text/css; charset=utf-8",
      "cache-control": "no-cache",
    },
  });
};

/** Directory of the generated `main.tsx` (or demo entry), not this library file. */
const projectDir = (): string => {
  return decodeURIComponent(new URL(".", Deno.mainModule).pathname).replace(/\/$/, "");
};

/** Local KV file. Init creates `data/`; runtime only needs write access there. */
export const historyPath = (): string => {
  return `${projectDir()}/data/history`;
};

const openHistory = async (): Promise<Deno.Kv> => {
  const path = historyPath();
  const dir = `${projectDir()}/data`;
  try {
    await Deno.mkdir(dir, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) {
      throw new Error(
        `Cannot create ${dir}. Init creates data/; runtime is limited to --allow-write=data.`,
        { cause: error },
      );
    }
  }
  return await Deno.openKv(path);
};

const envGet = (name: string): string | undefined => {
  try {
    const value = Deno.env.get(name)?.trim();
    return value || undefined;
  } catch (error) {
    if (error instanceof Deno.errors.NotCapable) return undefined;
    throw error;
  }
};

export const resolveConfig = (config: DashboardConfig = {}): ResolvedConfig => {
  const envProvider = envGet("PIPELINE_PROVIDER")?.toLowerCase();
  let provider = config.provider;
  if (!provider) {
    if (envProvider === "gitlab" || envProvider === "github") {
      provider = envProvider;
    } else if (envGet("GITLAB_TOKEN")) {
      provider = "gitlab";
    } else if (envGet("GITHUB_TOKEN")) {
      provider = "github";
    } else {
      provider = "gitlab";
    }
  }

  const lookbackFromEnv = Number(envGet("PIPELINE_LOOKBACK_HOURS"));

  return {
    history: config.history ?? false,
    mineOnly: config.mineOnly ?? true,
    extraProjects: (config.extraProjects ?? []).map((p) => p.trim()).filter(Boolean),
    lookbackHours: Number.isFinite(config.lookbackHours)
      ? config.lookbackHours as number
      : Number.isFinite(lookbackFromEnv)
      ? lookbackFromEnv
      : DEFAULT_LOOKBACK,
    port: config.port ?? 8787,
    hostname: config.hostname ?? "127.0.0.1",
    provider,
    fixture: config.fixture === true || envGet("PIPELINE_DASHBOARD_FIXTURE") === "1",
  };
};

export const createProvider = (config: ResolvedConfig): Provider => {
  if (config.fixture) return new FixtureProvider();
  if (config.provider === "github") return githubFromEnv();
  return gitlabFromEnv();
};

const baseLabel = (provider: Provider): string => {
  if (provider instanceof GitLabProvider) return provider.baseUrl.replace(/^https?:\/\//, "");
  if (provider.name === "github") return "github.com";
  return provider.name;
};

const loadRuns = async (
  provider: Provider,
  kv: Deno.Kv | null,
  config: ResolvedConfig,
): Promise<PipelineRun[]> => {
  const since = new Date(Date.now() - config.lookbackHours * 3600_000);
  const incoming = await provider.listRuns({
    mineOnly: config.mineOnly,
    extraProjects: config.extraProjects,
    since,
  });
  if (!kv) return sortRuns(incoming);
  const merged = await mergeAndStore(kv, incoming);
  return sortRuns(merged);
};

/**
 * Start the local dashboard server.
 *
 * Reads `GITLAB_TOKEN` / `GITLAB_URL` or `GITHUB_TOKEN` from the environment.
 */
export const dashboard = async (config: DashboardConfig = {}): Promise<void> => {
  const resolved = resolveConfig(config);
  const kv = resolved.history ? await openHistory() : null;

  let provider: Provider;
  try {
    provider = createProvider(resolved);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    Deno.serve({ port: resolved.port, hostname: resolved.hostname }, (req) => {
      const url = new URL(req.url);
      if (url.pathname === "/styles.css") {
        return cssResponse();
      }
      return html(
        MessagePage({
          title: "Missing configuration",
          body: message,
          isError: true,
        }),
        500,
      );
    });
    return;
  }

  const server = Deno.serve(
    { port: resolved.port, hostname: resolved.hostname },
    async (req) => {
      const url = new URL(req.url);
      try {
        if (url.pathname === "/styles.css") {
          return cssResponse();
        }

        if (url.pathname === "/") {
          return await renderBoard(provider, kv, resolved, url);
        }

        const detail = DETAIL.exec(url);
        if (detail) {
          const { provider: p, project, id } = detail.pathname.groups;
          if (!p || !project || !id) {
            return html(MessagePage({ title: "Not found", body: "Bad path.", isError: true }), 404);
          }
          return await renderDetail(provider, kv, p, decodeURIComponent(project), id);
        }

        return html(MessagePage({ title: "Not found", body: "No page here.", isError: true }), 404);
      } catch (error) {
        if (error instanceof GitHubNotImplementedError) {
          return html(
            MessagePage({
              title: "GitHub is next",
              body: error.message,
            }),
          );
        }
        const message = error instanceof ProviderApiError
          ? error.message
          : error instanceof Error
          ? error.message
          : String(error);
        console.error(error);
        return html(
          MessagePage({ title: "Could not load pipelines", body: message, isError: true }),
          error instanceof ProviderApiError ? error.status : 500,
        );
      }
    },
  );

  console.log(
    `Pipeline dashboard on http://${resolved.hostname}:${resolved.port} (${resolved.provider}${
      resolved.history ? ", history on" : ""
    }${resolved.fixture ? ", fixture" : ""})`,
  );

  await server.finished;
};

const renderBoard = async (
  provider: Provider,
  kv: Deno.Kv | null,
  config: ResolvedConfig,
  url: URL,
): Promise<Response> => {
  let actor: Actor | null = null;
  try {
    actor = await provider.currentUser();
  } catch {
    actor = null;
  }

  const runs = await loadRuns(provider, kv, config);
  return html(
    Board({
      actor,
      provider: provider.name,
      baseLabel: baseLabel(provider),
      fetchedAt: new Date().toISOString(),
      lookbackHours: config.lookbackHours,
      history: config.history,
      mineOnly: config.mineOnly,
      statusFilter: url.searchParams.get("status") ?? "",
      projectFilter: url.searchParams.get("project") ?? "",
      runs,
    }),
  );
};

const renderDetail = async (
  provider: Provider,
  kv: Deno.Kv | null,
  providerName: string,
  projectId: string,
  pipelineId: string,
): Promise<Response> => {
  if (providerName !== provider.name) {
    return html(
      MessagePage({
        title: "Wrong provider",
        body: `This board is running ${provider.name}.`,
        isError: true,
      }),
      404,
    );
  }

  let actor: Actor | null = null;
  try {
    actor = await provider.currentUser();
  } catch {
    actor = null;
  }

  let run: PipelineRun;
  try {
    run = await provider.getRun(projectId, pipelineId);
  } catch (error) {
    if (kv) {
      const stored = await kv.get<PipelineRun>(["runs", provider.name, projectId, pipelineId]);
      if (stored.value) {
        run = stored.value;
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }

  const jobs = await provider.getJobs(projectId, pipelineId);
  const withLogs = await Promise.all(
    jobs.map(async (job) => {
      let log = "";
      try {
        log = await provider.getLog(projectId, job.id);
      } catch (error) {
        log = error instanceof Error
          ? `(could not load log: ${error.message})`
          : "(could not load log)";
      }
      return { ...job, log };
    }),
  );

  return html(RunPage({ actor, run, jobs: withLogs }));
};

export default dashboard;

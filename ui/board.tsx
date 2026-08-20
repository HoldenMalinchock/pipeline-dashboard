import type { Actor, PipelineRun, ProviderName } from "../types.ts";
import { countByStatus } from "../store.ts";
import { Layout, StatusPill } from "./layout.tsx";
import { relativeTime, shortSha } from "./time.ts";

export interface BoardProps {
  actor: Actor | null;
  provider: ProviderName;
  baseLabel: string;
  fetchedAt: string;
  lookbackHours: number;
  history: boolean;
  mineOnly: boolean;
  statusFilter: string;
  projectFilter: string;
  runs: PipelineRun[];
  warning?: string;
}

const FILTERS = [
  { id: "", label: "All" },
  { id: "failed", label: "Failed" },
  { id: "running", label: "Running" },
  { id: "success", label: "Passed" },
  { id: "pending", label: "Waiting" },
];

const href = (status: string, project: string): string => {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (project) params.set("project", project);
  const q = params.toString();
  return q ? `/?${q}` : "/";
};

const matches = (run: PipelineRun, status: string, project: string): boolean => {
  if (project && !run.projectPath.toLowerCase().includes(project.toLowerCase())) {
    return false;
  }
  if (!status) return true;
  if (status === "running") return run.status === "running" || run.status === "canceling";
  if (status === "pending") {
    return ["pending", "created", "preparing", "waiting_for_resource", "waiting_for_callback"]
      .includes(run.status);
  }
  return run.status === status;
};

export const Board = (props: BoardProps) => {
  const visible = props.runs.filter((run) => matches(run, props.statusFilter, props.projectFilter));
  const counts = countByStatus(props.runs);
  const inFlight = counts.running > 0 || counts.pending > 0;
  const projects = [...new Set(props.runs.map((r) => r.projectPath))].sort();

  return (
    <Layout
      title="Pipelines"
      autoRefresh={inFlight}
    >
      <header class="top">
        <div class="brand">
          <div class="mark">
            <span class="mark-dot" />
            Pipelines
          </div>
          <div class="sub">
            {props.actor
              ? (
                <>
                  <strong>{props.actor.name}</strong> @{props.actor.username} · {props.baseLabel}
                  {props.mineOnly ? " · your runs" : " · all visible runs"}
                  {props.history ? " · history on" : ""}
                </>
              )
              : <>Local dashboard</>}
          </div>
        </div>
        <div class="actions">
          <span class="sub">Last fetch {relativeTime(props.fetchedAt)}</span>
          <a class="btn" href={href(props.statusFilter, props.projectFilter)}>Refresh</a>
        </div>
      </header>

      {props.warning ? <div class="banner">{props.warning}</div> : null}

      <div class="chips">
        <span class="chip">
          Running <b>{counts.running}</b>
        </span>
        <span class="chip">
          Failed <b>{counts.failed}</b>
        </span>
        <span class="chip">
          Passed <b>{counts.success}</b>
        </span>
        <span class="chip">
          Waiting <b>{counts.pending}</b>
        </span>
        <span class="chip">
          Window <b>{props.lookbackHours}h</b>
        </span>
        <span class="chip">
          Shown <b>{visible.length}</b>
        </span>
      </div>

      <nav class="filters">
        {FILTERS.map((filter) => (
          <a
            class={`filter${props.statusFilter === filter.id ? " active" : ""}`}
            href={href(filter.id, props.projectFilter)}
          >
            {filter.label}
          </a>
        ))}
      </nav>

      {projects.length > 1
        ? (
          <nav class="filters">
            <a
              class={`filter${props.projectFilter === "" ? " active" : ""}`}
              href={href(props.statusFilter, "")}
            >
              Every project
            </a>
            {projects.map((project) => (
              <a
                class={`filter${props.projectFilter === project ? " active" : ""}`}
                href={href(props.statusFilter, project)}
              >
                {project}
              </a>
            ))}
          </nav>
        )
        : null}

      <div class="panel">
        {visible.length === 0
          ? (
            <div class="empty">
              No pipelines in the last {props.lookbackHours} hours
              {props.history ? " (and nothing stored yet)" : ""}.
            </div>
          )
          : (
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Project</th>
                  <th>Ref</th>
                  <th class="hide-sm">Who</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((run) => (
                  <tr>
                    <td>
                      <StatusPill status={run.status} />
                    </td>
                    <td>
                      <div class="proj">
                        <a
                          href={`/pipelines/${run.provider}/${
                            encodeURIComponent(run.projectId)
                          }/${run.pipelineId}`}
                        >
                          {run.projectPath}
                        </a>
                        <small>{run.name}</small>
                      </div>
                    </td>
                    <td>
                      <div class="ref">{run.ref}</div>
                      <div class="sha">{shortSha(run.sha)}</div>
                    </td>
                    <td class="hide-sm">
                      <div class="who">{run.user || "—"}</div>
                    </td>
                    <td>
                      <div class="when">{relativeTime(run.updatedAt)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </Layout>
  );
};

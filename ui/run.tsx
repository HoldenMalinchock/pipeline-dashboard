import type { Actor, Job, PipelineRun } from "../types.ts";
import { Layout, StatusPill } from "./layout.tsx";
import { relativeTime, shortSha } from "./time.ts";

export interface RunPageProps {
  actor: Actor | null;
  run: PipelineRun;
  jobs: Array<Job & { log: string }>;
}

export const RunPage = (props: RunPageProps) => {
  const inFlight = props.jobs.some((job) =>
    job.status === "running" || job.status === "pending" || job.status === "created"
  );

  return (
    <Layout title={`${props.run.projectPath} · ${props.run.pipelineId}`} autoRefresh={inFlight}>
      <div class="crumb">
        <a href="/">Pipelines</a>
        <span>/</span>
        <span>{props.run.projectPath}</span>
        <span>/</span>
        <span>{props.run.pipelineId}</span>
      </div>

      <header class="top">
        <div class="brand">
          <div class="mark">
            <span class="mark-dot" />
            {props.run.name}
          </div>
          <div class="sub">
            {props.run.projectPath}
            {props.actor ? ` · @${props.actor.username}` : ""}
          </div>
        </div>
        <div class="actions">
          <StatusPill status={props.run.status} />
          <a class="btn ext" href={props.run.webUrl} target="_blank" rel="noreferrer">
            Open in {props.run.provider === "gitlab" ? "GitLab" : "GitHub"}
          </a>
        </div>
      </header>

      <dl class="meta">
        <div>
          <dt>Ref</dt>
          <dd class="ref">{props.run.ref}</dd>
        </div>
        <div>
          <dt>SHA</dt>
          <dd class="sha">{shortSha(props.run.sha)}</dd>
        </div>
        <div>
          <dt>Triggered by</dt>
          <dd>{props.run.user || "—"}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{relativeTime(props.run.updatedAt)}</dd>
        </div>
      </dl>

      {props.jobs.length === 0
        ? <div class="empty">No jobs on this pipeline yet.</div>
        : props.jobs.map((job) => (
          <section class="job">
            <div class="job-head">
              <span>
                {job.stage} / {job.name}
              </span>
              <StatusPill status={job.status} />
            </div>
            <pre class="log">{job.log || "(empty log)"}</pre>
          </section>
        ))}
    </Layout>
  );
};

export const MessagePage = (props: { title: string; body: string; isError?: boolean }) => {
  return (
    <Layout title={props.title}>
      <header class="top">
        <div class="brand">
          <div class="mark">
            <span class="mark-dot" />
            Pipelines
          </div>
        </div>
      </header>
      <div class={props.isError ? "error" : "banner"}>
        <p>
          <strong>{props.title}</strong>
        </p>
        <p>{props.body}</p>
      </div>
    </Layout>
  );
};

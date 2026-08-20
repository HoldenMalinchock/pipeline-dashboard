import { isTerminal, type PipelineRun, type ProviderName, runKey } from "./types.ts";

export type RunMap = Map<string, PipelineRun>;

export const runMapKey = (run: PipelineRun): string => {
  return `${run.provider}:${run.projectId}:${run.pipelineId}`;
};

/**
 * Decide whether an incoming API record should replace a stored one.
 *
 * Completed runs are never overwritten. In-flight runs may be updated so a
 * pipeline that finishes while the app is closed does not stay "running"
 * if it is still inside the lookback window.
 */
export const shouldReplace = (
  existing: PipelineRun | undefined,
  incoming: PipelineRun,
): boolean => {
  if (!existing) return true;
  if (isTerminal(existing.status)) return false;
  return incoming.updatedAt >= existing.updatedAt ||
    incoming.status !== existing.status;
};

/** Merge API results into stored history without deleting anything. */
export const mergeRuns = (
  stored: PipelineRun[],
  incoming: PipelineRun[],
): { next: PipelineRun[]; writes: PipelineRun[] } => {
  const byKey: RunMap = new Map();
  for (const run of stored) {
    byKey.set(runMapKey(run), run);
  }

  const writes: PipelineRun[] = [];
  for (const run of incoming) {
    const key = runMapKey(run);
    const existing = byKey.get(key);
    if (shouldReplace(existing, run)) {
      byKey.set(key, run);
      writes.push(run);
    }
  }

  return { next: [...byKey.values()], writes };
};

const STATUS_RANK: Record<string, number> = {
  failed: 0,
  canceling: 1,
  running: 1,
  pending: 2,
  created: 2,
  preparing: 2,
  waiting_for_resource: 2,
  waiting_for_callback: 2,
  manual: 3,
  scheduled: 3,
  canceled: 4,
  skipped: 4,
  success: 5,
  unknown: 6,
};

export const sortRuns = (runs: PipelineRun[]): PipelineRun[] => {
  return [...runs].sort((a, b) => {
    const rank = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
    if (rank !== 0) return rank;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
};

export const countByStatus = (
  runs: PipelineRun[],
): Record<string, number> => {
  const counts: Record<string, number> = {
    running: 0,
    failed: 0,
    success: 0,
    pending: 0,
  };
  for (const run of runs) {
    if (run.status === "running" || run.status === "canceling") {
      counts.running++;
    } else if (run.status === "failed") {
      counts.failed++;
    } else if (run.status === "success") {
      counts.success++;
    } else if (
      run.status === "pending" ||
      run.status === "created" ||
      run.status === "preparing" ||
      run.status === "waiting_for_resource" ||
      run.status === "waiting_for_callback"
    ) {
      counts.pending++;
    }
  }
  return counts;
};

export const loadStoredRuns = async (kv: Deno.Kv): Promise<PipelineRun[]> => {
  const runs: PipelineRun[] = [];
  const iter = kv.list<PipelineRun>({ prefix: ["runs"] });
  for await (const entry of iter) {
    if (entry.value) runs.push(entry.value);
  }
  return runs;
};

export const persistWrites = async (
  kv: Deno.Kv,
  writes: PipelineRun[],
): Promise<void> => {
  for (const run of writes) {
    await kv.set(runKey(run.provider, run.projectId, run.pipelineId), run);
  }
};

export const loadStoredRun = async (
  kv: Deno.Kv,
  provider: ProviderName,
  projectId: string,
  pipelineId: string,
): Promise<PipelineRun | null> => {
  const result = await kv.get<PipelineRun>(
    runKey(provider, projectId, pipelineId),
  );
  return result.value;
};

/** Apply history rules: keep old rows, insert new, update in-flight only. */
export const mergeAndStore = async (
  kv: Deno.Kv,
  incoming: PipelineRun[],
): Promise<PipelineRun[]> => {
  const stored = await loadStoredRuns(kv);
  const { next, writes } = mergeRuns(stored, incoming);
  await persistWrites(kv, writes);
  return next;
};

import { assertEquals } from "@std/assert";
import { mergeRuns, shouldReplace, sortRuns } from "./store.ts";
import type { PipelineRun } from "./types.ts";

const run = (partial: Partial<PipelineRun>): PipelineRun => {
  return {
    provider: "gitlab",
    projectId: "1",
    projectPath: "acme/api",
    pipelineId: "10",
    name: "main",
    status: "success",
    ref: "main",
    sha: "abc",
    user: "you",
    webUrl: "https://example",
    createdAt: "2026-08-15T10:00:00.000Z",
    updatedAt: "2026-08-15T10:00:00.000Z",
    finishedAt: "2026-08-15T10:00:00.000Z",
    ...partial,
  };
};

Deno.test("shouldReplace inserts missing keys", () => {
  assertEquals(shouldReplace(undefined, run({})), true);
});

Deno.test("shouldReplace never overwrites a terminal run", () => {
  const stored = run({ status: "success" });
  const incoming = run({ status: "failed", updatedAt: "2026-08-16T10:00:00.000Z" });
  assertEquals(shouldReplace(stored, incoming), false);
});

Deno.test("shouldReplace updates in-flight runs", () => {
  const stored = run({ status: "running", finishedAt: null });
  const incoming = run({ status: "success", updatedAt: "2026-08-15T11:00:00.000Z" });
  assertEquals(shouldReplace(stored, incoming), true);
});

Deno.test("mergeRuns keeps Friday data when Tuesday only has new rows", () => {
  const friday = run({ pipelineId: "1", updatedAt: "2026-08-14T18:00:00.000Z" });
  const tuesday = run({
    pipelineId: "2",
    status: "failed",
    updatedAt: "2026-08-18T12:00:00.000Z",
  });
  const { next, writes } = mergeRuns([friday], [tuesday]);
  assertEquals(next.length, 2);
  assertEquals(writes.map((w) => w.pipelineId), ["2"]);
});

Deno.test("sortRuns puts failed and running first", () => {
  const sorted = sortRuns([
    run({ pipelineId: "s", status: "success", updatedAt: "2026-08-16T12:00:00.000Z" }),
    run({ pipelineId: "f", status: "failed", updatedAt: "2026-08-16T10:00:00.000Z" }),
    run({ pipelineId: "r", status: "running", updatedAt: "2026-08-16T11:00:00.000Z" }),
  ]);
  assertEquals(sorted.map((r) => r.pipelineId), ["f", "r", "s"]);
});

import { assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import {
  init,
  type InitAnswers,
  librarySpecifier,
  parseProjects,
  renderEnv,
  renderMain,
} from "./init.ts";

const sample: InitAnswers = {
  provider: "gitlab",
  url: "https://gitlab.example.com",
  token: "glpat-test",
  history: true,
  mineOnly: true,
  extraProjects: ["acme/infra"],
  lookbackHours: 48,
};

Deno.test("parseProjects splits comma lists", () => {
  assertEquals(parseProjects(" a/b , c/d "), ["a/b", "c/d"]);
  assertEquals(parseProjects(""), []);
});

Deno.test("renderMain interpolates wizard answers", () => {
  const main = renderMain(sample);
  assertStringIncludes(main, "history: true");
  assertStringIncludes(main, "mineOnly: true");
  assertStringIncludes(main, '"acme/infra"');
  assertStringIncludes(main, 'provider: "gitlab"');
  assertEquals(main.includes("glpat-test"), false);
});

Deno.test("renderEnv keeps the token out of source files", () => {
  const env = renderEnv(sample);
  assertStringIncludes(env, "GITLAB_TOKEN=glpat-test");
  assertStringIncludes(env, "GITLAB_URL=https://gitlab.example.com");
});

Deno.test("init writes the generated project", async () => {
  const dir = await Deno.makeTempDir({ prefix: "pipeline-dash-init-" });
  try {
    await init(dir, sample, { force: true });
    const main = await Deno.readTextFile(join(dir, "main.tsx"));
    const env = await Deno.readTextFile(join(dir, ".env"));
    const json = await Deno.readTextFile(join(dir, "deno.json"));
    assertStringIncludes(main, "dashboard({");
    assertStringIncludes(env, "GITLAB_TOKEN=glpat-test");
    assertStringIncludes(json, "@hmalinchock/pipeline-dashboard");
    assertStringIncludes(json, librarySpecifier(dir));
    assertStringIncludes(json, "preact");
    assertStringIncludes(json, "jsxImportSource");
    assertStringIncludes(json, "--allow-read=data");
    assertStringIncludes(json, "--allow-write=data");
    assertStringIncludes(json, "--allow-env=GITLAB_TOKEN");
    assertEquals(json.includes("--allow-read "), false);
    assertEquals(json.includes("--allow-write "), false);
    await Deno.stat(join(dir, "data/.gitkeep"));
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

/**
 * CLI to scaffold a local pipeline dashboard.
 *
 * @module
 * @example
 * ```sh
 * deno run -A jsr:@hmalinchock/pipeline-dashboard/init ./my-pipelines
 * ```
 */

import { parseArgs } from "@std/cli/parse-args";
import { join, resolve } from "@std/path";

const HELP = `pipeline-dashboard

Create a local GitLab / GitHub pipeline board.

  deno run --allow-read=./my-pipelines --allow-write=./my-pipelines \\
    ./init.ts ./my-pipelines
  deno run --allow-read=. --allow-write=. ./init.ts .

Flags:
  --provider=gitlab|github
  --url=https://gitlab.example.com
  --token=...
  --history / --no-history
  --mine-only / --all
  --projects=group/a,group/b
  --lookback=48
  --force
  --help
`;

export interface InitAnswers {
  provider: "gitlab" | "github";
  url: string;
  token: string;
  history: boolean;
  mineOnly: boolean;
  extraProjects: string[];
  lookbackHours: number;
}

const isTty = (): boolean => Deno.stdin.isTerminal();

const askText = (label: string, fallback = ""): string => {
  const value = prompt(label, fallback);
  return (value ?? fallback).trim();
};

const askYesNo = (label: string, fallback: boolean): boolean => {
  const hint = fallback ? "Y/n" : "y/N";
  const value = prompt(`${label} [${hint}]`, fallback ? "y" : "n");
  if (value == null || value.trim() === "") return fallback;
  return /^(y|yes)$/i.test(value.trim());
};

const parseFlags = (args: string[]): ReturnType<typeof parseArgs> =>
  parseArgs(args, {
    boolean: ["help", "force", "history", "no-history", "mine-only", "all", "non-interactive"],
    string: ["provider", "url", "token", "projects", "lookback"],
    alias: { h: "help", f: "force" },
  });

const askChoice = (label: string, options: string[], fallback: string): string => {
  console.log(label);
  options.forEach((option, i) => {
    const mark = option === fallback ? "*" : " ";
    console.log(`  ${i + 1}) ${option}${mark === "*" ? " (default)" : ""}`);
  });
  const raw = prompt("Choose", String(options.indexOf(fallback) + 1));
  const asNumber = Number(raw);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= options.length) {
    return options[asNumber - 1];
  }
  if (raw && options.includes(raw)) return raw;
  return fallback;
};

export const parseProjects = (raw: string | undefined): string[] => {
  if (!raw) return [];
  return raw.split(",").map((p) => p.trim()).filter(Boolean);
};

export const collectAnswers = (
  flags: ReturnType<typeof parseFlags>,
): InitAnswers => {
  const interactive = isTty() && !flags["non-interactive"];

  let provider: "gitlab" | "github" = "gitlab";
  if (flags.provider === "gitlab" || flags.provider === "github") {
    provider = flags.provider;
  } else if (interactive) {
    const chosen = askChoice("Which host?", ["gitlab", "github"], "gitlab");
    provider = chosen === "github" ? "github" : "gitlab";
  }

  let url = flags.url ?? "";
  if (provider === "gitlab" && !url) {
    url = interactive ? askText("GitLab base URL", "https://gitlab.com") : "https://gitlab.com";
  }
  if (provider === "gitlab" && !url) url = "https://gitlab.com";

  let token = flags.token ?? "";
  if (!token && interactive) {
    token = askText(
      provider === "gitlab" ? "GitLab personal access token" : "GitHub personal access token",
    );
  }
  if (!token) {
    throw new Error("A token is required. Pass --token or run in a terminal.");
  }

  let history = flags.history;
  if (flags["no-history"]) history = false;
  else if (flags.history) history = true;
  else history = interactive ? askYesNo("Store historical runs in local Deno KV?", true) : true;

  let mineOnly = true;
  if (flags.all) mineOnly = false;
  else if (flags["mine-only"]) mineOnly = true;
  else if (interactive) {
    mineOnly = askYesNo("Only show pipelines you triggered?", true);
  }

  let extraProjects = parseProjects(flags.projects);
  if (interactive && extraProjects.length === 0) {
    extraProjects = parseProjects(
      askText("Opt-in projects (comma-separated paths, empty to skip)", ""),
    );
  }

  const lookbackHours = Number(flags.lookback ?? 48);
  if (!Number.isFinite(lookbackHours) || lookbackHours <= 0) {
    throw new Error("--lookback must be a positive number");
  }

  return {
    provider,
    url: url.replace(/\/+$/, ""),
    token,
    history,
    mineOnly,
    extraProjects,
    lookbackHours,
  };
};

export const librarySpecifier = (_fromDirectory: string): string => {
  if (import.meta.url.startsWith("file:")) {
    return new URL("./app.tsx", import.meta.url).href;
  }
  return "jsr:@hmalinchock/pipeline-dashboard@^0.1.0";
};

export const renderMain = (answers: InitAnswers): string => {
  const extras = answers.extraProjects.map((p) => JSON.stringify(p)).join(", ");
  return `import { dashboard } from "@hmalinchock/pipeline-dashboard";

dashboard({
  history: ${answers.history},
  mineOnly: ${answers.mineOnly},
  extraProjects: [${extras}],
  lookbackHours: ${answers.lookbackHours},
  provider: ${JSON.stringify(answers.provider)},
});
`;
};

/** Env vars the dashboard may read. Tokens stay off the full environment. */
export const ENV_ALLOWLIST =
  "GITLAB_TOKEN,GITLAB_URL,GITHUB_TOKEN,PIPELINE_PROVIDER,PIPELINE_LOOKBACK_HOURS,PIPELINE_DASHBOARD_FIXTURE";

/** Runtime flags for a generated project. File access is only `data/` (KV). */
export const DASHBOARD_FLAGS =
  `--unstable-kv --env-file=.env --allow-net --allow-read=data --allow-write=data --allow-env=${ENV_ALLOWLIST}`;

export const renderDenoJson = (specifier: string): string => {
  return `{
  "tasks": {
    "dev": "deno run ${DASHBOARD_FLAGS} --watch main.tsx",
    "serve": "deno run ${DASHBOARD_FLAGS} main.tsx"
  },
  "imports": {
    "@hmalinchock/pipeline-dashboard": ${JSON.stringify(specifier)},
    "preact": "npm:preact@10.26.4",
    "preact/": "npm:/preact@10.26.4/",
    "preact-render-to-string": "npm:preact-render-to-string@6.5.13"
  },
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "preact"
  }
}
`;
};

export const renderEnv = (answers: InitAnswers): string => {
  if (answers.provider === "github") {
    return `PIPELINE_PROVIDER=github
GITHUB_TOKEN=${answers.token}
`;
  }
  return `PIPELINE_PROVIDER=gitlab
GITLAB_URL=${answers.url || "https://gitlab.com"}
GITLAB_TOKEN=${answers.token}
`;
};

const GITIGNORE = `.env
data/*
!data/.gitkeep
.deno
`;

export const init = async (
  directory: string,
  answers: InitAnswers,
  options: { force?: boolean } = {},
): Promise<void> => {
  const root = resolve(directory);
  await Deno.mkdir(root, { recursive: true });

  const existing = [...Deno.readDirSync(root)];
  if (existing.length > 0 && !options.force) {
    if (!isTty()) {
      throw new Error("Directory is not empty. Re-run with --force.");
    }
    const ok = confirm("Directory is not empty. Continue?");
    if (!ok) throw new Error("Directory is not empty, aborting.");
  }

  const specifier = librarySpecifier(root);
  await Deno.mkdir(join(root, "data"), { recursive: true });
  await Deno.writeTextFile(join(root, "main.tsx"), renderMain(answers));
  await Deno.writeTextFile(join(root, "deno.json"), renderDenoJson(specifier));
  await Deno.writeTextFile(join(root, ".env"), renderEnv(answers));
  await Deno.writeTextFile(join(root, ".gitignore"), GITIGNORE);
  await Deno.writeTextFile(join(root, "data/.gitkeep"), "");

  console.log(`Dashboard created in ${root}`);
  console.log("Run `deno task dev` and open http://127.0.0.1:8787");
};

const printHelp = (): void => {
  console.log(HELP);
};

if (import.meta.main) {
  const flags = parseFlags(Deno.args);
  if (flags.help) {
    printHelp();
    Deno.exit(0);
  }

  const directory = String(flags._[0] ?? "");
  if (!directory) {
    printHelp();
    Deno.exit(2);
  }

  try {
    const answers = collectAnswers(flags);
    await init(directory, answers, { force: Boolean(flags.force) });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    Deno.exit(1);
  }
}

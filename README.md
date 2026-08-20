# pipeline-dashboard

Local GitLab / GitHub pipeline board for Deno. Each person on the team runs init on their machine,
pastes their own token, and gets a dashboard of _their_ pipelines. Nothing is deployed.

```sh
deno run --allow-read=./my-pipelines --allow-write=./my-pipelines \
  ./init.ts ./my-pipelines
cd my-pipelines
deno task dev
```

Then open http://127.0.0.1:8787.

## What you get

- A high-level board of pipeline status
- Click a row to read job logs
- Optional local Deno KV history so Friday’s runs are still there on Tuesday
- API lookback of 48 hours on every start (overridable)

The generated repo is four files: `main.tsx`, `deno.json`, `.env`, `.gitignore`. The UI lives in
this package so teammates pick up fixes by bumping the import.

## Init prompts

| Prompt                       | Default                                          |
| ---------------------------- | ------------------------------------------------ |
| Host                         | GitLab (GitHub is accepted, not implemented yet) |
| GitLab base URL              | `https://gitlab.com` (self-hosted works)         |
| Access token                 | written to `.env` only                           |
| Store history in Deno KV     | yes                                              |
| Only pipelines you triggered | yes                                              |
| Extra project paths          | none                                             |

Flags for scripts:

```sh
deno run --allow-read=./my-pipelines --allow-write=./my-pipelines \
  ./init.ts ./my-pipelines \
  --provider=gitlab \
  --url=https://gitlab.example.com \
  --token="$GITLAB_TOKEN" \
  --history \
  --mine-only \
  --projects=group/other \
  --lookback=48 \
  --force
```

Init only needs those two flags: it creates the folder and writes `main.tsx`, `deno.json`, `.env`,
and `data/`. It cannot read the rest of your disk.

## Permissions at runtime

`deno task dev` does **not** grant global file access. The generated task is:

```sh
deno run --unstable-kv --env-file=.env --allow-net \
  --allow-read=data --allow-write=data \
  --allow-env=GITLAB_TOKEN,GITLAB_URL,GITHUB_TOKEN,PIPELINE_PROVIDER,PIPELINE_LOOKBACK_HOURS,PIPELINE_DASHBOARD_FIXTURE \
  --watch main.tsx
```

| Flag                                       | Why                                                                                                               |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `--allow-net`                              | GitLab/GitHub API. Left open so a self-hosted URL works. Tighten to `--allow-net=gitlab.example.com` if you want. |
| `--allow-read=data` / `--allow-write=data` | Local Deno KV history only (`data/history`). CSS and source load as modules and do not need file permissions.     |
| `--allow-env=…`                            | Named vars only. The process cannot dump your whole environment.                                                  |
| `--env-file=.env`                          | Loads the token. Deno reads that file as config, not via `--allow-read`.                                          |

`--allow-read` / `--allow-write` without a path would let the app (or a dependency) read or
overwrite anything your user can, including `.env`, SSH keys, and other repos. That is why they are
scoped to `data/`.

Init creates `data/` so the runtime never needs write access to the project root (creating a
directory requires write on the parent).

## Token scopes

- GitLab personal access token: `read_api` is enough
- Never commit `.env`

## Generated config

```ts
import { dashboard } from "@hmalinchock/pipeline-dashboard";

dashboard({
  history: true,
  mineOnly: true,
  extraProjects: ["group/other-repo"],
  lookbackHours: 48,
  provider: "gitlab",
});
```

## History rules

When `history: true`:

1. Load every run already in local KV
2. Fetch the last 48 hours from the API
3. Insert missing runs
4. Update a stored run only if it is still in-flight
5. Never delete

A run that finished more than 48 hours ago while the app was closed can stay “running” in KV. That
is accepted in v1.

## Develop this package

```sh
deno task demo    # fixture data, no token
deno task test
deno task check
```

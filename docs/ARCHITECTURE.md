# Architecture

## Rules

- `packages/shared` has no Node or DOM imports. It holds the types, the API contract
  (`src/api.ts`), event names, setting keys and formatters. Change the contract there first.
- `packages/core` holds all behaviour and never imports Electron. It is used by the desktop main
  process and by the CLI, so both always behave the same.
- The renderer never touches Node. It calls `api.<namespace>.<method>()`, a typed proxy over one
  IPC channel. Channel name = `<namespace>.<method>`.
- Errors thrown on purpose are `AppError(code, message, details)` from `core/src/errors.ts`. Codes
  are listed in `shared/src/errors.ts`. Never throw plain strings.
- Dates, durations and byte sizes are formatted only through `shared/src/format.ts`.
- No magic values inline: constants go in `shared/src/constants.ts` or a `const` at the top of the
  module that owns them.
- Files stay at or under 500 lines. Split by responsibility before they grow past it.
- Every mutation of skills, tags, presets or deployments ends with `ctx.touched("skills", …)`.
  That rewrites the portable metadata and tells the UI to refetch.
- Filesystem writes that touch the library run inside `ctx.lock.run("<operation>", fn)`.
  Never hold the lock across a network call.
- Never delete or overwrite a folder in an agent's directory unless a `deployments` row proves
  Loadout put it there (see `deploy/engine.ts`). Shared folders: remove the path only when no
  other deployment row still points at it.

## Core layout (`packages/core/src`)

| Path                 | Owns                                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core.ts`            | `createCore(options)`: builds the context, wires every service, returns `CoreApi` + helpers                                                           |
| `context.ts`         | `CoreContext`, `SecretStore`, `HostBridge`                                                                                                            |
| `errors.ts`          | `AppError`, helpers, `toErrorShape`                                                                                                                   |
| `paths.ts`           | Library location, move-on-restart, warnings                                                                                                           |
| `lock.ts`            | Cross-process library lock                                                                                                                            |
| `log.ts`             | Rotating file logger                                                                                                                                  |
| `activity.ts`        | Activity history                                                                                                                                      |
| `db/`                | SQLite wrapper (`node:sqlite`) and migrations                                                                                                         |
| `settings/store.ts`  | Typed settings + internal JSON blobs (`INTERNAL_KEYS`)                                                                                                |
| `util/`              | `fs` (copy, atomic write, links), `safe-path` (every name and path check from outside), `hash`, `names`, `exec`, `async`, `queue`, `git` (one runner) |
| `skills/store.ts`    | All SQL for skills, tags, deployments                                                                                                                 |
| `skills/metadata.ts` | Frontmatter + document lookup                                                                                                                         |
| `skills/portable.ts` | Portable metadata files and database rebuild                                                                                                          |
| `skills/service.ts`  | `SkillsApi`                                                                                                                                           |
| `skills/checks.ts`   | Agent Skills format checks per skill, cached by content hash (rules in `shared/skill-checks`)                                                         |
| `editor/`            | `EditorApi`: files of a skill in the library, an agent folder or a project; history, copies                                                           |
| `agents/`            | `registry.ts` resolves built-in + custom agents; `service.ts` implements `AgentsApi`                                                                  |
| `deploy/`            | `engine.ts` ownership rules + symlink/copy; `service.ts` implements `DeployApi`                                                                       |
| `install/`           | Local, archive, Git (source parsing, clone cache, repo scan), cancel registry → `InstallApi`                                                          |
| `scan/`              | "Scan this machine": skills already in agent folders, matched against the library, imported                                                           |
| `safety/`            | Built-in safety rules, the SkillSpector runner, kept reports, the check before every install                                                          |
| `duplicates/`        | Possible duplicates: same files, alike text or names; merge one into the other, dismiss a pair                                                        |
| `instructions/`      | Agents' instruction files (`CLAUDE.md`, `AGENTS.md`...), globally and per project                                                                     |
| `skills-file/`       | A project's `skills.toml` and `skills-lock.json`: plan, safety check, apply, unapply                                                                  |
| `listing/`           | What Claude Code's skill listing costs in context, against its budget                                                                                 |
| `health/`            | `loadout doctor`: one report of everything that needs a look                                                                                          |
| `market/`            | Marketplace boards and search → `MarketApi`                                                                                                           |
| `sources/`           | Skills repositories gained since last seen: per-repository state, check, auto-add                                                                     |
| `origin/`            | Finding and linking the source of skills without one: local evidence, marketplace, compare                                                            |
| `updates/`           | Check, update, removal approval, source diff, background auto-update → `UpdatesApi`                                                                   |
| `presets/`           | `PresetsApi`; `share.ts` exports a preset as a file and imports one, installing what is missing                                                       |
| `workspace/`         | Local skill scanning, library matching, sync status, global workspace → `WorkspaceApi`                                                                |
| `projects/`          | Project and linked workspaces → `ProjectsApi`                                                                                                         |
| `backup/`            | Git backup, skill-aware merge, snapshots, GitHub connect, auto backup → `BackupApi`                                                                   |
| `system/`            | Diagnostics, log export, crash marker, CLI publishing, agent-control setup → `SystemApi`                                                              |
| `suggest/`           | Library skills that fit a project: its technologies and files, the skills' own patterns                                                               |
| `usage/`             | Skill runs read from agents' session logs, incrementally, into `usage_events` → `UsageApi`                                                            |
| `publish/`           | Publishes chosen skills to another Git repository: own clone, key check, never forces → `PublishApi`                                                  |
| `storage/`           | Sizes of every area, clearing history/cache/logs, Recently removed, removing all data → `StorageApi`                                                  |

## Service shape

Each feature folder exports one factory from its `index.ts`:

```ts
export function create<Feature>Service(ctx: CoreContext, deps: { … }): <Feature>Service;
```

The returned object has an `api` property implementing the matching interface from
`shared/src/api.ts`, plus whatever other services need (`registry`, `engine`, …). `core.ts` is the
only place services are constructed, so dependencies are explicit and there are no singletons.

## Desktop layout (`apps/desktop/src`)

| Path        | Owns                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------- |
| `main/`     | Window, IPC bridge, tray, close behaviour, file watcher, update check, keychain, crash notice |
| `preload/`  | Exposes `window.loadout` = `{ invoke, on, pathForFile }`, nothing else                        |
| `renderer/` | React app. `routes/` is file based (TanStack Router). `lib/api.ts` is the typed proxy.        |

Renderer data flow: TanStack Query for every read, keyed by namespace. The main process emits
`data:changed { scope }`; `lib/events.ts` turns that into query invalidation. Mutations toast
their outcome and rely on the same invalidation: `hooks/use-api-mutation.ts` toasts and refetches
only keys no scope covers. `hooks/` holds what several features share; a hook only one feature
uses lives in `features/<x>/`.

## Browser preview (`apps/desktop/dev-server`)

The renderer in a plain browser, on the real core: for the UI tests (`e2e/`) and for trying the
interface (`pnpm --filter @loadout/desktop dev:browser`). Electron never starts, and the renderer
imports none of it.

| Path                   | Owns                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `plugin.ts`            | Vite plugin: injects the bridge, routes `/__loadout/*` to one session process per cookie   |
| `request-guard.ts`     | Runs only the preview page's own requests, and only JSON POSTs                             |
| `browser/bridge.ts`    | `window.loadout` over `fetch` (`invoke`) and server-sent events (`on`)                     |
| `session/main.ts`      | `createCore` on a temporary home; answers like the IPC bridge (`main/dispatch.ts`)         |
| `session/world.ts`     | The temporary home; git, `HOME` and temp files pointed into it; the seed kept and restored |
| `session/seed.ts`      | Writes the fixture folders and repositories, then fills the library through the API        |
| `session/fixtures*.ts` | The seed as data: skills, agents, projects, presets, what the web answers                  |
| `session/fetch.ts`     | The `fetchImpl` for skills.sh, ClawHub and the GitHub API                                  |
| `session/scenarios.ts` | States tests ask for by name: another device syncing the backup, a broken deployment       |
| `session/app-stub.ts`  | The Electron-only `app` namespace: fixed dialog answers, no shell, no updates              |

Git addresses on `github.com` and `example.com` go to bare repositories inside the temporary
home. Each Playwright worker has its own session; it goes back to the seed before every test.

## Library on disk

Everything lives in one home data folder, `~/.loadout`. The library can be moved elsewhere in
Settings; then only the library's own entries move and the rest stays home.

```
~/.loadout/                home data folder (always here)
  library.json             where the library is, when it was moved (absent otherwise)
  bin/                     published CLI for agents
  app/                     the desktop app's own files (app-dev/ for the development build)
  (the library, unless moved)
  loadout.db               SQLite (metadata; rebuilt from files when missing)
  skills/                  one folder per skill, also the backup Git repository
    .loadout/              portable metadata: schema.json, skills/<id>.json, presets/<id>.json
  history/                 earlier versions of files saved in the editor (this computer only)
  removed/                 Recently removed: skill folders taken out of agent and project folders
  earlier-libraries/       libraries a restore or recovery replaced, kept until cleared in Storage
  cache/repos/             Git clone cache
  logs/                    rotating logs, crash marker
```

A library move (`paths.ts`) moves `skills/`, the database, `history/`, `removed/`,
`earlier-libraries/`, `cache/` and `logs/` as a whole or not at all, and only into an empty folder (the home data folder's own files aside).

`schema.json` holds the metadata format version and the highest app version that has written the
library. Sync, clone and restore refuse a backup whose format is newer than the app knows
(`BACKUP_TOO_NEW`); a newer app version alone only shows an update reminder (`backup/compat.ts`).

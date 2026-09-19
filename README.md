# Skillboard

One desktop app to manage AI agent skills across every coding tool.

A skill is a folder with a `SKILL.md`. Skillboard keeps every skill in one library
(`~/.skillboard`) and deploys it — by symlink or copy — into the skills folder of each agent you
use: Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot and 49 more.

## What it does

- **Library** — install from a folder, a `.zip` / `.skill` archive, any Git URL, or the skills.sh
  marketplace. Tag, search, batch-edit, inspect docs, and compare with upstream.
- **Agents** — see everything in each agent's folder, including skills you never installed through
  the app. Upload them to the library, pull changes back, or remove them.
- **Presets** — named groups of skills you can switch on or off per agent or per project.
- **Projects** — manage project-local skill folders and keep them in step with the library.
- **Updates** — track upstream changes of Git skills, with a guard that shows files an update
  would delete before anything changes.
- **Backup** — version the library in a Git repository and keep several computers in sync.
  Changes merge per skill; conflicts never block and are resolved with keep mine / use remote /
  keep both.
- **CLI** — `~/.skillboard/bin/skillboard`, published by the app, plus a bundled skill that lets
  your agents manage skills through it.

## Develop

Needs Node 22.12 or newer, [pnpm](https://pnpm.io) and `git`.

```bash
pnpm install
```

```bash
pnpm dev
```

| Command        | What it does                                  |
| -------------- | --------------------------------------------- |
| `pnpm dev`     | Build the CLI, then start the app with reload |
| `pnpm check`   | oxlint, oxfmt check, typecheck, all tests     |
| `pnpm test`    | vitest across packages                        |
| `pnpm format`  | Format with oxfmt                             |
| `pnpm package` | Build installers into `apps/desktop/release`  |
| `pnpm cli …`   | Run the CLI from source                       |

## Layout

| Path              | Purpose                                            |
| ----------------- | -------------------------------------------------- |
| `apps/desktop`    | Electron main, preload and the React renderer      |
| `packages/core`   | All behaviour, plain Node TypeScript (no Electron) |
| `packages/cli`    | The `skillboard` command-line tool                 |
| `packages/shared` | Types, API contract, events, settings, formatters  |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the rules and
[docs/PLAN.md](docs/PLAN.md) for the feature checklist and known gaps.

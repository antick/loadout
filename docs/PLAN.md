# Skillboard — build plan and feature checklist

One desktop app to manage AI agent skills across every coding tool. A _skill_ is a folder with a
`SKILL.md` (YAML frontmatter + instructions). Skillboard keeps every skill in one central **library**
and deploys it (symlink or copy) into each agent's skills folder.

Status legend: `[x]` done and verified · `[~]` partly done · `[ ]` not started.

## Stack

| Layer      | Choice                                                                         |
| ---------- | ------------------------------------------------------------------------------ |
| Monorepo   | Turborepo + bun workspaces                                                     |
| Desktop    | Electron, electron-vite, electron-builder                                      |
| UI         | React 19, TanStack Router (file based), TanStack Query, Tailwind v4, shadcn/ui |
| Domain     | `@skillboard/core` — plain Node TypeScript, no Electron imports                |
| Storage    | SQLite through Node's built-in `node:sqlite` (no native modules)               |
| Git        | system `git` through `child_process`                                           |
| Lint / fmt | oxlint, oxfmt                                                                  |
| Tests      | vitest                                                                         |

## Packages

| Path              | Purpose                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------- |
| `packages/shared` | Types, API contract, event names, settings keys, built-in agent table. No Node APIs.    |
| `packages/core`   | All behaviour: database, library, installers, deploy engine, presets, projects, backup. |
| `packages/cli`    | `skillboard` CLI on top of core. Shipped inside the app for agents to call.             |
| `apps/desktop`    | Electron main + preload + React renderer.                                               |

## Feature checklist

### 1. Library (central skill store)

- [ ] Central folder, default `~/.skillboard`, custom path in Settings, move on restart, warnings
- [ ] SQLite metadata, rebuilt from skill files when missing
- [ ] Parse `SKILL.md` / `skill.md` frontmatter (name, description)
- [ ] Skill cards: grid and list view, search, source filter, tag filter incl. Untagged
- [ ] Skill detail: rendered docs, file list, source metadata, per-agent toggles, projects using it
- [ ] Delete skill (removes library copy, preset links, deployments)
- [ ] Tags: add/remove per skill, rename tag, delete tag, batch tag dialog
- [ ] Batch select: deploy to agents, tags, update, delete
- [ ] Activity log of install / remove / update / deploy operations

### 2. Install

- [ ] From local folder (tracked source, re-import, relink, detach)
- [ ] From `.zip` / `.skill` archive
- [ ] From Git: https, ssh, `owner/repo`, tree URLs with branch + subpath
- [ ] Git preview: pick skills found in the repo, rename, confirm
- [ ] Batch import every skill under a folder
- [ ] Scan agent folders for skills already on this machine and import them
- [ ] Marketplace: hot / trending / all-time boards, keyword search, one-click install
- [ ] Progress phases, cancel, timeout, proxy support

### 3. Updates

- [ ] Check one / check all Git-backed skills for upstream changes
- [ ] Update one / batch update, "content unchanged" handling for monorepos
- [ ] Removal guard: show files an update would delete, require approval
- [ ] Compare local with upstream: per-file diff, source document view
- [ ] Background auto-check (off / 1h / 6h / 24h), optional auto-apply, notification banner

### 4. Agents

- [ ] 54 built-in agents with detection, global + project skill paths
- [ ] Enable / disable, enable all / disable all
- [ ] Custom agents (name, skills path, optional project path)
- [ ] Path override + reset for built-ins (global and project path)
- [ ] Drag to reorder; order used everywhere
- [ ] Coding agents and personal-assistant agents shown as separate groups
- [ ] Safe handling of skill folders shared by several agents

### 5. Deploy engine

- [ ] Symlink or copy mode (setting), copy fallback when symlinks are unavailable
- [ ] Ownership check: never overwrite or delete content Skillboard did not put there
- [ ] Per-skill per-agent deploy / remove from the card badges
- [ ] Content hashing for in sync / local changed / library changed / conflict

### 6. Presets

- [ ] Create, rename, describe, pick icon, delete, drag to reorder
- [ ] Add / remove skills, reorder skills inside a preset
- [ ] Per-skill per-agent toggles inside a preset
- [ ] Preset pills in every workspace: active, partial `n/m`, inactive; click to add or remove
- [ ] Apply preset to default agents (one-time copy, not a live sync)

### 7. Global workspace

- [ ] All-agents overview with real on-disk skill counts
- [ ] Per-agent page listing everything in its folder, including unmanaged skills
- [ ] Upload to library, pull from library, remove from agent, delete local skill
- [ ] Add-from-library sheet: search, tag + source filter, target agent chips, shift-click range
- [ ] Batch remove / batch delete local
- [ ] Local / Diff / Library document tabs

### 8. Project workspaces

- [ ] Link a project folder; scan a root folder for projects
- [ ] Linked workspace: any skills root, with a sibling `-disabled` folder
- [ ] Nested skill folders, one row per skill with per-agent variants
- [ ] Enable / disable project skills
- [ ] Sync status against the library; update library, update project, restore library version
- [ ] Multi-variant conflict guard
- [ ] Export library skills to a project with agent picker and remembered selection
- [ ] Preset pills, batch actions, tags, drag to reorder projects, remove project

### 9. Backup and multi-device sync

- [ ] Library as a Git repo; metadata (tags, presets, toggles) serialised next to the skills
- [ ] Connect with GitHub: device-flow sign-in, or personal access token; private repo created
- [ ] Any Git remote URL (https + token, ssh, self-hosted); credentials kept out of files
- [ ] One-button sync: commit → merge → snapshot → push, retry on concurrent push
- [ ] Skill-aware merge: per skill, renames combine with edits
- [ ] Conflicts never block: keep mine / use remote / keep both, safety snapshot first
- [ ] Snapshot history with device name, restore any snapshot
- [ ] Automatic backup after changes settle and on quit; toggle
- [ ] Size report: 100 MB per-skill exclusion, 1 GB warning
- [ ] First-run "start fresh or restore" prompt
- [ ] Setup and recovery dialogs; disconnect, revoke, delete-remote guidance

### 10. App shell

- [ ] Sidebar: dashboard, library, install, agents, presets, projects, backup, settings
- [ ] Dashboard: stats, quick actions, recent activity, agent-control setup card
- [ ] Command palette (⌘K): skills, presets, projects, actions
- [ ] Theme (light / dark / system), text size, language
- [ ] Tray icon, close behaviour (ask / hide / quit), single instance
- [ ] File watcher refreshes the UI when skills change on disk or through the CLI
- [ ] App update check and notification
- [ ] Diagnostics, log files, export logs zip, crash banner, report issue
- [ ] Help / quick-start guide
- [ ] Network proxy setting

### 11. CLI and agent control

- [ ] `skillboard` CLI: `repo`, `agents`, `skills`, `presets`, `git` groups
- [ ] `--json` output with stable error codes, `--dry-run`, `--yes`, `--library <path>`
- [ ] App publishes the CLI to `~/.skillboard/bin` on start with a version stamp
- [ ] Bundled `manage-skills` skill teaching agents to drive the CLI; one-click setup

## Build order

1. Scaffold, tooling, app boots — **done**
2. Shared contract (types, API, events, settings)
3. Core: db → agents → library → installers → deploy → presets → workspaces → projects → updates → backup
4. Electron main: IPC bridge, watcher, tray, scheduler, updater, logs
5. Renderer: shell → library → install → agents → presets → projects → backup → settings → dashboard
6. CLI + bundled skill
7. Verify each feature in the running app, fix, update this list

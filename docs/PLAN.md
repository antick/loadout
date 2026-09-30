# Loadout: build plan and feature checklist

One desktop app to manage AI agent skills across every coding tool. A _skill_ is a folder with a
`SKILL.md` (YAML frontmatter + instructions). Loadout keeps every skill in one central **library**
and deploys it (symlink or copy) into each agent's skills folder.

Status legend: `[x]` done and verified · `[~]` partly done · `[ ]` not started.

## Stack

| Layer      | Choice                                                                         |
| ---------- | ------------------------------------------------------------------------------ |
| Monorepo   | Turborepo + pnpm workspaces, Node 22+                                          |
| Desktop    | Electron, electron-vite, electron-builder                                      |
| UI         | React 19, TanStack Router (file based), TanStack Query, Tailwind v4, shadcn/ui |
| Domain     | `@loadout/core`: plain Node TypeScript, no Electron imports                    |
| Storage    | SQLite through Node's built-in `node:sqlite` (no native modules)               |
| Git        | system `git` through `child_process`                                           |
| Lint / fmt | oxlint, oxfmt                                                                  |
| Tests      | vitest; Playwright for UI tests against the renderer preview                   |

## Packages

| Path              | Purpose                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------- |
| `packages/shared` | Types, API contract, event names, settings keys, built-in agent table. No Node APIs.    |
| `packages/core`   | All behaviour: database, library, installers, deploy engine, presets, projects, backup. |
| `packages/cli`    | `loadout` CLI on top of core. Shipped inside the app for agents to call.                |
| `apps/desktop`    | Electron main + preload + React renderer.                                               |

## Feature checklist

### 1. Library (central skill store)

- [x] Central folder, default `~/.loadout`, custom path in Settings, move on restart, warnings
- [x] SQLite metadata, rebuilt from skill files when missing
- [x] Parse `SKILL.md` / `skill.md` frontmatter (name, description)
- [x] Skill cards: grid and list view, search, source filter, tag filter incl. Untagged
- [x] Skill detail: rendered docs, file list, source metadata, per-agent toggles, projects using it
- [x] "Manual only" badge for `disable-model-invocation: true`
- [x] Per-agent note for frontmatter the agent does not act on, from each agent's own docs
- [x] "Runs code" badge, "What it can do" list and filter: scripts, hooks, MCP servers, pre-approved tools; also in the import preview
- [x] Delete skill (removes library copy, preset links, deployments)
- [x] Tags: add/remove per skill, rename tag, delete tag, batch tag dialog
- [x] A note per skill, kept by Loadout, searched, backed up, `loadout skills note`
- [x] Favourites: star per skill, favourites filter and sidebar view, `loadout skills favorite`
- [x] Batch select: deploy to agents, tags, update, delete
- [x] Activity log of install / remove / update / deploy operations
- [x] Possible duplicates: find skills that look like one installed twice, compare, keep one, dismiss a pair
- [x] Publish skills to a Git repository for `npx skills add`: preview, key check, layers, `loadout skills publish`

### 2. Install

- [x] From local folder (tracked source, re-import, relink, detach)
- [x] From `.zip` / `.skill` archive, or by dropping a folder or archive on the page
- [x] From Git: https, ssh, `owner/repo`, tree URLs with branch + subpath
- [x] Git preview: pick skills found in the repo, rename, confirm
- [x] Preview labels what each name will do (new, in library, name in use, same name twice), groups skills by folder, filters big sources
- [x] Sources page: one card per repository, archive or link; find new skills, update, check, show in library, remove
- [x] New skills in repositories: noticed on check, skipped or dismissed ones remembered, optional auto-add
- [x] Batch import every skill under a folder
- [x] Scan agent folders for skills already on this machine and import them
- [x] Marketplace: hot / trending / all-time boards, keyword search, one-click install
- [x] Progress phases, cancel, timeout, proxy support

### 3. Updates

- [x] Check one / check all Git-backed skills for upstream changes
- [x] Update one / batch update, "content unchanged" handling for monorepos
- [x] Removal guard: show files an update would delete, require approval
- [x] Compare local with upstream: per-file diff, source document view
- [x] Report a problem with a skill: prefilled new-issue page on GitHub or GitLab, or copy the text; `loadout skills feedback`
- [x] Background auto-check (off / 1h / 6h / 24h), optional auto-apply, notification banner

### 4. Agents

- [x] 69 built-in agents with detection, global + project skill paths
- [x] Enable / disable, enable all / disable all
- [x] Custom agents (name, skills path, optional project path)
- [x] Path override + reset for built-ins (global and project path)
- [x] Drag to reorder; order used everywhere
- [x] Coding agents and personal-assistant agents shown as separate groups
- [x] Safe handling of skill folders shared by several agents

### 5. Deploy engine

- [x] Symlink or copy mode (setting), copy fallback when symlinks are unavailable
- [x] Ownership check: never overwrite or delete content Loadout did not put there
- [x] Per-skill per-agent deploy / remove from the card badges
- [x] Matrix view of the library: skills × agents, click to deploy or remove, right-click to block
- [x] Content hashing for in sync / local changed / library changed / conflict
- [x] Block a skill for an agent: skipped by every deploy, removed there when set, backed up with the tags
- [x] Deploy all: every skill to the chosen agents, refused folders skipped and listed instead of stopping the batch
- [x] Start-up repair: missing or broken deployments put back, failures in a banner with Retry, `loadout skills repair`

### 6. Presets

- [x] Create, rename, describe, pick icon, delete, drag to reorder
- [x] Add / remove skills, reorder skills inside a preset
- [x] Per-skill per-agent toggles inside a preset
- [x] Preset pills in every workspace: active, partial `n/m`, inactive; click to add or remove
- [x] Apply preset to default agents (one-time copy, not a live sync)

### 7. Global workspace

- [x] All-agents overview with real on-disk skill counts
- [x] Per-agent page listing everything in its folder, including unmanaged skills
- [x] Upload to library, pull from library, remove from agent, delete local skill
- [x] Add-from-library sheet: search, tag + source filter, target agent chips, shift-click range
- [x] Batch remove / batch delete local
- [x] Folders the agent skips (no `SKILL.md`, dangling link) listed with a reason; reveal or delete
- [x] Local / Diff / Library document tabs
- [x] Claude Code skill listing: estimated cost against its context budget, biggest skills, warning when over; in `loadout doctor` and `loadout agents listing`

### 8. Project workspaces

- [x] Link a project folder; scan a root folder for projects
- [x] Linked workspace: any skills root, with a sibling `-disabled` folder
- [x] Nested skill folders, one row per skill with per-agent variants
- [x] Enable / disable project skills
- [x] Sync status against the library; update library, update project, restore library version
- [x] Multi-variant conflict guard
- [x] Export library skills to a project with agent picker and remembered selection
- [x] `skills.toml` + `skills-lock.json`: pinned project skills, applied from the project page or `loadout project apply`
- [x] Preset pills, batch actions, tags, drag to reorder projects, remove project

### 8b. Instruction files

- [x] Known single-file instructions per agent, global and project (`shared/src/instructions.ts`)
- [x] One entry per distinct file (same path or linked), naming every agent that reads it
- [x] Create a missing file empty; edit through the editor (limited to that one file)
- [ ] Keep one source in sync across agents (e.g. write `CLAUDE.md` as a link to `AGENTS.md`)
- [ ] Agents that read a folder of rule files; custom agents and path overrides for these files
- [ ] CLI commands for instruction files

### 9. Backup and multi-device sync

- [x] Library as a Git repo; metadata (tags, presets, toggles) serialised next to the skills
- [~] Connect with GitHub: personal access token works; device-flow sign-in is built but hidden until a GitHub OAuth client id is set (Settings → Backup). Next: a GitHub App instead, see [TODO.md](TODO.md)
- [x] Any Git remote URL (https + token, ssh, self-hosted); credentials kept out of files
- [x] Public GitHub repository: connect stops before saving the token or remote until the user confirms (token and sign-in)
- [x] One-button sync: commit → merge → snapshot → push, retry on concurrent push
- [x] Skill-aware merge: per skill, renames combine with edits
- [x] Conflicts never block: keep mine / use remote / keep both, safety snapshot first
- [x] Skills deleted on another device go to Recently removed, named in the sync toast and CLI
- [x] Sync review: incoming, outgoing and conflicting skills with file diffs; keep or delete each incoming deletion (app, dashboard, palette); `git sync --dry-run` / `--allow-deletes`
- [x] Sync review: search and a kind-of-change filter once it lists 8 or more skills; "keep all" / "delete all" answer for the rows in view
- [x] Sync review says when the library changed since it was worked out (compared by git tree, not by file events) and offers Recheck
- [x] Conflicts: compare file by file before choosing
- [x] Conflicts: one choice for all of them ("keep all mine", "use all remote"), one safety snapshot, all or nothing
- [x] Sync progress by stage (manual, automatic and review) on the Backup page and in the review
- [x] Mass-delete guard: more than 5 deletions, or 3+ that are over half the library, stop the sync (automatic too) until reviewed
- [x] Snapshot history with device name, restore any snapshot
- [x] Automatic backup after changes settle and on quit; toggle
- [x] Size report: 100 MB per-skill exclusion, 1 GB warning
- [x] Left out of the backup: default patterns (dependencies, `.env`, logs) plus the user's own; left-out files survive merges and "use remote"
- [x] First-run "start fresh or restore" prompt
- [x] Setup and recovery dialogs; disconnect, revoke, delete-remote guidance

### 10. App shell

- [x] Open in editor: VS Code, Cursor, Windsurf, Zed, Sublime Text found on this computer, or the system default; chosen in Settings

- [x] Sidebar: dashboard, library, install, agents, presets, projects, backup, settings
- [x] Dashboard: stats, quick actions, recent activity, agent-control setup card
- [x] Command palette (⌘K): skills, presets, projects, actions
- [~] Theme (light / dark / system), text size, language. Only English ships; add `locales/<code>.json` + an entry in `LANGUAGES`
- [x] Tray icon, close behaviour (ask / hide / quit), single instance
- [x] File watcher refreshes the UI when skills change on disk or through the CLI
- [x] App self-update: checks `latest.json` in the newest GitHub release of this repository, downloads with a SHA-256 check, replaces the app and restarts (macOS, AppImage), runs the silent installer (Windows) or opens the package (.deb)
- [x] Diagnostics, log files, export logs zip, crash banner, report issue
- [x] Help / quick-start guide
- [x] Network proxy setting

### 11. CLI and agent control

- [x] `loadout` CLI: `repo`, `agents`, `skills`, `presets`, `git` groups
- [x] `--json` output with stable error codes, `--dry-run`, `--yes`, `--library <path>`
- [x] App publishes the CLI to `~/.loadout/bin` on start with a version stamp
- [x] Bundled `manage-skills` skill teaching agents to drive the CLI; one-click setup
- [x] Bash and Zsh tab completion; keyboard picker for multi-skill installs; `--dry-run` for install and update
- [ ] Homebrew (deferred): `scripts/homebrew.mjs` and `publish-homebrew.yml` are ready but unused

## Build order

1. Scaffold, tooling, app boots
2. Shared contract (types, API, events, settings)
3. Core: db → agents → library → installers → deploy → presets → workspaces → projects → updates → backup
4. Electron main: IPC bridge, watcher, tray, scheduler, updater, logs
5. Renderer: shell → library → install → agents → presets → projects → backup → settings → dashboard
6. CLI + bundled skill
7. Verify each feature in the running app, fix, update this list

## Known gaps

- Remove all data offers to keep linked skills as folders; the same "stop managing, keep them" is not yet offered on its own, without removing the library.
- Drag-and-drop install (Install → This computer) is built, but a real drag from the file manager has not been tried yet.
- Windows and Linux are untested. Symlink → junction → copy fallback and the `.cmd` CLI launcher exist but have never run.
- The CLI cannot read tokens saved by the desktop app (they are encrypted with the OS keychain), so `loadout git sync` to an HTTPS + token remote only works from the app. SSH remotes and git credential helpers work from both.
- Git clones are shallow and partial: files over 256 KB, and every file outside the chosen skills, arrive only when needed.
- An interrupted backup merge is not auto-recovered; sync stops with a clear error and "Use the remote backup" fixes it.
- Renderer components have unit tests only for pure logic (filters, grouping, backup mode). UI interaction tests (Playwright, `apps/desktop/e2e/`, `pnpm --filter @loadout/desktop test:ui`) run against the browser preview's in-memory data, so they check the renderer, not the real main process.

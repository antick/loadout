# Loadout

One desktop app to manage AI agent skills across every coding tool.

A skill is a folder with a `SKILL.md`. Loadout keeps every skill in one library
(`~/.loadout`) and deploys it — by symlink or copy — into the skills folder of each agent you
use: Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot and 49 more.

## Features

### Library

- One central library for every skill, in `~/.loadout` by default. The location can be changed
  in Settings; the library moves on the next start.
- Grid and list views, search across name, description, tags and source, sort by name, recently
  updated or recently added.
- Filters by source (local, imported, Git, marketplace), by status (deployed, not deployed, updates
  available, needs attention) and by tag, including **Untagged**.
- Tags: add and remove per skill, rename or delete a tag everywhere, edit tags for many skills at once.
- Skill detail panel: rendered `SKILL.md` with its frontmatter, file list, source details, per-agent
  switches, preset membership, and the projects that use the skill.
- Skill checks against the Agent Skills format. Errors (no `SKILL.md`, no frontmatter, YAML that
  does not parse, no name or description) put the skill under **Needs attention** with a
  "Needs fixing" badge that opens the editor. Warnings (name rules, name differs from the folder,
  over-long description or `SKILL.md`, links to files that are not in the skill) are listed in the
  skill's panel. The editor runs the same checks on unsaved text.
- Batch mode: deploy to agents, add to a preset, tag, update or delete many skills at once.
- Deleting a skill removes its library copy, preset links and every copy the app deployed.
- The database is rebuilt from the skill files if it is ever lost.

### Editor

- Edit any text file of a library skill in the app: file list, highlighted editor, live Markdown
  preview (side by side, stacked or on its own), search, undo, `⌘S` to save.
- A save never overwrites a change made on disk meanwhile: you see the difference and choose.
- Unsaved text survives closing the window or quitting; leaving the editor asks first.
- Every save keeps the version it replaced, on this computer; restore any of the last 20.
- Copied deployments are refreshed on save, except a copy an agent changed itself.
- Skills with a source are marked Edited, and an update lists your edits and asks before
  replacing them. Batch and automatic updates hold those skills back.
- Line endings, a byte-order mark and the executable bit of a file are kept.

### Install

- From a folder, from a `.zip` or `.skill` archive, or by dropping either onto the page.
- Import every skill inside a folder in one go, with live progress.
- From Git: `https`, `ssh`, `git@`, `owner/repo`, and GitHub tree URLs that carry a branch and a
  subfolder.
- Git preview: the repository is cloned first, then you tick the skills you want and can rename
  each before it lands in the library.
- Marketplace (skills.sh): hot, trending and all-time boards, keyword search, contributor filter,
  one-click install, open the skill on the web.
- Scan this machine: find skills already sitting in agent folders and import one or all of them.
- Progress for every install, cancel while cloning, timeouts, and a network proxy setting.
- After an install, deploy to agents straight from the success toast.

### Agents

- 54 agents built in, including Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot, OpenCode,
  Windsurf, Cline, Goose, Amp, Roo Code, Kilo Code, Qwen Code and OpenHands. Installed ones are
  detected automatically.
- Enable or disable each agent, or all at once. Disabling removes only what the app deployed.
- Custom agents with their own skills folder and an optional project-relative folder.
- Override the global or project skills folder of any built-in agent, and reset it.
- Reorder agents; the order is used everywhere in the app.
- Coding agents and personal-assistant agents are grouped separately.
- Agents that share one skills folder are recognised and handled safely.

### Deploying skills

- Symlink or copy, chosen in Settings. Falls back to a copy where symlinks are not available.
- Click an agent badge on any skill card to install or remove the skill for that agent.
- The app never overwrites or deletes a folder it did not put there. A conflict is reported with
  the exact path instead.
- A shared folder is only cleaned up when no other agent still uses that copy.

### Agent workspaces

- One page per agent listing everything in its skills folder, including skills installed outside
  the app.
- Status per skill: local only, in sync, local changed, library changed, conflict.
- Upload a skill to the library (it becomes managed), pull the library version, remove it from the
  agent, or delete a local skill.
- Add skills from the library with search, tag and source filters and Shift-click range selection.
- Batch remove managed skills and batch delete local-only skills.
- Local, Diff and Library tabs to compare a skill with its library copy.
- An overview of all agents with the real number of skills on disk.

### Presets

- Named groups of skills with a description and an icon. Create, edit, delete, reorder.
- Add and remove skills, reorder skills inside a preset.
- Per-skill, per-agent switches inside a preset.
- Preset pills in every workspace show active, partly installed (`n/m`) or inactive. One click adds
  the missing skills or removes the installed ones.
- Apply a preset to all enabled agents. Applying is a one-time copy, not a live link.

### Projects

- Link a project folder, or scan a folder tree to find projects that already have agent skills.
- Linked workspaces: manage any folder as a skills root, with its own disabled folder.
- Nested skill folders, and one row per skill across every agent folder in the project.
- Enable and disable project skills.
- Status against the library, with **Update library**, **Update project** and **Restore library
  version**.
- A guard refuses to update the library when several copies of a skill each hold their own changes.
- Add library skills to a project with an agent picker that remembers your choice.
- Preset pills, batch enable, disable, update, tag and delete, reorder and remove projects.

### Updates

- Check one skill or all of them for upstream changes. Update one or many.
- Knows when a repository moved but the skill itself did not change.
- Removal guard: shows the files an update would delete, in the library and in copied
  deployments, and changes nothing until you approve.
- Compare with upstream: per-file diff, and the upstream document next to yours.
- For local sources: re-import, point at a new source folder, or keep the local copy and stop
  tracking.
- Background checks every hour, 6 hours or day, with optional automatic updates. Updates that
  would delete files are never applied automatically.

### Backup and sync

- The library is a plain Git repository, so a backup can be cloned anywhere.
- Connect with a GitHub personal access token (a private repository is created for you), with
  GitHub device sign-in once an OAuth client id is set, or with any Git URL.
- Tokens are encrypted with the system keychain and never written to files or Git config.
- One button runs commit, merge, snapshot and push, and retries when another device pushed first.
- Changes merge per skill, so a rename on one computer combines with an edit on another.
- Conflicts never block a sync. Your version stays until you pick keep mine, use remote or keep
  both, and a safety snapshot is taken first.
- Snapshot history with the device that made each one. Restore any snapshot; the current state is
  saved first.
- Automatic backup after changes settle, plus a local save on quit.
- Skills over 100 MB stay out of the backup, with a warning past 1 GB in total.
- First run offers to start fresh or restore from a backup.
- Setup and recovery dialogs, and three ways to disconnect: this machine, revoke the
  authorisation, or delete the remote.

### Command line and agent control

- `loadout` CLI with `repo`, `agents`, `skills`, `presets` and `git` commands (including
  `skills validate` for the format checks, exit code 1 on errors), `--json` output
  with stable error codes, `--dry-run` and `--yes` for destructive commands, and `--library` to
  work on another library.
- The app publishes the CLI to `~/.loadout/bin/loadout` on start. It runs on the app's own
  runtime, so no Node install is needed.
- Standalone CLI executables for macOS, Linux (x64 and arm64) and Windows, for machines without
  the app: `pnpm --filter @loadout/cli run build:standalone -- --all`.
- A bundled `manage-skills` skill teaches your agents to install, deploy and update skills through
  the CLI. One-click setup from the Dashboard or Settings.
- The app notices changes made through the CLI, by an agent or by hand, and refreshes itself.

### App

- Two-part navigation: an icon rail at the far left (Home, Library, Agents, Presets, Projects,
  Backup, Settings, Help and a theme switch) and a sidebar beside it that lists the section picked
  in the rail. Pressing the shown section folds the sidebar away; `⌘B` does the same, and
  `⌘1`–`⌘4` jump to Library, Agents, Presets and Projects. Opening a page of another section
  switches the sidebar to it.
- The Library section has All skills, Install, one-click views (updates available, needs
  attention, not deployed) with counts, and the recently changed skills.
- Dashboard with library, coverage, agent, update, project and backup stats, quick actions, recent
  activity and recently updated skills.
- Command palette (`⌘K` / `Ctrl+K`) for skills, presets, projects, agents and actions.
- Light, dark and system theme, four text sizes.
- Tray icon, and a choice of what the close button does: ask, keep in tray or quit.
- Single instance, remembered window size, links open in your browser.
- Activity history, rotating logs, export logs as a zip, copy diagnostics, crash notice.
- Quick-start guide.

See [docs/FEATURES.md](docs/FEATURES.md) for current limitations and what still needs testing.

## Run locally

1. Install Node.js 22.12 or newer and Git. Use the pnpm version pinned in the
   `packageManager` field of [package.json](package.json), currently `12.4.2`:

   ```bash
   npm install --global pnpm@12.4.2
   ```

2. Open a terminal in your Loadout checkout. For this machine:

   ```bash
   cd /Users/pankaj/Projects/personal/loadout
   ```

   On another machine, use the folder where you cloned this repository.

3. Confirm the tools are available:

   ```bash
   node --version
   pnpm --version
   git --version
   ```

4. Install the project dependencies:

   ```bash
   pnpm install
   ```

5. Start the app:

   ```bash
   pnpm dev
   ```

   This builds the CLI and opens the Electron desktop app with development reload.
   Keep the terminal running. The real app opens in its own window; you do not need
   to open a browser or start a separate backend.

6. Stop development with `Ctrl+C` in that terminal. Run `pnpm dev` again next time.

No `.env` file or GitHub sign-in is required for basic local use. The default library
is `~/.loadout`; development uses your real library and agent folders.

## First use

1. If the first-run backup prompt appears, choose to start fresh or restore an existing backup.
2. Open **Install** and import a local folder/archive, a Git repository, or a marketplace skill.
3. Open **Agents**, select an agent, and use **Add Skills** to deploy skills from the library.
   Installing into the library alone does not deploy a skill to an agent.
4. Use **Presets** to group skills, or add a project to manage its project-local skills.
5. Optionally configure Git backup. A personal access token or Git remote URL works now;
   GitHub device sign-in requires an OAuth Client ID in **Settings → Backup**.

## CLI examples

Run these from the repository root:

```bash
pnpm cli --help
pnpm cli skills list
pnpm cli agents list
pnpm cli skills install /path/to/my-skill
pnpm cli skills deploy my-skill --agent claude_code --agent codex
pnpm cli skills status my-skill
```

Replace the example path, skill name and agent keys with your own. The app also publishes
the CLI to `~/.loadout/bin/loadout` when it starts. To let an agent manage skills,
use the agent-control setup card on the Dashboard.

## Development commands

| Command        | What it does                                  |
| -------------- | --------------------------------------------- |
| `pnpm dev`     | Build the CLI, then start the app with reload |
| `pnpm check`   | oxlint, oxfmt check, typecheck, all tests     |
| `pnpm test`    | vitest across packages                        |
| `pnpm build`   | Build the CLI and desktop app                 |
| `pnpm format`  | Format with oxfmt                             |
| `pnpm package` | Build installers into `apps/desktop/release`  |
| `pnpm cli …`   | Run the CLI from source                       |

Linux installers are built for x64 and arm64. Standalone CLI executables are built with
`pnpm --filter @loadout/cli run build:standalone` (this platform), `-- --target linux-arm64,win-x64`
or `-- --all`, into `packages/cli/dist/standalone` with a `SHA256SUMS` file. Targets other than
this computer's download the matching official Node binary; macOS targets need a Mac to sign.

Installer signing and cross-platform packaging verification are still pending;
`pnpm package` is a build command, not a guarantee of a signed release.

## Layout

| Path              | Purpose                                            |
| ----------------- | -------------------------------------------------- |
| `apps/desktop`    | Electron main, preload and the React renderer      |
| `packages/core`   | All behaviour, plain Node TypeScript (no Electron) |
| `packages/cli`    | The `loadout` command-line tool                    |
| `packages/shared` | Types, API contract, events, settings, formatters  |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the rules and
[docs/PLAN.md](docs/PLAN.md) for the feature checklist, and [TODO.md](TODO.md) for pending work.

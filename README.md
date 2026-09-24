# Loadout

One desktop app to manage AI agent skills across every coding tool.

A skill is a folder with a `SKILL.md`. Loadout keeps every skill in one library
(`~/.loadout`) and deploys it — by symlink or copy — into the skills folder of each agent you
use: Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot and 49 more.

## Install

Download the installer for your system from the
[latest release](https://github.com/antick/loadout/releases/latest).

The builds are not signed with an Apple or Windows certificate yet, so macOS and Windows ask
for one extra click the first time. [docs/INSTALL.md](docs/INSTALL.md) says which file to pick
and exactly what to click on macOS, Windows and Linux. After the first start, Loadout updates
itself.

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
  skill's panel. The editor runs the same checks on unsaved text, and each problem names its
  line; click it to jump there. `loadout skills validate` prints the line too.
- Batch mode: deploy to agents, add to a preset, tag, export, update or delete many skills at once.
- Export: one skill or a selection as a single `.zip`, from the skill's panel, its right-click menu
  or batch mode. Each skill is a folder inside, so the file installs again anywhere, including in
  Loadout on another computer. `loadout skills export <ref>… --out file.zip` does the same.
- Deleting a skill removes its library copy, preset links and every copy the app deployed.
- The database is rebuilt from the skill files if it is ever lost.

### Editor

- Edit any text file of a skill in the app, wherever it lives: in the library, in an agent's
  skills folder, or in a project. File list, highlighted editor, live Markdown preview (side by
  side, stacked or on its own), search, undo, `⌘S` to save, `⌘\` to step through the three
  layouts, `⌥Z` to wrap long lines. Open it with **Edit** on a skill's panel, its "…" menu or its
  right-click menu, by clicking one of its files, or with `⌘P` from anywhere.
- Right-click any skill card or row (Library, an agent, a project) for the same actions as its
  "…" menu. Library skills offer Edit, Show in file manager, Check now and Delete.
- Code blocks in every Markdown preview (the editor, a skill's panel) are coloured like the
  editor. Both know TypeScript, JavaScript, Python, shell, JSON, YAML, Markdown, Go, Rust, C,
  C++, C#, Java, Kotlin, Swift, Ruby, Perl, R, Lua, PowerShell, SQL, CSS, SCSS, HTML, XML, TOML,
  INI, diff and Dockerfile; others stay plain.
- A project skill usually has a copy per agent folder. Saving one copy also gives the change to
  the copies that were identical (switch it off per save), and says which copies kept their own
  changes. A copy that is really a link into the library is edited as the library skill.
- A save never overwrites a change made on disk meanwhile: you see the difference and choose.
- Unsaved text survives closing the window or quitting; leaving the editor asks first.
- Every save keeps the version it replaced, on this computer; restore any of the last 20.
- Copied deployments are refreshed on save, except a copy an agent changed itself.
- Skills with a source are marked Edited, and an update lists your edits and asks before
  replacing them. Batch and automatic updates hold those skills back.
- Line endings, a byte-order mark and the executable bit of a file are kept.

### Install

- From a folder, from a `.zip` or `.skill` archive, or by dropping either onto the page. An
  archive holding several skills opens the same pick-and-rename list as a Git repository.
- From a link to a `.zip` or `.skill` file, pasted where a Git URL goes. The skill is marked
  **Link**; checking it downloads the link again and compares, and **Download again** updates it.
- Import every skill inside a folder in one go, with live progress.
- From Git: `https`, `ssh`, `git@`, `owner/repo`, and GitHub tree URLs that carry a branch and a
  subfolder.
- Git preview: the repository is cloned first, then you tick the skills you want and can rename
  each before it lands in the library.
- No Git installed: public GitHub and GitLab repositories still install, update and preview. The
  app reads the branches over HTTPS and downloads the host's archive of the exact commit. Private
  repositories and other hosts need Git, and the Git tab says so.
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
- Agents inside WSL on Windows: point an agent at its Linux folder, such as
  `\\wsl.localhost\Ubuntu\home\you\.claude\skills`. Skills are always copied there, never
  linked, because Linux cannot follow a link back into Windows; saving a skill refreshes the copies.
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

### Instruction files

- The file each agent reads before every session: `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`,
  `QWEN.md`, `.goosehints`, `copilot-instructions.md` and others, globally and per project.
- An **Instructions** row on each agent's page (its global file) and on each project's page (the
  project's files). Agents that read the same file, such as `AGENTS.md` at a project root or a
  `CLAUDE.md` linked to it, share one entry that names them all.
- Click a file to edit it in the editor, with preview, earlier versions and the on-disk change
  guard. A file that does not exist yet is created empty first.
- Agents that read a folder of rule files (Cline, Roo Code, Kiro and others) are not covered.

### Agent workspaces

- One page per agent listing everything in its skills folder, including skills installed outside
  the app.
- Status per skill: local only, in sync, local changed, library changed, conflict.
- Upload a skill to the library (it becomes managed), pull the library version, remove it from the
  agent, or delete a local skill.
- Add skills from the library with search, tag and source filters and Shift-click range selection.
- Batch remove managed skills and batch delete local-only skills.
- Folders the agent skips (no `SKILL.md`, an empty folder, a link to nothing) are listed with why,
  and can be revealed or deleted.
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
- **Check updates** skips skills checked within the last hour; Settings → Skill updates sets how
  long a check is trusted, from "always ask again" to a day. **Check now** on one skill always asks.

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
  `skills validate` for the format checks, exit code 1 on errors, and `skills export`),
  `--json` output with stable error codes, `--dry-run` and `--yes` for destructive commands, and
  `--library` to work on another library.
- The app publishes the CLI to `~/.loadout/bin/loadout` on start. It runs on the app's own
  runtime, so no Node install is needed.
- Standalone CLI executables for macOS, Linux (x64 and arm64) and Windows, for machines without
  the app: `pnpm --filter @loadout/cli run build:standalone -- --all`.
- A bundled `manage-skills` skill teaches your agents to install, deploy and update skills through
  the CLI. One-click setup from the Dashboard or Settings.
- The app notices changes made through the CLI, by an agent or by hand, and refreshes itself.
  That covers the library, agents' skills folders and every linked project's skills folders.

### Storage

- Everything lives in one folder, `~/.loadout`: the library, the command-line tool and the app's
  own files (window size, encrypted GitHub sign-in, interface preferences, drafts, cache) in
  `~/.loadout/app`. Older versions kept the app's files in the OS app data folder; they are moved
  over once and the old folder is removed.
- **Settings → Storage** shows each part with its path and size. Editor history, the download
  cache, logs and the app's cache can be cleared; interface preferences reset and unsaved drafts
  discarded.
- The library can be moved (the rest stays in `~/.loadout`). A move only goes into an empty
  folder, moves all or nothing, and can come back to `~/.loadout`.
- **Remove all data** takes Loadout's links out of agent folders (copies too, if asked), deletes
  the data folder and a moved library, deletes the keychain key on macOS, and quits. Project folders
  and the backup repository are left alone.
- Deleted outside the app: links left pointing at deleted skills are removed on the next start. If
  the data folder goes while the app runs, it stops writing and offers to restart fresh or quit.

### App

- Navigation in three parts. The **activity bar** at the far left: Home, Library, Agents,
  Presets, Projects, then Backup, Settings and Help. The **sidebar** beside it lists the section
  picked there: Home (dashboard, first steps, guide), Library (all skills, install, views with
  counts, recently changed), Agents, Presets, Projects, and Settings (its sections). Each button
  also opens its section's main page (all skills, all agents, all presets, all projects); pressed
  again from a page inside the section (a project, a preset) it goes back to that main page, and
  on the main page it folds the sidebar away. A bar marks the section picked. `⌘B` folds the
  sidebar, `⌘1`–`⌘5` jump to Home, Library, Agents, Presets and Projects, and opening a page
  switches the sidebar to its section. Drag the
  sidebar's edge to resize it (double-click resets); the width is remembered. In a narrow window
  the sidebar gives way first so the page keeps at least 600px, and grows back to the width you
  chose when the window widens. The editor and its preview each keep at least 280px side by side
  (160px stacked).
- Each project in the sidebar opens to list its skills; clicking one opens it on the project page.
- While a skill is edited, the sidebar shows its files with a way back, so the editor has no file
  column of its own. Picking a section in the activity bar brings the section back; the files
  button in the editor's status line brings the files back.
- One title bar across the window, clear of the macOS window buttons, naming the sidebar section
  and the page.
- A **status bar** along the bottom: backup state, skill count, skills that need attention,
  available updates and background installs on the left; agents, deploy mode (symlinks or copies)
  and the theme menu on the right. Every entry opens the page that explains it.
- Dashboard with library, coverage, agent, update, project and backup stats, quick actions, recent
  activity and recently updated skills.
- Command palette (`⌘K` / `Ctrl+K`) for skills, presets, projects, agents and actions, including
  "Open a skill in the editor" (`⌘P` / `Ctrl+P`).
- Light, dark and system theme (from the status bar or Settings), four text sizes.
- Tray icon, and a choice of what the close button does: ask, keep in tray or quit.
- Single instance, remembered window size, links open in your browser.
- Activity history, rotating logs, export logs as a zip, copy diagnostics, crash notice.
- Updates itself. It checks for a new version on start and every six hours, and offers it in a
  message and in Settings → About. **Update** downloads it with progress and checks it against
  the release's SHA-256 checksum. **Restart now** closes the app, swaps in the new version and
  opens it again: in place on macOS and for an AppImage, through a silent installer on Windows.
  A `.deb` install opens the new package in the system installer. The next start says whether
  the update arrived. When the app can't replace itself, for example when it runs from the disk
  image or from a folder the user can't write to, it says why and links to the release page.
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

## Website

`apps/landing` is the landing page at [loadout.potion.sh](https://loadout.potion.sh), an Astro
static site. `pnpm exec turbo run build --filter=@loadout/landing` builds it. Vercel builds and
serves it from `vercel.json`; links such as where installers are downloaded live in
`apps/landing/src/lib/site.ts`. The agent list on the page comes from `@loadout/shared`, so it
always matches the app.

## Releases

GitHub Actions runs `pnpm check` on Linux and macOS for every push to `main` and every pull
request (`.github/workflows/ci.yml`).

Installers are published as GitHub releases of this repository. The app's update check reads
`latest.json` from the newest published release, and the landing page links there.

`.github/workflows/release.yml` builds macOS (Apple Silicon and Intel, DMG and ZIP), Windows
(NSIS installer) and Linux (AppImage and DEB, x64 and arm64) installers and the standalone CLI
executables. It then writes `latest.json` (version, and per system the download link, size and
SHA-256) with `apps/desktop/scripts/update-feed.mjs`, and puts everything in a **draft** release.

### Cut a release

1. Set the new version in `apps/desktop/package.json` and commit it.
2. Tag the commit with that version and push the tag, for example for 0.2.0:

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

   Or run **Release builds** by hand from this repository's Actions tab.

3. When the workflow finishes, open github.com/antick/loadout/releases, check the draft and click
   **Publish release**.

Publishing puts the release live. Every running copy of Loadout offers it within six hours, or
right away through Settings → About → Check for updates. A draft is invisible to users and to
the update check.

A tag that doesn't match the version in `apps/desktop/package.json` stops the workflow. Don't
mark a release as a pre-release: the update check only sees the newest full release.

### Test an update locally

Updates can be tried end to end on one Mac without publishing anything:

1. Build two versions: `pnpm build`, then in `apps/desktop` run
   `pnpm exec electron-builder --config electron-builder.yml --mac zip --arm64 --publish never`
   once as is and once with `-c.extraMetadata.version=0.1.1` added.
2. Unzip the older zip somewhere you can write to, with `ditto -x -k <zip> <folder>`.
3. Put the newer zip in its own folder. Write its feed with
   `node apps/desktop/scripts/update-feed.mjs <folder> --version 0.1.1 --base-url http://127.0.0.1:8765`,
   and serve the folder with `python3 -m http.server 8765 --bind 127.0.0.1`.
4. Start the older app with `LOADOUT_UPDATE_FEED=http://127.0.0.1:8765/latest.json` set, and click
   **Update**, then **Restart now**.

`LOADOUT_UPDATE_FEED` is also the only way a development build (`pnpm dev`) checks for updates;
a development build never replaces itself.

## Layout

| Path              | Purpose                                            |
| ----------------- | -------------------------------------------------- |
| `apps/desktop`    | Electron main, preload and the React renderer      |
| `apps/landing`    | Landing page at loadout.potion.sh                  |
| `packages/core`   | All behaviour, plain Node TypeScript (no Electron) |
| `packages/cli`    | The `loadout` command-line tool                    |
| `packages/shared` | Types, API contract, events, settings, formatters  |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the rules and
[docs/PLAN.md](docs/PLAN.md) for the feature checklist, and [TODO.md](TODO.md) for pending work.

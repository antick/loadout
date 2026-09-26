# Loadout features

Loadout manages AI agent skills in one library and makes them available to your agents
and projects. A skill is a folder containing a `SKILL.md` file.

For setup and usage, see the [README](../README.md#run-locally).
For planned work and detailed status, see [PLAN.md](PLAN.md) and [TODO.md](../TODO.md).

## Features in detail

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
  a description under 20 characters, an over-long description or `SKILL.md`, links to files that
  are not in the skill) are listed in the
  skill's panel. The editor runs the same checks on unsaved text, and each problem names its
  line; click it to jump there. `loadout skills validate` prints the line too.
- Batch mode: deploy to agents, add to a preset, tag, export, update or delete many skills at once.
- Export: one skill or a selection as a single `.zip`, from the skill's panel, its right-click menu
  or batch mode. Each skill is a folder inside, so the file installs again anywhere, including in
  Loadout on another computer. `loadout skills export <ref>… --out file.zip` does the same.
- New skill: a name (checked against the Agent Skills rules and the library as you type, and also
  the folder name) and a description write a `SKILL.md` with a short outline, then the editor
  opens on it. From the Library header, its empty state, Home, or the command palette. Its
  **Create in** choice can put it straight in a linked project instead (see Projects).
  `loadout skills create <name> --description <text>` does the same.
- Rename a skill from its right-click menu or its panel: the library folder, the `name` in
  `SKILL.md`, every deployment and links inside projects follow the new name. As you type, a
  dry run shows what moves and says why a name cannot be used: taken, badly formed, a folder
  of that name in an agent's way, or a copy edited in an agent's folder (upload or discard
  those edits first). Copies inside projects keep their old name. Tags, presets, safety reports
  and edit history stay with the skill. `loadout skills rename <ref> <new-name> [--dry-run]`
  does the same.
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

- From a folder, from an archive (`.zip`, `.skill`, `.tar`, `.tar.gz`, `.tgz`), or by dropping either onto the page. An
  archive holding several skills opens the same pick-and-rename list as a Git repository.
- From a link to an archive in any of those formats, or to a lone `SKILL.md`, pasted where a Git
  URL goes. The skill is marked **Link**; checking it downloads the link again and compares, and
  **Download again** updates it.
- From a site that publishes skills at `/.well-known/agent-skills/index.json` (or the older
  `/.well-known/skills/`), e.g. `https://mintlify.com/docs`. Both index formats are read, each
  download must match the digest the site lists, and a path only takes the skills below it.
  Checking downloads the skill again; one the site stopped listing shows as missing at source.
- A download link that moves to another site (not `github.com` to `codeload.github.com`, which is
  one site) says so in the preview, and Import stays off until you tick that you trust the site.
  The CLI asks for `--yes`.
- Import every skill inside a folder in one go, with live progress.
- From Git: `https`, `ssh`, `git@`, `owner/repo`, `owner/repo/path/in/repo`, `github:` and
  `gitlab:` prefixes, GitHub and GitLab tree URLs that carry a branch and a subfolder, a GitHub
  link to a skill's `SKILL.md`, and a skills.sh skill page. `#branch` picks a branch or tag.
- Naming a skill (`owner/repo@skill`, `#main@skill`) ticks only that skill in the preview; a name
  the repository does not hold is reported instead of guessed.
- Paste the install command a skill page shows (`npx skills add owner/repo --skill x -a
claude-code`, also `bunx`, `pnpm dlx`, `--all` and `'*'`): its source is previewed with the named
  skills ticked, and after importing the deploy panel opens with the named agents ticked. Agent
  names Loadout does not know are listed, not guessed. Nothing deploys until you confirm.
- Git preview: the repository is cloned first, then you tick the skills you want and can rename
  each before it lands in the library.
- No Git installed: public GitHub and GitLab repositories still install, update and preview. The
  app reads the branches over HTTPS and downloads the host's archive of the exact commit. Private
  repositories and other hosts need Git, and the Git tab says so.
- Marketplace (skills.sh): hot, trending and all-time boards, keyword search, contributor filter,
  one-click install, open the skill on the web.
- Offline, a board or a search falls back to the last copy fetched, and the page says so with
  its age ("Could not reach skills.sh. This is the copy from 2 hours ago.") and **Try again**.
  The last 100 searches are kept for this.
- Click a marketplace skill to read it before installing: the security audits skills.sh publishes
  (pass, warn or fail per auditor, with a link to each), its `SKILL.md` found in its GitHub
  repository, and, when it is already in the library, which agents have it. Details are cached
  for half an hour; a part that cannot be loaded says so and the rest still shows.
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

### Safety check

- Optional, with NVIDIA SkillSpector (open source) installed on the computer. Settings → Safety
  says whether it was found (on `PATH`, in `~/.local/bin` or Homebrew, or at a path you set) and
  shows the `uv tool install` command when it was not. Without it nothing changes.
- Static checks only (`--no-llm`): no AI model and no API key.
- **Before every install** (folder, archive, Git, link, site, marketplace, agent folders), before
  anything is written. A flagged skill (risk score over 50, or a high or critical finding) is not
  installed: a dialog lists its findings (severity, category, file and line, the text that matched,
  why) with **Don't install** focused and **Install anyway** beside it. Batch imports skip
  flagged skills and list them as failures. A scanner that fails or times out never blocks.
  Switch the check off in Settings.
- Reports are kept per skill in the library cache. Flagged and "review" skills carry a chip in the
  library; the skill panel has a **Safety** tab with the full report and **Check again**. A report
  of a skill that changed since is marked as such.
- Check the library for new and changed skills, or all again, from Settings → Safety or the
  command palette, with progress.
- CLI: `skills scan <ref>… | --all [--force]`; installs fail with `UNSAFE` and the findings, and
  `--accept-risk` installs anyway. The bundled agent skill tells agents never to accept on their
  own.
- Not covered yet: skill updates are not checked.

### Agent workspaces

- One page per agent listing everything in its skills folder, including skills installed outside
  the app.
- Status per skill: local only, in sync, local changed, library changed, conflict.
- **Loaded twice**: a skill in the agent's own folder that another folder it also reads holds as
  well is marked, and its panel says where the other copy is. A link to the same folder counts as
  one copy. Which folders each agent reads comes from its own documentation (for example Cursor
  also reads `~/.agents/skills`, `~/.claude/skills` and `~/.codex/skills`), and the agent's page
  lists them under its folder.
- Scanning for skills to import reads each shared folder once: under its owner when that agent is
  installed, else under the installed agents that read it.
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
- **Suggested** projects: folders from Claude Code's project list, the recent folders of Cursor,
  VS Code and Windsurf, and Git repositories up to two levels inside `~/Projects`, `~/code` and
  similar folders. Most recently worked on first, with where each was seen and the agent skills
  folders it already has; filter, tick and add. Looked for only when the tab opens. On macOS,
  folders in Desktop, Documents, Downloads, iCloud or an external drive are listed but not opened
  (that would make macOS ask for access out of the blue) until you add them.
- Pin projects (right-click in the sidebar, or the project page's "…" menu): they head the
  Projects sidebar under **Pinned**. With more than six projects, **Frequent** lists the three
  opened most in the last 30 days (a visit counts once). Both are kept on this computer only.
- Linked workspaces: manage any folder as a skills root, with its own disabled folder.
- Nested skill folders, and one row per skill across every agent folder in the project.
- Enable and disable project skills.
- A switched-on project skill that the same installed agent also loads from elsewhere is marked
  **Loaded twice**, with the other copy's path in its panel: its global folder, another global
  folder it reads, or another folder of the project it reads (Copilot reads `.github/skills`,
  `.claude/skills` and `.agents/skills`).
- Project folders follow each agent's documentation: Copilot `.github/skills`; Codex, Amp,
  Replit and Antigravity `.agents/skills`; Crush `.crush/skills`; Goose `.goose/skills`; Windsurf
  `.windsurf/skills`.
- Status against the library, with **Update library**, **Update project** and **Restore library
  version**.
- A guard refuses to update the library when several copies of a skill each hold their own changes.
- Add library skills to a project with an agent picker that remembers your choice.
- **New skill** on a project page writes a new skill straight into the project's folders for the
  agents you tick (the remembered choice, or else the first usual agent), not the library, and
  opens that copy in the editor. **Add to library** brings it into the library later.
- Preset pills, batch enable, disable, update, tag and delete, reorder and remove projects.

### Skill updates

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

- `loadout doctor`: one report of everything that needs a look, grouped by area: skill format
  problems, deployments missing on disk, copies changed in an agent's folder, skills loaded
  twice, broken folders and skills outside the library in agent folders, failed update checks,
  backup conflicts, skills the safety check flagged, missing project folders and library
  location problems. Agents sharing a folder are named in one line. Exit code 1 on any error;
  `--all` adds what is only good to know, such as available updates.
- `loadout` CLI with `repo`, `agents`, `skills`, `presets` and `git` commands (including
  `skills create`, `skills validate` for the format checks, exit code 1 on errors,
  `skills list --query` for a text search, `skills diff` to compare copies or the source with the
  library, and `skills export`),
  `--json` output with stable error codes, `--dry-run` for destructive commands and for
  `skills deploy` / `skills undeploy`, `--yes` for destructive commands, and
  `--library` to work on another library.
- The app publishes the CLI to `~/.loadout/bin/loadout` on start. It runs on the app's own
  runtime, so no Node install is needed.
- Without the app: `pnpm add -g @antick/loadout` (Node.js 22.13 or newer), or the standalone
  executables attached to each release. `loadout --version` prints the app's version.
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
  available updates and background installs on the left; agents, deploy mode (symlinks or copies),
  the theme menu and the version on the right. Every entry opens the page that explains it; the
  version opens this release's notes or a new GitHub issue with the version and system filled in.
- Dashboard with library, coverage, agent, update, project and backup stats, quick actions, recent
  activity and recently updated skills.
- Command palette (`⌘K` / `Ctrl+K`) for skills, presets, projects, agents and actions, including
  "Open a skill in the editor" (`⌘P` / `Ctrl+P`).
- Four colour palettes (Flight gear, the default, then Blueprint, Risograph and Iris & butter), each in light and dark, plus light, dark or system mode. Pick them in Settings (with a preview of each) or from the status bar; the choice is remembered and applied before the window first draws. Four text sizes.
- Tray icon, and a choice of what the close button does: ask, keep in tray or quit.
- Single instance, remembered window size, links open in your browser.
- Activity history, rotating logs, export logs as a zip, copy diagnostics, crash notice. Settings →
  About also has Report a bug and Release notes.
- Updates itself. It checks for a new version on start and every six hours, and offers it in a
  message and in Settings → About. **Update** downloads it with progress and checks it against
  the release's SHA-256 checksum. **Restart now** closes the app, swaps in the new version and
  opens it again: in place on macOS and for an AppImage, through a silent installer on Windows.
  A `.deb` install opens the new package in the system installer. The next start says whether
  the update arrived. When the app can't replace itself, for example when it runs from the disk
  image or from a folder the user can't write to, it says why and links to the release page.
- Quick-start guide.

## Current limitations

| Area                    | Current state                                                                                                                                                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GitHub sign-in          | Device sign-in requires an OAuth Client ID in Settings. Personal access tokens and Git remote URLs are supported.                                                                                                                                                                                                  |
| Languages               | Only English is available. Chinese translations and first-run language detection are not implemented.                                                                                                                                                                                                              |
| Release distribution    | Builds for macOS, Windows and Linux go into a draft GitHub release (`.github/workflows/release.yml`), with the update feed the app reads. The app updates itself. Builds are not signed with an Apple or Windows certificate (macOS gets an ad-hoc signature); `docs/INSTALL.md` covers the first-launch warnings. |
| Installer formats       | DMG/ZIP, Windows NSIS, AppImage and DEB are configured. MSI and RPM are not configured.                                                                                                                                                                                                                            |
| Git subfolder downloads | Installation downloads a shallow copy of the whole repository, even when only one subfolder is needed.                                                                                                                                                                                                             |
| CLI credentials         | The CLI cannot read tokens saved by the desktop app. Use SSH or a Git credential helper for CLI backup authentication.                                                                                                                                                                                             |
| External skill folders  | CLI `--library` selects a complete Loadout library. Operating directly on an arbitrary skill checkout while keeping app state elsewhere is not supported.                                                                                                                                                          |
| Skill editor            | Edits existing files only (no create, rename or delete). Edits made outside the app are not tracked, so an update does not ask before replacing them. A local-folder skill shows "Update available" after an in-app edit. Mixed line endings are saved as the file's majority ending. See TODO item 14.            |
| Agent icons             | Agents use coloured initials; brand logos are not included.                                                                                                                                                                                                                                                        |

## CLI features

The CLI supports the `repo`, `agents`, `skills`, `presets` and `git` command groups and `doctor`,
JSON output, a custom library location and dry runs for selected commands. It can install,
list, inspect, validate, deploy, remove, update and adopt skills; manage preset membership and deployment;
and sync, pull or restore Git backups. Run `pnpm cli --help` for usage.

The following capabilities are not currently available through the CLI:

- Export a skill to an arbitrary destination folder.
- Search the marketplace from the CLI.
- Change an existing skill to a Git source while preserving its identity, tags and deployments.
- Adopt multiple paths in one command, with optional Git-source association.
- Preview preset deployment and removal using `--dry-run`.
- Additional library filters: preset, deployed agent, untagged and no-preset.
- Global tag listing/renaming/deletion and replacing a skill's complete tag set.
- Preset editing, deployment preview and dedicated deployment-status commands.
- Separate Git clone, commit and push commands. Loadout provides combined `git sync`,
  plus pull and restore.

Some of these capabilities are available in the desktop interface; this list describes
limits of the CLI only.

## Verification still needed

These are testing gaps, not missing implementations:

- Windows and Linux operation, including deployment fallback, CLI launcher, credential storage,
  window controls and tray behaviour.
- Two real computers syncing through a private remote, including conflicting edits and renames.
- Linked workspace dialog and native folder pickers.
- Library batch deployment, tagging, updating and deletion.
- Update removal-approval dialog.
- Backup recovery and conflict-resolution dialogs.
- Tray menu actions.
- Dragging a real folder or archive from the file manager.
- Marketplace paging, filtering, search, installation and deployment handoff.
- Scanning/importing skills from several agent folders.
- Library relocation and restart, proxy settings and automatic update intervals.
- Dashboard agent-control setup followed by an agent using the published CLI.
- Skill editor on Windows and Linux (line endings, file permissions, copy refresh), and its
  update guard against a real Git remote rather than a local fixture.
- Icon rail and sidebar on Windows and Linux, where there are no macOS window buttons to clear.

Renderer tests currently cover selected pure logic; automated UI interaction tests are still
pending. See [TODO.md](../TODO.md) for the detailed verification checklist and additional
maintenance issues, such as interrupted-merge recovery.

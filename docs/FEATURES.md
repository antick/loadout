# Loadout features

Loadout manages AI agent skills in one library and makes them available to your agents
and projects. A skill is a folder containing a `SKILL.md` file.

For setup and usage, see the [README](../README.md#run-locally).
For planned work and detailed status, see [PLAN.md](PLAN.md) and [TODO.md](../TODO.md).

## Available features

| Feature                  | Loadout support                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Central library          | Shared skill library, custom storage location, metadata recovery from files                                                                                                                                                                                                                                                                                             |
| Local installation       | Import folders, `.zip` and `.skill` files; drag-and-drop support                                                                                                                                                                                                                                                                                                        |
| Git installation         | HTTPS, SSH, repository shorthand, branch/subfolder URLs, preview and select skills before importing                                                                                                                                                                                                                                                                     |
| Marketplace              | skills.sh browsing, hot/trending/all-time boards, search, filters, installation                                                                                                                                                                                                                                                                                         |
| Discover existing skills | Scan agent folders and import skills installed outside Loadout                                                                                                                                                                                                                                                                                                          |
| Library organisation     | Search, grid/list views, tags, source filters, tag filters, Untagged filter                                                                                                                                                                                                                                                                                             |
| Skill inspection         | Rendered `SKILL.md`/`README.md`, file listings, source details, comparisons with upstream                                                                                                                                                                                                                                                                               |
| Skill checks             | Agent Skills format checks on every skill: errors feed Needs attention, warnings shown in the panel, live checks in the editor, `skills validate` in the CLI                                                                                                                                                                                                            |
| Skill editor             | Edit any text file of a skill in the library, an agent folder or a project, with a live preview beside or under the text (drag the edge between them); copy the file's path or show it in the file manager from the top bar; guards against outside changes, keeps drafts and earlier versions, refreshes copied deployments, carries project edits to identical copies |
| Instruction files        | Edit and create the instruction file each agent reads (`CLAUDE.md`, `AGENTS.md`, …), globally and per project; shared files are listed once                                                                                                                                                                                                                             |
| Agent support            | 54 built-in agents, detection, custom agents, custom paths, enable/disable, ordering                                                                                                                                                                                                                                                                                    |
| Deploy skills            | Symlink or copy, per-agent toggles, protection against overwriting unmanaged content                                                                                                                                                                                                                                                                                    |
| Global workspaces        | View each agent's actual skills; upload to library, pull changes, remove skills                                                                                                                                                                                                                                                                                         |
| Project workspaces       | Project discovery, nested skills, per-agent copies, enable/disable, two-way library sync                                                                                                                                                                                                                                                                                |
| Linked workspaces        | Manage an arbitrary folder as a skill workspace                                                                                                                                                                                                                                                                                                                         |
| Add-from-library picker  | Search/filter, agent selection, select-all, Shift-click selection, batch installation                                                                                                                                                                                                                                                                                   |
| Presets                  | Create/edit/delete, icons, ordering, membership, per-agent settings, workspace activation                                                                                                                                                                                                                                                                               |
| Batch operations         | Deploy, tag, update, delete, add to presets; project enable/disable and sync                                                                                                                                                                                                                                                                                            |
| Skill updates            | Individual/batch checks and updates, scheduled checks, optional automatic application                                                                                                                                                                                                                                                                                   |
| Update protection        | Show files an update would delete, or edits it would replace, and require approval                                                                                                                                                                                                                                                                                      |
| Local source management  | Re-import, change the local source folder, detach from source                                                                                                                                                                                                                                                                                                           |
| Git backup               | Git remotes, automatic backup, snapshots, restore, first-run restore flow                                                                                                                                                                                                                                                                                               |
| Multi-device sync        | Merge changes per skill; resolve conflicts with keep mine/use remote/keep both                                                                                                                                                                                                                                                                                          |
| Backup controls          | Device names, size reporting, oversized-skill exclusions, disconnect/recovery flows                                                                                                                                                                                                                                                                                     |
| Agent-driven management  | Bundled CLI and `manage-skills` skill, with setup inside the app                                                                                                                                                                                                                                                                                                        |
| Navigation               | Activity bar that opens each section's main page (all presets and all projects included) plus a resizable sidebar per section (home, library, agents, presets, projects with their skills, settings), the editor's files in the sidebar, ⌘B to fold, ⌘1–⌘5 shortcuts, one title bar, a status bar with backup, library, agents, deploy mode and theme                   |
| App conveniences         | Dashboard, command palette, themes, text sizes, tray, close behaviour, filesystem refresh                                                                                                                                                                                                                                                                               |
| Diagnostics              | Activity history, logs, ZIP log export, crash reporting                                                                                                                                                                                                                                                                                                                 |
| Network settings         | Proxy configuration                                                                                                                                                                                                                                                                                                                                                     |
| Storage                  | Sizes of every part of `~/.loadout`, clearing history, cache, logs and app cache, resetting interface preferences, removing all data; the library can move and come back                                                                                                                                                                                                |
| App updates              | Checks the public releases on start and every six hours; downloads with progress and a SHA-256 check; replaces itself and restarts on macOS and AppImage, runs the silent installer on Windows, opens the new `.deb` in the system installer; reports on the next start whether it arrived                                                                              |

## Current limitations

| Area                    | Current state                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub sign-in          | Device sign-in requires an OAuth Client ID in Settings. Personal access tokens and Git remote URLs are supported.                                                                                                                                                                                                                                              |
| Languages               | Only English is available. Chinese translations and first-run language detection are not implemented.                                                                                                                                                                                                                                                          |
| Release distribution    | Builds for macOS, Windows and Linux go into a draft release in the public `antick/loadout-releases` repository (`.github/workflows/release.yml`), with the update feed the app reads. The app updates itself. Builds are not signed with an Apple or Windows certificate (macOS gets an ad-hoc signature); `docs/INSTALL.md` covers the first-launch warnings. |
| Installer formats       | DMG/ZIP, Windows NSIS, AppImage and DEB are configured. MSI and RPM are not configured.                                                                                                                                                                                                                                                                        |
| Git subfolder downloads | Installation downloads a shallow copy of the whole repository, even when only one subfolder is needed.                                                                                                                                                                                                                                                         |
| CLI credentials         | The CLI cannot read tokens saved by the desktop app. Use SSH or a Git credential helper for CLI backup authentication.                                                                                                                                                                                                                                         |
| External skill folders  | CLI `--library` selects a complete Loadout library. Operating directly on an arbitrary skill checkout while keeping app state elsewhere is not supported.                                                                                                                                                                                                      |
| Skill editor            | Edits existing files only (no create, rename or delete). Edits made outside the app are not tracked, so an update does not ask before replacing them. A local-folder skill shows "Update available" after an in-app edit. Mixed line endings are saved as the file's majority ending. See TODO item 14.                                                        |
| Agent icons             | Agents use coloured initials; brand logos are not included.                                                                                                                                                                                                                                                                                                    |

## CLI features

The CLI supports the `repo`, `agents`, `skills`, `presets` and `git` command groups,
JSON output, a custom library location and dry runs for selected commands. It can install,
list, inspect, validate, deploy, remove, update and adopt skills; manage preset membership and deployment;
and sync, pull or restore Git backups. Run `pnpm cli --help` for usage.

The following capabilities are not currently available through the CLI:

- Export a skill to an arbitrary destination folder.
- Search the marketplace from the CLI.
- Change an existing skill to a Git source while preserving its identity, tags and deployments.
- Adopt multiple paths in one command, with optional Git-source association.
- Preview skill/preset deployment and removal using `--dry-run`.
- Additional library filters: text query, preset, deployed agent, untagged and no-preset.
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

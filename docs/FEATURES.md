# Loadout features

Loadout keeps AI agent skills (folders with a `SKILL.md`) in one library and puts them in your
agents' and projects' folders. Setup: [README](../README.md#run-locally). Checklist: [PLAN.md](PLAN.md).

## Library

- One library in `~/.loadout`; can be moved in Settings.
- Grid or list, search, sort, and filters by source, status and tag.
- Tags: add, remove, rename, delete, edit for many skills at once.
- Skill panel: rendered `SKILL.md`, files, source, per-agent switches, presets, projects.
- Format checks against the Agent Skills rules, with line numbers; errors mark the skill "Needs fixing".
- **Manual only** badge for skills with `disable-model-invocation: true`.
- **Sources** page: one card per repository, archive or link; find new skills, update, check, remove.
- A check notices skills a repository gained since you last looked; skipped or dismissed ones stay quiet.
- Optional: add those new skills by themselves (still safety-checked; a name in use waits for you).
- Batch deploy, tag, add to preset, export, update and delete.
- Export skills as one `.zip` that installs anywhere.
- New skill from a name and description; opens in the editor.
- Rename a skill; deployments and project links follow. Shows a dry run as you type.
- Delete goes to Recently removed, with Undo.
- The database rebuilds itself from the skill files.

## Editor

- Edit any skill file in the library, an agent folder or a project, with live Markdown preview.
- Syntax colouring for about 30 languages, in the editor and in previews.
- Saving one project copy updates the identical copies too.
- Never overwrites a change made on disk meanwhile; unsaved text survives quitting.
- Last 20 versions of every file kept on this computer.
- New, rename, move and delete files and folders in library skills.
- Keeps line endings, byte-order mark and the executable bit.

## Install

- From a folder, an archive (`.zip`, `.skill`, `.tar`, `.tar.gz`, `.tgz`), drag and drop, or a whole folder of skills.
- From a link to an archive or a `SKILL.md`, or a site publishing `/.well-known/agent-skills/`.
- From Git: URLs, `owner/repo`, tree links, `#branch`, `owner/repo@skill`, and pasted `npx skills add …` commands.
- Works without Git for public GitHub and GitLab repositories.
- The import list says what each skill will do: New, In library, Name in use (and its new name), Same name twice.
- A name in use can instead replace the library skill, keeping its tags, presets and agents; the old version goes to Recently removed.
- Skills grouped by folder with a tick-all per folder; a filter for sources with 8 or more skills.
- A download that moves to another site needs your OK first.
- Marketplace (skills.sh): boards, search, audits and `SKILL.md` before installing; works offline from cache.
- Scan this machine for skills already in agent folders and import them.
- Progress, cancel, timeouts, proxy; deploy straight from the success toast.

## Agents

- 69 agents built in and detected automatically; custom agents too.
- Folders, home-folder variables and reload behaviour taken from each agent's own docs.
- Enable, disable, reorder, and override any agent's folders.
- Agents inside WSL on Windows (always copied, never linked).
- Says when each agent sees changed skills: live, new session or restart.
- Agents that share one folder are handled safely.

## Deploying

- Symlink or copy; falls back to a copy where links don't work.
- Never overwrites or deletes a folder Loadout didn't put there.
- Copies follow library changes, unless the copy was edited in the agent's folder.

## Instruction files

- Edit `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` and the rest, globally and per project.

## Safety check

- Optional, with NVIDIA SkillSpector installed; static checks, no AI or API key.
- Runs before every install and update; a flagged skill needs your OK.
- Reports kept per skill, shown on the skill's Safety tab.

## Agent pages

- Everything in an agent's skills folder, including skills installed outside Loadout.
- Status per skill (local only, in sync, changed), and "Loaded twice" warnings.
- Upload to library, pull from library, remove, delete; compare local and library.
- Lists folders the agent skips, and why.

## Presets

- Named groups of skills with per-agent switches; apply to agents in one click.

## Projects

- Link project folders, scan for them, or pick from suggested ones.
- Every skill in the project's agent folders, with status against the library.
- Enable, disable, update either way, add library skills, create new project skills.
- **`skills.toml`**: lists a project's skills and agents; `skills-lock.json` pins exact commits. Apply from the project page or `loadout project apply`. Never overwrites hand edits unless forced.

## Skill updates

- Check and update one or all; background checks every 1, 6 or 24 hours.
- Shows files an update would delete and asks first.
- Your edits are never replaced without asking; the old version goes to Recently removed.
- Per-file diff against upstream.

## Backup and sync

- The library is a Git repository; back up to GitHub or any Git remote.
- A public GitHub repository is only used after you confirm; nothing is saved or uploaded before.
- One-button sync with per-skill merging; conflicts never block.
- When another device changed something, sync shows what comes in and goes out first, with each skill's files; you choose whether deletions happen here.
- A long sync review can be searched and filtered by kind of change.
- Compare a conflict file by file before choosing a version.
- Keep all your versions, or use all the remote ones, in one step when several skills conflict.
- Shows what a running sync is doing: saving, downloading, merging, uploading.
- A skill deleted on another device is kept in Recently removed; restoring it brings it back everywhere.
- A sync that would delete many skills here stops and waits for you to review it.
- Snapshots you can restore; automatic backup after changes.
- Blocks pushing anything that looks like a key or token.
- `node_modules/`, `.env`, logs and your own patterns stay out of the backup, and stay put when a sync updates the skill.

## Command line

- `loadout` CLI for everything above, with `--json`, `--dry-run` and `--yes`.
- Keyboard picker when an install finds several skills.
- `--dry-run` for install, update and `git sync` shows what would change.
- `loadout doctor`: one report of everything that needs a look.
- Tab completion: `eval "$(loadout completion bash)"` or `zsh`.
- Published to `~/.loadout/bin` by the app; also on npm (`@antick/loadout`) and as standalone binaries.
- A bundled skill teaches your agents to use the CLI.

## Recently removed

- Anything Loadout takes out of an agent, project or the library is kept 30 days, with Restore.

## Storage

- Settings → Storage shows each part's size; clear caches, history and logs.
- A moved library that isn't there is never replaced with an empty one.
- **Remove all data** can keep every skill in your agents as ordinary folders.

## App

- Activity bar, sidebar and status bar; resizable sidebar; keyboard shortcuts.
- Dashboard, command palette (`⌘K`), quick-start guide.
- Four colour palettes in light and dark, four text sizes.
- Tray icon; updates itself with a checksum check.
- Logs, diagnostics and crash notice.

## Current limitations

- English only.
- GitHub device sign-in needs an OAuth client id; tokens and Git URLs work.
- Builds are not signed with an Apple or Windows certificate.
- The CLI can't read tokens saved by the app; use SSH or a credential helper.
- Agents that read a folder of rule files (Cline, Roo Code, Kiro) are not covered by instruction files.
- Windows and Linux are untested.

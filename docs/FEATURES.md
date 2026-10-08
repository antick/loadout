# Loadout features

Loadout keeps AI agent skills (folders with a `SKILL.md`) in one library and puts them in your
agents' and projects' folders. Setup: [README](../README.md#run-locally). Planned: [TODO.md](TODO.md).

## Library

- One library in `~/.loadout`; can be moved in Settings.
- Grid, list or matrix view (skills by agents: click to deploy or remove, right-click to block); search, sort, filters.
- **Group by source**: one folding section per repository, archive or link, skills without a source last, with a deploy action per section.
- Status filters include on every agent, on some agents and not deployed; blocked agents are not counted against a skill.
- Search takes words in any order and name initials: `pdfm` finds `pdf-manipulation`. The same in `⌘K` and `skills list -q`.
- Tags: add, remove, rename, delete, edit for many skills at once.
- **Your note** on a skill: why you keep it. Never written into `SKILL.md`; searched and backed up. `skills note`.
- **Favourites**: star a skill; a Favourites view and filter, backed up. `skills favorite`, `skills list --favorites`.
- Skill panel: rendered `SKILL.md`, files, source, per-agent switches, presets, projects.
- Format checks against the Agent Skills rules, with line numbers; errors mark the skill "Needs fixing".
- **Fix frontmatter**: adds a missing name and description, shown as a diff before saving.
- **Manual only** badge for skills with `disable-model-invocation: true`.
- Per agent, the frontmatter it ignores ("Skips allowed-tools"), where its docs say so. `skills status`.
- **Runs code** badge and filter for skills with scripts, hooks, MCP servers or pre-approved tools. `skills show`.
- **Sources** page: one card per repository, archive or link; find new skills, update, check, remove.
- A check notices skills a repository gained since you last looked; skipped or dismissed ones stay quiet.
- Optional: add those new skills by themselves (still safety-checked; a name in use waits for you).
- Find where a sourceless skill came from (lock file, Git checkout, its links, skills.sh, a link you paste); compared first.
- A linked copy that differs shows an update; updating asks before replacing your changes.
- **Source missing** when upstream lost a skill: **Keep as mine** or **Remove**. `skills check`, `sources mine`.
- Find sources for every such skill at once from the Sources page; exact matches come ticked.
- An imported skill whose Git checkout holds the same files is linked by itself.
- Mark a skill as yours: it gets a **Mine** badge and no source is looked for.
- Batch deploy, tag, add to preset, export, update and delete.
- Export skills as one `.zip` that installs anywhere.
- Publish skills to a Git repository laid out for `npx skills add`; preview first, keys held back, never forced. `skills publish`.
- Publish one skill to ClawHub as a version; keys held back; token in the system keychain. Needs your MIT-0 agreement.
- New skill from a name, a description and a starting outline (short, detailed, workflow or blank); opens in the editor.
- **Create and copy prompt**: creates the skill and copies a prompt for your agent to write it in full. `skills create --prompt`.
- Rename a skill; deployments and project links follow. Shows a dry run as you type.
- Delete goes to Recently removed, with Undo.
- Possible duplicates: same files or alike names at once, alike text when you ask (**Find duplicates**). Compare, keep one with its tags and agents, or dismiss. `skills duplicates`, `skills merge`, `skills dismiss`.
- The database rebuilds itself from the skill files; a skill folder renamed by hand keeps its tags, note and agents.

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
- From a link to an archive or a `SKILL.md`, or a site publishing `/.well-known/agent-skills/` (or the older `/.well-known/skills/`).
- From Git: URLs, `owner/repo`, tree links, `#branch`, `owner/repo@skill`, and pasted `npx skills add …` commands.
- Works without Git for public GitHub and GitLab repositories.
- Private GitHub repositories via `GITHUB_TOKEN`, `GH_TOKEN` or `gh auth login`, used only after your own Git sign-in.
- The import list says what each skill will do: New, In library, Name in use (and its new name), Same name twice.
- A name in use can instead replace the library skill, keeping its tags, presets and agents; the old version goes to Recently removed.
- Skills grouped by folder with a tick-all per folder; a filter for sources with 8 or more skills.
- A download that moves to another site needs your OK first; updates then go to that site and no other.
- Marketplace (skills.sh): boards, search, audits and `SKILL.md` before installing; works offline from cache.
- ClawHub as a second marketplace: boards, search, version and security scan before installing. `skills install @owner/slug`.
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
- Block a skill for an agent: removed there and skipped by every deploy; backed up. `skills block`.
- Deploy all: the whole library to chosen agents, skipping blocked skills and folders not ours. `skills deploy --all`.
- Copies follow library changes, unless the copy was edited in the agent's folder.
- Each start puts back missing or broken deployments; a folder not ours there is left alone and shown by `doctor`; a banner lists failures. `skills repair`.

## Instruction files

- Edit `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` and the rest, globally and per project.

## Safety check

- Loadout's own static rules look for destructive, phoning-home, escalating, hidden, injecting or key-stealing code.
- Every file is read whatever its size; one it cannot read as text (a binary, compiled code) is named, never passed as safe.
- With NVIDIA SkillSpector installed, its deeper static checks run instead; when it fails to run, the built-in rules check and the report says so.
- Runs before every install, update and `skills.toml` apply (on by default; **Check skills before installing** in Settings turns it off); a flagged skill needs your OK. Unchecked skills are checked at start.
- Reports kept per skill, shown on the skill's Safety tab; a **Safety flagged** filter and sidebar view list what needs a look.

## Agent pages

- Everything in an agent's skills folder, including skills installed outside Loadout.
- Status per skill (local only, in sync, changed), and "Loaded twice" warnings.
- Upload to library, pull from library, remove, delete; compare local and library.
- Add Skills by tag: each tag chip says how many of its skills the agent has (3/7); switching one on ticks the ones it is missing.
- Lists folders the agent skips, and why.
- Claude Code: skills its plugins bring, read only; one also in its folder is flagged Loaded twice.
- Claude Code: what its skill listing costs against the context budget, and the biggest skills. `agents listing`, `doctor`.

## Presets

- Named groups of skills with per-agent switches; apply to agents in one click.
- Export a preset as one file to share; importing it installs the skills the library lacks (safety-checked) and creates the preset.
- Import matches skills by source and branch, never by name alone: a different skill of the same name stays and the shared one goes in beside it, unless you pick yours.

## Projects

- Link a project folder (or the projects found under one), or pick from suggested ones.
- Every skill in the project's agent folders, with status against the library.
- Enable, disable, update either way, add library skills, create new project skills.
- Suggested skills from a project's technologies and file patterns; add in one click or hide. `project suggest`.
- **`skills.toml`** lists a project's skills; `skills-lock.json` pins commits. `project apply`; hand edits kept unless forced.

## Skill updates

- Check and update one or all; background checks every 1, 6 or 24 hours.
- An update counts only when the skill's own folder changed upstream, checked without downloading files.
- Shows files an update would delete and asks first.
- Your edits are never replaced without asking; the old version goes to Recently removed.
- Per-file diff against upstream.
- Report a problem with a skill: prepares a GitHub or GitLab issue for you to send; Loadout sends nothing. `skills feedback`.

## Skill use

- Optional: counts how often each skill runs, from Claude Code's and Codex's session logs on this computer; nothing leaves it.
- Sort the library by recent or most use, a "Not used lately" view, a use line in the skill panel and a dashboard card.
- `loadout skills usage` shows the counts; `loadout doctor --all` lists skills not run in 30 days.

## Backup and sync

- The library is a Git repository; back up to GitHub or any Git remote.
- A public GitHub repository is only used after you confirm; nothing is saved or uploaded before.
- One-button sync with per-skill merging; conflicts never block.
- When another device changed something, sync shows what comes in and goes out first; you choose about deletions.
- A long sync review can be searched and filtered by kind of change.
- The sync review says when skills here changed while it was open, with Recheck.
- Compare a conflict file by file before choosing a version.
- Keep all your versions, or use all the remote ones, in one step when several skills conflict.
- Shows what a running sync is doing: saving, downloading, merging, uploading.
- A skill deleted on another device is kept in Recently removed; restoring it brings it back everywhere.
- A sync that would delete many skills here stops and waits for you to review it, even for a remote without Loadout's skill details.
- Every backup, merge and restore is a version you can go back to (a commit, no tags); automatic backup after changes.
- Blocks pushing anything that looks like a key or token, in text files of any size.
- `node_modules/`, `venv/`, `.env` and `.env.*` (not `.env.example`), logs and your own patterns stay out of the backup, and stay put when a sync or restore updates the skill (or wait in Recently removed when the new version has a file at their path). Publishing leaves out the same list.

## Command line

- `loadout` CLI for everything above, with `--json`, `--dry-run` and `--yes`.
- `--json` keeps one shape per command: with `--dry-run`, an object with `dryRun` on both runs; `skills check`, `skills update`, `skills scan` and `skills validate` alike for one skill or all.
- `--yes` only for what cannot be given back (permanent deletes, rollbacks, pushes to another repository, overwritten files); other go-aheads have their own `--allow-<what>` flag. Usage lines come from each command's options.
- Keyboard picker when an install finds several skills.
- `--dry-run` for install, update and `git sync` shows what would change; it refuses exactly what the real run refuses.
- `loadout doctor`: one report of everything that needs a look, including sources not checked for a month and archives that are gone.
- `skills search <words>` (skills.sh, or ClawHub with `--on clawhub`); in a terminal, tick results to install them.
- `skills use <source>` prints a skill's `SKILL.md` without installing it, safety-checked: `skills use owner/repo@pdf | claude`.
- `loadout skills validate ./folder` checks every skill in a folder, and names used twice, without a library; for CI.
- `skills scan` exits 1 when a skill comes back unsafe or could not be checked, like `validate` and `doctor` on errors.
- Text from a repository is printed with escape sequences neutralised, so it cannot take over the terminal.
- Tab completion: `eval "$(loadout completion bash)"` or `zsh`.
- Published to `~/.loadout/bin` by the app; also on npm (`@antick/loadout`) and as standalone binaries.
- A bundled skill teaches your agents to use the CLI.
- `--library <path>` on any command works on the library in that folder instead of the saved one.
- `repo show`, `repo set <path>`, `repo init <path>`, `repo reset`: where the library is; move it, make a new empty one, go back to the default.
- `skills adopt <dir>` copies every skill in an agent's folder into the library and manages them from there.
- `skills suggest-for <ref> --add <pattern>` sets the file patterns a skill is suggested for.
- `skills export <ref>… | --all --out <file>` packs skills into one `.zip`.
- `skills usage --unused` lists the skills no agent ran in 30 days.
- `presets export <preset>` writes a preset to a file; `presets import <file | link>` creates it here, installing what the library lacks.
- `git pull` merges what other devices pushed without pushing; `git versions` lists versions, `git restore <version>` goes back to one, `git remote <url>` sets where backups go.
- `--accept-risk` installs or updates a skill the safety check flagged; `--approve-removals` lets an update delete files or replace your edits.
- `--allow-secrets` backs up or publishes what looks like a key anyway; `--allow-deletes` lets a sync delete many skills here; `--allow-redirect` takes a download that moved to another site; `--allow-different` links a copy that differs from its source.

## Recently removed

- Anything Loadout takes out of an agent, project or the library is kept 30 days, with Restore.

## Storage

- Settings → Storage shows each part's size; clear caches, history and logs.
- A restore or recovery from a backup keeps the library it replaced under **Earlier libraries** in Storage, until you clear it.
- A moved library that isn't there is never replaced with an empty one.
- **Remove all data** can keep every skill in your agents as ordinary folders; copies you edited there always stay.

## App

- Activity bar, sidebar and status bar; resizable sidebar; keyboard shortcuts.
- **Open in editor** on every path: VS Code, Cursor, Windsurf, Zed or Sublime Text when found, else the default app.
- Dashboard, command palette (`⌘K`), quick-start guide.
- Four colour palettes in light and dark, four text sizes.
- Tray icon; updates itself with a checksum check.
- Closing the window asks, hides to the tray or quits, as set in Settings.
- Logs, diagnostics and crash notice.

## Current limitations

- English only.
- GitHub device sign-in needs an OAuth client id; tokens and Git URLs work.
- Builds are not signed with an Apple or Windows certificate.
- The CLI can't read tokens saved by the app; use SSH, a credential helper, or for GitHub a GitHub CLI sign-in or `GITHUB_TOKEN`.
- Roo Code's folder of rule files is not covered; Cline and Kiro rule folders are, as Rules.
- Windows and Linux are untested, and so is a real drag from the file manager.

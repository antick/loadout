# Loadout features

Loadout keeps AI agent skills (folders with a `SKILL.md`) in one library and puts them in your
agents' and projects' folders. Setup: [README](../README.md#run-locally). Checklist: [PLAN.md](PLAN.md).

## Library

- One library in `~/.loadout`; can be moved in Settings.
- Grid, list or matrix (skills down, agents across: click a square to deploy or remove, right-click to block), search, sort, and filters by source, status and tag.
- **Group by source**: one folding section per repository, archive or link, skills without a source last, with a deploy action per section.
- Status filters include on every agent, on some agents and not deployed; blocked agents are not counted against a skill.
- Search takes words in any order and name initials: `pdfm` finds `pdf-manipulation`. The same in `⌘K` and `skills list -q`.
- Tags: add, remove, rename, delete, edit for many skills at once.
- **Your note** on a skill: why it is there, when to use it. Kept by Loadout, never in `SKILL.md`, found by the search, backed up with the tags. `loadout skills note`.
- **Favourites**: star a skill on its card, in its panel or from its menu; a Favourites view in the sidebar and a star filter in the library. Backed up with the tags. `loadout skills favorite`, `skills list --favorites`.
- Skill panel: rendered `SKILL.md`, files, source, per-agent switches, presets, projects.
- Format checks against the Agent Skills rules, with line numbers; errors mark the skill "Needs fixing".
- **Fix frontmatter**: adds a missing name and description, shown as a diff before saving.
- **Manual only** badge for skills with `disable-model-invocation: true`.
- Frontmatter an agent does not act on: a note per agent on the skill's Agents tab ("Skips allowed-tools"), only where that agent's own docs settle it (Claude Code, OpenCode, Cursor). `loadout skills status`.
- **Runs code** badge and a "What it can do" list for skills that ship scripts, register hooks, start MCP servers or pre-approve tools; also shown in the import list before installing, and as a filter. Read from file names and frontmatter only. `loadout skills show`.
- **Sources** page: one card per repository, archive or link; find new skills, update, check, remove.
- A check notices skills a repository gained since you last looked; skipped or dismissed ones stay quiet.
- Optional: add those new skills by themselves (still safety-checked; a name in use waits for you).
- Find where a skill without a source came from: the `npx skills` lock file (`~/.agents/.skill-lock.json`), its Git checkout, links in its `SKILL.md`, skills.sh, or a pasted link. Each match is compared with your copy before you link it.
- A linked copy that differs shows an update; updating asks before replacing your changes.
- A skill its source no longer has (deleted or renamed upstream, a dead link) shows **Source missing** with **Keep as mine** (forget the source, mark it yours, keep it deployed) and **Remove** (to Recently removed). `skills check` names them; `loadout sources mine` keeps one.
- Find sources for every such skill at once from the Sources page; exact matches come ticked.
- An imported skill whose Git checkout holds the same files is linked by itself.
- Mark a skill as yours: it gets a **Mine** badge and no source is looked for.
- Batch deploy, tag, add to preset, export, update and delete.
- Export skills as one `.zip` that installs anywhere.
- Publish chosen skills to a Git repository laid out for `npx skills add` (`skills/`, or its `.curated` and `.experimental` folders). It shows what would change first, copies only skill folders, holds back keys and tokens, never forces a push and never touches the backup repository. `loadout skills publish`.
- Publish one skill as a version on ClawHub: slug, display name, version (the next patch of what is there), changelog and topics from its tags; shows the files and holds back anything that looks like a key; needs a token kept in the system keychain (Settings → Marketplaces) and your MIT-0 agreement.
- New skill from a name, a description and a starting outline (short, detailed, workflow or blank); opens in the editor.
- **Create and copy prompt**: creates the skill, then copies a prompt that has your agent write all of it in the new folder (description, instructions, examples, `references/`, `scripts/`) by the same rules the format check uses. A project skill in several agent folders: the agent writes it in the first and copies it into the rest. `loadout skills create --prompt`.
- Rename a skill; deployments and project links follow. Shows a dry run as you type.
- Delete goes to Recently removed, with Undo.
- Possible duplicates: skills with the same files, mostly the same text, or alike names and descriptions. Compare, keep one (its tags, presets and agents carry over), or mark a pair as different. `loadout skills duplicates`.
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
- Private GitHub repositories also work with a `GITHUB_TOKEN`, `GH_TOKEN` or a GitHub CLI sign-in (`gh auth login`). Git gets it only after your own credential helpers and SSH keys, so a login that works today is never replaced; the Git tab says which one is in use.
- The import list says what each skill will do: New, In library, Name in use (and its new name), Same name twice.
- A name in use can instead replace the library skill, keeping its tags, presets and agents; the old version goes to Recently removed.
- Skills grouped by folder with a tick-all per folder; a filter for sources with 8 or more skills.
- A download that moves to another site needs your OK first.
- Marketplace (skills.sh): boards, search, audits and `SKILL.md` before installing; works offline from cache.
- ClawHub as a second marketplace: trending, most downloaded and newest, search, the version, changelog, security scan and `SKILL.md` before installing; installs the registry's zip, and updates follow new versions. `loadout skills install @owner/slug`, `loadout skills search --on clawhub`.
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
- Block a skill for an agent: it is removed there and skipped by every deploy. Backed up with the tags; projects are not affected. `loadout skills block`.
- Deploy all: the whole library to the agents you pick, leaving out blocked skills and folders Loadout didn't create. `loadout skills deploy --all --skip-conflicts`.
- Copies follow library changes, unless the copy was edited in the agent's folder.
- Every start puts back deployments that went missing or whose link leads nowhere, the normal way, so a folder Loadout did not create is never replaced; what could not be put back shows in a banner with Retry. `loadout skills repair`; `loadout doctor` names broken links too.

## Instruction files

- Edit `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` and the rest, globally and per project.

## Safety check

- Always on: Loadout's own rules read every text file of a skill for destructive commands, code that phones home, privilege escalation, hidden payloads, prompt injection and credential theft. Static, no AI or API key. A hit in a comment or in a document's prose counts for less.
- With NVIDIA SkillSpector installed, its deeper static checks run instead.
- Runs before every install and update; a flagged skill needs your OK. Skills that arrived unchecked are checked when the app starts.
- Reports kept per skill, shown on the skill's Safety tab; a **Safety flagged** filter and sidebar view list what needs a look.

## Agent pages

- Everything in an agent's skills folder, including skills installed outside Loadout.
- Status per skill (local only, in sync, changed), and "Loaded twice" warnings.
- Upload to library, pull from library, remove, delete; compare local and library.
- Add Skills by tag: each tag chip says how many of its skills the agent has (3/7); switching one on ticks the ones it is missing.
- Lists folders the agent skips, and why.
- Claude Code: skills its plugins bring, read only; one also in its folder is flagged Loaded twice.
- Claude Code: what its skill listing costs. It puts every skill's name and description in each conversation and cuts descriptions past about 1% of the context window. Shows an estimate against that budget (200K or 1M window), the biggest skills, and a warning when over. Also in `loadout doctor` and `loadout agents listing`.

## Subagents, commands and rules

- Kept in the library beside skills, one Markdown file each, and backed up and synced with it.
- Deployed to each agent's own folder or into a linked project, converted to that agent's format.
- Agents: Claude Code, OpenCode, Cursor, Codex, Gemini CLI, GitHub Copilot, Qwen Code, Factory Droid, Kiro, Cline, as their docs allow.
- A preview shows the file each agent gets, and says what the conversion left out.
- Deployed files follow library edits; a file edited in the agent's folder is left alone.
- Never replaces a file Loadout did not write unless you say so; the old one is kept as `.loadout-old`.
- Import from agents' folders, a folder, or a Git repository, read into the library's format.
- `loadout items` for all of it; `loadout items convert` converts one file without a library.

## Presets

- Named groups of skills with per-agent switches; apply to agents in one click.
- Export a preset as one file to share; importing it installs the skills the library lacks (safety-checked) and creates the preset.

## Projects

- Link project folders, scan for them, or pick from suggested ones.
- Every skill in the project's agent folders, with status against the library.
- Enable, disable, update either way, add library skills, create new project skills.
- Suggested skills: the technologies a project uses (React, Python, Docker…) and file patterns set on a skill (`Cargo.toml`, `*.rs`); add in one click or hide per project. `loadout project suggest`.
- **`skills.toml`**: lists a project's skills and agents; `skills-lock.json` pins exact commits. Apply from the project page or `loadout project apply`. Never overwrites hand edits unless forced.

## Skill updates

- Check and update one or all; background checks every 1, 6 or 24 hours.
- A new commit only counts as an update when it changed the skill's own folder: Git's fingerprint of that folder is compared at both commits, read without downloading any files, once per repository per check. Without Git it falls back to comparing commits.
- Shows files an update would delete and asks first.
- Your edits are never replaced without asking; the old version goes to Recently removed.
- Per-file diff against upstream.
- Report a problem with a skill from a repository: prepares an issue (what happened, a proposed `SKILL.md` change, context), shown in full first. Opens the repository's new-issue page on GitHub or GitLab filled in, or copies the text. Nothing is sent by Loadout and nothing from this computer is added. `loadout skills feedback`.

## Skill use

- Optional: counts how often each skill runs, from Claude Code's and Codex's session logs on this computer; nothing leaves it.
- Sort the library by recent or most use, a "Not used lately" view, a use line in the skill panel and a dashboard card.
- `loadout skills usage` shows the counts; `loadout doctor --all` lists skills not run in 30 days.

## Backup and sync

- The library is a Git repository; back up to GitHub or any Git remote.
- A public GitHub repository is only used after you confirm; nothing is saved or uploaded before.
- One-button sync with per-skill merging; conflicts never block.
- When another device changed something, sync shows what comes in and goes out first, with each skill's files; you choose whether deletions happen here.
- A long sync review can be searched and filtered by kind of change.
- The sync review says when skills here changed while it was open, with Recheck.
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
- `loadout doctor`: one report of everything that needs a look, including sources not checked for a month and archives that are gone.
- `loadout skills search <words>` looks up skills.sh from the terminal; nothing is installed until you run `skills install`.
- `loadout skills use <source>` prints a skill's `SKILL.md` without installing it, to try it or pipe it into an agent (`skills use owner/repo@pdf | claude`). Same sources and safety check as an install; safety notes go to stderr.
- `loadout skills validate ./folder` checks every skill in a folder, and names used twice, without a library; for CI.
- Text a repository wrote (names, descriptions, `SKILL.md`) is printed with its escape sequences shown as spaces, so it cannot clear the screen or reach the clipboard.
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
- **Open in editor** on every skill, file and folder path: VS Code, Cursor, Windsurf, Zed or Sublime Text when found on this computer, else the system's default app. Pick one in Settings → General.
- Dashboard, command palette (`⌘K`), quick-start guide.
- Four colour palettes in light and dark, four text sizes.
- Tray icon; updates itself with a checksum check.
- Logs, diagnostics and crash notice.

## Current limitations

- English only.
- GitHub device sign-in needs an OAuth client id; tokens and Git URLs work.
- Builds are not signed with an Apple or Windows certificate.
- The CLI can't read tokens saved by the app; use SSH, a credential helper, or for GitHub a GitHub CLI sign-in or `GITHUB_TOKEN`.
- Roo Code's folder of rule files is not covered; Cline and Kiro rule folders are, as Rules.
- Windows and Linux are untested.
- Subagents, commands and rules: deleting one does not go to Recently removed; they cannot be renamed or updated from their source; when two computers change the same one before syncing, this computer's version wins (the other is in the backup's history).

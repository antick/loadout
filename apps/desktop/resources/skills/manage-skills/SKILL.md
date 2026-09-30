---
name: manage-skills
description: Install, deploy, list, update, tag, adopt or remove AI agent skills through the Loadout command-line tool. Use whenever the user asks to add or install a skill (from a folder, zip, git URL or owner/repo), make a skill available to an agent such as Claude Code or Cursor, see which skills exist or where they are deployed, check for or apply skill updates, group skills into presets, bring an existing skills folder under management, put back a deleted skill, or back up and restore the skill library.
---

# Manage skills with Loadout

Loadout keeps every skill in one **library** and **deploys** skills from there into each
agent's skills folder. You drive it through its command-line tool. Never edit agent skills
folders yourself.

## The golden rule

Do not create, copy, move or delete anything inside an agent's skills folder
(`~/.claude/skills`, `~/.cursor/skills`, …) or inside the library folder by hand. Always go
through the tool. A hand-made change loses the skill's source, its update tracking, its preset
membership and its deployment records, and the next sync may treat it as a conflict.

## Find the tool first

Run this once, then reuse the literal path in every later command (shell variables do not
survive between your commands):

```sh
ls -l ~/.loadout/bin/loadout ~/.loadout/bin/.version
```

| What you see            | What to do                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Both files exist        | Use `~/.loadout/bin/loadout`. On Windows: `%USERPROFILE%\.loadout\bin\loadout.cmd`.                                             |
| Only one of them exists | The published tool is incomplete. Stop and ask the user to open the Loadout app once; it republishes the tool on start.         |
| Neither exists          | Try `loadout --version` from `PATH`. If that fails too, Loadout is not installed and this skill does not apply - tell the user. |

Always pass `--json`. Success prints one JSON value on stdout with exit code 0. Add `--help`
after any group or command to see its exact arguments.

## Three separate things

| Concept    | Meaning                                   | Changed by                                           |
| ---------- | ----------------------------------------- | ---------------------------------------------------- |
| Library    | The skills Loadout knows about            | `skills install`, `skills remove`, `skills adopt`    |
| Deployment | A library skill made visible to one agent | `skills deploy`, `skills undeploy`, `presets deploy` |
| Preset     | A named set of skills deployed together   | `presets add`, `presets remove`                      |

**Installing does not deploy.** After `skills install`, the agent still cannot see the skill.
Follow up with `skills deploy <ref> --agent <key>` unless the user only wanted it in the library.

A skill reference (`<ref>`) is its id, its name, or its library folder name. Prefer the `id`
from earlier JSON output when two skills could share a name. Agent keys come from `agents list`.

## Cheat sheet

Examples write `loadout` for the literal path you found above.

```sh
# Look around
loadout agents list --installed --json          # agent keys, enabled state, skills folders
loadout agents listing --json                   # what Claude Code's skill listing costs in context; over budget means descriptions get cut
loadout skills list --json                      # everything in the library
loadout skills list --tag writing --source git --json
loadout skills list --query pdf --json          # text in the name, description, tags, note or source
loadout skills show <ref> --json                # includes "traits": scripts, hooks, MCP servers, pre-approved tools
loadout skills status <ref> --json              # which agents have it, is it really on disk, and frontmatter an agent skips
loadout repo show --json                        # library location and counts
loadout doctor --json                           # everything that needs a look; exit 1 on errors
loadout skills usage --json                     # how often agents ran each skill, if the user turned tracking on
loadout project suggest --dir . --json          # library skills that fit this linked project, and why
loadout presets import ./team.loadout-preset.json --dry-run --json   # what importing a shared preset would install

# Install (library only)
loadout skills search pdf --json                # find marketplace skills; install one with skills install owner/repo@skill
loadout skills install ./path/to/skill-folder --json
loadout skills install ./downloads/skill.zip --name my-skill --json
loadout skills install https://github.com/owner/repo --skill pdf-tools --json
loadout skills install owner/repo --all --json          # every skill in the repository
loadout skills install owner/repo@skill-name --json     # one marketplace skill
loadout skills install owner/repo --skill pdf --replace --json  # replace the library's pdf instead of adding pdf-2

# Start a new skill from scratch (name: lowercase letters, numbers, hyphens)
loadout skills create my-skill --description "What it does and when to use it" --json
loadout skills create my-skill --description "…" --template workflow --json   # outline, detailed, workflow or blank

# Deploy / undeploy (repeat --agent for several agents)
loadout skills deploy <ref> --agent claude_code --agent cursor --json
loadout skills undeploy <ref> --agent cursor --json
loadout skills deploy <ref> --agent cursor --dry-run --json   # what would change; writes nothing
loadout skills deploy --all --agent cursor --skip-conflicts --dry-run --json   # every library skill, minus blocked ones and foreign folders
loadout skills block <ref> --agent codex --json    # never deploy it to Codex; removes it there now
loadout skills unblock <ref> --agent codex --json  # allow it again (does not deploy it)

# Skills that look like one skill installed twice (nothing is removed by itself)
loadout skills duplicates --json
loadout skills duplicates merge --keep <ref> --remove <ref> --dry-run --json   # tags, presets and agents move to the kept one
loadout skills duplicates dismiss <ref> <ref> --json    # they are different skills; stop listing the pair

# Publish skills to a Git repository so others can `npx skills add` them. Pushes to a remote: only when the user asked, and preview first
loadout skills publish <ref>... --repo owner/repo --dry-run --json   # what would change; writes nothing
loadout skills publish <ref>... --repo owner/repo --yes --json       # copies the skill folders, commits, pushes; never forces

# A skill misbehaved: prepare an issue for the repository it came from (prints text and a link; sends nothing, the user files it)
loadout skills feedback <ref> -m "what happened" --proposal "wording that would have prevented it" --json

# How copies (or the source) differ from the library, file by file
loadout skills diff <ref> --json
loadout skills diff <ref> --upstream --json

# Updates: check first, then update
loadout skills check --all --json
loadout skills update <ref> --json
loadout skills update --all --json

# Safety check with SkillSpector, when the user has it installed
loadout skills scan <ref> --json
loadout skills scan --all --json

# Format checks (Agent Skills rules); exit code 1 when a skill has an error
loadout skills validate <ref> --json
loadout skills validate --all --json
loadout skills validate ./path/to/skills --json   # a folder, no library needed

# Rename (folder, name in SKILL.md, deployments and project links follow); preview first
loadout skills rename <ref> <new-name> --dry-run --json
loadout skills rename <ref> <new-name> --json

# Tags
loadout skills tag <ref> --add writing --remove draft --json
loadout skills note <ref> "Run before a release" --json   # the user's own note; --clear takes it off; skills list --query finds it
loadout skills favorite <ref>… --json               # mark as favorites; --undo takes it back; skills list --favorites shows them

# Subagents, slash commands and rules ("items"): one Markdown file each, converted per agent
loadout items list --kind subagent --json
loadout items find agents --json                     # items already in agents' own folders
loadout items import agents --all --json              # copy them into the library
loadout items import owner/repo --item command/commit --json
loadout items create rule/style --json
loadout items show subagent/reviewer --agent opencode --json   # the converted file, and what it left out
loadout items deploy subagent/reviewer --agent claude_code --agent opencode --json
loadout items deploy rule/style --agent cursor --project ./my-app --json   # into a project
loadout items undeploy subagent/reviewer --agent opencode --json
loadout items remove subagent/reviewer --yes --json
loadout items convert ./reviewer.md --kind subagent --to opencode   # no library needed

# Presets
loadout presets list --json
loadout presets create "Docs work" --description "Writing and review" --json
loadout presets add "Docs work" <ref> <ref> --json
loadout presets deploy "Docs work" --agent claude_code --json   # no --agent = all enabled agents
loadout presets undeploy "Docs work" --dry-run --json
loadout presets undeploy "Docs work" --yes --json

# See what an install or update would do before doing it
loadout skills install owner/repo --all --dry-run --json   # names each skill would get
loadout skills update --all --dry-run --json               # files each update would change
loadout sources list --json                                # repositories, archives and links in use
loadout sources check --json                               # skills repositories gained since last look
loadout sources dismiss owner/repo                         # stop showing a repository's new skills
loadout sources find --json                                # where skills without a source came from (changes nothing)
loadout sources link <skill> [owner/repo]                  # follow a repository; a copy that differs needs --yes
loadout sources mine <skill>                               # the user wrote it: stop looking for a source

# A project's skills.toml: the skills a repository uses, pinned in skills-lock.json
loadout project apply --dir <project> --dry-run --json     # what would be written
loadout project apply --dir <project> --json               # never overwrites hand edits without --force
loadout project init --dir <project> --json                # write skills.toml from what the project has

# Take over skills that already sit in an agent's folder
loadout skills adopt ~/.claude/skills --dry-run --json
loadout skills adopt ~/.claude/skills --json

# Remove from the library (also undeploys everywhere); it waits in Recently removed for 30 days
loadout skills remove <ref> --dry-run --json
loadout skills remove <ref> --yes --json

# Recently removed: deleted skills and replaced agent folders, with a way back
loadout removed list --json
loadout removed restore <id> --json                   # a skill comes back with tags and presets, not deployed
loadout removed delete <id> --dry-run --json
loadout removed delete <id> --yes --json

# Backup
loadout git status --json
loadout git sync --dry-run --json                      # what would come in and go out
loadout git sync -m "add pdf tools" --json
loadout git versions --json
loadout git restore <tag> --dry-run --json
```

A folder source must start with `./`, `../`, `/` or `~/`. A bare `owner/repo` always means a
GitHub repository, never a local folder. When a repository holds several skills and you named
none, the command fails and lists them - pick with `--skill` or confirm `--all` with the user.

## Destructive commands

`skills remove`, `presets delete`, `presets undeploy`, `removed delete` and `git restore`
refuse to run without `--yes`. So does `agents disable` when the agent has skills deployed.
`--json` never implies it.

1. Run the command with `--dry-run` first and read what it would do.
2. Tell the user what will be removed or replaced, unless they already asked for exactly that.
3. Run it again with `--yes`.

`agents disable <key>` also removes every skill Loadout deployed to that agent. Run it with
`--dry-run` to list them, and say so before doing it.

## Reading failures

A failure prints one JSON object on **stderr** and exits non-zero:

```json
{
  "ok": false,
  "code": "TARGET_CONFLICT",
  "message": "…",
  "details": { "conflicts": [{ "path": "…", "reason": "…" }] }
}
```

Exit code 2 means the command line itself was wrong: fix the arguments, check `--help`. Exit
code 1 means the operation failed, including refusals such as an agent that is not installed
(those also report `INVALID_INPUT`). Batch commands can exit 1 while still printing
a result on stdout - read its `failed` list.

| Code                                                                            | Meaning                                                                                                             | What to do                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INVALID_INPUT`                                                                 | Bad argument, missing `--yes`, agent not installed or disabled                                                      | Fix the command. Do not enable an agent unless the user wants it.                                                                                                                                                                           |
| `NOT_FOUND`                                                                     | No such skill, preset, agent, folder or version; or the name is ambiguous                                           | List first, then use the id.                                                                                                                                                                                                                |
| `TARGET_CONFLICT`                                                               | A folder with that name already exists in the agent's folder and Loadout did not put it there. Nothing was changed. | Report `details.conflicts[].path`. Offer: adopt it (`skills adopt <agent skills folder>`), or let the user move it aside. **Never delete or rename it yourself.**                                                                           |
| `ALREADY_EXISTS`                                                                | Name already taken                                                                                                  | Pick another name or use the existing item.                                                                                                                                                                                                 |
| `UNSAFE`                                                                        | The safety check flagged the skill (prompt injection, credential access, downloaded code). Nothing was installed.   | Show the user `details.flagged[].report.findings`. Add `--accept-risk` (to `skills install`, or to `skills update <ref>` for a flagged new version) only after the user explicitly says to go ahead anyway. **Never decide that yourself.** |
| `SECRETS_FOUND`                                                                 | The backup would push text that looks like a key or token. Nothing was pushed.                                      | Show the user `details.secrets` (file, line, kind). Suggest removing it from the skill. Add `--allow-secrets` to `git sync` only after the user explicitly says it is safe to share. **Never decide that yourself.**                        |
| `SYNC_MANY_DELETES`                                                             | The sync would delete many skills here that another device deleted. Nothing was changed.                            | Show the user `details.skills` (or `git sync --dry-run`). Add `--allow-deletes` only after the user explicitly agrees; they can still restore each one from `removed`. **Never decide that yourself.**                                      |
| `SYNC_PLAN_CHANGED`                                                             | Another device synced during the review. Nothing was changed.                                                       | Run `git sync --dry-run` again and show the user the new list before retrying.                                                                                                                                                              |
| `LIBRARY_UNAVAILABLE`                                                           | The saved library is in a folder that is not there, usually a disk that is not connected. Nothing was changed.      | Tell the user to connect that disk (`details.path`), or open the app to choose. Never pass `--library` to work around it.                                                                                                                   |
| `BUSY`                                                                          | The app or another command is working on the library                                                                | Wait a few seconds and retry once.                                                                                                                                                                                                          |
| `NETWORK`, `TIMEOUT`                                                            | Could not reach the source                                                                                          | Retry once, then report.                                                                                                                                                                                                                    |
| `GIT_MISSING`                                                                   | git is not installed                                                                                                | Tell the user; git sources and backup need it.                                                                                                                                                                                              |
| `GIT_AUTH`, `GIT_REJECTED`, `GIT_UNRELATED`, `GIT_NO_UPSTREAM`, `SYNC_CONFLICT` | Backup needs a decision                                                                                             | Report the message. These are fixed in the app's Backup page, not from here.                                                                                                                                                                |
| `GIT_NOT_REPO`                                                                  | Backup is not set up for this library                                                                               | Tell the user; `git init` (or the app's Backup page) sets it up.                                                                                                                                                                            |
| `BACKUP_TOO_NEW`                                                                | The backup was written by a newer version of the app                                                                | Tell the user to update the app first. Do not work around it.                                                                                                                                                                               |
| `GIT`                                                                           | Git failed (clone, fetch, a missing branch)                                                                         | Report the message. Check the source address with the user.                                                                                                                                                                                 |
| `UNSUPPORTED`                                                                   | The feature is not available here (e.g. `skills scan` without SkillSpector installed)                               | Report it. Do not install tools on your own.                                                                                                                                                                                                |
| `CREDENTIALS_UNAVAILABLE`                                                       | A token cannot be stored safely on this computer                                                                    | Suggest an SSH remote or the user's own Git credential helper. Never put the token anywhere else.                                                                                                                                           |
| `CHANGED_ON_DISK`                                                               | The file changed on disk since it was read                                                                          | Read it again and redo the change.                                                                                                                                                                                                          |
| `IO`, `INTERNAL`                                                                | Unexpected                                                                                                          | Report the message verbatim. Do not work around it by editing files.                                                                                                                                                                        |

## Updates that would delete files or replace edits

`skills update` never silently deletes files or throws away edits. If upstream removed files, or
the new version would replace a file the user edited in the app, the result has
`"applied": false` and a `pendingRemovals` list (for `--all`: a `heldBack` list of names). Each
entry has `kind`: `removed` (the file goes away) or `edited` (the user's edit is replaced). That
is a safety stop, not an error. Show the list to the user; only when they agree, run the same
command again with `--approve-removals`.

## Diagnosing

Start with `repo show --json` and `agents list --json`. A skill "not showing up" is almost
always one of: installed but never deployed, deployed to a different agent, the agent is
disabled, or `skills status` reports `presentOnDisk: false` (deploy it again). An agent may
also ignore a skill whose SKILL.md is broken: run `skills validate <ref>` and report any `error`
(missing frontmatter, name or description, or YAML that does not parse).

---
name: manage-skills
description: Install, deploy, list, update, tag, adopt or remove AI agent skills through the Loadout command-line tool. Use whenever the user asks to add or install a skill (from a folder, zip, git URL or owner/repo), make a skill available to an agent such as Claude Code or Cursor, see which skills exist or where they are deployed, check for or apply skill updates, group skills into presets, bring an existing skills folder under management, or back up and restore the skill library.
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

Examples write `sb` for the literal path you found above.

```sh
# Look around
sb agents list --installed --json          # agent keys, enabled state, skills folders
sb skills list --json                      # everything in the library
sb skills list --tag writing --source git --json
sb skills show <ref> --json
sb skills status <ref> --json              # which agents have it, and is it really on disk
sb repo show --json                        # library location and counts

# Install (library only)
sb skills install ./path/to/skill-folder --json
sb skills install ./downloads/skill.zip --name my-skill --json
sb skills install https://github.com/owner/repo --skill pdf-tools --json
sb skills install owner/repo --all --json          # every skill in the repository
sb skills install owner/repo@skill-name --json     # one marketplace skill

# Start a new skill from scratch (name: lowercase letters, numbers, hyphens)
sb skills create my-skill --description "What it does and when to use it" --json

# Deploy / undeploy (repeat --agent for several agents)
sb skills deploy <ref> --agent claude_code --agent cursor --json
sb skills undeploy <ref> --agent cursor --json

# Updates: check first, then update
sb skills check --all --json
sb skills update <ref> --json
sb skills update --all --json

# Format checks (Agent Skills rules); exit code 1 when a skill has an error
sb skills validate <ref> --json
sb skills validate --all --json

# Tags
sb skills tag <ref> --add writing --remove draft --json

# Presets
sb presets list --json
sb presets create "Docs work" --description "Writing and review" --json
sb presets add "Docs work" <ref> <ref> --json
sb presets deploy "Docs work" --agent claude_code --json   # no --agent = all enabled agents
sb presets undeploy "Docs work" --json

# Take over skills that already sit in an agent's folder
sb skills adopt ~/.claude/skills --dry-run --json
sb skills adopt ~/.claude/skills --json

# Remove from the library (also undeploys everywhere)
sb skills remove <ref> --dry-run --json
sb skills remove <ref> --yes --json

# Backup
sb git status --json
sb git sync -m "add pdf tools" --json
sb git versions --json
sb git restore <tag> --dry-run --json
```

A folder source must start with `./`, `../`, `/` or `~/`. A bare `owner/repo` always means a
GitHub repository, never a local folder. When a repository holds several skills and you named
none, the command fails and lists them - pick with `--skill` or confirm `--all` with the user.

## Destructive commands

`skills remove`, `presets delete` and `git restore` refuse to run without `--yes`.
`--json` never implies it.

1. Run the command with `--dry-run` first and read what it would do.
2. Tell the user what will be removed or replaced, unless they already asked for exactly that.
3. Run it again with `--yes`.

`agents disable <key>` also removes every skill Loadout deployed to that agent. Say so before
doing it.

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

Exit code 2 means the command line was wrong (`INVALID_INPUT`): fix the arguments, check
`--help`. Exit code 1 means the operation failed. Batch commands can exit 1 while still printing
a result on stdout - read its `failed` list.

| Code                                                                            | Meaning                                                                                                             | What to do                                                                                                                                                        |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INVALID_INPUT`                                                                 | Bad argument, missing `--yes`, agent not installed or disabled                                                      | Fix the command. Do not enable an agent unless the user wants it.                                                                                                 |
| `NOT_FOUND`                                                                     | No such skill, preset, agent, folder or version; or the name is ambiguous                                           | List first, then use the id.                                                                                                                                      |
| `TARGET_CONFLICT`                                                               | A folder with that name already exists in the agent's folder and Loadout did not put it there. Nothing was changed. | Report `details.conflicts[].path`. Offer: adopt it (`skills adopt <agent skills folder>`), or let the user move it aside. **Never delete or rename it yourself.** |
| `ALREADY_EXISTS`                                                                | Name already taken                                                                                                  | Pick another name or use the existing item.                                                                                                                       |
| `BUSY`                                                                          | The app or another command is working on the library                                                                | Wait a few seconds and retry once.                                                                                                                                |
| `NETWORK`, `TIMEOUT`                                                            | Could not reach the source                                                                                          | Retry once, then report.                                                                                                                                          |
| `GIT_MISSING`                                                                   | git is not installed                                                                                                | Tell the user; git sources and backup need it.                                                                                                                    |
| `GIT_AUTH`, `GIT_REJECTED`, `GIT_UNRELATED`, `GIT_NO_UPSTREAM`, `SYNC_CONFLICT` | Backup needs a decision                                                                                             | Report the message. These are fixed in the app's Backup page, not from here.                                                                                      |
| `IO`, `INTERNAL`                                                                | Unexpected                                                                                                          | Report the message verbatim. Do not work around it by editing files.                                                                                              |

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

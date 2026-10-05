import { deploymentProblem } from "@loadout/core";
import {
  REMOVED_KEEP_DAYS,
  SOURCE_TYPES,
  type Skill,
  fieldNotesFor,
  matchesSkillQuery,
  runsCode,
} from "@loadout/shared";
import { flagBoolean, flagChoice, flagList, flagString } from "../args";
import { failureLines, fields, plural, table, when } from "../output";
import { adoptCommand } from "./skills-adopt";
import { createCommand } from "./skills-create";
import { diffCommand } from "./skills-diff";
import { duplicatesCommand } from "./skills-duplicates";
import { publishCommand } from "./skills-publish";
import { feedbackCommand } from "./skills-feedback";
import { renameCommand } from "./skills-rename";
import { exportCommand } from "./skills-export";
import { blockCommand, unblockCommand } from "./skills-block";
import { installCommand } from "./skills-install";
import { useCommand } from "./skills-use";
import { scanCommand } from "./skills-scan";
import { searchCommand } from "./skills-search";
import { checkCommand, updateCommand } from "./skills-update";
import { favoriteCommand } from "./skills-favorite";
import { noteCommand } from "./skills-note";
import { repairCommand } from "./skills-repair";
import { usageCommand } from "./skills-usage";
import { suggestForCommand } from "./skills-suggest-for";
import { validateCommand } from "./skills-validate";
import {
  AGENT_FLAG,
  DEPLOY_NOTE,
  DRY_RUN_FLAG,
  REQUIRED_YES_FLAG,
  SKIP_CONFLICTS_FLAG,
  applyOutcome,
  limitPositionals,
  positional,
  positionalsFrom,
  requireAgents,
  requireYes,
  resolveSkills,
} from "./support";
import type { CommandContext, CommandGroup, CommandResult } from "./types";
import { exitCodeFor } from "../exit-codes";

const TAG_FLAG = {
  name: "tag",
  type: "list",
  value: "tag",
  description: "Only skills carrying this tag. Repeat to require several.",
} as const;
const QUERY_FLAG = {
  name: "query",
  short: "q",
  type: "string",
  value: "text",
  description: "Only skills with this text in the name, description, tags, note or source.",
} as const;
const SOURCE_FLAG = {
  name: "source",
  type: "string",
  value: "type",
  description: `Only skills from this source: ${SOURCE_TYPES.join(", ")}.`,
} as const;
const FAVORITES_FLAG = {
  name: "favorites",
  type: "boolean",
  description: "Only favourite skills.",
} as const;
const ADD_FLAG = {
  name: "add",
  type: "list",
  value: "tag",
  description: "Tag to add. Repeatable.",
} as const;
const REMOVE_FLAG = {
  name: "remove",
  type: "list",
  value: "tag",
  description: "Tag to take off. Repeatable.",
} as const;

const agentsOf = (skill: Skill): string => skill.deployments.map((d) => d.agentKey).join(", ");

/** Next to a skill's name when agents only run it on request. */
const MANUAL_ONLY_MARK = "[manual]";
const MANUAL_ONLY_TEXT = "manual only: agents run it when you call it (disable-model-invocation)";

/** Next to a skill's name when it ships scripts, hooks or MCP servers (`skills show` says which). */
const RUNS_CODE_MARK = "[code]";

/** Next to a skill's name when it is a favorite. */
const FAVORITE_MARK = "[fav]";

const nameCell = (skill: Skill): string =>
  [
    skill.name,
    skill.favoritedAt !== null ? FAVORITE_MARK : "",
    skill.manualOnly ? MANUAL_ONLY_MARK : "",
    runsCode(skill.traits) ? RUNS_CODE_MARK : "",
  ]
    .filter(Boolean)
    .join(" ");

/** "ok", "2 errors", "1 warning": the format checks in one cell. */
function checksOf(skill: Skill): string {
  const errors = skill.issues.filter((issue) => issue.severity === "error").length;
  const warnings = skill.issues.length - errors;
  if (errors > 0) return plural(errors, "error");
  return warnings > 0 ? plural(warnings, "warning") : "ok";
}

async function list({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 0);
  const tags = flagList(args, TAG_FLAG.name).map((tag) => tag.toLowerCase());
  const source = flagChoice(args, SOURCE_FLAG.name, SOURCE_TYPES);
  const query = flagString(args, QUERY_FLAG.name) ?? "";
  const favorites = flagBoolean(args, FAVORITES_FLAG.name);
  const value = (await core.api.skills.list()).filter(
    (skill) =>
      matchesSkillQuery(skill, query) &&
      (!favorites || skill.favoritedAt !== null) &&
      (source === undefined || skill.sourceType === source) &&
      tags.every((tag) => skill.tags.some((own) => own.toLowerCase() === tag)),
  );
  const text = table(
    ["name", "source", "updates", "checks", "deployed to", "tags"],
    value.map((s) => [
      nameCell(s),
      s.sourceType,
      s.updateStatus,
      checksOf(s),
      agentsOf(s),
      s.tags.join(", "),
    ]),
    "No skills match.",
  );
  return { value, text };
}

async function show({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 1);
  const value = core.store.resolve(positional(args, 0, "a skill (id, name or folder name)"));
  const text = fields([
    ["Name", value.name],
    ["Id", value.id],
    ["Description", value.description],
    ["Invocation", value.manualOnly ? MANUAL_ONLY_TEXT : null],
    ["Can run", value.traits.map((trait) => trait.message).join(" | ")],
    ["Folder", value.libraryPath],
    ["Source", value.sourceType],
    ["From", value.sourceUrl ?? value.sourceRef],
    ["Subfolder", value.sourceSubpath],
    ["Branch", value.sourceBranch],
    ["Updates", value.updateStatus],
    ["Tags", value.tags.join(", ")],
    ["Note", value.note],
    ["Favourite", value.favoritedAt === null ? null : `since ${when(value.favoritedAt)}`],
    ["Deployed to", agentsOf(value)],
    ["Installed", when(value.createdAt)],
    ["Changed", when(value.updatedAt)],
    ["Problems", value.issues.map((issue) => `${issue.severity}: ${issue.message}`).join(" | ")],
  ]);
  return { value, text };
}

/** Where a skill is deployed, and whether each deployment is still really there on disk. */
async function status({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 1);
  const skill = core.store.resolve(positional(args, 0, "a skill (id, name or folder name)"));
  const byAgent = new Map(skill.deployments.map((d) => [d.agentKey, d]));
  const agents = core.registry
    .list()
    .filter((agent) => agent.installed || byAgent.has(agent.key))
    .map((agent) => {
      const deployment = byAgent.get(agent.key);
      const problem = deployment ? deploymentProblem(deployment.targetPath) : null;
      return {
        agent: agent.key,
        enabled: agent.enabled,
        deployed: deployment !== undefined,
        mode: deployment?.mode ?? null,
        targetPath: deployment?.targetPath ?? null,
        // Usable on disk: a link that leads nowhere counts as absent, so `skills repair` is due.
        presentOnDisk: deployment ? problem === null : null,
        problem,
        blocked: skill.blockedAgents.includes(agent.key),
        // Frontmatter this agent's documentation says it does not act on.
        fieldNotes: fieldNotesFor(skill.behaviorFields, agent.key),
      };
    });
  const value = {
    id: skill.id,
    name: skill.name,
    updateStatus: skill.updateStatus,
    hasConflict: skill.hasConflict,
    presetIds: skill.presetIds,
    agents,
  };
  const text = [
    `${skill.name} - updates: ${skill.updateStatus}`,
    table(
      ["agent", "enabled", "deployed", "blocked", "mode", "on disk", "path"],
      agents.map((a) => [
        a.agent,
        a.enabled,
        a.deployed,
        a.blocked,
        a.mode,
        a.problem ?? a.presentOnDisk,
        a.targetPath,
      ]),
      "No agents are installed.",
    ),
    ...agents.flatMap((a) =>
      a.fieldNotes.map(
        (note) =>
          `${a.agent} ${note.level === "ignored" ? "ignores" : "does not document"} ${note.field}: it has no effect there.`,
      ),
    ),
  ].join("\n");
  return { value, text };
}

async function remove({ core, args }: CommandContext): Promise<CommandResult> {
  // Resolve everything before deleting anything: one bad reference stops the whole request, the
  // dry run included, so a preview never promises what the real run would refuse.
  const skills = resolveSkills(core, positionalsFrom(args, 0, "a skill to remove"));
  requireYes(
    args,
    `delete ${plural(skills.length, "skill")} from the library and undeploy them everywhere`,
  );
  if (flagBoolean(args, DRY_RUN_FLAG.name)) {
    const wouldRemove = skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      deployedTo: skill.deployments.map((d) => d.agentKey),
    }));
    const lines = [
      `Would remove ${plural(wouldRemove.length, "skill")}. Nothing was changed.`,
      ...wouldRemove.map(
        (s) =>
          `  ${s.name}${s.deployedTo.length ? ` (deployed to ${s.deployedTo.join(", ")})` : ""}`,
      ),
    ];
    return { value: { dryRun: true, wouldRemove, failed: [] }, text: lines.join("\n") };
  }
  const result = await core.api.skills.removeMany(skills.map((skill) => skill.id));
  const lines = [`Removed ${plural(result.succeeded, "skill")}.`];
  if (result.removedIds.length > 0) {
    lines.push(
      `Kept in Recently removed for ${REMOVED_KEEP_DAYS} days: see 'removed list', then 'removed restore <id>'.`,
    );
  }
  lines.push(...failureLines(result.failed));
  return {
    value: {
      dryRun: false,
      removed: result.succeeded,
      removedIds: result.removedIds,
      failed: result.failed,
    },
    text: lines.join("\n"),
    exitCode: exitCodeFor(result.failed.length > 0),
  };
}

const ALL_FLAG = {
  name: "all",
  type: "boolean",
  description: "Every skill in the library, instead of naming them.",
} as const;

function deployer(action: "add" | "remove") {
  return async ({ core, args }: CommandContext): Promise<CommandResult> => {
    const adding = action === "add";
    const everything = adding && flagBoolean(args, ALL_FLAG.name);
    if (everything) limitPositionals(args, 0);
    const skills = everything
      ? await core.api.skills.list()
      : resolveSkills(core, positionalsFrom(args, 0, "a skill"));
    const agents = requireAgents(core, args, adding);
    const dryRun = flagBoolean(args, DRY_RUN_FLAG.name);
    const skipConflicts = adding && flagBoolean(args, SKIP_CONFLICTS_FLAG.name);
    const result = await core.api.deploy.apply(
      skills.map((skill) => skill.id),
      agents.map((agent) => agent.key),
      action,
      { dryRun, skipConflicts },
    );
    return applyOutcome(result, { dryRun, skipConflicts });
  };
}

async function editTags({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 1);
  const skill = core.store.resolve(positional(args, 0, "a skill (id, name or folder name)"));
  const add = flagList(args, ADD_FLAG.name);
  const drop = new Set(flagList(args, REMOVE_FLAG.name).map((name) => name.trim().toLowerCase()));
  if (add.length > 0 || drop.size > 0) {
    const next = [...skill.tags, ...add].filter((name) => !drop.has(name.trim().toLowerCase()));
    await core.api.skills.setTags(skill.id, next);
  }
  const tags = core.store.get(skill.id).tags;
  return {
    value: { id: skill.id, name: skill.name, tags },
    text: `${skill.name}: ${tags.length > 0 ? tags.join(", ") : "no tags"}`,
  };
}

export const skillsGroup: CommandGroup = {
  name: "skills",
  summary: "Skills in the library and where they are deployed",
  commands: [
    {
      name: "list",
      summary: "List library skills",
      usage: "",
      flags: [QUERY_FLAG, TAG_FLAG, SOURCE_FLAG, FAVORITES_FLAG],
      run: list,
    },
    { name: "show", summary: "Show one skill in full", usage: "<ref>", flags: [], run: show },
    installCommand,
    useCommand,
    searchCommand,
    createCommand,
    renameCommand,
    usageCommand,
    suggestForCommand,
    blockCommand,
    unblockCommand,
    duplicatesCommand,
    publishCommand,
    feedbackCommand,
    {
      name: "remove",
      summary: "Delete skills from the library and undeploy them",
      usage: "<ref>…",
      flags: [DRY_RUN_FLAG, REQUIRED_YES_FLAG],
      run: remove,
    },
    {
      name: "deploy",
      summary: "Make skills available to agents",
      usage: "<ref>… | --all --agent <key>…",
      flags: [AGENT_FLAG, ALL_FLAG, SKIP_CONFLICTS_FLAG, DRY_RUN_FLAG],
      notes: [DEPLOY_NOTE, "Skills blocked for an agent are skipped and counted."],
      run: deployer("add"),
    },
    {
      name: "undeploy",
      summary: "Take skills away from agents (the library keeps them)",
      usage: "<ref>… --agent <key>…",
      flags: [AGENT_FLAG, DRY_RUN_FLAG],
      run: deployer("remove"),
    },
    {
      name: "status",
      summary: "Where a skill is deployed",
      usage: "<ref>",
      flags: [],
      run: status,
    },
    checkCommand,
    updateCommand,
    repairCommand,
    validateCommand,
    diffCommand,
    scanCommand,
    adoptCommand,
    exportCommand,
    {
      name: "tag",
      summary: "Show or change a skill's tags",
      usage: "<ref>",
      flags: [ADD_FLAG, REMOVE_FLAG],
      run: editTags,
    },
    noteCommand,
    favoriteCommand,
  ],
};

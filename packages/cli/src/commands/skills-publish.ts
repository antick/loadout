import {
  PUBLISH_LAYERS,
  PUBLISH_LAYER_DIRS,
  type PublishLayer,
  type PublishPlan,
  type PublishResult,
  type PublishSkillPlan,
  repositoryLabel,
} from "@loadout/shared";
import { UsageError, flagBoolean, flagChoice, flagString } from "../args";
import { plural, table } from "../output";
import { DRY_RUN_FLAG, REQUIRED_YES_FLAG, requireYes, resolveSkills } from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";

const REPO_FLAG = {
  name: "repo",
  type: "string",
  value: "address",
  description: "Repository to publish to: https:// or ssh address, owner/repo, or a folder.",
} as const;
const BRANCH_FLAG = {
  name: "branch",
  type: "string",
  value: "name",
  description: "Branch to publish to. Default: the repository's own default branch.",
} as const;
const LAYER_FLAG = {
  name: "layer",
  type: "string",
  value: "layer",
  description: `Where in the repository: ${PUBLISH_LAYERS.join(", ")}. Default: root (skills/).`,
} as const;
const ALL_FLAG = {
  name: "all",
  type: "boolean",
  description: "Every skill in the library.",
} as const;
const ALLOW_SECRETS_FLAG = {
  name: "allow-secrets",
  type: "boolean",
  description: "Publish what looks like keys or tokens anyway. Read the findings first.",
} as const;

const SHORT_COMMIT = 10;

function changesOf(skill: PublishSkillPlan): string {
  const { added, changed, removed } = skill.files;
  if (skill.status !== "changed") return "";
  return [added ? `+${added}` : "", changed ? `~${changed}` : "", removed ? `-${removed}` : ""]
    .filter(Boolean)
    .join(" ");
}

function noteOf(skill: PublishSkillPlan): string {
  if (skill.reason) return skill.reason;
  if (skill.leftOutCount === 0) return "";
  const more = skill.leftOutCount - skill.leftOut.length;
  return `left out: ${skill.leftOut.join(", ")}${more > 0 ? ` and ${more} more` : ""}`;
}

function describePlan(plan: PublishPlan): string {
  const { target } = plan;
  const where = `${repositoryLabel(target.repo)} on ${target.branch}`;
  const lines = [
    `${plural(plan.skills.length, "skill")} for ${where}, in ${PUBLISH_LAYER_DIRS[target.layer]}/`,
  ];
  if (plan.repoEmpty) lines.push("The repository is empty.");
  else if (plan.newBranch)
    lines.push(`The branch ${target.branch} is new; it starts from the default one.`);
  lines.push(
    table(
      ["skill", "status", "changes", "note"],
      plan.skills.map((skill) => [skill.name, skill.status, changesOf(skill), noteOf(skill)]),
      "Nothing to publish.",
    ),
  );
  for (const secret of plan.secrets) {
    lines.push(`Looks like a key or token: ${secret.file}, line ${secret.line} (${secret.masked})`);
  }
  return lines.join("\n");
}

function describeResult(result: PublishResult): string {
  const { plan } = result;
  const lines = [describePlan(plan)];
  if (result.commit) {
    lines.push(
      `Published ${result.published.join(", ")} to ${repositoryLabel(plan.target.repo)} (${result.commit.slice(0, SHORT_COMMIT)}).`,
    );
  } else {
    lines.push("Nothing to publish: the repository already has these skills as they are.");
  }
  if (result.installCommands.length > 0) {
    lines.push("Install them with:", ...result.installCommands.map((command) => `  ${command}`));
  }
  return lines.join("\n");
}

function layerOf(context: CommandContext): PublishLayer | undefined {
  return flagChoice(context.args, LAYER_FLAG.name, PUBLISH_LAYERS);
}

/** Copy chosen library skills into another Git repository, so others can install them. */
async function publish(context: CommandContext): Promise<CommandResult> {
  const { core, args } = context;
  const refs = args.positionals;
  const all = flagBoolean(args, ALL_FLAG.name);
  if ((refs.length === 0) === !all) throw new UsageError("Give one or more skills, or --all.");
  const saved = await core.api.publish.defaults();
  const repo = flagString(args, REPO_FLAG.name) ?? saved?.repo;
  if (!repo) throw new UsageError(`--${REPO_FLAG.name} <address> is required.`);
  const skills = all ? await core.api.skills.list() : resolveSkills(core, refs);
  const explicitRepo = flagString(args, REPO_FLAG.name) !== undefined;
  const input = {
    skillIds: skills.map((skill) => skill.id),
    repo,
    // A saved branch and layer belong to the saved repository only.
    branch: flagString(args, BRANCH_FLAG.name) ?? (explicitRepo ? null : saved?.branch),
    layer: layerOf(context) ?? (explicitRepo ? undefined : saved?.layer),
    allowSecrets: flagBoolean(args, ALLOW_SECRETS_FLAG.name),
  };
  // Asked once the input is known good, so a typo is reported before a missing --yes.
  requireYes(args, `push skills to ${repositoryLabel(repo)}`);
  if (flagBoolean(args, DRY_RUN_FLAG.name)) {
    const plan = await core.api.publish.preview(input);
    return { value: plan, text: `${describePlan(plan)}\nNothing was changed.` };
  }
  const result = await core.api.publish.publish(input);
  return { value: result, text: describeResult(result) };
}

export const publishCommand: CommandSpec = {
  name: "publish",
  summary: "Copy skills into a Git repository others can install from",
  usage: "<ref>… | --all",
  flags: [
    REPO_FLAG,
    BRANCH_FLAG,
    LAYER_FLAG,
    ALL_FLAG,
    ALLOW_SECRETS_FLAG,
    DRY_RUN_FLAG,
    REQUIRED_YES_FLAG,
  ],
  notes: [
    "Only the skill folders are copied: no tags, agents or backup data. Dependencies (node_modules), .env files, logs and links are left out.",
    "Anyone can then run: npx skills add <owner/repo> --skill <name>. The repository can be public or private.",
    "Signs in with your SSH key or your Git credential helper (the app also uses the token saved in Settings → Backup). It never forces a push, and it will not publish to this library's own backup repository.",
    "The commit is made under your own Git name and e-mail.",
    "Without --repo, the repository, branch and layer of the last publish are used.",
  ],
  run: publish,
};

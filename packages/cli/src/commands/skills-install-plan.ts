import {
  type Core,
  previewLibrary,
  readSkillIdentity,
  requireSkillFolder,
  skillTraits,
} from "@loadout/core";
import {
  type GitPreview,
  type InstallOutcome,
  type InstallSelection,
  type Skill,
  type SkillTrait,
  type SkillTraitCode,
  planInstallNames,
} from "@loadout/shared";
import { outcomeLabel } from "../install-outcome";
import { plural, table } from "../output";

/** One skill `skills install --dry-run` would add, and what its name would do. */
export interface InstallPlanRow {
  name: string;
  /** Its folder in the source; null for a folder installed as a whole. */
  relPath: string | null;
  outcome: InstallOutcome;
  manualOnly: boolean;
  /** What installing it puts in reach of an agent: scripts, hooks, MCP servers, tools. */
  traits: SkillTrait[];
}

/** What `skills install --dry-run` reports. Nothing is written. */
export interface InstallPlan {
  dryRun: true;
  source: string;
  skills: InstallPlanRow[];
  /** A marketplace skill already installed is refreshed in place, keeping its name. */
  refreshesInPlace: boolean;
  /** Another site the download moved to; a real install needs `--yes` for it. */
  redirectedTo: string | null;
}

const NEW_LABEL = "new";

/** What a trait is called in the `can run` column. */
const TRAIT_LABELS: Record<SkillTraitCode, string> = {
  scripts: "scripts",
  hooks: "hooks",
  mcp: "MCP servers",
  tool_grants: "pre-approved tools",
};

/** The plan for chosen skills of a fetched preview. */
export function planPreview(preview: GitPreview, items: readonly InstallSelection[]): InstallPlan {
  const outcomes = planInstallNames(
    items.map((item) => item.name),
    preview.library,
    undefined,
    items.map((item) => item.replace === true),
  );
  return {
    dryRun: true,
    source: preview.repoUrl,
    skills: items.flatMap((item, index) => {
      const outcome = outcomes[index];
      const row = preview.skills.find((skill) => skill.relPath === item.relPath);
      return outcome
        ? [
            {
              name: item.name,
              relPath: item.relPath,
              outcome,
              manualOnly: row?.manualOnly ?? false,
              traits: row?.traits ?? [],
            },
          ]
        : [];
    }),
    refreshesInPlace: false,
    redirectedTo: preview.redirectedTo,
  };
}

/** The plan for one folder on this computer, installed as a whole. */
export function planFolder(core: Core, source: string, name: string | undefined): InstallPlan {
  const path = requireSkillFolder(source);
  const identity = readSkillIdentity(path);
  const chosen = name?.trim() || identity.name;
  const library = previewLibrary(
    core.ctx,
    core.store,
    (skill: Skill) => skill.sourceType === "local" && skill.sourceRef === path,
  );
  const [outcome] = planInstallNames([chosen], library);
  return {
    dryRun: true,
    source: path,
    skills: outcome
      ? [
          {
            name: chosen,
            relPath: null,
            outcome,
            manualOnly: identity.manualOnly,
            traits: skillTraits(path),
          },
        ]
      : [],
    refreshesInPlace: false,
    redirectedTo: null,
  };
}

/**
 * The plan for `owner/repo@skill` or `@owner/slug`. Nothing is fetched: a marketplace installs by
 * name, and installing one that is already here refreshes it in place.
 */
export function planMarket(
  core: Core,
  source: string,
  skillId: string,
  sourceType: "marketplace" | "clawhub" = "marketplace",
): InstallPlan {
  const key = `${source.trim()}/${skillId.trim()}`;
  const installed = core.store
    .list()
    .find((skill) => skill.sourceType === sourceType && skill.sourceRef === key);
  const library = previewLibrary(core.ctx, core.store, (skill) => skill.id === installed?.id);
  const name = installed?.name ?? skillId;
  const [outcome] = planInstallNames([name], library);
  return {
    dryRun: true,
    source: key,
    skills: outcome
      ? [
          {
            name,
            relPath: null,
            outcome,
            manualOnly: installed?.manualOnly ?? false,
            traits: installed?.traits ?? [],
          },
        ]
      : [],
    refreshesInPlace: installed !== undefined,
    redirectedTo: null,
  };
}

/** The plan as a person reads it. */
export function planText(plan: InstallPlan): string {
  const rows = plan.skills.map((row) => [
    row.name,
    plan.refreshesInPlace
      ? "already installed: refreshed in place"
      : outcomeLabel(row.outcome) || NEW_LABEL,
    row.manualOnly ? "manual only" : "",
    row.traits.map((trait) => TRAIT_LABELS[trait.code]).join(", "),
    row.relPath ?? "",
  ]);
  const lines = [
    `Dry run: nothing was installed. From ${plan.source}, ${plural(plan.skills.length, "skill")} would be added:`,
    table(["name", "outcome", "invocation", "can run", "folder"], rows, "  (none)"),
  ];
  if (plan.skills.some((row) => row.outcome.kind === "taken")) {
    lines.push(
      "A skill identical to the one holding its name is not added twice: the library keeps one.",
    );
  }
  if (plan.redirectedTo) {
    lines.push(`The download moved to ${plan.redirectedTo}; installing needs --yes to accept it.`);
  }
  lines.push("A dry run skips the safety check; the real install still runs it.");
  return lines.join("\n");
}

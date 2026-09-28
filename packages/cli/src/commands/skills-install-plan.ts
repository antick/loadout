import { statSync } from "node:fs";
import { type Core, invalid, previewLibrary, readSkillIdentity } from "@loadout/core";
import {
  type GitPreview,
  type InstallOutcome,
  type InstallSelection,
  type Skill,
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

/** The plan for chosen skills of a fetched preview. */
export function planPreview(preview: GitPreview, items: readonly InstallSelection[]): InstallPlan {
  const outcomes = planInstallNames(
    items.map((item) => item.name),
    preview.library,
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
            },
          ]
        : [];
    }),
    refreshesInPlace: false,
    redirectedTo: preview.redirectedTo,
  };
}

/** The plan for one folder on this computer, installed as a whole. */
export function planFolder(core: Core, path: string, name: string | undefined): InstallPlan {
  if (!statSync(path, { throwIfNoEntry: false })?.isDirectory()) {
    throw invalid(`Not a folder: ${path}`);
  }
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
      ? [{ name: chosen, relPath: null, outcome, manualOnly: identity.manualOnly }]
      : [],
    refreshesInPlace: false,
    redirectedTo: null,
  };
}

/**
 * The plan for `owner/repo@skill`. Nothing is fetched: the marketplace installs by folder name,
 * and installing one that is already here refreshes it in place.
 */
export function planMarket(core: Core, source: string, skillId: string): InstallPlan {
  const key = `${source.trim()}/${skillId.trim()}`;
  const installed = core.store
    .list()
    .find((skill) => skill.sourceType === "marketplace" && skill.sourceRef === key);
  const library = previewLibrary(core.ctx, core.store, (skill) => skill.id === installed?.id);
  const name = installed?.name ?? skillId;
  const [outcome] = planInstallNames([name], library);
  return {
    dryRun: true,
    source: key,
    skills: outcome
      ? [{ name, relPath: null, outcome, manualOnly: installed?.manualOnly ?? false }]
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
    row.relPath ?? "",
  ]);
  const lines = [
    `Dry run: nothing was installed. From ${plan.source}, ${plural(plan.skills.length, "skill")} would be added:`,
    table(["name", "outcome", "invocation", "folder"], rows, "  (none)"),
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

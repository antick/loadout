import {
  type GitPreview,
  type InstallPlan,
  type InstallSelection,
  type RepoSkillPreview,
  type SafetyReport,
  type Skill,
  planInstallNames,
} from "@loadout/shared";
import type { CoreContext } from "../context";
import { readSkillIdentity } from "../skills/metadata";
import type { SkillStore } from "../skills/store";
import { skillTraits } from "../skills/traits";
import { sanitizeSkillName } from "../util/names";
import { previewLibrary } from "./fetched-preview";
import { requireSkillFolder } from "./read-skill";

/**
 * What `skills install --dry-run` would add and under which names, built from what the real
 * install has already fetched and safety-checked. Nothing is written.
 */

/**
 * A name as the install would write it (`installIntoLibrary`): made safe for a folder, and
 * refused where the install refuses it, so a dry run says what the real run does.
 */
function nameAsInstalled(name: string): string {
  return name.trim() ? sanitizeSkillName(name) : name;
}

/** Safety reports by the folder a skill has in its source (`relPath`), or `""` for one skill. */
export type SafetyByPath = ReadonlyMap<string, SafetyReport | null>;

/** The plan for chosen skills of a fetched preview, each already safety-checked. */
export function planPreview(
  preview: GitPreview,
  items: readonly InstallSelection[],
  safety: SafetyByPath,
): InstallPlan {
  const names = items.map((item) => nameAsInstalled(item.name));
  const outcomes = planInstallNames(
    names,
    preview.library,
    undefined,
    items.map((item) => item.replace === true),
  );
  return {
    dryRun: true,
    source: preview.repoUrl,
    installed: items.flatMap((item, index) => {
      const outcome = outcomes[index];
      const row = preview.skills.find((skill) => skill.relPath === item.relPath);
      return outcome
        ? [
            {
              name: names[index] ?? item.name,
              relPath: item.relPath,
              outcome,
              manualOnly: row?.manualOnly ?? false,
              traits: row?.traits ?? [],
              safety: safety.get(item.relPath) ?? null,
            },
          ]
        : [];
    }),
    refreshesInPlace: false,
    redirectedTo: preview.redirectedTo,
  };
}

/** The plan for one folder on this computer, installed as a whole, already safety-checked. */
export function planFolder(
  ctx: CoreContext,
  store: SkillStore,
  source: string,
  name: string | undefined,
  safety: SafetyReport | null,
): InstallPlan {
  const path = requireSkillFolder(source);
  const identity = readSkillIdentity(path);
  const chosen = name?.trim() ? nameAsInstalled(name) : identity.name;
  const library = previewLibrary(
    ctx,
    store,
    (skill: Skill) => skill.sourceType === "local" && skill.sourceRef === path,
  );
  const [outcome] = planInstallNames([chosen], library);
  return {
    dryRun: true,
    source: path,
    installed: outcome
      ? [
          {
            name: chosen,
            relPath: null,
            outcome,
            manualOnly: identity.manualOnly,
            traits: skillTraits(path),
            safety,
          },
        ]
      : [],
    refreshesInPlace: false,
    redirectedTo: null,
  };
}

/**
 * The plan for `owner/repo@skill` or `@owner/slug`, fetched and safety-checked. A marketplace
 * installs by name, and installing one that is already here refreshes it in place.
 */
export function planMarket(
  ctx: CoreContext,
  store: SkillStore,
  fetched: {
    source: string;
    skillId: string;
    sourceType: "marketplace" | "clawhub";
    safety: SafetyReport | null;
    /** The skill as its repository lists it; ClawHub lists none. */
    row?: RepoSkillPreview;
  },
): InstallPlan {
  const key = `${fetched.source.trim()}/${fetched.skillId.trim()}`;
  const installed = store
    .list()
    .find((skill) => skill.sourceType === fetched.sourceType && skill.sourceRef === key);
  const library = previewLibrary(ctx, store, (skill) => skill.id === installed?.id);
  const name = installed?.name ?? fetched.skillId;
  const [outcome] = planInstallNames([name], library);
  return {
    dryRun: true,
    source: key,
    installed: outcome
      ? [
          {
            name,
            relPath: null,
            outcome,
            manualOnly: fetched.row?.manualOnly ?? installed?.manualOnly ?? false,
            traits: fetched.row?.traits ?? installed?.traits ?? [],
            safety: fetched.safety,
          },
        ]
      : [],
    refreshesInPlace: installed !== undefined,
    redirectedTo: null,
  };
}

import type { Skill } from "@loadout/shared";
import type { CoreContext } from "../context";
import { hashAsLibraryCopy } from "../skills/numbered-name";
import type { SkillStore } from "../skills/store";
import type { RemovedStore } from "../storage/removed";
import { LIBRARY_PLACE } from "../storage/removed-library";
import { hashDir } from "../util/hash";
import type { InstallIntoLibrary, InstallRequest } from "./library";

/** What replacing a library skill needs besides the installer. Absent parts are skipped. */
export interface ReplaceDeps {
  /** Keeps the version being replaced in Recently removed. */
  removed?: Pick<RemovedStore, "keepCopy">;
  /** Rewrites copies deployed to agents, so they show the new version too. */
  refreshCopies?(skill: Skill): Promise<unknown>;
}

/**
 * The library skill holding `name`, compared without letter case as the import plan does
 * (`planInstallNames`). Null when the name is free or held by a folder no skill owns.
 */
export function skillHoldingName(store: SkillStore, name: string): Skill | null {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  return store.list().find((skill) => skill.dirName.toLowerCase() === key) ?? null;
}

/**
 * Put the skill in `request.sourceDir` in place of `owner`: same folder, id, tags, presets and
 * deployments, new content and source. The old version goes to Recently removed first, unless
 * the two are identical and nothing changes.
 */
export async function installReplacing(
  ctx: CoreContext,
  install: InstallIntoLibrary,
  deps: ReplaceDeps,
  owner: Skill,
  request: InstallRequest,
): Promise<Skill> {
  const skill = await ctx.lock.run(`replace ${owner.name}`, async () => {
    const changed =
      hashAsLibraryCopy(request.sourceDir, owner.dirName) !== hashDir(owner.libraryPath);
    if (changed)
      deps.removed?.keepCopy(owner.libraryPath, { place: LIBRARY_PLACE, reason: "replaced" });
    return install({
      ...request,
      name: owner.name,
      record: { ...request.record, replaceSkillId: owner.id },
    });
  });
  await deps.refreshCopies?.(skill);
  return skill;
}

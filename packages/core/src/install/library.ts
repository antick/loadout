import { join } from "node:path";
import type { ActivityKind, Skill, SourceType, UpdateStatus } from "@skillboard/shared";
import type { CoreContext } from "../context";
import { errorMessage, invalid } from "../errors";
import { readSkillIdentity } from "../skills/metadata";
import type { SkillStore } from "../skills/store";
import { canonicalPath, isDirectory, isInside, lstatOrNull, replaceDirAtomic } from "../util/fs";
import { hashDir } from "../util/hash";
import { firstFreeName, sanitizeSkillName } from "../util/names";
import { redactUrl } from "./git-source";

/** Where the installed skill came from; written to its row as is. */
export interface InstallRecord {
  sourceType: SourceType;
  sourceRef: string | null;
  sourceUrl?: string | null;
  sourceSubpath?: string | null;
  sourceBranch?: string | null;
  sourceRevision?: string | null;
  /** Defaults to `sourceRevision`: right after an install the library matches upstream. */
  remoteRevision?: string | null;
  updateStatus: UpdateStatus;
  /** Overwrite this library skill in place, keeping its folder, id, tags, presets, deployments. */
  replaceSkillId?: string | null;
}

export interface InstallRequest {
  sourceDir: string;
  /** Chosen name. Blank or missing → frontmatter name, else the source folder's name. */
  name?: string | null;
  record: InstallRecord;
  /**
   * When the destination already belongs to a library skill, return that skill untouched instead
   * of reinstalling over it. Imports use this so they never rewrite a tracked skill's source.
   */
  keepExisting?: boolean;
  /** History entry kind. Defaults to "install". */
  activityKind?: ActivityKind;
}

/** Bound form handed to other services. */
export type InstallIntoLibrary = (request: InstallRequest) => Promise<Skill>;

/**
 * The one place a skill is written into the library.
 * Destination: `<skills>/<name>`; taken by different content → `<name>-2`, `-3`, …; a folder
 * holding the very same content is reused, which makes installing twice a reinstall.
 */
export async function installIntoLibrary(
  ctx: CoreContext,
  store: SkillStore,
  request: InstallRequest,
): Promise<Skill> {
  const { sourceDir, record } = request;
  const kind = request.activityKind ?? "install";
  if (!isDirectory(sourceDir)) throw invalid(`Not a folder: ${sourceDir}`);
  const skillsDir = ctx.paths.skillsDir;
  if (isInside(canonicalPath(skillsDir), canonicalPath(sourceDir))) {
    throw invalid("That folder is already inside the skill library");
  }
  const identity = readSkillIdentity(sourceDir);
  const name = request.name?.trim() ? sanitizeSkillName(request.name) : identity.name;
  const sourceHash = hashDir(sourceDir);
  if (sourceHash === null) throw invalid(`The folder has no files to install: ${sourceDir}`);

  try {
    const outcome = await ctx.lock.run(`install ${name}`, async () => {
      const replaced = record.replaceSkillId ? store.get(record.replaceSkillId) : null;
      const destination =
        replaced?.libraryPath ??
        join(
          skillsDir,
          firstFreeName(name, (candidate) => {
            const path = join(skillsDir, candidate);
            return lstatOrNull(path) === null || hashDir(path) === sourceHash;
          }),
        );
      const owner = replaced ?? store.findByLibraryPath(destination);
      if (owner && request.keepExisting) return { skill: owner, written: false };

      // Same content already in place: leave the folder alone so deployed links never flicker.
      // Copy from the real folder: a source that is itself a link would be copied as a link.
      if (hashDir(destination) !== sourceHash) {
        await replaceDirAtomic(canonicalPath(sourceDir), destination);
      }

      const fields = {
        name,
        description: identity.description,
        sourceType: record.sourceType,
        sourceRef: record.sourceRef,
        sourceUrl: record.sourceUrl ?? null,
        sourceSubpath: record.sourceSubpath ?? null,
        sourceBranch: record.sourceBranch ?? null,
        sourceRevision: record.sourceRevision ?? null,
        remoteRevision: record.remoteRevision ?? record.sourceRevision ?? null,
        contentHash: hashDir(destination),
        updateStatus: record.updateStatus,
      };
      const skill = owner
        ? store.update(owner.id, { ...fields, lastCheckedAt: Date.now(), lastCheckError: null })
        : store.insert({ ...fields, libraryPath: destination });
      return { skill, written: true };
    });
    if (outcome.written) {
      ctx.activity.record(kind, outcome.skill.name, describeSource(record));
      ctx.touched("skills");
    }
    return outcome.skill;
  } catch (error) {
    ctx.activity.record(kind, name, errorMessage(error), false);
    throw error;
  }
}

function describeSource(record: InstallRecord): string {
  return record.sourceRef
    ? `${record.sourceType}: ${redactUrl(record.sourceRef)}`
    : record.sourceType;
}

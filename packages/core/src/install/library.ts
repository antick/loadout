import { redactUrl, firstFreeName } from "@loadout/shared";

import { basename, join } from "node:path";

import type { ActivityKind, Skill, SourceType, UpdateStatus } from "@loadout/shared";

import type { CoreContext } from "../context";

import { errorMessage, invalid } from "../errors";

import { readSkillIdentity } from "../skills/metadata";

import { fixNumberedName, hashAsLibraryCopy } from "../skills/numbered-name";

import type { SkillStore } from "../skills/store";

import { canonicalPath, isDirectory, lstatOrNull, readDirSafe, replaceDirAtomic } from "../util/fs";

import { fileDigests, hashDir } from "../util/hash";

import { sanitizeSkillName } from "../util/names";

import { isReallyInside } from "../util/safe-path";

/** Where the installed skill came from; written to its row as is. */
export interface InstallRecord {
  sourceType: SourceType;
  sourceRef: string | null;
  sourceUrl?: string | null;
  sourceSubpath?: string | null;
  sourceBranch?: string | null;
  /** Another site the download moved to, agreed to by the user. Left as it was when absent. */
  sourceTrustedHost?: string | null;
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
  /** Write a failure to the history (default true). Updates write their own entry. */
  recordFailure?: boolean;
}

/** Bound form handed to other services. */
export type InstallIntoLibrary = (request: InstallRequest) => Promise<Skill>;

/**
 * The one place a skill is written into the library.
 * Destination: `<skills>/<name>`; taken by different content → `<name>-2`, `-3`, …, with the name
 * in its SKILL.md set to match; a folder holding the very same content is reused, which makes
 * installing twice a reinstall.
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
  if (isReallyInside(skillsDir, sourceDir)) {
    throw invalid("That folder is already inside the skill library");
  }
  const identity = readSkillIdentity(sourceDir);
  const name = request.name?.trim() ? sanitizeSkillName(request.name) : identity.name;
  const sourceHash = hashDir(sourceDir);
  if (sourceHash === null) throw invalid(`The folder has no files to install: ${sourceDir}`);
  // What the source hashes to as a library copy called each name tried: worked out once each.
  const copyHashes = new Map<string, string | null>();
  const copyHashAs = (dirName: string): string | null => {
    if (!copyHashes.has(dirName)) copyHashes.set(dirName, hashAsLibraryCopy(sourceDir, dirName));
    return copyHashes.get(dirName) ?? null;
  };

  try {
    const outcome = await ctx.lock.run(`install ${name}`, async () => {
      const replaced = record.replaceSkillId ? store.get(record.replaceSkillId) : null;
      const destination =
        replaced?.libraryPath ??
        join(
          skillsDir,
          onDiskName(
            skillsDir,
            firstFreeName(name, (candidate) => {
              const path = join(skillsDir, candidate);
              if (lstatOrNull(path) === null) return true;
              const held = hashDir(path);
              return held === sourceHash || held === copyHashAs(candidate);
            }),
          ),
        );
      const owner = replaced ?? store.findByLibraryPath(destination);
      if (owner && request.keepExisting) return { skill: owner, written: false };

      // Same content already in place: leave the folder alone so deployed links never flicker.
      // Copy from the real folder: a source that is itself a link would be copied as a link.
      const dirName = basename(destination);
      const held = hashDir(destination);
      const inPlace = held !== null && held === copyHashAs(dirName);
      if (!inPlace) await replaceDirAtomic(canonicalPath(sourceDir), destination);
      const fixedName = fixNumberedName(destination, dirName);

      const fields = {
        name: fixedName ?? name,
        description: identity.description,
        sourceType: record.sourceType,
        sourceRef: record.sourceRef,
        sourceUrl: record.sourceUrl ?? null,
        sourceSubpath: record.sourceSubpath ?? null,
        sourceBranch: record.sourceBranch ?? null,
        ...(record.sourceTrustedHost === undefined
          ? {}
          : { sourceTrustedHost: record.sourceTrustedHost }),
        sourceRevision: record.sourceRevision ?? null,
        remoteRevision: record.remoteRevision ?? record.sourceRevision ?? null,
        contentHash: inPlace && fixedName === null ? held : hashDir(destination),
        updateStatus: record.updateStatus,
        // The folder now holds exactly what the source has: nothing is edited any more.
        editedFiles: [],
      };
      const skill = owner
        ? store.update(owner.id, { ...fields, lastCheckedAt: Date.now(), lastCheckError: null })
        : store.insert({ ...fields, libraryPath: destination });
      // What came from the source: any later difference is an edit an update must ask about.
      if (fields.contentHash) {
        store.setInstalled(skill.id, { hash: fields.contentHash, files: fileDigests(destination) });
      }
      return { skill, written: true };
    });
    if (outcome.written) {
      ctx.activity.record(kind, outcome.skill.name, describeSource(record));
      ctx.touched("skills");
    }
    return outcome.skill;
  } catch (error) {
    if (request.recordFailure !== false)
      ctx.activity.record(kind, name, errorMessage(error), false);
    throw error;
  }
}

/**
 * The folder's own name when one exists under another letter case: on a case-insensitive disk
 * `PDF` is the folder `pdf`, and the database must record the one path that is really there, or
 * two skills end up owning one folder.
 */
function onDiskName(dir: string, name: string): string {
  const wanted = lstatOrNull(join(dir, name));
  if (!wanted) return name;
  const entries = readDirSafe(dir).map((entry) => entry.name);
  if (entries.includes(name)) return name;
  const same = entries.find((entry) => {
    if (entry.toLowerCase() !== name.toLowerCase()) return false;
    const found = lstatOrNull(join(dir, entry));
    return found !== null && found.ino === wanted.ino && found.dev === wanted.dev;
  });
  return same ?? name;
}

function describeSource(record: InstallRecord): string {
  return record.sourceRef
    ? `${record.sourceType}: ${redactUrl(record.sourceRef)}`
    : record.sourceType;
}

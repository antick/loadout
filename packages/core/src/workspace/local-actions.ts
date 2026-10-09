import { relative } from "node:path";
import { type LocalSkill, type Skill, type SkillDocument, firstFreeName } from "@loadout/shared";
import type { CoreContext } from "../context";
import type { DeployService } from "../deploy";
import { writeTarget } from "../deploy";
import { invalid, notFound } from "../errors";
import type { InstallIntoLibrary } from "../install/library";
import { installReplacing } from "../install/replace";
import { readSkillDocument } from "../skills/metadata";
import type { SkillStore } from "../skills/store";
import type { RemovedStore } from "../storage/removed";
import {
  canonicalPath,
  isDirectory,
  isSkillDir,
  listTopLevel,
  lstatOrNull,
  removePathSync,
  replaceDirAtomic,
  toPosix,
} from "../util/fs";
import { hashDir, holdsUncopiedEntries } from "../util/hash";
import {
  type LibraryIndex,
  type LocalEntry,
  type LocalSkillDir,
  type MatchMode,
  classifySync,
  describeLocalSkill,
  matchLibrarySkill,
} from "./local-scan";
import { logRedeployProblems } from "../deploy/report-log";
import { resolveInside } from "../util/safe-path";

/** What the global and the project workspaces both need to move content in and out of the library. */
export interface LocalSyncDeps {
  store: SkillStore;
  deploy: Pick<DeployService, "refreshCopies">;
  install: { installIntoLibrary: InstallIntoLibrary };
  /** Recently removed: where a folder the user replaces or deletes is kept. */
  removed: Pick<RemovedStore, "setAside" | "keepCopy">;
}

/** Where a replaced folder is kept, and how its place is named there. */
export interface SetAsidePlace {
  removed: Pick<RemovedStore, "setAside">;
  place: string;
}

/** Who a local skill folder is listed under. */
export interface LocalOwner {
  agentKey: string;
  agentDisplayName: string;
  enabled: boolean;
  /** Whether this owner holds a deployment of the matched skill. Project copies never do. */
  isManaged?: (skill: Skill) => boolean;
}

export function toLocalSkill(
  entry: LocalEntry,
  library: LibraryIndex,
  mode: MatchMode,
  owner: LocalOwner,
): LocalSkill {
  const match = matchLibrarySkill(entry, library, mode);
  return {
    name: entry.name,
    dirName: entry.dirName,
    relativePath: entry.relativePath,
    description: entry.description,
    path: entry.path,
    files: entry.files,
    enabled: owner.enabled,
    agentKey: owner.agentKey,
    agentDisplayName: owner.agentDisplayName,
    tags: match?.tags ?? [],
    librarySkillId: match?.id ?? null,
    managed: match !== null && (owner.isManaged?.(match) ?? false),
    linkTarget: lstatOrNull(entry.path)?.isSymbolicLink() ? canonicalPath(entry.path) : null,
    syncStatus: classifySync(entry, match),
    duplicates: [],
  };
}

/** The skill folder at a caller-supplied relative path, which may not leave `root`. Reads nothing. */
export function requireLocalSkillDir(root: string, relativePath: string): LocalSkillDir {
  const path = resolveInside(root, relativePath);
  if (!isSkillDir(path)) throw notFound(`No skill found at ${relativePath}`);
  return { path, relativePath: toPosix(relative(root, path)) };
}

/** `requireLocalSkillDir`, described: its document read and its content hashed. */
export function requireLocalSkill(root: string, relativePath: string): LocalEntry {
  return describeLocalSkill(requireLocalSkillDir(root, relativePath));
}

/**
 * The document of a local skill. A linked document must stay inside the skills root, or inside
 * the skill's own real folder when the whole skill is a link (a deployed library skill).
 */
export function readLocalDocument(root: string, relativePath: string): SkillDocument {
  const entry = requireLocalSkillDir(root, relativePath);
  const found = readSkillDocument(entry.path, root) ?? readSkillDocument(entry.path);
  return {
    filename: found?.filename ?? "",
    content: found?.content ?? "",
    files: listTopLevel(entry.path),
    path: entry.path,
  };
}

/**
 * Copy a local skill into the library: over its matched skill, or as a new local skill.
 * Overwriting keeps where the skill came from; only its content, description and status change.
 */
export async function pushLocalToLibrary(
  ctx: CoreContext,
  deps: LocalSyncDeps,
  entry: Pick<LocalEntry, "path" | "name">,
  match: Skill | null,
): Promise<Skill> {
  const { store, deploy, install, removed } = deps;
  if (!match) {
    const name = firstFreeName(entry.name, (candidate) => store.findByName(candidate).length === 0);
    return install.installIntoLibrary({
      sourceDir: entry.path,
      name,
      activityKind: "import",
      record: { sourceType: "local", sourceRef: entry.path, updateStatus: "local_only" },
    });
  }
  // Copies deployed elsewhere were made from the old content.
  const refreshCopies = async (skill: Skill): Promise<void> => {
    const report = await deploy.refreshCopies(skill, { keepModified: true });
    logRedeployProblems(ctx.log, report, "refresh");
  };
  // The library version it replaces goes to Recently removed, as any replaced skill does.
  return installReplacing(ctx, install.installIntoLibrary, { removed, refreshCopies }, match, {
    sourceDir: entry.path,
    activityKind: "import",
    userContent: true,
    record: {
      sourceType: match.sourceType,
      sourceRef: match.sourceRef,
      sourceUrl: match.sourceUrl,
      sourceSubpath: match.sourceSubpath,
      sourceBranch: match.sourceBranch,
      sourceRevision: match.sourceRevision,
      remoteRevision: match.remoteRevision,
      updateStatus: "local_only",
    },
  });
}

/**
 * Replace a local skill folder with the library version. Only call this when the user asked for
 * it. A link is re-made, never written through, so the library cannot be copied onto itself. A
 * folder holding anything the library does not is kept in Recently removed; resolves to that
 * entry's id, or null when nothing was kept.
 */
export async function replaceLocalFromLibrary(
  ctx: CoreContext,
  skill: Skill,
  localPath: string,
  aside: SetAsidePlace,
): Promise<string | null> {
  return ctx.lock.run(`restore ${skill.name}`, async () => {
    if (!isDirectory(skill.libraryPath)) {
      throw notFound(`The skill folder is missing: ${skill.libraryPath}`);
    }
    const stat = lstatOrNull(localPath);
    if (stat?.isSymbolicLink()) {
      await writeTarget(skill.libraryPath, localPath, "symlink", { kind: "user_confirmed" });
      return null;
    }
    if (stat && !stat.isDirectory()) throw invalid(`Not a skill folder: ${localPath}`);
    // A `.git` folder or a link inside is not in the library copy even when the hashes agree.
    const differs =
      stat !== null &&
      (hashDir(localPath) !== hashDir(skill.libraryPath) || holdsUncopiedEntries(localPath));
    let keptId: string | null = null;
    const keepReplaced = (replaced: string): void => {
      try {
        keptId = aside.removed.setAside(replaced, {
          place: aside.place,
          reason: "replaced",
          originalPath: localPath,
        });
      } catch (error) {
        // Never lose it: the hidden sibling stays where it is and the log says where.
        ctx.log.warn(`Could not keep the replaced ${localPath}; it is at ${replaced}`, error);
        return;
      }
      if (keptId === null) removePathSync(replaced);
    };
    await replaceDirAtomic(skill.libraryPath, localPath, differs ? { keepReplaced } : {});
    return keptId;
  });
}

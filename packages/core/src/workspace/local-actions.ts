import { isAbsolute, relative } from "node:path";
import type { LocalSkill, Skill, SkillDocument } from "@loadout/shared";
import type { CoreContext } from "../context";
import type { DeployService } from "../deploy";
import { writeTarget } from "../deploy";
import { samePath } from "../deploy/evidence";
import { invalid, notFound } from "../errors";
import type { InstallIntoLibrary } from "../install/library";
import { readSkillDocument } from "../skills/metadata";
import type { SkillStore } from "../skills/store";
import {
  isDirectory,
  isSkillDir,
  lstatOrNull,
  replaceDirAtomic,
  resolveInside,
  toPosix,
} from "../util/fs";
import { firstFreeName } from "../util/names";
import {
  type LibraryIndex,
  type LocalEntry,
  type MatchMode,
  classifySync,
  describeLocalSkill,
  matchLibrarySkill,
} from "./local-scan";

/** What the global and the project workspaces both need to move content in and out of the library. */
export interface LocalSyncDeps {
  store: SkillStore;
  deploy: Pick<DeployService, "refreshCopies">;
  install: { installIntoLibrary: InstallIntoLibrary };
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
    syncStatus: classifySync(entry, match),
  };
}

/** The skill folder at a caller-supplied relative path, which may not leave `root`. */
export function requireLocalSkill(root: string, relativePath: string): LocalEntry {
  const path = resolveInside(root, relativePath);
  if (!isSkillDir(path)) throw notFound(`No skill found at ${relativePath}`);
  return describeLocalSkill({ path, relativePath: toPosix(relative(root, path)) });
}

/**
 * The document of a local skill. A linked document must stay inside the skills root, or inside
 * the skill's own real folder when the whole skill is a link (a deployed library skill).
 */
export function readLocalDocument(root: string, relativePath: string): SkillDocument {
  const entry = requireLocalSkill(root, relativePath);
  const found = readSkillDocument(entry.path, root) ?? readSkillDocument(entry.path);
  return {
    filename: found?.filename ?? "",
    content: found?.content ?? "",
    files: entry.files,
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
  const { store, deploy, install } = deps;
  if (!match) {
    const name = firstFreeName(entry.name, (candidate) => store.findByName(candidate).length === 0);
    return install.installIntoLibrary({
      sourceDir: entry.path,
      name,
      activityKind: "import",
      record: { sourceType: "local", sourceRef: entry.path, updateStatus: "local_only" },
    });
  }
  const updated = await install.installIntoLibrary({
    sourceDir: entry.path,
    name: match.name,
    activityKind: "import",
    record: {
      sourceType: match.sourceType,
      sourceRef: match.sourceRef,
      sourceUrl: match.sourceUrl,
      sourceSubpath: match.sourceSubpath,
      sourceBranch: match.sourceBranch,
      sourceRevision: match.sourceRevision,
      remoteRevision: match.remoteRevision,
      updateStatus: "local_only",
      replaceSkillId: match.id,
    },
  });
  // Copies deployed elsewhere were made from the old content.
  const report = await deploy.refreshCopies(updated);
  for (const conflict of report.conflicts) {
    ctx.log.warn(`Did not refresh ${conflict.path}: it ${conflict.reason}`);
  }
  return updated;
}

/**
 * Replace a local skill folder with the library version. Only call this when the user asked for
 * it. A link is re-made, never written through, so the library cannot be copied onto itself.
 */
export async function replaceLocalFromLibrary(
  ctx: CoreContext,
  skill: Skill,
  localPath: string,
): Promise<void> {
  await ctx.lock.run(`restore ${skill.name}`, async () => {
    if (!isDirectory(skill.libraryPath)) {
      throw notFound(`The skill folder is missing: ${skill.libraryPath}`);
    }
    const stat = lstatOrNull(localPath);
    if (stat?.isSymbolicLink()) {
      await writeTarget(skill.libraryPath, localPath, "symlink", { kind: "user_confirmed" });
      return;
    }
    if (stat && !stat.isDirectory()) throw invalid(`Not a skill folder: ${localPath}`);
    await replaceDirAtomic(skill.libraryPath, localPath);
  });
}

/**
 * A skill whose recorded source is a folder that is about to be replaced (or removed) would lose
 * its source, or end up pointing at a link to itself. Its library copy becomes the source.
 */
export function repointSources(store: SkillStore, localPath: string): void {
  for (const skill of store.list()) {
    const ref = skill.sourceRef;
    if (!ref || !isAbsolute(ref) || !samePath(ref, localPath)) continue;
    store.update(skill.id, { sourceRef: skill.libraryPath });
  }
}

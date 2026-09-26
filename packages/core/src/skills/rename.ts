import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import type { RenameOptions, RenameResult, Skill } from "@loadout/shared";
import type { CoreContext } from "../context";
import type { DeployService } from "../deploy";
import { linkPointsAt, removeTarget, writeTarget } from "../deploy/engine";
import { samePath } from "../deploy/evidence";
import { exists, invalid, targetConflict } from "../errors";
import { lstatOrNull, readDirSafe } from "../util/fs";
import { hashDir } from "../util/hash";
import { checkSkillName } from "./create";
import { readSkillDocument, setFrontmatterName } from "./metadata";
import type { SkillStore } from "./store";

export interface RenameDeps {
  store: SkillStore;
  deploy: DeployService;
  /** Every skills folder of every project, where links to the library may live. */
  projectSkillFolders: () => string[];
}

/** Links and same-named real folders inside projects, found before anything moves. */
interface ProjectEntries {
  links: string[];
  copies: string[];
}

function projectEntries(folders: readonly string[], skill: Skill): ProjectEntries {
  const found: ProjectEntries = { links: [], copies: [] };
  const oldName = skill.dirName.toLowerCase();
  for (const folder of new Set(folders)) {
    for (const entry of readDirSafe(folder)) {
      const path = join(folder, entry.name);
      if (entry.isSymbolicLink()) {
        if (linkPointsAt(path, skill.libraryPath)) found.links.push(path);
      } else if (entry.isDirectory() && entry.name.toLowerCase() === oldName) {
        found.copies.push(path);
      }
    }
  }
  return found;
}

/** Another skill or any folder in the library already uses the name (case aside). */
function nameTaken(store: SkillStore, skill: Skill, name: string): boolean {
  const wanted = name.toLowerCase();
  const others = store
    .list()
    .flatMap((other) =>
      other.id === skill.id ? [] : [other.name.toLowerCase(), other.dirName.toLowerCase()],
    );
  const folders = readDirSafe(dirname(skill.libraryPath))
    .map((entry) => entry.name)
    .filter((entry) => entry !== skill.dirName)
    .map((entry) => entry.toLowerCase());
  return others.includes(wanted) || folders.includes(wanted);
}

/**
 * Move the folder and record it in one synchronous step, so a watcher rebuild in between never
 * sees a skill whose folder vanished. A change of case alone goes through a temporary name,
 * which case-insensitive file systems need.
 */
function moveFolder(store: SkillStore, skill: Skill, to: string, name: string): void {
  if (skill.libraryPath === to) {
    store.update(skill.id, { name });
    return;
  }
  if (skill.dirName.toLowerCase() === name.toLowerCase()) {
    const step = join(dirname(to), `.${name}.renaming`);
    renameSync(skill.libraryPath, step);
    renameSync(step, to);
  } else {
    renameSync(skill.libraryPath, to);
  }
  store.update(skill.id, { name, libraryPath: to });
}

/** Set the new name in the document, and record the change like an editor save does. */
function rewriteDocument(store: SkillStore, skill: Skill, name: string): void {
  const found = readSkillDocument(skill.libraryPath);
  const edited = [...skill.editedFiles];
  if (found) {
    const path = join(skill.libraryPath, found.filename);
    const content = readFileSync(path, "utf8");
    const next = setFrontmatterName(content, name);
    if (next !== content) {
      writeFileSync(path, next);
      if (!edited.includes(found.filename)) edited.push(found.filename);
    }
  }
  store.update(skill.id, { contentHash: hashDir(skill.libraryPath), editedFiles: edited });
}

/** Re-point project links at the renamed folder, under the new name when that is free. */
async function relinkProjects(
  links: readonly string[],
  to: string,
  name: string,
): Promise<string[]> {
  const moved: string[] = [];
  for (const link of links) {
    const renamedLink = join(dirname(link), name);
    const destination = lstatOrNull(renamedLink) ? link : renamedLink;
    if (!removeTarget(link, "symlink")) continue;
    await writeTarget(to, destination, "symlink", { kind: "no_clobber" });
    moved.push(destination);
  }
  return moved;
}

/** Rename a library skill everywhere it is known; see `SkillsApi.rename`. */
export async function renameSkill(
  ctx: CoreContext,
  deps: RenameDeps,
  skillId: string,
  requestedName: string,
  options: RenameOptions = {},
): Promise<RenameResult> {
  const { store, deploy } = deps;
  const name = requestedName.trim();
  checkSkillName(name);

  return ctx.lock.run(`rename ${store.get(skillId).name}`, async () => {
    const skill = store.get(skillId);
    const from = skill.name;
    if (nameTaken(store, skill, name)) {
      throw exists(`The library already has a skill or folder named ${name}.`);
    }
    const to = join(dirname(skill.libraryPath), name);
    const renamed: Skill = { ...skill, name, dirName: name, libraryPath: to };
    const check = deploy.checkRename(skill, renamed);
    if (check.conflicts.length > 0) throw targetConflict(check.conflicts);
    const [edited] = check.editedCopies;
    if (edited) {
      throw invalid(
        `The copy at ${edited.targetPath} was changed in the agent's folder. Upload those changes to the library or discard them, then rename.`,
      );
    }
    const agents = skill.deployments.map((deployment) => deployment.agentKey);
    const entries = projectEntries(deps.projectSkillFolders(), skill);
    const result: RenameResult = {
      dryRun: Boolean(options.dryRun),
      from,
      to: name,
      skill,
      agents,
      projectLinks: entries.links,
      projectCopies: entries.copies,
      failed: [],
    };
    if (options.dryRun || (from === name && skill.dirName === name)) return result;

    // Nothing may point at the old folder while it moves: take the deployments down first.
    await deploy.removeAllForSkill(skill);
    try {
      moveFolder(store, skill, to, name);
    } catch (error) {
      await deploy.redeploy(skill, agents);
      throw error;
    }
    const moved = store.get(skill.id);
    rewriteDocument(store, moved, name);
    if (
      moved.sourceRef &&
      isAbsolute(moved.sourceRef) &&
      samePath(moved.sourceRef, skill.libraryPath)
    ) {
      store.update(skill.id, { sourceRef: to });
    }

    const current = store.get(skill.id);
    const report = await deploy.redeploy(current, agents);
    result.failed = [
      ...report.failed,
      ...report.conflicts.map((conflict) => ({
        name: basename(conflict.path),
        message: conflict.reason,
      })),
    ];
    result.projectLinks = await relinkProjects(entries.links, to, name);
    result.skill = store.get(skill.id);
    ctx.activity.record("rename", name, `was ${from}`);
    ctx.touched("skills", "projects");
    return result;
  });
}

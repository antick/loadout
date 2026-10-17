import { randomUUID } from "node:crypto";
import { readlinkSync, realpathSync, symlinkSync, renameSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { ProjectDuplicatePlan } from "@loadout/shared";
import type { CoreContext } from "../context";
import { errorMessage, invalid } from "../errors";
import { lstatOrNull, removePathSync } from "../util/fs";
import type { ProjectActionsDeps } from "./actions";
import type { RemovedStore } from "../storage/removed";

import { checkDuplicatePath, digest, duplicateSnapshot } from "./duplicate-files";
import { findVariants, groupKey } from "./scan";
import type { ProjectRecord } from "./store";
import { resolveTargets } from "./targets";

export interface ProjectDuplicateDeps extends ProjectActionsDeps {
  removed: Pick<RemovedStore, "setAside" | "keepCopy" | "contentPath" | "putBack">;
}

const PREFERRED_ROOT = ".agents/skills";
const JOURNAL_PREFIX = "projects.duplicate-resolution.";
const CHANGED = "The skill folders changed. Close this preview and compare them again.";
const UNDO_CHANGED =
  "The shared skill or its folders changed. Your backups are in Recently removed; no changed files were overwritten.";
interface Resolution {
  canonicalPath: string;
  hash: string;
  entries: { path: string; backupId: string }[];
}

const key = (project: ProjectRecord, skill: string) =>
  `${JOURNAL_PREFIX}${project.id}.${digest(groupKey(skill))}`;

function ownsLink(path: string, canonical: string): boolean {
  return (
    lstatOrNull(path)?.isSymbolicLink() === true &&
    resolve(dirname(path), readlinkSync(path)) === canonical
  );
}

export function createProjectDuplicateActions(ctx: CoreContext, deps: ProjectDuplicateDeps) {
  const journal = (project: ProjectRecord, skill: string) =>
    ctx.settings.getRaw<Resolution | null>(key(project, skill), null);

  function preview(project: ProjectRecord, skill: string): ProjectDuplicatePlan {
    const saved = journal(project, skill);
    const plan: ProjectDuplicatePlan = {
      token: "",
      canonicalPath: saved?.canonicalPath ?? null,
      copies: [],
      links: [],
      status: saved ? "resolved" : "none",
      reason: null,
      canUndo: saved !== null,
    };
    if (saved) {
      try {
        checkDuplicatePath(project.path, saved.canonicalPath);
        if (duplicateSnapshot(saved.canonicalPath).hash !== saved.hash) throw invalid(UNDO_CHANGED);
        for (const entry of saved.entries) {
          checkDuplicatePath(project.path, entry.path);
          if (!lstatOrNull(entry.path) || ownsLink(entry.path, saved.canonicalPath)) {
            deps.removed.contentPath(entry.backupId);
          } else if (duplicateSnapshot(entry.path).hash !== saved.hash) throw invalid(UNDO_CHANGED);
        }
        if (!saved.entries.every((entry) => ownsLink(entry.path, saved.canonicalPath))) {
          plan.status = "unsupported";
          plan.reason =
            "A previous resolution was interrupted. Use Undo to restore the original copies.";
        }
      } catch {
        plan.status = "unsupported";
        plan.canUndo = false;
        plan.reason =
          "Undo is unavailable: the shared files changed, copies are disabled, or a backup is missing. Re-enable disabled copies to try again. Any remaining backups are in Recently removed.";
      }
      return plan;
    }
    if (project.type !== "project") {
      return {
        ...plan,
        status: "unsupported",
        reason: "Only copies inside one project can be resolved here.",
      };
    }
    try {
      const variants = findVariants(resolveTargets(project, deps.registry), skill);
      if (variants.some((copy) => !copy.enabled)) {
        throw invalid("Enable all copies of this skill before resolving duplicates.");
      }
      const folders = variants.filter((copy) => !lstatOrNull(copy.path)?.isSymbolicLink());
      const folderPaths = new Set(folders.map((copy) => realpathSync(copy.path)));
      const identities: string[] = [];
      for (const copy of variants) {
        checkDuplicatePath(project.path, copy.path);
        if (lstatOrNull(copy.path)?.isSymbolicLink()) {
          const target = realpathSync(copy.path);
          if (!folderPaths.has(target)) {
            throw invalid(
              `“${copy.path}” links to “${target}”, which is not a separate copy of this skill in this project. Move the skill into a project agent folder or review this link manually, then compare again. Nothing has been changed.`,
            );
          }
          const stat = lstatOrNull(copy.path)!;
          identities.push(
            digest([copy.path, readlinkSync(copy.path), stat.ino, stat.mtimeMs, stat.ctimeMs]),
          );
          plan.links.push({ path: copy.path, targetPath: target });
          continue;
        }
        const snapshot = duplicateSnapshot(copy.path);
        identities.push(snapshot.identity);
        plan.copies.push({
          path: copy.path,
          agentName: copy.target.displayName,
          agentKey: copy.target.key,
          hash: snapshot.hash,
          files: snapshot.files,
        });
      }
      if (folders.length < 2) return plan;
      plan.canonicalPath =
        folders.find((copy) => copy.target.relativeDir === PREFERRED_ROOT)?.path ??
        folders[0]?.path ??
        null;
      plan.status =
        new Set(plan.copies.map((copy) => copy.hash)).size === 1 ? "identical" : "different";
      plan.token = digest([plan.canonicalPath, plan.copies, plan.links, identities]);
      return plan;
    } catch (error) {
      return { ...plan, status: "unsupported", reason: errorMessage(error) };
    }
  }

  /** A journal is written before the first replacement; partial operations can be recovered. */
  function restore(project: ProjectRecord, skill: string, saved: Resolution): void {
    checkDuplicatePath(project.path, saved.canonicalPath);
    if (duplicateSnapshot(saved.canonicalPath).hash !== saved.hash) throw invalid(UNDO_CHANGED);
    // Preflight all entries before touching any. A retry can include copies already restored.
    for (const entry of saved.entries) {
      checkDuplicatePath(project.path, entry.path);
      const stat = lstatOrNull(entry.path);
      if (
        stat &&
        !ownsLink(entry.path, saved.canonicalPath) &&
        (!stat.isDirectory() || duplicateSnapshot(entry.path).hash !== saved.hash)
      )
        throw invalid(UNDO_CHANGED);
      if (!stat || ownsLink(entry.path, saved.canonicalPath)) {
        if (duplicateSnapshot(deps.removed.contentPath(entry.backupId)).hash !== saved.hash)
          throw invalid(UNDO_CHANGED);
      }
    }
    for (const entry of saved.entries) {
      const linked = ownsLink(entry.path, saved.canonicalPath);
      const staged = join(dirname(entry.path), `.loadout-undo-${randomUUID()}`);
      if (linked) renameSync(entry.path, staged);
      try {
        if (!lstatOrNull(entry.path)) deps.removed.putBack(entry.backupId);
      } catch (error) {
        if (linked && !lstatOrNull(entry.path)) renameSync(staged, entry.path);
        throw error;
      }
      if (linked) removePathSync(staged);
      if (duplicateSnapshot(entry.path).hash !== saved.hash) throw invalid(UNDO_CHANGED);
    }
    ctx.settings.deleteRaw(key(project, skill));
    ctx.touched("projects");
  }

  return {
    forget: (project: ProjectRecord, skill: string) => ctx.settings.deleteRaw(key(project, skill)),
    preview: async (project: ProjectRecord, skill: string) => preview(project, skill),
    resolve: async (project: ProjectRecord, skill: string, token: string) => {
      await ctx.lock.run("resolve project duplicates", () => {
        const plan = preview(project, skill);
        if (plan.status !== "identical" || !plan.canonicalPath || plan.token !== token)
          throw invalid(CHANGED);
        const canonical = plan.canonicalPath;
        const hash = duplicateSnapshot(canonical).hash;
        const saved: Resolution = { canonicalPath: canonical, hash, entries: [] };
        // Back up before changing any original. Backups remain accessible in Recently removed.
        for (const copy of plan.copies.filter((candidate) => candidate.path !== canonical)) {
          const backupId = deps.removed.keepCopy(copy.path, {
            place: project.name,
            reason: "replaced",
          });
          if (!backupId || duplicateSnapshot(deps.removed.contentPath(backupId)).hash !== hash)
            throw invalid(CHANGED);
          saved.entries.push({ path: copy.path, backupId });
        }
        if (preview(project, skill).token !== token) throw invalid(CHANGED);
        ctx.settings.setRaw(key(project, skill), saved);
        try {
          for (const entry of saved.entries) {
            checkDuplicatePath(project.path, entry.path);
            if (
              duplicateSnapshot(entry.path).hash !== hash ||
              duplicateSnapshot(canonical).hash !== hash
            )
              throw invalid(CHANGED);
            removePathSync(entry.path);
            // Relative directory links remain portable when the project moves to another machine.
            symlinkSync(relative(dirname(entry.path), canonical), entry.path, "dir");
            if (realpathSync(entry.path) !== realpathSync(canonical))
              throw invalid("Could not verify the shared copy.");
          }
        } catch (error) {
          try {
            restore(project, skill, saved);
          } catch {
            throw invalid(
              `${errorMessage(error)} Recovery is available from Resolve duplicates or Recently removed.`,
            );
          }
          throw invalid(
            `${errorMessage(error)} The previous copies were restored. This filesystem may not support links.`,
          );
        }
      });
      ctx.activity.record("update", skill, `${project.name}: duplicate copies resolved`);
      ctx.touched("projects");
    },
    undo: async (project: ProjectRecord, skill: string) => {
      await ctx.lock.run("undo project duplicate resolution", () => {
        const saved = journal(project, skill);
        if (!saved) throw invalid("There is no duplicate resolution to undo.");
        restore(project, skill, saved);
      });
    },
  };
}

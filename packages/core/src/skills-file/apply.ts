import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  APP_NAME,
  type LockedFolder,
  type SkillsFileEntry,
  SKILLS_FILE_NAME,
  type SkillsFileInfo,
  type SkillsFileResult,
  type SkillsLock,
} from "@loadout/shared";
import type { FoundSkill } from "../install/repo-scan";
import type { RemovedStore } from "../storage/removed";
import { removePath, replaceDirAtomic, statOrNull, writeFileAtomic } from "../util/fs";
import { LOCK_VERSION, writeLock } from "./format";
import { type PreparedPlan, type WantedFolder, actionFor, removalFor } from "./plan";
import { isPlainFolder, lockFolderPath } from "./safety";

const GITIGNORE = ".gitignore";
const BLOCK_START = `# >>> ${APP_NAME}: skills written from ${SKILLS_FILE_NAME}`;
const BLOCK_END = `# <<< ${APP_NAME}`;

/**
 * Rewrite our marked block in `.gitignore`: the folders written, or no block at all when `folders`
 * is empty. Lines outside the block are never touched.
 */
export function updateGitignore(root: string, folders: readonly string[]): void {
  const path = join(root, GITIGNORE);
  const text = statOrNull(path)?.isFile() ? readFileSync(path, "utf8") : "";
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const start = lines.indexOf(BLOCK_START);
  const end = start === -1 ? -1 : lines.indexOf(BLOCK_END, start);
  // A block whose end line was deleted by hand: what belongs to it is unclear, so leave the file.
  if (start !== -1 && end === -1) return;
  const kept = start === -1 ? lines : [...lines.slice(0, start), ...lines.slice(end + 1)];
  while (kept.length > 0 && kept.at(-1) === "") kept.pop();
  const block =
    folders.length > 0 ? [BLOCK_START, ...folders.map((folder) => `/${folder}/`), BLOCK_END] : [];
  const next = [...kept, ...(kept.length > 0 && block.length > 0 ? [""] : []), ...block];
  const content = next.length > 0 ? `${next.join(eol)}${eol}` : "";
  if (content !== text) writeFileAtomic(path, content);
}

export interface ApplyDeps {
  removed: RemovedStore;
}

/**
 * The skills a run would write into the project, new or changed, once each however many agent
 * folders get them: what the safety check has to look at before anything is written.
 */
export function skillsToWrite(info: SkillsFileInfo, prepared: PreparedPlan): FoundSkill[] {
  const oldLock = new Map((info.lock?.folders ?? []).map((entry) => [entry.folder, entry]));
  const byDir = new Map<string, FoundSkill>();
  for (const item of prepared.wanted) {
    if (actionFor(item, oldLock.get(item.folder)) === "same") continue;
    byDir.set(item.skill.dir, item.skill);
  }
  return [...byDir.values()];
}

/**
 * Carry out a prepared plan. `force` replaces or removes folders changed by hand, putting each
 * in Recently removed first; without it they are left exactly as they are and listed as kept.
 */
export async function applyPlan(
  info: SkillsFileInfo,
  prepared: PreparedPlan,
  deps: ApplyDeps,
  force: boolean,
): Promise<SkillsFileResult> {
  const { root, spec } = info;
  const place = basename(root);
  const wantedByFolder = new Map<string, WantedFolder>(
    prepared.wanted.map((item) => [item.folder, item]),
  );
  const oldLock = new Map((info.lock?.folders ?? []).map((entry) => [entry.folder, entry]));
  const folders: LockedFolder[] = [];
  const kept: string[] = [];
  let written = 0;
  let removed = 0;

  const setAside = (path: string, reason: "replaced" | "deleted"): void => {
    deps.removed.setAside(path, { place, reason });
  };

  const keep = (folder: string, locked: LockedFolder | undefined): void => {
    kept.push(folder);
    if (locked) folders.push(locked);
  };
  const entries: SkillsFileEntry[] = [];

  for (const planned of prepared.plan.entries) {
    const item = wantedByFolder.get(planned.folder);
    const locked = oldLock.get(planned.folder);
    // Judged again now that the lock is held: the folder may have changed since the plan.
    const path = item?.path ?? lockFolderPath(prepared.rules, planned.folder);
    if (!path) continue;
    const action = item ? actionFor(item, locked) : locked ? removalFor(path, locked) : null;
    if (!action) continue;
    entries.push({ ...planned, action });
    const handEdited = action === "edited" || action === "keep_edited";
    // A link, a file or a folder holding `.git` is never replaced or removed, forced or not.
    if (handEdited && (!force || !isPlainFolder(path))) {
      keep(planned.folder, locked);
      continue;
    }
    if (item) {
      if (action !== "same") {
        if (action === "edited") setAside(path, "replaced");
        await replaceDirAtomic(item.skill.dir, path);
        written += 1;
      }
      folders.push({
        folder: item.folder,
        url: item.url,
        skillPath: item.skill.relPath,
        hash: item.hash,
      });
      continue;
    }
    setAside(path, "deleted");
    await removePath(path);
    removed += 1;
  }

  // Folders the lock knew that this run did not look at stay known (a run without prune).
  const seen = new Set(prepared.plan.entries.map((entry) => entry.folder));
  for (const entry of info.lock?.folders ?? []) {
    if (!seen.has(entry.folder)) folders.push(entry);
  }
  const sources = prepared.plan.sources.map(({ url, ref, revision }) => ({ url, ref, revision }));
  const lock: SkillsLock = {
    version: LOCK_VERSION,
    // Pins of sources this run did not fetch (unapply fetches none) are kept.
    sources: [
      ...sources,
      ...(info.lock?.sources ?? []).filter(
        (old) => !sources.some((now) => now.url === old.url && now.ref === old.ref),
      ),
    ].filter((source) => spec.sources.some((s) => s.url === source.url && s.ref === source.ref)),
    folders,
  };
  writeLock(info.lockPath, lock);
  if (spec.gitignore || info.lock) {
    updateGitignore(root, spec.gitignore ? folders.map((entry) => entry.folder) : []);
  }
  return { plan: { ...prepared.plan, entries }, written, removed, kept };
}

import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  APP_NAME,
  type LockedFolder,
  SKILLS_FILE_NAME,
  type SkillsFileInfo,
  type SkillsFileResult,
  type SkillsLock,
} from "@loadout/shared";
import type { RemovedStore } from "../storage/removed";
import { removePath, replaceDirAtomic, statOrNull, writeFileAtomic } from "../util/fs";
import { LOCK_VERSION, writeLock } from "./format";
import { type PreparedPlan, type WantedFolder, safeLockFolder } from "./plan";

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
  const kept =
    start === -1 || end === -1 ? lines : [...lines.slice(0, start), ...lines.slice(end + 1)];
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

  for (const entry of prepared.plan.entries) {
    const item = wantedByFolder.get(entry.folder);
    const locked = oldLock.get(entry.folder);
    const record = (from: WantedFolder): void => {
      folders.push({
        folder: from.folder,
        url: from.url,
        skillPath: from.skill.relPath,
        hash: from.hash,
      });
    };
    if (item && (entry.action === "same" || entry.action === "add" || entry.action === "update")) {
      if (entry.action !== "same") {
        await replaceDirAtomic(item.skill.dir, item.path);
        written += 1;
      }
      record(item);
      continue;
    }
    if (item && entry.action === "edited") {
      if (!force) {
        kept.push(entry.folder);
        if (locked) folders.push(locked);
        continue;
      }
      setAside(item.path, "replaced");
      await replaceDirAtomic(item.skill.dir, item.path);
      written += 1;
      record(item);
      continue;
    }
    // A folder the file no longer asks for.
    const path = safeLockFolder(root, entry.folder);
    if (!path) continue;
    if (entry.action === "keep_edited" && !force) {
      kept.push(entry.folder);
      if (locked) folders.push(locked);
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
  return { plan: prepared.plan, written, removed, kept };
}

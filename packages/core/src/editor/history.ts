import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SkillFileVersion } from "@loadout/shared";
import { invalid, notFound } from "../errors";
import { readDirSafe, removePathSync, statOrNull, writeFileAtomic } from "../util/fs";
import { decodeText } from "./text-file";

/**
 * Earlier versions of files the editor overwrote, one folder per skill and file under the
 * library's `history/` folder. They stay on this computer: they are a safety net for the editor,
 * not part of the backup.
 */

/** Versions kept per file; the oldest go first. */
export const VERSIONS_KEPT = 20;
const VERSION_SUFFIX = ".bak";
/** `<savedAt>` or `<savedAt>-<n>` when two saves land in the same millisecond. */
const VERSION_ID_PATTERN = /^(\d+)(?:-(\d+))?$/;

export interface FileHistory {
  /** Keep `bytes` as the version that is about to be overwritten. */
  record(skillId: string, path: string, bytes: Uint8Array, now?: number): void;
  list(skillId: string, path: string): SkillFileVersion[];
  /** The version's text, ready for the editor. */
  read(skillId: string, path: string, versionId: string): string;
  /** Forget every version of a skill, when the skill itself goes. */
  removeSkill(skillId: string): void;
}

function savedAtOf(versionId: string): number | null {
  const match = VERSION_ID_PATTERN.exec(versionId);
  return match ? Number(match[1]) : null;
}

/** Newest first; same-millisecond saves by their counter. */
function compareVersions(a: string, b: string): number {
  const [, aTime = "0", aCount = "0"] = VERSION_ID_PATTERN.exec(a) ?? [];
  const [, bTime = "0", bCount = "0"] = VERSION_ID_PATTERN.exec(b) ?? [];
  return Number(bTime) - Number(aTime) || Number(bCount) - Number(aCount);
}

export function createFileHistory(historyDir: string): FileHistory {
  // One flat folder name per file: the relative path cannot escape or collide once encoded.
  const skillDir = (skillId: string): string => join(historyDir, encodeURIComponent(skillId));
  const fileDir = (skillId: string, path: string): string =>
    join(skillDir(skillId), encodeURIComponent(path));

  function versionIds(dir: string): string[] {
    return readDirSafe(dir)
      .filter((entry) => entry.isFile() && entry.name.endsWith(VERSION_SUFFIX))
      .map((entry) => entry.name.slice(0, -VERSION_SUFFIX.length))
      .filter((id) => VERSION_ID_PATTERN.test(id))
      .sort(compareVersions);
  }

  return {
    record: (skillId, path, bytes, now = Date.now()) => {
      const dir = fileDir(skillId, path);
      const taken = new Set(versionIds(dir));
      let id = String(now);
      for (let count = 1; taken.has(id); count += 1) id = `${now}-${count}`;
      writeFileAtomic(join(dir, `${id}${VERSION_SUFFIX}`), bytes);
      for (const stale of [id, ...taken].sort(compareVersions).slice(VERSIONS_KEPT)) {
        removePathSync(join(dir, `${stale}${VERSION_SUFFIX}`));
      }
    },

    list: (skillId, path) => {
      const dir = fileDir(skillId, path);
      return versionIds(dir).flatMap((id) => {
        const stat = statOrNull(join(dir, `${id}${VERSION_SUFFIX}`));
        const savedAt = savedAtOf(id);
        return stat && savedAt !== null ? [{ id, savedAt, size: stat.size }] : [];
      });
    },

    read: (skillId, path, versionId) => {
      if (!VERSION_ID_PATTERN.test(versionId)) throw invalid(`Invalid version: ${versionId}`);
      let bytes: Buffer;
      try {
        bytes = readFileSync(join(fileDir(skillId, path), `${versionId}${VERSION_SUFFIX}`));
      } catch {
        throw notFound("That earlier version is no longer kept");
      }
      const decoded = decodeText(bytes);
      if (!decoded) throw invalid("That earlier version is not a text file");
      return decoded.content;
    },

    removeSkill: (skillId) => removePathSync(skillDir(skillId)),
  };
}

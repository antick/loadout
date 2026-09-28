import { ITEMS_DIR_NAME, parseItemPath } from "@loadout/shared";
import { AppError } from "../errors";
import type { PortablePreset, PortableSkill } from "../skills/portable";
import {
  type BackupEnv,
  PRESET_METADATA_SUBDIR,
  SKILL_METADATA_SUBDIR,
  isSafeSkillPath,
} from "./env";
import type { PresetVersion, SkillSide } from "./merge-plan";

/** Reads what the library looked like in one commit, straight from git objects. */

const JSON_SUFFIX = ".json";
const SAFE_ID = /^[\w-]+$/;
const BATCH_HEADER = /^[0-9a-f]+ (\w+) (\d+)$/;
const NEWLINE = 0x0a;

export interface CommitSnapshot {
  commit: string;
  skills: Map<string, SkillSide>;
  presets: Map<string, PresetVersion>;
  /** Top-level entries of the commit: name → git object id. */
  entries: Map<string, string>;
  /**
   * Item files (subagents, commands, rules): path → git object id. Merged one file at a time,
   * so an item changed here and another changed elsewhere both survive.
   */
  items: Map<string, string>;
  /** Skill ids whose metadata file exists but cannot be trusted (broken, misnamed, unsafe path). */
  unreadable: Set<string>;
}

/**
 * A top-level name from another device's commit that is safe to write as a child of the repo:
 * not `.`/`..`, not git's own folder in any letter case (Windows also ignores trailing dots and
 * spaces, so `.git.` is `.git`), and no separators.
 */
export function isPlainEntryName(name: string): boolean {
  const normalized = name.toLowerCase().replace(/[. ]+$/, "");
  return normalized !== "" && normalized !== ".git" && !/[\\/\0]/.test(name);
}

/** Every well-formed item file of a commit; anything else in the items folder is left out. */
async function itemEntries(env: BackupEnv, commit: string): Promise<Map<string, string>> {
  const output = (await env.git.run(["ls-tree", "-r", "-z", commit, "--", `${ITEMS_DIR_NAME}/`]))
    .stdout;
  const items = new Map<string, string>();
  for (const record of output.split("\0")) {
    const tab = record.indexOf("\t");
    if (tab === -1) continue;
    const [, type, hash] = record.slice(0, tab).split(" ");
    const path = record.slice(tab + 1);
    if (type === "blob" && hash && parseItemPath(path)) items.set(path, hash);
  }
  return items;
}

async function topLevelEntries(env: BackupEnv, commit: string): Promise<Map<string, string>> {
  const output = (await env.git.run(["ls-tree", "-z", commit])).stdout;
  const entries = new Map<string, string>();
  for (const record of output.split("\0")) {
    const tab = record.indexOf("\t");
    if (tab === -1) continue;
    const hash = record.slice(0, tab).split(" ")[2];
    const name = record.slice(tab + 1);
    if (hash && isPlainEntryName(name)) entries.set(name, hash);
  }
  return entries;
}

/** Read many files of one commit in a single git call. Missing files are left out. */
async function readFiles(
  env: BackupEnv,
  commit: string,
  paths: string[],
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  if (paths.length === 0) return files;
  const input = paths.map((path) => `${commit}:${path}\n`).join("");
  const result = await env.git.run(["cat-file", "--batch"], { input });
  const bytes = Buffer.from(result.stdout, "utf8");
  let offset = 0;
  for (const path of paths) {
    const lineEnd = bytes.indexOf(NEWLINE, offset);
    if (lineEnd === -1) break;
    const header = bytes.subarray(offset, lineEnd).toString("utf8");
    offset = lineEnd + 1;
    if (header.endsWith(" missing")) continue;
    const match = BATCH_HEADER.exec(header);
    if (!match?.[2]) {
      // Guessing past a garbled answer could make a skill look deleted. Stop instead.
      throw new AppError("GIT", "The backup history could not be read, so nothing was merged.", {
        detail: header,
      });
    }
    const size = Number(match[2]);
    files.set(path, bytes.subarray(offset, offset + size).toString("utf8"));
    offset += size + 1;
  }
  return files;
}

function parseJson<T>(text: string): T | null {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null ? (value as T) : null;
  } catch {
    return null;
  }
}

export async function readCommit(env: BackupEnv, commit: string): Promise<CommitSnapshot> {
  const [entries, items] = await Promise.all([
    topLevelEntries(env, commit),
    itemEntries(env, commit),
  ]);
  const listing = await env.git.run([
    "ls-tree",
    "-r",
    "-z",
    "--name-only",
    commit,
    "--",
    `${env.metadataName}/`,
  ]);
  const metadataFiles = listing.stdout.split("\0").filter((path) => path.endsWith(JSON_SUFFIX));
  const contents = await readFiles(env, commit, metadataFiles);

  const skills = new Map<string, SkillSide>();
  const presets = new Map<string, PresetVersion>();
  const unreadable = new Set<string>();
  const skillPrefix = `${env.metadataName}/${SKILL_METADATA_SUBDIR}/`;
  const presetPrefix = `${env.metadataName}/${PRESET_METADATA_SUBDIR}/`;
  for (const [path, raw] of contents) {
    const prefix = [skillPrefix, presetPrefix].find((candidate) => path.startsWith(candidate));
    if (!prefix) continue;
    const id = path.slice(prefix.length, -JSON_SUFFIX.length);
    if (!SAFE_ID.test(id)) continue;
    if (prefix === skillPrefix) {
      const meta = parseJson<PortableSkill>(raw);
      const usable =
        meta !== null &&
        meta.id === id &&
        isSafeSkillPath(meta.path) &&
        Array.isArray(meta.tags) &&
        typeof meta.source === "object" &&
        meta.source !== null;
      // Reported separately from "not there": a broken file must never read as a deleted skill.
      if (!usable) unreadable.add(id);
      else skills.set(id, { path: meta.path, treeHash: entries.get(meta.path) ?? null, meta });
    } else {
      const preset = parseJson<PortablePreset>(raw);
      if (!preset || preset.id !== id) continue;
      presets.set(id, { raw, updatedAt: Number(preset.updatedAt) || 0 });
    }
  }
  return { commit, skills, presets, entries, items, unreadable };
}

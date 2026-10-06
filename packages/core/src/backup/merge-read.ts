import { isRecord } from "@loadout/shared";
import { AppError } from "../errors";
import type { PortablePreset, PortableSkill } from "../skills/portable";
import { GIT_DIR } from "../util/fs";
import { batchInput, parseBatch } from "../util/git-batch";
import { type BackupEnv, PRESET_METADATA_SUBDIR, SKILL_METADATA_SUBDIR } from "./env";
import type { PresetVersion, SkillSide } from "./merge-plan";
import { isSkillFolderName } from "../util/safe-path";

/** Reads what the library looked like in one commit, straight from git objects. */

const JSON_SUFFIX = ".json";
const SAFE_ID = /^[\w-]+$/;

export interface CommitSnapshot {
  commit: string;
  skills: Map<string, SkillSide>;
  presets: Map<string, PresetVersion>;
  /** Top-level entries of the commit: name → git object id. */
  entries: Map<string, string>;
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
  return normalized !== "" && normalized !== GIT_DIR && !/[\\/\0]/.test(name);
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
  const input = batchInput(paths.map((path) => `${commit}:${path}`));
  // Read as bytes: a file that is not valid UTF-8 (decoded and encoded back, it would grow)
  // must not shift every offset after it.
  const result = await env.git.run(["cat-file", "--batch"], { input, encoding: "buffer" });
  const contents = parseBatch(
    result.stdoutBytes ?? Buffer.alloc(0),
    paths.length,
    // Guessing past a garbled answer could make a skill look deleted. Stop instead.
    (header) =>
      new AppError("GIT", "The backup history could not be read, so nothing was merged.", {
        detail: header,
      }),
  );
  paths.forEach((path, index) => {
    const content = contents[index];
    if (content) files.set(path, content.toString("utf8"));
  });
  return files;
}

function parseJson<T>(text: string): T | null {
  try {
    const value: unknown = JSON.parse(text);
    return isRecord(value) ? (value as T) : null;
  } catch {
    return null;
  }
}

/** A skill's metadata as read from git; null unless it is whole and belongs to `id`. */
function usableSkillMeta(raw: string, id: string): PortableSkill | null {
  const meta = parseJson<PortableSkill>(raw);
  const usable =
    meta !== null &&
    meta.id === id &&
    isSkillFolderName(meta.path) &&
    Array.isArray(meta.tags) &&
    typeof meta.source === "object" &&
    meta.source !== null;
  return usable ? meta : null;
}

/** One skill's metadata in `commit`; null when it is not there or not usable. */
export async function skillMetadataAt(
  env: BackupEnv,
  commit: string,
  id: string,
): Promise<PortableSkill | null> {
  const file = `${env.metadataName}/${SKILL_METADATA_SUBDIR}/${id}${JSON_SUFFIX}`;
  const result = await env.git.probe(["show", `${commit}:${file}`]);
  return result.code === 0 ? usableSkillMeta(result.stdout, id) : null;
}

export async function readCommit(env: BackupEnv, commit: string): Promise<CommitSnapshot> {
  const entries = await topLevelEntries(env, commit);
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
      const meta = usableSkillMeta(raw, id);
      // Reported separately from "not there": a broken file must never read as a deleted skill.
      if (!meta) unreadable.add(id);
      else skills.set(id, { path: meta.path, treeHash: entries.get(meta.path) ?? null, meta });
    } else {
      const preset = parseJson<PortablePreset>(raw);
      if (!preset || preset.id !== id) continue;
      presets.set(id, { raw, updatedAt: Number(preset.updatedAt) || 0 });
    }
  }
  return { commit, skills, presets, entries, unreadable };
}

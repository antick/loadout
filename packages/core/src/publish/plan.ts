import { basename, join } from "node:path";
import {
  PUBLISH_LAYERS,
  PUBLISH_LAYER_DIRS,
  PUBLISH_LEFT_OUT_SHOWN,
  PUBLISH_MAX_FILE_BYTES,
  type PublishFileCounts,
  type PublishSkillPlan,
  type PublishSkip,
  type SecretFinding,
  SKILL_FILE,
  type Skill,
  publishSkipText,
} from "@loadout/shared";

import { isDirectory } from "../util/fs";
import { type PublishFile, collectFiles, digestsInTree, digestsOf, findSecretsIn } from "./files";
import type { ResolvedTarget } from "./target";
import { isSkillFolderName } from "../util/safe-path";

/** What publishing would do to a repository, worked out without changing anything. */

const NO_FILES: PublishFileCounts = { added: 0, changed: 0, removed: 0 };

export interface PlannedSkill {
  plan: PublishSkillPlan;
  /** What gets copied; empty for a skipped skill. */
  files: PublishFile[];
}

export interface Planned {
  skills: PlannedSkill[];
  secrets: SecretFinding[];
}

function compare(
  ours: ReadonlyMap<string, string>,
  theirs: ReadonlyMap<string, string>,
): PublishFileCounts {
  let added = 0;
  let changed = 0;
  for (const [path, digest] of ours) {
    const there = theirs.get(path);
    if (there === undefined) added += 1;
    else if (there !== digest) changed += 1;
  }
  const removed = [...theirs.keys()].filter((path) => !ours.has(path)).length;
  return { added, changed, removed };
}

/** The layer folder of the repository that already holds a skill of this name, other than ours. */
function publishedElsewhere(
  checkoutDir: string,
  target: ResolvedTarget,
  folder: string,
): string | null {
  for (const layer of PUBLISH_LAYERS) {
    const dir = PUBLISH_LAYER_DIRS[layer];
    if (dir === target.layerDir) continue;
    if (isDirectory(join(checkoutDir, ...dir.split("/"), folder))) return dir;
  }
  return null;
}

function skipped(
  skill: Skill,
  folder: string,
  skip: PublishSkip,
  leftOut: string[] = [],
): PlannedSkill {
  return {
    files: [],
    plan: {
      skillId: skill.id,
      name: skill.name,
      folder,
      status: "skipped",
      reason: publishSkipText(skip),
      skip,
      files: NO_FILES,
      leftOut: leftOut.slice(0, PUBLISH_LEFT_OUT_SHOWN),
      leftOutCount: leftOut.length,
    },
  };
}

function planSkill(skill: Skill, checkoutDir: string, target: ResolvedTarget): PlannedSkill {
  const name = basename(skill.libraryPath);
  const folder = `${target.layerDir}/${name}`;
  if (!isSkillFolderName(name)) {
    return skipped(skill, folder, { code: "folder_name" });
  }
  if (!isDirectory(skill.libraryPath)) return skipped(skill, folder, { code: "folder_missing" });
  const collected = collectFiles(skill.libraryPath);
  const { files, leftOut } = collected;
  if (!files.some((file) => file.relativePath === SKILL_FILE)) {
    return skipped(skill, folder, { code: "no_skill_file" }, leftOut);
  }
  if (collected.tooLarge) {
    return skipped(
      skill,
      folder,
      { code: "file_too_large", file: collected.tooLarge, limitBytes: PUBLISH_MAX_FILE_BYTES },
      leftOut,
    );
  }
  const elsewhere = publishedElsewhere(checkoutDir, target, name);
  if (elsewhere) {
    return skipped(skill, folder, { code: "published_elsewhere", folder: elsewhere }, leftOut);
  }

  const there = digestsInTree(join(checkoutDir, ...folder.split("/")));
  const counts = compare(digestsOf(files), there);
  const isNew = there.size === 0;
  const same = !isNew && counts.added + counts.changed + counts.removed === 0;
  return {
    files,
    plan: {
      skillId: skill.id,
      name: skill.name,
      folder,
      status: isNew ? "new" : same ? "unchanged" : "changed",
      reason: null,
      skip: null,
      files: isNew || same ? NO_FILES : counts,
      leftOut: leftOut.slice(0, PUBLISH_LEFT_OUT_SHOWN),
      leftOutCount: leftOut.length,
    },
  };
}

/** Compare the skills with the repository's working copy and look for keys in what would go. */
export function planSkills(
  skills: readonly Skill[],
  checkoutDir: string,
  target: ResolvedTarget,
): Planned {
  const planned = skills.map((skill) => planSkill(skill, checkoutDir, target));
  const secrets = planned.flatMap(({ plan, files }) =>
    plan.status === "skipped" ? [] : findSecretsIn(files, plan.folder),
  );
  return { skills: planned, secrets };
}

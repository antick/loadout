import type { SecretFinding } from "./secrets";

/**
 * Publishing: copy chosen library skills into another Git repository, laid out so
 * `npx skills add <repository>` (and Loadout) can install them. It never changes the library.
 * Only skill folders are copied: no tags, no deployments, no backup metadata.
 */

/**
 * Where in the repository the skills go. `root`: `skills/<name>/`. `curated` and `experimental`:
 * `skills/.curated/<name>/` and `skills/.experimental/<name>/`, the folders `npx skills` also reads.
 */
export const PUBLISH_LAYERS = ["root", "curated", "experimental"] as const;
export type PublishLayer = (typeof PUBLISH_LAYERS)[number];
export const DEFAULT_PUBLISH_LAYER: PublishLayer = "root";

/** Folder of the repository that holds the skills of a layer, `/` separated. */
export const PUBLISH_LAYER_DIRS: Record<PublishLayer, string> = {
  root: "skills",
  curated: "skills/.curated",
  experimental: "skills/.experimental",
};

/** A single file over this size is not a skill's text; Git hosts refuse files over 100 MB. */
export const PUBLISH_MAX_FILE_BYTES = 50 * 1024 * 1024;
/** Names of entries left out of a skill's copy, shown at most this many per skill. */
export const PUBLISH_LEFT_OUT_SHOWN = 5;

/** Where to publish; also what the last successful publish is remembered as. */
export interface PublishTarget {
  /** Address of the repository, credentials removed: `https://…`, `git@host:…`, `owner/repo`. */
  repo: string;
  /** Null: the repository's own default branch. */
  branch: string | null;
  layer: PublishLayer;
}

export interface PublishInput {
  skillIds: string[];
  repo: string;
  branch?: string | null;
  layer?: PublishLayer;
  /** Publish although a file looks like it holds a key or token. */
  allowSecrets?: boolean;
}

/**
 * `new`: not in the repository yet. `changed`: differs from what is there. `unchanged`: same files.
 * `skipped`: left out, with `reason`.
 */
export type PublishStatus = "new" | "changed" | "unchanged" | "skipped";

export interface PublishFileCounts {
  added: number;
  changed: number;
  removed: number;
}

export interface PublishSkillPlan {
  skillId: string;
  name: string;
  /** Path of the skill's folder in the repository, `/` separated. */
  folder: string;
  status: PublishStatus;
  /** Why a skill is skipped. */
  reason: string | null;
  /** Compared with the repository's copy; all zero for `new` and `unchanged`. */
  files: PublishFileCounts;
  /** Entries not copied (dependencies, `.env`, logs, links), at most {@link PUBLISH_LEFT_OUT_SHOWN}. */
  leftOut: string[];
  leftOutCount: number;
}

export interface PublishPlan {
  target: PublishTarget & { branch: string };
  /** The repository has no commits yet. */
  repoEmpty: boolean;
  /** The branch does not exist in the repository yet; it is created from its default branch. */
  newBranch: boolean;
  skills: PublishSkillPlan[];
  /** Matches in the files to be published; publishing stops on these unless allowed. */
  secrets: SecretFinding[];
}

export interface PublishResult {
  plan: PublishPlan;
  /** The commit pushed; null when nothing differed from the repository. */
  commit: string | null;
  published: string[];
  unchanged: string[];
  /** Ready to run: how someone installs these skills from the repository. */
  installCommands: string[];
}

export interface PublishApi {
  /** The target of the last successful publish, to fill the form with. */
  defaults(): Promise<PublishTarget | null>;
  /** Look at the repository and say what publishing would do. Changes nothing anywhere. */
  preview(input: PublishInput): Promise<PublishPlan>;
  /** Copy the skills into the repository, commit and push. Never forces. */
  publish(input: PublishInput): Promise<PublishResult>;
}

/** `npx skills add` command for one skill, or for the whole repository when `skill` is null. */
export function installCommand(repo: string, skill: string | null): string {
  const base = `npx skills add ${repo}`;
  return skill ? `${base} --skill ${skill}` : base;
}

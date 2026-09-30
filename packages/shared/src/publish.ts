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

// ── ClawHub ──

/** Where a ClawHub API token is made. */
export const CLAWHUB_TOKEN_URL = "https://clawhub.ai/settings";
/** ClawHub's own limits on what a version may hold. */
export const CLAWHUB_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const CLAWHUB_MAX_TOTAL_BYTES = 50 * 1024 * 1024;
export const CLAWHUB_MAX_TOPICS = 5;
export const CLAWHUB_MAX_TOPIC_LENGTH = 48;
/** Every version published on ClawHub is released under this licence; the registry insists. */
export const CLAWHUB_LICENSE = "MIT-0";
export const CLAWHUB_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CLAWHUB_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/** A slug ClawHub accepts from any name: lower case, letters and digits, dashes between. */
export function clawhubSlugOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** `1.2.3` → `1.2.4`; anything else → `1.0.0`. */
export function nextPatchVersion(version: string | null): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version ?? "");
  if (!match) return "1.0.0";
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

/** Whether a token is saved, and who ClawHub says it belongs to. */
export interface ClawhubAccount {
  /** The system keychain can hold a token here. */
  available: boolean;
  saved: boolean;
  /** The handle the saved token signs in as; null when none is saved or it no longer works. */
  handle: string | null;
  /** Why the saved token does not work, for people. */
  problem: string | null;
}

export interface ClawhubPublishFile {
  /** `/` separated, relative to the skill. */
  path: string;
  bytes: number;
}

/** What publishing a skill to ClawHub would send, and what is there already. */
export interface ClawhubPublishPreview {
  skillId: string;
  handle: string;
  slug: string;
  displayName: string;
  summary: string | null;
  /** Topics ClawHub lists it under, from the skill's tags. */
  topics: string[];
  /** The newest version under this slug and handle; null when not published yet. */
  latestVersion: string | null;
  /** The next patch version, or 1.0.0. */
  suggestedVersion: string;
  files: ClawhubPublishFile[];
  totalBytes: number;
  /** Matches in the files that look like keys; publishing stops on these unless allowed. */
  secrets: SecretFinding[];
  /** Why it cannot be published as it is. */
  problems: string[];
}

export interface ClawhubPublishInput {
  skillId: string;
  slug: string;
  displayName: string;
  version: string;
  changelog: string;
  topics?: string[];
  /** The user agreed to release this version under MIT-0. Refused without it. */
  acceptLicense: boolean;
  /** Publish although a file looks like it holds a key or token. */
  allowSecrets?: boolean;
}

export interface ClawhubPublishResult {
  handle: string;
  slug: string;
  version: string;
  /** `published`, or `pending` while ClawHub's security scan runs before it goes public. */
  status: "published" | "pending";
  pageUrl: string;
  /** Ready to run: how someone installs it from ClawHub. */
  installCommand: string;
}

export interface PublishApi {
  /** The target of the last successful publish, to fill the form with. */
  defaults(): Promise<PublishTarget | null>;
  /** Look at the repository and say what publishing would do. Changes nothing anywhere. */
  preview(input: PublishInput): Promise<PublishPlan>;
  /** Copy the skills into the repository, commit and push. Never forces. */
  publish(input: PublishInput): Promise<PublishResult>;
  /** The saved ClawHub token, checked against the registry. */
  clawhubAccount(): Promise<ClawhubAccount>;
  /** Save a token after ClawHub confirms it; null takes the saved one away. INVALID_INPUT when refused. */
  setClawhubToken(token: string | null): Promise<ClawhubAccount>;
  /** What publishing this skill to ClawHub would send, and the version it would follow. */
  clawhubPreview(skillId: string): Promise<ClawhubPublishPreview>;
  /** Upload one version of the skill to ClawHub under the saved token. */
  publishToClawhub(input: ClawhubPublishInput): Promise<ClawhubPublishResult>;
}

/** `npx skills add` command for one skill, or for the whole repository when `skill` is null. */
export function installCommand(repo: string, skill: string | null): string {
  const base = `npx skills add ${repo}`;
  return skill ? `${base} --skill ${skill}` : base;
}

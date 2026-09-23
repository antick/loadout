/** Install and marketplace types. Split from `types.ts` to keep both files small. */

import type { BatchFailure } from "./types";

// ── Install ──

export interface RepoSkillPreview {
  /** Path relative to the scanned root, `/` separated. Stable key. */
  relPath: string;
  name: string;
  description: string | null;
  /** A library skill with this name already exists; installing updates it. */
  alreadyInstalled: boolean;
}

export interface GitPreview {
  /** Handle for confirm / cancel. */
  previewId: string;
  /** A Git repository, or an archive (a link on the web or a file on this computer). */
  kind: "repository" | "archive";
  /** Clone URL of a repository; the link or file path of an archive. */
  repoUrl: string;
  branch: string | null;
  revision: string | null;
  skills: RepoSkillPreview[];
}

export interface InstallSelection {
  relPath: string;
  name: string;
}

export type InstallPhase =
  | "cloning"
  | "downloading"
  | "scanning"
  | "installing"
  | "deploying"
  | "done";

export interface InstallProgress {
  /** Caller-chosen key, also used to cancel. */
  key: string;
  phase: InstallPhase;
  current?: number;
  total?: number;
  name?: string;
}

export interface BatchImportResult {
  imported: number;
  skipped: number;
  errors: BatchFailure[];
}

export interface DiscoveredLocation {
  agentKey: string;
  path: string;
}

/** Skills found in agent folders, grouped when several folders hold the same content. */
export interface DiscoveredSkill {
  name: string;
  description: string | null;
  fingerprint: string;
  locations: DiscoveredLocation[];
  imported: boolean;
}

export interface ScanResult {
  agentsScanned: number;
  skillsFound: number;
  skills: DiscoveredSkill[];
}

export type MarketBoard = "hot" | "trending" | "all_time";

export interface MarketSkill {
  /** `owner/repo/skill`. */
  id: string;
  skillId: string;
  name: string;
  /** `owner/repo`. */
  source: string;
  installs: number;
  installed: boolean;
}

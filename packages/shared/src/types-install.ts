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
  /**
   * A Git repository, an archive (a link on the web or a file on this computer), a lone
   * `SKILL.md` on the web, or a site that publishes skills at a well-known address.
   */
  kind: "repository" | "archive" | "file" | "site";
  /** Clone URL of a repository; the link or file path of an archive or file; a site's address. */
  repoUrl: string;
  branch: string | null;
  revision: string | null;
  skills: RepoSkillPreview[];
  /** Preview keys to tick when the list opens; null ticks every skill. */
  selected: string[] | null;
  /** Skills the typed text asked for by name that the source does not hold. */
  missing: string[];
  /**
   * Host of another site a download link was sent on to. Installing needs the user to accept it
   * (`acceptRedirect`), because the link no longer says where the files come from.
   */
  redirectedTo: string | null;
  /** Agents a pasted `skills add … -a` command named, as agent keys: offered after installing. */
  agents: string[];
  /** Agent names in that command that match no agent here. */
  unknownAgents: string[];
  /** The command asked for every agent (`-a '*'` or `--all`). */
  allAgents: boolean;
}

/** A preview's agent fields when no command named any agents. */
export const NO_REQUESTED_AGENTS: Pick<GitPreview, "agents" | "unknownAgents" | "allAgents"> = {
  agents: [],
  unknownAgents: [],
  allAgents: false,
};

export interface InstallSelection {
  relPath: string;
  name: string;
}

export interface ConfirmOptions {
  /** The user saw {@link GitPreview.redirectedTo} and still wants to install. */
  acceptRedirect?: boolean;
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

export type MarketAuditStatus = "pass" | "warn" | "fail" | "unknown";

/** One security audit the marketplace publishes for a skill. */
export interface MarketAudit {
  provider: string;
  status: MarketAuditStatus;
  /** The auditor's one-line finding, e.g. "No alerts". */
  summary: string | null;
  /** As the auditor spells it, e.g. `SAFE`, `MEDIUM`. */
  riskLevel: string | null;
  /** ISO date of the audit. */
  auditedAt: string | null;
  /** The audit's page on the marketplace. */
  url: string;
}

/** What to read before installing a marketplace skill. */
export interface MarketSkillDetail {
  /** `owner/repo/skill`. */
  id: string;
  source: string;
  skillId: string;
  /** The skill's page on the marketplace. */
  pageUrl: string;
  /** The GitHub repository it installs from. */
  repoUrl: string;
  /** Null when the audits could not be fetched; empty when none are published. */
  audits: MarketAudit[] | null;
  /** The skill's `SKILL.md`; null when it could not be found or fetched. */
  document: string | null;
  /** Where that file sits in the repository. */
  documentPath: string | null;
}

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

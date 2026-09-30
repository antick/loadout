/** Install and marketplace types. Split from `types.ts` to keep both files small. */

import type { LibraryNameEntry } from "./install-plan";
import type { InstallOptions, SafetyReport } from "./safety";
import type { SkillTrait } from "./skill-traits";
import type { BatchFailure } from "./types";

// ── Install ──

export interface RepoSkillPreview {
  /** Path relative to the scanned root, `/` separated. Stable key. */
  relPath: string;
  name: string;
  description: string | null;
  /** The frontmatter sets `disable-model-invocation: true`: agents run it only on request. */
  manualOnly: boolean;
  /** What installing it would put in reach of an agent: scripts, hooks, MCP servers, tools. */
  traits: SkillTrait[];
  /** A library skill with this name already exists; installing updates it. */
  alreadyInstalled: boolean;
}

/** A skill read without installing it: its `SKILL.md` as written, and the safety check's report. */
export interface PreviewedSkill {
  name: string;
  document: string;
  /** Null when the safety check is off or no engine is available. */
  safety: SafetyReport | null;
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
  /** Folders in the library when the preview opened, to say what each name will do. */
  library: LibraryNameEntry[];
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
  /**
   * When a library skill already holds the name, put this one in its place instead of adding it
   * as `<name>-2`. The replaced version goes to Recently removed. Ignored for a free name.
   */
  replace?: boolean;
}

export interface ConfirmOptions extends InstallOptions {
  /** The user saw {@link GitPreview.redirectedTo} and still wants to install. */
  acceptRedirect?: boolean;
}

export type InstallPhase =
  | "cloning"
  | "downloading"
  | "scanning"
  /** The safety scanner is reading the skills. */
  | "checking"
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

/** Where marketplace listings come from. */
export const MARKET_PROVIDERS = ["skills_sh", "clawhub"] as const;
export type MarketProvider = (typeof MARKET_PROVIDERS)[number];
export const DEFAULT_MARKET_PROVIDER: MarketProvider = "skills_sh";

/** skills.sh ranks by installs over a period; ClawHub sorts its catalogue. */
export type MarketBoard = "hot" | "trending" | "all_time" | "downloads" | "newest";
export const MARKET_BOARDS_OF: Record<MarketProvider, readonly MarketBoard[]> = {
  skills_sh: ["hot", "trending", "all_time"],
  clawhub: ["trending", "downloads", "newest"],
};

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
  provider: MarketProvider;
  /** `owner/repo/skill`, or `clawhub:owner/slug`. */
  id: string;
  source: string;
  skillId: string;
  /** The skill's page on the marketplace. */
  pageUrl: string;
  /** The GitHub repository it installs from; null for a registry that serves the files itself. */
  repoUrl: string | null;
  /** The version that would be installed; null where versions do not exist (skills.sh). */
  version: string | null;
  /** What that version's publisher said changed. */
  changelog: string | null;
  /** Null when the audits could not be fetched; empty when none are published. */
  audits: MarketAudit[] | null;
  /** The skill's `SKILL.md`; null when it could not be found or fetched. */
  document: string | null;
  /** Where that file sits in the repository. */
  documentPath: string | null;
}

/** A marketplace board or search result. */
export interface MarketListing {
  skills: MarketSkill[];
  /**
   * Set when the marketplace could not be reached and an earlier copy is shown instead: when that
   * copy was fetched (epoch ms). Null for a live answer.
   */
  cachedAt: number | null;
}

export interface MarketSkill {
  provider: MarketProvider;
  /** `owner/repo/skill`, or `clawhub:owner/slug`. */
  id: string;
  /** The skill's folder name (skills.sh) or slug (ClawHub). */
  skillId: string;
  name: string;
  /** `owner/repo` (skills.sh) or the publisher's handle (ClawHub). */
  source: string;
  installs: number;
  installed: boolean;
  /** A one-line summary, where the marketplace gives one. */
  summary: string | null;
  /** The latest version, where versions exist. */
  version: string | null;
}

/** `MarketSkill.id` of a ClawHub skill, matching a library skill's `sourceRef` after the prefix. */
export const CLAWHUB_ID_PREFIX = "clawhub:";
export function clawhubMarketId(owner: string, slug: string): string {
  return `${CLAWHUB_ID_PREFIX}${owner}/${slug}`;
}

import type { DeployMode, Deployment, Skill, SourceType, UpdateStatus } from "@loadout/shared";

/** Rows of the skills and deployments tables, and how skill fields map onto them. */

export interface SkillRow {
  id: string;
  name: string;
  description: string | null;
  source_type: string;
  source_ref: string | null;
  source_url: string | null;
  source_subpath: string | null;
  source_branch: string | null;
  source_trusted_host: string | null;
  source_revision: string | null;
  remote_revision: string | null;
  library_path: string;
  content_hash: string | null;
  update_status: string;
  last_checked_at: number | null;
  last_check_error: string | null;
  created_at: number;
  updated_at: number;
  edited_files: string | null;
  authored: number;
  suggest_for: string | null;
  blocked_agents: string | null;
  note: string | null;
  favorited_at: number | null;
}

export interface DeploymentRow {
  id: string;
  skill_id: string;
  agent_key: string;
  target_path: string;
  mode: string;
  source_hash: string | null;
  synced_at: number | null;
}

/** A deployment row including the library hash it was last synced from. */
export interface DeploymentRecord extends Deployment {
  sourceHash: string | null;
}

/** A skill's content right after it came from its source. */
export interface InstalledSnapshot {
  hash: string;
  /** `/` separated path → SHA-256 of the file. */
  files: Record<string, string>;
}

export interface NewSkill {
  id?: string;
  name: string;
  description: string | null;
  sourceType: SourceType;
  sourceRef?: string | null;
  sourceUrl?: string | null;
  sourceSubpath?: string | null;
  sourceBranch?: string | null;
  sourceTrustedHost?: string | null;
  sourceRevision?: string | null;
  remoteRevision?: string | null;
  libraryPath: string;
  contentHash: string | null;
  updateStatus: UpdateStatus;
  createdAt?: number;
  updatedAt?: number;
  editedFiles?: string[];
  authored?: boolean;
  suggestFor?: string[];
  blockedAgents?: string[];
  note?: string | null;
  favoritedAt?: number | null;
}

export type SkillPatch = Partial<
  Pick<
    Skill,
    | "name"
    | "description"
    | "sourceType"
    | "sourceRef"
    | "sourceUrl"
    | "sourceSubpath"
    | "sourceBranch"
    | "sourceTrustedHost"
    | "sourceRevision"
    | "remoteRevision"
    | "libraryPath"
    | "contentHash"
    | "updateStatus"
    | "lastCheckedAt"
    | "lastCheckError"
    | "updatedAt"
    | "editedFiles"
    | "authored"
    | "suggestFor"
    | "blockedAgents"
    | "note"
    | "favoritedAt"
  >
>;

export const PATCH_COLUMNS: Record<keyof SkillPatch, string> = {
  name: "name",
  description: "description",
  sourceType: "source_type",
  sourceRef: "source_ref",
  sourceUrl: "source_url",
  sourceSubpath: "source_subpath",
  sourceBranch: "source_branch",
  sourceTrustedHost: "source_trusted_host",
  sourceRevision: "source_revision",
  remoteRevision: "remote_revision",
  libraryPath: "library_path",
  contentHash: "content_hash",
  updateStatus: "update_status",
  lastCheckedAt: "last_checked_at",
  lastCheckError: "last_check_error",
  updatedAt: "updated_at",
  editedFiles: "edited_files",
  authored: "authored",
  suggestFor: "suggest_for",
  blockedAgents: "blocked_agents",
  note: "note",
  favoritedAt: "favorited_at",
};
/** Patches whose value is a list of strings, stored as JSON. */
export const LIST_COLUMNS: ReadonlySet<keyof SkillPatch> = new Set([
  "editedFiles",
  "suggestFor",
  "blockedAgents",
]);

/** Stored as a JSON array; an empty list is stored as NULL. */
export function encodeList(values: readonly string[] | null | undefined): string | null {
  const clean = [...new Set(values ?? [])].sort();
  return clean.length > 0 ? JSON.stringify(clean) : null;
}

export function decodeList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

export function toDeployment(row: DeploymentRow): DeploymentRecord {
  return {
    id: row.id,
    skillId: row.skill_id,
    agentKey: row.agent_key,
    targetPath: row.target_path,
    mode: row.mode as DeployMode,
    syncedAt: row.synced_at,
    sourceHash: row.source_hash,
  };
}

export type TagRow = { skill_id: string; tag: string };
export type PresetRow = { skill_id: string; preset_id: string };
/** Up to this many skills, related rows are read by id; above it, whole tables at once. */
export const HYDRATE_BY_ID_MAX = 200;

export function append<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

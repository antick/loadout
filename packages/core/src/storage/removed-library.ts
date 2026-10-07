import { join } from "node:path";
import type { Skill, SourceType, UpdateStatus } from "@loadout/shared";
import type { CoreContext } from "../context";
import { PresetStore } from "../presets/store";
import { readBlockedAgents, readSuggestFor } from "../skills/portable-format";
import type { SkillStore } from "../skills/store";
import { hashDir } from "../util/hash";
import { asStrings } from "../util/json";
import { isPlainName } from "../util/safe-path";

/** Where a removed library skill lived, for people. */
export const LIBRARY_PLACE = "Library";

/**
 * Everything a library skill had besides its files, kept with it in Recently removed so a
 * restore brings back the same skill: its id, where it came from, its tags and presets, the
 * agents it is blocked for.
 */
export interface LibraryRecord {
  id: string;
  name: string;
  /** Its folder in the library, found again under the library as it is now (it may have moved). */
  dirName: string;
  description: string | null;
  sourceType: SourceType;
  sourceRef: string | null;
  sourceUrl: string | null;
  sourceSubpath: string | null;
  sourceBranch: string | null;
  /** Absent in records written before it was kept. */
  sourceTrustedHost?: string | null;
  sourceRevision: string | null;
  remoteRevision: string | null;
  updateStatus: UpdateStatus;
  createdAt: number;
  editedFiles: string[];
  /** Absent in records written before it was kept. */
  authored?: boolean;
  /** Absent in records written before it was kept. */
  note?: string | null;
  /** Absent in records written before it was kept. */
  favoritedAt?: number | null;
  /** Absent in records written before it was kept. */
  suggestFor?: string[];
  /** Absent in records written before it was kept. */
  blockedAgents?: string[];
  tags: string[];
  presetIds: string[];
}

export function libraryRecordOf(skill: Skill): LibraryRecord {
  return {
    id: skill.id,
    name: skill.name,
    dirName: skill.dirName,
    description: skill.description,
    sourceType: skill.sourceType,
    sourceRef: skill.sourceRef,
    sourceUrl: skill.sourceUrl,
    sourceSubpath: skill.sourceSubpath,
    sourceBranch: skill.sourceBranch,
    sourceTrustedHost: skill.sourceTrustedHost,
    sourceRevision: skill.sourceRevision,
    remoteRevision: skill.remoteRevision,
    updateStatus: skill.updateStatus,
    createdAt: skill.createdAt,
    editedFiles: [...skill.editedFiles],
    authored: skill.authored,
    note: skill.note,
    favoritedAt: skill.favoritedAt,
    suggestFor: [...skill.suggestFor],
    blockedAgents: [...skill.blockedAgents],
    tags: [...skill.tags],
    presetIds: [...skill.presetIds],
  };
}

/** Where a removed library skill goes back to. */
export function libraryPathOf(ctx: CoreContext, record: LibraryRecord): string {
  return join(ctx.paths.skillsDir, record.dirName);
}

/** A record read back from disk: only its shape is trusted, never more. */
export function isLibraryRecord(value: unknown): value is LibraryRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.dirName === "string" &&
    isPlainName(record.dirName) &&
    typeof record.sourceType === "string" &&
    Array.isArray(record.tags) &&
    Array.isArray(record.presetIds)
  );
}

/**
 * The row of a library skill whose folder is back at `libraryPath`: same id when it is free,
 * the tags it had, and back in the presets that still exist. Deployments are not restored.
 */
export function restoreLibraryRow(
  ctx: CoreContext,
  store: SkillStore,
  record: LibraryRecord,
  libraryPath: string,
): Skill {
  const skill = store.insert({
    id: store.find(record.id) ? undefined : record.id,
    name: record.name,
    description: record.description,
    sourceType: record.sourceType,
    sourceRef: record.sourceRef,
    sourceUrl: record.sourceUrl,
    sourceSubpath: record.sourceSubpath,
    sourceBranch: record.sourceBranch,
    sourceTrustedHost:
      typeof record.sourceTrustedHost === "string" ? record.sourceTrustedHost : null,
    sourceRevision: record.sourceRevision,
    remoteRevision: record.remoteRevision,
    libraryPath,
    contentHash: hashDir(libraryPath),
    updateStatus: record.updateStatus,
    createdAt: record.createdAt,
    editedFiles: asStrings(record.editedFiles),
    authored: record.authored === true,
    note: typeof record.note === "string" ? record.note : null,
    favoritedAt: typeof record.favoritedAt === "number" ? record.favoritedAt : null,
    suggestFor: readSuggestFor(record.suggestFor),
    blockedAgents: readBlockedAgents(record.blockedAgents),
  });
  store.setTags(skill.id, asStrings(record.tags));
  const presets = new PresetStore(ctx.db);
  for (const presetId of asStrings(record.presetIds)) {
    if (presets.find(presetId)) presets.addSkills(presetId, [skill.id]);
  }
  return store.get(skill.id);
}

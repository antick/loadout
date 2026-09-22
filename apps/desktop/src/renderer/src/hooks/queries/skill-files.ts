import type { SkillFile, SkillFileEntry, SkillFileVersion } from "@loadout/shared";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** Every content file of a library skill, main document first. */
export function useSkillFiles(skillId: string): UseQueryResult<SkillFileEntry[]> {
  return useQuery({
    queryKey: keys.skills.files(skillId),
    queryFn: () => api.skills.files(skillId),
  });
}

/**
 * One file opened for editing. Always refetched when the skills change, so an edit made on disk
 * shows up; the editor decides whether that replaces the text on screen.
 */
export function useSkillFile(skillId: string, path: string | null): UseQueryResult<SkillFile> {
  return useQuery({
    queryKey: keys.skills.file(skillId, path ?? ""),
    queryFn: () => api.skills.readFile(skillId, path ?? ""),
    enabled: Boolean(path),
    staleTime: 0,
  });
}

/** Earlier versions of a file, newest first. Loaded only while the list is open. */
export function useSkillFileVersions(
  skillId: string,
  path: string | null,
  enabled: boolean,
): UseQueryResult<SkillFileVersion[]> {
  return useQuery({
    queryKey: keys.skills.fileVersions(skillId, path ?? ""),
    queryFn: () => api.skills.fileVersions(skillId, path ?? ""),
    enabled: enabled && Boolean(path),
    staleTime: 0,
  });
}

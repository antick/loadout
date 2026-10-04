import type { EditTarget, SkillFileEntry, SkillFileVersion, SkillLocation } from "@loadout/shared";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { locationKey } from "@/lib/skill-location";

/** What is being edited: name, place, and where saves really go. */
export function useEditTarget(location: SkillLocation): UseQueryResult<EditTarget> {
  return useQuery({
    queryKey: keys.editor.target(locationKey(location)),
    queryFn: () => api.editor.target(location),
  });
}

/** Every content file of the skill, main document first. */
export function useEditorFiles(location: SkillLocation): UseQueryResult<SkillFileEntry[]> {
  return useQuery({
    queryKey: keys.editor.files(locationKey(location)),
    queryFn: () => api.editor.files(location),
  });
}

/** Every folder of the skill, empty ones included, by path. */
export function useEditorFolders(location: SkillLocation): UseQueryResult<string[]> {
  return useQuery({
    queryKey: keys.editor.folders(locationKey(location)),
    queryFn: () => api.editor.folders(location),
  });
}

/** Earlier versions of a file, newest first. Loaded only while the list is open. */
export function useEditorFileVersions(
  location: SkillLocation,
  path: string | null,
  enabled: boolean,
): UseQueryResult<SkillFileVersion[]> {
  return useQuery({
    queryKey: keys.editor.versions(locationKey(location), path ?? ""),
    queryFn: () => api.editor.fileVersions(location, path ?? ""),
    enabled: enabled && Boolean(path),
    staleTime: 0,
  });
}

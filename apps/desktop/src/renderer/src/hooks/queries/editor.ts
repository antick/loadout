import type {
  EditTarget,
  SkillFile,
  SkillFileEntry,
  SkillFileVersion,
  SkillLocation,
} from "@loadout/shared";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
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

/**
 * One file opened for editing. Always refetched when skills, agents or projects change, so an
 * edit made on disk shows up; the editor decides whether that replaces the text on screen.
 */
export function useEditorFile(
  location: SkillLocation,
  path: string | null,
): UseQueryResult<SkillFile> {
  return useQuery({
    queryKey: keys.editor.file(locationKey(location), path ?? ""),
    queryFn: () => api.editor.readFile(location, path ?? ""),
    enabled: Boolean(path),
    staleTime: 0,
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

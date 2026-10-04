import type { SkillFile, SkillLocation } from "@loadout/shared";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { locationKey } from "@/lib/skill-location";

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

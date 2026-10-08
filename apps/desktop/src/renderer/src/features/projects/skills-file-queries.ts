import type {
  SkillsFileApplyOptions,
  SkillsFileInfo,
  SkillsFileInit,
  SkillsFilePlan,
} from "@loadout/shared";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { REFETCH_ON_FOCUS } from "@/lib/query-client";
import { keys } from "@/lib/query-keys";

/** What the plan dialog shows: applying (and pruning), moving to newest commits, or removing all. */
export type SkillsFileMode = "apply" | "update" | "unapply";

/**
 * The project's `skills.toml` and lock; null when it has none. Read fresh each time it shows, and
 * on coming back to the window: it is edited by hand, and no folder watcher sees it change.
 */
export function useSkillsFile(dir: string | null): UseQueryResult<SkillsFileInfo | null> {
  return useQuery({
    queryKey: keys.skillsFile.find(dir ?? ""),
    queryFn: () => api.skillsFile.find(dir ?? ""),
    enabled: dir !== null,
    staleTime: 0,
    ...REFETCH_ON_FOCUS,
  });
}

/** What a new `skills.toml` for the project would list. Asked only while the create dialog is open. */
export function useSkillsFileSuggestion(
  dir: string,
  enabled: boolean,
): UseQueryResult<SkillsFileInit> {
  return useQuery({
    queryKey: keys.skillsFile.suggest(dir),
    queryFn: () => api.skillsFile.suggest(dir),
    enabled,
    staleTime: 0,
  });
}

/**
 * What applying would do. Fetches the sources (the clone cache makes a second look quick), so it
 * runs only while the dialog is open and never retries on its own.
 */
export function useSkillsFilePlan(
  dir: string,
  mode: SkillsFileMode,
  options: Pick<SkillsFileApplyOptions, "prune">,
  enabled: boolean,
): UseQueryResult<SkillsFilePlan> {
  const queryKey = keys.skillsFile.plan(dir, mode, JSON.stringify(options));
  return useQuery({
    queryKey,
    // A ticked option asks again: the plan it changes stays on screen meanwhile, but only the
    // same project and mode's plan, never another dialog's.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === dir && previousQuery.queryKey[3] === mode
        ? previous
        : undefined,
    queryFn: async () =>
      mode === "unapply"
        ? (await api.skillsFile.unapply(dir, { dryRun: true })).plan
        : api.skillsFile.plan(dir, { ...options, update: mode === "update" }),
    enabled,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

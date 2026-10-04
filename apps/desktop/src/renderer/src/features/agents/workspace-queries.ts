import type {
  BrokenSkillFolder,
  LocalSkill,
  PluginSkill,
  SkillDocument,
  SkillListingReport,
} from "@loadout/shared";
import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useSetting } from "@/hooks/queries/settings";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/**
 * What the agent's skill listing costs; null when the agent has no estimate. Follows the saved
 * context window, and is read again whenever skills or agents change.
 */
export function useSkillListing(
  agentKey: string | null | undefined,
): UseQueryResult<SkillListingReport | null> {
  const window = useSetting("skillListingWindow");
  return useQuery({
    queryKey: keys.workspace.listing(agentKey ?? "", window),
    queryFn: () => api.listing.report(agentKey ?? "", { window }),
    enabled: Boolean(agentKey),
    // Changing the window must not blank the card while the new estimate is read.
    placeholderData: keepPreviousData,
  });
}

/** Everything inside one agent's global skills folder, managed or not, in the backend's order. */
export function useWorkspaceSkills(
  agentKey: string | null | undefined,
): UseQueryResult<LocalSkill[]> {
  return useQuery({
    queryKey: keys.workspace.list(agentKey ?? ""),
    queryFn: () => api.workspace.list(agentKey ?? ""),
    enabled: Boolean(agentKey),
  });
}

/** Folders in one agent's global skills folder that the agent ignores. */
export function useBrokenFolders(
  agentKey: string | null | undefined,
): UseQueryResult<BrokenSkillFolder[]> {
  return useQuery({
    queryKey: keys.workspace.broken(agentKey ?? ""),
    queryFn: () => api.workspace.broken(agentKey ?? ""),
    enabled: Boolean(agentKey),
  });
}

/** Skills the agent's plugins bring; empty for agents without plugins. */
export function usePluginSkills(
  agentKey: string | null | undefined,
): UseQueryResult<PluginSkill[]> {
  return useQuery({
    queryKey: keys.workspace.plugins(agentKey ?? ""),
    queryFn: () => api.workspace.plugins(agentKey ?? ""),
    enabled: Boolean(agentKey),
  });
}

/** The main document of one skill folder in an agent's global folder. */
export function useWorkspaceDocument(
  agentKey: string | null | undefined,
  relativePath: string | null | undefined,
): UseQueryResult<SkillDocument> {
  return useQuery({
    queryKey: keys.workspace.document(agentKey ?? "", relativePath ?? ""),
    queryFn: () => api.workspace.document(agentKey ?? "", relativePath ?? ""),
    enabled: Boolean(agentKey) && Boolean(relativePath),
  });
}

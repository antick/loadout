import type { SkillListingReport } from "@loadout/shared";
import { type UseQueryResult, keepPreviousData, useQuery } from "@tanstack/react-query";
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

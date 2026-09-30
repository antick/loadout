import type { ClawhubAccount, ClawhubPublishPreview, PublishTarget } from "@loadout/shared";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** Where skills were last published, to fill the publish form with. Null before the first time. */
export function usePublishDefaults(): UseQueryResult<PublishTarget | null> {
  return useQuery({ queryKey: keys.publish.defaults, queryFn: () => api.publish.defaults() });
}

/** The saved ClawHub token, checked against the registry. */
export function useClawhubAccount(): UseQueryResult<ClawhubAccount> {
  return useQuery({
    queryKey: keys.publish.clawhubAccount,
    queryFn: () => api.publish.clawhubAccount(),
  });
}

/** What publishing a skill to ClawHub would send; asked once a token is there. */
export function useClawhubPreview(
  skillId: string,
  enabled: boolean,
): UseQueryResult<ClawhubPublishPreview> {
  return useQuery({
    queryKey: keys.publish.clawhubPreview(skillId),
    queryFn: () => api.publish.clawhubPreview(skillId),
    enabled,
    retry: false,
    staleTime: 0,
  });
}

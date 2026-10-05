import type { ClawhubAccount, ClawhubPublishPreview, PublishTarget } from "@loadout/shared";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** Where skills were last published, to fill the publish form with. Null before the first time. */
export function usePublishDefaults(): UseQueryResult<PublishTarget | null> {
  return useQuery({ queryKey: keys.publish.defaults, queryFn: () => api.publish.defaults() });
}

/**
 * The preview needs a working token: wait for the account answer, then ask only when it signed
 * in. Asking before the answer showed a spurious error to everyone without a token.
 */
export function canPreviewClawhub(account: ClawhubAccount | undefined): boolean {
  return account !== undefined && account.handle !== null;
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

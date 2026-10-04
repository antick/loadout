import type { ClawhubAccount } from "@loadout/shared";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** The saved ClawHub token, checked against the registry. */
export function useClawhubAccount(): UseQueryResult<ClawhubAccount> {
  return useQuery({
    queryKey: keys.publish.clawhubAccount,
    queryFn: () => api.publish.clawhubAccount(),
  });
}
